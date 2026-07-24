from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace

from api.routers import english


def make_journal(**overrides):
    base = {
        "id": "journal-1",
        "entry_date": date(2026, 7, 18),
        "prompt": "Explain a real meeting clearly.",
        "content": "I explained my idea more clearly today.",
        "clarity_notes": "Slow down",
        "vocabulary_notes": "follow up",
        "grammar_notes": None,
        "mood_score": 4,
        "confidence_score": 4,
        "writing_issues": (),
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_book(**overrides):
    base = {
        "id": "book-1",
        "title": "Atomic Habits",
        "current_page": 22,
        "total_pages": 320,
        "status": "reading",
        "last_updated_date": date(2026, 7, 18),
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_lookup(**overrides):
    base = {
        "id": "lookup-1",
        "phrase": "follow through",
        "item_type": "PHRASE",
        "learning_classification": "C_ACTIVELY_LEARN",
        "familiarity_status": "FAMILIAR_BUT_FORGOTTEN",
        "meaning": "complete something fully",
        "meaning_cantonese": "完成到底",
        "example_sentence": None,
        "source_context": "meeting notes",
        "pronunciation_note": None,
        "is_promoted": False,
        "promoted_at": None,
        "status": "inbox",
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_vocab(**overrides):
    base = {
        "id": "vocab-1",
        "lookup_id": "lookup-1",
        "phrase": "follow through",
        "item_type": "PHRASE",
        "learning_classification": "C_ACTIVELY_LEARN",
        "familiarity_status": "FAMILIAR_BUT_FORGOTTEN",
        "meaning": "complete something fully",
        "meaning_cantonese": "完成到底",
        "example_sentence": None,
        "source_context": "meeting notes",
        "personal_sentence": "I need to follow through on my plan.",
        "category": "Work",
        "pronunciation_note": None,
        "status": "active",
        "confidence_label": "Recognise",
        "next_review_date": date(2026, 7, 19),
        "last_reviewed_at": None,
        "review_stage": 1,
        "promoted_at": datetime(2026, 7, 18, 9, 0, 0),
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_listening_session(**overrides):
    base = {
        "id": "listen-1",
        "source_id": "src-1",
        "source_title": "BBC Podcast",
        "session_date": date(2026, 7, 18),
        "focus_area": "Pronunciation",
        "notes": "Good practice",
        "reflection": "Repeat once more",
        "difficulty_score": 3,
        "second_pass_completed": True,
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_speaking(**overrides):
    base = {
        "id": "speak-1",
        "topic": "Weekly update",
        "prompt": "Explain your work clearly",
        "attempt_one_notes": "Too long",
        "attempt_two_notes": "Clearer and shorter",
        "reflection": "Use simpler wording",
        "session_date": date(2026, 7, 18),
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_star_story(**overrides):
    base = {
        "id": "star-1",
        "title": "Handled a deadline change",
        "situation": "Deadline moved",
        "task": "Re-plan work",
        "action": "Communicated updates",
        "result": "Delivered on time",
        "target_skill": "Communication",
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_weekly_review(**overrides):
    base = {
        "id": "review-1",
        "week_start_date": date(2026, 7, 13),
        "summary": "A productive English week.",
        "wins": "More listening practice",
        "stretch_area": "Sharper interview answers",
        "next_focus": "Repeat one answer twice",
        "created_at": datetime(2026, 7, 18, 9, 0, 0),
        "updated_at": datetime(2026, 7, 18, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_create_journal_entry_validates_and_serializes(monkeypatch) -> None:
    captured = {}
    validated = object()
    stored = make_journal()

    monkeypatch.setattr(english, "validate_journal_entry", lambda payload: captured.setdefault("payload", payload) or validated)
    monkeypatch.setattr(english, "create_journal_entry", lambda entry: stored)

    response = english.create_english_journal(
        english.JournalPayload(
            content="I explained my idea more clearly today.",
            prompt="Explain a real meeting clearly.",
            mood_score=4,
            confidence_score=4,
        )
    )

    assert captured["payload"]["content"] == "I explained my idea more clearly today."
    assert response["id"] == "journal-1"
    assert response["mood_score"] == 4
    assert response["confidence_score"] == 4


def test_edit_reading_book_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(english, "update_reading_book", lambda book_id, book: None)

    try:
      english.edit_english_reading_book("missing", english.ReadingBookPayload(title="Book", current_page=1))
    except Exception as exc:
      assert getattr(exc, "status_code", None) == 404
    else:
      assert False, "Expected HTTPException"


def test_promote_word_lookup_returns_active_vocab(monkeypatch) -> None:
    monkeypatch.setattr(english, "promote_lookup_to_vocabulary", lambda lookup_id, **kwargs: make_vocab())

    response = english.promote_word_lookup(
        "lookup-1",
        english.VocabularyPromotionPayload(
            personal_sentence="I need to follow through on my plan.",
            category="Work",
        ),
    )

    assert response["status"] == "active"
    assert response["lookup_id"] == "lookup-1"
    assert response["item_type"] == "PHRASE"
    assert response["learning_classification"] == "C_ACTIVELY_LEARN"
    assert response["familiarity_status"] == "FAMILIAR_BUT_FORGOTTEN"
    assert response["meaning_cantonese"] == "完成到底"


def test_complete_vocabulary_review_returns_review_and_item(monkeypatch) -> None:
    review = SimpleNamespace(
        id="vr-1",
        vocabulary_item_id="vocab-1",
        review_date=date(2026, 7, 18),
        confidence_score=4,
        result="completed",
        notes=None,
        created_at=datetime(2026, 7, 18, 9, 0, 0),
        updated_at=datetime(2026, 7, 18, 9, 0, 0),
    )
    monkeypatch.setattr(english, "complete_vocabulary_review", lambda payload: (review, make_vocab(review_stage=2)))

    response = english.create_english_vocabulary_review(
        english.VocabularyReviewPayload(vocabulary_item_id="vocab-1", confidence_score=4)
    )

    assert response["review"]["id"] == "vr-1"
    assert response["item"]["review_stage"] == 2


def test_create_listening_session_returns_second_pass_state(monkeypatch) -> None:
    monkeypatch.setattr(english, "create_listening_session", lambda payload: make_listening_session())

    response = english.create_english_listening_session(
        english.ListeningSessionPayload(
            source_id="src-1",
            second_pass_completed=True,
        )
    )

    assert response["second_pass_completed"] is True


def test_create_speaking_session_captures_second_attempt(monkeypatch) -> None:
    monkeypatch.setattr(english, "create_speaking_session", lambda payload: make_speaking())

    response = english.create_english_speaking_session(
        english.SpeakingSessionPayload(topic="Weekly update", attempt_two_notes="Clearer and shorter")
    )

    assert response["attempt_two_notes"] == "Clearer and shorter"


def test_create_star_story_serializes_result(monkeypatch) -> None:
    monkeypatch.setattr(english, "create_star_story", lambda payload: make_star_story())

    response = english.create_english_star_story(
        english.StarStoryPayload(
            title="Handled a deadline change",
            situation="Deadline moved",
            task="Re-plan work",
            action="Communicated updates",
            result="Delivered on time",
        )
    )

    assert response["result"] == "Delivered on time"


def test_generate_weekly_review_returns_saved_summary(monkeypatch) -> None:
    monkeypatch.setattr(english, "generate_and_save_weekly_review", lambda week_start_date=None: make_weekly_review())

    response = english.generate_english_weekly_review()

    assert response["week_start_date"] == "2026-07-13"
    assert "productive English week" in response["summary"]
