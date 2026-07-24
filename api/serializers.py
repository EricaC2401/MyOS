"""Pydantic models for API request/response serialization."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


def _dec(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{value:.2f}"


def _dec_rate(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{value:.8f}"


class HealthResponse(BaseModel):
    status: str


class CategoryColorEntry(BaseModel):
    category: str
    color: str


class CategoryColorsResponse(BaseModel):
    categories: list[CategoryColorEntry]


class DashboardMetrics(BaseModel):
    gross_income_gbp: str
    expense_gbp: str
    expense_hkd: str
    net_saving_gbp: str
    total_tax_amount_gbp: str
    taxable_expense_gbp: str
    taxable_income_gbp: str
    net_saving_after_tax_amount_gbp: str
    annualised_monthly_expense_gbp: str | None
    annualised_monthly_net_saving_gbp: str | None


class ExpenseBreakout(BaseModel):
    planned_irregular_gbp: str
    planned_irregular_hkd: str
    exceptional_gbp: str
    exceptional_hkd: str
    tax_gbp: str
    tax_hkd: str


class FinanceCurrencyRow(BaseModel):
    currency: str
    balance: str


class FinanceBicurrencyTotals(BaseModel):
    total_gbp_excluding_mums_time_d: str
    total_hkd_excluding_mums_time_d: str
    total_gbp_including_mums_time_d: str
    total_hkd_including_mums_time_d: str


class CategorySpendingRow(BaseModel):
    category: str
    amount_gbp: str
    amount_hkd: str


class MonthlyTrendRow(BaseModel):
    month: str
    amount_gbp: str
    amount_hkd: str


class LargestExpenseRow(BaseModel):
    date: str
    description: str
    category: str
    group: str
    amount_gbp: str
    amount_hkd: str | None


class DashboardResponse(BaseModel):
    metrics: DashboardMetrics
    expense_breakout: ExpenseBreakout
    finance_currency_summary: list[FinanceCurrencyRow]
    finance_totals: FinanceBicurrencyTotals | None
    category_spending: list[CategorySpendingRow]
    monthly_trend: list[MonthlyTrendRow]
    period_label: str


class ExpenseResponse(BaseModel):
    id: int
    transaction_date: str
    description: str
    category: str
    group: str
    amount_gbp: str
    amount_hkd: str | None
    tax_deductable: bool
    payment_method: str | None
    notes: str | None


class IncomeResponse(BaseModel):
    id: int
    income_date: str
    description: str
    source: str
    currency: str
    gross_amount: str
    gross_amount_gbp: str | None
    fx_rate_to_gbp: str | None
    is_taxable: bool
    payment_account: str | None
    notes: str | None


class FinanceSnapshotResponse(BaseModel):
    id: int
    snapshot_date: str
    institution: str
    account: str
    currency: str
    balance: str
    account_type: str | None
    notes: str | None
    updated_at: str


class RecurringExpenseResponse(BaseModel):
    id: int
    description: str
    category: str
    amount_gbp: str
    amount_hkd: str | None
    tax_deductable: bool
    payment_method: str | None
    notes: str | None
    day_of_month: int
    start_date: str
    end_date: str | None
    is_active: bool


class RecurringIncomeResponse(BaseModel):
    id: int
    description: str
    source: str
    currency: str
    gross_amount: str
    is_taxable: bool
    payment_account: str | None
    notes: str | None
    day_of_month: int
    start_date: str
    end_date: str | None
    is_active: bool


def serialize_expense(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "transaction_date": stored.transaction_date.isoformat(),
        "description": stored.description,
        "category": stored.category,
        "group": stored.group_name,
        "amount_gbp": _dec(stored.amount_gbp),
        "amount_hkd": _dec(stored.amount_hkd) if stored.amount_hkd is not None else None,
        "tax_deductable": stored.tax_deductable,
        "payment_method": stored.payment_method,
        "notes": stored.notes,
    }


def serialize_income(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "income_date": stored.income_date.isoformat(),
        "description": stored.description,
        "source": stored.source,
        "currency": stored.currency,
        "gross_amount": _dec(stored.gross_amount),
        "gross_amount_gbp": _dec(stored.gross_amount_gbp),
        "fx_rate_to_gbp": _dec_rate(stored.fx_rate_to_gbp),
        "is_taxable": stored.is_taxable,
        "payment_account": stored.payment_account,
        "notes": stored.notes,
    }


def serialize_finance_snapshot(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "snapshot_date": stored.snapshot_date.isoformat(),
        "institution": stored.institution,
        "account": stored.account,
        "currency": stored.currency,
        "balance": _dec(stored.balance),
        "account_type": stored.account_type,
        "notes": stored.notes,
        "related_record_type": stored.related_record_type,
        "related_record_item": stored.related_record_item,
        "related_record_amount": _dec(stored.related_record_amount) if stored.related_record_amount is not None else None,
        "updated_at": stored.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def serialize_recurring_expense(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "description": stored.description,
        "category": stored.category,
        "amount_gbp": _dec(stored.amount_gbp),
        "amount_hkd": _dec(stored.amount_hkd) if stored.amount_hkd is not None else None,
        "tax_deductable": stored.tax_deductable,
        "payment_method": stored.payment_method,
        "notes": stored.notes,
        "day_of_month": stored.day_of_month,
        "start_date": stored.start_date.isoformat(),
        "end_date": stored.end_date.isoformat() if stored.end_date else None,
        "is_active": stored.is_active,
    }


def serialize_recurring_income(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "description": stored.description,
        "source": stored.source,
        "currency": stored.currency,
        "gross_amount": _dec(stored.gross_amount),
        "is_taxable": stored.is_taxable,
        "payment_account": stored.payment_account,
        "notes": stored.notes,
        "day_of_month": stored.day_of_month,
        "start_date": stored.start_date.isoformat(),
        "end_date": stored.end_date.isoformat() if stored.end_date else None,
        "is_active": stored.is_active,
    }


# ---------------------------------------------------------------------------
# Planner serializers
# ---------------------------------------------------------------------------

def _date_or_none(val) -> str | None:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def serialize_habit(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "name": stored.name,
        "description": stored.description,
        "type": stored.type,
        "target": stored.target,
        "tracking_days": stored.tracking_days,
        "category": stored.category,
        "icon": stored.icon,
        "is_active": stored.is_active,
        "sort_order": stored.sort_order,
    }


def serialize_habit_entry(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "habit_id": stored.habit_id,
        "entry_date": stored.entry_date.isoformat(),
        "is_done": stored.is_done,
    }


def serialize_habit_category(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "name": stored.name,
        "icon": stored.icon,
        "color_key": stored.color_key,
        "sort_order": stored.sort_order,
    }


def serialize_goal_theme(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "notes": stored.notes,
        "is_done": stored.is_done,
        "is_cancelled": stored.is_cancelled,
        "is_active": stored.is_active,
        "sort_order": stored.sort_order,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_goal(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "area": stored.area,
        "goal_theme_id": stored.goal_theme_id,
        "goal_theme_title": stored.goal_theme_title,
        "target_completion_date": _date_or_none(stored.target_completion_date),
        "is_important": stored.is_important,
        "is_urgent": stored.is_urgent,
        "is_done": stored.is_done,
        "is_cancelled": stored.is_cancelled,
        "is_active": stored.is_active,
        "sort_order": stored.sort_order,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_task(stored) -> dict[str, Any]:
    recurrence = None
    if stored.recurring_template_id is not None:
        recurrence = {
            "template_id": stored.recurring_template_id,
            "repeat_unit": stored.recurring_repeat_unit,
            "repeat_every": 1,
            "weekday": stored.recurring_weekday,
            "day_of_month": stored.recurring_day_of_month,
            "is_active": stored.recurring_is_active,
            "start_date": _date_or_none(stored.recurring_occurrence_date) or _date_or_none(stored.deadline),
        }
    return {
        "id": stored.id,
        "title": stored.title,
        "category": stored.category,
        "area": stored.area,
        "goal_id": stored.goal_id,
        "deadline": _date_or_none(stored.deadline),
        "is_done": stored.is_done,
        "is_cancelled": stored.is_cancelled,
        "completed_at": _date_or_none(stored.completed_at),
        "is_active": stored.is_active,
        "recurring_template_id": stored.recurring_template_id,
        "recurring_occurrence_date": _date_or_none(stored.recurring_occurrence_date),
        "recurrence": recurrence,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
    }


def serialize_recurring_task_template(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "category": stored.category,
        "area": stored.area,
        "goal_id": stored.goal_id,
        "repeat_unit": stored.repeat_unit,
        "repeat_every": stored.repeat_every,
        "weekday": stored.weekday,
        "day_of_month": stored.day_of_month,
        "start_date": _date_or_none(stored.start_date),
        "is_active": stored.is_active,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_event(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "event_date": _date_or_none(stored.event_date),
        "event_time": str(stored.event_time) if stored.event_time else None,
        "venue": stored.venue,
        "category": stored.category,
        "is_done": stored.is_done,
        "is_cancelled": stored.is_cancelled,
        "is_active": stored.is_active,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
    }


def serialize_daily_plan(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "plan_date": stored.plan_date.isoformat(),
        "notes": stored.notes,
    }


def serialize_daily_plan_item(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "daily_plan_id": stored.daily_plan_id,
        "item_type": stored.item_type,
        "task_id": stored.task_id,
        "event_id": stored.event_id,
        "title_snapshot": stored.title_snapshot,
        "category_snapshot": stored.category_snapshot,
        "area_snapshot": stored.area_snapshot,
        "status": stored.status,
        "is_today_focus": stored.is_today_focus,
        "is_important": stored.is_important,
        "is_urgent": stored.is_urgent,
        "is_highlight": stored.is_highlight,
        "time_text": stored.time_text,
        "note_text": stored.note_text,
        "sort_order": stored.sort_order,
        "source_plan_item_id": stored.source_plan_item_id,
        "moved_to_plan_item_id": stored.moved_to_plan_item_id,
    }


def serialize_english_writing_issue(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "journal_entry_id": stored.journal_entry_id,
        "issue_type": stored.issue_type,
        "original_text": stored.original_text,
        "suggested_text": stored.suggested_text,
        "explanation": stored.explanation,
    }


def serialize_english_journal_entry(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "entry_date": _date_or_none(stored.entry_date),
        "prompt": stored.prompt,
        "content": stored.content,
        "clarity_notes": stored.clarity_notes,
        "vocabulary_notes": stored.vocabulary_notes,
        "grammar_notes": stored.grammar_notes,
        "mood_score": stored.mood_score,
        "confidence_score": stored.confidence_score,
        "writing_issues": [serialize_english_writing_issue(item) for item in getattr(stored, "writing_issues", ())],
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_reading_book(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "current_page": stored.current_page,
        "total_pages": stored.total_pages,
        "status": stored.status,
        "last_updated_date": _date_or_none(stored.last_updated_date),
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_listening_source(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "source_type": stored.source_type,
        "url": stored.url,
        "notes": stored.notes,
        "is_active": stored.is_active,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_listening_session(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "source_id": stored.source_id,
        "source_title": getattr(stored, "source_title", None),
        "session_date": _date_or_none(stored.session_date),
        "focus_area": stored.focus_area,
        "notes": stored.notes,
        "reflection": stored.reflection,
        "difficulty_score": stored.difficulty_score,
        "second_pass_completed": stored.second_pass_completed,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_word_lookup(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "phrase": stored.phrase,
        "item_type": stored.item_type,
        "learning_classification": stored.learning_classification,
        "familiarity_status": stored.familiarity_status,
        "familiarity_label": getattr(stored, "familiarity_label", None),
        "meaning": stored.meaning,
        "meaning_cantonese": stored.meaning_cantonese,
        "example_sentence": stored.example_sentence,
        "source_context": stored.source_context,
        "pronunciation_note": stored.pronunciation_note,
        "is_promoted": stored.is_promoted,
        "promoted_at": stored.promoted_at.isoformat() if stored.promoted_at else None,
        "status": stored.status,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_vocabulary_item(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "lookup_id": stored.lookup_id,
        "phrase": stored.phrase,
        "item_type": stored.item_type,
        "learning_classification": stored.learning_classification,
        "familiarity_status": stored.familiarity_status,
        "familiarity_label": getattr(stored, "familiarity_label", None),
        "meaning": stored.meaning,
        "meaning_cantonese": stored.meaning_cantonese,
        "example_sentence": stored.example_sentence,
        "source_context": stored.source_context,
        "personal_sentence": stored.personal_sentence,
        "category": stored.category,
        "pronunciation_note": stored.pronunciation_note,
        "status": stored.status,
        "confidence_label": getattr(stored, "confidence_label", None),
        "next_review_date": _date_or_none(stored.next_review_date),
        "last_reviewed_at": stored.last_reviewed_at.isoformat() if stored.last_reviewed_at else None,
        "review_stage": stored.review_stage,
        "promoted_at": stored.promoted_at.isoformat() if stored.promoted_at else None,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_vocabulary_review(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "vocabulary_item_id": stored.vocabulary_item_id,
        "review_date": _date_or_none(stored.review_date),
        "confidence_score": stored.confidence_score,
        "result": stored.result,
        "notes": stored.notes,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_speaking_session(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "topic": stored.topic,
        "prompt": stored.prompt,
        "attempt_one_notes": stored.attempt_one_notes,
        "attempt_two_notes": stored.attempt_two_notes,
        "reflection": stored.reflection,
        "session_date": _date_or_none(stored.session_date),
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_interview_question(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "question": stored.question,
        "category": stored.category,
        "notes": stored.notes,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_interview_practice(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "question_id": stored.question_id,
        "question_text": getattr(stored, "question_text", None),
        "practice_date": _date_or_none(stored.practice_date),
        "answer_notes": stored.answer_notes,
        "follow_up_notes": stored.follow_up_notes,
        "confidence_score": stored.confidence_score,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_star_story(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "title": stored.title,
        "situation": stored.situation,
        "task": stored.task,
        "action": stored.action,
        "result": stored.result,
        "target_skill": stored.target_skill,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_weekly_review(stored) -> dict[str, Any]:
    return {
        "id": stored.id,
        "week_start_date": _date_or_none(stored.week_start_date),
        "summary": stored.summary,
        "wins": stored.wins,
        "stretch_area": stored.stretch_area,
        "next_focus": stored.next_focus,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def serialize_english_progress(progress: dict[str, Any]) -> dict[str, Any]:
    return {
        "journals": progress.get("journals", 0),
        "active_books": progress.get("active_books", 0),
        "completed_books": progress.get("completed_books", 0),
        "listening_sessions": progress.get("listening_sessions", 0),
        "lookups": progress.get("lookups", 0),
        "active_vocabulary": progress.get("active_vocabulary", 0),
        "reviews_due": progress.get("reviews_due", 0),
        "reviews_completed": progress.get("reviews_completed", 0),
        "speaking_sessions": progress.get("speaking_sessions", 0),
        "interview_practices": progress.get("interview_practices", 0),
        "star_stories": progress.get("star_stories", 0),
    }


def serialize_english_dashboard(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "journal_prompt": payload.get("journal_prompt"),
        "latest_journal": serialize_english_journal_entry(payload["latest_journal"]) if payload.get("latest_journal") else None,
        "active_book": serialize_english_reading_book(payload["active_book"]) if payload.get("active_book") else None,
        "recent_books": [serialize_english_reading_book(item) for item in payload.get("recent_books", [])],
        "listening_spotlight": serialize_english_listening_session(payload["listening_spotlight"]) if payload.get("listening_spotlight") else None,
        "weekly_review": serialize_english_weekly_review(payload["weekly_review"]) if payload.get("weekly_review") else None,
        "progress": serialize_english_progress(payload.get("progress", {})),
        "recent_activity": payload.get("recent_activity", {}),
    }
