"""Validation helpers and English Learning domain models."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from src.models import ValidationError


@dataclass(frozen=True)
class EnglishWritingIssue:
    issue_type: str
    original_text: str | None
    suggested_text: str | None
    explanation: str | None


@dataclass(frozen=True)
class EnglishJournalEntry:
    entry_date: date
    prompt: str | None
    content: str
    clarity_notes: str | None
    vocabulary_notes: str | None
    grammar_notes: str | None
    mood_score: int | None
    confidence_score: int | None
    writing_issues: tuple[EnglishWritingIssue, ...]


@dataclass(frozen=True)
class EnglishReadingBook:
    title: str
    current_page: int
    total_pages: int | None
    status: str
    last_updated_date: date


@dataclass(frozen=True)
class EnglishListeningSource:
    title: str
    source_type: str
    url: str | None
    notes: str | None
    is_active: bool


@dataclass(frozen=True)
class EnglishListeningSession:
    source_id: str | None
    session_date: date
    focus_area: str | None
    notes: str | None
    reflection: str | None
    difficulty_score: int | None
    second_pass_completed: bool


@dataclass(frozen=True)
class EnglishWordLookup:
    phrase: str
    item_type: str
    learning_classification: str
    familiarity_status: str
    meaning: str | None
    meaning_cantonese: str | None
    example_sentence: str | None
    source_context: str | None
    pronunciation_note: str | None
    is_promoted: bool
    status: str


@dataclass(frozen=True)
class EnglishVocabularyItem:
    lookup_id: str | None
    phrase: str
    item_type: str
    learning_classification: str
    familiarity_status: str
    meaning: str | None
    meaning_cantonese: str | None
    example_sentence: str | None
    source_context: str | None
    personal_sentence: str
    category: str | None
    pronunciation_note: str | None
    status: str
    next_review_date: date
    review_stage: int


@dataclass(frozen=True)
class EnglishVocabularyReview:
    vocabulary_item_id: str
    review_date: date
    confidence_score: int
    result: str
    notes: str | None


@dataclass(frozen=True)
class EnglishSpeakingSession:
    topic: str
    prompt: str | None
    attempt_one_notes: str | None
    attempt_two_notes: str | None
    reflection: str | None
    session_date: date


@dataclass(frozen=True)
class EnglishInterviewQuestion:
    question: str
    category: str | None
    notes: str | None


@dataclass(frozen=True)
class EnglishInterviewPractice:
    question_id: str | None
    practice_date: date
    answer_notes: str | None
    follow_up_notes: str | None
    confidence_score: int | None


@dataclass(frozen=True)
class EnglishStarStory:
    title: str
    situation: str
    task: str
    action: str
    result: str
    target_skill: str | None


@dataclass(frozen=True)
class EnglishWeeklyReview:
    week_start_date: date
    summary: str | None
    wins: str | None
    stretch_area: str | None
    next_focus: str | None


VOCABULARY_ITEM_TYPES = {"WORD", "PHRASE"}
VOCABULARY_LEARNING_CLASSIFICATIONS = {
    "A_UNDERSTAND_FOR_NOW",
    "B_RECOGNISE",
    "C_ACTIVELY_LEARN",
}
VOCABULARY_LOOKUP_STATUSES = {"inbox", "promoted", "archived"}
VOCABULARY_ACTIVE_STATUSES = {"active", "paused", "mastered"}
VOCABULARY_FAMILIARITY_STATUSES = {
    "NEW",
    "FAMILIAR_BUT_FORGOTTEN",
    "REFRESHED",
    "CONFIDENT",
}
VOCABULARY_REVIEW_INTERVALS = [1, 3, 7, 14, 30]


def _normalize_text(value: Any, field_name: str, *, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise ValidationError(f"{field_name} is required.")
        return None
    text = str(value).strip()
    if not text:
        if required:
            raise ValidationError(f"{field_name} is required.")
        return None
    return " ".join(text.split())


def _parse_date(value: Any, field_name: str, *, default: date | None = None) -> date:
    if value in (None, ""):
        if default is not None:
            return default
        raise ValidationError(f"{field_name} is required.")
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError(f"{field_name} must use YYYY-MM-DD.") from exc


def _parse_int(
    value: Any,
    field_name: str,
    *,
    required: bool = False,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int | None:
    if value in (None, ""):
        if required:
            raise ValidationError(f"{field_name} is required.")
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be a whole number.") from exc
    if minimum is not None and parsed < minimum:
        raise ValidationError(f"{field_name} must be at least {minimum}.")
    if maximum is not None and parsed > maximum:
        raise ValidationError(f"{field_name} must be at most {maximum}.")
    return parsed


def _parse_bool(value: Any, field_name: str, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    raise ValidationError(f"{field_name} must be true or false.")


def infer_vocabulary_item_type(text: Any) -> str:
    normalized = _normalize_text(text, "phrase", required=True) or ""
    if " " in normalized:
        return "PHRASE"
    return "WORD"


def vocabulary_confidence_label(review_stage: int) -> str:
    if review_stage <= 0:
        return "New"
    if review_stage == 1:
        return "Recognise"
    if review_stage == 2:
        return "Can use with help"
    if review_stage == 3:
        return "Can use independently"
    return "Mastered"


def vocabulary_familiarity_label(value: str) -> str:
    labels = {
        "NEW": "New",
        "FAMILIAR_BUT_FORGOTTEN": "Familiar but forgotten",
        "REFRESHED": "Refreshed",
        "CONFIDENT": "Confident",
    }
    return labels.get(value, "New")


def validate_writing_issue(data: dict[str, Any]) -> EnglishWritingIssue:
    return EnglishWritingIssue(
        issue_type=_normalize_text(data.get("issue_type"), "issue_type", required=True) or "",
        original_text=_normalize_text(data.get("original_text"), "original_text"),
        suggested_text=_normalize_text(data.get("suggested_text"), "suggested_text"),
        explanation=_normalize_text(data.get("explanation"), "explanation"),
    )


def validate_journal_entry(data: dict[str, Any]) -> EnglishJournalEntry:
    issues = tuple(
        validate_writing_issue(item)
        for item in (data.get("writing_issues") or [])
        if item is not None
    )
    return EnglishJournalEntry(
        entry_date=_parse_date(data.get("entry_date"), "entry_date", default=date.today()),
        prompt=_normalize_text(data.get("prompt"), "prompt"),
        content=_normalize_text(data.get("content"), "content", required=True) or "",
        clarity_notes=_normalize_text(data.get("clarity_notes"), "clarity_notes"),
        vocabulary_notes=_normalize_text(data.get("vocabulary_notes"), "vocabulary_notes"),
        grammar_notes=_normalize_text(data.get("grammar_notes"), "grammar_notes"),
        mood_score=_parse_int(data.get("mood_score"), "mood_score", minimum=1, maximum=5),
        confidence_score=_parse_int(data.get("confidence_score"), "confidence_score", minimum=1, maximum=5),
        writing_issues=issues,
    )


def validate_reading_book(data: dict[str, Any]) -> EnglishReadingBook:
    status = _normalize_text(data.get("status"), "status") or "reading"
    if status not in {"reading", "completed"}:
        raise ValidationError("status must be 'reading' or 'completed'.")
    return EnglishReadingBook(
        title=_normalize_text(data.get("title"), "title", required=True) or "",
        current_page=_parse_int(data.get("current_page"), "current_page", required=True, minimum=0) or 0,
        total_pages=_parse_int(data.get("total_pages"), "total_pages", minimum=1),
        status=status,
        last_updated_date=_parse_date(data.get("last_updated_date"), "last_updated_date", default=date.today()),
    )


def validate_listening_source(data: dict[str, Any]) -> EnglishListeningSource:
    return EnglishListeningSource(
        title=_normalize_text(data.get("title"), "title", required=True) or "",
        source_type=_normalize_text(data.get("source_type"), "source_type") or "podcast",
        url=_normalize_text(data.get("url"), "url"),
        notes=_normalize_text(data.get("notes"), "notes"),
        is_active=_parse_bool(data.get("is_active"), "is_active", default=True),
    )


def validate_listening_session(data: dict[str, Any]) -> EnglishListeningSession:
    return EnglishListeningSession(
        source_id=_normalize_text(data.get("source_id"), "source_id"),
        session_date=_parse_date(data.get("session_date"), "session_date", default=date.today()),
        focus_area=_normalize_text(data.get("focus_area"), "focus_area"),
        notes=_normalize_text(data.get("notes"), "notes"),
        reflection=_normalize_text(data.get("reflection"), "reflection"),
        difficulty_score=_parse_int(data.get("difficulty_score"), "difficulty_score", minimum=1, maximum=5),
        second_pass_completed=_parse_bool(data.get("second_pass_completed"), "second_pass_completed", default=False),
    )


def validate_word_lookup(data: dict[str, Any]) -> EnglishWordLookup:
    item_type = _normalize_text(data.get("item_type"), "item_type") or infer_vocabulary_item_type(data.get("phrase"))
    if item_type not in VOCABULARY_ITEM_TYPES:
        raise ValidationError("item_type must be WORD or PHRASE.")
    learning_classification = _normalize_text(data.get("learning_classification"), "learning_classification") or "A_UNDERSTAND_FOR_NOW"
    if learning_classification not in VOCABULARY_LEARNING_CLASSIFICATIONS:
        raise ValidationError("learning_classification must be A_UNDERSTAND_FOR_NOW, B_RECOGNISE, or C_ACTIVELY_LEARN.")
    familiarity_status = _normalize_text(data.get("familiarity_status"), "familiarity_status") or "NEW"
    if familiarity_status not in VOCABULARY_FAMILIARITY_STATUSES:
        raise ValidationError("familiarity_status must be NEW, FAMILIAR_BUT_FORGOTTEN, REFRESHED, or CONFIDENT.")
    status = _normalize_text(data.get("status"), "status") or "inbox"
    if status not in VOCABULARY_LOOKUP_STATUSES:
        raise ValidationError("status must be inbox, promoted, or archived.")
    return EnglishWordLookup(
        phrase=_normalize_text(data.get("phrase"), "phrase", required=True) or "",
        item_type=item_type,
        learning_classification=learning_classification,
        familiarity_status=familiarity_status,
        meaning=_normalize_text(data.get("meaning"), "meaning"),
        meaning_cantonese=_normalize_text(data.get("meaning_cantonese"), "meaning_cantonese"),
        example_sentence=_normalize_text(data.get("example_sentence"), "example_sentence"),
        source_context=_normalize_text(data.get("source_context"), "source_context"),
        pronunciation_note=_normalize_text(data.get("pronunciation_note"), "pronunciation_note"),
        is_promoted=_parse_bool(data.get("is_promoted"), "is_promoted", default=False),
        status=status,
    )


def validate_vocabulary_item(data: dict[str, Any]) -> EnglishVocabularyItem:
    status = _normalize_text(data.get("status"), "status") or "active"
    if status not in VOCABULARY_ACTIVE_STATUSES:
        raise ValidationError("status must be active, paused, or mastered.")
    item_type = _normalize_text(data.get("item_type"), "item_type", required=True) or ""
    if item_type not in VOCABULARY_ITEM_TYPES:
        raise ValidationError("item_type must be WORD or PHRASE.")
    learning_classification = _normalize_text(data.get("learning_classification"), "learning_classification", required=True) or ""
    if learning_classification not in VOCABULARY_LEARNING_CLASSIFICATIONS:
        raise ValidationError("learning_classification must be A_UNDERSTAND_FOR_NOW, B_RECOGNISE, or C_ACTIVELY_LEARN.")
    familiarity_status = _normalize_text(data.get("familiarity_status"), "familiarity_status") or "NEW"
    if familiarity_status not in VOCABULARY_FAMILIARITY_STATUSES:
        raise ValidationError("familiarity_status must be NEW, FAMILIAR_BUT_FORGOTTEN, REFRESHED, or CONFIDENT.")
    if learning_classification != "C_ACTIVELY_LEARN":
        raise ValidationError("Only C_ACTIVELY_LEARN items can be stored in active vocabulary.")
    personal_sentence = _normalize_text(data.get("personal_sentence"), "personal_sentence")
    if learning_classification == "C_ACTIVELY_LEARN" and not personal_sentence:
        raise ValidationError("personal_sentence is required for active vocabulary.")
    return EnglishVocabularyItem(
        lookup_id=_normalize_text(data.get("lookup_id"), "lookup_id"),
        phrase=_normalize_text(data.get("phrase"), "phrase", required=True) or "",
        item_type=item_type,
        learning_classification=learning_classification,
        familiarity_status=familiarity_status,
        meaning=_normalize_text(data.get("meaning"), "meaning"),
        meaning_cantonese=_normalize_text(data.get("meaning_cantonese"), "meaning_cantonese"),
        example_sentence=_normalize_text(data.get("example_sentence"), "example_sentence"),
        source_context=_normalize_text(data.get("source_context"), "source_context"),
        personal_sentence=personal_sentence or "",
        category=_normalize_text(data.get("category"), "category"),
        pronunciation_note=_normalize_text(data.get("pronunciation_note"), "pronunciation_note"),
        status=status,
        next_review_date=_parse_date(data.get("next_review_date"), "next_review_date", default=date.today()),
        review_stage=_parse_int(data.get("review_stage"), "review_stage", minimum=0) or 0,
    )


def validate_vocabulary_review(data: dict[str, Any]) -> EnglishVocabularyReview:
    result = _normalize_text(data.get("result"), "result") or "completed"
    if result not in {"completed", "again", "hard", "easy"}:
        raise ValidationError("result must be completed, again, hard, or easy.")
    return EnglishVocabularyReview(
        vocabulary_item_id=_normalize_text(data.get("vocabulary_item_id"), "vocabulary_item_id", required=True) or "",
        review_date=_parse_date(data.get("review_date"), "review_date", default=date.today()),
        confidence_score=_parse_int(data.get("confidence_score"), "confidence_score", required=True, minimum=1, maximum=5) or 1,
        result=result,
        notes=_normalize_text(data.get("notes"), "notes"),
    )


def validate_speaking_session(data: dict[str, Any]) -> EnglishSpeakingSession:
    return EnglishSpeakingSession(
        topic=_normalize_text(data.get("topic"), "topic", required=True) or "",
        prompt=_normalize_text(data.get("prompt"), "prompt"),
        attempt_one_notes=_normalize_text(data.get("attempt_one_notes"), "attempt_one_notes"),
        attempt_two_notes=_normalize_text(data.get("attempt_two_notes"), "attempt_two_notes"),
        reflection=_normalize_text(data.get("reflection"), "reflection"),
        session_date=_parse_date(data.get("session_date"), "session_date", default=date.today()),
    )


def validate_interview_question(data: dict[str, Any]) -> EnglishInterviewQuestion:
    return EnglishInterviewQuestion(
        question=_normalize_text(data.get("question"), "question", required=True) or "",
        category=_normalize_text(data.get("category"), "category"),
        notes=_normalize_text(data.get("notes"), "notes"),
    )


def validate_interview_practice(data: dict[str, Any]) -> EnglishInterviewPractice:
    return EnglishInterviewPractice(
        question_id=_normalize_text(data.get("question_id"), "question_id"),
        practice_date=_parse_date(data.get("practice_date"), "practice_date", default=date.today()),
        answer_notes=_normalize_text(data.get("answer_notes"), "answer_notes"),
        follow_up_notes=_normalize_text(data.get("follow_up_notes"), "follow_up_notes"),
        confidence_score=_parse_int(data.get("confidence_score"), "confidence_score", minimum=1, maximum=5),
    )


def validate_star_story(data: dict[str, Any]) -> EnglishStarStory:
    return EnglishStarStory(
        title=_normalize_text(data.get("title"), "title", required=True) or "",
        situation=_normalize_text(data.get("situation"), "situation", required=True) or "",
        task=_normalize_text(data.get("task"), "task", required=True) or "",
        action=_normalize_text(data.get("action"), "action", required=True) or "",
        result=_normalize_text(data.get("result"), "result", required=True) or "",
        target_skill=_normalize_text(data.get("target_skill"), "target_skill"),
    )


def validate_weekly_review(data: dict[str, Any]) -> EnglishWeeklyReview:
    return EnglishWeeklyReview(
        week_start_date=_parse_date(data.get("week_start_date"), "week_start_date", default=start_of_week(date.today())),
        summary=_normalize_text(data.get("summary"), "summary"),
        wins=_normalize_text(data.get("wins"), "wins"),
        stretch_area=_normalize_text(data.get("stretch_area"), "stretch_area"),
        next_focus=_normalize_text(data.get("next_focus"), "next_focus"),
    )


def start_of_week(value: date) -> date:
    return value - timedelta(days=value.weekday())


def next_review_for_result(base_date: date, *, current_stage: int, result: str) -> tuple[date, int]:
    if result == "again":
        return (base_date + timedelta(days=1), 0)
    if result == "hard":
        next_stage = min(max(current_stage, 0) + 1, len(VOCABULARY_REVIEW_INTERVALS))
        interval = VOCABULARY_REVIEW_INTERVALS[max(0, min(next_stage - 1, len(VOCABULARY_REVIEW_INTERVALS) - 1))]
        return (base_date + timedelta(days=interval), next_stage)
    if result == "easy":
        next_stage = min(max(current_stage, 0) + 2, len(VOCABULARY_REVIEW_INTERVALS))
        interval = VOCABULARY_REVIEW_INTERVALS[max(0, min(next_stage - 1, len(VOCABULARY_REVIEW_INTERVALS) - 1))]
        return (base_date + timedelta(days=interval), next_stage)
    next_stage = min(max(current_stage, 0) + 1, len(VOCABULARY_REVIEW_INTERVALS))
    interval = VOCABULARY_REVIEW_INTERVALS[max(0, min(next_stage - 1, len(VOCABULARY_REVIEW_INTERVALS) - 1))]
    return (base_date + timedelta(days=interval), next_stage)


def generate_weekly_summary(*, week_start_date: date, counts: dict[str, int]) -> dict[str, str]:
    week_end = week_start_date + timedelta(days=6)
    summary = (
        f"Week of {week_start_date.isoformat()} to {week_end.isoformat()}: "
        f"{counts.get('journals', 0)} journals, "
        f"{counts.get('listening_sessions', 0)} listening sessions, "
        f"{counts.get('reviews_completed', 0)} vocabulary reviews, and "
        f"{counts.get('speaking_sessions', 0)} speaking practices."
    )
    wins = (
        f"Active reading books: {counts.get('active_books', 0)}. "
        f"Interview practices: {counts.get('interview_practices', 0)}."
    )
    stretch = "Keep using new phrases in speaking and journal entries."
    next_focus = "Choose one vocabulary phrase and one interview answer to repeat next week."
    return {
        "summary": summary,
        "wins": wins,
        "stretch_area": stretch,
        "next_focus": next_focus,
    }
