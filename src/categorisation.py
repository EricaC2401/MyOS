"""Transaction category helpers."""

from __future__ import annotations

DEFAULT_CATEGORY = "Uncategorised"

DEFAULT_CATEGORIES = (
    "Housing",
    "Groceries",
    "C Groceries",
    "Food",
    "Drink",
    "Car Related",
    "Transport",
    "Eating out",
    "Shopping",
    "Bills",
    "Subscriptions",
    "Healthcare",
    "Travel",
    "Gift",
    "LH",
    "Other",
    DEFAULT_CATEGORY,
)

CHART_CATEGORY_PALETTE = (
    "#5B6C9E",
    "#7C8FB8",
    "#8E79B7",
    "#B07AA1",
    "#C47A7A",
    "#C6925B",
    "#C9B458",
    "#8DAA5B",
    "#5E9B73",
    "#5A9D8F",
    "#5D98B3",
    "#7A8DA8",
    "#9A8F80",
    "#7E7E92",
)

CATEGORY_COLOR_MAP = {
    "Housing": "#5B6C9E",
    "Car Related": "#7C8FB8",
    "Transport": "#5D98B3",
    "Food": "#5E9B73",
    "Groceries": "#8DAA5B",
    "C Groceries": "#5A9D8F",
    "Drink": "#C9B458",
    "Eating out": "#C6925B",
    "Eat Out": "#C6925B",
    "Shopping": "#8E79B7",
    "Bills": "#C47A7A",
    "Subscriptions": "#B07AA1",
    "Subscription": "#B07AA1",
    "Healthcare": "#5D98B3",
    "Health": "#5D98B3",
    "Travel": "#7A8DA8",
    "Gift": "#C47A7A",
    "LH": "#B07AA1",
    "Other": "#7E7E92",
    DEFAULT_CATEGORY: "#7A8DA8",
    "Gathering": "#C6925B",
    "Clothing": "#C47A7A",
    "Snacks": "#8E79B7",
}


def get_default_categories() -> list[str]:
    """Return the default category list for the current expense-only stage."""

    return list(DEFAULT_CATEGORIES)


def normalize_category(category: str | None) -> str:
    """Return a clean category value, defaulting blanks to Uncategorised."""

    if category is None:
        return DEFAULT_CATEGORY

    normalized = " ".join(str(category).strip().split())
    if not normalized:
        return DEFAULT_CATEGORY

    return normalized


def get_category_color(category: str) -> str:
    """Return a stable display color for one category."""

    normalized = normalize_category(category)
    if normalized in CATEGORY_COLOR_MAP:
        return CATEGORY_COLOR_MAP[normalized]

    fallback_index = sum(ord(char) for char in normalized) % len(CHART_CATEGORY_PALETTE)
    return CHART_CATEGORY_PALETTE[fallback_index]
