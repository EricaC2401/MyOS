from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace

from api.routers import planner_tasks


def make_task(**overrides):
    base = {
        "id": "task-1",
        "title": "Weekly review",
        "category": "Personal",
        "area": "Career & Skills",
        "goal_id": None,
        "deadline": date(2026, 7, 3),
        "is_done": False,
        "is_cancelled": False,
        "completed_at": None,
        "is_active": True,
        "recurring_template_id": 11,
        "recurring_occurrence_date": date(2026, 7, 3),
        "recurring_repeat_unit": "weekly",
        "recurring_weekday": 4,
        "recurring_day_of_month": None,
        "recurring_is_active": True,
        "created_at": datetime(2026, 7, 2, 10, 0, 0),
        "updated_at": datetime(2026, 7, 2, 10, 0, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_create_task_passes_recurrence_payload(monkeypatch) -> None:
    captured: dict[str, object] = {}

    dummy_task_data = object()
    dummy_recurrence_data = object()
    stored_task = make_task()

    monkeypatch.setattr(planner_tasks, "validate_task", lambda payload: dummy_task_data)

    def fake_validate_recurring(payload):
        captured["payload"] = payload
        return dummy_recurrence_data

    monkeypatch.setattr(planner_tasks, "validate_recurring_task_template", fake_validate_recurring)
    monkeypatch.setattr(
        planner_tasks,
        "create_task_with_recurrence",
        lambda task_data, recurrence_data: (
            captured.update({"task_data": task_data, "recurrence_data": recurrence_data}) or stored_task
        ),
    )

    body = planner_tasks.TaskCreate(
        title="Weekly review",
        category="Personal",
        area="Career & Skills",
        deadline="2026-07-02",
        recurrence=planner_tasks.RecurrenceConfig(
            repeat_unit="weekly",
            weekday=4,
            start_date=None,
        ),
    )

    payload = planner_tasks.create_task(body)

    assert captured["payload"] == {
        "title": "Weekly review",
        "category": "Personal",
        "area": "Career & Skills",
        "goal_id": None,
        "repeat_unit": "weekly",
        "repeat_every": 1,
        "weekday": 4,
        "day_of_month": None,
        "start_date": "2026-07-02",
        "is_active": True,
    }
    assert captured["task_data"] is dummy_task_data
    assert captured["recurrence_data"] is dummy_recurrence_data
    assert payload["recurrence"]["repeat_unit"] == "weekly"


def test_edit_task_returns_generated_task_payload(monkeypatch) -> None:
    current = make_task(is_done=True, completed_at=date(2026, 7, 3))
    generated = make_task(
        id="task-2",
        deadline=date(2026, 7, 10),
        recurring_occurrence_date=date(2026, 7, 10),
        is_done=False,
        completed_at=None,
    )

    monkeypatch.setattr(planner_tasks, "update_task_and_generate_next", lambda task_id, fields: (current, generated))

    payload = planner_tasks.edit_task(
        "task-1",
        planner_tasks.TaskUpdate(is_done=True, completed_at="2026-07-03"),
    )

    assert payload["id"] == "task-1"
    assert payload["generated_task"]["id"] == "task-2"
    assert payload["generated_task"]["recurrence"]["weekday"] == 4
