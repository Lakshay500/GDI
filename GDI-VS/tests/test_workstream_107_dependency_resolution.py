import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_dependency_resolution_report_is_honest_and_machine_readable():
    report = json.loads((ROOT / "security/reports/workstream-107-dependency-resolution.json").read_text())
    assert report["version"] == (ROOT / "VERSION").read_text().strip()
    assert report["status"] == "blocked"
    assert report["production_approved"] is False
    assert report["production_build_verified"] is False
    assert report["browser_acceptance_verified"] is False
    assert report["lockfiles"]["blockchain/evidence-verifier/go.sum"]["status"] == "not_required"


def test_workstream_107_documents_all_four_missing_lockfiles():
    doc = (ROOT / "docs/release/workstream-107-dependency-resolution.md").read_text()
    for path in ("frontend/package-lock.json", "backend/uv.lock", "blockchain/gateway/go.sum", "blockchain/chaincode/gdi-document-contract/go.sum"):
        assert path in doc
    assert "No dependency lockfile was fabricated" in doc
