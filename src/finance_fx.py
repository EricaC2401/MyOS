"""Shared FX-rate helpers for finance conversions."""

from __future__ import annotations

from decimal import Decimal
import json
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from src.db import (
    DatabaseConnectionError,
    DatabaseSchemaError,
    fetch_finance_reference_fx_rates,
    upsert_finance_reference_fx_rates,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FX_RATES_PATH = PROJECT_ROOT / "data" / "finance_fx_rates.json"
FRANKFURTER_GBP_QUOTES_URL = "https://api.frankfurter.dev/v2/rates?base=GBP&quotes=HKD,USD,EUR,CAD,JPY"

DEFAULT_FX_RATES_TO_HKD = {
    "GBP": Decimal("10.3800"),
    "HKD": Decimal("1.0000"),
    "USD": Decimal("7.7800"),
    "EUR": Decimal("9.0000"),
    "CAD": Decimal("5.6000"),
    "JPY": Decimal("0.0500"),
}


def load_fx_rates_to_hkd() -> dict[str, Decimal]:
    try:
        rates = fetch_finance_reference_fx_rates()
        if rates:
            return rates
    except (DatabaseConnectionError, DatabaseSchemaError):
        pass

    rates = dict(DEFAULT_FX_RATES_TO_HKD)
    if FX_RATES_PATH.exists():
        payload = json.loads(FX_RATES_PATH.read_text())
        for currency, value in payload.items():
            rates[str(currency)] = Decimal(str(value))
    return rates


def save_fx_rates_to_hkd(rates_to_hkd: dict[str, Decimal], *, source: str | None = None) -> None:
    upsert_finance_reference_fx_rates(rates_to_hkd, source=source)
    FX_RATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        currency: f"{Decimal(value):.4f}"
        for currency, value in sorted(rates_to_hkd.items())
    }
    FX_RATES_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True))


def fetch_frankfurter_rates_to_hkd() -> dict[str, Decimal]:
    try:
        with urlopen(FRANKFURTER_GBP_QUOTES_URL, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except URLError as exc:
        raise RuntimeError(f"Unable to fetch FX rates from Frankfurter: {exc.reason}") from exc

    if isinstance(payload, list):
        rates = {
            str(row.get("quote")): row.get("rate")
            for row in payload
            if row.get("quote") and row.get("rate") is not None
        }
    else:
        rates = payload.get("rates") or {}
    hkd_per_gbp = Decimal(str(rates.get("HKD") or 0))
    if hkd_per_gbp <= 0:
        raise RuntimeError("Frankfurter response did not include a valid HKD rate for GBP.")

    rates_to_hkd = {
        "GBP": hkd_per_gbp,
        "HKD": Decimal("1.0000"),
    }
    for currency in ("USD", "EUR", "CAD", "JPY"):
        gbp_quote = Decimal(str(rates.get(currency) or 0))
        if gbp_quote <= 0:
            raise RuntimeError(f"Frankfurter response did not include a valid {currency} quote for GBP.")
        rates_to_hkd[currency] = hkd_per_gbp / gbp_quote

    return rates_to_hkd
