"""Database helpers for English Learning tables."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from psycopg2.errors import UndefinedTable, UndefinedColumn

from src.db import (
    get_connection,
    _run_with_reconnect as _db_run_with_reconnect,
    _safe_rollback,
    DatabaseSchemaError,
)
from src.models import ValidationError
from src.english_models import (
    EnglishInterviewPractice,
    EnglishInterviewQuestion,
    EnglishJournalEntry,
    EnglishListeningSession,
    EnglishListeningSource,
    EnglishReadingBook,
    EnglishSpeakingSession,
    EnglishStarStory,
    EnglishVocabularyItem,
    EnglishVocabularyReview,
    EnglishWeeklyReview,
    EnglishWordLookup,
    generate_weekly_summary,
    next_review_for_result,
    start_of_week,
    vocabulary_confidence_label,
    vocabulary_familiarity_label,
)


ENGLISH_SCHEMA_HINT = (
    "English Learning tables are missing. Run app/sql/035_add_english_learning.sql in Supabase."
)


def _run_with_reconnect(operation):
    """Adapt the shared DB reconnect helper to this module's zero-arg operations."""

    return _db_run_with_reconnect(lambda _conn: operation())


@dataclass(frozen=True)
class StoredEnglishWritingIssue:
    id: str
    journal_entry_id: str
    issue_type: str
    original_text: str | None
    suggested_text: str | None
    explanation: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishJournalEntry:
    id: str
    entry_date: date
    prompt: str | None
    content: str
    clarity_notes: str | None
    vocabulary_notes: str | None
    grammar_notes: str | None
    mood_score: int | None
    confidence_score: int | None
    created_at: datetime
    updated_at: datetime
    writing_issues: tuple[StoredEnglishWritingIssue, ...] = ()


@dataclass(frozen=True)
class StoredEnglishReadingBook:
    id: str
    title: str
    current_page: int
    total_pages: int | None
    status: str
    last_updated_date: date
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishListeningSource:
    id: str
    title: str
    source_type: str
    url: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishListeningSession:
    id: str
    source_id: str | None
    source_title: str | None
    session_date: date
    focus_area: str | None
    notes: str | None
    reflection: str | None
    difficulty_score: int | None
    second_pass_completed: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishWordLookup:
    id: str
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
    promoted_at: datetime | None
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishVocabularyItem:
    id: str
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
    last_reviewed_at: datetime | None
    review_stage: int
    promoted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @property
    def confidence_label(self) -> str:
        return vocabulary_confidence_label(self.review_stage)

    @property
    def familiarity_label(self) -> str:
        return vocabulary_familiarity_label(self.familiarity_status)


@dataclass(frozen=True)
class StoredEnglishVocabularyReview:
    id: str
    vocabulary_item_id: str
    review_date: date
    confidence_score: int
    result: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishSpeakingSession:
    id: str
    topic: str
    prompt: str | None
    attempt_one_notes: str | None
    attempt_two_notes: str | None
    reflection: str | None
    session_date: date
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishInterviewQuestion:
    id: str
    question: str
    category: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishInterviewPractice:
    id: str
    question_id: str | None
    question_text: str | None
    practice_date: date
    answer_notes: str | None
    follow_up_notes: str | None
    confidence_score: int | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishStarStory:
    id: str
    title: str
    situation: str
    task: str
    action: str
    result: str
    target_skill: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEnglishWeeklyReview:
    id: str
    week_start_date: date
    summary: str | None
    wins: str | None
    stretch_area: str | None
    next_focus: str | None
    created_at: datetime
    updated_at: datetime


def _raise_schema_error(exc: Exception) -> None:
    raise DatabaseSchemaError(ENGLISH_SCHEMA_HINT) from exc


