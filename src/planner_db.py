"""Database helpers for planner tables (habits, goals, tasks, events, daily plans)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from psycopg2.extensions import connection as PGConnection

from src.db import (
    ensure_connection,
    get_connection,
    _run_with_reconnect,
    _safe_rollback,
    DatabaseConnectionError,
    DatabaseSchemaError,
)
from src.planner_models import (
    HabitData,
    GoalData,
    TaskData,
    EventData,
    DailyPlanItemData,
    RecurringTaskTemplateData,
    get_next_recurring_task_due_date,
)


# ---------------------------------------------------------------------------
# Stored dataclasses (UUID string IDs — planner tables use uuid PKs)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class StoredHabit:
    id: str
    name: str
    description: str | None
    type: str
    target: int | None
    tracking_days: int | None
    category: str | None
    icon: str | None
    is_active: bool
    sort_order: int | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredHabitEntry:
    id: str
    habit_id: str
    entry_date: date
    is_done: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredHabitCategory:
    id: str
    name: str
    icon: str
    color_key: str
    sort_order: int | None
    created_at: datetime


@dataclass(frozen=True)
class StoredGoalTheme:
    id: str
    title: str
    notes: str | None
    is_done: bool
    is_cancelled: bool
    is_active: bool
    sort_order: int | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredGoal:
    id: str
    title: str
    area: str | None
    goal_theme_id: str | None
    goal_theme_title: str | None
    target_completion_date: date | None
    is_important: bool
    is_urgent: bool
    is_done: bool
    is_cancelled: bool
    is_active: bool
    sort_order: int | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredTask:
    id: str
    title: str
    category: str | None
    area: str | None
    goal_id: str | None
    deadline: date | None
    is_done: bool
    is_cancelled: bool
    completed_at: date | None
    is_active: bool
    recurring_template_id: int | None
    recurring_occurrence_date: date | None
    recurring_repeat_unit: str | None
    recurring_weekday: int | None
    recurring_day_of_month: int | None
    recurring_is_active: bool | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredRecurringTaskTemplate:
    id: int
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
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredEvent:
    id: str
    title: str
    event_date: date | None
    event_time: time | None
    venue: str | None
    category: str | None
    is_done: bool
    is_cancelled: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredDailyPlan:
    id: str
    plan_date: date
    notes: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class StoredDailyPlanItem:
    id: str
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
    moved_to_plan_item_id: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Row-to-dataclass mappers
# ---------------------------------------------------------------------------

def _row_to_habit(row: dict) -> StoredHabit:
    return StoredHabit(
        id=str(row["id"]),
        name=row["name"],
        description=row.get("description"),
        type=row.get("type", "habit"),
        target=row.get("target"),
        tracking_days=row.get("tracking_days"),
        category=row.get("category"),
        icon=row.get("icon"),
        is_active=row["is_active"],
        sort_order=row.get("sort_order"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_habit_entry(row: dict) -> StoredHabitEntry:
    return StoredHabitEntry(
        id=str(row["id"]),
        habit_id=str(row["habit_id"]),
        entry_date=row["entry_date"],
        is_done=row["is_done"],
        notes=row.get("notes"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_habit_category(row: dict) -> StoredHabitCategory:
    return StoredHabitCategory(
        id=str(row["id"]),
        name=row["name"],
        icon=row["icon"],
        color_key=row["color_key"],
        sort_order=row.get("sort_order"),
        created_at=row["created_at"],
    )


def _row_to_goal_theme(row: dict) -> StoredGoalTheme:
    return StoredGoalTheme(
        id=str(row["id"]),
        title=row["title"],
        notes=row.get("notes"),
        is_done=row["is_done"],
        is_cancelled=row["is_cancelled"],
        is_active=row["is_active"],
        sort_order=row.get("sort_order"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_goal(row: dict) -> StoredGoal:
    return StoredGoal(
        id=str(row["id"]),
        title=row["title"],
        area=row.get("area"),
        goal_theme_id=str(row["goal_theme_id"]) if row.get("goal_theme_id") else None,
        goal_theme_title=row.get("goal_theme_title"),
        target_completion_date=row.get("target_completion_date"),
        is_important=row["is_important"],
        is_urgent=row["is_urgent"],
        is_done=row["is_done"],
        is_cancelled=row["is_cancelled"],
        is_active=row["is_active"],
        sort_order=row.get("sort_order"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_task(row: dict) -> StoredTask:
    return StoredTask(
        id=str(row["id"]),
        title=row["title"],
        category=row.get("category"),
        area=row.get("area"),
        goal_id=str(row["goal_id"]) if row.get("goal_id") else None,
        deadline=row.get("deadline"),
        is_done=row["is_done"],
        is_cancelled=row["is_cancelled"],
        completed_at=row.get("completed_at"),
        is_active=row["is_active"],
        recurring_template_id=row.get("recurring_template_id"),
        recurring_occurrence_date=row.get("recurring_occurrence_date"),
        recurring_repeat_unit=row.get("recurring_repeat_unit"),
        recurring_weekday=row.get("recurring_weekday"),
        recurring_day_of_month=row.get("recurring_day_of_month"),
        recurring_is_active=row.get("recurring_is_active"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_recurring_task_template(row: dict) -> StoredRecurringTaskTemplate:
    return StoredRecurringTaskTemplate(
        id=row["id"],
        title=row["title"],
        category=row.get("category"),
        area=row.get("area"),
        goal_id=str(row["goal_id"]) if row.get("goal_id") else None,
        repeat_unit=row["repeat_unit"],
        repeat_every=row["repeat_every"],
        weekday=row.get("weekday"),
        day_of_month=row.get("day_of_month"),
        start_date=row["start_date"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_event(row: dict) -> StoredEvent:
    return StoredEvent(
        id=str(row["id"]),
        title=row["title"],
        event_date=row.get("event_date"),
        event_time=row.get("event_time"),
        venue=row.get("venue"),
        category=row.get("category"),
        is_done=row["is_done"],
        is_cancelled=row["is_cancelled"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_daily_plan(row: dict) -> StoredDailyPlan:
    return StoredDailyPlan(
        id=str(row["id"]),
        plan_date=row["plan_date"],
        notes=row.get("notes"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_daily_plan_item(row: dict) -> StoredDailyPlanItem:
    return StoredDailyPlanItem(
        id=str(row["id"]),
        daily_plan_id=str(row["daily_plan_id"]),
        item_type=row["item_type"],
        task_id=str(row["task_id"]) if row.get("task_id") else None,
        event_id=str(row["event_id"]) if row.get("event_id") else None,
        title_snapshot=row.get("title_snapshot", ""),
        category_snapshot=row.get("category_snapshot"),
        area_snapshot=row.get("area_snapshot"),
        status=row["status"],
        is_today_focus=row["is_today_focus"],
        is_important=row["is_important"],
        is_urgent=row["is_urgent"],
        is_highlight=row["is_highlight"],
        time_text=row.get("time_text"),
        note_text=row.get("note_text"),
        sort_order=row.get("sort_order"),
        source_plan_item_id=str(row["source_plan_item_id"]) if row.get("source_plan_item_id") else None,
        moved_to_plan_item_id=str(row["moved_to_plan_item_id"]) if row.get("moved_to_plan_item_id") else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# Column lists (reused across queries)
# ---------------------------------------------------------------------------

_HABIT_COLS = "id, name, description, type, target, tracking_days, category, icon, is_active, sort_order, created_at, updated_at"
_HABIT_ENTRY_COLS = "id, habit_id, entry_date, is_done, notes, created_at, updated_at"
_HABIT_CAT_COLS = "id, name, icon, color_key, sort_order, created_at"
_GOAL_THEME_COLS = "id, title, notes, is_done, is_cancelled, is_active, sort_order, created_at, updated_at"
_GOAL_COLS = (
    "g.id, g.title, g.area, g.goal_theme_id, gt.title as goal_theme_title, "
    "g.target_completion_date, g.is_important, g.is_urgent, g.is_done, "
    "g.is_cancelled, g.is_active, g.sort_order, g.created_at, g.updated_at"
)
_GOAL_COLS_LEGACY = (
    "g.id, g.title, g.area, null::uuid as goal_theme_id, null::text as goal_theme_title, "
    "g.target_completion_date, g.is_important, g.is_urgent, g.is_done, "
    "g.is_cancelled, g.is_active, g.sort_order, g.created_at, g.updated_at"
)
_RECURRING_TASK_COLS = (
    "id, title, category, area, goal_id, repeat_unit, repeat_every, weekday, "
    "day_of_month, start_date, is_active, created_at, updated_at"
)
_TASK_COLS = (
    "t.id, t.title, t.category, t.area, t.goal_id, t.deadline, t.is_done, "
    "t.is_cancelled, t.completed_at, t.is_active, t.recurring_template_id, "
    "t.recurring_occurrence_date, r.repeat_unit as recurring_repeat_unit, "
    "r.weekday as recurring_weekday, r.day_of_month as recurring_day_of_month, "
    "r.is_active as recurring_is_active, t.created_at, t.updated_at"
)
_TASK_COLS_LEGACY = (
    "t.id, t.title, t.category, t.area, t.goal_id, t.deadline, t.is_done, "
    "t.is_cancelled, t.completed_at, t.is_active, null::bigint as recurring_template_id, "
    "null::date as recurring_occurrence_date, null::text as recurring_repeat_unit, "
    "null::integer as recurring_weekday, null::integer as recurring_day_of_month, "
    "null::boolean as recurring_is_active, t.created_at, t.updated_at"
)
_EVENT_COLS = "id, title, event_date, event_time, venue, category, is_done, is_cancelled, is_active, created_at, updated_at"
_PLAN_COLS = "id, plan_date, notes, created_at, updated_at"
_PLAN_ITEM_COLS = (
    "id, daily_plan_id, item_type, task_id, event_id, title_snapshot, category_snapshot, "
    "area_snapshot, status, is_today_focus, is_important, is_urgent, is_highlight, "
    "time_text, note_text, sort_order, source_plan_item_id, moved_to_plan_item_id, "
    "created_at, updated_at"
)


# ===================================================================
# HABITS
# ===================================================================

def fetch_habits(*, active_only: bool = True) -> list[StoredHabit]:
    sql = f"select {_HABIT_COLS} from public.habits"
    if active_only:
        sql += " where is_active = true"
    sql += " order by sort_order asc nulls first, created_at asc;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_habit(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def fetch_habit_by_id(habit_id: str) -> StoredHabit | None:
    sql = f"select {_HABIT_COLS} from public.habits where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (habit_id,))
            row = cur.fetchone()
        return _row_to_habit(row) if row else None
    return _run_with_reconnect(op)


def insert_habit(data: HabitData) -> StoredHabit:
    sql = f"""
        insert into public.habits (name, description, type, target, tracking_days, category, icon, is_active, sort_order)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning {_HABIT_COLS};
    """
    params = (data.name, data.description, data.type, data.target, data.tracking_days,
              data.category, data.icon, data.is_active, data.sort_order)

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_habit(row)
    return _run_with_reconnect(op)


def update_habit(habit_id: str, fields: dict) -> StoredHabit | None:
    allowed = {"name", "description", "type", "target", "tracking_days", "category",
               "icon", "is_active", "sort_order"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return fetch_habit_by_id(habit_id)
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"update public.habits set {set_clause}, updated_at = now() where id = %s returning {_HABIT_COLS};"
    params = list(updates.values()) + [habit_id]

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_habit(row) if row else None
    return _run_with_reconnect(op)


def delete_habit(habit_id: str) -> bool:
    return update_habit(habit_id, {"is_active": False}) is not None


# ===================================================================
# HABIT ENTRIES
# ===================================================================

def fetch_habit_entries(habit_ids: list[str]) -> list[StoredHabitEntry]:
    if not habit_ids:
        return []
    placeholders = ",".join(["%s"] * len(habit_ids))
    sql = f"select {_HABIT_ENTRY_COLS} from public.habit_entries where habit_id in ({placeholders}) order by entry_date asc;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, habit_ids)
            return [_row_to_habit_entry(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def upsert_habit_entry(habit_id: str, entry_date: date, is_done: bool = True) -> StoredHabitEntry:
    sql = f"""
        insert into public.habit_entries (habit_id, entry_date, is_done)
        values (%s, %s, %s)
        on conflict (habit_id, entry_date) do update set is_done = excluded.is_done, updated_at = now()
        returning {_HABIT_ENTRY_COLS};
    """

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (habit_id, entry_date, is_done))
            row = cur.fetchone()
        conn.commit()
        return _row_to_habit_entry(row)
    return _run_with_reconnect(op)


def delete_habit_entry(habit_id: str, entry_date: date) -> bool:
    sql = "delete from public.habit_entries where habit_id = %s and entry_date = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (habit_id, entry_date))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


# ===================================================================
# HABIT CATEGORIES
# ===================================================================

def fetch_habit_categories() -> list[StoredHabitCategory]:
    sql = f"select {_HABIT_CAT_COLS} from public.habit_categories order by sort_order asc nulls first, name asc;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_habit_category(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def insert_habit_category(name: str, icon: str = "ti-check", color_key: str = "gray", sort_order: int | None = None) -> StoredHabitCategory:
    sql = f"""
        insert into public.habit_categories (name, icon, color_key, sort_order)
        values (%s, %s, %s, %s)
        returning {_HABIT_CAT_COLS};
    """

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (name, icon, color_key, sort_order))
            row = cur.fetchone()
        conn.commit()
        return _row_to_habit_category(row)
    return _run_with_reconnect(op)


def update_habit_category(cat_id: str, fields: dict) -> StoredHabitCategory | None:
    allowed = {"name", "icon", "color_key", "sort_order"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return None
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"update public.habit_categories set {set_clause} where id = %s returning {_HABIT_CAT_COLS};"
    params = list(updates.values()) + [cat_id]

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_habit_category(row) if row else None
    return _run_with_reconnect(op)


def delete_habit_category(cat_id: str) -> bool:
    sql = "delete from public.habit_categories where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (cat_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


# ===================================================================
# GOAL THEMES / TARGETS SCHEMA
# ===================================================================

def _has_goal_theme_schema(conn: PGConnection) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
                exists (
                    select 1
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'goals'
                      and column_name = 'goal_theme_id'
                ) as has_goal_theme_id,
                to_regclass('public.goal_themes') is not null as has_goal_themes_table;
            """
        )
        row = cur.fetchone()
    return bool(row and row["has_goal_theme_id"] and row["has_goal_themes_table"])


