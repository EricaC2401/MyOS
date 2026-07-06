from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from api.routers import goal_themes


def make_goal_theme(**overrides):
    base = {
        "id": "theme-1",
        "title": "Career",
        "notes": "Focus on high-quality applications.",
        "is_done": False,
        "is_cancelled": False,
        "is_active": True,
        "sort_order": 1,
        "created_at": datetime(2026, 7, 6, 9, 0, 0),
        "updated_at": datetime(2026, 7, 6, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_create_goal_theme_validates_and_serializes(monkeypatch) -> None:
    captured: dict[str, object] = {}
    stored_theme = make_goal_theme()
    dummy_data = object()

    def fake_validate(payload):
        captured["payload"] = payload
        return dummy_data

    def fake_insert(data):
        captured["data"] = data
        return stored_theme

    monkeypatch.setattr(goal_themes, "validate_goal_theme", fake_validate)
    monkeypatch.setattr(goal_themes, "insert_goal_theme", fake_insert)

    payload = goal_themes.create_goal_theme(
        goal_themes.GoalThemeCreate(
            title="Career",
            notes="Focus on high-quality applications.",
        )
    )

    assert captured["payload"] == {
        "title": "Career",
        "notes": "Focus on high-quality applications.",
        "is_done": False,
        "is_cancelled": False,
        "is_active": True,
        "sort_order": None,
    }
    assert captured["data"] is dummy_data
    assert payload["title"] == "Career"
    assert payload["notes"] == "Focus on high-quality applications."


def test_edit_goal_theme_returns_updated_payload(monkeypatch) -> None:
    stored_theme = make_goal_theme(notes="New note")

    monkeypatch.setattr(goal_themes, "update_goal_theme", lambda goal_theme_id, fields: stored_theme)

    payload = goal_themes.edit_goal_theme(
        "theme-1",
        goal_themes.GoalThemeUpdate(notes="New note"),
    )

    assert payload["id"] == "theme-1"
    assert payload["notes"] == "New note"
