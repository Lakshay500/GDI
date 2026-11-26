#!/usr/bin/env python3
"""Validate required dependency lockfiles without inventing or resolving versions."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "frontend/npm": ROOT / "frontend/package-lock.json",
    "backend/uv": ROOT / "backend/uv.lock",
    "blockchain/gateway/go": ROOT / "blockchain/gateway/go.sum",
    "blockchain/chaincode/go": ROOT / "blockchain/chaincode/gdi-document-contract/go.sum",
}
# The evidence verifier currently imports only the Go standard library. Go does not
# create go.sum for a dependency-free module; requiring an empty checksum file is wrong.
STANDARD_LIBRARY_ONLY = {
    "blockchain/evidence-verifier": ROOT / "blockchain/evidence-verifier/go.mod",
}


def validate_lockfile(name: str, path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file() or path.stat().st_size == 0:
        return ["missing or empty"]
    try:
        if name == "frontend/npm":
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("lockfileVersion") not in (2, 3):
                errors.append("unsupported or missing lockfileVersion (expected 2 or 3)")
            root_package = data.get("packages", {}).get("", {})
            manifest = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
            if root_package.get("name") != manifest.get("name"):
                errors.append("root package name does not match package.json")
            if root_package.get("version") != manifest.get("version"):
                errors.append("root package version does not match package.json")
        elif name == "backend/uv":
            data = tomllib.loads(path.read_text(encoding="utf-8"))
            if data.get("version") != 1 or not isinstance(data.get("package"), list):
                errors.append("invalid uv lock structure")
            if not data.get("package"):
                errors.append("uv lock contains no resolved packages")
        elif name.startswith("blockchain/"):
            lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
            for number, line in enumerate(lines, start=1):
                fields = line.split()
                if len(fields) != 3 or not re.fullmatch(r"h1:[A-Za-z0-9+/]{43}=", fields[2]):
                    errors.append(f"invalid go.sum entry at line {number}")
                    break
    except (OSError, ValueError, tomllib.TOMLDecodeError) as exc:
        errors.append(f"cannot parse lockfile: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable result")
    args = parser.parse_args()
    results = {}
    for name, path in REQUIRED.items():
        errors = validate_lockfile(name, path)
        results[name] = {"path": path.relative_to(ROOT).as_posix(), "status": "passed" if not errors else "blocked", "errors": errors}
    for name, path in STANDARD_LIBRARY_ONLY.items():
        try:
            mod = path.read_text(encoding="utf-8")
            external = [line.strip() for line in mod.splitlines() if line.strip().startswith("require ") or line.strip().startswith("require(")]
            errors = ["module now declares external dependencies; add it to the lockfile gate"] if external else []
        except OSError as exc:
            errors = [f"cannot inspect module: {exc}"]
        results[name] = {"path": path.relative_to(ROOT).as_posix(), "status": "passed" if not errors else "blocked", "errors": errors, "lock_strategy": "Go standard library only; no go.sum required"}
    manifest_version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    frontend_version = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8")).get("version")
    version_ok = frontend_version == manifest_version
    overall_ok = all(v["status"] == "passed" for v in results.values()) and version_ok
    if args.json:
        print(json.dumps({"schema": "gdi-vs-dependency-lock-check/v1", "version": manifest_version, "status": "passed" if overall_ok else "blocked", "checks": results, "frontend_version_matches": version_ok}, indent=2))
    else:
        print("Dependency lockfile inventory:")
        for name, result in results.items():
            print(f"  [{result['status'].upper()}] {name}: {result['path']}")
            for error in result["errors"]:
                print(f"      - {error}")
        print(f"  [{'PASSED' if version_ok else 'BLOCKED'}] frontend version matches VERSION")
        if not overall_ok:
            print("\nLOCKFILE CHECK FAILED: required dependency locks are incomplete or invalid.", file=sys.stderr)
    return 0 if overall_ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
