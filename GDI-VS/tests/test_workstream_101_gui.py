from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_sidebar_can_collapse_and_expand_with_accessible_control():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    css = (ROOT / "frontend/src/styles.css").read_text(encoding="utf-8")
    assert "sidebarCollapsed" in app
    assert "gdivs.sidebar-collapsed" in app
    assert "Collapse navigation" in app and "Expand navigation" in app
    assert "aria-pressed={sidebarCollapsed}" in app
    assert "aria-label={label} title={label}" in app
    assert ".sidebar-collapsed .main-area{margin-left:82px}" in css
    assert "@media(max-width:700px)" in css


def test_sidebar_preference_is_persisted_and_mobile_navigation_is_restored():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    css = (ROOT / "frontend/src/styles.css").read_text(encoding="utf-8")
    assert "localStorage.getItem('gdivs.sidebar-collapsed')" in app
    assert "localStorage.setItem('gdivs.sidebar-collapsed'" in app
    assert ".sidebar-collapsed .nav-label{display:inline}" in css
    assert ".sidebar-collapsed .primary-navigation{display:flex}" in css
