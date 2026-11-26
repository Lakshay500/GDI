# Fabric network deployment runbook

## Network topology

The intended consortium topology is permissioned: one network operator governs the ordering service and channel lifecycle; each participating government/institutional organisation operates its own CA/MSP and peer(s). Endorsement policy and channel membership must be approved by the project owner and participating organisations before production deployment. Development test networks are not production trust anchors.

## Deploy chaincode to an existing Fabric test network

Use the official Hyperledger Fabric `fabric-samples/test-network` repository and matching Fabric binaries/container images. Start the sample network with a channel, then package and deploy this chaincode from its directory using the test-network `network.sh deployCC` workflow. For example, from `fabric-samples/test-network`:

```bash
./network.sh up createChannel -ca -c gdi-channel
./network.sh deployCC -c gdi-channel -ccn gdi-documents \
  -ccp /absolute/path/to/gdi-vs/blockchain/chaincode/gdi-document-contract \
  -ccl go
```

The test-network's default Org1/Org2 identities and policies are development-only. Before registering documents, issue a Fabric CA identity for the relevant organisation with the `gdi.networkAdmin=true` attribute for network governance transactions, and a separate least-privilege application identity for normal document operations. Configure channel ACLs and endorsement policy explicitly. Invoke `ManageIssuerAuthorisations` as the network administrator for each issuer/MSP pair before `RegisterDocument`.

## Gateway bridge configuration

Build the bridge with its Go module and provide the following through the runtime secret/configuration system:

```text
FABRIC_GATEWAY_ENDPOINT=peer-host:7051
FABRIC_TLS_ROOT_CERT=/run/secrets/fabric_tls_root.pem
FABRIC_CLIENT_CERT=/run/secrets/fabric_client_cert.pem
FABRIC_CLIENT_KEY=/run/secrets/fabric_client_key.pem
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL_NAME=gdi-channel
FABRIC_CHAINCODE_NAME=gdi-documents
FABRIC_GATEWAY_API_TOKEN=<high-entropy-secret>
FABRIC_GATEWAY_LISTEN=0.0.0.0:8081
```

The FastAPI service uses `FABRIC_GATEWAY_BRIDGE_URL`, `FABRIC_GATEWAY_API_TOKEN`, `FABRIC_ORGANISATION_MSP_ID`, `FABRIC_CHANNEL_NAME` and `FABRIC_CHAINCODE_NAME`. These values must match the bridge/network configuration. Keep the bridge internal and do not publish its port to the host or internet.

## Production gates

Before production: establish consortium membership and legal governance; replace development certificates; approve endorsement policies; enable peer/orderer TLS and mutual TLS; configure CA revocation and identity lifecycle; back up ledger and private data; define disaster recovery and chaincode upgrade approvals; run multi-organisation integration tests; and complete security review. No production readiness is implied by successful chaincode compilation alone.
