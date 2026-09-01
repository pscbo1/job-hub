"""
Tests for GET /api/applications/export (CSV and JSON download).
"""

from __future__ import annotations

import csv
import io
import json
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Application, ApplicationStage
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


def _client(tmp_path: Path) -> TestClient:
    return TestClient(
        create_app(profile_path=tmp_path / "profile.yaml", db_path=tmp_path / "j.db"),
        raise_server_exceptions=True,
    )


def _seed(tmp_path: Path, count: int = 2) -> list[Application]:
    repo = JobRepository(tmp_path / "j.db")
    apps = []
    for i in range(count):
        a = Application(
            title=f"Role {i}",
            employer=f"Corp {i}",
            location="Remote",
            url=f"https://example.com/{i}",
            source="manual",
            stage=ApplicationStage.APPLIED if i % 2 == 0 else ApplicationStage.DRAFT,
            notes=f"note {i}",
        )
        repo.create_application(a)
        apps.append(a)
    repo.close()
    return apps


# ── CSV export ────────────────────────────────────────────────────────────────


def test_export_csv_status_and_content_type(tmp_path: Path) -> None:
    _seed(tmp_path)
    r = _client(tmp_path).get("/api/applications/export")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]


def test_export_csv_disposition(tmp_path: Path) -> None:
    _seed(tmp_path)
    r = _client(tmp_path).get("/api/applications/export")
    assert "applications.csv" in r.headers["content-disposition"]


def test_export_csv_has_header_row(tmp_path: Path) -> None:
    _seed(tmp_path)
    r = _client(tmp_path).get("/api/applications/export")
    reader = csv.DictReader(io.StringIO(r.text))
    assert "title" in (reader.fieldnames or [])
    assert "employer" in (reader.fieldnames or [])
    assert "stage" in (reader.fieldnames or [])


def test_export_csv_row_count(tmp_path: Path) -> None:
    _seed(tmp_path, count=3)
    r = _client(tmp_path).get("/api/applications/export")
    reader = csv.DictReader(io.StringIO(r.text))
    rows = list(reader)
    assert len(rows) == 3


def test_export_csv_row_values(tmp_path: Path) -> None:
    _seed(tmp_path, count=1)
    r = _client(tmp_path).get("/api/applications/export")
    reader = csv.DictReader(io.StringIO(r.text))
    row = next(reader)
    assert row["title"] == "Role 0"
    assert row["employer"] == "Corp 0"
    assert row["stage"] == "applied"


def test_export_csv_empty_db(tmp_path: Path) -> None:
    r = _client(tmp_path).get("/api/applications/export")
    assert r.status_code == 200
    reader = csv.DictReader(io.StringIO(r.text))
    assert list(reader) == []


# ── JSON export ───────────────────────────────────────────────────────────────


def test_export_json_status_and_content_type(tmp_path: Path) -> None:
    _seed(tmp_path)
    r = _client(tmp_path).get("/api/applications/export?fmt=json")
    assert r.status_code == 200
    assert "application/json" in r.headers["content-type"]


def test_export_json_disposition(tmp_path: Path) -> None:
    _seed(tmp_path)
    r = _client(tmp_path).get("/api/applications/export?fmt=json")
    assert "applications.json" in r.headers["content-disposition"]


def test_export_json_is_list(tmp_path: Path) -> None:
    _seed(tmp_path, count=2)
    r = _client(tmp_path).get("/api/applications/export?fmt=json")
    data = json.loads(r.content)
    assert isinstance(data, list)
    assert len(data) == 2


def test_export_json_row_values(tmp_path: Path) -> None:
    _seed(tmp_path, count=1)
    r = _client(tmp_path).get("/api/applications/export?fmt=json")
    data = json.loads(r.content)
    assert data[0]["title"] == "Role 0"
    assert data[0]["stage"] == "applied"


def test_export_json_empty_db(tmp_path: Path) -> None:
    r = _client(tmp_path).get("/api/applications/export?fmt=json")
    assert r.status_code == 200
    assert json.loads(r.content) == []