def _require_goal_theme_schema(conn: PGConnection) -> None:
    if not _has_goal_theme_schema(conn):
        raise DatabaseSchemaError(
            "Planner goals and targets require the latest planner SQL migration. "
            "Run `sql/033_add_goal_themes.sql` in Supabase, then reload the app."
        )


# ===================================================================
# GOAL THEMES
# ===================================================================

def fetch_goal_themes(*, active_only: bool = True) -> list[StoredGoalTheme]:
    def op(conn):
        _require_goal_theme_schema(conn)
        sql = f"select {_GOAL_THEME_COLS} from public.goal_themes"
        if active_only:
            sql += " where is_active = true"
        sql += " order by sort_order asc nulls first, created_at asc;"
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_goal_theme(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def fetch_goal_theme_by_id(goal_theme_id: str) -> StoredGoalTheme | None:
    def op(conn):
        _require_goal_theme_schema(conn)
        with conn.cursor() as cur:
            cur.execute(f"select {_GOAL_THEME_COLS} from public.goal_themes where id = %s;", (goal_theme_id,))
            row = cur.fetchone()
        return _row_to_goal_theme(row) if row else None
    return _run_with_reconnect(op)


def insert_goal_theme(data) -> StoredGoalTheme:
    sql = f"""
        insert into public.goal_themes (title, notes, is_done, is_cancelled, is_active, sort_order)
        values (%s, %s, %s, %s, %s, %s)
        returning {_GOAL_THEME_COLS};
    """
    params = (data.title, data.notes, data.is_done, data.is_cancelled, data.is_active, data.sort_order)

    def op(conn):
        _require_goal_theme_schema(conn)
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_goal_theme(row)
    return _run_with_reconnect(op)


def update_goal_theme(goal_theme_id: str, fields: dict) -> StoredGoalTheme | None:
    allowed = {"title", "notes", "is_done", "is_cancelled", "is_active", "sort_order"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return fetch_goal_theme_by_id(goal_theme_id)
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"update public.goal_themes set {set_clause}, updated_at = now() where id = %s returning {_GOAL_THEME_COLS};"
    params = list(updates.values()) + [goal_theme_id]

    def op(conn):
        _require_goal_theme_schema(conn)
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_goal_theme(row) if row else None
    return _run_with_reconnect(op)


def delete_goal_theme(goal_theme_id: str) -> bool:
    sql = "delete from public.goal_themes where id = %s;"

    def op(conn):
        _require_goal_theme_schema(conn)
        with conn.cursor() as cur:
            cur.execute(sql, (goal_theme_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


# ===================================================================
# GOALS
# ===================================================================

def fetch_goals(*, active_only: bool = True) -> list[StoredGoal]:
    def op(conn):
        if _has_goal_theme_schema(conn):
            sql = f"select {_GOAL_COLS} from public.goals g left join public.goal_themes gt on gt.id = g.goal_theme_id"
        else:
            sql = f"select {_GOAL_COLS_LEGACY} from public.goals g"
        if active_only:
            sql += " where g.is_active = true"
        sql += " order by g.sort_order asc nulls first, g.created_at asc;"
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_goal(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def insert_goal(data: GoalData) -> StoredGoal:
    def op(conn):
        has_goal_theme_schema = _has_goal_theme_schema(conn)
        if not has_goal_theme_schema and data.goal_theme_id is not None:
            _require_goal_theme_schema(conn)
        if has_goal_theme_schema:
            sql = """
                insert into public.goals (
                    title, area, goal_theme_id, target_completion_date, is_important,
                    is_urgent, is_done, is_cancelled, is_active, sort_order
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning id;
            """
            params = (
                data.title, data.area, data.goal_theme_id, data.target_completion_date, data.is_important,
                data.is_urgent, data.is_done, data.is_cancelled, data.is_active, data.sort_order,
            )
        else:
            sql = """
                insert into public.goals (
                    title, area, target_completion_date, is_important, is_urgent,
                    is_done, is_cancelled, is_active, sort_order
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning id;
            """
            params = (
                data.title, data.area, data.target_completion_date, data.is_important,
                data.is_urgent, data.is_done, data.is_cancelled, data.is_active, data.sort_order,
            )
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return fetch_goal_by_id(str(row["id"]))
    return _run_with_reconnect(op)


def update_goal(goal_id: str, fields: dict) -> StoredGoal | None:
    def op(conn):
        allowed = {"title", "area", "goal_theme_id", "target_completion_date", "is_important", "is_urgent",
                   "is_done", "is_cancelled", "is_active", "sort_order"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return fetch_goal_by_id(goal_id)
        has_goal_theme_schema = _has_goal_theme_schema(conn)
        if not has_goal_theme_schema and "goal_theme_id" in updates:
            _require_goal_theme_schema(conn)
        updates_local = updates if has_goal_theme_schema else {k: v for k, v in updates.items() if k != "goal_theme_id"}
        set_clause = ", ".join(f"{k} = %s" for k in updates_local)
        sql = f"update public.goals set {set_clause}, updated_at = now() where id = %s returning id;"
        params = list(updates_local.values()) + [goal_id]
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return fetch_goal_by_id(str(row["id"])) if row else None
    return _run_with_reconnect(op)


def fetch_goal_by_id(goal_id: str) -> StoredGoal | None:
    def op(conn):
        if _has_goal_theme_schema(conn):
            sql = (
                f"select {_GOAL_COLS} from public.goals g "
                "left join public.goal_themes gt on gt.id = g.goal_theme_id where g.id = %s;"
            )
        else:
            sql = f"select {_GOAL_COLS_LEGACY} from public.goals g where g.id = %s;"
        with conn.cursor() as cur:
            cur.execute(sql, (goal_id,))
            row = cur.fetchone()
        return _row_to_goal(row) if row else None
    return _run_with_reconnect(op)


def delete_goal(goal_id: str) -> bool:
    sql = "delete from public.goals where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (goal_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


# ===================================================================
# TASKS
# ===================================================================

def _has_recurring_task_schema(conn: PGConnection) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
                exists (
                    select 1
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'tasks'
                      and column_name = 'recurring_template_id'
                ) as has_template_id,
                exists (
                    select 1
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'tasks'
                      and column_name = 'recurring_occurrence_date'
                ) as has_occurrence_date,
                to_regclass('public.recurring_task_templates') is not null as has_templates_table;
            """
        )
        row = cur.fetchone()
    return bool(
        row
        and row["has_template_id"]
        and row["has_occurrence_date"]
        and row["has_templates_table"]
    )


def _require_recurring_task_schema(conn: PGConnection) -> None:
    if not _has_recurring_task_schema(conn):
        raise DatabaseSchemaError(
            "Recurring planner tasks require the latest planner SQL migration. "
            "Run `sql/032_add_recurring_task_templates.sql` in Supabase, then reload the app."
        )


def _get_daily_plan_item_columns(conn: PGConnection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'daily_plan_items';
            """
        )
        rows = cur.fetchall()
    return {row["column_name"] for row in rows}

def fetch_tasks(*, active_only: bool = True) -> list[StoredTask]:
    def op(conn):
        if _has_recurring_task_schema(conn):
            sql = (
                f"select {_TASK_COLS} from public.tasks t "
                "left join public.recurring_task_templates r on r.id = t.recurring_template_id"
            )
        else:
            sql = f"select {_TASK_COLS_LEGACY} from public.tasks t"
        if active_only:
            sql += " where t.is_active = true"
        sql += " order by t.created_at asc;"
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_task(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def fetch_task_by_id(task_id: str) -> StoredTask | None:
    def op(conn):
        if _has_recurring_task_schema(conn):
            sql = (
                f"select {_TASK_COLS} from public.tasks t "
                "left join public.recurring_task_templates r on r.id = t.recurring_template_id "
                "where t.id = %s;"
            )
        else:
            sql = f"select {_TASK_COLS_LEGACY} from public.tasks t where t.id = %s;"
        with conn.cursor() as cur:
            cur.execute(sql, (task_id,))
            row = cur.fetchone()
        return _row_to_task(row) if row else None
    return _run_with_reconnect(op)


def insert_task(data: TaskData) -> StoredTask:
    def op(conn):
        has_recurring_schema = _has_recurring_task_schema(conn)
        if not has_recurring_schema and (
            data.recurring_template_id is not None or data.recurring_occurrence_date is not None
        ):
            _require_recurring_task_schema(conn)
        if has_recurring_schema:
            sql = """
                insert into public.tasks (
                    title, category, area, goal_id, deadline, is_done, is_cancelled,
                    completed_at, is_active, recurring_template_id, recurring_occurrence_date
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning id;
            """
            params = (
                data.title,
                data.category,
                data.area,
                data.goal_id,
                data.deadline,
                data.is_done,
                data.is_cancelled,
                data.completed_at,
                data.is_active,
                data.recurring_template_id,
                data.recurring_occurrence_date,
            )
        else:
            sql = """
                insert into public.tasks (
                    title, category, area, goal_id, deadline, is_done, is_cancelled,
                    completed_at, is_active
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning id;
            """
            params = (
                data.title,
                data.category,
                data.area,
                data.goal_id,
                data.deadline,
                data.is_done,
                data.is_cancelled,
                data.completed_at,
                data.is_active,
            )
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return fetch_task_by_id(str(row["id"]))
    return _run_with_reconnect(op)


def update_task(task_id: str, fields: dict) -> StoredTask | None:
    allowed = {"title", "category", "area", "goal_id", "deadline", "is_done",
               "is_cancelled", "completed_at", "is_active", "recurring_template_id",
               "recurring_occurrence_date"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return fetch_task_by_id(task_id)
    def op(conn):
        has_recurring_schema = _has_recurring_task_schema(conn)
        if not has_recurring_schema:
            recurring_updates = {"recurring_template_id", "recurring_occurrence_date"} & set(updates)
            if recurring_updates:
                _require_recurring_task_schema(conn)
            updates_local = {k: v for k, v in updates.items() if k not in recurring_updates}
        else:
            updates_local = updates
        if not updates_local:
            return fetch_task_by_id(task_id)
        set_clause = ", ".join(f"{k} = %s" for k in updates_local)
        sql = f"update public.tasks set {set_clause}, updated_at = now() where id = %s returning id;"
        params = list(updates_local.values()) + [task_id]
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return fetch_task_by_id(str(row["id"])) if row else None
    return _run_with_reconnect(op)


def delete_task(task_id: str) -> bool:
    sql = "delete from public.tasks where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (task_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


def fetch_recurring_task_template_by_id(template_id: int) -> StoredRecurringTaskTemplate | None:
    def op(conn):
        _require_recurring_task_schema(conn)
        sql = f"select {_RECURRING_TASK_COLS} from public.recurring_task_templates where id = %s;"
        with conn.cursor() as cur:
            cur.execute(sql, (template_id,))
            row = cur.fetchone()
        return _row_to_recurring_task_template(row) if row else None
    return _run_with_reconnect(op)


def insert_recurring_task_template(data: RecurringTaskTemplateData) -> StoredRecurringTaskTemplate:
    def op(conn):
        _require_recurring_task_schema(conn)
        sql = f"""
            insert into public.recurring_task_templates (
                title, category, area, goal_id, repeat_unit, repeat_every,
                weekday, day_of_month, start_date, is_active
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning {_RECURRING_TASK_COLS};
        """
        params = (
            data.title,
            data.category,
            data.area,
            data.goal_id,
            data.repeat_unit,
            data.repeat_every,
            data.weekday,
            data.day_of_month,
            data.start_date,
            data.is_active,
        )
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_recurring_task_template(row)
    return _run_with_reconnect(op)


def update_recurring_task_template(template_id: int, data: RecurringTaskTemplateData) -> StoredRecurringTaskTemplate | None:
    def op(conn):
        _require_recurring_task_schema(conn)
        sql = f"""
            update public.recurring_task_templates
            set title = %s,
                category = %s,
                area = %s,
                goal_id = %s,
                repeat_unit = %s,
                repeat_every = %s,
                weekday = %s,
                day_of_month = %s,
                start_date = %s,
                is_active = %s,
                updated_at = now()
            where id = %s
            returning {_RECURRING_TASK_COLS};
        """
        params = (
            data.title,
            data.category,
            data.area,
            data.goal_id,
            data.repeat_unit,
            data.repeat_every,
            data.weekday,
            data.day_of_month,
            data.start_date,
            data.is_active,
            template_id,
        )
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if row:
                cur.execute(
                    """
                    update public.tasks
                    set title = %s,
                        category = %s,
                        area = %s,
                        goal_id = %s,
                        updated_at = now()
                    where recurring_template_id = %s
                      and is_done = false
                      and is_cancelled = false;
                    """,
                    (data.title, data.category, data.area, data.goal_id, template_id),
                )
        conn.commit()
        return _row_to_recurring_task_template(row) if row else None
    return _run_with_reconnect(op)


def create_task_with_recurrence(
    task_data: TaskData,
    recurrence_data: RecurringTaskTemplateData | None = None,
) -> StoredTask:
    if recurrence_data is None:
        return insert_task(task_data)

    def op(conn):
        _require_recurring_task_schema(conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                insert into public.recurring_task_templates (
                    title, category, area, goal_id, repeat_unit, repeat_every,
                    weekday, day_of_month, start_date, is_active
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning id;
                """,
                (
                    recurrence_data.title,
                    recurrence_data.category,
                    recurrence_data.area,
                    recurrence_data.goal_id,
                    recurrence_data.repeat_unit,
                    recurrence_data.repeat_every,
                    recurrence_data.weekday,
                    recurrence_data.day_of_month,
                    recurrence_data.start_date,
                    recurrence_data.is_active,
                ),
            )
            template_row = cur.fetchone()
            template_id = template_row["id"]
            first_due_date = get_next_recurring_task_due_date(
                recurrence_data,
                from_date=recurrence_data.start_date,
            )
            cur.execute(
                """
                insert into public.tasks (
                    title, category, area, goal_id, deadline, is_done, is_cancelled,
                    completed_at, is_active, recurring_template_id, recurring_occurrence_date
                )
                values (%s, %s, %s, %s, %s, false, false, null, true, %s, %s)
                returning id;
                """,
                (
                    recurrence_data.title,
                    recurrence_data.category,
                    recurrence_data.area,
                    recurrence_data.goal_id,
                    first_due_date,
                    template_id,
                    first_due_date,
                ),
            )
            task_row = cur.fetchone()
        conn.commit()
        return fetch_task_by_id(str(task_row["id"]))
    return _run_with_reconnect(op)


def update_task_and_generate_next(task_id: str, fields: dict) -> tuple[StoredTask | None, StoredTask | None]:
    allowed = {"title", "category", "area", "goal_id", "deadline", "is_done",
               "is_cancelled", "completed_at", "is_active"}
    updates = {k: v for k, v in fields.items() if k in allowed}

    def op(conn):
        if not _has_recurring_task_schema(conn):
            updated_task = update_task(task_id, fields)
            return updated_task, None
        generated_task_id: str | None = None
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, recurring_template_id, recurring_occurrence_date, deadline, is_done
                from public.tasks
                where id = %s
                for update;
                """,
                (task_id,),
            )
            existing = cur.fetchone()
            if not existing:
                conn.commit()
                return None, None

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                params = list(updates.values()) + [task_id]
                cur.execute(
                    f"update public.tasks set {set_clause}, updated_at = now() where id = %s;",
                    params,
                )

            should_generate = (
                bool(updates.get("is_done")) is True
                and existing["is_done"] is False
                and existing.get("recurring_template_id") is not None
            )
            if should_generate:
                cur.execute(
                    f"select {_RECURRING_TASK_COLS} from public.recurring_task_templates where id = %s for update;",
                    (existing["recurring_template_id"],),
                )
                template_row = cur.fetchone()
                if template_row:
                    template = _row_to_recurring_task_template(template_row)
                    anchor_date = existing.get("recurring_occurrence_date") or existing.get("deadline") or date.today()
                    next_due_date = get_next_recurring_task_due_date(
                        RecurringTaskTemplateData(
                            title=template.title,
                            category=template.category,
                            area=template.area,
                            goal_id=template.goal_id,
                            repeat_unit=template.repeat_unit,
                            repeat_every=template.repeat_every,
                            weekday=template.weekday,
                            day_of_month=template.day_of_month,
                            start_date=template.start_date,
                            is_active=template.is_active,
                        ),
                        from_date=anchor_date + timedelta(days=1),
                    )
                    if next_due_date is not None:
                        cur.execute(
                            """
                            select id
                            from public.tasks
                            where recurring_template_id = %s
                              and recurring_occurrence_date = %s
                            limit 1;
                            """,
                            (template.id, next_due_date),
                        )
                        duplicate = cur.fetchone()
                        if not duplicate:
                            cur.execute(
                                """
                                insert into public.tasks (
                                    title, category, area, goal_id, deadline, is_done, is_cancelled,
                                    completed_at, is_active, recurring_template_id, recurring_occurrence_date
                                )
                                values (%s, %s, %s, %s, %s, false, false, null, true, %s, %s)
                                returning id;
                                """,
                                (
                                    template.title,
                                    template.category,
                                    template.area,
                                    template.goal_id,
                                    next_due_date,
                                    template.id,
                                    next_due_date,
                                ),
                            )
                            generated_task_id = str(cur.fetchone()["id"])

        conn.commit()
        updated_task = fetch_task_by_id(task_id)
        generated_task = fetch_task_by_id(generated_task_id) if generated_task_id else None
        return updated_task, generated_task
    return _run_with_reconnect(op)


# ===================================================================
# EVENTS
# ===================================================================

def fetch_events(*, active_only: bool = True) -> list[StoredEvent]:
    sql = f"select {_EVENT_COLS} from public.events"
    if active_only:
        sql += " where is_active = true"
    sql += " order by event_date asc nulls last, created_at asc;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql)
            return [_row_to_event(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def fetch_event_by_id(event_id: str) -> StoredEvent | None:
    sql = f"select {_EVENT_COLS} from public.events where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (event_id,))
            row = cur.fetchone()
        return _row_to_event(row) if row else None
    return _run_with_reconnect(op)


def insert_event(data: EventData) -> StoredEvent:
    sql = f"""
        insert into public.events (title, event_date, event_time, venue, category, is_done, is_cancelled, is_active)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        returning {_EVENT_COLS};
    """
    params = (data.title, data.event_date, data.event_time, data.venue, data.category,
              data.is_done, data.is_cancelled, data.is_active)

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_event(row)
    return _run_with_reconnect(op)


def update_event(event_id: str, fields: dict) -> StoredEvent | None:
    allowed = {"title", "event_date", "event_time", "venue", "category",
               "is_done", "is_cancelled", "is_active"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return fetch_event_by_id(event_id)
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"update public.events set {set_clause}, updated_at = now() where id = %s returning {_EVENT_COLS};"
    params = list(updates.values()) + [event_id]

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_event(row) if row else None
    return _run_with_reconnect(op)


def delete_event(event_id: str) -> bool:
    sql = "delete from public.events where id = %s;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (event_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


# ===================================================================
# DAILY PLANS
# ===================================================================

def fetch_daily_plan_by_date(plan_date: date) -> StoredDailyPlan | None:
    sql = f"select {_PLAN_COLS} from public.daily_plans where plan_date = %s limit 1;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (plan_date,))
            row = cur.fetchone()
        return _row_to_daily_plan(row) if row else None
    return _run_with_reconnect(op)


def upsert_daily_plan(plan_date: date) -> StoredDailyPlan:
    sql = f"""
        insert into public.daily_plans (plan_date)
        values (%s)
        on conflict (plan_date) do update set updated_at = now()
        returning {_PLAN_COLS};
    """

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (plan_date,))
            row = cur.fetchone()
        conn.commit()
        return _row_to_daily_plan(row)
    return _run_with_reconnect(op)


# ===================================================================
# DAILY PLAN ITEMS
# ===================================================================

def fetch_daily_plan_items(daily_plan_id: str) -> list[StoredDailyPlanItem]:
    sql = f"select {_PLAN_ITEM_COLS} from public.daily_plan_items where daily_plan_id = %s order by sort_order asc nulls last, created_at asc;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (daily_plan_id,))
            return [_row_to_daily_plan_item(r) for r in cur.fetchall()]
    return _run_with_reconnect(op)


def insert_daily_plan_item(data: DailyPlanItemData) -> StoredDailyPlanItem:
    sql = f"""
        insert into public.daily_plan_items (
            daily_plan_id, item_type, task_id, event_id,
            title_snapshot, category_snapshot, area_snapshot,
            status, is_today_focus, is_important, is_urgent, is_highlight,
            time_text, note_text, sort_order, source_plan_item_id
        )
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        returning {_PLAN_ITEM_COLS};
    """
    params = (
        data.daily_plan_id, data.item_type, data.task_id, data.event_id,
        data.title_snapshot, data.category_snapshot, data.area_snapshot,
        data.status, data.is_today_focus, data.is_important, data.is_urgent, data.is_highlight,
        data.time_text, data.note_text, data.sort_order, data.source_plan_item_id,
    )

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_daily_plan_item(row)
    return _run_with_reconnect(op)


def update_daily_plan_item(item_id: str, fields: dict) -> StoredDailyPlanItem | None:
    allowed = {"title_snapshot", "category_snapshot", "area_snapshot", "status",
               "is_today_focus", "is_important", "is_urgent", "is_highlight",
               "time_text", "note_text", "sort_order", "moved_to_plan_item_id"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return None
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"update public.daily_plan_items set {set_clause}, updated_at = now() where id = %s returning {_PLAN_ITEM_COLS};"
    params = list(updates.values()) + [item_id]

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return _row_to_daily_plan_item(row) if row else None
    return _run_with_reconnect(op)


def delete_daily_plan_item(item_id: str) -> bool:
    def op(conn):
        available_columns = _get_daily_plan_item_columns(conn)
        with conn.cursor() as cur:
            # Be resilient to older schemas where these self-references may not
            # have been created with ON DELETE SET NULL.
            if "source_plan_item_id" in available_columns:
                cur.execute(
                    """
                    update public.daily_plan_items
                    set source_plan_item_id = null
                    where source_plan_item_id = %s;
                    """,
                    (item_id,),
                )
            if "moved_to_plan_item_id" in available_columns:
                cur.execute(
                    """
                    update public.daily_plan_items
                    set moved_to_plan_item_id = null
                    where moved_to_plan_item_id = %s;
                    """,
                    (item_id,),
                )
            cur.execute("delete from public.daily_plan_items where id = %s;", (item_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    return _run_with_reconnect(op)


def move_task_to_date(source_item_id: str, target_date: date) -> StoredDailyPlanItem:
    """Atomically move a task item to a new date."""

    def op(conn):
        with conn.cursor() as cur:
            # Fetch source item
            cur.execute(f"select {_PLAN_ITEM_COLS} from public.daily_plan_items where id = %s;", (source_item_id,))
            source_row = cur.fetchone()
            if not source_row:
                raise DatabaseSchemaError("Source plan item not found.")
            if source_row["status"] not in ("planned", "done"):
                raise DatabaseSchemaError("Only planned or done items can be moved.")
            if source_row["item_type"] != "task":
                raise DatabaseSchemaError("Only task items can be moved.")

            # Ensure target plan exists
            cur.execute(f"""
                insert into public.daily_plans (plan_date)
                values (%s)
                on conflict (plan_date) do update set updated_at = now()
                returning {_PLAN_COLS};
            """, (target_date,))
            target_plan = cur.fetchone()

            # Reuse an existing target item for the same task when present.
            cur.execute(
                f"""
                select {_PLAN_ITEM_COLS}
                from public.daily_plan_items
                where daily_plan_id = %s
                  and task_id = %s
                  and item_type = 'task'
                  and status in ('planned', 'done')
                order by created_at asc
                limit 1
                for update;
                """,
                (target_plan["id"], source_row["task_id"])
            )
            target_row = cur.fetchone()

            if target_row:
                cur.execute(
                    f"""
                    update public.daily_plan_items
                    set title_snapshot = %s,
                        category_snapshot = %s,
                        area_snapshot = %s,
                        status = 'planned',
                        is_today_focus = %s,
                        is_important = %s,
                        is_urgent = %s,
                        is_highlight = %s,
                        time_text = %s,
                        note_text = %s,
                        updated_at = now()
                    where id = %s
                    returning {_PLAN_ITEM_COLS};
                    """,
                    (
                        source_row["title_snapshot"],
                        source_row["category_snapshot"],
                        source_row["area_snapshot"],
                        source_row["is_today_focus"],
                        source_row["is_important"],
                        source_row["is_urgent"],
                        source_row["is_highlight"],
                        source_row["time_text"],
                        source_row["note_text"],
                        target_row["id"],
                    ),
                )
                new_item = cur.fetchone()
            else:
                # Insert target item
                cur.execute(f"""
                    insert into public.daily_plan_items (
                        daily_plan_id, item_type, task_id, event_id,
                        title_snapshot, category_snapshot, area_snapshot,
                        status, is_today_focus, is_important, is_urgent, is_highlight,
                        time_text, note_text, sort_order, source_plan_item_id
                    )
                    values (%s,'task',%s,null,%s,%s,%s,'planned',%s,%s,%s,%s,%s,%s,null,%s)
                    returning {_PLAN_ITEM_COLS};
                """, (
                    target_plan["id"], source_row["task_id"],
                    source_row["title_snapshot"], source_row["category_snapshot"], source_row["area_snapshot"],
                    source_row["is_today_focus"], source_row["is_important"], source_row["is_urgent"],
                    source_row["is_highlight"], source_row["time_text"], source_row["note_text"],
                    source_item_id,
                ))
                new_item = cur.fetchone()

            # Mark source as moved
            cur.execute(
                "update public.daily_plan_items set status = 'moved', moved_to_plan_item_id = %s, updated_at = now() where id = %s;",
                (new_item["id"], source_item_id)
            )

            if source_row["status"] == "done":
                cur.execute(
                    """
                    update public.tasks
                    set is_done = false,
                        completed_at = null,
                        updated_at = now()
                    where id = %s;
                    """,
                    (source_row["task_id"],),
                )

        conn.commit()
        return _row_to_daily_plan_item(new_item)
    return _run_with_reconnect(op)


def fetch_carryover_task_items(target_date: date) -> list[dict]:
    """Find focused task items from previous days that are still planned."""
    sql = """
        select dpi.*, dp.plan_date as source_plan_date
        from public.daily_plan_items dpi
        join public.daily_plans dp on dp.id = dpi.daily_plan_id
        where dp.plan_date < %s
          and dpi.item_type = 'task'
          and dpi.status = 'planned'
          and dpi.is_today_focus = true
          and dpi.task_id is not null
          and dpi.task_id not in (
              select dpi2.task_id
              from public.daily_plan_items dpi2
              join public.daily_plans dp2 on dp2.id = dpi2.daily_plan_id
              where dp2.plan_date = %s
                and dpi2.item_type = 'task'
                and dpi2.task_id is not null
          )
        order by dp.plan_date desc, dpi.sort_order asc nulls last, dpi.created_at asc;
    """

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql, (target_date, target_date))
            rows = cur.fetchall()
        seen_tasks: set[str] = set()
        result = []
        for r in rows:
            tid = str(r["task_id"])
            if tid in seen_tasks:
                continue
            seen_tasks.add(tid)
            item = _row_to_daily_plan_item(r)
            result.append({
                **_serialize_plan_item_dict(item),
                "source_plan_date": r["source_plan_date"].isoformat(),
                "is_carryover": True,
            })
        return result
    return _run_with_reconnect(op)


def _serialize_plan_item_dict(item: StoredDailyPlanItem) -> dict:
    return {
        "id": item.id,
        "daily_plan_id": item.daily_plan_id,
        "item_type": item.item_type,
        "task_id": item.task_id,
        "event_id": item.event_id,
        "title_snapshot": item.title_snapshot,
        "category_snapshot": item.category_snapshot,
        "area_snapshot": item.area_snapshot,
        "status": item.status,
        "is_today_focus": item.is_today_focus,
        "is_important": item.is_important,
        "is_urgent": item.is_urgent,
        "is_highlight": item.is_highlight,
        "time_text": item.time_text,
        "note_text": item.note_text,
        "sort_order": item.sort_order,
        "source_plan_item_id": item.source_plan_item_id,
        "moved_to_plan_item_id": item.moved_to_plan_item_id,
    }


# ===================================================================
# DAILY PLAN ITEMS — ENSURE TASK
# ===================================================================

def ensure_task_plan_item(task_id: str, plan_date: date, template: dict | None = None) -> StoredDailyPlanItem:
    """Create a daily plan item for a task on a date if one doesn't exist."""

    def op(conn):
        with conn.cursor() as cur:
            # Ensure plan
            cur.execute(f"""
                insert into public.daily_plans (plan_date)
                values (%s)
                on conflict (plan_date) do update set updated_at = now()
                returning {_PLAN_COLS};
            """, (plan_date,))
            plan = cur.fetchone()

            # Check existing
            cur.execute(
                f"select {_PLAN_ITEM_COLS} from public.daily_plan_items where daily_plan_id = %s and task_id = %s and item_type = 'task' and status in ('planned','done') limit 1;",
                (plan["id"], task_id)
            )
            existing = cur.fetchone()
            if existing:
                conn.commit()
                return _row_to_daily_plan_item(existing)

            t = template or {}
            cur.execute(f"""
                insert into public.daily_plan_items (
                    daily_plan_id, item_type, task_id, event_id,
                    title_snapshot, category_snapshot, area_snapshot,
                    status, is_today_focus, is_important, is_urgent, is_highlight,
                    time_text, note_text, sort_order
                )
                values (%s,'task',%s,null,%s,%s,%s,'planned',%s,%s,%s,%s,null,null,null)
                returning {_PLAN_ITEM_COLS};
            """, (
                plan["id"], task_id,
                t.get("title_snapshot", ""), t.get("category_snapshot"), t.get("area_snapshot"),
                t.get("is_today_focus", True), t.get("is_important", False),
                t.get("is_urgent", False), t.get("is_highlight", False),
            ))
            row = cur.fetchone()
        conn.commit()
        return _row_to_daily_plan_item(row)
    return _run_with_reconnect(op)


# ===================================================================
# TAG CONFIG
# ===================================================================

def fetch_planner_tag_config() -> dict[str, Any]:
    sql = "select config_key, config_value from public.planner_tag_config order by config_key;"

    def op(conn):
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        return {r["config_key"]: r["config_value"] for r in rows}
    return _run_with_reconnect(op)


def update_planner_tag_config(config_key: str, config_value: Any) -> None:
    sql = """
        insert into public.planner_tag_config (config_key, config_value)
        values (%s, %s::jsonb)
        on conflict (config_key) do update set config_value = excluded.config_value, updated_at = now();
    """

    def op(conn):
        import json
        with conn.cursor() as cur:
            cur.execute(sql, (config_key, json.dumps(config_value)))
        conn.commit()
    return _run_with_reconnect(op)


def cascade_tag_renames(renames: dict[str, list[tuple[str, str]]]) -> None:
    """Apply tag renames across planner tables atomically.

    renames is like: {"goals.area": [("old","new")], "tasks.category": [("old","new")], ...}
    """
    if not renames:
        return

    def op(conn):
        with conn.cursor() as cur:
            for col_path, pairs in renames.items():
                if "." not in col_path:
                    continue
                table, column = col_path.split(".", 1)
                for old_val, new_val in pairs:
                    cur.execute(
                        f"update public.{table} set {column} = %s where {column} = %s;",
                        (new_val, old_val)
                    )
        conn.commit()
    return _run_with_reconnect(op)
