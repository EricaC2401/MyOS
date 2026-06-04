"""CSV import and cleaning helpers."""

from __future__ import annotations

import csv
from dataclasses import asdict
from io import StringIO

try:
    from src.models import ExpenseTransaction, ValidationError, validate_expense_transaction
except ModuleNotFoundError:  # pragma: no cover - used when src modules are run directly
    from models import ExpenseTransaction, ValidationError, validate_expense_transaction


EXPECTED_IMPORT_COLUMNS = (
    "transaction_date",
    "description",
    "category",
    "tax_deductable",
    "amount_gbp",
    "expense_hkd",
    "notes",
    "cash",
)


class CSVImportError(ValueError):
    """Raised when a CSV file cannot be imported safely."""


def _decode_csv_bytes(csv_bytes: bytes) -> str:
    try:
        return csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CSVImportError("The CSV file must be UTF-8 encoded.") from exc


def validate_import_columns(fieldnames: list[str] | None) -> None:
    """Validate the expected import header set."""

    if not fieldnames:
        raise CSVImportError("The CSV file is empty or missing a header row.")

    normalized_fieldnames = [field.strip() for field in fieldnames]
    missing_columns = [
        column for column in EXPECTED_IMPORT_COLUMNS if column not in normalized_fieldnames
    ]
    unexpected_columns = [
        column for column in normalized_fieldnames if column not in EXPECTED_IMPORT_COLUMNS
    ]

    if missing_columns or unexpected_columns:
        message_parts: list[str] = []
        if missing_columns:
            message_parts.append(f"Missing columns: {', '.join(missing_columns)}.")
        if unexpected_columns:
            message_parts.append(f"Unexpected columns: {', '.join(unexpected_columns)}.")
        raise CSVImportError(" ".join(message_parts))


def clean_import_csv(csv_bytes: bytes) -> list[ExpenseTransaction]:
    """Parse, validate, and normalize a CSV import file."""

    csv_text = _decode_csv_bytes(csv_bytes)
    reader = csv.DictReader(StringIO(csv_text))
    validate_import_columns(reader.fieldnames)

    cleaned_transactions: list[ExpenseTransaction] = []
    for row_number, row in enumerate(reader, start=2):
        if row is None:
            continue

        try:
            transaction = validate_expense_transaction(
                {
                    "transaction_date": row.get("transaction_date"),
                    "description": row.get("description"),
                    "category": row.get("category"),
                    "tax_deductable": row.get("tax_deductable"),
                    "amount_gbp": row.get("amount_gbp"),
                    "expense_hkd": row.get("expense_hkd"),
                    "notes": row.get("notes"),
                    "cash": row.get("cash"),
                }
            )
        except ValidationError as exc:
            raise CSVImportError(f"Row {row_number}: {exc}") from exc

        cleaned_transactions.append(transaction)

    if not cleaned_transactions:
        raise CSVImportError("The CSV file does not contain any data rows.")

    return cleaned_transactions


def build_import_preview_rows(
    transactions: list[ExpenseTransaction],
) -> list[dict[str, object]]:
    """Build preview rows for the import confirmation UI."""

    preview_rows: list[dict[str, object]] = []
    for transaction in transactions[:5]:
        row = asdict(transaction)
        row["transaction_date"] = transaction.transaction_date.isoformat()
        row["amount_gbp"] = f"{transaction.amount_gbp:.2f}"
        row["expense_hkd"] = (
            "" if transaction.expense_hkd is None else f"{transaction.expense_hkd:.2f}"
        )
        preview_rows.append(row)
    return preview_rows