def _fetchall(cur, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    try:
        cur.execute(sql, params)
        return list(cur.fetchall())
    except (UndefinedTable, UndefinedColumn) as exc:
        _raise_schema_error(exc)


def _fetchone(cur, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    try:
        cur.execute(sql, params)
        return cur.fetchone()
    except (UndefinedTable, UndefinedColumn) as exc:
        _raise_schema_error(exc)


def _execute(cur, sql: str, params: tuple[Any, ...] = ()) -> None:
    try:
        cur.execute(sql, params)
    except (UndefinedTable, UndefinedColumn) as exc:
        _raise_schema_error(exc)


def _row_value(row: Any, key: str, default: Any = None) -> Any:
    try:
        return row[key]
    except (KeyError, TypeError, IndexError):
        return default


def _row_to_writing_issue(row: dict[str, Any]) -> StoredEnglishWritingIssue:
    return StoredEnglishWritingIssue(
        id=str(row["id"]),
        journal_entry_id=str(row["journal_entry_id"]),
        issue_type=row["issue_type"],
        original_text=_row_value(row, "original_text"),
        suggested_text=_row_value(row, "suggested_text"),
        explanation=_row_value(row, "explanation"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_journal_entry(row: dict[str, Any], issues: tuple[StoredEnglishWritingIssue, ...] = ()) -> StoredEnglishJournalEntry:
    return StoredEnglishJournalEntry(
        id=str(row["id"]),
        entry_date=row["entry_date"],
        prompt=_row_value(row, "prompt"),
        content=row["content"],
        clarity_notes=_row_value(row, "clarity_notes"),
        vocabulary_notes=_row_value(row, "vocabulary_notes"),
        grammar_notes=_row_value(row, "grammar_notes"),
        mood_score=_row_value(row, "mood_score"),
        confidence_score=_row_value(row, "confidence_score"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        writing_issues=issues,
    )


def _row_to_reading_book(row: dict[str, Any]) -> StoredEnglishReadingBook:
    return StoredEnglishReadingBook(
        id=str(row["id"]),
        title=row["title"],
        current_page=row["current_page"],
        total_pages=_row_value(row, "total_pages"),
        status=row["status"],
        last_updated_date=row["last_updated_date"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_listening_source(row: dict[str, Any]) -> StoredEnglishListeningSource:
    return StoredEnglishListeningSource(
        id=str(row["id"]),
        title=row["title"],
        source_type=row["source_type"],
        url=_row_value(row, "url"),
        notes=_row_value(row, "notes"),
        is_active=row["is_active"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_listening_session(row: dict[str, Any]) -> StoredEnglishListeningSession:
    return StoredEnglishListeningSession(
        id=str(row["id"]),
        source_id=str(row["source_id"]) if _row_value(row, "source_id") else None,
        source_title=_row_value(row, "source_title"),
        session_date=row["session_date"],
        focus_area=_row_value(row, "focus_area"),
        notes=_row_value(row, "notes"),
        reflection=_row_value(row, "reflection"),
        difficulty_score=_row_value(row, "difficulty_score"),
        second_pass_completed=row["second_pass_completed"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_word_lookup(row: dict[str, Any]) -> StoredEnglishWordLookup:
    return StoredEnglishWordLookup(
        id=str(row["id"]),
        phrase=row["phrase"],
        item_type=row["item_type"],
        learning_classification=row["learning_classification"],
        familiarity_status=_row_value(row, "familiarity_status") or "NEW",
        meaning=_row_value(row, "meaning"),
        meaning_cantonese=_row_value(row, "meaning_cantonese"),
        example_sentence=_row_value(row, "example_sentence"),
        source_context=_row_value(row, "source_context"),
        pronunciation_note=_row_value(row, "pronunciation_note"),
        is_promoted=bool(_row_value(row, "is_promoted")),
        promoted_at=_row_value(row, "promoted_at"),
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_vocabulary_item(row: dict[str, Any]) -> StoredEnglishVocabularyItem:
    return StoredEnglishVocabularyItem(
        id=str(row["id"]),
        lookup_id=str(row["lookup_id"]) if _row_value(row, "lookup_id") else None,
        phrase=row["phrase"],
        item_type=row["item_type"],
        learning_classification=row["learning_classification"],
        familiarity_status=_row_value(row, "familiarity_status") or "NEW",
        meaning=_row_value(row, "meaning"),
        meaning_cantonese=_row_value(row, "meaning_cantonese"),
        example_sentence=_row_value(row, "example_sentence"),
        source_context=_row_value(row, "source_context"),
        personal_sentence=row["personal_sentence"],
        category=_row_value(row, "category"),
        pronunciation_note=_row_value(row, "pronunciation_note"),
        status=row["status"],
        next_review_date=row["next_review_date"],
        last_reviewed_at=_row_value(row, "last_reviewed_at"),
        review_stage=row["review_stage"],
        promoted_at=_row_value(row, "promoted_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_vocabulary_review(row: dict[str, Any]) -> StoredEnglishVocabularyReview:
    return StoredEnglishVocabularyReview(
        id=str(row["id"]),
        vocabulary_item_id=str(row["vocabulary_item_id"]),
        review_date=row["review_date"],
        confidence_score=row["confidence_score"],
        result=row["result"],
        notes=_row_value(row, "notes"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_speaking_session(row: dict[str, Any]) -> StoredEnglishSpeakingSession:
    return StoredEnglishSpeakingSession(
        id=str(row["id"]),
        topic=row["topic"],
        prompt=_row_value(row, "prompt"),
        attempt_one_notes=_row_value(row, "attempt_one_notes"),
        attempt_two_notes=_row_value(row, "attempt_two_notes"),
        reflection=_row_value(row, "reflection"),
        session_date=row["session_date"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_interview_question(row: dict[str, Any]) -> StoredEnglishInterviewQuestion:
    return StoredEnglishInterviewQuestion(
        id=str(row["id"]),
        question=row["question"],
        category=_row_value(row, "category"),
        notes=_row_value(row, "notes"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_interview_practice(row: dict[str, Any]) -> StoredEnglishInterviewPractice:
    return StoredEnglishInterviewPractice(
        id=str(row["id"]),
        question_id=str(row["question_id"]) if _row_value(row, "question_id") else None,
        question_text=_row_value(row, "question_text"),
        practice_date=row["practice_date"],
        answer_notes=_row_value(row, "answer_notes"),
        follow_up_notes=_row_value(row, "follow_up_notes"),
        confidence_score=_row_value(row, "confidence_score"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_star_story(row: dict[str, Any]) -> StoredEnglishStarStory:
    return StoredEnglishStarStory(
        id=str(row["id"]),
        title=row["title"],
        situation=row["situation"],
        task=row["task"],
        action=row["action"],
        result=row["result"],
        target_skill=_row_value(row, "target_skill"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_weekly_review(row: dict[str, Any]) -> StoredEnglishWeeklyReview:
    return StoredEnglishWeeklyReview(
        id=str(row["id"]),
        week_start_date=row["week_start_date"],
        summary=_row_value(row, "summary"),
        wins=_row_value(row, "wins"),
        stretch_area=_row_value(row, "stretch_area"),
        next_focus=_row_value(row, "next_focus"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _replace_writing_issues(cur, journal_entry_id: str, issues) -> tuple[StoredEnglishWritingIssue, ...]:
    _execute(cur, "delete from public.english_writing_issues where journal_entry_id = %s;", (journal_entry_id,))
    stored = []
    for issue in issues:
        row = _fetchone(
            cur,
            """
            insert into public.english_writing_issues (
                journal_entry_id, issue_type, original_text, suggested_text, explanation
            )
            values (%s, %s, %s, %s, %s)
            returning *;
            """,
            (journal_entry_id, issue.issue_type, issue.original_text, issue.suggested_text, issue.explanation),
        )
        if row:
            stored.append(_row_to_writing_issue(row))
    return tuple(stored)


def list_journal_entries(limit: int = 20) -> list[StoredEnglishJournalEntry]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(
                cur,
                """
                select * from public.english_journal_entries
                order by entry_date desc, created_at desc
                limit %s;
                """,
                (limit,),
            )
            entries = []
            for row in rows:
                issues = _fetchall(
                    cur,
                    "select * from public.english_writing_issues where journal_entry_id = %s order by created_at asc;",
                    (row["id"],),
                )
                entries.append(_row_to_journal_entry(row, tuple(_row_to_writing_issue(item) for item in issues)))
            return entries
    return _run_with_reconnect(operation)


def create_journal_entry(entry: EnglishJournalEntry) -> StoredEnglishJournalEntry:
    def operation():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                row = _fetchone(
                    cur,
                    """
                    insert into public.english_journal_entries (
                        entry_date, prompt, content, clarity_notes, vocabulary_notes, grammar_notes, mood_score, confidence_score
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    returning *;
                    """,
                    (
                        entry.entry_date,
                        entry.prompt,
                        entry.content,
                        entry.clarity_notes,
                        entry.vocabulary_notes,
                        entry.grammar_notes,
                        entry.mood_score,
                        entry.confidence_score,
                    ),
                )
                issues = _replace_writing_issues(cur, str(row["id"]), entry.writing_issues)
            conn.commit()
            return _row_to_journal_entry(row, issues)
        except Exception:
            _safe_rollback(conn)
            raise
    return _run_with_reconnect(operation)


def update_journal_entry(entry_id: str, entry: EnglishJournalEntry) -> StoredEnglishJournalEntry | None:
    def operation():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                row = _fetchone(
                    cur,
                    """
                    update public.english_journal_entries
                    set entry_date = %s,
                        prompt = %s,
                        content = %s,
                        clarity_notes = %s,
                        vocabulary_notes = %s,
                        grammar_notes = %s,
                        mood_score = %s,
                        confidence_score = %s,
                        updated_at = now()
                    where id = %s
                    returning *;
                    """,
                    (
                        entry.entry_date,
                        entry.prompt,
                        entry.content,
                        entry.clarity_notes,
                        entry.vocabulary_notes,
                        entry.grammar_notes,
                        entry.mood_score,
                        entry.confidence_score,
                        entry_id,
                    ),
                )
                if row is None:
                    conn.rollback()
                    return None
                issues = _replace_writing_issues(cur, entry_id, entry.writing_issues)
            conn.commit()
            return _row_to_journal_entry(row, issues)
        except Exception:
            _safe_rollback(conn)
            raise
    return _run_with_reconnect(operation)


def list_reading_books() -> list[StoredEnglishReadingBook]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_reading_books order by status asc, updated_at desc;")
            return [_row_to_reading_book(row) for row in rows]
    return _run_with_reconnect(operation)


def create_reading_book(book: EnglishReadingBook) -> StoredEnglishReadingBook:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_reading_books (title, current_page, total_pages, status, last_updated_date)
                values (%s, %s, %s, %s, %s)
                returning *;
                """,
                (book.title, book.current_page, book.total_pages, book.status, book.last_updated_date),
            )
            conn.commit()
            return _row_to_reading_book(row)
    return _run_with_reconnect(operation)


def update_reading_book(book_id: str, book: EnglishReadingBook) -> StoredEnglishReadingBook | None:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                update public.english_reading_books
                set title = %s,
                    current_page = %s,
                    total_pages = %s,
                    status = %s,
                    last_updated_date = %s,
                    updated_at = now()
                where id = %s
                returning *;
                """,
                (book.title, book.current_page, book.total_pages, book.status, book.last_updated_date, book_id),
            )
            conn.commit()
            return _row_to_reading_book(row) if row else None
    return _run_with_reconnect(operation)


def delete_reading_book(book_id: str) -> None:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            _execute(cur, "delete from public.english_reading_books where id = %s;", (book_id,))
            conn.commit()
    _run_with_reconnect(operation)


def list_listening_sources() -> list[StoredEnglishListeningSource]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_listening_sources where is_active = true order by updated_at desc;")
            return [_row_to_listening_source(row) for row in rows]
    return _run_with_reconnect(operation)


def create_listening_source(source: EnglishListeningSource) -> StoredEnglishListeningSource:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_listening_sources (title, source_type, url, notes, is_active)
                values (%s, %s, %s, %s, %s)
                returning *;
                """,
                (source.title, source.source_type, source.url, source.notes, source.is_active),
            )
            conn.commit()
            return _row_to_listening_source(row)
    return _run_with_reconnect(operation)


def list_listening_sessions(limit: int = 20) -> list[StoredEnglishListeningSession]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(
                cur,
                """
                select s.*, src.title as source_title
                from public.english_listening_sessions s
                left join public.english_listening_sources src on src.id = s.source_id
                order by s.session_date desc, s.created_at desc
                limit %s;
                """,
                (limit,),
            )
            return [_row_to_listening_session(row) for row in rows]
    return _run_with_reconnect(operation)


def create_listening_session(session: EnglishListeningSession) -> StoredEnglishListeningSession:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_listening_sessions (
                    source_id, session_date, focus_area, notes, reflection, difficulty_score, second_pass_completed
                )
                values (%s, %s, %s, %s, %s, %s, %s)
                returning
                    id, source_id, null::text as source_title, session_date, focus_area, notes, reflection,
                    difficulty_score, second_pass_completed, created_at, updated_at;
                """,
                (
                    session.source_id,
                    session.session_date,
                    session.focus_area,
                    session.notes,
                    session.reflection,
                    session.difficulty_score,
                    session.second_pass_completed,
                ),
            )
            conn.commit()
            return _row_to_listening_session(row)
    return _run_with_reconnect(operation)


def list_word_lookups() -> list[StoredEnglishWordLookup]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_word_lookups order by updated_at desc;")
            return [_row_to_word_lookup(row) for row in rows]
    return _run_with_reconnect(operation)


def create_word_lookup(lookup: EnglishWordLookup) -> StoredEnglishWordLookup:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_word_lookups (
                    phrase, item_type, learning_classification, familiarity_status, meaning, meaning_cantonese,
                    example_sentence, source_context, pronunciation_note, is_promoted, status
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning *;
                """,
                (
                    lookup.phrase,
                    lookup.item_type,
                    lookup.learning_classification,
                    lookup.familiarity_status,
                    lookup.meaning,
                    lookup.meaning_cantonese,
                    lookup.example_sentence,
                    lookup.source_context,
                    lookup.pronunciation_note,
                    lookup.is_promoted,
                    lookup.status,
                ),
            )
            conn.commit()
            return _row_to_word_lookup(row)
    return _run_with_reconnect(operation)


def update_word_lookup(lookup_id: str, lookup: EnglishWordLookup) -> StoredEnglishWordLookup | None:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                update public.english_word_lookups
                set phrase = %s,
                    item_type = %s,
                    learning_classification = %s,
                    familiarity_status = %s,
                    meaning = %s,
                    meaning_cantonese = %s,
                    example_sentence = %s,
                    source_context = %s,
                    pronunciation_note = %s,
                    is_promoted = %s,
                    status = %s,
                    updated_at = now()
                where id = %s
                returning *;
                """,
                (
                    lookup.phrase,
                    lookup.item_type,
                    lookup.learning_classification,
                    lookup.familiarity_status,
                    lookup.meaning,
                    lookup.meaning_cantonese,
                    lookup.example_sentence,
                    lookup.source_context,
                    lookup.pronunciation_note,
                    lookup.is_promoted,
                    lookup.status,
                    lookup_id,
                ),
            )
            conn.commit()
            return _row_to_word_lookup(row) if row else None
    return _run_with_reconnect(operation)


def list_vocabulary_items() -> list[StoredEnglishVocabularyItem]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_vocabulary_items order by next_review_date asc, updated_at desc;")
            return [_row_to_vocabulary_item(row) for row in rows]
    return _run_with_reconnect(operation)


def create_vocabulary_item(item: EnglishVocabularyItem) -> StoredEnglishVocabularyItem:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_vocabulary_items (
                    lookup_id, phrase, item_type, learning_classification, familiarity_status, meaning, meaning_cantonese,
                    example_sentence, source_context, personal_sentence, category, pronunciation_note, status,
                    next_review_date, review_stage, promoted_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                returning *;
                """,
                (
                    item.lookup_id,
                    item.phrase,
                    item.item_type,
                    item.learning_classification,
                    item.familiarity_status,
                    item.meaning,
                    item.meaning_cantonese,
                    item.example_sentence,
                    item.source_context,
                    item.personal_sentence,
                    item.category,
                    item.pronunciation_note,
                    item.status,
                    item.next_review_date,
                    item.review_stage,
                ),
            )
            if item.lookup_id:
                _execute(
                    cur,
                    """
                    update public.english_word_lookups
                    set status = 'promoted',
                        is_promoted = true,
                        promoted_at = now(),
                        updated_at = now()
                    where id = %s;
                    """,
                    (item.lookup_id,),
                )
            conn.commit()
            return _row_to_vocabulary_item(row)
    return _run_with_reconnect(operation)


def update_vocabulary_item(item_id: str, item: EnglishVocabularyItem) -> StoredEnglishVocabularyItem | None:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                update public.english_vocabulary_items
                set phrase = %s,
                    item_type = %s,
                    learning_classification = %s,
                    familiarity_status = %s,
                    meaning = %s,
                    meaning_cantonese = %s,
                    example_sentence = %s,
                    source_context = %s,
                    personal_sentence = %s,
                    category = %s,
                    pronunciation_note = %s,
                    status = %s,
                    next_review_date = %s,
                    review_stage = %s,
                    updated_at = now()
                where id = %s
                returning *;
                """,
                (
                    item.phrase,
                    item.item_type,
                    item.learning_classification,
                    item.familiarity_status,
                    item.meaning,
                    item.meaning_cantonese,
                    item.example_sentence,
                    item.source_context,
                    item.personal_sentence,
                    item.category,
                    item.pronunciation_note,
                    item.status,
                    item.next_review_date,
                    item.review_stage,
                    item_id,
                ),
            )
            conn.commit()
            return _row_to_vocabulary_item(row) if row else None
    return _run_with_reconnect(operation)


def promote_lookup_to_vocabulary(
    lookup_id: str,
    *,
    personal_sentence: str,
    category: str | None = None,
    pronunciation_note: str | None = None,
    meaning_cantonese: str | None = None,
    next_review_date: date | None = None,
    force: bool = False,
) -> StoredEnglishVocabularyItem:
    def operation():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                lookup_row = _fetchone(cur, "select * from public.english_word_lookups where id = %s;", (lookup_id,))
                if lookup_row is None:
                    raise ValidationError("Word lookup not found.")
                if lookup_row["learning_classification"] != "C_ACTIVELY_LEARN":
                    raise ValidationError("Only C items can be promoted into active vocabulary.")
                existing = _fetchone(cur, "select * from public.english_vocabulary_items where lookup_id = %s;", (lookup_id,))
                if existing is not None:
                    conn.commit()
                    return _row_to_vocabulary_item(existing)
                today_count = _fetchone(
                    cur,
                    """
                    select count(*)::int as count
                    from public.english_vocabulary_items
                    where promoted_at::date = current_date;
                    """,
                )
                if not force and today_count and int(today_count["count"]) >= 3:
                    raise ValidationError(
                        "You already selected three items today. Consider keeping this item in the lookup inbox and reviewing it later."
                    )
                row = _fetchone(
                    cur,
                    """
                    insert into public.english_vocabulary_items (
                        lookup_id, phrase, item_type, learning_classification, familiarity_status, meaning, meaning_cantonese,
                        example_sentence, source_context, personal_sentence, category, pronunciation_note, status,
                        next_review_date, review_stage, promoted_at
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, 0, now())
                    returning *;
                    """,
                    (
                        lookup_id,
                        lookup_row["phrase"],
                        lookup_row["item_type"],
                        lookup_row["learning_classification"],
                        lookup_row["familiarity_status"],
                        _row_value(lookup_row, "meaning"),
                        meaning_cantonese or _row_value(lookup_row, "meaning_cantonese"),
                        _row_value(lookup_row, "example_sentence"),
                        _row_value(lookup_row, "source_context"),
                        personal_sentence,
                        category,
                        pronunciation_note or _row_value(lookup_row, "pronunciation_note"),
                        next_review_date or date.today(),
                    ),
                )
                _execute(
                    cur,
                    """
                    update public.english_word_lookups
                    set status = 'promoted',
                        is_promoted = true,
                        promoted_at = now(),
                        updated_at = now()
                    where id = %s;
                    """,
                    (lookup_id,),
                )
            conn.commit()
            return _row_to_vocabulary_item(row)
        except Exception:
            _safe_rollback(conn)
            raise
    return _run_with_reconnect(operation)


def complete_vocabulary_review(review: EnglishVocabularyReview) -> tuple[StoredEnglishVocabularyReview, StoredEnglishVocabularyItem]:
    def operation():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                item_row = _fetchone(cur, "select * from public.english_vocabulary_items where id = %s;", (review.vocabulary_item_id,))
                if item_row is None:
                    raise ValidationError("Vocabulary item not found.")
                item = _row_to_vocabulary_item(item_row)
                next_date, next_stage = next_review_for_result(
                    review.review_date,
                    current_stage=item.review_stage,
                    result=review.result,
                )
                review_row = _fetchone(
                    cur,
                    """
                    insert into public.english_vocabulary_reviews (
                        vocabulary_item_id, review_date, confidence_score, result, notes
                    )
                    values (%s, %s, %s, %s, %s)
                    returning *;
                    """,
                    (review.vocabulary_item_id, review.review_date, review.confidence_score, review.result, review.notes),
                )
                item_row = _fetchone(
                    cur,
                    """
                    update public.english_vocabulary_items
                    set next_review_date = %s,
                        last_reviewed_at = now(),
                        review_stage = %s,
                        status = case when %s >= 4 then 'mastered' else status end,
                        updated_at = now()
                    where id = %s
                    returning *;
                    """,
                    (next_date, next_stage, next_stage, review.vocabulary_item_id),
                )
            conn.commit()
            return _row_to_vocabulary_review(review_row), _row_to_vocabulary_item(item_row)
        except Exception:
            _safe_rollback(conn)
            raise
    return _run_with_reconnect(operation)


def list_speaking_sessions(limit: int = 20) -> list[StoredEnglishSpeakingSession]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_speaking_sessions order by session_date desc, created_at desc limit %s;", (limit,))
            return [_row_to_speaking_session(row) for row in rows]
    return _run_with_reconnect(operation)


def create_speaking_session(session: EnglishSpeakingSession) -> StoredEnglishSpeakingSession:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_speaking_sessions (
                    topic, prompt, attempt_one_notes, attempt_two_notes, reflection, session_date
                )
                values (%s, %s, %s, %s, %s, %s)
                returning *;
                """,
                (
                    session.topic,
                    session.prompt,
                    session.attempt_one_notes,
                    session.attempt_two_notes,
                    session.reflection,
                    session.session_date,
                ),
            )
            conn.commit()
            return _row_to_speaking_session(row)
    return _run_with_reconnect(operation)


def list_interview_questions() -> list[StoredEnglishInterviewQuestion]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_interview_questions order by created_at desc;")
            return [_row_to_interview_question(row) for row in rows]
    return _run_with_reconnect(operation)


def create_interview_question(question: EnglishInterviewQuestion) -> StoredEnglishInterviewQuestion:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_interview_questions (question, category, notes)
                values (%s, %s, %s)
                returning *;
                """,
                (question.question, question.category, question.notes),
            )
            conn.commit()
            return _row_to_interview_question(row)
    return _run_with_reconnect(operation)


def list_interview_practice(limit: int = 20) -> list[StoredEnglishInterviewPractice]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(
                cur,
                """
                select p.*, q.question as question_text
                from public.english_interview_practice p
                left join public.english_interview_questions q on q.id = p.question_id
                order by p.practice_date desc, p.created_at desc
                limit %s;
                """,
                (limit,),
            )
            return [_row_to_interview_practice(row) for row in rows]
    return _run_with_reconnect(operation)


def create_interview_practice(practice: EnglishInterviewPractice) -> StoredEnglishInterviewPractice:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_interview_practice (
                    question_id, practice_date, answer_notes, follow_up_notes, confidence_score
                )
                values (%s, %s, %s, %s, %s)
                returning
                    id, question_id, null::text as question_text, practice_date, answer_notes, follow_up_notes,
                    confidence_score, created_at, updated_at;
                """,
                (
                    practice.question_id,
                    practice.practice_date,
                    practice.answer_notes,
                    practice.follow_up_notes,
                    practice.confidence_score,
                ),
            )
            conn.commit()
            return _row_to_interview_practice(row)
    return _run_with_reconnect(operation)


def list_star_stories() -> list[StoredEnglishStarStory]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_star_stories order by updated_at desc;")
            return [_row_to_star_story(row) for row in rows]
    return _run_with_reconnect(operation)


def create_star_story(story: EnglishStarStory) -> StoredEnglishStarStory:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_star_stories (title, situation, task, action, result, target_skill)
                values (%s, %s, %s, %s, %s, %s)
                returning *;
                """,
                (story.title, story.situation, story.task, story.action, story.result, story.target_skill),
            )
            conn.commit()
            return _row_to_star_story(row)
    return _run_with_reconnect(operation)


def create_or_update_weekly_review(review: EnglishWeeklyReview) -> StoredEnglishWeeklyReview:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            row = _fetchone(
                cur,
                """
                insert into public.english_weekly_reviews (week_start_date, summary, wins, stretch_area, next_focus)
                values (%s, %s, %s, %s, %s)
                on conflict (week_start_date)
                do update set
                    summary = excluded.summary,
                    wins = excluded.wins,
                    stretch_area = excluded.stretch_area,
                    next_focus = excluded.next_focus,
                    updated_at = now()
                returning *;
                """,
                (review.week_start_date, review.summary, review.wins, review.stretch_area, review.next_focus),
            )
            conn.commit()
            return _row_to_weekly_review(row)
    return _run_with_reconnect(operation)


def list_weekly_reviews(limit: int = 12) -> list[StoredEnglishWeeklyReview]:
    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            rows = _fetchall(cur, "select * from public.english_weekly_reviews order by week_start_date desc limit %s;", (limit,))
            return [_row_to_weekly_review(row) for row in rows]
    return _run_with_reconnect(operation)


def generate_and_save_weekly_review(week_start_date: date | None = None) -> StoredEnglishWeeklyReview:
    target_week = start_of_week(week_start_date or date.today())
    week_end = target_week + timedelta(days=6)
    counts = fetch_progress_counts(start_date=target_week, end_date=week_end)
    fields = generate_weekly_summary(week_start_date=target_week, counts=counts)
    return create_or_update_weekly_review(
        EnglishWeeklyReview(
            week_start_date=target_week,
            summary=fields["summary"],
            wins=fields["wins"],
            stretch_area=fields["stretch_area"],
            next_focus=fields["next_focus"],
        )
    )


def fetch_progress_counts(*, start_date: date | None = None, end_date: date | None = None) -> dict[str, int]:
    def _date_clause(column: str) -> tuple[str, tuple[Any, ...]]:
        if start_date and end_date:
            return (f" where {column} between %s and %s", (start_date, end_date))
        return ("", ())

    def operation():
        conn = get_connection()
        with conn.cursor() as cur:
            def count(sql: str, params: tuple[Any, ...] = ()) -> int:
                row = _fetchone(cur, sql, params)
                return int(row["count"]) if row else 0

            journal_clause, journal_params = _date_clause("entry_date")
            listening_clause, listening_params = _date_clause("session_date")
            review_clause, review_params = _date_clause("review_date")
            speaking_clause, speaking_params = _date_clause("session_date")
            interview_clause, interview_params = _date_clause("practice_date")

            return {
                "journals": count(f"select count(*)::int as count from public.english_journal_entries{journal_clause};", journal_params),
                "active_books": count("select count(*)::int as count from public.english_reading_books where status = 'reading';"),
                "completed_books": count("select count(*)::int as count from public.english_reading_books where status = 'completed';"),
                "listening_sessions": count(f"select count(*)::int as count from public.english_listening_sessions{listening_clause};", listening_params),
                "lookups": count("select count(*)::int as count from public.english_word_lookups where status = 'inbox';"),
                "active_vocabulary": count("select count(*)::int as count from public.english_vocabulary_items where status = 'active';"),
                "reviews_due": count("select count(*)::int as count from public.english_vocabulary_items where status = 'active' and next_review_date <= current_date;"),
                "reviews_completed": count(f"select count(*)::int as count from public.english_vocabulary_reviews{review_clause};", review_params),
                "speaking_sessions": count(f"select count(*)::int as count from public.english_speaking_sessions{speaking_clause};", speaking_params),
                "interview_practices": count(f"select count(*)::int as count from public.english_interview_practice{interview_clause};", interview_params),
                "star_stories": count("select count(*)::int as count from public.english_star_stories;"),
            }
    return _run_with_reconnect(operation)


def fetch_dashboard_payload() -> dict[str, Any]:
    journals = list_journal_entries(limit=1)
    books = list_reading_books()
    listening = list_listening_sessions(limit=1)
    weekly_reviews = list_weekly_reviews(limit=1)
    progress = fetch_progress_counts()
    active_book = next((book for book in books if book.status == "reading"), None)
    recent_books = books[:3]
    return {
        "journal_prompt": "Write 3-5 sentences about a real work or study moment from this week.",
        "latest_journal": journals[0] if journals else None,
        "active_book": active_book,
        "recent_books": recent_books,
        "listening_spotlight": listening[0] if listening else None,
        "weekly_review": weekly_reviews[0] if weekly_reviews else None,
        "progress": progress,
        "recent_activity": {
            "journals": progress["journals"],
            "reviews_due": progress["reviews_due"],
            "active_vocabulary": progress["active_vocabulary"],
            "speaking_sessions": progress["speaking_sessions"],
        },
    }


def export_english_data() -> dict[str, Any]:
    return {
        "dashboard": fetch_dashboard_payload(),
        "journal_entries": list_journal_entries(limit=200),
        "reading_books": list_reading_books(),
        "listening_sources": list_listening_sources(),
        "listening_sessions": list_listening_sessions(limit=200),
        "word_lookups": list_word_lookups(),
        "vocabulary_items": list_vocabulary_items(),
        "speaking_sessions": list_speaking_sessions(limit=200),
        "interview_questions": list_interview_questions(),
        "interview_practice": list_interview_practice(limit=200),
        "star_stories": list_star_stories(),
        "weekly_reviews": list_weekly_reviews(limit=200),
        "progress": fetch_progress_counts(),
    }
