"""Single-user auth endpoints."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from src.auth import AUTH_SESSION_KEY, is_auth_enabled, verify_password

router = APIRouter(tags=["auth"])


class LoginPayload(BaseModel):
    password: str


@router.get("/auth/status")
def auth_status(request: Request):
    enabled = is_auth_enabled()
    authenticated = bool(request.session.get(AUTH_SESSION_KEY)) if enabled else True
    return {
        "enabled": enabled,
        "authenticated": authenticated,
    }


@router.post("/auth/login")
def login(payload: LoginPayload, request: Request):
    stored_hash = os.environ.get("APP_PASSWORD_HASH", "")
    if not stored_hash:
        return {"status": "disabled", "authenticated": True}
    if not verify_password(payload.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    request.session[AUTH_SESSION_KEY] = True
    return {"status": "ok", "authenticated": True}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    request.session.clear()
    return {"status": "ok", "authenticated": False}
