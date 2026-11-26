from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_frontend_accessibility_source_audit_passes():
    result = subprocess.run(
        [sys.executable, str(ROOT / 'scripts/audit-frontend-accessibility.py')],
        cwd=ROOT, capture_output=True, text=True, timeout=45,
    )
    assert result.returncode == 0, result.stderr + result.stdout
    report = json.loads(result.stdout)
    assert report['status'] == 'passed'
    assert report['counts']['form_controls'] >= 1
    assert report['counts']['buttons'] >= 1
    assert report['issue_count'] == 0


def test_accessibility_audit_is_wired_into_frontend_ci_and_release():
    ci = (ROOT / '.github/workflows/ci.yml').read_text()
    release = (ROOT / '.github/workflows/release.yml').read_text()
    package = json.loads((ROOT / 'frontend/package.json').read_text())
    assert package['scripts']['audit:a11y'] == 'python ../scripts/audit-frontend-accessibility.py'
    assert 'npm run audit:a11y' in ci
    assert 'npm run audit:a11y' in release
