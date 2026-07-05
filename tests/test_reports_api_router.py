from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from api.routers import reports
from api.routers.reports import _filter_report_transactions


def make_transaction(
    *,
    transaction_date: date,
    group_name: str,
    category: str,
) -> SimpleNamespace:
    return SimpleNamespace(
        transaction_date=transaction_date,
        group_name=group_name,
        category=category,
    )


def test_filter_report_transactions_applies_date_group_and_category_filters() -> None:
    transactions = [
        make_transaction(
            transaction_date=date(2026, 4, 6),
            group_name="Living",
            category="Food",
        ),
        make_transaction(
            transaction_date=date(2026, 4, 7),
            group_name="Travel",
            category="Flight Ticket",
        ),
        make_transaction(
            transaction_date=date(2026, 5, 1),
            group_name="Living",
            category="Groceries",
        ),
    ]

    filtered = _filter_report_transactions(
        transactions,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        group="Living",
        category="Food",
    )

    assert len(filtered) == 1
    assert filtered[0].category == "Food"
    assert filtered[0].group_name == "Living"


def test_reports_summary_passes_classification_filter(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_filter(transactions, **kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr(reports, "fetch_transactions", lambda: [])
    monkeypatch.setattr(reports, "_filter_report_transactions", fake_filter)
    monkeypatch.setattr(reports, "_get_expense_month_rates", lambda expenses: {})

    reports.reports_summary(
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        group="Living",
        category="Food",
        classification="Driving Related",
    )

    assert captured == {
        "start_date": date(2026, 1, 1),
        "end_date": date(2026, 1, 31),
        "group": "Living",
        "category": "Food",
        "classification": "Driving Related",
    }


def test_dashboard_report_applies_report_filters(monkeypatch) -> None:
    captured: list[dict[str, object]] = []

    def fake_filter(transactions, **kwargs):
        captured.append(kwargs)
        return []

    monkeypatch.setattr(reports, "fetch_transactions", lambda: [])
    monkeypatch.setattr(reports, "fetch_income_transactions", lambda: [])
    monkeypatch.setattr(reports, "fetch_income_tax_due_entries", lambda: [])
    monkeypatch.setattr(reports, "_filter_tax_payments", lambda transactions: [])
    monkeypatch.setattr(reports, "_filter_report_transactions", fake_filter)
    monkeypatch.setattr(reports, "_get_expense_month_rates", lambda expenses: {})
    monkeypatch.setattr(reports, "build_monthly_trend_report", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "build_monthly_category_trend_report", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_dashboard_category_rows", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_dashboard_income_source_rows", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_expense_breakout_rows", lambda *args, **kwargs: {})
    monkeypatch.setattr(reports, "_build_group_category_spending", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_group_category_spending_used", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        reports,
        "build_overall_dashboard_summary",
        lambda **kwargs: SimpleNamespace(
            gross_income_gbp=Decimal("0"),
            total_tax_amount_gbp=Decimal("0"),
            taxable_expense_gbp=Decimal("0"),
            net_cash_flow_gbp=Decimal("0"),
            expense_gbp=Decimal("0"),
            annualised_monthly_expense_gbp=Decimal("0"),
            net_saving_after_tax_amount_gbp=Decimal("0"),
            annualised_monthly_net_saving_gbp=Decimal("0"),
            expense_hkd=Decimal("0"),
        ),
    )

    reports.dashboard_report(
        period_mode="Custom",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        group="Living",
        category="Food",
        classification="Driving Related",
    )

    assert captured == [
        {
            "start_date": date(2026, 1, 1),
            "end_date": date(2026, 1, 31),
            "group": "Living",
            "category": "Food",
            "classification": "Driving Related",
        },
        {
            "start_date": date.min,
            "end_date": date.max,
            "group": "Living",
            "category": "Food",
            "classification": "Driving Related",
        }
    ]


def test_dashboard_report_uses_accrued_total_for_custom_period(monkeypatch) -> None:
    monkeypatch.setattr(reports, "fetch_transactions", lambda: [])
    monkeypatch.setattr(reports, "fetch_income_transactions", lambda: [])
    monkeypatch.setattr(reports, "fetch_income_tax_due_entries", lambda: [])
    monkeypatch.setattr(reports, "_filter_tax_payments", lambda transactions: [])
    monkeypatch.setattr(reports, "_filter_report_transactions", lambda transactions, **kwargs: [])
    monkeypatch.setattr(reports, "_get_expense_month_rates", lambda expenses: {})
    monkeypatch.setattr(reports, "build_monthly_trend_report", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "build_monthly_category_trend_report", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_dashboard_category_rows", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_dashboard_income_source_rows", lambda *args, **kwargs: [])
    monkeypatch.setattr(reports, "_build_expense_breakout_rows", lambda *args, **kwargs: {})
    monkeypatch.setattr(reports, "_build_group_category_spending", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        reports,
        "_build_group_category_spending_used_for_period",
        lambda *args, **kwargs: [
            {"group": "Living", "category": "Car Related: Annual", "amount_gbp": "40.00", "amount_hkd": "0.00"}
        ],
    )
    monkeypatch.setattr(
        reports,
        "build_overall_dashboard_summary",
        lambda **kwargs: SimpleNamespace(
            gross_income_gbp=Decimal("200"),
            total_tax_amount_gbp=Decimal("10"),
            taxable_expense_gbp=Decimal("0"),
            net_cash_flow_gbp=Decimal("0"),
            expense_gbp=Decimal("100"),
            annualised_monthly_expense_gbp=None,
            net_saving_after_tax_amount_gbp=Decimal("90"),
            annualised_monthly_net_saving_gbp=None,
            expense_hkd=Decimal("0"),
            cash_inflow_gbp=Decimal("200"),
            cash_outflow_gbp=Decimal("100"),
        ),
    )

    payload = reports.dashboard_report(
        period_mode="Custom",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
    )

    assert payload["metrics"]["expense_paid_ex_tax_gbp"] == "100.00"
    assert payload["metrics"]["expense_used_ex_tax_gbp"] == "40.00"
    assert payload["metrics"]["saving_paid_gbp"] == "90.00"
    assert payload["metrics"]["saving_used_gbp"] == "150.00"
