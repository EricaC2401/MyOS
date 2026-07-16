# MyOS

Personal operating system for one user, built with Python 3.11+, FastAPI, a static frontend, and Supabase PostgreSQL.

As of July 16, 2026, the app supports a hosted/mobile-friendly deployment model:

- one public URL for laptop and phone
- single-user password login
- add-to-home-screen support
- Supabase credentials stored on the server instead of in the browser

## Local development

1. Create and activate a Python 3.11+ virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in your own values, or export equivalent environment variables:

```bash
export SUPABASE_HOST=your-db-host
export SUPABASE_PORT=5432
export SUPABASE_DBNAME=postgres
export SUPABASE_USER=postgres
export SUPABASE_PASSWORD=your-password
export SUPABASE_SSLMODE=require
```

4. Optional: enable the app login locally.

Generate a password hash:

```bash
python -m src.generate_password_hash
```

Then add the output to `.env` as `APP_PASSWORD_HASH`, and also set a long random `APP_SESSION_SECRET`.

5. Run tests:

```bash
PYTHONPATH=. ./venv/bin/pytest
```

6. Start the app:

```bash
uvicorn api.main:app --reload
```

Notes:

- If `APP_PASSWORD_HASH` is not set, app login is disabled.
- If `APP_PASSWORD_HASH` is set, browser-based Supabase credential entry is disabled and the app expects `SUPABASE_*` values to already exist in the environment.
- Local HTTP development should keep `AUTH_COOKIE_SECURE=false`.

## Hosted deployment

The app is ready to deploy to a managed ASGI-compatible host such as Render.

### What the host stores

Save these as server-side environment variables on the host:

- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DBNAME`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`
- `SUPABASE_SSLMODE`
- `APP_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `AUTH_COOKIE_SECURE=true`

Do not store those values in frontend code or commit them to Git.

### Render setup

This repo includes [render.yaml](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/render.yaml) for a free-tier web service.

Manual deployment steps:

1. Create a Render account and connect your GitHub repo.
2. Create a new web service from this repo, or use the provided `render.yaml`.
3. Add all required environment variables in the Render dashboard.
4. Generate `APP_PASSWORD_HASH` locally with:

```bash
python -m src.generate_password_hash
```

5. Pick a long random value for `APP_SESSION_SECRET`.
6. Deploy the service.
7. Open the hosted URL on laptop and phone.
8. On iPhone, use `Share -> Add to Home Screen` to save MyOS as an icon.

### Hosted behavior

- Hosted users sign in with the app password.
- The session stays active until logout, browser data removal, or password/session-secret rotation.
- The `Log out` button lives in Settings.
- Production deployments should not use the browser-based Supabase connection screen.

## Mobile QA checklist

- Login screen opens and accepts the correct password.
- Dashboard loads on an iPhone-sized viewport without horizontal overflow.
- Finance, planner, and settings navigation works from the mobile menu.
- Add-to-home-screen metadata loads correctly.
- Settings exposes `Log out`.

## Supabase setup

1. Create a Supabase project.
2. Run the initial schema in [sql/001_initial_schema.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/001_initial_schema.sql) in the Supabase SQL editor.
   If your database is already set up, also run [sql/007_add_payment_method.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/007_add_payment_method.sql) to add the payment source fields used by newer app versions.
   If you want older `cash = true` transactions to show `payment_method = 'Cash'`, run [sql/008_backfill_cash_payment_method.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/008_backfill_cash_payment_method.sql) next.
   Then run [sql/009_drop_cash_columns.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/009_drop_cash_columns.sql) to remove the old `cash` columns from Supabase.
   To add the separate current balance snapshot page, run [sql/010_finance_snapshot_entries.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/010_finance_snapshot_entries.sql) as well.
   If you already created the finance snapshot table before the date column was added, also run [sql/011_add_finance_snapshot_date.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/011_add_finance_snapshot_date.sql).
   To enable saved transfer/exchange records that also adjust Finance Situation balances, run [sql/022_create_exchange_records.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/022_create_exchange_records.sql).
   If you already enabled transfer/exchange records before fees were added, also run [sql/023_add_exchange_fee_amount.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/023_add_exchange_fee_amount.sql).
   To allow negative expense amounts for discounts and refunds, run [sql/024_allow_negative_expense_amounts.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/024_allow_negative_expense_amounts.sql).
   To create and seed the category catalog, run [sql/025_create_category_catalog.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/025_create_category_catalog.sql).
   If your category catalog already exists and you want the new `Discount` category added, also run [sql/034_add_discount_category.sql](/Users/ericachung_1/Desktop/Erica/Vibe%20Codeing/MyOS/app/sql/034_add_discount_category.sql).
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
- CSV export is planned as the V1 backup method.
