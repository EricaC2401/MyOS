"""Setup endpoint for configuring database credentials at runtime."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.auth import browser_setup_allowed
from src.db import DatabaseConnectionError, _clear_connection_cache, test_connection

router = APIRouter(tags=["setup"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class CredentialsPayload(BaseModel):
    host: str
    port: int = 5432
    dbname: str = "postgres"
    user: str = "postgres"
    password: str
    sslmode: str = "require"


@router.get("/setup/status")
def setup_status():
    configured = bool(os.environ.get("SUPABASE_HOST"))
    allow_browser_setup = browser_setup_allowed()
    if not configured:
        return {"configured": False, "allow_browser_setup": allow_browser_setup}
    try:
        test_connection()
        return {"configured": True, "connected": True, "allow_browser_setup": allow_browser_setup}
    except DatabaseConnectionError:
        return {"configured": True, "connected": False, "allow_browser_setup": allow_browser_setup}


@router.post("/setup/credentials")
def save_credentials(payload: CredentialsPayload):
    if not browser_setup_allowed():
        return JSONResponse(
            status_code=403,
            content={"detail": "Browser-based database setup is disabled for this environment."},
        )

    os.environ["SUPABASE_HOST"] = payload.host
    os.environ["SUPABASE_PORT"] = str(payload.port)
    os.environ["SUPABASE_DBNAME"] = payload.dbname
    os.environ["SUPABASE_USER"] = payload.user
    os.environ["SUPABASE_PASSWORD"] = payload.password
    os.environ["SUPABASE_SSLMODE"] = payload.sslmode

    _clear_connection_cache()

    try:
        test_connection()
    except DatabaseConnectionError as exc:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    env_path = PROJECT_ROOT / ".env"
    lines = [
        f"SUPABASE_HOST={payload.host}",
        f"SUPABASE_PORT={payload.port}",
        f"SUPABASE_DBNAME={payload.dbname}",
        f"SUPABASE_USER={payload.user}",
        f"SUPABASE_PASSWORD={payload.password}",
        f"SUPABASE_SSLMODE={payload.sslmode}",
    ]
    env_path.write_text("\n".join(lines) + "\n")

    try:
        from src.db import generate_due_recurring_expenses, generate_due_recurring_incomes
        generate_due_recurring_expenses()
        generate_due_recurring_incomes()
    except (DatabaseConnectionError, Exception):
        pass

    return {"status": "ok"}
