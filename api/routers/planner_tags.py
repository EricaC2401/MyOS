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
    renames: dict[str, list[Any]] | None = None


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
            normalized_pairs: list[tuple[str, str]] = []
            for pair in pairs:
                if isinstance(pair, dict):
                    old_value = pair.get("prev")
                    new_value = pair.get("next")
                    if old_value and new_value:
                        normalized_pairs.append((str(old_value), str(new_value)))
                    continue
                if isinstance(pair, (list, tuple)) and len(pair) == 2 and pair[0] and pair[1]:
                    normalized_pairs.append((str(pair[0]), str(pair[1])))
            rename_map[col_path] = normalized_pairs
        cascade_tag_renames(rename_map)

    return fetch_planner_tag_config()
