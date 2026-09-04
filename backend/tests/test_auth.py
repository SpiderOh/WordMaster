from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.models import AuthToken, Base, User
from app.db.session import get_db
from app.main import create_app


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'auth.db'}", connect_args={"check_same_thread": False})
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with testing_session() as session:
        yield session


@pytest.fixture()
def client(db_session):
    app = create_app()

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_local_mode_allows_protected_routes_without_token(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "local")
    assert client.get("/api/v1/settings").status_code == 200


def test_server_mode_login_protects_routes_and_logout_revokes_token(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "server")
    db_session.add(User(id=1, username="owner", password_hash=hash_password("correct horse")))
    db_session.commit()

    assert client.get("/api/v1/settings").status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "owner", "password": "wrong"}).status_code == 401
    login = client.post("/api/v1/auth/login", json={"username": "owner", "password": "correct horse"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"
    assert client.get("/api/v1/settings", headers=headers).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/settings", headers=headers).status_code == 401
    assert db_session.query(AuthToken).filter_by(revoked=True).count() == 1


def test_expired_token_is_rejected(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "server")
    user = User(id=1, username="owner", password_hash=hash_password("secret123"))
    db_session.add(user)
    db_session.commit()
    token, record = create_access_token(user_id=user.id, expires_delta=timedelta(seconds=-1))
    db_session.add(record)
    db_session.commit()

    response = client.get("/api/v1/settings", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Token expired"
