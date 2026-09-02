"""Tests for Application and GeneratedDocument persistence (repository layer)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from job_sentinel.core.models import (
    Application,
    ApplicationStage,
    DocumentKind,
    GeneratedDocument,
)
from job_sentinel.db.repository import SCHEMA_VERSION, JobRepository

if TYPE_CHECKING:
    from pathlib import Path


# ── fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def repo(tmp_path: Path) -> JobRepository:
    db = JobRepository(tmp_path / "test.db")
    yield db
    db.close()


def _app(**kwargs: object) -> Application:
    merged: dict[str, object] = {"title": "SWE Intern", "employer": "Acme"}
    merged.update(kwargs)
    return Application(**merged)  # type: ignore[arg-type]


def _doc(**kwargs: object) -> GeneratedDocument:
    merged: dict[str, object] = {"kind": DocumentKind.RESUME, "title": "SWE", "employer": "Acme"}
    merged.update(kwargs)
    return GeneratedDocument(**merged)  # type: ignore[arg-type]


# ── schema version ────────────────────────────────────────────────────────────


def test_schema_version_is_16() -> None:
    assert SCHEMA_VERSION == 21


def test_contact_columns_exist(repo: JobRepository) -> None:
    app_cols = {col.name for col in repo._db["applications"].columns}
    job_cols = {col.name for col in repo._db["jobs"].columns}
    assert "contact" in app_cols
    assert "tags" in app_cols
    assert "contact" in job_cols


def test_migration_creates_tables(tmp_path: Path) -> None:
    """Simulate a v1 → v2 migration: tables must appear after upgrading."""
    import sqlite_utils

    db_path = tmp_path / "migrate.db"
    # Create a bare v1 database (only meta + job_postings).
    raw = sqlite_utils.Database(str(db_path))
    raw["sentinel_meta"].insert({"key": "schema_version", "value": "1"})
    raw["job_postings"].create({"posting_id": str}, pk="posting_id")
    raw.conn.close()

    # Now open through the repository — migration should fire.
    repo = JobRepository(db_path)
    names = repo._db.table_names()
    repo.close()

    assert "applications" in names
    assert "generated_documents" in names


# ── Application CRUD ──────────────────────────────────────────────────────────


class TestApplicationCRUD:
    def test_create_and_get(self, repo: JobRepository) -> None:
        app = _app()
        created = repo.create_application(app)
        fetched = repo.get_application(created.id)
        assert fetched is not None
        assert fetched.title == "SWE Intern"
        assert fetched.employer == "Acme"
        assert fetched.stage == ApplicationStage.DRAFT

    def test_get_missing_returns_none(self, repo: JobRepository) -> None:
        assert repo.get_application("does-not-exist") is None

    def test_list_all(self, repo: JobRepository) -> None:
        repo.create_application(_app(title="Job A"))
        repo.create_application(_app(title="Job B"))
        apps = repo.list_applications()
        assert len(apps) == 2

    def test_list_filtered_by_stage(self, repo: JobRepository) -> None:
        a1 = _app(stage=ApplicationStage.APPLIED)
        a2 = _app(stage=ApplicationStage.DRAFT)
        repo.create_application(a1)
        repo.create_application(a2)
        applied = repo.list_applications(stage=ApplicationStage.APPLIED)
        assert len(applied) == 1
        assert applied[0].stage == ApplicationStage.APPLIED

    def test_list_newest_first(self, repo: JobRepository) -> None:
        from datetime import UTC, datetime

        old = Application(title="Old", created_at=datetime(2024, 1, 1, tzinfo=UTC))
        new = Application(title="New", created_at=datetime(2025, 1, 1, tzinfo=UTC))
        repo.create_application(old)
        repo.create_application(new)
        apps = repo.list_applications()
        assert apps[0].title == "New"

    def test_update_fields(self, repo: JobRepository) -> None:
        app = _app()
        repo.create_application(app)
        assert repo.update_application(app.id, stage=ApplicationStage.INTERVIEW, notes="wow")
        fetched = repo.get_application(app.id)
        assert fetched is not None
        assert fetched.stage == ApplicationStage.INTERVIEW
        assert fetched.notes == "wow"

    def test_update_missing_returns_false(self, repo: JobRepository) -> None:
        assert repo.update_application("ghost", notes="x") is False

    def test_delete(self, repo: JobRepository) -> None:
        app = _app()
        repo.create_application(app)
        assert repo.delete_application(app.id) is True
        assert repo.get_application(app.id) is None

    def test_delete_missing_returns_false(self, repo: JobRepository) -> None:
        assert repo.delete_application("ghost") is False

    def test_roundtrip_all_fields(self, repo: JobRepository) -> None:
        app = Application(
            title="Engineer",
            employer="Corp",
            location="Remote",
            url="https://example.com",
            source="adzuna",
            stage=ApplicationStage.OFFER,
            salary="$120k",
            applied_date="2025-01-15",
            deadline="2025-02-01",
            notes="great opportunity",
            posting_id="post-123",
            resume_document_id="doc-abc",
            raw_data={"key": "value"},
        )
        repo.create_application(app)
        back = repo.get_application(app.id)
        assert back is not None
        assert back.salary == "$120k"
        assert back.source == "adzuna"
        assert back.stage == ApplicationStage.OFFER
        assert back.posting_id == "post-123"
        assert back.resume_document_id == "doc-abc"
        assert back.raw_data == {"key": "value"}


# ── Application stats ─────────────────────────────────────────────────────────


class TestApplicationStats:
    def test_empty_stats_zero(self, repo: JobRepository) -> None:
        stats = repo.application_stats()
        assert stats["total"] == 0
        assert stats["draft"] == 0

    def test_counts_per_stage(self, repo: JobRepository) -> None:
        repo.create_application(_app(stage=ApplicationStage.APPLIED))
        repo.create_application(_app(stage=ApplicationStage.APPLIED))
        repo.create_application(_app(stage=ApplicationStage.DRAFT))
        stats = repo.application_stats()
        assert stats["applied"] == 2
        assert stats["draft"] == 1
        assert stats["total"] == 3


# ── GeneratedDocument CRUD ────────────────────────────────────────────────────


class TestDocumentCRUD:
    def test_create_and_get(self, repo: JobRepository) -> None:
        doc = _doc()
        repo.create_document(doc)
        fetched = repo.get_document(doc.id)
        assert fetched is not None
        assert fetched.kind == DocumentKind.RESUME
        assert fetched.title == "SWE"

    def test_get_missing_returns_none(self, repo: JobRepository) -> None:
        assert repo.get_document("ghost") is None

    def test_list_all(self, repo: JobRepository) -> None:
        repo.create_document(_doc(kind=DocumentKind.RESUME))
        repo.create_document(_doc(kind=DocumentKind.COVER_LETTER))
        docs = repo.list_documents()
        assert len(docs) == 2

    def test_list_filtered_by_kind(self, repo: JobRepository) -> None:
        repo.create_document(_doc(kind=DocumentKind.RESUME))
        repo.create_document(_doc(kind=DocumentKind.COVER_LETTER))
        resumes = repo.list_documents(kind=DocumentKind.RESUME)
        assert len(resumes) == 1
        assert resumes[0].kind == DocumentKind.RESUME

    def test_delete(self, repo: JobRepository) -> None:
        doc = _doc()
        repo.create_document(doc)
        assert repo.delete_document(doc.id) is True
        assert repo.get_document(doc.id) is None

    def test_delete_missing_returns_false(self, repo: JobRepository) -> None:
        assert repo.delete_document("ghost") is False

    def test_roundtrip_all_fields(self, repo: JobRepository) -> None:
        doc = GeneratedDocument(
            kind=DocumentKind.COVER_LETTER,
            label="summer app",
            title="Intern",
            employer="BigCo",
            file_path="/data/doc.pdf",
            tex_path="/data/doc.tex",
            ats_score=88.5,
            provider="ollama/llama3",
            tailored=True,
            job_snippet="We are looking for…",
            application_id="app-xyz",
            posting_id="post-789",
            raw_data={"extra": 42},
        )
        repo.create_document(doc)
        back = repo.get_document(doc.id)
        assert back is not None
        assert back.kind == DocumentKind.COVER_LETTER
        assert back.ats_score == pytest.approx(88.5)
        assert back.tailored is True
        assert back.tex_path == "/data/doc.tex"
        assert back.application_id == "app-xyz"
        assert back.raw_data == {"extra": 42}
