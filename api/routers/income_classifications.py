"""Income classification and source config endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg2 import IntegrityError

from src.db import (
    delete_income_classification_group,
    delete_income_source_config,
    fetch_income_classification_groups,
    fetch_income_source_configs,
    insert_income_classification_group,
    update_income_classification_group,
    upsert_income_source_config,
)

router = APIRouter(prefix="/income-classifications", tags=["income-classifications"])


class GroupCreate(BaseModel):
    name: str
    color: str = "#8492a6"
    sort_order: int = 0


class GroupUpdate(BaseModel):
    name: str
    color: str
    sort_order: int


class SourceConfigUpsert(BaseModel):
    source_name: str
    color: str = "#8492a6"
    classification_group_id: int | None = None


@router.get("")
def list_income_classifications():
    groups = fetch_income_classification_groups()
    sources = fetch_income_source_configs()

    sources_by_group = {}
    unassigned = []
    for s in sources:
        entry = {"id": s.id, "source_name": s.source_name, "color": s.color,
                 "classification_group_id": s.income_classification_group_id}
        if s.income_classification_group_id:
            sources_by_group.setdefault(s.income_classification_group_id, []).append(entry)
        else:
            unassigned.append(entry)

    return {
        "groups": [
            {
                "id": g.id, "name": g.name, "color": g.color, "sort_order": g.sort_order,
                "sources": sources_by_group.get(g.id, []),
            }
            for g in groups
        ],
        "unassigned_sources": unassigned,
        "all_sources": [
            {"id": s.id, "source_name": s.source_name, "color": s.color,
             "classification_group_id": s.income_classification_group_id}
            for s in sources
        ],
    }


@router.post("/groups")
def create_group(body: GroupCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required.")
    try:
        stored = insert_income_classification_group(name, body.color, body.sort_order)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Group already exists.") from exc
    return {"id": stored.id, "name": stored.name, "color": stored.color, "sort_order": stored.sort_order, "sources": []}


@router.put("/groups/{group_id}")
def update_group(group_id: int, body: GroupUpdate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required.")
    try:
        stored = update_income_classification_group(group_id, name, body.color, body.sort_order)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Group name already exists.") from exc
    if stored is None:
        raise HTTPException(status_code=404, detail=f"Group #{group_id} not found.")
    return {"id": stored.id, "name": stored.name, "color": stored.color, "sort_order": stored.sort_order}


@router.delete("/groups/{group_id}")
def delete_group(group_id: int):
    deleted = delete_income_classification_group(group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Group #{group_id} not found.")
    return {"deleted": True, "id": group_id}


@router.post("/sources")
def upsert_source(body: SourceConfigUpsert):
    source_name = body.source_name.strip()
    if not source_name:
        raise HTTPException(status_code=422, detail="Source name is required.")
    stored = upsert_income_source_config(source_name, body.color, body.classification_group_id)
    return {"id": stored.id, "source_name": stored.source_name, "color": stored.color,
            "classification_group_id": stored.income_classification_group_id}


@router.delete("/sources/{config_id}")
def delete_source(config_id: int):
    deleted = delete_income_source_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Source config #{config_id} not found.")
    return {"deleted": True, "id": config_id}
