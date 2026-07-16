from __future__ import annotations

from datetime import date

import pytest

from src.models import ValidationError
from src.planner_models import (
    get_next_recurring_task_due_date,
    validate_goal,
    validate_goal_theme,
    validate_recurring_task_template,
)


def test_validate_goal_theme_accepts_notes() -> None:
    theme = validate_goal_theme(
        {
            "title": " Career ",
            "notes": " Focus on the next role ",
        }
    )

    assert theme.title == "Career"
    assert theme.notes == "Focus on the next role"
    assert theme.is_active is True


def test_validate_goal_accepts_goal_theme_id() -> None:
    goal = validate_goal(
        {
            "title": "Full-time job hunting",
            "goal_theme_id": "theme-1",
            "target_completion_date": "2026-07-15",
        }
    )

    assert goal.title == "Full-time job hunting"
    assert goal.goal_theme_id == "theme-1"
    assert goal.target_completion_date == date(2026, 7, 15)


def test_validate_recurring_task_template_accepts_weekly_rule() -> None:
    template = validate_recurring_task_template(
        {
            "title": "Water plants",
            "repeat_unit": "weekly",
            "weekday": 4,
            "start_date": "2026-07-02",
        }
    )

    assert template.repeat_unit == "weekly"
    assert template.weekday == 4
    assert template.day_of_month is None
    assert template.start_date == date(2026, 7, 2)


def test_validate_recurring_task_template_accepts_daily_rule() -> None:
    template = validate_recurring_task_template(
        {
            "title": "Inbox zero",
            "repeat_unit": "daily",
            "start_date": "2026-07-02",
        }
    )

    assert template.repeat_unit == "daily"
    assert template.weekday is None
    assert template.day_of_month is None


def test_validate_recurring_task_template_requires_weekday_for_weekly() -> None:
    with pytest.raises(ValidationError, match="weekday is required for weekly recurrence"):
        validate_recurring_task_template(
            {
                "title": "Take bins out",
                "repeat_unit": "weekly",
                "start_date": "2026-07-02",
            }
        )


def test_validate_recurring_task_template_requires_valid_month_day() -> None:
    with pytest.raises(ValidationError, match="day_of_month must be between 1 and 31"):
        validate_recurring_task_template(
            {
                "title": "Pay rent",
                "repeat_unit": "monthly",
                "day_of_month": 32,
                "start_date": "2026-07-02",
            }
        )


def test_get_next_recurring_task_due_date_uses_selected_weekday() -> None:
    template = validate_recurring_task_template(
        {
            "title": "Review goals",
            "repeat_unit": "weekly",
            "weekday": 0,
            "start_date": "2026-07-02",
        }
    )

    assert get_next_recurring_task_due_date(template, from_date=date(2026, 7, 2)) == date(2026, 7, 6)


def test_get_next_recurring_task_due_date_returns_same_day_for_daily() -> None:
    template = validate_recurring_task_template(
        {
            "title": "Inbox zero",
            "repeat_unit": "daily",
            "start_date": "2026-07-02",
        }
    )

    assert get_next_recurring_task_due_date(template, from_date=date(2026, 7, 5)) == date(2026, 7, 5)


def test_get_next_recurring_task_due_date_clamps_short_months() -> None:
    template = validate_recurring_task_template(
        {
            "title": "Month end admin",
            "repeat_unit": "monthly",
            "day_of_month": 31,
            "start_date": "2026-01-31",
        }
    )

    assert get_next_recurring_task_due_date(template, from_date=date(2026, 2, 1)) == date(2026, 2, 28)
