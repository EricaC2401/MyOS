"""Habit CRUD endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    fetch_habits,
    fetch_habit_by_id,
    insert_habit,
    update_habit,
    delete_habit,
    fetch_habit_entries,
    upsert_habit_entry,
    delete_habit_entry,
)
from src.planner_models import validate_habit, ValidationError
from api.serializers import serialize_habit, serialize_habit_entry

router = APIRouter(prefix="/habits", tags=["planner"])


class HabitCreate(BaseModel):
    name: str
    description: str | None = None
    type: str | None = "habit"
    target: int | None = None
    tracking_days: int | None = None
    category: str | None = None
    icon: str | None = None
    is_active: bool | None = True
    sort_order: int | None = None


class HabitUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: str | None = None
    target: int | None = None
    tracking_days: int | None = None
    category: str | None = None
    icon: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class HabitEntryCreate(BaseModel):
    entry_date: str
    is_done: bool | None = True


class HabitReorder(BaseModel):
    ordered_ids: list[str]


@router.get("")
def list_habits():
    habits = fetch_habits(active_only=True)
    habit_ids = [h.id for h in habits]
    entries = fetch_habit_entries(habit_ids) if habit_ids else []
    entries_by_habit: dict[str, list[dict]] = {}
    for e in entries:
        entries_by_habit.setdefault(e.habit_id, []).append(serialize_habit_entry(e))
    return [
        {**serialize_habit(h), "entries": entries_by_habit.get(h.id, [])}
        for h in habits
    ]


@router.post("")
def create_habit(body: HabitCreate):
    data = validate_habit(body.model_dump())
    stored = insert_habit(data)
    return serialize_habit(stored)


@router.put("/{habit_id}")
def edit_habit(habit_id: str, body: HabitUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_habit(habit_id, fields)
    if not stored:
        return {"error": "Habit not found"}, 404
    return serialize_habit(stored)


@router.delete("/{habit_id}")
def remove_habit(habit_id: str):
    delete_habit(habit_id)
    return {"ok": True}


@router.post("/{habit_id}/entries")
def toggle_habit_entry(habit_id: str, body: HabitEntryCreate):
    entry_date = date.fromisoformat(body.entry_date)
    entry = upsert_habit_entry(habit_id, entry_date, body.is_done or True)
    return serialize_habit_entry(entry)


@router.delete("/{habit_id}/entries/{entry_date}")
def remove_habit_entry(habit_id: str, entry_date: str):
    d = date.fromisoformat(entry_date)
    delete_habit_entry(habit_id, d)
    return {"ok": True}


@router.put("/reorder")
def reorder_habits(body: HabitReorder):
    for idx, hid in enumerate(body.ordered_ids):
        update_habit(hid, {"sort_order": idx})
    return {"ok": True}
