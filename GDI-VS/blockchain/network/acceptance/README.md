# Real Fabric transaction acceptance

This directory contains an operator-run acceptance script. It makes real Fabric peer CLI calls; it is not a mock or a local simulator.

## Prerequisites

- A running, disposable Hyperledger Fabric test network with the GDI chaincode already deployed.
- Fabric `peer` CLI and `jq` installed.
- Peer CLI environment configured for the organisation's enrolled identity.
- The identity must carry `gdi.networkAdmin=true` because the first transaction provisions a test issuer authorisation.
- TLS CA paths and endpoints must match the live test network.

## Required environment

```bash
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/path/to/identity/msp
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=/path/to/peer/tls/ca.crt
export ORDERER_ADDRESS=localhost:7050
export ORDERER_CA=/path/to/orderer/tls/ca.crt
export ORDERER_TLS_HOSTNAME=orderer.example.com # if required by the certificate
export FABRIC_CHANNEL_NAME=gdi-channel
export FABRIC_CHAINCODE_NAME=gdi-documents
export GDI_ACCEPTANCE_ISSUER_REF=acceptance-issuer-001
export GDI_ACCEPTANCE_DOCUMENT_REF=acceptance-document-unique-001
export GDI_ACCEPTANCE_DOCUMENT_TYPE=TEST_ACCEPTANCE
export GDI_ACCEPTANCE_SHA256=<64-hex-digest-of-test-fixture>
```

Run from the repository root:

```bash
bash blockchain/network/acceptance/real-ledger-acceptance.sh
```

The script submits the issuer authorisation and document registration, waits for peer commit events, reads the document record, and requires the ledger's `VerifyDocument` query to return `true`. Use a new document reference for each run because a document version is immutable and duplicate registration is rejected.

## Deployment wrapper

Set `FABRIC_SAMPLES_TEST_NETWORK` to the absolute path of `fabric-samples/test-network`, then run `blockchain/network/deploy-test-network.sh`. See `blockchain/network/DEPLOYMENT.md` and `docs/verification/workstream-62-real-fabric-deployment-acceptance.md` before use.

Never use the Fabric Samples development identities or this test procedure as a production security configuration.
