"""Daily plan endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter

from src.planner_db import (
    fetch_daily_plan_by_date,
    upsert_daily_plan,
    fetch_daily_plan_items,
    fetch_carryover_task_items,
)
from api.serializers import serialize_daily_plan, serialize_daily_plan_item

router = APIRouter(prefix="/daily-plans", tags=["planner"])


@router.get("/{plan_date}")
def get_daily_plan(plan_date: str):
    d = date.fromisoformat(plan_date)
    plan = fetch_daily_plan_by_date(d)
    if not plan:
        return {"plan": None, "items": []}
    items = fetch_daily_plan_items(plan.id)
    return {
        "plan": serialize_daily_plan(plan),
        "items": [serialize_daily_plan_item(i) for i in items],
    }


@router.post("/{plan_date}")
def ensure_daily_plan(plan_date: str):
    d = date.fromisoformat(plan_date)
    plan = upsert_daily_plan(d)
    return serialize_daily_plan(plan)


@router.get("/{plan_date}/carryover-tasks")
def get_carryover_tasks(plan_date: str):
    d = date.fromisoformat(plan_date)
    return fetch_carryover_task_items(d)
