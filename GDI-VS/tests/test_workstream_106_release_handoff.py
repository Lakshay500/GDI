from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_readme_current_version_matches_release_manifest():
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert f"**Version:** {version}" in readme


def test_production_handoff_documents_blockers_and_acceptance():
    handoff = (ROOT / "docs/release/workstream-106-production-readiness-handoff.md").read_text(encoding="utf-8")
    for required in ("DEVELOPMENT — NOT PRODUCTION APPROVED", "npm ci", "docker compose up --build -d", "playwright", "PostgreSQL", "IPFS", "Fabric"):
        assert required in handoff


def test_debug_status_matches_release_baseline():
    status = (ROOT / "Debug/STATUS-workstream-106.md").read_text(encoding="utf-8")
    assert "GDI-VS 1.0.0" in status
    assert "Production release remains blocked" in status
