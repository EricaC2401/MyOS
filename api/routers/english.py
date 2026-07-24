"""English Learning endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

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
    serialize_english_vocabulary_review,
    serialize_english_weekly_review,
    serialize_english_word_lookup,
)
from src.db import DatabaseSchemaError, DatabaseConnectionError
from src.english_db import (
    create_interview_practice,
    create_interview_question,
    create_journal_entry,
    create_listening_session,
    create_listening_source,
    create_or_update_weekly_review,
    create_reading_book,
    create_speaking_session,
    create_star_story,
    create_vocabulary_item,
    create_word_lookup,
    delete_reading_book,
    export_english_data,
    fetch_dashboard_payload,
    fetch_progress_counts,
    generate_and_save_weekly_review,
    list_interview_practice,
    list_interview_questions,
    list_journal_entries,
    list_listening_sessions,
    list_listening_sources,
    list_reading_books,
    list_speaking_sessions,
    list_star_stories,
    list_vocabulary_items,
    list_weekly_reviews,
    list_word_lookups,
    promote_lookup_to_vocabulary,
    update_journal_entry,
    update_reading_book,
    update_vocabulary_item,
    update_word_lookup,
    complete_vocabulary_review,
)
from src.english_models import (
    validate_interview_practice,
    validate_interview_question,
    validate_journal_entry,
    validate_listening_session,
    validate_listening_source,
    validate_reading_book,
    validate_speaking_session,
    validate_star_story,
    validate_vocabulary_item,
    validate_vocabulary_review,
    validate_weekly_review,
    validate_word_lookup,
)


router = APIRouter(prefix="/english", tags=["english"])


def _empty_progress_payload() -> dict[str, int]:
    return {
        "journals": 0,
        "active_books": 0,
        "completed_books": 0,
        "listening_sessions": 0,
        "lookups": 0,
        "active_vocabulary": 0,
        "reviews_due": 0,
        "reviews_completed": 0,
        "speaking_sessions": 0,
        "interview_practices": 0,
        "star_stories": 0,
    }


def _empty_dashboard_payload() -> dict:
    progress = _empty_progress_payload()
    return {
        "journal_prompt": "Write 3-5 sentences about a real work or study moment from this week.",
        "latest_journal": None,
        "active_book": None,
        "recent_books": [],
        "listening_spotlight": None,
        "weekly_review": None,
        "progress": progress,
        "recent_activity": {
            "journals": progress["journals"],
            "reviews_due": progress["reviews_due"],
            "active_vocabulary": progress["active_vocabulary"],
            "speaking_sessions": progress["speaking_sessions"],
        },
        "setup_required": True,
    }


def _is_english_read_fallback(exc: Exception) -> bool:
    return isinstance(exc, (DatabaseSchemaError, DatabaseConnectionError))


class WritingIssuePayload(BaseModel):
    issue_type: str
    original_text: str | None = None
    suggested_text: str | None = None
    explanation: str | None = None


class JournalPayload(BaseModel):
    entry_date: str | None = None
    prompt: str | None = None
    content: str
    clarity_notes: str | None = None
    vocabulary_notes: str | None = None
    grammar_notes: str | None = None
    mood_score: int | None = None
    confidence_score: int | None = None
    writing_issues: list[WritingIssuePayload] = []


class ReadingBookPayload(BaseModel):
    title: str
    current_page: int
    total_pages: int | None = None
    status: str = "reading"
    last_updated_date: str | None = None


class ListeningSourcePayload(BaseModel):
    title: str
    source_type: str = "podcast"
    url: str | None = None
    notes: str | None = None
    is_active: bool = True


class ListeningSessionPayload(BaseModel):
    source_id: str | None = None
    session_date: str | None = None
    focus_area: str | None = None
    notes: str | None = None
    reflection: str | None = None
    difficulty_score: int | None = None
    second_pass_completed: bool = False


class WordLookupPayload(BaseModel):
    phrase: str
    item_type: str | None = None
    learning_classification: str = "A_UNDERSTAND_FOR_NOW"
    familiarity_status: str = "NEW"
    meaning: str | None = None
    meaning_cantonese: str | None = None
    example_sentence: str | None = None
    source_context: str | None = None
    pronunciation_note: str | None = None
    is_promoted: bool = False
    status: str = "inbox"


class VocabularyItemPayload(BaseModel):
    lookup_id: str | None = None
    phrase: str
    item_type: str
    learning_classification: str
    familiarity_status: str = "NEW"
    meaning: str | None = None
    meaning_cantonese: str | None = None
    example_sentence: str | None = None
    source_context: str | None = None
    personal_sentence: str
    category: str | None = None
    pronunciation_note: str | None = None
    status: str = "active"
    next_review_date: str | None = None
    review_stage: int = 0


class VocabularyPromotionPayload(BaseModel):
    personal_sentence: str
    category: str | None = None
    pronunciation_note: str | None = None
    meaning_cantonese: str | None = None
    next_review_date: str | None = None
    force: bool = False


class VocabularyReviewPayload(BaseModel):
    vocabulary_item_id: str
    review_date: str | None = None
    confidence_score: int
    result: str = "completed"
    notes: str | None = None


class SpeakingSessionPayload(BaseModel):
    topic: str
    prompt: str | None = None
    attempt_one_notes: str | None = None
    attempt_two_notes: str | None = None
    reflection: str | None = None
    session_date: str | None = None


class InterviewQuestionPayload(BaseModel):
    question: str
    category: str | None = None
    notes: str | None = None


class InterviewPracticePayload(BaseModel):
    question_id: str | None = None
    practice_date: str | None = None
    answer_notes: str | None = None
    follow_up_notes: str | None = None
    confidence_score: int | None = None


class StarStoryPayload(BaseModel):
    title: str
    situation: str
    task: str
    action: str
    result: str
    target_skill: str | None = None


class WeeklyReviewPayload(BaseModel):
    week_start_date: str | None = None
    summary: str | None = None
    wins: str | None = None
    stretch_area: str | None = None
    next_focus: str | None = None


@router.get("/dashboard")
def english_dashboard():
    try:
        return serialize_english_dashboard(fetch_dashboard_payload())
    except Exception as exc:
        if _is_english_read_fallback(exc):
            payload = serialize_english_dashboard(_empty_dashboard_payload())
            payload["warning"] = str(exc)
            return payload
        raise


@router.get("/journal")
def english_journal(limit: int = Query(20, ge=1, le=200)):
    try:
        return [serialize_english_journal_entry(item) for item in list_journal_entries(limit=limit)]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/journal")
def create_english_journal(body: JournalPayload):
    stored = create_journal_entry(validate_journal_entry(body.model_dump()))
    return serialize_english_journal_entry(stored)


@router.put("/journal/{entry_id}")
def edit_english_journal(entry_id: str, body: JournalPayload):
    stored = update_journal_entry(entry_id, validate_journal_entry(body.model_dump()))
    if stored is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return serialize_english_journal_entry(stored)


@router.get("/reading-books")
def english_reading_books():
    try:
        return [serialize_english_reading_book(item) for item in list_reading_books()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/reading-books")
def create_english_reading_book(body: ReadingBookPayload):
    stored = create_reading_book(validate_reading_book(body.model_dump()))
    return serialize_english_reading_book(stored)


@router.put("/reading-books/{book_id}")
def edit_english_reading_book(book_id: str, body: ReadingBookPayload):
    stored = update_reading_book(book_id, validate_reading_book(body.model_dump()))
    if stored is None:
        raise HTTPException(status_code=404, detail="Reading book not found.")
    return serialize_english_reading_book(stored)


@router.delete("/reading-books/{book_id}")
def remove_english_reading_book(book_id: str):
    delete_reading_book(book_id)
    return {"ok": True}


@router.get("/listening-sources")
def english_listening_sources():
    try:
        return [serialize_english_listening_source(item) for item in list_listening_sources()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/listening-sources")
def create_english_listening_source(body: ListeningSourcePayload):
    stored = create_listening_source(validate_listening_source(body.model_dump()))
    return serialize_english_listening_source(stored)


@router.get("/listening-sessions")
def english_listening_sessions(limit: int = Query(20, ge=1, le=200)):
    try:
        return [serialize_english_listening_session(item) for item in list_listening_sessions(limit=limit)]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/listening-sessions")
def create_english_listening_session(body: ListeningSessionPayload):
    stored = create_listening_session(validate_listening_session(body.model_dump()))
    return serialize_english_listening_session(stored)


@router.get("/word-lookups")
def english_word_lookups():
    try:
        return [serialize_english_word_lookup(item) for item in list_word_lookups()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/word-lookups")
def create_english_word_lookup(body: WordLookupPayload):
    stored = create_word_lookup(validate_word_lookup(body.model_dump()))
    return serialize_english_word_lookup(stored)


@router.put("/word-lookups/{lookup_id}")
def edit_english_word_lookup(lookup_id: str, body: WordLookupPayload):
    stored = update_word_lookup(lookup_id, validate_word_lookup(body.model_dump()))
    if stored is None:
        raise HTTPException(status_code=404, detail="Word lookup not found.")
    return serialize_english_word_lookup(stored)


@router.post("/word-lookups/{lookup_id}/promote")
def promote_word_lookup(lookup_id: str, body: VocabularyPromotionPayload):
    parsed_date = date.fromisoformat(body.next_review_date) if body.next_review_date else None
    stored = promote_lookup_to_vocabulary(
        lookup_id,
        personal_sentence=body.personal_sentence,
        category=body.category,
        pronunciation_note=body.pronunciation_note,
        meaning_cantonese=body.meaning_cantonese,
        next_review_date=parsed_date,
        force=body.force,
    )
    return serialize_english_vocabulary_item(stored)


@router.get("/vocabulary-items")
def english_vocabulary_items():
    try:
        return [serialize_english_vocabulary_item(item) for item in list_vocabulary_items()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/vocabulary-items")
def create_english_vocabulary_item(body: VocabularyItemPayload):
    stored = create_vocabulary_item(validate_vocabulary_item(body.model_dump()))
    return serialize_english_vocabulary_item(stored)


@router.put("/vocabulary-items/{item_id}")
def edit_english_vocabulary_item(item_id: str, body: VocabularyItemPayload):
    stored = update_vocabulary_item(item_id, validate_vocabulary_item(body.model_dump()))
    if stored is None:
        raise HTTPException(status_code=404, detail="Vocabulary item not found.")
    return serialize_english_vocabulary_item(stored)


@router.post("/vocabulary-reviews")
def create_english_vocabulary_review(body: VocabularyReviewPayload):
    review, item = complete_vocabulary_review(validate_vocabulary_review(body.model_dump()))
    return {
        "review": serialize_english_vocabulary_review(review),
        "item": serialize_english_vocabulary_item(item),
    }


@router.get("/speaking-sessions")
def english_speaking_sessions(limit: int = Query(20, ge=1, le=200)):
    try:
        return [serialize_english_speaking_session(item) for item in list_speaking_sessions(limit=limit)]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/speaking-sessions")
def create_english_speaking_session(body: SpeakingSessionPayload):
    stored = create_speaking_session(validate_speaking_session(body.model_dump()))
    return serialize_english_speaking_session(stored)


@router.get("/interview-questions")
def english_interview_questions():
    try:
        return [serialize_english_interview_question(item) for item in list_interview_questions()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/interview-questions")
def create_english_interview_question(body: InterviewQuestionPayload):
    stored = create_interview_question(validate_interview_question(body.model_dump()))
    return serialize_english_interview_question(stored)


@router.get("/interview-practice")
def english_interview_practice(limit: int = Query(20, ge=1, le=200)):
    try:
        return [serialize_english_interview_practice(item) for item in list_interview_practice(limit=limit)]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/interview-practice")
def create_english_interview_practice(body: InterviewPracticePayload):
    stored = create_interview_practice(validate_interview_practice(body.model_dump()))
    return serialize_english_interview_practice(stored)


@router.get("/star-stories")
def english_star_stories():
    try:
        return [serialize_english_star_story(item) for item in list_star_stories()]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/star-stories")
def create_english_star_story(body: StarStoryPayload):
    stored = create_star_story(validate_star_story(body.model_dump()))
    return serialize_english_star_story(stored)


@router.get("/weekly-reviews")
def english_weekly_reviews(limit: int = Query(12, ge=1, le=200)):
    try:
        return [serialize_english_weekly_review(item) for item in list_weekly_reviews(limit=limit)]
    except Exception as exc:
        if _is_english_read_fallback(exc):
            return []
        raise


@router.post("/weekly-reviews")
def create_english_weekly_review(body: WeeklyReviewPayload):
    stored = create_or_update_weekly_review(validate_weekly_review(body.model_dump()))
    return serialize_english_weekly_review(stored)


@router.post("/weekly-reviews/generate")
def generate_english_weekly_review(week_start_date: str | None = None):
    stored = generate_and_save_weekly_review(date.fromisoformat(week_start_date) if week_start_date else None)
    return serialize_english_weekly_review(stored)


@router.get("/progress")
def english_progress(start_date_param: str | None = Query(None, alias="start_date"), end_date_param: str | None = Query(None, alias="end_date")):
    start = date.fromisoformat(start_date_param) if start_date_param else None
    end = date.fromisoformat(end_date_param) if end_date_param else None
    try:
        return serialize_english_progress(fetch_progress_counts(start_date=start, end_date=end))
    except Exception as exc:
        if _is_english_read_fallback(exc):
            payload = serialize_english_progress(_empty_progress_payload())
            payload["warning"] = str(exc)
            return payload
        raise


@router.get("/export")
def english_export():
    payload = export_english_data()
    payload["dashboard"] = serialize_english_dashboard(payload["dashboard"])
    payload["journal_entries"] = [serialize_english_journal_entry(item) for item in payload["journal_entries"]]
    payload["reading_books"] = [serialize_english_reading_book(item) for item in payload["reading_books"]]
    payload["listening_sources"] = [serialize_english_listening_source(item) for item in payload["listening_sources"]]
    payload["listening_sessions"] = [serialize_english_listening_session(item) for item in payload["listening_sessions"]]
    payload["word_lookups"] = [serialize_english_word_lookup(item) for item in payload["word_lookups"]]
    payload["vocabulary_items"] = [serialize_english_vocabulary_item(item) for item in payload["vocabulary_items"]]
    payload["speaking_sessions"] = [serialize_english_speaking_session(item) for item in payload["speaking_sessions"]]
    payload["interview_questions"] = [serialize_english_interview_question(item) for item in payload["interview_questions"]]
    payload["interview_practice"] = [serialize_english_interview_practice(item) for item in payload["interview_practice"]]
    payload["star_stories"] = [serialize_english_star_story(item) for item in payload["star_stories"]]
    payload["weekly_reviews"] = [serialize_english_weekly_review(item) for item in payload["weekly_reviews"]]
    payload["progress"] = serialize_english_progress(payload["progress"])
    return payload
