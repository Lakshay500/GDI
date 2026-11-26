package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"
)

func fixture(t *testing.T) (bundle, string) {
	t.Helper()
	pub, priv, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	b := bundle{SnapshotID: "snapshot-1", OrganisationID: "org-1", VerificationResultID: "result-1", DocumentVersionID: "version-1", CanonicalizationVersion: "gdi-vs-json-c14n-v1", EvidenceSHA256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", KeyID: "audit-key-1"}
	p := payload(b)
	b.SignedPayloadSHA256 = digest(p)
	b.SignatureBase64 = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, p))
	der, e := x509.MarshalPKIXPublicKey(pub)
	if e != nil {
		t.Fatal(e)
	}
	b.PublicKeyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	return b, digest(pub)
}
func TestValidSignatureAndPinnedKey(t *testing.T) {
	b, p := fixture(t)
	r, e := verify(b, p)
	if e != nil || r.AttestationStatus != "VERIFIED" || r.KeyPinStatus != "MATCH" {
		t.Fatalf("%+v %v", r, e)
	}
}
func TestTamperedPayloadRejected(t *testing.T) {
	b, p := fixture(t)
	b.EvidenceSHA256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if _, e := verify(b, p); e == nil {
		t.Fatal("expected tamper rejection")
	}
}
func TestWrongKeyPinRejected(t *testing.T) {
	b, _ := fixture(t)
	if _, e := verify(b, "00"); e == nil {
		t.Fatal("expected key pin mismatch")
	}
}
func TestLedgerDigestCompared(t *testing.T) {
	b, p := fixture(t)
	b.LedgerEvent = &ledgerEvent{EventRef: "event-1", EvidenceDigest: b.SignedPayloadSHA256, TransactionID: "tx-1"}
	r, e := verify(b, p)
	if e != nil || r.LedgerStatus != "DIGEST_MATCHED" {
		t.Fatalf("%+v %v", r, e)
	}
	b.LedgerEvent.EvidenceDigest = "00"
	r, e = verify(b, p)
	if e != nil || r.LedgerStatus != "DIGEST_MISMATCH" {
		t.Fatalf("%+v %v", r, e)
	}
}

func TestLedgerEventReferenceMustMatchAttestation(t *testing.T) {
	b, pin := fixture(t)
	b.AttestationID = "att-123"
	b.LedgerEvent = &ledgerEvent{EventRef: "gdivs-evidence-other", EvidenceDigest: b.SignedPayloadSHA256}
	r, err := verify(b, pin)
	if err != nil || r.LedgerStatus != "EVENT_REFERENCE_MISMATCH" {
		t.Fatalf("%+v %v", r, err)
	}
}
