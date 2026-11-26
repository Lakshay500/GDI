from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_macos_sequoia_guide_covers_setup_and_daily_use():
    guide = ROOT / "docs/deployment/macos-sequoia-setup-and-user-guide.md"
    content = guide.read_text()
    for required in (
        "Docker Desktop", "Node.js 22", "docker compose up --build -d",
        "scripts_bootstrap_admin.py", "npm run dev", "Overview", "Issuers",
        "Documents", "Reviews", "Public verification", "docker compose down -v",
        "development/integration", "package-lock.json",
    ):
        assert required in content


def test_technology_stack_matches_declared_manifests():
    stack = (ROOT / "docs/architecture/technology-stack.md").read_text()
    package = (ROOT / "frontend/package.json").read_text()
    pyproject = (ROOT / "backend/pyproject.toml").read_text()
    compose = (ROOT / "docker-compose.yml").read_text()
    for technology in ("React 18.3.1", "TypeScript 5.7.3", "Vite 5.4.14", "Playwright 1.56.1"):
        assert technology in stack
    for dependency in ("fastapi", "SQLAlchemy", "psycopg", "celery", "scikit-learn", "cryptography"):
        assert dependency in pyproject
    for service in ("postgres:17", "redis:7.4", "ipfs/kubo:v0.32.1", "clamav/clamav"):
        assert service in compose
    assert '"react": "18.3.1"' in package


def test_admin_bootstrap_script_is_in_backend_image():
    dockerfile = (ROOT / "backend/Dockerfile").read_text()
    assert "COPY scripts_bootstrap_admin.py ./scripts_bootstrap_admin.py" in dockerfile


def test_readme_links_new_setup_and_stack_guides():
    readme = (ROOT / "README.md").read_text()
    assert "docs/deployment/macos-sequoia-setup-and-user-guide.md" in readme
    assert "docs/architecture/technology-stack.md" in readme
