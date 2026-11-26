from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_playwright_suite_covers_entry_workflows():
    source = (ROOT / "frontend/e2e/login.spec.ts").read_text()
    for expected in (
        "sign-in form with labelled required controls",
        "skip link",
        "switches the sign-in interface to Hindi",
        "empty sign-in form",
    ):
        assert expected in source


def test_playwright_config_uses_local_vite_server_and_chromium():
    config = (ROOT / "frontend/playwright.config.ts").read_text()
    assert "Desktop Chrome" in config
    assert "npm run preview" in config
    assert "strictPort" in config


def test_login_form_is_keyboard_focusable_for_skip_link():
    app = (ROOT / "frontend/src/App.tsx").read_text()
    assert 'id="login-form" className="login-card" tabIndex={-1}' in app


def test_browser_acceptance_artifact_does_not_claim_execution():
    report = json.loads((ROOT / "artifacts/frontend-browser-acceptance-v0.96.0.json").read_text())
    assert report["tests_authored"] == 7
    assert report["browser_tests_executed"] == 0
    assert report["execution_status"] == "blocked"
