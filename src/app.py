"""Streamlit app entry point for the expense tracker."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pandas as pd
import streamlit as st

try:
    from src.categorisation import get_default_categories
    from src.db import (
        DatabaseConnectionError,
        StoredExpenseTransaction,
        delete_transaction,
        fetch_transactions,
        insert_transaction,
        test_connection,
        update_transaction,
    )
    from src.export_csv import build_export_filename, export_transactions_to_csv
    from src.models import ValidationError, validate_expense_transaction
except ModuleNotFoundError:  # pragma: no cover - used when Streamlit runs src/app.py directly
    from categorisation import get_default_categories
    from db import (
        DatabaseConnectionError,
        StoredExpenseTransaction,
        delete_transaction,
        fetch_transactions,
        insert_transaction,
        test_connection,
        update_transaction,
    )
    from export_csv import build_export_filename, export_transactions_to_csv
    from models import ValidationError, validate_expense_transaction

GRID_COLUMNS = (
    "Selected",
    "ID",
    "Date",
    "Description",
    "Category",
    "Amount (GBP)",
    "Amount (HKD)",
    "Tax Deductable",
    "Cash",
    "Notes",
)


def build_expense_payload(
    *,
    transaction_date: date,
    description: str,
    category: str,
    amount_gbp: float,
    expense_hkd: str,
    tax_deductable: bool,
    cash: bool,
    notes: str,
) -> dict[str, object]:
    """Convert Streamlit form values into a validation-ready transaction payload."""

    normalized_hkd = expense_hkd.strip()
    normalized_notes = notes.strip()

    return {
        "transaction_date": transaction_date.isoformat(),
        "description": description,
        "category": category,
        "amount_gbp": f"{amount_gbp:.2f}",
        "expense_hkd": normalized_hkd or None,
        "tax_deductable": tax_deductable,
        "cash": cash,
        "notes": normalized_notes or None,
    }


def get_category_filter_options(
    transactions: list[StoredExpenseTransaction],
) -> list[str]:
    """Return category filter options including any stored custom categories."""

    categories = list(get_default_categories())
    for transaction in transactions:
        if transaction.category not in categories:
            categories.append(transaction.category)
    return ["All categories", *categories]


def get_editor_category_options(
    transactions: list[StoredExpenseTransaction],
) -> list[str]:
    """Return editable category options including any stored custom categories."""

    return get_category_filter_options(transactions)[1:]


def render_manual_entry_form() -> None:
    """Render the manual expense entry form and save valid submissions."""

    st.subheader("Add Expense")
    st.caption("Record one expense at a time. Required fields are kept short for iPhone use.")

    categories = get_default_categories()

    with st.form("manual_expense_form", clear_on_submit=True):
        transaction_date = st.date_input("Date", value=date.today())
        description = st.text_input("Description")
        category = st.selectbox("Category", categories, index=0)
        amount_gbp = st.number_input("Amount (GBP)", min_value=0.0, step=0.01, format="%.2f")
        expense_hkd = st.text_input("Amount (HKD) optional")
        tax_deductable = st.checkbox("Tax deductable")
        cash = st.checkbox("Cash payment")
        notes = st.text_area("Notes", height=100)
        submitted = st.form_submit_button("Save Expense", use_container_width=True)

    if not submitted:
        return

    payload = build_expense_payload(
        transaction_date=transaction_date,
        description=description,
        category=category,
        amount_gbp=amount_gbp,
        expense_hkd=expense_hkd,
        tax_deductable=tax_deductable,
        cash=cash,
        notes=notes,
    )

    try:
        transaction = validate_expense_transaction(payload)
        stored = insert_transaction(transaction)
    except ValidationError as exc:
        st.error(str(exc))
        return
    except DatabaseConnectionError as exc:
        st.error(str(exc))
        return

    st.success(
        f"Saved expense #{stored.id}: {stored.description} for GBP {stored.amount_gbp:.2f}."
    )


def filter_transactions(
    transactions: list[StoredExpenseTransaction],
    *,
    start_date: date,
    end_date: date,
    category: str,
) -> list[StoredExpenseTransaction]:
    """Filter stored transactions for the current view controls."""

    filtered: list[StoredExpenseTransaction] = []
    for transaction in transactions:
        if transaction.transaction_date < start_date or transaction.transaction_date > end_date:
            continue
        if category != "All categories" and transaction.category != category:
            continue
        filtered.append(transaction)
    return filtered


def build_editor_rows(
    transactions: list[StoredExpenseTransaction],
) -> list[dict[str, object]]:
    """Build editable grid rows from stored transactions."""

    rows: list[dict[str, object]] = []
    for transaction in transactions:
        rows.append(
            {
                "Selected": False,
                "ID": transaction.id,
                "Date": transaction.transaction_date,
                "Description": transaction.description,
                "Category": transaction.category,
                "Amount (GBP)": float(transaction.amount_gbp),
                "Amount (HKD)": (
                    "" if transaction.expense_hkd is None else f"{Decimal(transaction.expense_hkd):.2f}"
                ),
                "Tax Deductable": transaction.tax_deductable,
                "Cash": transaction.cash,
                "Notes": transaction.notes or "",
            }
        )
    return rows


def _normalize_grid_row(row: dict[str, object]) -> dict[str, object]:
    """Return one editor row with stable values for comparison and validation."""

    normalized_date = row["Date"]
    if hasattr(normalized_date, "date"):
        normalized_date = normalized_date.date()

    amount_hkd = row["Amount (HKD)"]
    if pd.isna(amount_hkd):
        amount_hkd = ""

    notes = row["Notes"]
    if pd.isna(notes):
        notes = ""

    return {
        "Selected": bool(row["Selected"]),
        "ID": int(row["ID"]),
        "Date": normalized_date,
        "Description": str(row["Description"]),
        "Category": str(row["Category"]),
        "Amount (GBP)": float(row["Amount (GBP)"]),
        "Amount (HKD)": str(amount_hkd),
        "Tax Deductable": bool(row["Tax Deductable"]),
        "Cash": bool(row["Cash"]),
        "Notes": str(notes),
    }


def detect_changed_rows(
    original_rows: list[dict[str, object]],
    edited_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Return edited rows whose non-selection values changed."""

    original_by_id = {int(row["ID"]): row for row in original_rows}
    changed_rows: list[dict[str, object]] = []

    for edited_row in edited_rows:
        normalized_edited = _normalize_grid_row(edited_row)
        row_id = int(normalized_edited["ID"])
        original_row = _normalize_grid_row(original_by_id[row_id])

        comparable_original = {
            key: value for key, value in original_row.items() if key != "Selected"
        }
        comparable_edited = {
            key: value for key, value in normalized_edited.items() if key != "Selected"
        }

        if comparable_original != comparable_edited:
            changed_rows.append(normalized_edited)

    return changed_rows


