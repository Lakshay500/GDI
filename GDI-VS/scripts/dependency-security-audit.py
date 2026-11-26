#!/usr/bin/env python3
"""Run dependency audits only against resolved lockfiles; record honest evidence."""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCKS = {
    "npm": ROOT / "frontend/package-lock.json",
    "uv": ROOT / "backend/uv.lock",
    "go_gateway": ROOT / "blockchain/gateway/go.sum",
    "go_chaincode": ROOT / "blockchain/chaincode/gdi-document-contract/go.sum",
    "go_evidence_verifier": ROOT / "blockchain/evidence-verifier/go.sum",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="security/reports/dependency-audit-v0.85.0.json")
    parser.add_argument("--execute", action="store_true", help="run available ecosystem audit tools")
    args = parser.parse_args()
    checks = []
    for name, path in LOCKS.items():
        present = path.is_file() and path.stat().st_size > 0
        checks.append({"ecosystem": name, "lockfile": str(path.relative_to(ROOT)),
                       "status": "ready" if present else "blocked", "reason": None if present else "lockfile_missing"})

    audits = []
    if args.execute:
        commands = [
            ("npm", ["npm", "audit", "--audit-level=low"], ROOT / "frontend", "frontend/package-lock.json"),
            ("python", ["uv", "run", "--locked", "--extra", "dev", "pip-audit"], ROOT / "backend", "backend/uv.lock"),
            ("go_gateway", ["govulncheck", "./..."], ROOT / "blockchain/gateway", "blockchain/gateway/go.sum"),
            ("go_chaincode", ["govulncheck", "./..."], ROOT / "blockchain/chaincode/gdi-document-contract", "blockchain/chaincode/gdi-document-contract/go.sum"),
            ("go_evidence_verifier", ["govulncheck", "./..."], ROOT / "blockchain/evidence-verifier", "blockchain/evidence-verifier/go.sum"),
        ]
        for ecosystem, command, cwd, lock in commands:
            if not (ROOT / lock).is_file():
                audits.append({"ecosystem": ecosystem, "status": "blocked", "reason": "lockfile_missing"})
                continue
            if not shutil.which(command[0]):
                audits.append({"ecosystem": ecosystem, "status": "blocked", "reason": f"tool_missing:{command[0]}"})
                continue
            try:
                result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=180)
                audits.append({"ecosystem": ecosystem, "status": "passed" if result.returncode == 0 else "findings_or_error",
                               "return_code": result.returncode,
                               "stdout_tail": result.stdout[-4000:], "stderr_tail": result.stderr[-4000:]})
            except subprocess.TimeoutExpired:
                audits.append({"ecosystem": ecosystem, "status": "blocked", "reason": "audit_timeout"})

    ready = all(x["status"] == "ready" for x in checks)
    document = {
        "schema_version": 1,
        "project": "GDI-VS",
        "release_version": (ROOT / "VERSION").read_text().strip(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "resolved dependency vulnerability audit; not a source-manifest-only assessment",
        "lockfile_readiness": "ready" if ready else "blocked",
        "lockfiles": checks,
        "audits": audits,
        "interpretation": "No audit result means no vulnerability clearance. Missing lockfiles or tools are blocked, never clean.",
    }
    output = (ROOT / args.output).resolve()
    if ROOT not in output.parents:
        parser.error("output must remain inside repository")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {output.relative_to(ROOT)}")
    print(f"Lockfile readiness: {document['lockfile_readiness']}")
    for item in checks:
        print(f"[{item['status'].upper()}] {item['ecosystem']}: {item['lockfile']}")
    if not ready:
        print("No vulnerability clearance is claimed; resolve all lockfiles before interpreting audit status.")
    return 0 if ready else 2

if __name__ == "__main__":
    raise SystemExit(main())
