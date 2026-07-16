"""Planner models and validation helpers."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from src.models import ValidationError


def _parse_date(value: Any, field_name: str) -> date | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip())
        except ValueError:
            pass
    raise ValidationError(f"Invalid date for {field_name}: {value!r}")


def _parse_time(value: Any, field_name: str) -> str | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    s = str(value).strip()
    parts = s.split(":")
    if len(parts) >= 2:
        try:
            h, m = int(parts[0]), int(parts[1])
            if 0 <= h <= 23 and 0 <= m <= 59:
                return f"{h:02d}:{m:02d}"
        except ValueError:
            pass
    raise ValidationError(f"Invalid time for {field_name}: {value!r}")


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1")
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _require_text(data: dict, field: str) -> str:
    value = data.get(field)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValidationError(f"{field} is required.")
    return str(value).strip()


def _opt_text(data: dict, field: str) -> str | None:
    value = data.get(field)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    return str(value).strip()


def _opt_int(data: dict, field: str) -> int | None:
    value = data.get(field)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        raise ValidationError(f"Invalid integer for {field}: {value!r}")


def _parse_positive_int(value: Any, field_name: str, *, default: int | None = None) -> int:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if default is not None:
            return default
        raise ValidationError(f"{field_name} is required.")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"Invalid integer for {field_name}: {value!r}")
    if parsed <= 0:
        raise ValidationError(f"{field_name} must be a positive integer.")
    return parsed


def _parse_weekday(value: Any, field_name: str) -> int | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if isinstance(value, int):
        parsed = value
    else:
        raw = str(value).strip().lower()
        names = {
            "monday": 0,
            "mon": 0,
            "tuesday": 1,
            "tue": 1,
            "tues": 1,
            "wednesday": 2,
            "wed": 2,
            "thursday": 3,
            "thu": 3,
            "thur": 3,
            "thurs": 3,
            "friday": 4,
            "fri": 4,
            "saturday": 5,
            "sat": 5,
            "sunday": 6,
            "sun": 6,
        }
        if raw in names:
            return names[raw]
        try:
            parsed = int(raw)
        except ValueError:
            raise ValidationError(f"Invalid weekday for {field_name}: {value!r}")
    if parsed < 0 or parsed > 6:
        raise ValidationError(f"{field_name} must be between 0 (Monday) and 6 (Sunday).")
    return parsed


@dataclass(frozen=True)
class HabitData:
    name: str
    description: str | None
    type: str
    target: int | None
    tracking_days: int | None
    category: str | None
    icon: str | None
    is_active: bool
    sort_order: int | None


@dataclass(frozen=True)
class GoalThemeData:
    title: str
    notes: str | None
    is_done: bool
    is_cancelled: bool
    is_active: bool
    sort_order: int | None


@dataclass(frozen=True)
class GoalData:
    title: str
    area: str | None
    goal_theme_id: str | None
    target_completion_date: date | None
    is_important: bool
    is_urgent: bool
    is_done: bool
    is_cancelled: bool
    is_active: bool
    sort_order: int | None


@dataclass(frozen=True)
class TaskData:
    title: str
    category: str | None
    area: str | None
    goal_id: str | None
    deadline: date | None
    is_done: bool
    is_cancelled: bool
    completed_at: date | None
    is_active: bool
    recurring_template_id: int | None = None
    recurring_occurrence_date: date | None = None


@dataclass(frozen=True)
class RecurringTaskTemplateData:
    title: str
    category: str | None
    area: str | None
    goal_id: str | None
    repeat_unit: str
    repeat_every: int
    weekday: int | None
    day_of_month: int | None
    start_date: date
    is_active: bool


@dataclass(frozen=True)
class EventData:
    title: str
    event_date: date | None
    event_time: str | None
    venue: str | None
    category: str | None
    is_done: bool
    is_cancelled: bool
    is_active: bool


@dataclass(frozen=True)
class DailyPlanItemData:
    daily_plan_id: str
    item_type: str
    task_id: str | None
    event_id: str | None
    title_snapshot: str
    category_snapshot: str | None
    area_snapshot: str | None
    status: str
    is_today_focus: bool
    is_important: bool
    is_urgent: bool
    is_highlight: bool
    time_text: str | None
    note_text: str | None
    sort_order: int | None
    source_plan_item_id: str | None


def validate_habit(data: dict) -> HabitData:
    name = _require_text(data, "name")
    habit_type = _opt_text(data, "type") or "habit"
    if habit_type not in ("habit", "tracking"):
        raise ValidationError(f"type must be 'habit' or 'tracking', got '{habit_type}'")
    target = _opt_int(data, "target")
    if target is not None and target <= 0:
        raise ValidationError("target must be a positive integer.")
    return HabitData(
        name=name,
        description=_opt_text(data, "description"),
        type=habit_type,
        target=target,
        tracking_days=_opt_int(data, "tracking_days"),
        category=_opt_text(data, "category"),
        icon=_opt_text(data, "icon"),
        is_active=_parse_bool(data.get("is_active"), default=True),
        sort_order=_opt_int(data, "sort_order"),
    )


def validate_goal_theme(data: dict) -> GoalThemeData:
    title = _require_text(data, "title")
    return GoalThemeData(
        title=title,
        notes=_opt_text(data, "notes"),
        is_done=_parse_bool(data.get("is_done")),
        is_cancelled=_parse_bool(data.get("is_cancelled")),
        is_active=_parse_bool(data.get("is_active"), default=True),
        sort_order=_opt_int(data, "sort_order"),
    )


def validate_goal(data: dict) -> GoalData:
    title = _require_text(data, "title")
    return GoalData(
        title=title,
        area=_opt_text(data, "area"),
        goal_theme_id=_opt_text(data, "goal_theme_id"),
        target_completion_date=_parse_date(data.get("target_completion_date"), "target_completion_date"),
        is_important=_parse_bool(data.get("is_important")),
        is_urgent=_parse_bool(data.get("is_urgent")),
        is_done=_parse_bool(data.get("is_done")),
        is_cancelled=_parse_bool(data.get("is_cancelled")),
        is_active=_parse_bool(data.get("is_active"), default=True),
        sort_order=_opt_int(data, "sort_order"),
    )


def validate_task(data: dict) -> TaskData:
    title = _require_text(data, "title")
    return TaskData(
        title=title,
        category=_opt_text(data, "category"),
        area=_opt_text(data, "area"),
        goal_id=_opt_text(data, "goal_id"),
        deadline=_parse_date(data.get("deadline"), "deadline"),
        is_done=_parse_bool(data.get("is_done")),
        is_cancelled=_parse_bool(data.get("is_cancelled")),
        completed_at=_parse_date(data.get("completed_at"), "completed_at"),
        is_active=_parse_bool(data.get("is_active"), default=True),
        recurring_template_id=_opt_int(data, "recurring_template_id"),
        recurring_occurrence_date=_parse_date(data.get("recurring_occurrence_date"), "recurring_occurrence_date"),
    )


def validate_recurring_task_template(data: dict) -> RecurringTaskTemplateData:
    title = _require_text(data, "title")
    repeat_unit = (_opt_text(data, "repeat_unit") or "").lower()
    if repeat_unit not in ("daily", "weekly", "monthly"):
        raise ValidationError("repeat_unit must be 'daily', 'weekly' or 'monthly'.")

    weekday = _parse_weekday(data.get("weekday"), "weekday")
    day_of_month = _opt_int(data, "day_of_month")
    repeat_every = _parse_positive_int(data.get("repeat_every"), "repeat_every", default=1)
    start_date = _parse_date(data.get("start_date"), "start_date")
    if start_date is None:
        raise ValidationError("start_date is required.")

    if repeat_unit == "daily":
        weekday = None
        day_of_month = None
    elif repeat_unit == "weekly":
        if weekday is None:
            raise ValidationError("weekday is required for weekly recurrence.")
        day_of_month = None
    else:
        if day_of_month is None:
            raise ValidationError("day_of_month is required for monthly recurrence.")
        if day_of_month < 1 or day_of_month > 31:
            raise ValidationError("day_of_month must be between 1 and 31.")
        weekday = None

    return RecurringTaskTemplateData(
        title=title,
        category=_opt_text(data, "category"),
        area=_opt_text(data, "area"),
        goal_id=_opt_text(data, "goal_id"),
        repeat_unit=repeat_unit,
        repeat_every=repeat_every,
        weekday=weekday,
        day_of_month=day_of_month,
        start_date=start_date,
        is_active=_parse_bool(data.get("is_active"), default=True),
    )


def get_monthly_task_due_date(*, year: int, month: int, day_of_month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last_day))


def get_next_recurring_task_due_date(
    template: RecurringTaskTemplateData,
    *,
    from_date: date | None = None,
) -> date | None:
    if not template.is_active:
        return None

    candidate = max(from_date or date.today(), template.start_date)

    if template.repeat_unit == "daily":
        return candidate

    if template.repeat_unit == "weekly":
        days_ahead = (template.weekday - candidate.weekday()) % 7
        return candidate + timedelta(days=days_ahead)

    month_cursor = candidate.replace(day=1)
    for _ in range(1200):
        due_date = get_monthly_task_due_date(
            year=month_cursor.year,
            month=month_cursor.month,
            day_of_month=template.day_of_month,
        )
        if due_date < template.start_date:
            month_cursor = (
                month_cursor.replace(year=month_cursor.year + 1, month=1)
                if month_cursor.month == 12
                else month_cursor.replace(month=month_cursor.month + 1)
            )
            continue
        if due_date >= candidate:
            return due_date
        month_cursor = (
            month_cursor.replace(year=month_cursor.year + 1, month=1)
            if month_cursor.month == 12
            else month_cursor.replace(month=month_cursor.month + 1)
        )

    raise ValidationError("Could not determine the next recurring task due date.")


def validate_event(data: dict) -> EventData:
    title = _require_text(data, "title")
    return EventData(
        title=title,
        event_date=_parse_date(data.get("event_date"), "event_date"),
        event_time=_parse_time(data.get("event_time"), "event_time"),
        venue=_opt_text(data, "venue"),
        category=_opt_text(data, "category"),
        is_done=_parse_bool(data.get("is_done")),
        is_cancelled=_parse_bool(data.get("is_cancelled")),
        is_active=_parse_bool(data.get("is_active"), default=True),
    )


VALID_ITEM_TYPES = ("task", "event", "schedule_entry")
VALID_STATUSES = ("planned", "done", "moved", "cancelled")


def validate_daily_plan_item(data: dict) -> DailyPlanItemData:
    daily_plan_id = _require_text(data, "daily_plan_id")
    item_type = _require_text(data, "item_type")
    if item_type not in VALID_ITEM_TYPES:
        raise ValidationError(f"item_type must be one of {VALID_ITEM_TYPES}")

    task_id = _opt_text(data, "task_id")
    event_id = _opt_text(data, "event_id")

    if item_type == "task" and (task_id is None or event_id is not None):
        raise ValidationError("task items require task_id and no event_id")
    if item_type == "event" and (event_id is None or task_id is not None):
        raise ValidationError("event items require event_id and no task_id")
    if item_type == "schedule_entry" and (task_id is not None or event_id is not None):
        raise ValidationError("schedule_entry items must not have task_id or event_id")

    status = _opt_text(data, "status") or "planned"
    if status not in VALID_STATUSES:
        raise ValidationError(f"status must be one of {VALID_STATUSES}")

    return DailyPlanItemData(
        daily_plan_id=daily_plan_id,
        item_type=item_type,
        task_id=task_id,
        event_id=event_id,
        title_snapshot=_opt_text(data, "title_snapshot") or "",
        category_snapshot=_opt_text(data, "category_snapshot"),
        area_snapshot=_opt_text(data, "area_snapshot"),
        status=status,
        is_today_focus=_parse_bool(data.get("is_today_focus")),
        is_important=_parse_bool(data.get("is_important")),
        is_urgent=_parse_bool(data.get("is_urgent")),
        is_highlight=_parse_bool(data.get("is_highlight")),
        time_text=_opt_text(data, "time_text"),
        note_text=_opt_text(data, "note_text"),
        sort_order=_opt_int(data, "sort_order"),
        source_plan_item_id=_opt_text(data, "source_plan_item_id"),
    )
