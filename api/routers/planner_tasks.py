"""Task CRUD endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    fetch_tasks,
    fetch_task_by_id,
    create_task_with_recurrence,
    update_task,
    update_task_and_generate_next,
    delete_task,
    fetch_recurring_task_template_by_id,
    set_task_recurrence,
    update_recurring_task_template,
)
from src.planner_models import validate_task, validate_recurring_task_template
from api.serializers import serialize_task, serialize_recurring_task_template

router = APIRouter(prefix="/tasks", tags=["planner"])


class RecurrenceConfig(BaseModel):
    repeat_unit: str
    repeat_every: int = 1
    weekday: int | None = None
    day_of_month: int | None = None
    start_date: str | None = None
    is_active: bool = True


class TaskCreate(BaseModel):
    title: str
    category: str | None = None
    area: str | None = None
    goal_id: str | None = None
    deadline: str | None = None
    recurrence: RecurrenceConfig | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    area: str | None = None
    goal_id: str | None = None
    deadline: str | None = None
    recurrence: RecurrenceConfig | None = None
    is_done: bool | None = None
    is_cancelled: bool | None = None
    completed_at: str | None = None
    is_active: bool | None = None


class RecurringTaskTemplateUpdate(BaseModel):
    title: str
    category: str | None = None
    area: str | None = None
    goal_id: str | None = None
    repeat_unit: str
    repeat_every: int = 1
    weekday: int | None = None
    day_of_month: int | None = None
    start_date: str
    is_active: bool = True


@router.get("")
def list_tasks():
    tasks = fetch_tasks(active_only=True)
    return [serialize_task(t) for t in tasks]


@router.post("")
def create_task(body: TaskCreate):
    body_data = body.model_dump()
    recurrence = body_data.pop("recurrence", None)
    task_data = validate_task(body_data)
    recurring_data = None
    if recurrence is not None:
        recurring_payload = {
            "title": body.title,
            "category": body.category,
            "area": body.area,
            "goal_id": body.goal_id,
            "repeat_unit": recurrence["repeat_unit"],
            "repeat_every": recurrence.get("repeat_every", 1),
            "weekday": recurrence.get("weekday"),
            "day_of_month": recurrence.get("day_of_month"),
            "start_date": recurrence.get("start_date") or body.deadline,
            "is_active": recurrence.get("is_active", True),
        }
        recurring_data = validate_recurring_task_template(recurring_payload)
    stored = create_task_with_recurrence(task_data, recurring_data)
    return serialize_task(stored)


@router.put("/{task_id}")
def edit_task(task_id: str, body: TaskUpdate):
    fields = body.model_dump(exclude_unset=True)
    recurrence_config = fields.pop("recurrence", None) if "recurrence" in fields else None
    recurrence_supplied = "recurrence" in body.model_dump(exclude_unset=True)

    if fields:
        if "is_done" in fields:
            stored, generated = update_task_and_generate_next(task_id, fields)
        else:
            stored = update_task(task_id, fields)
            generated = None
    else:
        stored = fetch_task_by_id(task_id)
        generated = None

    if recurrence_supplied:
        if not stored:
            return {"error": "Task not found"}
        recurrence_data = None
        if recurrence_config is not None:
            current_template = (
                fetch_recurring_task_template_by_id(stored.recurring_template_id)
                if stored.recurring_template_id is not None
                else None
            )
            recurring_payload = {
                "title": stored.title,
                "category": stored.category,
                "area": stored.area,
                "goal_id": stored.goal_id,
                "repeat_unit": recurrence_config["repeat_unit"],
                "repeat_every": recurrence_config.get("repeat_every", current_template.repeat_every if current_template else 1),
                "weekday": recurrence_config.get("weekday"),
                "day_of_month": recurrence_config.get("day_of_month"),
                "start_date": (
                    recurrence_config.get("start_date")
                    or (current_template.start_date.isoformat() if current_template else None)
                    or (stored.deadline.isoformat() if stored.deadline else None)
                    or date.today().isoformat()
                ),
                "is_active": recurrence_config.get("is_active", True),
            }
            recurrence_data = validate_recurring_task_template(recurring_payload)
        stored = set_task_recurrence(task_id, recurrence_data)

    if not stored:
        return {"error": "Task not found"}
    payload = serialize_task(stored)
    if generated is not None:
        payload["generated_task"] = serialize_task(generated)
    return payload


@router.get("/recurring/{template_id}")
def get_recurring_task_template(template_id: int):
    stored = fetch_recurring_task_template_by_id(template_id)
    if not stored:
        return {"error": "Recurring task template not found"}
    return serialize_recurring_task_template(stored)


@router.put("/recurring/{template_id}")
def edit_recurring_task_template(template_id: int, body: RecurringTaskTemplateUpdate):
    template = validate_recurring_task_template(body.model_dump())
    updated = update_recurring_task_template(template_id, template)
    if not updated:
        return {"error": "Recurring task template not found"}
    return serialize_recurring_task_template(updated)


@router.delete("/{task_id}")
def remove_task(task_id: str):
    delete_task(task_id)
    return {"ok": True}