def build_update_payload_from_row(row: dict[str, object]) -> dict[str, object]:
    """Convert one editable grid row into a validation-ready payload."""

    normalized_row = _normalize_grid_row(row)

    return build_expense_payload(
        transaction_date=normalized_row["Date"],
        description=str(normalized_row["Description"]),
        category=str(normalized_row["Category"]),
        amount_gbp=float(normalized_row["Amount (GBP)"]),
        expense_hkd=str(normalized_row["Amount (HKD)"]),
        tax_deductable=bool(normalized_row["Tax Deductable"]),
        cash=bool(normalized_row["Cash"]),
        notes=str(normalized_row["Notes"]),
    )


def collect_selected_transaction_ids(rows: list[dict[str, object]]) -> list[int]:
    """Return the database ids for grid rows marked as selected."""

    selected_ids: list[int] = []
    for row in rows:
        if row.get("Selected"):
            selected_ids.append(int(row["ID"]))
    return selected_ids


def render_transaction_grid() -> None:
    """Render the recent expenses section with inline edit and bulk delete."""

    st.subheader("Recent Expenses")

    try:
        transactions = fetch_transactions(limit=200)
    except DatabaseConnectionError as exc:
        st.error(str(exc))
        return

    if not transactions:
        st.info("No expenses saved yet. Add your first expense above.")
        return

    categories = get_category_filter_options(transactions)
    dates = [transaction.transaction_date for transaction in transactions]
    min_date = min(dates)
    max_date = max(dates)

    filter_col1, filter_col2 = st.columns(2)
    with filter_col1:
        start_date = st.date_input("From", value=min_date, min_value=min_date, max_value=max_date)
    with filter_col2:
        end_date = st.date_input("To", value=max_date, min_value=min_date, max_value=max_date)

    filter_col3, filter_col4 = st.columns(2)
    with filter_col3:
        category = st.selectbox("Category filter", categories, index=0)
    with filter_col4:
        st.selectbox("Entry type", ["Expense"], index=0, disabled=True)

    if start_date > end_date:
        st.error("The start date must be on or before the end date.")
        return

    filtered_transactions = filter_transactions(
        transactions,
        start_date=start_date,
        end_date=end_date,
        category=category,
    )

    st.caption(f"Showing {len(filtered_transactions)} expense(s).")

    if not filtered_transactions:
        st.info("No expenses match the selected filters.")
        return

    original_rows = build_editor_rows(filtered_transactions)
    editor_df = pd.DataFrame(original_rows, columns=GRID_COLUMNS)
    edited_df = st.data_editor(
        editor_df,
        use_container_width=True,
        hide_index=True,
        num_rows="fixed",
        column_config={
            "Selected": st.column_config.CheckboxColumn("Selected"),
            "ID": st.column_config.NumberColumn("ID", step=1, format="%d"),
            "Date": st.column_config.DateColumn("Date", format="YYYY-MM-DD"),
            "Description": st.column_config.TextColumn("Description", required=True),
            "Category": st.column_config.SelectboxColumn(
                "Category",
                options=get_editor_category_options(filtered_transactions),
                required=True,
            ),
            "Amount (GBP)": st.column_config.NumberColumn(
                "Amount (GBP)", min_value=0.0, step=0.01, format="%.2f"
            ),
            "Amount (HKD)": st.column_config.TextColumn("Amount (HKD)"),
            "Tax Deductable": st.column_config.CheckboxColumn("Tax Deductable"),
            "Cash": st.column_config.CheckboxColumn("Cash"),
            "Notes": st.column_config.TextColumn("Notes"),
        },
        disabled=["ID"],
        key="expense_grid_editor",
    )
    edited_rows = edited_df.to_dict("records")
    changed_rows = detect_changed_rows(original_rows, edited_rows)
    selected_ids = collect_selected_transaction_ids(edited_rows)

    save_label = (
        f"Save Changes ({len(changed_rows)})" if changed_rows else "Save Changes"
    )
    if st.button(save_label, use_container_width=True, key="save_expense_grid_changes"):
        if not changed_rows:
            st.info("There are no edited rows to save.")
        else:
            validated_updates: list[tuple[int, object]] = []
            validation_errors: list[str] = []

            for row in changed_rows:
                try:
                    transaction = validate_expense_transaction(build_update_payload_from_row(row))
                except ValidationError as exc:
                    validation_errors.append(f"Expense #{int(row['ID'])}: {exc}")
                    continue

                validated_updates.append((int(row["ID"]), transaction))

            if validation_errors:
                for error_message in validation_errors:
                    st.error(error_message)
            else:
                updated_ids: list[int] = []
                for transaction_id, transaction in validated_updates:
                    try:
                        updated = update_transaction(transaction_id, transaction)
                    except DatabaseConnectionError as exc:
                        st.error(f"Expense #{transaction_id}: {exc}")
                        return

                    if updated is None:
                        st.error(f"Expense #{transaction_id} could not be updated.")
                        return

                    updated_ids.append(updated.id)

                st.success(f"Saved {len(updated_ids)} expense(s): {', '.join(map(str, updated_ids))}.")
                st.rerun()

    st.markdown("**Delete selected expenses**")
    st.warning("Deleting selected expenses cannot be undone.")
    st.caption(f"{len(selected_ids)} expense(s) selected for deletion.")
    confirm_delete = st.checkbox(
        f"I confirm that I want to delete {len(selected_ids)} selected expense(s)",
        key="confirm_bulk_delete",
        disabled=not selected_ids,
    )
    delete_label = (
        f"Delete {len(selected_ids)} Expense" if len(selected_ids) == 1 else f"Delete {len(selected_ids)} Expenses"
    )
    delete_submitted = st.button(
        delete_label,
        type="primary",
        use_container_width=True,
        disabled=not selected_ids or not confirm_delete,
        key="delete_selected_expenses",
    )

    if delete_submitted:
        deleted_ids: list[int] = []
        failed_ids: list[int] = []
        for transaction_id in selected_ids:
            try:
                deleted = delete_transaction(transaction_id)
            except DatabaseConnectionError:
                deleted = False

            if deleted:
                deleted_ids.append(transaction_id)
            else:
                failed_ids.append(transaction_id)

        if deleted_ids:
            st.success(f"Deleted expense(s): {', '.join(map(str, deleted_ids))}.")
        if failed_ids:
            st.error(f"Could not delete expense(s): {', '.join(map(str, failed_ids))}.")
        if deleted_ids:
            st.rerun()


def render_export_section() -> None:
    """Render the CSV backup download section."""

    st.subheader("CSV Backup")
    st.caption("Download a full CSV backup of all expenses.")

    try:
        transactions = fetch_transactions()
    except DatabaseConnectionError as exc:
        st.error(str(exc))
        return

    if not transactions:
        st.info("Save at least one expense before exporting a backup.")
        return

    st.download_button(
        "Download CSV Backup",
        data=export_transactions_to_csv(transactions),
        file_name=build_export_filename(),
        mime="text/csv",
        use_container_width=True,
    )


def main() -> None:
    """Run the Streamlit expense tracker app."""

    st.set_page_config(page_title="Expense Tracker", page_icon=":material/receipt_long:")
    st.title("Expense Tracker")
    st.caption("Expense-only V1 entry flow")

    try:
        connected = test_connection()
    except DatabaseConnectionError as exc:
        st.error(str(exc))
        st.stop()

    if connected:
        st.success("Supabase connected.")

    render_manual_entry_form()
    st.divider()
    render_transaction_grid()
    st.divider()
    render_export_section()


if __name__ == "__main__":
    main()
