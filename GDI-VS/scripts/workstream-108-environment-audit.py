#!/usr/bin/env python3
"""Report local build prerequisites without installing packages or exposing secrets."""
from __future__ import annotations
import json
import shutil
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def tool_version(name: str, args: list[str]) -> dict[str, object]:
    executable = shutil.which(name)
    if not executable:
        return {"available": False, "version": None}
    try:
        result = subprocess.run([executable, *args], capture_output=True, text=True, timeout=8)
        output = (result.stdout or result.stderr).strip().splitlines()
        return {"available": result.returncode == 0, "version": output[0][:160] if output else None}
    except (OSError, subprocess.TimeoutExpired):
        return {"available": True, "version": "version query failed"}


def registry_dns(host: str = "registry.npmjs.org") -> dict[str, object]:
    try:
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
        return {"resolves": True, "address_count": len(addresses)}
    except OSError as exc:
        return {"resolves": False, "error_type": type(exc).__name__}


def audit(root: Path = ROOT) -> dict[str, object]:
    tools = {
        "node": tool_version("node", ["--version"]),
        "npm": tool_version("npm", ["--version"]),
        "python": tool_version("python", ["--version"]),
        "uv": tool_version("uv", ["--version"]),
        "go": tool_version("go", ["version"]),
        "docker": tool_version("docker", ["--version"]),
    }
    lockfiles = {
        "frontend/package-lock.json": (root / "frontend/package-lock.json").is_file(),
        "backend/uv.lock": (root / "backend/uv.lock").is_file(),
        "blockchain/gateway/go.sum": (root / "blockchain/gateway/go.sum").is_file(),
        "blockchain/chaincode/gdi-document-contract/go.sum": (root / "blockchain/chaincode/gdi-document-contract/go.sum").is_file(),
    }
    dns = registry_dns()
    return {
        "schema": "gdi-vs-workstream-108-environment-audit/v1",
        "version": (root / "VERSION").read_text(encoding="utf-8").strip(),
        "tools": tools,
        "npm_registry_dns": dns,
        "lockfiles": lockfiles,
        "status": "ready_for_build" if all(lockfiles.values()) and dns["resolves"] and tools["node"]["available"] and tools["npm"]["available"] else "blocked",
        "scope_note": "Local prerequisite inventory only; does not install dependencies, establish registry connectivity beyond DNS, build artifacts, start services or prove runtime acceptance.",
    }


if __name__ == "__main__":
    print(json.dumps(audit(), indent=2, sort_keys=True))
