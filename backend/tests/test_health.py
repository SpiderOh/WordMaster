from fastapi.testclient import TestClient

from app.main import create_app


def test_health_check_returns_status_and_version():
    client = TestClient(create_app())

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert isinstance(response.json()["version"], str)
    assert response.json()["version"]
