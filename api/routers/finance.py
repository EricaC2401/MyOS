"""Finance snapshot CRUD endpoints."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from src.db import (
    delete_finance_snapshot_account_history,
    delete_finance_snapshot_entry,
    fetch_finance_snapshot_dates,
    fetch_finance_snapshot_entries,
    fetch_finance_snapshot_history,
    insert_finance_snapshot_entry,
    update_finance_snapshot_entry,
)
from src.reports import build_finance_bicurrency_totals, build_finance_currency_summary
from src.models import validate_finance_snapshot_entry
from src.finance_fx import (
    DEFAULT_FX_RATES_TO_HKD,
    fetch_frankfurter_rates_to_hkd,
    load_fx_rates_to_hkd,
    save_fx_rates_to_hkd,
)
from src.finance_dashboard_cache import invalidate_finance_dashboard_cache
from api.serializers import serialize_finance_snapshot, _dec

router = APIRouter(prefix="/finance", tags=["finance"])


class FinanceSnapshotCreate(BaseModel):
    snapshot_date: str
    institution: str
    account: str
    currency: str
    balance: str
    account_type: str | None = None
    notes: str | None = None


class FinanceSnapshotUpdate(FinanceSnapshotCreate):
    pass


class FinanceFxRatesUpdate(BaseModel):
    rates_to_hkd: dict[str, str]
    source: str | None = None


def _build_finance_overview(entries):
    rates_to_hkd = load_fx_rates_to_hkd()
    rates_to_gbp = {
        currency: (Decimal("1.0000") / rate if rate else Decimal("0"))
        for currency, rate in rates_to_hkd.items()
    }
    currency_summary = build_finance_currency_summary(entries)
    bicurrency = build_finance_bicurrency_totals(
        entries,
        rates_to_gbp=rates_to_gbp,
        rates_to_hkd=rates_to_hkd,
    )
    return {
        "entries": [serialize_finance_snapshot(entry) for entry in entries],
        "currency_totals": [
            {"currency": str(row["currency"]), "balance": _dec(row["balance"])}
            for row in currency_summary
        ],
        "scenario_totals": [
            {
                "scenario": "Excluding Mum's Time D",
                "total_gbp": _dec(bicurrency.total_gbp_excluding_mums_time_d),
                "total_hkd": _dec(bicurrency.total_hkd_excluding_mums_time_d),
            },
            {
                "scenario": "Including Mum's Time D",
                "total_gbp": _dec(bicurrency.total_gbp_including_mums_time_d),
                "total_hkd": _dec(bicurrency.total_hkd_including_mums_time_d),
            },
        ],
        "fx_rates_to_hkd": {
            currency: f"{rate:,.4f}"
            for currency, rate in sorted(rates_to_hkd.items())
        },
        "rate_gbp_hkd": f"{bicurrency.rate_gbp_hkd:,.4f}",
    }


@router.get("/snapshot")
def list_snapshot():
    entries = fetch_finance_snapshot_entries()
    return [serialize_finance_snapshot(e) for e in entries]


@router.get("/overview")
def finance_overview():
    entries = fetch_finance_snapshot_entries()
    return _build_finance_overview(entries)


@router.get("/snapshot/dates")
def list_snapshot_dates():
    dates = fetch_finance_snapshot_dates()
    return [d.isoformat() for d in dates]


@router.get("/snapshot/history")
def list_snapshot_history(
    snapshot_date: date | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    institution: str | None = Query(None),
    account: str | None = Query(None),
    currency: str | None = Query(None),
):
    entries = fetch_finance_snapshot_history()
    results = []
    for e in entries:
        if snapshot_date and e.snapshot_date != snapshot_date:
            continue
        if start_date and e.snapshot_date < start_date:
            continue
        if end_date and e.snapshot_date > end_date:
            continue
        if institution and e.institution != institution:
            continue
        if account and e.account != account:
            continue
        if currency and e.currency != currency:
            continue
        results.append(serialize_finance_snapshot(e))
    return results


@router.post("/snapshot")
def create_snapshot(body: FinanceSnapshotCreate):
    entry = validate_finance_snapshot_entry(body.model_dump())
    stored = insert_finance_snapshot_entry(entry)
    invalidate_finance_dashboard_cache()
    return serialize_finance_snapshot(stored)


@router.put("/snapshot/{entry_id}")
def update_snapshot_endpoint(entry_id: int, body: FinanceSnapshotUpdate):
    entry = validate_finance_snapshot_entry(body.model_dump())
    updated = update_finance_snapshot_entry(entry_id, entry)
    if updated is None:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": f"Snapshot #{entry_id} not found"})
    invalidate_finance_dashboard_cache()
    return serialize_finance_snapshot(updated)


@router.delete("/snapshot/{entry_id}")
def delete_snapshot_endpoint(entry_id: int):
    deleted = delete_finance_snapshot_entry(entry_id)
    if not deleted:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": f"Snapshot #{entry_id} could not be deleted"})
    invalidate_finance_dashboard_cache()
    return {"deleted": True, "id": entry_id}


@router.delete("/account-history")
def delete_account_history(
    institution: str = Query(...),
    account: str = Query(...),
    currency: str = Query(...),
):
    deleted = delete_finance_snapshot_account_history(
        institution=institution, account=account, currency=currency,
    )
    if not deleted:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Account history not found"})
    invalidate_finance_dashboard_cache()
    return {"deleted": True}


@router.get("/fx-rates")
def get_fx_rates():
    rates_to_hkd = load_fx_rates_to_hkd()
    return {
        "rates_to_hkd": {
            currency: f"{rate:,.4f}"
            for currency, rate in sorted(rates_to_hkd.items())
        }
    }


@router.put("/fx-rates")
def update_fx_rates(body: FinanceFxRatesUpdate):
    next_rates = dict(DEFAULT_FX_RATES_TO_HKD)
    for currency, value in body.rates_to_hkd.items():
        rate = Decimal(str(value))
        if rate <= 0:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=422, content={"detail": f"FX rate for {currency} must be greater than zero"})
        next_rates[str(currency)] = rate
    save_fx_rates_to_hkd(next_rates, source=body.source or "Manual")
    invalidate_finance_dashboard_cache()
    return {
        "rates_to_hkd": {
            currency: f"{rate:,.4f}"
            for currency, rate in sorted(next_rates.items())
        }
    }


@router.post("/fx-rates/refresh")
def refresh_fx_rates():
    from fastapi.responses import JSONResponse

    try:
        latest_rates = fetch_frankfurter_rates_to_hkd()
        save_fx_rates_to_hkd(latest_rates, source="Frankfurter")
        invalidate_finance_dashboard_cache()
    except RuntimeError as exc:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    return {
        "rates_to_hkd": {
            currency: f"{rate:,.4f}"
            for currency, rate in sorted(latest_rates.items())
        },
        "source": "Frankfurter",
    }
