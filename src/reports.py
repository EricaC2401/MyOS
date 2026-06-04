"""Reporting and aggregation helpers."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

try:
    from src.db import StoredExpenseTransaction
except ModuleNotFoundError:  # pragma: no cover - used when src modules are run directly
    from db import StoredExpenseTransaction


@dataclass(frozen=True)
class ExpenseReportSummary:
    """High-level report totals for a selected date range."""

    total_spend: Decimal
    transaction_count: int
    largest_expense: Decimal


def filter_transactions_by_date_range(
    transactions: list[StoredExpenseTransaction],
    *,
    start_date: date,
    end_date: date,
) -> list[StoredExpenseTransaction]:
    """Return transactions that fall within the selected date range."""

    return [
        transaction
        for transaction in transactions
        if start_date <= transaction.transaction_date <= end_date
    ]


def build_expense_report_summary(
    transactions: list[StoredExpenseTransaction],
) -> ExpenseReportSummary:
    """Return top-level expense totals for the current transaction slice."""

    if not transactions:
        return ExpenseReportSummary(
            total_spend=Decimal("0.00"),
            transaction_count=0,
            largest_expense=Decimal("0.00"),
        )

    amounts = [Decimal(transaction.amount_gbp) for transaction in transactions]
    return ExpenseReportSummary(
        total_spend=sum(amounts, Decimal("0.00")),
        transaction_count=len(transactions),
        largest_expense=max(amounts),
    )


def build_category_spending_report(
    transactions: list[StoredExpenseTransaction],
) -> list[dict[str, Decimal | str]]:
    """Return spending totals grouped by category, largest first."""

    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for transaction in transactions:
        totals[transaction.category] += Decimal(transaction.amount_gbp)

    return sorted(
        (
            {"category": category, "amount_gbp": amount}
            for category, amount in totals.items()
        ),
        key=lambda row: (row["amount_gbp"], row["category"]),
        reverse=True,
    )


def build_largest_expenses_report(
    transactions: list[StoredExpenseTransaction],
    *,
    limit: int = 5,
) -> list[StoredExpenseTransaction]:
    """Return the largest expenses in descending amount order."""

    return sorted(
        transactions,
        key=lambda transaction: (
            Decimal(transaction.amount_gbp),
            transaction.transaction_date,
            transaction.id,
        ),
        reverse=True,
    )[:limit]


def build_monthly_trend_report(
    transactions: list[StoredExpenseTransaction],
) -> list[dict[str, Decimal | str]]:
    """Return total spending by month for charting and summaries."""

    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for transaction in transactions:
        month_key = transaction.transaction_date.strftime("%Y-%m")
        totals[month_key] += Decimal(transaction.amount_gbp)

    return [
        {"month": month, "amount_gbp": totals[month]}
        for month in sorted(totals.keys())
    ]
