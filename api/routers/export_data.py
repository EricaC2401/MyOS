"""CSV export endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse

from src.db import fetch_transactions, fetch_income_transactions
from src.english_db import export_english_data
from src.export_csv import build_export_filename, export_transactions_to_csv
from src.reports import filter_transactions_by_date_range, filter_income_transactions_by_date_range
from api.serializers import (
    serialize_english_dashboard,
    serialize_english_interview_practice,
    serialize_english_interview_question,
    serialize_english_journal_entry,
    serialize_english_listening_session,
    serialize_english_listening_source,
    serialize_english_progress,
    serialize_english_reading_book,
    serialize_english_speaking_session,
    serialize_english_star_story,
    serialize_english_vocabulary_item,
    serialize_english_weekly_review,
    serialize_english_word_lookup,
)

import io

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/expenses")
def export_expenses(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category: str | None = Query(None),
):
    transactions = fetch_transactions()
    if start_date and end_date:
        transactions = filter_transactions_by_date_range(
            transactions, start_date=start_date, end_date=end_date,
        )
    if category and category != "All categories":
        transactions = [t for t in transactions if t.category == category]

    csv_data = export_transactions_to_csv(transactions)
    filename = build_export_filename()

    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/english")
def export_english():
    payload = export_english_data()
    return JSONResponse(
        {
            "dashboard": serialize_english_dashboard(payload["dashboard"]),
            "journal_entries": [serialize_english_journal_entry(item) for item in payload["journal_entries"]],
            "reading_books": [serialize_english_reading_book(item) for item in payload["reading_books"]],
            "listening_sources": [serialize_english_listening_source(item) for item in payload["listening_sources"]],
            "listening_sessions": [serialize_english_listening_session(item) for item in payload["listening_sessions"]],
            "word_lookups": [serialize_english_word_lookup(item) for item in payload["word_lookups"]],
            "vocabulary_items": [serialize_english_vocabulary_item(item) for item in payload["vocabulary_items"]],
            "speaking_sessions": [serialize_english_speaking_session(item) for item in payload["speaking_sessions"]],
            "interview_questions": [serialize_english_interview_question(item) for item in payload["interview_questions"]],
            "interview_practice": [serialize_english_interview_practice(item) for item in payload["interview_practice"]],
            "star_stories": [serialize_english_star_story(item) for item in payload["star_stories"]],
            "weekly_reviews": [serialize_english_weekly_review(item) for item in payload["weekly_reviews"]],
            "progress": serialize_english_progress(payload["progress"]),
        }
    )


@router.get("/income")
def export_income(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    incomes = fetch_income_transactions()
    if start_date and end_date:
        incomes = filter_income_transactions_by_date_range(
            incomes, start_date=start_date, end_date=end_date,
        )

    header = "income_date,description,source,currency,gross_amount,gross_amount_gbp,fx_rate_to_gbp,is_taxable,payment_account,notes\n"
    rows = []
    for inc in incomes:
        rows.append(",".join([
            inc.income_date.isoformat(),
            f'"{inc.description}"',
            f'"{inc.source}"',
            inc.currency,
            str(inc.gross_amount),
            str(inc.gross_amount_gbp or ""),
            str(inc.fx_rate_to_gbp or ""),
            str(inc.is_taxable).lower(),
            f'"{inc.payment_account or ""}"',
            f'"{inc.notes or ""}"',
        ]))
    csv_data = header + "\n".join(rows)
    today = date.today().isoformat()
    filename = f"income_export_{today}.csv"

    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
