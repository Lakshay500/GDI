from pathlib import Path
import importlib.util

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/run-backend-tests-isolated.py"
spec = importlib.util.spec_from_file_location("backend_test_isolation", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def test_discovery_is_sorted_and_limited_to_test_modules(tmp_path):
    (tmp_path / "test_zeta.py").write_text("def test_z(): pass\n")
    (tmp_path / "test_alpha.py").write_text("def test_a(): pass\n")
    (tmp_path / "helper.py").write_text("# not a test module\n")
    assert [p.name for p in module.discover_test_files(tmp_path)] == ["test_alpha.py", "test_zeta.py"]


def test_summary_parser_extracts_pass_fail_and_duration():
    parsed = module.parse_summary("2 passed, 1 failed, 1 error in 3.25s")
    assert parsed == {"passed": 2, "failed": 1, "errors": 1, "seconds": 3.25}


def test_summary_parser_returns_none_when_pytest_did_not_finish():
    assert module.parse_summary("collected 4 items\\n..") is None
