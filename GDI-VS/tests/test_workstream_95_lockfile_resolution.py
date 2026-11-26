from __future__ import annotations
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('resolve_dependency_lockfiles', ROOT / 'scripts/resolve-dependency-locks.py')
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_resolver_covers_all_four_required_lockfiles():
    assert {name for name, _, _ in MODULE.COMMANDS} == set(MODULE.EXPECTED)
    assert MODULE.EXPECTED['frontend/npm'] == 'frontend/package-lock.json'
    assert MODULE.EXPECTED['backend/uv'] == 'backend/uv.lock'
    assert MODULE.EXPECTED['blockchain/gateway/go'] == 'blockchain/gateway/go.sum'
    assert MODULE.EXPECTED['blockchain/chaincode/go'] == 'blockchain/chaincode/gdi-document-contract/go.sum'


def test_resolver_does_not_invent_or_write_lockfile_contents():
    source = (ROOT / 'scripts/resolve-dependency-locks.py').read_text()
    assert '["npm", "install"' in source and '["uv", "lock"]' in source and '["go", "mod", "tidy"]' in source
    assert 'write_text(json.dumps(payload' in source
    assert 'base64' not in source and 'fake' not in source.lower()


def test_timeout_is_bounded_by_cli_contract():
    assert 'between 5 and 600 seconds' in (ROOT / 'scripts/resolve-dependency-locks.py').read_text()
