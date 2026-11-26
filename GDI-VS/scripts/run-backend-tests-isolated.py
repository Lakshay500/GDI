#!/usr/bin/env python3
"""Run each backend test module in a fresh pytest process and emit an acceptance report."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
SUMMARY = re.compile(r"(?P<passed>\d+) passed(?:, (?P<failed>\d+) failed)?(?:, (?P<errors>\d+) errors?)?.* in (?P<seconds>[0-9.]+)s")


def discover_test_files(test_dir: Path = BACKEND / "tests") -> list[Path]:
    return sorted(path for path in test_dir.glob("test_*.py") if path.is_file())


def parse_summary(output: str) -> dict[str, int | float] | None:
    for line in reversed(output.splitlines()):
        match = SUMMARY.search(line)
        if match:
            return {
                "passed": int(match.group("passed")),
                "failed": int(match.group("failed") or 0),
                "errors": int(match.group("errors") or 0),
                "seconds": float(match.group("seconds")),
            }
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=int, default=90, help="Per-module timeout in seconds")
    parser.add_argument("--report", type=Path, default=ROOT / "artifacts/backend-test-isolation-v0.94.0.json")
    parser.add_argument("--fail-fast", action="store_true")
    parser.add_argument("--module", action="append", default=[], help="Run only a named test module (repeatable)")
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")

    env = os.environ.copy()
    for name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[name] = "1"

    modules = discover_test_files()
    if args.module:
        requested = set(args.module)
        modules = [path for path in modules if path.name in requested or path.stem in requested]
        missing = requested - {path.name for path in modules} - {path.stem for path in modules}
        if missing:
            parser.error("Unknown backend test module(s): " + ", ".join(sorted(missing)))
    if not modules:
        print("No backend test modules found.", file=sys.stderr)
        return 2

    results = []
    started = time.monotonic()
    args.report.parent.mkdir(parents=True, exist_ok=True)

    def write_report(final: bool = False) -> dict:
        passed_modules = sum(item["status"] == "passed" for item in results)
        nonpassing_modules = len(results) - passed_modules
        totals = {
            "passed": sum((item.get("summary") or {}).get("passed", 0) for item in results),
            "failed": sum((item.get("summary") or {}).get("failed", 0) for item in results),
            "errors": sum((item.get("summary") or {}).get("errors", 0) for item in results),
        }
        report = {
            "schema": "gdi-vs-backend-test-isolation/v2",
            "python": sys.version.split()[0],
            "module_count": len(modules), "executed_module_count": len(results),
            "remaining_module_count": len(modules) - len(results),
            "passed_module_count": passed_modules, "nonpassing_module_count": nonpassing_modules,
            "test_totals": totals,
            "duration_seconds": round(time.monotonic() - started, 3),
            "status": ("passed" if nonpassing_modules == 0 and len(results) == len(modules)
                       else "incomplete_or_failed" if final else "in_progress"),
            "modules": results,
        }
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return report

    write_report()
    for index, module in enumerate(modules, 1):
        relative = module.relative_to(ROOT).as_posix()
        command = [sys.executable, "-m", "pytest", "-q", str(module)]
        print(f"[{index}/{len(modules)}] {relative}", flush=True)
        module_started = time.monotonic()
        try:
            with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as output_file:
                process = subprocess.Popen(
                    command, cwd=BACKEND, env=env, text=True,
                    stdout=output_file, stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                try:
                    process.wait(timeout=args.timeout)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                    output_file.seek(0)
                    partial = output_file.read()
                    raise subprocess.TimeoutExpired(command, args.timeout, output=partial)
                output_file.seek(0)
                output = output_file.read()
            summary = parse_summary(output)
            status = "passed" if process.returncode == 0 and summary and summary["failed"] == 0 and summary["errors"] == 0 else "failed"
            result = {
                "module": relative, "status": status, "return_code": process.returncode,
                "duration_seconds": round(time.monotonic() - module_started, 3),
                "summary": summary,
            }
            if status != "passed":
                result["output_tail"] = output[-6000:]
        except subprocess.TimeoutExpired as exc:
            partial = exc.stdout or ""
            if isinstance(partial, bytes):
                partial = partial.decode("utf-8", errors="replace")
            result = {
                "module": relative, "status": "timeout", "return_code": None,
                "duration_seconds": round(time.monotonic() - module_started, 3),
                "summary": None, "output_tail": partial[-6000:],
            }
        results.append(result)
        write_report()
        print(f"  {result['status']} ({result['duration_seconds']:.2f}s)", flush=True)
        if result["status"] != "passed" and args.fail_fast:
            break

    report = write_report(final=True)
    print(json.dumps({key: report[key] for key in ("status", "module_count", "executed_module_count", "passed_module_count", "nonpassing_module_count", "test_totals", "duration_seconds")}, indent=2))
    print(f"Report: {args.report}")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
