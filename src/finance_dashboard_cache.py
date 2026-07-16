"""Small in-process cache for dashboard finance summary."""

from __future__ import annotations

import time
from typing import Any

_CACHE_TTL_SECONDS = 300.0
_finance_dashboard_cache: dict[str, Any] = {
    "expires_at": 0.0,
    "payload": None,
}


def get_finance_dashboard_cache() -> dict[str, Any] | None:
    payload = _finance_dashboard_cache.get("payload")
    expires_at = float(_finance_dashboard_cache.get("expires_at") or 0.0)
    if payload is None or time.monotonic() >= expires_at:
        return None
    return payload


def set_finance_dashboard_cache(payload: dict[str, Any]) -> None:
    _finance_dashboard_cache["payload"] = payload
    _finance_dashboard_cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS


def invalidate_finance_dashboard_cache() -> None:
    _finance_dashboard_cache["payload"] = None
    _finance_dashboard_cache["expires_at"] = 0.0
