"""Classification super-group CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg2 import IntegrityError

from src.db import (
    delete_classification_group,
    delete_classification_mapping,
    fetch_classification_groups,
    fetch_classification_mappings,
    insert_classification_group,
    insert_classification_mapping,
    update_classification_group,
)

router = APIRouter(prefix="/classifications", tags=["classifications"])


class ClassificationGroupCreate(BaseModel):
    name: str
    color: str = "#8492a6"
    sort_order: int = 0


class ClassificationGroupUpdate(BaseModel):
    name: str
    color: str
    sort_order: int


class MappingCreate(BaseModel):
    expense_group: str
    expense_category: str | None = None


@router.get("")
def list_classifications():
    groups = fetch_classification_groups()
    mappings = fetch_classification_mappings()

    mappings_by_group = {}
    for m in mappings:
        mappings_by_group.setdefault(m.classification_group_id, []).append({
            "id": m.id,
            "expense_group": m.expense_group,
            "expense_category": m.expense_category,
        })

    return [
        {
            "id": g.id,
            "name": g.name,
            "color": g.color,
            "sort_order": g.sort_order,
            "mappings": mappings_by_group.get(g.id, []),
        }
        for g in groups
    ]


@router.post("")
def create_classification(body: ClassificationGroupCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required.")
    try:
        stored = insert_classification_group(name, body.color, body.sort_order)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A classification with that name already exists.") from exc
    return {"id": stored.id, "name": stored.name, "color": stored.color, "sort_order": stored.sort_order, "mappings": []}


@router.put("/{group_id}")
def update_classification(group_id: int, body: ClassificationGroupUpdate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required.")
    try:
        stored = update_classification_group(group_id, name, body.color, body.sort_order)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A classification with that name already exists.") from exc
    if stored is None:
        raise HTTPException(status_code=404, detail=f"Classification #{group_id} not found.")
    return {"id": stored.id, "name": stored.name, "color": stored.color, "sort_order": stored.sort_order}


@router.delete("/{group_id}")
def delete_classification_endpoint(group_id: int):
    deleted = delete_classification_group(group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Classification #{group_id} not found.")
    return {"deleted": True, "id": group_id}


@router.post("/{group_id}/mappings")
def add_mapping(group_id: int, body: MappingCreate):
    expense_group = body.expense_group.strip()
    expense_category = body.expense_category.strip() if body.expense_category else None
    if not expense_group:
        raise HTTPException(status_code=422, detail="expense_group is required.")
    try:
        stored = insert_classification_mapping(group_id, expense_group, expense_category)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="That mapping already exists.") from exc
    return {
        "id": stored.id,
        "classification_group_id": stored.classification_group_id,
        "expense_group": stored.expense_group,
        "expense_category": stored.expense_category,
    }


@router.delete("/mappings/{mapping_id}")
def remove_mapping(mapping_id: int):
    deleted = delete_classification_mapping(mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Mapping #{mapping_id} not found.")
    return {"deleted": True, "id": mapping_id}
