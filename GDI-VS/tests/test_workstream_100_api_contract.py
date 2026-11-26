from fastapi.testclient import TestClient


def test_api_liveness_is_independent_of_database_readiness():
    from app.main import app

    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "gdi-vs-api"}


def test_openapi_exposes_core_frontend_integration_routes():
    from app.main import app

    paths = app.openapi()["paths"]
    expected = {
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/issuers",
        "/api/v1/documents",
        "/api/v1/reviews/cases",
        "/api/v1/public-verification/links",
    }
    assert expected.issubset(paths)
    assert "post" in paths["/api/v1/auth/login"]
    assert "get" in paths["/api/v1/auth/me"]
    assert "post" in paths["/api/v1/documents"]
