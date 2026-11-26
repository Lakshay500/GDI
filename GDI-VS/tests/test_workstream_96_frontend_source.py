from __future__ import annotations
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def test_frontend_source_preflight_passes_offline():
    result = subprocess.run(
        [sys.executable, str(ROOT / 'scripts/check-frontend-source.py')],
        cwd=ROOT, capture_output=True, text=True, timeout=45,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report['status'] == 'passed'
    assert report['source_files'] == 3
    assert report['semantic_typecheck'] == 'not_performed'
    assert report['vite_production_build'] == 'not_performed'


def test_date_formatter_accepts_string_or_date_without_invalid_constructor_union():
    source = (ROOT / 'frontend/src/i18n.tsx').read_text(encoding='utf-8')
    assert '.format(input instanceof Date ? input : new Date(input))' in source


def test_frontend_build_keeps_typecheck_before_vite_bundle():
    package = json.loads((ROOT / 'frontend/package.json').read_text(encoding='utf-8'))
    assert package['scripts']['build'] == 'tsc -b && vite build'
    assert package['scripts']['typecheck'] == 'tsc -b --pretty false'
    assert package['scripts']['check:source'] == 'python ../scripts/check-frontend-source.py'
