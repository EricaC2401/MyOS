"""Daily plan item endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    insert_daily_plan_item,
    update_daily_plan_item,
    delete_daily_plan_item,
    move_task_to_date,
    ensure_task_plan_item,
)
from src.planner_models import validate_daily_plan_item
from api.serializers import serialize_daily_plan_item

router = APIRouter(prefix="/daily-plan-items", tags=["planner"])


class PlanItemCreate(BaseModel):
    daily_plan_id: str
    item_type: str
    task_id: str | None = None
    event_id: str | None = None
    title_snapshot: str | None = ""
    category_snapshot: str | None = None
    area_snapshot: str | None = None
    status: str | None = "planned"
    is_today_focus: bool | None = False
    is_important: bool | None = False
    is_urgent: bool | None = False
    is_highlight: bool | None = False
    time_text: str | None = None
    note_text: str | None = None
    sort_order: int | None = None
    source_plan_item_id: str | None = None


class PlanItemUpdate(BaseModel):
    title_snapshot: str | None = None
    category_snapshot: str | None = None
    area_snapshot: str | None = None
    status: str | None = None
    is_today_focus: bool | None = None
    is_important: bool | None = None
    is_urgent: bool | None = None
    is_highlight: bool | None = None
    time_text: str | None = None
    note_text: str | None = None
    sort_order: int | None = None


class MoveRequest(BaseModel):
    target_date: str


class EnsureTaskRequest(BaseModel):
    task_id: str
    plan_date: str
    title_snapshot: str | None = ""
    category_snapshot: str | None = None
    area_snapshot: str | None = None
    is_today_focus: bool | None = True
    is_important: bool | None = False
    is_urgent: bool | None = False
    is_highlight: bool | None = False


@router.post("")
def create_plan_item(body: PlanItemCreate):
    data = validate_daily_plan_item(body.model_dump())
    stored = insert_daily_plan_item(data)
    return serialize_daily_plan_item(stored)


@router.put("/{item_id}")
def edit_plan_item(item_id: str, body: PlanItemUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_daily_plan_item(item_id, fields)
    if not stored:
        return {"error": "Item not found"}
    return serialize_daily_plan_item(stored)


@router.delete("/{item_id}")
def remove_plan_item(item_id: str):
    delete_daily_plan_item(item_id)
    return {"ok": True}


@router.post("/{item_id}/move")
def move_item(item_id: str, body: MoveRequest):
    target = date.fromisoformat(body.target_date)
    new_item = move_task_to_date(item_id, target)
    return serialize_daily_plan_item(new_item)


@router.post("/ensure-task")
def ensure_task(body: EnsureTaskRequest):
    d = date.fromisoformat(body.plan_date)
    template = {
        "title_snapshot": body.title_snapshot or "",
        "category_snapshot": body.category_snapshot,
        "area_snapshot": body.area_snapshot,
        "is_today_focus": body.is_today_focus if body.is_today_focus is not None else True,
        "is_important": body.is_important or False,
        "is_urgent": body.is_urgent or False,
        "is_highlight": body.is_highlight or False,
    }
    stored = ensure_task_plan_item(body.task_id, d, template)
    return serialize_daily_plan_item(stored)
