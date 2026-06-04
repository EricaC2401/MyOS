from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest

from src.app import (
    build_editor_rows,
    build_update_payload_from_row,
    collect_selected_transaction_ids,
    detect_changed_rows,
    filter_transactions,
    get_category_filter_options,
    get_editor_category_options,
)
from src.db import StoredExpenseTransaction
from src.models import ValidationError, validate_expense_transaction


def make_transaction(
    *,
    transaction_id: int,
    transaction_date: date,
    category: str,
    description: str = "Expense",
) -> StoredExpenseTransaction:
    return StoredExpenseTransaction(
        id=transaction_id,
        transaction_date=transaction_date,
        description=description,
        category=category,
        amount_gbp=Decimal("10.00"),
        expense_hkd=None,
        tax_deductable=False,
        cash=False,
        notes=None,
        created_at=datetime(2026, 6, 3, 10, 0, 0),
        updated_at=datetime(2026, 6, 3, 10, 0, 0),
    )


def test_filter_transactions_applies_date_and_category_filters() -> None:
    transactions = [
        make_transaction(transaction_id=1, transaction_date=date(2026, 6, 1), category="Food"),
        make_transaction(transaction_id=2, transaction_date=date(2026, 6, 2), category="Drink"),
        make_transaction(transaction_id=3, transaction_date=date(2026, 6, 3), category="Food"),
    ]

    filtered = filter_transactions(
        transactions,
        start_date=date(2026, 6, 2),
        end_date=date(2026, 6, 3),
        category="Food",
    )

    assert [transaction.id for transaction in filtered] == [3]


def test_build_editor_rows_keeps_editable_native_values() -> None:
    rows = build_editor_rows(
        [
            StoredExpenseTransaction(
                id=9,
                transaction_date=date(2026, 6, 3),
                description="Lunch",
                category="Uncategorised",
                amount_gbp=Decimal("12.50"),
                expense_hkd=Decimal("125.00"),
                tax_deductable=True,
                cash=True,
                notes="Quick meal",
                created_at=datetime(2026, 6, 3, 12, 0, 0),
                updated_at=datetime(2026, 6, 3, 12, 0, 0),
            )
        ]
    )

    assert rows[0]["Selected"] is False
    assert rows[0]["ID"] == 9
    assert rows[0]["Date"] == date(2026, 6, 3)
    assert rows[0]["Category"] == "Uncategorised"
    assert rows[0]["Tax Deductable"] is True
    assert rows[0]["Cash"] is True
    assert rows[0]["Amount (GBP)"] == 12.5
    assert rows[0]["Amount (HKD)"] == "125.00"


def test_detect_changed_rows_identifies_only_modified_rows() -> None:
    original_rows = build_editor_rows(
        [
            make_transaction(transaction_id=1, transaction_date=date(2026, 6, 1), category="Food"),
            make_transaction(transaction_id=2, transaction_date=date(2026, 6, 2), category="Drink"),
        ]
    )
    edited_rows = [dict(row) for row in original_rows]
    edited_rows[0]["Selected"] = True
    edited_rows[1]["Description"] = "Updated expense"

    changed_rows = detect_changed_rows(original_rows, edited_rows)

    assert [row["ID"] for row in changed_rows] == [2]


def test_build_update_payload_from_row_normalizes_blank_optional_fields() -> None:
    row = build_editor_rows(
        [make_transaction(transaction_id=3, transaction_date=date(2026, 6, 3), category="Food")]
    )[0]
    row["Amount (HKD)"] = ""
    row["Notes"] = "  Updated note  "

    payload = build_update_payload_from_row(row)

    assert payload["transaction_date"] == "2026-06-03"
    assert payload["amount_gbp"] == "10.00"
    assert payload["expense_hkd"] is None
    assert payload["notes"] == "Updated note"


def test_build_update_payload_from_row_stays_valid_for_edited_row() -> None:
    row = build_editor_rows(
        [make_transaction(transaction_id=8, transaction_date=date(2026, 6, 3), category="Food")]
    )[0]
    row["Amount (GBP)"] = 22.75
    row["Amount (HKD)"] = "210.50"
    row["Description"] = "Edited expense"

    transaction = validate_expense_transaction(build_update_payload_from_row(row))

    assert transaction.description == "Edited expense"
    assert str(transaction.amount_gbp) == "22.75"
    assert str(transaction.expense_hkd) == "210.50"


def test_invalid_edited_row_still_fails_validation() -> None:
    row = build_editor_rows(
        [make_transaction(transaction_id=9, transaction_date=date(2026, 6, 3), category="Food")]
    )[0]
    row["Amount (GBP)"] = -1.0

    with pytest.raises(ValidationError, match="amount_gbp must be zero or greater"):
        validate_expense_transaction(build_update_payload_from_row(row))


def test_collect_selected_transaction_ids_returns_only_selected_rows() -> None:
    rows = build_editor_rows(
        [
            make_transaction(transaction_id=10, transaction_date=date(2026, 6, 1), category="Food"),
            make_transaction(transaction_id=11, transaction_date=date(2026, 6, 2), category="Drink"),
        ]
    )
    rows[0]["Selected"] = True
    rows[1]["Selected"] = True

    assert collect_selected_transaction_ids(rows) == [10, 11]


def test_category_options_include_custom_saved_categories() -> None:
    transactions = [
        make_transaction(transaction_id=6, transaction_date=date(2026, 6, 1), category="Housing"),
        make_transaction(transaction_id=7, transaction_date=date(2026, 6, 2), category="Drink"),
    ]

    filter_options = get_category_filter_options(transactions)
    editor_options = get_editor_category_options(transactions)

    assert filter_options[0] == "All categories"
    assert "Housing" in filter_options
    assert "Housing" in editor_options
