# Hyperledger Fabric integration

This directory contains a real Fabric chaincode package and a Gateway SDK bridge. It is not a blockchain simulator. A Fabric network must be separately provisioned and running before the bridge can connect.

- `chaincode/gdi-document-contract`: Go chaincode for compact document provenance records.
- `gateway`: Go service using the official Hyperledger Fabric Gateway Go SDK. It connects with an X.509 client identity, TLS trust root and signing key, and exposes a small bearer-token-protected internal HTTP contract for the FastAPI backend.
- `network/`: deployment and consortium configuration notes.

The bridge is intentionally not exposed publicly. Put it on a private container network, use a high-entropy secret for its internal bearer token, restrict the API service to that network, and provision client credentials through a secrets manager or read-only secret mount. Do not place enrollment private keys in source control or `.env`.

## Required network inputs

The operator must provide a running Fabric network with a channel and deployed chaincode, plus:

- Gateway endpoint reachable from the bridge.
- TLS root certificate for the peer/gateway endpoint.
- Client X.509 certificate and matching private key.
- Client MSP ID and channel/chaincode names.
- A client certificate with the appropriate Fabric attributes and channel ACLs.
- An issuer authorisation transaction for each issuer/MSP before registration.

No root CA, MSP, peer, orderer, channel, consortium membership, or credentials are fabricated by this repository.

- `evidence-verifier/`: standalone standard-library Go CLI for offline verification of GDI-VS Ed25519 evidence attestations, optional public-key fingerprint pinning, and comparison of a supplied Fabric evidence-event digest. See `docs/verification/workstream-60-independent-ledger-verification.md` for bundle export and usage.
