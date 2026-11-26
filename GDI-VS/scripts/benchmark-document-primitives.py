#!/usr/bin/env python3
"""Reproducible local microbenchmarks for hashing and feature extraction."""
from __future__ import annotations
import argparse
import hashlib
import json
import statistics
import time
from datetime import datetime, timezone

from app.services_anomaly_detection import build_document_features


def measure(fn, repeats: int) -> dict[str, float]:
    samples = []
    for _ in range(repeats):
        start = time.perf_counter()
        fn()
        samples.append(time.perf_counter() - start)
    return {"mean_ms": statistics.fmean(samples) * 1000,
            "p95_ms": sorted(samples)[max(0, int(len(samples) * .95 + .999) - 1)] * 1000,
            "min_ms": min(samples) * 1000}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size-mib", type=int, default=5)
    parser.add_argument("--repeats", type=int, default=30)
    parser.add_argument("--output", default="document-primitives-benchmark.json")
    args = parser.parse_args()
    if args.size_mib < 1 or args.repeats < 1:
        parser.error("size-mib and repeats must be positive")
    payload = b"GDI-VS benchmark payload\n" * ((args.size_mib * 1024 * 1024) // 25 + 1)
    extraction = {"pages": [{"text": ("Government document verification sample 123456789 ABC\n" * 300),
                             "text_source": "EMBEDDED_TEXT"} for _ in range(4)],
                  "structured_fields": {"fields": {"issue_date": {"status": "CANDIDATE"}}},
                  "schema_validation": {"findings": []}}
    hashing = measure(lambda: hashlib.sha256(payload).digest(), args.repeats)
    feature = measure(lambda: build_document_features(extraction), args.repeats)
    report = {"schema": "gdi-vs-document-primitives-1.0",
              "generated_at": datetime.now(timezone.utc).isoformat(),
              "runtime": {"python_payload_bytes": len(payload), "repeats": args.repeats},
              "sha256": {**hashing, "throughput_mib_s": round((len(payload) / (1024 * 1024)) /
                         (hashing["mean_ms"] / 1000), 3)},
              "feature_engineering": feature,
              "limitations": ["Synthetic in-memory input; not a full upload/OCR pipeline benchmark.",
                              "Results depend on CPU, Python, dependencies and host load."]}
    with open(args.output, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
