from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_dashboard_document_finder_is_accessible_and_live_filtered():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    css = (ROOT / "frontend/src/styles.css").read_text(encoding="utf-8")
    assert 'aria-label="Search documents"' in app
    assert "matchingDocuments=useMemo" in app
    assert "document-finder" in app
    assert ".finder-input:focus-within" in css


def test_gui_search_is_scoped_to_loaded_organisation_records():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    assert "const matchingDocuments=useMemo" in app
    assert "documents].filter" in app
    assert "onOpenDocument(row)" in app
