from __future__ import annotations

from api.routers import daily_plan_items


def test_remove_plan_item_calls_delete_helper(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_delete(item_id: str) -> bool:
        captured["item_id"] = item_id
        return True

    monkeypatch.setattr(daily_plan_items, "delete_daily_plan_item", fake_delete)

    payload = daily_plan_items.remove_plan_item("plan-item-123")

    assert captured["item_id"] == "plan-item-123"
    assert payload == {"ok": True}
