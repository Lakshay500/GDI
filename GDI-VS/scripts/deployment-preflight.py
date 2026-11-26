#!/usr/bin/env python3
"""Preflight GDI-VS deployment configuration without starting containers or exposing secrets."""
from __future__ import annotations
import argparse, base64, json, os, re, shutil, subprocess, sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ("POSTGRES_PASSWORD", "JWT_SECRET", "IPFS_ENCRYPTION_KEY")
PLACEHOLDERS = ("change-me", "replace-me", "your-", "<", ">", "example")

def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("\"'")
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key.strip()):
            values[key.strip()] = value
    return values

def check_configuration(values: dict[str, str], env_path: Path, fabric: bool) -> list[dict[str, Any]]:
    checks = []
    checks.append({"name": "env_file", "passed": env_path.is_file(), "detail": "Environment file present" if env_path.is_file() else "Environment file missing"})
    for key in REQUIRED:
        value = values.get(key, "")
        valid = bool(value) and not any(token in value.lower() for token in PLACEHOLDERS)
        if key == "JWT_SECRET": valid = valid and len(value) >= 32
        if key == "POSTGRES_PASSWORD": valid = valid and len(value) >= 16
        if key == "IPFS_ENCRYPTION_KEY":
            try: valid = valid and len(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))) == 32
            except Exception: valid = False
        checks.append({"name": f"secret_{key.lower()}", "passed": valid, "detail": f"{key} is configured" if valid else f"{key} is missing, placeholder, too short or invalid"})
    if fabric:
        fabric_keys = ("FABRIC_GATEWAY_ENDPOINT", "FABRIC_MSP_ID", "FABRIC_CHANNEL_NAME", "FABRIC_CHAINCODE_NAME", "FABRIC_GATEWAY_API_TOKEN")
        missing = [key for key in fabric_keys if not values.get(key) or any(token in values.get(key, "").lower() for token in PLACEHOLDERS)]
        checks.append({"name": "fabric_profile_configuration", "passed": not missing, "detail": "Fabric profile variables configured" if not missing else "Missing or placeholder Fabric settings: " + ", ".join(missing)})
    else:
        checks.append({"name": "fabric_profile_configuration", "passed": True, "detail": "Fabric profile not requested; external network acceptance remains separate"})
    return checks

def command_check(name: str, command: list[str]) -> dict[str, Any]:
    if not shutil.which(command[0]):
        return {"name": name, "passed": False, "detail": f"{command[0]} executable not found"}
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=30, check=False)
        return {"name": name, "passed": result.returncode == 0, "detail": "Command completed successfully" if result.returncode == 0 else f"Command failed with exit code {result.returncode}"}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"name": name, "passed": False, "detail": f"Command could not complete: {type(exc).__name__}"}

def run(env_file: Path, skip_compose: bool = False, fabric: bool = False) -> dict[str, Any]:
    values = read_env(env_file)
    checks = check_configuration(values, env_file, fabric)
    checks.append({"name": "python_version", "passed": sys.version_info >= (3, 12), "detail": f"Python {sys.version_info.major}.{sys.version_info.minor}"})
    if not skip_compose:
        checks.append(command_check("docker_compose_config", ["docker", "compose", "--env-file", str(env_file), "config", "--quiet"]))
    return {"project_version": (ROOT / "VERSION").read_text().strip(), "env_file": str(env_file), "mode": "fabric" if fabric else "core", "checks": checks, "passed": all(c["passed"] for c in checks), "scope_note": "Preflight only. It does not start containers, run migrations, prove service health, execute end-to-end scenarios or verify a Fabric transaction."}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--skip-compose", action="store_true", help="Skip Docker Compose validation")
    parser.add_argument("--fabric", action="store_true", help="Also require optional Fabric profile settings")
    parser.add_argument("--json", type=Path, help="Write a machine-readable report")
    args = parser.parse_args()
    report = run(args.env_file, args.skip_compose, args.fabric)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
