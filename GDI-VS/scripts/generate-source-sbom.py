#!/usr/bin/env python3
"""Generate a deterministic CycloneDX inventory from declared project manifests.

This is a source-manifest SBOM: version ranges are declarations, not resolved versions.
It must not be represented as a lockfile-derived or vulnerability-cleared SBOM.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import tomllib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERIAL_NAMESPACE = uuid.UUID("c2a1d0e4-5d1c-4e6f-8a22-2e4e8f8b3b01")


def component(name: str, version: str, ecosystem: str, manifest: str) -> dict:
    purl_name = name.lower().replace("_", "-")
    if ecosystem == "npm":
        purl = f"pkg:npm/{purl_name}@{version}"
    elif ecosystem == "pypi":
        purl = f"pkg:pypi/{purl_name}@{version}"
    else:
        purl = f"pkg:golang/{name}@{version}"
    return {
        "type": "library", "name": name, "version": version,
        "purl": purl, "scope": "required",
        "properties": [
            {"name": "gdi-vs:ecosystem", "value": ecosystem},
            {"name": "gdi-vs:version-source", "value": "declared-range-not-resolved"},
            {"name": "gdi-vs:manifest", "value": manifest},
        ],
    }


def collect() -> list[dict]:
    items: list[dict] = []
    package_path = ROOT / "frontend/package.json"
    package = json.loads(package_path.read_text())
    for section in ("dependencies", "devDependencies"):
        for name, version in sorted(package.get(section, {}).items()):
            item = component(name, str(version), "npm", "frontend/package.json")
            item["scope"] = "required" if section == "dependencies" else "optional"
            items.append(item)

    py_path = ROOT / "backend/pyproject.toml"
    pyproject = tomllib.loads(py_path.read_text())
    for declaration in sorted(pyproject["project"].get("dependencies", [])):
        match = re.match(r"([A-Za-z0-9_.-]+)(.*)$", declaration)
        if match:
            name, version = match.groups()
            items.append(component(name, version.strip() or "unspecified", "pypi", "backend/pyproject.toml"))
    for declaration in sorted(pyproject["project"].get("optional-dependencies", {}).get("dev", [])):
        match = re.match(r"([A-Za-z0-9_.-]+)(.*)$", declaration)
        if match:
            name, version = match.groups()
            item = component(name, version.strip() or "unspecified", "pypi", "backend/pyproject.toml [dev]")
            item["scope"] = "optional"
            items.append(item)

    for relative in ("blockchain/gateway/go.mod", "blockchain/chaincode/gdi-document-contract/go.mod", "blockchain/evidence-verifier/go.mod"):
        path = ROOT / relative
        for line in path.read_text().splitlines():
            match = re.match(r"\s*([\w./-]+)\s+(v\S+)\s*$", line)
            if match and not match.group(1).startswith("go"):
                items.append(component(match.group(1), match.group(2), "golang", relative))
    return sorted(items, key=lambda x: (x["purl"], x["properties"][-1]["value"]))


def build_document() -> dict:
    version = (ROOT / "VERSION").read_text().strip()
    components = collect()
    identity = f"GDI-VS:{version}:source-manifest:" + "|".join(c["purl"] for c in components)
    serial = str(uuid.uuid5(SERIAL_NAMESPACE, identity))
    return {
        "bomFormat": "CycloneDX", "specVersion": "1.5", "serialNumber": f"urn:uuid:{serial}",
        "version": 1,
        "metadata": {
            "timestamp": "2026-11-22T00:00:00Z",
            "tools": [{"vendor": "GDI-VS", "name": "generate-source-sbom.py", "version": version}],
            "component": {"type": "application", "name": "GDI-VS", "version": version,
                "bom-ref": f"pkg:generic/gdi-vs@{version}"},
            "properties": [
                {"name": "gdi-vs:sbom-kind", "value": "source-manifest-inventory"},
                {"name": "gdi-vs:resolution-status", "value": "declared-ranges-not-lockfile-resolved"},
                {"name": "gdi-vs:vulnerability-status", "value": "not-assessed-by-this-generator"},
            ],
        },
        "components": components,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="security/sbom/gdi-vs-source-sbom.cdx.json")
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    if ROOT not in output.parents:
        parser.error("output must remain inside the repository")
    document = build_document()
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, indent=2, sort_keys=True) + "\n"
    output.write_text(payload)
    digest = hashlib.sha256(payload.encode()).hexdigest()
    print(f"Wrote {output.relative_to(ROOT)}: {len(document['components'])} declared components; sha256={digest}")
    print("NOTICE: declared version ranges only; not a resolved SBOM or vulnerability assessment.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
