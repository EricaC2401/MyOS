from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from src.db import StoredExpenseTransaction
from src.reports import (
    build_category_spending_report,
    build_expense_report_summary,
    build_largest_expenses_report,
    build_monthly_trend_report,
    filter_transactions_by_date_range,
)


def make_transaction(
    *,
    transaction_id: int,
    transaction_date: date,
    category: str,
    amount_gbp: str,
    description: str = "Expense",
) -> StoredExpenseTransaction:
    return StoredExpenseTransaction(
        id=transaction_id,
        transaction_date=transaction_date,
        description=description,
        category=category,
        amount_gbp=Decimal(amount_gbp),
        expense_hkd=None,
        tax_deductable=False,
        cash=False,
        notes=None,
        created_at=datetime(2026, 6, 4, 12, 0, 0),
        updated_at=datetime(2026, 6, 4, 12, 0, 0),
    )


def test_filter_transactions_by_date_range_limits_results() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 5, 1), category="Food", amount_gbp="10.00"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 5, 10), category="Drink", amount_gbp="5.00"),
        make_transaction(transaction_id=3, transaction_date=date(2026, 6, 1), category="Food", amount_gbp="12.00"),
    ]

    filtered = filter_transactions_by_date_range(
        transactions,
        start_date=date(2026, 5, 2),
        end_date=date(2026, 5, 31),
    )

    assert [transaction.id for transaction in filtered] == [2]


def test_build_expense_report_summary_calculates_totals() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 5, 1), category="Food", amount_gbp="10.00"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 5, 10), category="Drink", amount_gbp="5.00"),
    ]

    summary = build_expense_report_summary(transactions)

    assert summary.total_spend == Decimal("15.00")
    assert summary.transaction_count == 2
    assert summary.largest_expense == Decimal("10.00")


def test_build_category_spending_report_groups_uncategorised() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 5, 1), category="Uncategorised", amount_gbp="10.00"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 5, 10), category="Food", amount_gbp="5.00"),
        make_transaction(transaction_id=3, transaction_date=date(2026, 5, 11), category="Food", amount_gbp="7.00"),
    ]

    rows = build_category_spending_report(transactions)

    assert rows[0] == {"category": "Food", "amount_gbp": Decimal("12.00")}
    assert rows[1] == {"category": "Uncategorised", "amount_gbp": Decimal("10.00")}


def test_build_largest_expenses_report_orders_descending() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 5, 1), category="Food", amount_gbp="10.00"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 5, 10), category="Drink", amount_gbp="25.00"),
        make_transaction(transaction_id=3, transaction_date=date(2026, 5, 11), category="Food", amount_gbp="7.00"),
    ]

    rows = build_largest_expenses_report(transactions, limit=2)

    assert [transaction.id for transaction in rows] == [2, 1]


def test_build_monthly_trend_report_groups_by_month() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 5, 1), category="Food", amount_gbp="10.00"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 5, 10), category="Drink", amount_gbp="5.00"),
        make_transaction(transaction_id=3, transaction_date=date(2026, 6, 11), category="Food", amount_gbp="7.00"),
    ]

    trend = build_monthly_trend_report(transactions)

    assert trend == [
        {"month": "2026-05", "amount_gbp": Decimal("15.00")},
        {"month": "2026-06", "amount_gbp": Decimal("7.00")},
    ]
