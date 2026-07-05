"""Planner tag configuration endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from src.planner_db import (
    fetch_planner_tag_config,
    update_planner_tag_config,
    cascade_tag_renames,
)

router = APIRouter(prefix="/planner/tags", tags=["planner"])


class TagConfigUpdate(BaseModel):
    areas: list[dict[str, str]] | None = None
    task_categories: list[dict[str, str]] | None = None
    event_categories: list[dict[str, str]] | None = None
    renames: dict[str, list[list[str]]] | None = None


@router.get("")
def get_tag_config():
    return fetch_planner_tag_config()


@router.put("")
def save_tag_config(body: TagConfigUpdate):
    if body.areas is not None:
        update_planner_tag_config("areas", body.areas)
    if body.task_categories is not None:
        update_planner_tag_config("task_categories", body.task_categories)
    if body.event_categories is not None:
        update_planner_tag_config("event_categories", body.event_categories)

    if body.renames:
        rename_map: dict[str, list[tuple[str, str]]] = {}
        for col_path, pairs in body.renames.items():
            rename_map[col_path] = [(p[0], p[1]) for p in pairs if len(p) == 2]
        cascade_tag_renames(rename_map)

    return fetch_planner_tag_config()
