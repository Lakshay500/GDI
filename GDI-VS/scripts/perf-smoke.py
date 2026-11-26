#!/usr/bin/env python3
"""Small standard-library HTTP load probe for GDI-VS operational endpoints.

This is a smoke/load generator, not a substitute for production workload modelling.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import statistics
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(p * len(ordered)) - 1))
    return ordered[index]


def probe(url: str, timeout: float) -> tuple[float, int, str | None]:
    started = time.perf_counter()
    request = urllib.request.Request(url, headers={"User-Agent": "gdi-vs-perf-smoke/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(4096)
            status = response.status
            error = None if 200 <= status < 400 else f"HTTP_{status}"
    except urllib.error.HTTPError as exc:
        status, error = exc.code, f"HTTP_{exc.code}"
    except Exception as exc:  # report class only; avoid leaking URLs or credentials
        status, error = 0, type(exc).__name__
    return (time.perf_counter() - started) * 1000, status, error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=300)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--output", default="performance-smoke.json")
    args = parser.parse_args()
    if args.requests < 1 or args.concurrency < 1 or args.timeout <= 0:
        parser.error("requests, concurrency and timeout must be positive")

    base = args.base_url.rstrip("/")
    targets = [f"{base}/health", f"{base}/ready", f"{base}/metrics"]
    started = time.perf_counter()
    samples: list[tuple[float, int, str | None]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(probe, targets[i % len(targets)], args.timeout)
                   for i in range(args.requests)]
        for future in concurrent.futures.as_completed(futures):
            samples.append(future.result())
    elapsed = time.perf_counter() - started
    latencies = [sample[0] for sample in samples]
    errors = Counter(sample[2] for sample in samples if sample[2])
    statuses = Counter(str(sample[1]) for sample in samples)
    report = {
        "schema": "gdi-vs-performance-smoke-1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base,
        "workload": {"requests": args.requests, "concurrency": args.concurrency,
                     "timeout_seconds": args.timeout, "targets": ["/health", "/ready", "/metrics"]},
        "results": {"completed_requests": len(samples), "duration_seconds": round(elapsed, 4),
                    "throughput_requests_per_second": round(len(samples) / elapsed, 3) if elapsed else 0,
                    "latency_ms": {"min": round(min(latencies), 3),
                                   "mean": round(statistics.fmean(latencies), 3),
                                   "p50": round(percentile(latencies, .50), 3),
                                   "p95": round(percentile(latencies, .95), 3),
                                   "p99": round(percentile(latencies, .99), 3),
                                   "max": round(max(latencies), 3)},
                    "http_status_counts": dict(statuses), "errors": dict(errors)},
        "limitations": ["Only unauthenticated health, readiness and metrics endpoints are exercised.",
                        "This probe does not model uploads, OCR, database write contention, IPFS or Fabric.",
                        "Results are environment-specific and are not production capacity claims."],
    }
    with open(args.output, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
