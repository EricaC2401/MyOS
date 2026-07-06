from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace

from api.routers import goals


def make_goal(**overrides):
    base = {
        "id": "goal-1",
        "title": "Full-time job hunting",
        "area": "Career",
        "goal_theme_id": "theme-1",
        "goal_theme_title": "Career",
        "target_completion_date": date(2026, 7, 20),
        "is_important": False,
        "is_urgent": True,
        "is_done": False,
        "is_cancelled": False,
        "is_active": True,
        "sort_order": 2,
        "created_at": datetime(2026, 7, 6, 9, 0, 0),
        "updated_at": datetime(2026, 7, 6, 9, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_create_goal_includes_goal_theme_id(monkeypatch) -> None:
    captured: dict[str, object] = {}
    dummy_data = object()
    stored_goal = make_goal()

    def fake_validate(payload):
        captured["payload"] = payload
        return dummy_data

    def fake_insert(data):
        captured["data"] = data
        return stored_goal

    monkeypatch.setattr(goals, "validate_goal", fake_validate)
    monkeypatch.setattr(goals, "insert_goal", fake_insert)

    payload = goals.create_goal(
        goals.GoalCreate(
            title="Full-time job hunting",
            goal_theme_id="theme-1",
            target_completion_date="2026-07-20",
            is_urgent=True,
        )
    )

    assert captured["payload"]["goal_theme_id"] == "theme-1"
    assert captured["data"] is dummy_data
    assert payload["goal_theme_id"] == "theme-1"
    assert payload["goal_theme_title"] == "Career"
