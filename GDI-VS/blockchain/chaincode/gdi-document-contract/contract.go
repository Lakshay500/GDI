package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

var digestPattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

type DocumentRecord struct {
	DocumentRef        string `json:"documentRef"`
	Version            int    `json:"version"`
	OrganisationMSP    string `json:"organisationMsp"`
	IssuerRef          string `json:"issuerRef"`
	SHA256             string `json:"sha256"`
	StorageRef         string `json:"storageRef,omitempty"`
	SignatureRef       string `json:"signatureRef,omitempty"`
	PreviousVersionRef string `json:"previousVersionRef,omitempty"`
	Status             string `json:"status"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
	TransactionID      string `json:"transactionId"`
}

type VerificationEvent struct {
	EventRef       string `json:"eventRef"`
	DocumentRef    string `json:"documentRef"`
	Version        int    `json:"version"`
	Outcome        string `json:"outcome"`
	EvidenceDigest string `json:"evidenceDigest"`
	RecordedAt     string `json:"recordedAt"`
	TransactionID  string `json:"transactionId"`
}

type IssuerAuthorisation struct {
	IssuerRef       string   `json:"issuerRef"`
	OrganisationMSP string   `json:"organisationMsp"`
	DocumentTypes   []string `json:"documentTypes"`
	Active          bool     `json:"active"`
	UpdatedAt       string   `json:"updatedAt"`
}

type SmartContract struct{ contractapi.Contract }

func (s *SmartContract) RegisterDocument(ctx contractapi.TransactionContextInterface, documentRef string, versionText string, issuerRef string, documentType string, sha256 string, storageRef string, signatureRef string, previousVersionRef string) error {
	client := ctx.GetClientIdentity()
	msp, err := client.GetMSPID()
	if err != nil {
		return err
	}
	if documentRef == "" || issuerRef == "" || !digestPattern.MatchString(sha256) {
		return fmt.Errorf("invalid document reference, issuer reference or SHA-256 digest")
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		return fmt.Errorf("version must be a positive integer")
	}
	authKey, err := ctx.GetStub().CreateCompositeKey("issuerAuth", []string{msp, issuerRef})
	if err != nil {
		return err
	}
	authBytes, err := ctx.GetStub().GetState(authKey)
	if err != nil {
		return err
	}
	if authBytes == nil {
		return fmt.Errorf("issuer is not authorised for caller MSP")
	}
	var auth IssuerAuthorisation
	if err := json.Unmarshal(authBytes, &auth); err != nil {
		return err
	}
	if !auth.Active {
		return fmt.Errorf("issuer authorisation is inactive")
	}
	if len(auth.DocumentTypes) > 0 {
		allowed := false
		for _, allowedType := range auth.DocumentTypes {
			if allowedType == documentType {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("issuer is not authorised for this document type")
		}
	}
	if documentType == "" {
		return fmt.Errorf("document type is required")
	}
	key, err := ctx.GetStub().CreateCompositeKey("document", []string{msp, documentRef, versionText})
	if err != nil {
		return err
	}
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("document version already exists")
	}
	if version > 1 {
		if previousVersionRef == "" {
			return fmt.Errorf("previous version reference is required for versions after the first")
		}
		previousKey, err := ctx.GetStub().CreateCompositeKey("document", []string{msp, documentRef, strconv.Itoa(version - 1)})
		if err != nil {
			return err
		}
		previousBytes, err := ctx.GetStub().GetState(previousKey)
		if err != nil {
			return err
		}
		if previousBytes == nil {
			return fmt.Errorf("previous document version does not exist")
		}
	}
	now := txTime(ctx)
	rec := DocumentRecord{DocumentRef: documentRef, Version: version, OrganisationMSP: msp, IssuerRef: issuerRef, SHA256: hex.EncodeToString(mustDecode(sha256)), StorageRef: storageRef, SignatureRef: signatureRef, PreviousVersionRef: previousVersionRef, Status: "ACTIVE", CreatedAt: now, UpdatedAt: now, TransactionID: ctx.GetStub().GetTxID()}
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, raw)
}

func mustDecode(s string) []byte { b, _ := hex.DecodeString(s); return b }
func txTime(ctx contractapi.TransactionContextInterface) string {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339Nano)
}

func (s *SmartContract) GetDocument(ctx contractapi.TransactionContextInterface, organisationMSP string, documentRef string, versionText string) (*DocumentRecord, error) {
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		return nil, fmt.Errorf("invalid version")
	}
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, err
	}
	if callerMSP != organisationMSP && !isNetworkAdmin(ctx) {
		return nil, fmt.Errorf("caller is not authorised to read this organisation's record")
	}
	key, err := ctx.GetStub().CreateCompositeKey("document", []string{organisationMSP, documentRef, versionText})
	if err != nil {
		return nil, err
	}
	raw, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, fmt.Errorf("document record not found")
	}
	var rec DocumentRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

func (s *SmartContract) VerifyDocument(ctx contractapi.TransactionContextInterface, organisationMSP string, documentRef string, versionText string, sha256 string) (bool, error) {
	rec, err := s.GetDocument(ctx, organisationMSP, documentRef, versionText)
	if err != nil {
		return false, err
	}
	if !digestPattern.MatchString(sha256) {
		return false, fmt.Errorf("invalid SHA-256 digest")
	}
	return rec.SHA256 == sha256, nil
}

func (s *SmartContract) UpdateDocumentVersion(ctx contractapi.TransactionContextInterface, documentRef string, versionText string, sha256 string, storageRef string, signatureRef string) error {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if !digestPattern.MatchString(sha256) {
		return fmt.Errorf("invalid SHA-256 digest")
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		return fmt.Errorf("invalid version")
	}
	key, err := ctx.GetStub().CreateCompositeKey("document", []string{msp, documentRef, versionText})
	if err != nil {
		return err
	}
	raw, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if raw == nil {
		return fmt.Errorf("document version not found")
	}
	var rec DocumentRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return err
	}
	if rec.Status != "ACTIVE" {
		return fmt.Errorf("only active records can be updated")
	}
	if rec.SHA256 != strings.ToLower(sha256) {
		return fmt.Errorf("document digest is immutable; register a new document version")
	}
	rec.StorageRef = storageRef
	rec.SignatureRef = signatureRef
	rec.UpdatedAt = txTime(ctx)
	rec.TransactionID = ctx.GetStub().GetTxID()
	updated, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, updated)
}

func (s *SmartContract) setStatus(ctx contractapi.TransactionContextInterface, documentRef, versionText, status string) error {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		return fmt.Errorf("invalid version")
	}
	key, err := ctx.GetStub().CreateCompositeKey("document", []string{msp, documentRef, versionText})
	if err != nil {
		return err
	}
	raw, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if raw == nil {
		return fmt.Errorf("document version not found")
	}
	var rec DocumentRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return err
	}
	rec.Status = status
	rec.UpdatedAt = txTime(ctx)
	rec.TransactionID = ctx.GetStub().GetTxID()
	updated, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, updated)
}
func (s *SmartContract) SupersedeDocument(ctx contractapi.TransactionContextInterface, ref, version string) error {
	return s.setStatus(ctx, ref, version, "SUPERSEDED")
}
func (s *SmartContract) SuspendDocument(ctx contractapi.TransactionContextInterface, ref, version string) error {
	return s.setStatus(ctx, ref, version, "SUSPENDED")
}
func (s *SmartContract) RevokeDocument(ctx contractapi.TransactionContextInterface, ref, version string) error {
	return s.setStatus(ctx, ref, version, "REVOKED")
}

func (s *SmartContract) GetDocumentHistory(ctx contractapi.TransactionContextInterface, organisationMSP, documentRef string) ([]*DocumentRecord, error) {
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, err
	}
	if callerMSP != organisationMSP && !isNetworkAdmin(ctx) {
		return nil, fmt.Errorf("caller is not authorised to read this organisation's history")
	}
	iter, err := ctx.GetStub().GetStateByPartialCompositeKey("document", []string{organisationMSP, documentRef})
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	records := make([]*DocumentRecord, 0)
	for iter.HasNext() {
		item, err := iter.Next()
		if err != nil {
			return nil, err
		}
		var rec DocumentRecord
		if err := json.Unmarshal(item.Value, &rec); err != nil {
			return nil, err
		}
		records = append(records, &rec)
	}
	return records, nil
}

func (s *SmartContract) RecordVerificationEvent(ctx contractapi.TransactionContextInterface, eventRef, documentRef, versionText, outcome, evidenceDigest string) error {
	if eventRef == "" || outcome == "" || !digestPattern.MatchString(evidenceDigest) {
		return fmt.Errorf("invalid verification event")
	}
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	version, err := strconv.Atoi(versionText)
	if err != nil || version < 1 {
		return fmt.Errorf("invalid version")
	}
	key, err := ctx.GetStub().CreateCompositeKey("verification", []string{msp, eventRef})
	if err != nil {
		return err
	}
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if existing != nil {
		var prior VerificationEvent
		if err := json.Unmarshal(existing, &prior); err != nil {
			return err
		}
		// Idempotent retries are safe only when every immutable event field matches.
		if prior.DocumentRef == documentRef && prior.Version == version &&
			prior.Outcome == outcome && prior.EvidenceDigest == evidenceDigest {
			return nil
		}
		return fmt.Errorf("verification event reference already exists with different evidence")
	}
	event := VerificationEvent{EventRef: eventRef, DocumentRef: documentRef, Version: version, Outcome: outcome, EvidenceDigest: evidenceDigest, RecordedAt: txTime(ctx), TransactionID: ctx.GetStub().GetTxID()}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, raw)
}

func (s *SmartContract) GetVerificationEvent(ctx contractapi.TransactionContextInterface, organisationMSP, eventRef string) (*VerificationEvent, error) {
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, err
	}
	if callerMSP != organisationMSP && !isNetworkAdmin(ctx) {
		return nil, fmt.Errorf("caller is not authorised to read this organisation's verification event")
	}
	key, err := ctx.GetStub().CreateCompositeKey("verification", []string{organisationMSP, eventRef})
	if err != nil {
		return nil, err
	}
	raw, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, fmt.Errorf("verification event not found")
	}
	var event VerificationEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		return nil, err
	}
	return &event, nil
}

func (s *SmartContract) ManageIssuerAuthorisations(ctx contractapi.TransactionContextInterface, issuerRef, organisationMSP string, documentTypesJSON string, activeText string) error {
	if !isNetworkAdmin(ctx) {
		return fmt.Errorf("network administrator attribute required")
	}
	var types []string
	if err := json.Unmarshal([]byte(documentTypesJSON), &types); err != nil {
		return fmt.Errorf("documentTypes must be a JSON array")
	}
	active, err := strconv.ParseBool(activeText)
	if err != nil {
		return fmt.Errorf("active must be true or false")
	}
	key, err := ctx.GetStub().CreateCompositeKey("issuerAuth", []string{organisationMSP, issuerRef})
	if err != nil {
		return err
	}
	auth := IssuerAuthorisation{IssuerRef: issuerRef, OrganisationMSP: organisationMSP, DocumentTypes: types, Active: active, UpdatedAt: txTime(ctx)}
	raw, err := json.Marshal(auth)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, raw)
}

func isNetworkAdmin(ctx contractapi.TransactionContextInterface) bool {
	value, found, err := ctx.GetClientIdentity().GetAttributeValue("gdi.networkAdmin")
	return err == nil && found && value == "true"
}

func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		panic(err)
	}
	if err := chaincode.Start(); err != nil {
		panic(err)
	}
}
