// gdi-evidence-verify independently checks a GDI-VS Ed25519 attestation and optional Fabric event digest.
package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

type ledgerEvent struct {
	EventRef       string `json:"eventRef"`
	EvidenceDigest string `json:"evidenceDigest"`
	TransactionID  string `json:"transactionId"`
}
type bundle struct {
	SnapshotID              string       `json:"snapshot_id"`
	AttestationID           string       `json:"attestation_id,omitempty"`
	OrganisationID          string       `json:"organisation_id"`
	VerificationResultID    string       `json:"verification_result_id"`
	DocumentVersionID       string       `json:"document_version_id"`
	CanonicalizationVersion string       `json:"canonicalization_version"`
	EvidenceSHA256          string       `json:"evidence_sha256"`
	KeyID                   string       `json:"key_id"`
	SignedPayloadSHA256     string       `json:"signed_payload_sha256"`
	SignatureBase64         string       `json:"signature_base64"`
	PublicKeyPEM            string       `json:"public_key_pem"`
	LedgerEvent             *ledgerEvent `json:"ledger_event,omitempty"`
}
type report struct {
	AttestationStatus string   `json:"attestation_status"`
	KeyID             string   `json:"key_id"`
	PublicKeySHA256   string   `json:"public_key_sha256"`
	KeyPinStatus      string   `json:"key_pin_status"`
	LedgerStatus      string   `json:"ledger_status"`
	TransactionID     string   `json:"transaction_id,omitempty"`
	Warnings          []string `json:"warnings"`
}

func payload(b bundle) []byte {
	return []byte(strings.Join([]string{"GDI-VS-EVIDENCE-ATTESTATION-v1", b.SnapshotID, b.OrganisationID, b.VerificationResultID, b.DocumentVersionID, b.CanonicalizationVersion, b.EvidenceSHA256, b.KeyID}, "\n"))
}
func digest(v []byte) string { h := sha256.Sum256(v); return hex.EncodeToString(h[:]) }
func verify(b bundle, pin string) (report, error) {
	r := report{KeyID: b.KeyID, KeyPinStatus: "NOT_CHECKED", LedgerStatus: "NOT_PROVIDED", Warnings: []string{"A valid signature proves possession of the signing key, not legal authority.", "A Gateway-returned event is not a peer endorsement, block-header or Merkle inclusion proof."}}
	for _, v := range []string{b.SnapshotID, b.OrganisationID, b.VerificationResultID, b.DocumentVersionID, b.CanonicalizationVersion, b.EvidenceSHA256, b.KeyID} {
		if strings.TrimSpace(v) == "" {
			return r, errors.New("required attestation field is missing")
		}
	}
	if len(b.EvidenceSHA256) != 64 {
		return r, errors.New("evidence_sha256 must be a 32-byte hex digest")
	}
	if _, e := hex.DecodeString(b.EvidenceSHA256); e != nil {
		return r, errors.New("evidence_sha256 is not valid hex")
	}
	p := payload(b)
	pd := digest(p)
	if !strings.EqualFold(pd, b.SignedPayloadSHA256) {
		r.AttestationStatus = "INVALID"
		return r, errors.New("signed payload digest mismatch")
	}
	block, _ := pem.Decode([]byte(b.PublicKeyPEM))
	if block == nil {
		return r, errors.New("invalid public key PEM")
	}
	parsed, e := x509.ParsePKIXPublicKey(block.Bytes)
	if e != nil {
		return r, e
	}
	pub, ok := parsed.(ed25519.PublicKey)
	if !ok {
		return r, errors.New("public key is not Ed25519")
	}
	kh := digest(pub)
	r.PublicKeySHA256 = kh
	if pin != "" {
		pin = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(pin)), "sha256:")
		if pin != kh {
			r.KeyPinStatus = "MISMATCH"
			r.AttestationStatus = "INVALID"
			return r, errors.New("public key fingerprint does not match trusted pin")
		}
		r.KeyPinStatus = "MATCH"
	}
	sig, e := base64.StdEncoding.DecodeString(b.SignatureBase64)
	if e != nil {
		return r, errors.New("invalid signature base64")
	}
	if !ed25519.Verify(pub, p, sig) {
		r.AttestationStatus = "INVALID"
		return r, errors.New("Ed25519 signature verification failed")
	}
	r.AttestationStatus = "VERIFIED"
	if b.LedgerEvent != nil {
		if b.LedgerEvent.EventRef == "" || b.LedgerEvent.EvidenceDigest == "" {
			r.LedgerStatus = "INCOMPLETE"
			return r, nil
		}
		if b.AttestationID != "" && b.LedgerEvent.EventRef != "gdivs-evidence-"+b.AttestationID {
			r.LedgerStatus = "EVENT_REFERENCE_MISMATCH"
			return r, nil
		}
		if !strings.EqualFold(b.LedgerEvent.EvidenceDigest, pd) {
			r.LedgerStatus = "DIGEST_MISMATCH"
			return r, nil
		}
		r.LedgerStatus = "DIGEST_MATCHED"
		r.TransactionID = b.LedgerEvent.TransactionID
	}
	return r, nil
}
func main() {
	input := flag.String("input", "-", "JSON bundle path or stdin")
	pin := flag.String("trusted-key-sha256", "", "trusted Ed25519 public-key SHA-256 fingerprint")
	flag.Parse()
	var rd io.Reader = os.Stdin
	if *input != "-" {
		f, e := os.Open(*input)
		if e != nil {
			fatal(e)
		}
		defer f.Close()
		rd = f
	}
	d := json.NewDecoder(io.LimitReader(rd, 1<<20))
	d.DisallowUnknownFields()
	var b bundle
	if e := d.Decode(&b); e != nil {
		fatal(e)
	}
	var extra any
	if e := d.Decode(&extra); e != io.EOF {
		fatal(errors.New("input must contain exactly one JSON object"))
	}
	r, e := verify(b, *pin)
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(r)
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(2)
	}
	if r.AttestationStatus != "VERIFIED" || (b.LedgerEvent != nil && r.LedgerStatus != "DIGEST_MATCHED") {
		os.Exit(3)
	}
}
func fatal(e error) { fmt.Fprintln(os.Stderr, e); os.Exit(2) }
