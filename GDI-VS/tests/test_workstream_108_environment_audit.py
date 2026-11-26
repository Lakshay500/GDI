import json
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_audit_module():
    spec = importlib.util.spec_from_file_location("ws108_audit", ROOT / "scripts/workstream-108-environment-audit.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_environment_audit_is_machine_readable_and_scoped():
    report = json.loads((ROOT / "security/reports/workstream-108-environment-audit.json").read_text())
    assert report["version"] == (ROOT / "VERSION").read_text().strip()
    assert report["status"] in {"ready_for_build", "blocked"}
    assert "does not install dependencies" in report["scope_note"]
    assert set(report["lockfiles"]) == {
        "frontend/package-lock.json", "backend/uv.lock",
        "blockchain/gateway/go.sum", "blockchain/chaincode/gdi-document-contract/go.sum",
    }


def test_dns_failure_does_not_leak_resolver_details():
    module = load_audit_module()
    class BrokenSocket:
        SOCK_STREAM = 1
        @staticmethod
        def getaddrinfo(*args, **kwargs):
            raise OSError("private resolver detail")
    original = module.socket
    module.socket = BrokenSocket
    try:
        result = module.registry_dns()
    finally:
        module.socket = original
    assert result == {"resolves": False, "error_type": "OSError"}
