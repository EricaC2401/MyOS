from __future__ import annotations

from src.import_csv import CSVImportError, build_import_preview_rows, clean_import_csv


def test_clean_import_csv_accepts_valid_rows() -> None:
    csv_bytes = (
        b"transaction_date,description,category,tax_deductable,amount_gbp,expense_hkd,notes,cash\n"
        b"2026-05-01,VOXI,Subscription,false,10.00,,,false\n"
        b"2026-05-02,Coffee,,true,3.50,35.00,Morning coffee,true\n"
    )

    transactions = clean_import_csv(csv_bytes)

    assert len(transactions) == 2
    assert transactions[0].description == "VOXI"
    assert transactions[1].category == "Uncategorised"


def test_clean_import_csv_accepts_month_name_dates() -> None:
    csv_bytes = (
        b"transaction_date,description,category,tax_deductable,amount_gbp,expense_hkd,notes,cash\n"
        b"\"May 1, 2026\",VOXI,Subscription,false,10.00,,,false\n"
    )

    transactions = clean_import_csv(csv_bytes)

    assert len(transactions) == 1
    assert transactions[0].transaction_date.isoformat() == "2026-05-01"


def test_clean_import_csv_rejects_invalid_headers() -> None:
    csv_bytes = b"Date,Item\n2026-05-01,VOXI\n"

    try:
        clean_import_csv(csv_bytes)
    except CSVImportError as exc:
        assert "Missing columns" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected CSVImportError for invalid headers")


def test_clean_import_csv_rejects_invalid_row_values() -> None:
    csv_bytes = (
        b"transaction_date,description,category,tax_deductable,amount_gbp,expense_hkd,notes,cash\n"
        b"2026-05-01,VOXI,Subscription,false,-10.00,,,false\n"
    )

    try:
        clean_import_csv(csv_bytes)
    except CSVImportError as exc:
        assert "Row 2" in str(exc)
        assert "amount_gbp must be zero or greater" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected CSVImportError for invalid row")


def test_build_import_preview_rows_returns_first_five_rows() -> None:
    csv_bytes = (
        b"transaction_date,description,category,tax_deductable,amount_gbp,expense_hkd,notes,cash\n"
        b"2026-05-01,A,Food,false,1.00,,,false\n"
        b"2026-05-01,B,Food,false,2.00,,,false\n"
        b"2026-05-01,C,Food,false,3.00,,,false\n"
        b"2026-05-01,D,Food,false,4.00,,,false\n"
        b"2026-05-01,E,Food,false,5.00,,,false\n"
        b"2026-05-01,F,Food,false,6.00,,,false\n"
    )

    transactions = clean_import_csv(csv_bytes)
    preview_rows = build_import_preview_rows(transactions)

    assert len(preview_rows) == 5
    assert preview_rows[0]["description"] == "A"
    assert preview_rows[-1]["description"] == "E"
