package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hyperledger/fabric-gateway/pkg/client"
	"github.com/hyperledger/fabric-gateway/pkg/identity"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

type gatewayState struct {
	network  *client.Network
	contract *client.Contract
	token    string
}
type registerRequest struct {
	DocumentRef        string `json:"documentRef"`
	Version            int    `json:"version"`
	IssuerRef          string `json:"issuerRef"`
	DocumentType       string `json:"documentType"`
	SHA256             string `json:"sha256"`
	StorageRef         string `json:"storageRef"`
	SignatureRef       string `json:"signatureRef"`
	PreviousVersionRef string `json:"previousVersionRef"`
}
type verifyRequest struct {
	OrganisationMSP string `json:"organisationMsp"`
	DocumentRef     string `json:"documentRef"`
	Version         int    `json:"version"`
	SHA256          string `json:"sha256"`
}

type evidenceAnchorRequest struct {
	EventRef       string `json:"eventRef"`
	DocumentRef    string `json:"documentRef"`
	Version        int    `json:"version"`
	Outcome        string `json:"outcome"`
	EvidenceDigest string `json:"evidenceDigest"`
}

func required(name string) string {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		log.Fatalf("%s is required", name)
	}
	return v
}
func loadIdentity(certPath, keyPath string) (*identity.X509Identity, identity.Sign, error) {
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return nil, nil, err
	}
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, nil, errors.New("invalid client certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, nil, err
	}
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, nil, err
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, nil, errors.New("invalid private key PEM")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	if err != nil {
		if k, e := x509.ParsePKCS1PrivateKey(keyBlock.Bytes); e == nil {
			parsed = k
		} else if k, e := x509.ParseECPrivateKey(keyBlock.Bytes); e == nil {
			parsed = k
		} else {
			return nil, nil, err
		}
	}
	switch k := parsed.(type) {
	case *ecdsa.PrivateKey:
		if k.Curve != elliptic.P256() && k.Curve != elliptic.P384() {
			return nil, nil, errors.New("unsupported ECDSA curve")
		}
	case *rsa.PrivateKey:
		if k.N.BitLen() < 2048 {
			return nil, nil, errors.New("RSA key must be at least 2048 bits")
		}
	default:
		return nil, nil, fmt.Errorf("unsupported gateway signing key type %T", parsed)
	}
	signer, err := identity.NewPrivateKeySign(parsed)
	if err != nil {
		return nil, nil, err
	}
	fabricIdentity, err := identity.NewX509Identity(required("FABRIC_MSP_ID"), cert)
	if err != nil {
		return nil, nil, err
	}

	return fabricIdentity, signer, nil
}
func main() {
	endpoint := required("FABRIC_GATEWAY_ENDPOINT")
	tlsPath := required("FABRIC_TLS_ROOT_CERT")
	certPath := required("FABRIC_CLIENT_CERT")
	keyPath := required("FABRIC_CLIENT_KEY")
	channel := required("FABRIC_CHANNEL_NAME")
	chaincode := required("FABRIC_CHAINCODE_NAME")
	token := required("FABRIC_GATEWAY_API_TOKEN")
	rootPEM, err := os.ReadFile(tlsPath)
	if err != nil {
		log.Fatal(err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(rootPEM) {
		log.Fatal("no valid TLS root certificate")
	}
	tlsConfig := &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	conn, err := grpc.NewClient(endpoint, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
	if err != nil {
		log.Fatal(err)
	}
	id, sign, err := loadIdentity(certPath, keyPath)
	if err != nil {
		log.Fatal(err)
	}
	gw, err := client.Connect(id, client.WithSign(sign), client.WithClientConnection(conn))
	if err != nil {
		log.Fatal(err)
	}
	defer gw.Close()
	network := gw.GetNetwork(channel)
	state := &gatewayState{network: network, contract: network.GetContract(chaincode), token: token}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok", "provider": "hyperledger-fabric-gateway"})
	})
	mux.HandleFunc("POST /v1/documents/register", state.auth(func(w http.ResponseWriter, r *http.Request) {
		var p registerRequest
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, 400, err)
			return
		}
		if p.Version < 1 {
			writeError(w, 400, errors.New("version must be positive"))
			return
		}
		txID, result, err := submitAndCommit(
			state.contract,
			"RegisterDocument",
			p.DocumentRef,
			fmt.Sprint(p.Version),
			p.IssuerRef,
			p.DocumentType,
			p.SHA256,
			p.StorageRef,
			p.SignatureRef,
			p.PreviousVersionRef,
		)
		if err != nil {
			writeError(w, 502, err)
			return
		}
		writeJSON(w, 200, map[string]any{"submitted": true, "transactionId": txID, "transactionResult": string(result)})
	}))
	mux.HandleFunc("POST /v1/documents/verify", state.auth(func(w http.ResponseWriter, r *http.Request) {
		var p verifyRequest
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, 400, err)
			return
		}
		result, err := state.contract.EvaluateTransaction("VerifyDocument", p.OrganisationMSP, p.DocumentRef, fmt.Sprint(p.Version), p.SHA256)
		if err != nil {
			writeError(w, 502, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ledgerDigestMatches": string(result) == "true", "rawResult": string(result)})
	}))
	mux.HandleFunc("POST /v1/evidence/anchor", state.auth(func(w http.ResponseWriter, r *http.Request) {
		var p evidenceAnchorRequest
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, 400, err)
			return
		}
		if p.EventRef == "" || p.DocumentRef == "" || p.Version < 1 || p.Outcome == "" || len(p.EvidenceDigest) != 64 {
			writeError(w, 400, errors.New("invalid evidence anchor request"))
			return
		}
		txID, result, err := submitAndCommit(
			state.contract,
			"RecordVerificationEvent",
			p.EventRef,
			p.DocumentRef,
			fmt.Sprint(p.Version),
			p.Outcome,
			p.EvidenceDigest,
		)
		if err != nil {
			writeError(w, 502, err)
			return
		}
		writeJSON(w, 200, map[string]any{"submitted": true, "eventRef": p.EventRef,
			"transactionId": txID, "transactionResult": string(result)})
	}))
	mux.HandleFunc("GET /v1/evidence/anchors/{eventRef}", state.auth(func(w http.ResponseWriter, r *http.Request) {
		eventRef := r.PathValue("eventRef")
		msp := r.URL.Query().Get("organisationMsp")
		if eventRef == "" || msp == "" {
			writeError(w, 400, errors.New("eventRef and organisationMsp are required"))
			return
		}
		result, err := state.contract.EvaluateTransaction("GetVerificationEvent", msp, eventRef)
		if err != nil {
			writeError(w, 404, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write(result)
	}))
	mux.HandleFunc("GET /v1/documents", state.auth(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		msp, doc, version := q.Get("organisationMsp"), q.Get("documentRef"), q.Get("version")
		if msp == "" || doc == "" || version == "" {
			writeError(w, 400, errors.New("organisationMsp, documentRef and version are required"))
			return
		}
		result, err := state.contract.EvaluateTransaction("GetDocument", msp, doc, version)
		if err != nil {
			writeError(w, 404, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write(result)
	}))
	mux.HandleFunc("GET /v1/documents/history", state.auth(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		result, err := state.contract.EvaluateTransaction("GetDocumentHistory", q.Get("organisationMsp"), q.Get("documentRef"))
		if err != nil {
			writeError(w, 502, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write(result)
	}))
	server := &http.Server{Addr: required("FABRIC_GATEWAY_LISTEN"), Handler: securityHeaders(mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Fabric Gateway bridge listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

// submitAndCommit executes a Fabric transaction and only reports success after
// the peer confirms that the transaction committed successfully.
func submitAndCommit(contract *client.Contract, transactionName string, args ...string) (string, []byte, error) {
	proposal, err := contract.NewProposal(transactionName, client.WithArguments(args...))
	if err != nil {
		return "", nil, err
	}

	txID := proposal.TransactionID()
	transaction, err := proposal.Endorse()
	if err != nil {
		return txID, nil, err
	}

	result := transaction.Result()
	commit, err := transaction.Submit()
	if err != nil {
		return txID, nil, err
	}

	status, err := commit.Status()
	if err != nil {
		return txID, nil, err
	}
	if !status.Successful {
		return txID, nil, fmt.Errorf("transaction %s failed validation: %v", status.TransactionID, status.Code)
	}

	return txID, result, nil
}

func (s *gatewayState) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+s.token {
			writeError(w, 401, errors.New("unauthorised"))
			return
		}
		next(w, r)
	}
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}
