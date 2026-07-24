from __future__ import annotations

from datetime import date

from src.english_models import (
    generate_weekly_summary,
    infer_vocabulary_item_type,
    next_review_for_result,
    validate_vocabulary_item,
    validate_word_lookup,
)


def test_next_review_for_completed_advances_stage_and_interval() -> None:
    next_date, next_stage = next_review_for_result(
        date(2026, 7, 18),
        current_stage=0,
        result="completed",
    )

    assert next_stage == 1
    assert next_date == date(2026, 7, 19)


def test_next_review_for_again_resets_stage() -> None:
    next_date, next_stage = next_review_for_result(
        date(2026, 7, 18),
        current_stage=3,
        result="again",
    )

    assert next_stage == 0
    assert next_date == date(2026, 7, 19)


def test_generate_weekly_summary_mentions_core_counts() -> None:
    summary = generate_weekly_summary(
        week_start_date=date(2026, 7, 13),
        counts={
            "journals": 2,
            "listening_sessions": 3,
            "reviews_completed": 4,
            "speaking_sessions": 1,
            "active_books": 1,
            "interview_practices": 2,
        },
    )

    assert "2 journals" in summary["summary"]
    assert "3 listening sessions" in summary["summary"]
    assert "Interview practices: 2." in summary["wins"]


def test_single_word_lookup_suggests_word_type() -> None:
    lookup = validate_word_lookup({"phrase": "prioritise"})
    assert lookup.item_type == "WORD"
    assert lookup.learning_classification == "A_UNDERSTAND_FOR_NOW"
    assert lookup.familiarity_status == "NEW"


def test_multi_word_lookup_suggests_phrase_type() -> None:
    assert infer_vocabulary_item_type("manage competing priorities") == "PHRASE"


def test_lookup_item_type_can_be_overridden() -> None:
    lookup = validate_word_lookup({"phrase": "follow-up", "item_type": "PHRASE", "familiarity_status": "REFRESHED"})
    assert lookup.item_type == "PHRASE"
    assert lookup.familiarity_status == "REFRESHED"


def test_lookup_accepts_optional_cantonese_meaning() -> None:
    lookup = validate_word_lookup({"phrase": "follow-up", "meaning_cantonese": "跟進"})
    assert lookup.meaning_cantonese == "跟進"


def test_active_vocabulary_requires_personal_sentence() -> None:
    try:
        validate_vocabulary_item(
            {
                "phrase": "follow through",
                "item_type": "PHRASE",
                "learning_classification": "C_ACTIVELY_LEARN",
            }
        )
    except Exception as exc:
        assert "personal_sentence is required" in str(exc)
    else:
        assert False, "Expected validation error"


def test_active_vocabulary_accepts_optional_cantonese_meaning() -> None:
    item = validate_vocabulary_item(
        {
            "phrase": "follow through",
            "item_type": "PHRASE",
            "learning_classification": "C_ACTIVELY_LEARN",
            "personal_sentence": "I need to follow through on my plan.",
            "meaning_cantonese": "貫徹完成",
        }
    )
    assert item.meaning_cantonese == "貫徹完成"


def test_fixed_review_schedule_reaches_day_30() -> None:
    next_date, next_stage = next_review_for_result(
        date(2026, 7, 19),
        current_stage=4,
        result="completed",
    )

    assert next_stage == 5
    assert next_date == date(2026, 8, 18)
