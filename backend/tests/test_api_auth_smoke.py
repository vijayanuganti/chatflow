"""Unauthenticated API smoke tests (no login credentials)."""


def test_session_validate_no_token(test_client):
    r = test_client.get("/api/auth/session/validate")
    assert r.status_code == 200
    assert r.json() == {"valid": False, "reason": "no_token"}


def test_users_requires_auth(test_client):
    r = test_client.get("/api/users")
    assert r.status_code == 401


def test_admin_storage_requires_auth(test_client):
    r = test_client.get("/api/admin/storage")
    assert r.status_code == 401


def test_login_invalid_credentials(test_client):
    r = test_client.post(
        "/api/auth/login",
        json={"username": "nonexistent_user_xyz", "password": "wrong"},
    )
    assert r.status_code in (401, 422)
