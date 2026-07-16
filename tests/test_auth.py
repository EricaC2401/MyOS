from __future__ import annotations

import importlib

from fastapi.testclient import TestClient

from src.auth import hash_password


def build_client(monkeypatch) -> TestClient:
    monkeypatch.setenv("APP_PASSWORD_HASH", hash_password("secret123"))
    monkeypatch.setenv("APP_SESSION_SECRET", "test-session-secret")
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    monkeypatch.setenv("ALLOW_BROWSER_DB_SETUP", "false")

    import api.main

    importlib.reload(api.main)
    return TestClient(api.main.create_app())


def test_auth_status_requires_login_when_enabled(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.get("/api/auth/status")

    assert response.status_code == 200
    assert response.json() == {"enabled": True, "authenticated": False}


def test_protected_routes_reject_unauthenticated_requests(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.get("/api/health")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


def test_login_logout_flow(monkeypatch) -> None:
    client = build_client(monkeypatch)

    bad_login = client.post("/api/auth/login", json={"password": "wrong"})
    assert bad_login.status_code == 401

    good_login = client.post("/api/auth/login", json={"password": "secret123"})
    assert good_login.status_code == 200
    assert good_login.json()["authenticated"] is True

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["authenticated"] is True

    protected = client.get("/api/health")
    assert protected.status_code == 200
    assert protected.json()["status"] == "ok"

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200

    status_after = client.get("/api/auth/status")
    assert status_after.status_code == 200
    assert status_after.json()["authenticated"] is False
