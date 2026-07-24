"""FastAPI application entry point."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

load_dotenv(PROJECT_ROOT / ".env")

from src.db import DatabaseConnectionError, DatabaseSchemaError
from src.models import ValidationError
from src.auth import (
    AUTH_SESSION_KEY,
    browser_setup_allowed,
    get_cookie_secure_default,
    get_session_secret,
    is_auth_enabled,
)


class RequireAuthenticationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not is_auth_enabled():
            return await call_next(request)
        if not path.startswith("/api"):
            return await call_next(request)
        if path in {
            "/api/auth/login",
            "/api/auth/logout",
            "/api/auth/status",
            "/api/setup/status",
        }:
            return await call_next(request)
        if path == "/api/setup/credentials" and browser_setup_allowed():
            return await call_next(request)
        if request.session.get(AUTH_SESSION_KEY):
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Authentication required."})


@asynccontextmanager
async def lifespan(app: FastAPI):
    from src.db import test_connection
    try:
        test_connection()
    except DatabaseConnectionError:
        pass

    try:
        from src.db import generate_due_recurring_expenses, generate_due_recurring_incomes
        generate_due_recurring_expenses()
        generate_due_recurring_incomes()
    except (DatabaseConnectionError, DatabaseSchemaError):
        pass

    # Pre-warm report and finance caches so the first page load is fast
    try:
        from api.routers.reports import (
            _get_report_transactions,
            _get_report_income_transactions,
            _get_report_tax_due_entries,
            _get_expense_month_rates,
            _build_dashboard_finance_payload,
        )
        from src.finance_dashboard_cache import set_finance_dashboard_cache
        transactions = _get_report_transactions()
        _get_report_income_transactions()
        _get_report_tax_due_entries()
        # Pre-fetch HMRC rates for all months in the transaction history
        try:
            _get_expense_month_rates(transactions)
        except Exception:
            pass
        set_finance_dashboard_cache(_build_dashboard_finance_payload())
    except Exception:
        pass

    yield


def create_app() -> FastAPI:
    app = FastAPI(title="MyOS", lifespan=lifespan)

    app.add_middleware(RequireAuthenticationMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=get_session_secret(),
        same_site=os.environ.get("AUTH_COOKIE_SAMESITE", "lax"),
        https_only=get_cookie_secure_default(),
        max_age=int(os.environ.get("AUTH_SESSION_MAX_AGE", "315360000")),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})


    @app.exception_handler(DatabaseConnectionError)
    async def db_connection_error_handler(request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)})


    @app.exception_handler(DatabaseSchemaError)
    async def db_schema_error_handler(request, exc):
        return JSONResponse(status_code=500, content={"detail": str(exc)})


    try:
        from src.db import FinanceLinkError

        @app.exception_handler(FinanceLinkError)
        async def finance_link_error_handler(request, exc):
            return JSONResponse(status_code=409, content={"detail": str(exc)})
    except ImportError:
        pass


    from api.routers import (
        auth, health, categories, classifications, income_classifications, reports,
        expenses, income, tax_due,
        finance, exchange, recurring,
        import_data, export_data,
        setup,
        habits, habit_categories, goal_themes, goals, planner_tasks, planner_events,
        daily_plans, daily_plan_items, planner_tags,
        english,
    )

    app.include_router(auth.router, prefix="/api")
    app.include_router(health.router, prefix="/api")
    app.include_router(setup.router, prefix="/api")
    app.include_router(categories.router, prefix="/api")
    app.include_router(classifications.router, prefix="/api")
    app.include_router(income_classifications.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(expenses.router, prefix="/api")
    app.include_router(income.router, prefix="/api")
    app.include_router(tax_due.router, prefix="/api")
    app.include_router(finance.router, prefix="/api")
    app.include_router(exchange.router, prefix="/api")
    app.include_router(recurring.router, prefix="/api")
    app.include_router(import_data.router, prefix="/api")
    app.include_router(export_data.router, prefix="/api")

    app.include_router(habits.router, prefix="/api")
    app.include_router(habit_categories.router, prefix="/api")
    app.include_router(goal_themes.router, prefix="/api")
    app.include_router(goals.router, prefix="/api")
    app.include_router(planner_tasks.router, prefix="/api")
    app.include_router(planner_events.router, prefix="/api")
    app.include_router(daily_plans.router, prefix="/api")
    app.include_router(daily_plan_items.router, prefix="/api")
    app.include_router(planner_tags.router, prefix="/api")
    app.include_router(english.router, prefix="/api")

    if FRONTEND_DIR.exists():
        app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
        app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")

        @app.get("/{path:path}")
        async def serve_frontend(path: str):
            file_path = FRONTEND_DIR / path
            if file_path.is_file():
                return FileResponse(str(file_path))
            return FileResponse(str(FRONTEND_DIR / "index.html"))

    return app


app = create_app()
