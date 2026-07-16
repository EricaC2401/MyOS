"""Authentication helpers for single-user app access."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from typing import Final


AUTH_SESSION_KEY: Final[str] = "authenticated"
PASSWORD_HASH_PREFIX: Final[str] = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS: Final[int] = 390000


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def is_hosted_environment() -> bool:
    """Return True when the app appears to be running on a managed host."""

    hosted_keys = (
        "RENDER",
        "RENDER_SERVICE_ID",
        "RAILWAY_ENVIRONMENT",
        "FLY_APP_NAME",
    )
    return any(os.environ.get(key) for key in hosted_keys)


def is_auth_enabled() -> bool:
    """Return True when password auth is configured."""

    return bool(os.environ.get("APP_PASSWORD_HASH"))


def get_session_secret() -> str:
    """Return the configured session secret."""

    secret = os.environ.get("APP_SESSION_SECRET", "")
    if secret:
        return secret
    return "dev-session-secret-change-me"


def get_cookie_secure_default() -> bool:
    """Return whether secure cookies should be enabled."""

    return _read_bool_env("AUTH_COOKIE_SECURE", is_hosted_environment())


def browser_setup_allowed() -> bool:
    """Return whether DB credentials can be entered in the browser."""

    if _read_bool_env("ALLOW_BROWSER_DB_SETUP", not is_hosted_environment()):
        return not is_auth_enabled()
    return False


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = PASSWORD_HASH_ITERATIONS) -> str:
    """Return a PBKDF2 password hash suitable for APP_PASSWORD_HASH."""

    if not password:
        raise ValueError("Password cannot be empty.")
    actual_salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), actual_salt, iterations)
    salt_part = base64.urlsafe_b64encode(actual_salt).decode("ascii")
    hash_part = base64.urlsafe_b64encode(derived).decode("ascii")
    return f"{PASSWORD_HASH_PREFIX}${iterations}${salt_part}${hash_part}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Return whether the supplied password matches the configured hash."""

    if not password or not stored_hash:
        return False

    try:
        algorithm, raw_iterations, salt_part, hash_part = stored_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_PREFIX:
            return False
        iterations = int(raw_iterations)
        salt = base64.urlsafe_b64decode(salt_part.encode("ascii"))
        expected = base64.urlsafe_b64decode(hash_part.encode("ascii"))
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)
