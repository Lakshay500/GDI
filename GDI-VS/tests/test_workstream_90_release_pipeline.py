from __future__ import annotations
import importlib.util
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('build_release', ROOT / 'scripts/build-release.py')
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_release_source_filter_excludes_secrets_and_build_caches(tmp_path):
    (tmp_path / 'app').mkdir()
    (tmp_path / 'node_modules').mkdir()
    (tmp_path / 'app' / 'main.py').write_text('ok')
    (tmp_path / 'app' / '.env').write_text('SECRET=never')
    (tmp_path / 'node_modules' / 'pkg.js').write_text('cache')
    files = list(MODULE.source_files(tmp_path))
    assert [relative.as_posix() for _, relative in files] == ['app/main.py']


def test_release_zip_has_stable_order_and_metadata(tmp_path):
    (tmp_path / 'b.txt').write_text('b')
    (tmp_path / 'a.txt').write_text('a')
    files = list(MODULE.source_files(tmp_path))
    first, second = tmp_path / 'one.zip', tmp_path / 'two.zip'
    MODULE.write_zip(first, files, 'GDI-VS')
    MODULE.write_zip(second, files, 'GDI-VS')
    assert first.read_bytes() == second.read_bytes()
    with zipfile.ZipFile(first) as archive:
        assert archive.namelist() == ['GDI-VS/a.txt', 'GDI-VS/b.txt']
        assert all(info.date_time == MODULE.FIXED_TIME for info in archive.infolist())


def test_debug_snapshot_is_present_and_nonempty():
    files = list(MODULE.source_files(ROOT))
    debug = [(p, r) for p, r in files if r.parts and r.parts[0] == 'Debug' and len(r.parts) > 1]
    assert len(debug) >= 200


def test_release_version_metadata_is_current():
    assert (ROOT / 'VERSION').read_text().strip() == '1.0.1'
    assert '1.0.1' in (ROOT / 'backend/pyproject.toml').read_text()
    assert '1.0.1' in (ROOT / 'backend/app/version.py').read_text()
    assert '"version": "1.0.1"' in (ROOT / 'frontend/package.json').read_text()
