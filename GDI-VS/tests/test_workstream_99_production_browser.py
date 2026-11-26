from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_playwright_uses_production_preview_server():
    config = (ROOT / 'frontend/playwright.config.ts').read_text()
    assert "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort" in config
    assert 'npm run dev' not in config


def test_browser_suite_covers_negative_auth_locale_and_public_verification():
    tests = (ROOT / 'frontend/e2e/login.spec.ts').read_text()
    assert 'shows an accessible error when the API rejects credentials' in tests
    assert 'persists the selected locale after a reload' in tests
    assert 'safe unavailable state for an unknown public verification token' in tests


def test_ci_builds_before_running_browser_acceptance():
    workflow = (ROOT / '.github/workflows/ci.yml').read_text()
    browser_job = workflow.split('  browser:', 1)[1]
    assert browser_job.index('npm run build') < browser_job.index('playwright install') < browser_job.index('npm run test:e2e')


def test_release_workflow_runs_browser_acceptance_after_build():
    workflow = (ROOT / '.github/workflows/release.yml').read_text()
    assert workflow.index('npm run build') < workflow.index('npm run test:e2e')
