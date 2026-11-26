#!/usr/bin/env python3
"""Run a group-disjoint synthetic-only comparison of unsupervised baselines."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services_model_governance import (  # noqa: E402
    LABELS, compare_unsupervised_baselines, group_holdout_split, validate_dataset_records,
)
from app.services_synthetic_anomaly_data import generate_synthetic_records  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/synthetic-anomaly-benchmark.json")
    parser.add_argument("--seed", type=int, default=20261116)
    parser.add_argument("--families", type=int, default=80)
    args = parser.parse_args()

    records = generate_synthetic_records(seed=args.seed, families=args.families)
    dataset_summary = validate_dataset_records(records)
    train_indices, test_indices = group_holdout_split(records, random_state=args.seed)
    train = [records[index] for index in train_indices]
    test = [records[index] for index in test_indices]
    normal_train = [row for row in train if row.label == "NORMAL"]
    if len(normal_train) < 20:
        raise RuntimeError("Insufficient normal-only training records")
    result = compare_unsupervised_baselines(
        [row.features for row in normal_train],
        [row.features for row in test],
        [LABELS[row.label] for row in test],
        training_labels=[0] * len(normal_train), random_state=args.seed,
    )
    for model_result in result["models"].values():
        model_result.pop("predictions", None)
        model_result.pop("scores", None)
    result.update({
        "dataset": "SYNTHETIC_TEST_ONLY",
        "dataset_summary": dataset_summary,
        "seed": args.seed,
        "train_groups": sorted({row.group_id for row in train}),
        "test_groups": sorted({row.group_id for row in test}),
        "normal_only_training_samples": len(normal_train),
        "test_label_counts": {
            "normal": sum(row.label == "NORMAL" for row in test),
            "anomalous": sum(row.label == "ANOMALOUS" for row in test),
        },
        "limitations": [
            "All records are generated numeric feature fixtures, not actual government documents.",
            "Injected anomalies are intentionally simplified and may be easier to detect than real tampering.",
            "Metrics are a pipeline sanity check only and must not be cited as operational performance.",
            "No production threshold, model selection or deployment approval is implied.",
        ],
    })
    if set(result["train_groups"]) & set(result["test_groups"]):
        raise RuntimeError("Group leakage detected")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "models": result["models"],
                      "train_samples": len(normal_train), "test_samples": len(test)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
