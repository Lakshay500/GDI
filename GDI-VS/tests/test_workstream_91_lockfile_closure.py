from __future__ import annotations
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('check_dependency_locks', ROOT / 'scripts/check-dependency-locks.py')
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_evidence_verifier_standard_library_module_needs_no_go_sum():
    mod = (ROOT / 'blockchain/evidence-verifier/go.mod').read_text()
    assert 'require ' not in mod and 'require(' not in mod
    assert 'blockchain/evidence-verifier' in MODULE.STANDARD_LIBRARY_ONLY


def test_missing_lockfile_is_blocked(tmp_path):
    assert MODULE.validate_lockfile('frontend/npm', tmp_path / 'package-lock.json') == ['missing or empty']


def test_valid_npm_lockfile_must_match_manifest(tmp_path, monkeypatch):
    manifest = {'name': 'sample', 'version': '1.2.3'}
    (tmp_path / 'frontend').mkdir()
    manifest_path = tmp_path / 'frontend/package.json'
    manifest_path.write_text(json.dumps(manifest))
    monkeypatch.setattr(MODULE, 'ROOT', tmp_path)
    lock = tmp_path / 'package-lock.json'
    lock.write_text(json.dumps({'lockfileVersion': 3, 'packages': {'': manifest}}))
    assert MODULE.validate_lockfile('frontend/npm', lock) == []


def test_npm_lockfile_version_mismatch_is_rejected(tmp_path, monkeypatch):
    (tmp_path / 'frontend').mkdir()
    (tmp_path / 'frontend/package.json').write_text(json.dumps({'name': 'app', 'version': '1.0.0'}))
    monkeypatch.setattr(MODULE, 'ROOT', tmp_path)
    lock = tmp_path / 'lock.json'
    lock.write_text(json.dumps({'lockfileVersion': 3, 'packages': {'': {'name': 'app', 'version': '0.9.0'}}}))
    assert any('version does not match' in item for item in MODULE.validate_lockfile('frontend/npm', lock))


def test_uv_lock_must_contain_resolved_packages(tmp_path):
    lock = tmp_path / 'uv.lock'
    lock.write_text('version = 1\nrequires-python = ">=3.12"\n')
    assert 'uv lock contains no resolved packages' in MODULE.validate_lockfile('backend/uv', lock)


def test_go_sum_requires_valid_hash_syntax(tmp_path):
    lock = tmp_path / 'go.sum'
    lock.write_text('example.com/mod v1.0.0 h1:invalid\n')
    assert any('invalid go.sum entry' in item for item in MODULE.validate_lockfile('blockchain/gateway/go', lock))


def test_go_sum_accepts_sha256_base64_hash(tmp_path):
    lock = tmp_path / 'go.sum'
    lock.write_text('example.com/mod v1.0.0 h1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n')
    assert MODULE.validate_lockfile('blockchain/gateway/go', lock) == []
