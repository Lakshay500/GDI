#!/usr/bin/env python3
"""Generate reproducible synthetic-only GDI-VS anomaly fixtures."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services_model_governance import validate_dataset_records  # noqa: E402
from app.services_synthetic_anomaly_data import feature_csv_row, generate_synthetic_records  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "data/synthetic/anomaly-features.csv")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/synthetic/manifest.json")
    parser.add_argument("--seed", type=int, default=20261116)
    parser.add_argument("--families", type=int, default=80)
    parser.add_argument("--records-per-family", type=int, default=10)
    args = parser.parse_args()

    records = generate_synthetic_records(seed=args.seed, families=args.families,
                                         records_per_family=args.records_per_family)
    summary = validate_dataset_records(records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    rows = [feature_csv_row(record) for record in records]
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    manifest = {
        "dataset_name": "gdi-vs-synthetic-anomaly-fixtures",
        "dataset_version": "0.1.0",
        "seed": args.seed,
        "records": len(records),
        "families": args.families,
        "records_per_family": args.records_per_family,
        "feature_schema_version": summary["feature_schema_version"],
        "source_types": ["SYNTHETIC_TEST"],
        "summary": summary,
        "intended_use": "Pipeline development and reproducibility tests only",
        "prohibited_use": [
            "Real-world accuracy or efficacy claims",
            "Government-document fraud prevalence estimation",
            "Production model approval or deployment",
            "Substitution for an authorised representative corpus",
        ],
        "generation_method": "Seeded synthetic numeric feature distributions with injected anomaly-like signals",
        "files": {"features_csv": str(args.output.relative_to(ROOT))},
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"csv": str(args.output), "manifest": str(args.manifest), **summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
