#!/usr/bin/env bash
# Resolve authentic dependency lockfiles with bounded network waits and durable evidence.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TIMEOUT_SECONDS="${GDI_LOCK_RESOLVE_TIMEOUT:-45}"
if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || (( TIMEOUT_SECONDS < 5 || TIMEOUT_SECONDS > 600 )); then
  echo 'GDI_LOCK_RESOLVE_TIMEOUT must be an integer between 5 and 600 seconds.' >&2
  exit 2
fi
command -v python >/dev/null || { echo 'ERROR: Python is required' >&2; exit 2; }
python scripts/resolve-dependency-locks.py --timeout "$TIMEOUT_SECONDS"
