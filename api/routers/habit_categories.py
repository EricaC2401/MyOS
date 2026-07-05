"""Habit category CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    fetch_habit_categories,
    insert_habit_category,
    update_habit_category,
    delete_habit_category,
)
from api.serializers import serialize_habit_category

router = APIRouter(prefix="/habit-categories", tags=["planner"])


class HabitCategoryCreate(BaseModel):
    name: str
    icon: str | None = "ti-check"
    color_key: str | None = "gray"
    sort_order: int | None = None


class HabitCategoryUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    color_key: str | None = None
    sort_order: int | None = None


@router.get("")
def list_habit_categories():
    cats = fetch_habit_categories()
    return [serialize_habit_category(c) for c in cats]


@router.post("")
def create_habit_category(body: HabitCategoryCreate):
    stored = insert_habit_category(
        name=body.name,
        icon=body.icon or "ti-check",
        color_key=body.color_key or "gray",
        sort_order=body.sort_order,
    )
    return serialize_habit_category(stored)


@router.put("/{cat_id}")
def edit_habit_category(cat_id: str, body: HabitCategoryUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_habit_category(cat_id, fields)
    if not stored:
        return {"error": "Category not found"}
    return serialize_habit_category(stored)


@router.delete("/{cat_id}")
def remove_habit_category(cat_id: str):
    delete_habit_category(cat_id)
    return {"ok": True}
