#!/usr/bin/env bash
# Deploy the GDI document contract to an operator-provisioned Fabric test network.
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"; }

: "${FABRIC_SAMPLES_TEST_NETWORK:?Set FABRIC_SAMPLES_TEST_NETWORK to fabric-samples/test-network}"
: "${FABRIC_CHANNEL_NAME:=gdi-channel}"
: "${FABRIC_CHAINCODE_NAME:=gdi-documents}"
: "${FABRIC_CHAINCODE_VERSION:=1.0}"
: "${FABRIC_CHAINCODE_SEQUENCE:=1}"

need docker
need bash
[[ -x "$FABRIC_SAMPLES_TEST_NETWORK/network.sh" ]] || fail "network.sh not found under $FABRIC_SAMPLES_TEST_NETWORK"
[[ -f "$(cd "$(dirname "$0")/../chaincode/gdi-document-contract" && pwd)/go.mod" ]] || fail "chaincode go.mod not found"

CHAINCODE_PATH="$(cd "$(dirname "$0")/../chaincode/gdi-document-contract" && pwd)"
printf '%s\n' 'GDI-VS Fabric deployment' \
  "Test network: $FABRIC_SAMPLES_TEST_NETWORK" \
  "Channel: $FABRIC_CHANNEL_NAME" \
  "Chaincode: $FABRIC_CHAINCODE_NAME" \
  "Version/sequence: $FABRIC_CHAINCODE_VERSION/$FABRIC_CHAINCODE_SEQUENCE" \
  "Chaincode source: $CHAINCODE_PATH"
printf '\nThis deploys chaincode only. It does not create consortium governance, production MSPs, CA identities, endorsement policy approval, or production trust.\n'

"$FABRIC_SAMPLES_TEST_NETWORK/network.sh" deployCC \
  -c "$FABRIC_CHANNEL_NAME" \
  -ccn "$FABRIC_CHAINCODE_NAME" \
  -ccp "$CHAINCODE_PATH" \
  -ccl go \
  -ccv "$FABRIC_CHAINCODE_VERSION" \
  -ccs "$FABRIC_CHAINCODE_SEQUENCE"

printf '\nChaincode deployment command completed. Run the transaction acceptance script from a peer CLI context with an authorised network-administrator identity.\n'
