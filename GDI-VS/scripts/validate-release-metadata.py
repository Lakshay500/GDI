#!/usr/bin/env python3
"""Validate version metadata and required reproducible-build inputs."""
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise SystemExit(f"Invalid VERSION value: {version!r}")

backend = tomllib.loads((ROOT / "backend/pyproject.toml").read_text(encoding="utf-8"))
frontend = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
version_module = (ROOT / "backend/app/version.py").read_text(encoding="utf-8")
match = re.search(r'^__version__\s*=\s*[\"\']([^\"\']+)', version_module, re.M)
values = {
    "VERSION": version,
    "backend pyproject": backend["project"]["version"],
    "frontend package": frontend["version"],
    "backend runtime": match.group(1) if match else None,
}
for label, value in values.items():
    if value != version:
        raise SystemExit(f"Version mismatch: {label}={value!r}; expected {version!r}")

missing = []
for label, path in (("frontend npm lockfile", ROOT / "frontend/package-lock.json"),
                    ("backend uv lockfile", ROOT / "backend/uv.lock")):
    if not path.is_file():
        missing.append(label)

print(f"Version metadata consistent: {version}")
if missing:
    print("Reproducibility inputs still missing: " + ", ".join(missing))
    sys.exit(2)
print("Frontend and backend lockfiles present.")
