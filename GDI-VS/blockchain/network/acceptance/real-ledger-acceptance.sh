#!/usr/bin/env bash
# Performs a real chaincode authorisation + document registration + ledger readback.
# Requires peer CLI environment configured for an authorised organisation identity.
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"; }
need peer
need jq
need sha256sum

: "${CORE_PEER_LOCALMSPID:?Set CORE_PEER_LOCALMSPID to the caller MSP ID}"
: "${CORE_PEER_MSPCONFIGPATH:?Set CORE_PEER_MSPCONFIGPATH to the enrolled identity MSP directory}"
: "${CORE_PEER_ADDRESS:?Set CORE_PEER_ADDRESS to the target peer host:port}"
: "${ORDERER_ADDRESS:?Set ORDERER_ADDRESS to the ordering service host:port}"
: "${ORDERER_CA:?Set ORDERER_CA to the ordering service TLS CA certificate path}"
: "${FABRIC_CHANNEL_NAME:=gdi-channel}"
: "${FABRIC_CHAINCODE_NAME:=gdi-documents}"
: "${GDI_ACCEPTANCE_ISSUER_REF:?Set a test issuer reference}"
: "${GDI_ACCEPTANCE_DOCUMENT_REF:?Set a unique test document reference}"
: "${GDI_ACCEPTANCE_DOCUMENT_TYPE:=TEST_ACCEPTANCE}"
: "${GDI_ACCEPTANCE_VERSION:=1}"
: "${GDI_ACCEPTANCE_SHA256:?Set a 64-character SHA-256 digest for test content}"
: "${GDI_ACCEPTANCE_STORAGE_REF:=acceptance://fabric-ledger-test}"
: "${GDI_ACCEPTANCE_SIGNATURE_REF:=acceptance-signature-not-supplied}"

[[ "$GDI_ACCEPTANCE_SHA256" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'GDI_ACCEPTANCE_SHA256 must be 64 hexadecimal characters'
[[ "$GDI_ACCEPTANCE_VERSION" == 1 ]] || fail 'this acceptance script intentionally uses a first-version registration only'
[[ -d "$CORE_PEER_MSPCONFIGPATH" ]] || fail 'CORE_PEER_MSPCONFIGPATH is not a directory'
[[ -f "$ORDERER_CA" ]] || fail 'ORDERER_CA does not exist'

PEER_TLS_ARGS=()
if [[ "${CORE_PEER_TLS_ENABLED:-false}" == true ]]; then
  : "${CORE_PEER_TLS_ROOTCERT_FILE:?Set CORE_PEER_TLS_ROOTCERT_FILE when peer TLS is enabled}"
  PEER_TLS_ARGS+=(--tls --cafile "$ORDERER_CA")
fi
INVOKE=(peer chaincode invoke -o "$ORDERER_ADDRESS" --channelID "$FABRIC_CHANNEL_NAME" --name "$FABRIC_CHAINCODE_NAME" --waitForEvent --waitForEventTimeout 90s "${PEER_TLS_ARGS[@]}" --peerAddresses "$CORE_PEER_ADDRESS")
if [[ -n "${ORDERER_TLS_HOSTNAME:-}" ]]; then
  INVOKE+=(--ordererTLSHostnameOverride "$ORDERER_TLS_HOSTNAME")
fi
if [[ -n "${CORE_PEER_TLS_ROOTCERT_FILE:-}" ]]; then
  INVOKE+=(--tlsRootCertFiles "$CORE_PEER_TLS_ROOTCERT_FILE")
fi
QUERY=(peer chaincode query --channelID "$FABRIC_CHANNEL_NAME" --name "$FABRIC_CHAINCODE_NAME")

printf 'Caller MSP: %s\nChannel: %s\nChaincode: %s\nDocument: %s v%s\n' \
  "$CORE_PEER_LOCALMSPID" "$FABRIC_CHANNEL_NAME" "$FABRIC_CHAINCODE_NAME" \
  "$GDI_ACCEPTANCE_DOCUMENT_REF" "$GDI_ACCEPTANCE_VERSION"
printf '\nStep 1/4: grant test issuer authorisation (requires gdi.networkAdmin=true attribute).\n'
AUTH_ARGS="$(jq -cn --arg issuer "$GDI_ACCEPTANCE_ISSUER_REF" --arg msp "$CORE_PEER_LOCALMSPID" --arg types "[\"$GDI_ACCEPTANCE_DOCUMENT_TYPE\"]" '{function:"ManageIssuerAuthorisations",Args:[$issuer,$msp,$types,"true"]}')"
"${INVOKE[@]}" -c "$AUTH_ARGS"

printf '\nStep 2/4: register document digest on the Fabric ledger.\n'
REGISTER_ARGS="$(jq -cn --arg ref "$GDI_ACCEPTANCE_DOCUMENT_REF" --arg version "$GDI_ACCEPTANCE_VERSION" --arg issuer "$GDI_ACCEPTANCE_ISSUER_REF" --arg type "$GDI_ACCEPTANCE_DOCUMENT_TYPE" --arg digest "${GDI_ACCEPTANCE_SHA256,,}" --arg storage "$GDI_ACCEPTANCE_STORAGE_REF" --arg signature "$GDI_ACCEPTANCE_SIGNATURE_REF" '{function:"RegisterDocument",Args:[$ref,$version,$issuer,$type,$digest,$storage,$signature,""]}')"
"${INVOKE[@]}" -c "$REGISTER_ARGS"

printf '\nStep 3/4: read the committed record from the peer.\n'
RECORD_ARGS="$(jq -cn --arg msp "$CORE_PEER_LOCALMSPID" --arg ref "$GDI_ACCEPTANCE_DOCUMENT_REF" --arg version "$GDI_ACCEPTANCE_VERSION" '{function:"GetDocument",Args:[$msp,$ref,$version]}')"
RECORD="$("${QUERY[@]}" -c "$RECORD_ARGS")"
printf '%s\n' "$RECORD" | jq .
RECORDED_DIGEST="$(printf '%s' "$RECORD" | jq -r '.sha256 // empty')"
[[ "${RECORDED_DIGEST,,}" == "${GDI_ACCEPTANCE_SHA256,,}" ]] || fail 'read-back digest does not match submitted digest'

printf '\nStep 4/4: invoke VerifyDocument against the committed record.\n'
VERIFY_ARGS="$(jq -cn --arg msp "$CORE_PEER_LOCALMSPID" --arg ref "$GDI_ACCEPTANCE_DOCUMENT_REF" --arg version "$GDI_ACCEPTANCE_VERSION" --arg digest "${GDI_ACCEPTANCE_SHA256,,}" '{function:"VerifyDocument",Args:[$msp,$ref,$version,$digest]}')"
VERIFY="$("${QUERY[@]}" -c "$VERIFY_ARGS")"
[[ "$VERIFY" == true ]] || fail "ledger verification did not return true: $VERIFY"

cat <<SUMMARY

REAL FABRIC LEDGER ACCEPTANCE: PASSED
- Issuer authorisation transaction submitted and committed (peer --waitForEvent).
- Document registration transaction submitted and committed (peer --waitForEvent).
- Committed document record read back from peer.
- VerifyDocument returned true for the submitted SHA-256 digest.

Capture the peer CLI output, transaction IDs, network configuration, endorsement policy,
peer identities and block evidence in the release evidence register. This script does not
by itself prove multi-organisation endorsement, production governance, or legal issuer authority.
SUMMARY
