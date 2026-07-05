"""Event CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import fetch_events, fetch_event_by_id, insert_event, update_event, delete_event
from src.planner_models import validate_event
from api.serializers import serialize_event

router = APIRouter(prefix="/events", tags=["planner"])


class EventCreate(BaseModel):
    title: str
    event_date: str | None = None
    event_time: str | None = None
    venue: str | None = None
    category: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    event_date: str | None = None
    event_time: str | None = None
    venue: str | None = None
    category: str | None = None
    is_done: bool | None = None
    is_cancelled: bool | None = None
    is_active: bool | None = None


@router.get("")
def list_events():
    events = fetch_events(active_only=True)
    return [serialize_event(e) for e in events]


@router.post("")
def create_event(body: EventCreate):
    data = validate_event(body.model_dump())
    stored = insert_event(data)
    return serialize_event(stored)


@router.put("/{event_id}")
def edit_event(event_id: str, body: EventUpdate):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    stored = update_event(event_id, fields)
    if not stored:
        return {"error": "Event not found"}
    return serialize_event(stored)


@router.delete("/{event_id}")
def remove_event(event_id: str):
    delete_event(event_id)
    return {"ok": True}
