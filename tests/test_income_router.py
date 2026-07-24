from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from api.routers import income
def make_income_row(**overrides):
    base = {
        "id": 41,
        "income_date": date(2026, 5, 2),
        "description": "Outlier",
        "source": "Freelance",
        "currency": "USD",
        "gross_amount": Decimal("1373.00"),
        "gross_amount_gbp": Decimal("1012.55"),
        "fx_rate_to_gbp": Decimal("0.73747263"),
        "is_taxable": True,
        "payment_account": None,
        "notes": None,
        "created_at": datetime(2026, 7, 21, 9, 0, 0),
        "updated_at": datetime(2026, 7, 21, 9, 0, 0),
        "recurring_income_id": None,
        "generated_for_month": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_create_income_enriches_manual_usd_income_with_hmrc_rate(monkeypatch) -> None:
    captured = {}

    monkeypatch.setattr(income, "fetch_hmrc_monthly_exchange_rates", lambda month: {"USD": Decimal("1.3551")})
    def fake_insert(inc):
        captured["income"] = inc
        return make_income_row(
            gross_amount_gbp=inc.gross_amount_gbp,
            fx_rate_to_gbp=inc.fx_rate_to_gbp,
        )

    monkeypatch.setattr(income, "insert_income_transaction", fake_insert)
    monkeypatch.setattr(income, "invalidate_finance_dashboard_cache", lambda: None)
    monkeypatch.setattr(income, "invalidate_report_source_cache", lambda: None)

    response = income.create_income(
        income.IncomeCreate(
            income_date="2026-05-02",
            description="Outlier",
            source="Freelance",
            currency="USD",
            gross_amount="1373.00",
            is_taxable=True,
        )
    )

    assert captured["income"].gross_amount_gbp is not None
    assert captured["income"].fx_rate_to_gbp is not None
    assert response["currency"] == "USD"


def test_create_income_fetches_and_caches_hmrc_rates_when_month_missing(monkeypatch) -> None:
    captured = {}
    fetched_rates = {"USD": Decimal("1.3551"), "GBP": Decimal("1")}

    monkeypatch.setattr(income, "fetch_hmrc_monthly_exchange_rates", lambda month: {})
    monkeypatch.setattr(income, "fetch_hmrc_monthly_rates", lambda year, month: fetched_rates)
    monkeypatch.setattr(
        income,
        "upsert_hmrc_monthly_exchange_rates",
        lambda month_anchor, rates, source=None: captured.setdefault("cache", (month_anchor, rates, source)),
    )
    monkeypatch.setattr(income, "insert_income_transaction", lambda inc: make_income_row())
    monkeypatch.setattr(income, "invalidate_finance_dashboard_cache", lambda: None)
    monkeypatch.setattr(income, "invalidate_report_source_cache", lambda: None)

    income.create_income(
        income.IncomeCreate(
            income_date="2026-05-02",
            description="Outlier",
            source="Freelance",
            currency="USD",
            gross_amount="1373.00",
            is_taxable=True,
        )
    )

    assert captured["cache"][0] == date(2026, 5, 1)
    assert captured["cache"][1] == fetched_rates
    assert captured["cache"][2] == "hmrc-manual-income"
