#!/usr/bin/env python3
"""Run non-destructive deployment checks against a live GDI-VS API.

This checks service readiness and route availability only. It does not create
records, upload documents, or claim the 13 mandatory acceptance scenarios pass.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUIRED_PATHS = {
    "/health",
    "/ready",
    "/health/dependencies",
    "/metrics",
    "/api/v1/auth/login",
    "/api/v1/issuers",
    "/api/v1/documents",
    "/api/v1/reviews/cases",
    "/api/v1/blockchain/documents/versions/{version_id}/verify",
    "/api/v1/storage/ipfs/documents/versions/{version_id}/verify",
    "/api/v1/documents/versions/{version_id}/signatures/verify",
    "/api/v1/storage/ipfs/documents/versions/{version_id}/pin",
    "/api/v1/public-verification/{token}",
}
CORE_DEPENDENCIES = {"postgresql", "redis", "clamav", "ipfs"}
STRICT_DEPENDENCIES = CORE_DEPENDENCIES | {"fabric_gateway"}


def get(url: str, timeout: float) -> tuple[int, bytes, str]:
    request = urllib.request.Request(url, headers={"Accept": "application/json, text/plain"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(2_000_000), response.headers.get_content_type()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(2_000_000), exc.headers.get_content_type()


def check_endpoint(base_url: str, path: str, timeout: float) -> dict[str, Any]:
    started = time.perf_counter()
    status, body, content_type = get(f"{base_url}{path}", timeout)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    parsed: Any = None
    if "json" in content_type:
        try:
            parsed = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            parsed = None
    return {
        "path": path,
        "http_status": status,
        "latency_ms": elapsed_ms,
        "json": parsed,
        "body_bytes": len(body),
        "contains_gdivs_metrics": b"gdivs_" in body,
    }


def run(base_url: str, timeout: float, strict: bool, require_core: bool = False) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    for path in ("/health", "/ready", "/health/dependencies", "/health/workers", "/metrics", "/openapi.json"):
        try:
            checks.append(check_endpoint(base_url, path, timeout))
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            checks.append({"path": path, "error": type(exc).__name__, "message": str(exc)[:240]})

    by_path = {item["path"]: item for item in checks}
    liveness = by_path.get("/health", {})
    readiness = by_path.get("/ready", {})
    deps = by_path.get("/health/dependencies", {})
    workers = by_path.get("/health/workers", {})
    metrics = by_path.get("/metrics", {})
    openapi = by_path.get("/openapi.json", {})
    paths = (openapi.get("json") or {}).get("paths", {})
    missing_paths = sorted(REQUIRED_PATHS - set(paths) - {"/health", "/ready", "/health/dependencies", "/metrics"})
    dependency_map = (deps.get("json") or {}).get("dependencies", {})
    missing_dependencies = sorted(STRICT_DEPENDENCIES - set(dependency_map))
    failed_dependencies = sorted(name for name, ok in dependency_map.items() if ok is not True)

    gates = {
        "api_liveness": liveness.get("http_status") == 200 and (liveness.get("json") or {}).get("status") == "ok",
        "database_readiness": readiness.get("http_status") == 200 and (readiness.get("json") or {}).get("status") == "ready",
        "dependency_endpoint": deps.get("http_status") == 200,
        "metrics_endpoint": metrics.get("http_status") == 200 and metrics.get("contains_gdivs_metrics") is True,
        "openapi_available": openapi.get("http_status") == 200 and isinstance(paths, dict),
        "required_routes_present": not missing_paths,
    }
    if require_core or strict:
        gates["celery_worker_responsive"] = workers.get("http_status") == 200 and (workers.get("json") or {}).get("status") == "healthy" and bool((workers.get("json") or {}).get("workers"))
        required_dependencies = STRICT_DEPENDENCIES if strict else CORE_DEPENDENCIES
        missing_required = sorted(required_dependencies - set(dependency_map))
        failed_required = sorted(name for name in required_dependencies if dependency_map.get(name) is not True)
        gates["required_dependencies_present"] = not missing_required
        gates["required_dependencies_healthy"] = not failed_required
    else:
        missing_required = []
        failed_required = []

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "mode": "strict" if strict else ("core" if require_core else "smoke"),
        "gates": gates,
        "missing_routes": missing_paths,
        "missing_strict_dependencies": missing_dependencies,
        "missing_required_dependencies": missing_required,
        "unhealthy_dependencies": failed_dependencies,
        "unhealthy_required_dependencies": failed_required,
        "dependency_status": dependency_map,
        "endpoint_checks": checks,
        "passed": all(gates.values()),
        "scope_note": "Deployment smoke checks only; not proof of the 13 mandatory end-to-end acceptance scenarios.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="GDI-VS API base URL")
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--require-core-dependencies", action="store_true", help="Require PostgreSQL, Redis, ClamAV and IPFS health; Fabric remains a separate profile")
    parser.add_argument("--strict", action="store_true", help="Require PostgreSQL, Redis, ClamAV, IPFS and Fabric Gateway health")
    parser.add_argument("--output", type=Path, help="Optional JSON report destination")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    base_url = args.base_url.rstrip("/")
    if args.strict and args.require_core_dependencies:
        parser.error("--strict and --require-core-dependencies are mutually exclusive")
    report = run(base_url, args.timeout, args.strict, args.require_core_dependencies)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
