#!/usr/bin/env bash
# Run the real Fabric acceptance flow and preserve a tamper-evident local evidence bundle.
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"; }
need python3
need sha256sum

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCEPTANCE_SCRIPT="$SCRIPT_DIR/real-ledger-acceptance.sh"
[[ -f "$ACCEPTANCE_SCRIPT" ]] || fail "acceptance script not found: $ACCEPTANCE_SCRIPT"

: "${CORE_PEER_LOCALMSPID:?Set CORE_PEER_LOCALMSPID}"
: "${FABRIC_CHANNEL_NAME:=gdi-channel}"
: "${FABRIC_CHAINCODE_NAME:=gdi-documents}"
: "${GDI_ACCEPTANCE_ISSUER_REF:?Set GDI_ACCEPTANCE_ISSUER_REF}"
: "${GDI_ACCEPTANCE_DOCUMENT_REF:?Set GDI_ACCEPTANCE_DOCUMENT_REF}"
: "${GDI_ACCEPTANCE_SHA256:?Set GDI_ACCEPTANCE_SHA256}"

OUT_DIR="${GDI_ACCEPTANCE_EVIDENCE_DIR:-$PWD/evidence/fabric-acceptance}"
mkdir -p "$OUT_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
MANIFEST_FILE="$OUT_DIR/$RUN_ID.manifest.json"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf 'Capturing Fabric acceptance output to %s\n' "$LOG_FILE"
set +e
"$ACCEPTANCE_SCRIPT" 2>&1 | tee "$LOG_FILE"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
ACCEPTANCE_EXIT="${PIPE_STATUS[0]}"
FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$LOG_FILE" "$MANIFEST_FILE" "$STARTED_AT" "$FINISHED_AT" "$ACCEPTANCE_EXIT" <<'PY'
import hashlib, json, os, re, sys
from pathlib import Path
log_path, manifest_path, started, finished, exit_code = sys.argv[1:]
raw = Path(log_path).read_bytes()
text = raw.decode('utf-8', errors='replace')
# Fabric transaction IDs are 64-character hexadecimal strings. Keep unique IDs only.
txids = list(dict.fromkeys(re.findall(r'(?i)(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])', text)))
manifest = {
    "schema": "gdi-vs.fabric-acceptance-evidence.v1",
    "started_at_utc": started,
    "finished_at_utc": finished,
    "result": "PASSED" if exit_code == "0" and "REAL FABRIC LEDGER ACCEPTANCE: PASSED" in text else "FAILED",
    "acceptance_exit_code": int(exit_code),
    "context": {
        "msp_id": os.environ.get("CORE_PEER_LOCALMSPID"),
        "channel": os.environ.get("FABRIC_CHANNEL_NAME", "gdi-channel"),
        "chaincode": os.environ.get("FABRIC_CHAINCODE_NAME", "gdi-documents"),
        "issuer_ref": os.environ.get("GDI_ACCEPTANCE_ISSUER_REF"),
        "document_ref": os.environ.get("GDI_ACCEPTANCE_DOCUMENT_REF"),
        "document_sha256": os.environ.get("GDI_ACCEPTANCE_SHA256", "").lower(),
    },
    "transaction_ids_observed_in_cli_output": txids,
    "cli_output": {
        "file": Path(log_path).name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "size_bytes": len(raw),
    },
    "limitations": [
        "This manifest hashes captured CLI output; it is not a Fabric block-header proof.",
        "Transaction IDs are included only when visibly emitted in captured CLI output.",
        "A single-peer read-back does not establish multi-organisation endorsement.",
        "The manifest is not digitally signed; protect and independently archive the evidence directory.",
    ],
}
Path(manifest_path).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Evidence manifest: {manifest_path}")
print(f"Evidence result: {manifest['result']}")
print(f"Transaction IDs observed: {len(txids)}")
PY

printf '\nEvidence bundle files:\n  %s\n  %s\n' "$LOG_FILE" "$MANIFEST_FILE"
exit "$ACCEPTANCE_EXIT"
