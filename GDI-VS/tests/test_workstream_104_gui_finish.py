from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "frontend/src/styles.css").read_text()
APP = (ROOT / "frontend/src/App.tsx").read_text()

def test_gui_finish_has_responsive_and_accessible_focus_treatment():
    assert "prefers-reduced-motion:reduce" in CSS
    assert "focus-visible" in CSS
    assert "@media(max-width:700px)" in CSS

def test_gui_keeps_document_and_governance_workspaces():
    for label in ["documents", "issuers", "reviews", "credentials", "links", "history"]:
        assert f"'{label}'" in APP

def test_gui_finish_includes_table_and_empty_state_polish():
    assert "table-wrap{max-width:100%;overflow:auto" in CSS
    assert ".empty{" in CSS
    assert ".qr-result{" in CSS
