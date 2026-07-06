"""Goal CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import fetch_goals, fetch_goal_by_id, insert_goal, update_goal, delete_goal
from src.planner_models import validate_goal
from api.serializers import serialize_goal

router = APIRouter(prefix="/goals", tags=["planner"])


class GoalCreate(BaseModel):
    title: str
    area: str | None = None
    goal_theme_id: str | None = None
    target_completion_date: str | None = None
    is_important: bool | None = False
    is_urgent: bool | None = False
    sort_order: int | None = None


class GoalUpdate(BaseModel):
    title: str | None = None
    area: str | None = None
    goal_theme_id: str | None = None
    target_completion_date: str | None = None
    is_important: bool | None = None
    is_urgent: bool | None = None
    is_done: bool | None = None
    is_cancelled: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


@router.get("")
def list_goals():
    goals = fetch_goals(active_only=True)
    return [serialize_goal(g) for g in goals]


@router.post("")
def create_goal(body: GoalCreate):
    data = validate_goal(body.model_dump())
    stored = insert_goal(data)
    return serialize_goal(stored)


@router.put("/{goal_id}")
def edit_goal(goal_id: str, body: GoalUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_goal(goal_id, fields)
    if not stored:
        return {"error": "Goal not found"}
    return serialize_goal(stored)


@router.delete("/{goal_id}")
def remove_goal(goal_id: str):
    delete_goal(goal_id)
    return {"ok": True}
