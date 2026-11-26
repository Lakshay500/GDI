#!/usr/bin/env bash
set -euo pipefail

: "${FABRIC_GATEWAY_BRIDGE_URL:?Set FABRIC_GATEWAY_BRIDGE_URL to the private bridge URL}"
: "${FABRIC_GATEWAY_API_TOKEN:?Set FABRIC_GATEWAY_API_TOKEN}"
: "${FABRIC_ORGANISATION_MSP_ID:?Set FABRIC_ORGANISATION_MSP_ID}"
: "${FABRIC_CHANNEL_NAME:?Set FABRIC_CHANNEL_NAME}"
: "${FABRIC_CHAINCODE_NAME:?Set FABRIC_CHAINCODE_NAME}"

for tool in go curl docker peer; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Missing required tool: $tool" >&2
    exit 2
  }
done

echo "== Tool versions =="
go version
docker version --format '{{.Server.Version}}'
peer version

echo "== Fabric Gateway bridge health =="
curl --fail --silent --show-error --max-time 5 \
  "${FABRIC_GATEWAY_BRIDGE_URL%/}/health"
echo

echo "== Go module tests and builds =="
for module in \
  blockchain/chaincode/gdi-document-contract \
  blockchain/gateway \
  blockchain/evidence-verifier; do
  echo "-- $module"
  (cd "$(dirname "$0")/../.." && cd "$module" && go mod download && go test ./... && go vet ./... && go build ./...)
done

echo "Preflight passed. This checks tooling, bridge health and source builds only."
echo "It does NOT prove a committed Fabric transaction or multi-peer endorsement."
