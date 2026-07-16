# Expense Tracker

Personal expense tracker for one user, built with Python 3.11+, FastAPI, and Supabase PostgreSQL.

The current stage is expense-only. Income handling is intentionally deferred until a later milestone if needed.

## V1 goals

- Work in a browser on MacBook and iPhone
- Store live data in Supabase PostgreSQL
- Support CSV export as a backup method
- Stay within free-tier services where practical
- Start with expense tracking before adding income support

## Local setup

1. Create and activate a Python 3.11+ virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Export your local Supabase connection settings, or copy from `.env.example`:

```bash
export SUPABASE_HOST=your-db-host
export SUPABASE_PORT=5432
export SUPABASE_DBNAME=postgres
export SUPABASE_USER=postgres
export SUPABASE_PASSWORD=your-password
export SUPABASE_SSLMODE=require
```

4. Run tests:

```bash
pytest
```

5. Start the FastAPI app:

```bash
uvicorn api.main:app --reload
```

## Supabase setup

1. Create a Supabase project.
2. Run the initial schema in [sql/001_initial_schema.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/001_initial_schema.sql) in the Supabase SQL editor.
   If your database is already set up, also run [sql/007_add_payment_method.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/007_add_payment_method.sql) to add the payment source fields used by newer app versions.
   If you want older `cash = true` transactions to show `payment_method = 'Cash'`, run [sql/008_backfill_cash_payment_method.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/008_backfill_cash_payment_method.sql) next.
   Then run [sql/009_drop_cash_columns.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/009_drop_cash_columns.sql) to remove the old `cash` columns from Supabase.
   To add the separate current balance snapshot page, run [sql/010_finance_snapshot_entries.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/010_finance_snapshot_entries.sql) as well.
   If you already created the finance snapshot table before the date column was added, also run [sql/011_add_finance_snapshot_date.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/011_add_finance_snapshot_date.sql).
   To enable saved transfer/exchange records that also adjust Finance Situation balances, run [sql/022_create_exchange_records.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/022_create_exchange_records.sql).
   If you already enabled transfer/exchange records before fees were added, also run [sql/023_add_exchange_fee_amount.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/Expense%20Marker/sql/023_add_exchange_fee_amount.sql).
   To allow negative expense amounts for discounts and refunds, run [sql/024_allow_negative_expense_amounts.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/Expense%20Marker/sql/024_allow_negative_expense_amounts.sql).
   To create and seed the category catalog, run [sql/025_create_category_catalog.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/Expense%20Marker/sql/025_create_category_catalog.sql).
   If your category catalog already exists and you want the new `Discount` category added, also run [sql/034_add_discount_category.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/Expense%20Marker/sql/034_add_discount_category.sql).
3. Set the `SUPABASE_*` environment variables with your own database credentials before starting the app.

Notes:

- Use the direct database host or the Supabase pooler host, depending on which connection details you want for V1.
- Keep `SUPABASE_SSLMODE=require`.
- The database schema is expense-only for the current stage and does not include `transaction_type`.
- New expenses can store an optional `payment_method` such as `Monzo`, `HSBC`, or `Cash`.
- Negative expenses are supported for discounts and refunds after `sql/024_allow_negative_expense_amounts.sql` has been applied. If the database is missing that migration, saving a negative expense will fail.
- The app also includes a separate `Finance Situation` page for current balance snapshot rows by institution, account, currency, and snapshot date.
- The `Finance Situation` page can also store transfers and exchange records, including optional receiving-side fees in the destination currency, and apply the paired balance adjustments there without affecting expense or income reports.
- Row Level Security is enabled on `public.transactions`, with no public policies added by default.

## Notes

- Do not commit real credentials.
- Supabase setup and schema creation are handled in later milestones.
- CSV export is planned as the V1 backup method.
- The current sample input file is `sample_data/sample_expense.csv`.
