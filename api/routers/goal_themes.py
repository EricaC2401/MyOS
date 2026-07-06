"""Top-level planner goal theme CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    fetch_goal_themes,
    insert_goal_theme,
    update_goal_theme,
    delete_goal_theme,
)
from src.planner_models import validate_goal_theme
from api.serializers import serialize_goal_theme

router = APIRouter(prefix="/goal-themes", tags=["planner"])


class GoalThemeCreate(BaseModel):
    title: str
    notes: str | None = None
    is_done: bool | None = False
    is_cancelled: bool | None = False
    is_active: bool | None = True
    sort_order: int | None = None


class GoalThemeUpdate(BaseModel):
    title: str | None = None
    notes: str | None = None
    is_done: bool | None = None
    is_cancelled: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


@router.get("")
def list_goal_themes():
    themes = fetch_goal_themes(active_only=True)
    return [serialize_goal_theme(theme) for theme in themes]


@router.post("")
def create_goal_theme(body: GoalThemeCreate):
    data = validate_goal_theme(body.model_dump())
    stored = insert_goal_theme(data)
    return serialize_goal_theme(stored)


@router.put("/{goal_theme_id}")
def edit_goal_theme(goal_theme_id: str, body: GoalThemeUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_goal_theme(goal_theme_id, fields)
    if not stored:
        return {"error": "Goal not found"}
    return serialize_goal_theme(stored)


@router.delete("/{goal_theme_id}")
def remove_goal_theme(goal_theme_id: str):
    delete_goal_theme(goal_theme_id)
    return {"ok": True}
