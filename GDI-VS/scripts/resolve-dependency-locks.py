#!/usr/bin/env python3
"""Resolve native npm/uv/Go lockfiles with bounded timeouts and honest JSON evidence."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "security/reports/lockfile-resolution-v0.94.0.json"
COMMANDS = [
    ("frontend/npm", ["npm", "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=15000"], "frontend"),
    ("backend/uv", ["uv", "lock"], "backend"),
    ("blockchain/gateway/go", ["go", "mod", "tidy"], "blockchain/gateway"),
    ("blockchain/chaincode/go", ["go", "mod", "tidy"], "blockchain/chaincode/gdi-document-contract"),
]
EXPECTED = {
    "frontend/npm": "frontend/package-lock.json",
    "backend/uv": "backend/uv.lock",
    "blockchain/gateway/go": "blockchain/gateway/go.sum",
    "blockchain/chaincode/go": "blockchain/chaincode/gdi-document-contract/go.sum",
}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=int, default=45, help="maximum seconds per package-manager command")
    args = parser.parse_args()
    if not 5 <= args.timeout <= 600:
        parser.error("--timeout must be between 5 and 600 seconds")
    results = []
    for name, command, cwd in COMMANDS:
        missing = [tool for tool in (command[0],) if shutil.which(tool) is None]
        if missing:
            results.append({"ecosystem": name, "status": "blocked", "reason": f"missing tool: {', '.join(missing)}", "lockfile": EXPECTED[name]})
            continue
        started = time.monotonic()
        env = os.environ.copy()
        env.setdefault("GOTOOLCHAIN", "local")
        try:
            completed = subprocess.run(command, cwd=ROOT / cwd, text=True, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, timeout=args.timeout, env=env, check=False)
            status = "resolved" if completed.returncode == 0 and (ROOT / EXPECTED[name]).is_file() else "blocked"
            reason = "native resolver completed" if status == "resolved" else f"resolver exited {completed.returncode} or did not create the expected lockfile"
            output = completed.stdout[-4000:]
        except subprocess.TimeoutExpired as exc:
            status, reason = "blocked", f"command exceeded {args.timeout}s timeout"
            raw = exc.stdout or b""
            output = (raw.decode(errors="replace") if isinstance(raw, bytes) else raw)[-4000:]
        results.append({"ecosystem": name, "status": status, "reason": reason,
                        "lockfile": EXPECTED[name], "elapsed_seconds": round(time.monotonic() - started, 2),
                        "output_tail": output})
    lock_check = subprocess.run(["python", "scripts/check-dependency-locks.py", "--json"], cwd=ROOT,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    try:
        validation = json.loads(lock_check.stdout)
    except json.JSONDecodeError:
        validation = {"status": "blocked", "raw_output": lock_check.stdout[-4000:]}
    payload = {"schema": "gdi-vs-lockfile-resolution/v1", "version": (ROOT / "VERSION").read_text().strip(),
               "status": "resolved" if all(item["status"] == "resolved" for item in results) and validation.get("status") == "passed" else "blocked",
               "timeout_seconds_per_command": args.timeout, "results": results, "lockfile_validation": validation}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0 if payload["status"] == "resolved" else 1

if __name__ == "__main__":
    raise SystemExit(main())
