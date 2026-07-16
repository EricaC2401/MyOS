from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from api.routers import expenses
from src.models import ExpenseTransaction


def make_transaction(*, amount_gbp: str, payment_method: str | None = "Monzo Current") -> ExpenseTransaction:
    return ExpenseTransaction(
        transaction_date=date(2026, 7, 9),
        description="Promotional credit",
        category="Discount",
        group_name="Living",
        amount_gbp=Decimal(amount_gbp),
        amount_hkd=None,
        tax_deductable=False,
        payment_method=payment_method,
        notes=None,
    )


def make_stored_transaction(*, amount_gbp: str, payment_method: str | None = "Monzo Current") -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        transaction_date=date(2026, 7, 9),
        description="Promotional credit",
        category="Discount",
        group_name="Living",
        amount_gbp=Decimal(amount_gbp),
        amount_hkd=None,
        tax_deductable=False,
        payment_method=payment_method,
        notes=None,
        created_at=datetime(2026, 7, 9, 9, 0, 0),
        updated_at=datetime(2026, 7, 9, 9, 0, 0),
    )


def test_create_expense_applies_finance_credit_for_negative_amount(monkeypatch) -> None:
    captured: dict[str, object] = {}
    transaction = make_transaction(amount_gbp="-8.00")
    stored = make_stored_transaction(amount_gbp="-8.00")

    monkeypatch.setattr(expenses, "validate_expense_transaction", lambda payload: transaction)
    monkeypatch.setattr(expenses, "insert_transaction", lambda tx: captured.setdefault("insert", tx) or stored)
    def fake_insert_with_finance_link(*args, **kwargs):
        captured["linked"] = kwargs
        return stored

    monkeypatch.setattr(expenses, "insert_transaction_with_finance_link", fake_insert_with_finance_link)
    monkeypatch.setattr(expenses, "invalidate_finance_dashboard_cache", lambda: captured.setdefault("invalidated", True))

    payload = expenses.create_expense(
        expenses.ExpenseCreate(
            transaction_date="2026-07-09",
            description="Promotional credit",
            category="Discount",
            group="Living",
            amount_gbp="-8.00",
            payment_method="Monzo Current",
        )
    )

    assert "insert" not in captured
    assert captured["linked"]["deduction_amount"] == Decimal("-8.00")
    assert payload["amount_gbp"] == "-8.00"
    assert payload["category"] == "Discount"


def test_update_expense_applies_finance_credit_for_negative_amount(monkeypatch) -> None:
    captured: dict[str, object] = {}
    original = make_stored_transaction(amount_gbp="12.00")
    transaction = make_transaction(amount_gbp="-8.00")
    updated = make_stored_transaction(amount_gbp="-8.00")

    monkeypatch.setattr(expenses, "fetch_transaction_by_id", lambda expense_id: original)
    monkeypatch.setattr(expenses, "validate_expense_transaction", lambda payload: transaction)
    monkeypatch.setattr(expenses, "update_transaction", lambda expense_id, tx: captured.setdefault("updated", (expense_id, tx)) or updated)
    def fake_update_with_finance_link(*args, **kwargs):
        captured["linked"] = kwargs
        return updated

    monkeypatch.setattr(expenses, "update_transaction_with_finance_link", fake_update_with_finance_link)
    monkeypatch.setattr(expenses, "invalidate_finance_dashboard_cache", lambda: captured.setdefault("invalidated", True))

    payload = expenses.update_expense_endpoint(
        1,
        expenses.ExpenseUpdate(
            transaction_date="2026-07-09",
            description="Promotional credit",
            category="Discount",
            group="Living",
            amount_gbp="-8.00",
            payment_method="Monzo Current",
        ),
    )

    assert captured["linked"]["reverse_amount"] == Decimal("12.00")
    assert captured["linked"]["apply_amount"] == Decimal("-8.00")
    assert payload["amount_gbp"] == "-8.00"
