# Expense Tracker

Personal expense tracker for one user, built with Python 3.11+, Streamlit, and Supabase PostgreSQL.

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

3. Copy the example secrets file and fill in your own values:

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```

4. Run tests:

```bash
pytest
```

5. Start the Streamlit app:

```bash
streamlit run src/app.py
```

## Notes

- Do not commit `.streamlit/secrets.toml` or any real credentials.
- Supabase setup and schema creation are handled in later milestones.
- CSV export is planned as the V1 backup method.
- The current sample input file is `sample_data/sample_expense.csv`.
