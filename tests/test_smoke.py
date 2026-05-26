from pathlib import Path


def test_project_structure_exists() -> None:
    required_paths = [
        Path("README.md"),
        Path("requirements.txt"),
        Path(".streamlit/secrets.toml.example"),
        Path("sample_data/sample_expense.csv"),
        Path("src/app.py"),
        Path("src/db.py"),
        Path("src/models.py"),
        Path("src/import_csv.py"),
        Path("src/export_csv.py"),
        Path("src/categorisation.py"),
        Path("src/reports.py"),
    ]

    for path in required_paths:
        assert path.exists()
