"""In-process caches used by report endpoints."""

from __future__ import annotations

import time

_REPORT_SOURCE_CACHE_TTL_SECONDS = 300.0
_REPORT_CLASSIFICATION_CACHE_TTL_SECONDS = 300.0
_report_source_cache: dict[str, tuple[float, object]] = {}


def get_ttl_cached_value(cache_key: str, ttl_seconds: float, loader):
    cached = _report_source_cache.get(cache_key)
    now = time.monotonic()
    if cached is not None:
        cached_at, cached_value = cached
        if now - cached_at <= ttl_seconds:
            return cached_value

    loaded_value = loader()
    _report_source_cache[cache_key] = (now, loaded_value)
    return loaded_value


def invalidate_report_source_cache() -> None:
    _report_source_cache.clear()


def get_report_source_cache_ttl_seconds() -> float:
    return _REPORT_SOURCE_CACHE_TTL_SECONDS


def get_report_classification_cache_ttl_seconds() -> float:
    return _REPORT_CLASSIFICATION_CACHE_TTL_SECONDS
