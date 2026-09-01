"""V0 ``jobs`` / ``jobs_raw`` schema and repository behaviour."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import pytest
import sqlite_utils
from pydantic import ValidationError

from job_sentinel.core.models import (
    CloseReason,
    Job,
    JobPosting,
    JobRaw,
    JobStatus,
    compute_job_fingerprint,
    source_job_id_from_canonical_url,
)
from job_sentinel.db.repository import SCHEMA_VERSION, JobRepository

if TYPE_CHECKING:
    from pathlib import Path

_TRACKING_COLUMNS = {
    "favorite",
    "next_step",
    "comment",
    "applied_at",
    "close_reason",
    "deadline",
    "follow_up_at",
    "last_activity_at",
}


@pytest.fixture()
def repo(tmp_path: Path) -> JobRepository:
    db = JobRepository(tmp_path / "jobs_v0.db")
    yield db
    db.close()


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "remoteok",
        "source_job_id": "src-1",
        "title": "Software Engineer",
        "company": "Acme",
        "location": "Remote",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def _column_names(repo: JobRepository, table: str) -> set[str]:
    return {col.name for col in repo._db[table].columns}


class TestMigration:
    def test_fresh_db_creates_jobs_and_jobs_raw(self, repo: JobRepository) -> None:
        names = set(repo._db.table_names())
        assert "jobs" in names
        assert "jobs_raw" in names
        assert "job_postings" in names
        assert "job_tasks" in names
        jobs_cols = _column_names(repo, "jobs")
        assert _TRACKING_COLUMNS.issubset(jobs_cols)
        assert "filter_state" in jobs_cols
        assert "filter_reasons" in jobs_cols
        assert "sponsorship" in jobs_cols
        assert "sponsor_employers" in names
        assert "sponsor_registry_sync" in names
        assert "market" in jobs_cols
        assert "fingerprint" in jobs_cols
        raw_cols = _column_names(repo, "jobs_raw")
        assert "raw_payload" in raw_cols
        assert "run_id" in raw_cols

    def test_v2_migration_adds_tables_keeps_job_postings(self, tmp_path: Path) -> None:
        db_path = tmp_path / "v2.db"
        raw = sqlite_utils.Database(str(db_path))
        raw["sentinel_meta"].insert({"key": "schema_version", "value": "2"}, pk="key")
        raw["job_postings"].create({"posting_id": str, "title": str}, pk="posting_id")
        raw["job_postings"].insert({"posting_id": "legacy-1", "title": "Intern"})
        raw["applications"].create({"id": str}, pk="id")
        raw["generated_documents"].create({"id": str}, pk="id")
        raw.conn.close()

        repo = JobRepository(db_path)
        names = set(repo._db.table_names())
        legacy = repo.get_job("legacy-1")
        version = repo._db["sentinel_meta"].get("schema_version")["value"]
        repo.close()

        assert "jobs" in names
        assert "jobs_raw" in names
        assert "job_postings" in names
        assert legacy is not None
        assert legacy.title == "Intern"
        assert int(version) == SCHEMA_VERSION

    def test_v5_rebuilds_status_check_and_tracking_columns(self, tmp_path: Path) -> None:
        db_path = tmp_path / "v5.db"
        raw = sqlite_utils.Database(str(db_path))
        raw["sentinel_meta"].insert({"key": "schema_version", "value": "5"}, pk="key")
        raw.execute(
            """
            CREATE TABLE jobs (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_job_id TEXT NOT NULL,
                job_url TEXT NOT NULL DEFAULT '',
                canonical_url TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                company TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                employment_type TEXT NOT NULL DEFAULT '',
                salary TEXT NOT NULL DEFAULT '',
                published_at TEXT,
                discovered_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                fingerprint TEXT NOT NULL DEFAULT '',
                status TEXT DEFAULT NULL,
                match_score REAL,
                market TEXT NOT NULL DEFAULT '',
                filter_state TEXT NOT NULL DEFAULT 'included',
                filter_reasons TEXT NOT NULL DEFAULT '[]',
                CHECK (
                    status IS NULL
                    OR status IN ('saved', 'to_do', 'applied', 'closed', 'reference')
                )
            )
            """
        )
        raw["jobs"].insert(
            {
                "id": "legacy-saved",
                "source": "zhaopin",
                "source_job_id": "old-1",
                "title": "产品经理",
                "company": "示例",
                "discovered_at": "2026-08-01T00:00:00+00:00",
                "last_seen_at": "2026-08-01T00:00:00+00:00",
                "updated_at": "2026-08-01T00:00:00+00:00",
                "status": "saved",
            }
        )
        raw["jobs"].insert(
            {
                "id": "legacy-null",
                "source": "zhaopin",
                "source_job_id": "old-2",
                "title": "设计师",
                "company": "示例",
                "discovered_at": "2026-08-02T00:00:00+00:00",
                "last_seen_at": "2026-08-02T00:00:00+00:00",
                "updated_at": "2026-08-02T00:00:00+00:00",
                "status": None,
            }
        )
        raw.conn.close()

        repo = JobRepository(db_path)
        saved = repo.get_hub_job("legacy-saved")
        unset = repo.get_hub_job("legacy-null")
        sql = repo._db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'"
        ).fetchone()[0]
        version = repo._db["sentinel_meta"].get("schema_version")["value"]
        interviewed = repo.update_hub_job("legacy-saved", {"status": JobStatus.INTERVIEW})
        repo.close()

        assert saved is not None
        assert saved.status == JobStatus.UNDER_STUDY
        assert unset is not None
        assert unset.status == JobStatus.UNDER_STUDY
        assert "under_study" in sql
        assert "favorite" in sql
        assert int(version) == SCHEMA_VERSION
        assert interviewed is not None
        assert interviewed.status == JobStatus.INTERVIEW

    def test_job_postings_write_still_works(self, repo: JobRepository) -> None:
        posting = JobPosting(posting_id="p-1", title="Legacy scrape")
        assert repo.save_job(posting) is True
        fetched = repo.get_job("p-1")
        assert fetched is not None
        assert fetched.title == "Legacy scrape"


class TestJobStatus:
    def test_status_defaults_to_under_study(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        assert stored.status == JobStatus.UNDER_STUDY
        row = dict(repo._db["jobs"].get(stored.id))
        assert row["status"] == JobStatus.UNDER_STUDY.value

    def test_invalid_status_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Job(source="x", source_job_id="1", status="saved")  # type: ignore[arg-type]

    @pytest.mark.parametrize("value", list(JobStatus))
    def test_allowed_statuses(self, value: JobStatus) -> None:
        job = Job(source="x", source_job_id="1", status=value)
        assert job.status == value


class TestUpsertInvariants:
    def test_upsert_does_not_reset_discovered_at(self, repo: JobRepository) -> None:
        original = datetime(2020, 6, 15, 12, 0, tzinfo=UTC)
        first = repo.upsert_job(_job(discovered_at=original, title="v1"))
        later = first.model_copy(
            update={
                "title": "v2",
                "discovered_at": datetime(2026, 1, 1, tzinfo=UTC),
            }
        )
        second = repo.upsert_job(later)
        assert second.id == first.id
        assert second.discovered_at == first.discovered_at
        assert second.title == "v2"

    def test_upsert_does_not_overwrite_status_or_match_score(self, repo: JobRepository) -> None:
        first = repo.upsert_job(_job(status=JobStatus.APPLIED, match_score=0.82, title="old"))
        second = repo.upsert_job(
            first.model_copy(
                update={
                    "status": JobStatus.TO_DO,
                    "match_score": 0.1,
                    "title": "new",
                }
            )
        )
        assert second.status == JobStatus.APPLIED
        assert second.match_score == pytest.approx(0.82)
        assert second.title == "new"

    def test_missing_source_job_id_uses_url_sha1(self, repo: JobRepository) -> None:
        url = "https://example.com/jobs/42"
        stored = repo.upsert_job(_job(source_job_id="", canonical_url=url))
        assert stored.source_job_id == source_job_id_from_canonical_url(url)


class TestJobsRaw:
    def test_appends_multiple_rows_for_same_source_job_id(self, repo: JobRepository) -> None:
        repo.insert_job_raw(JobRaw(source="adzuna", source_job_id="abc", raw_payload={"n": 1}))
        repo.insert_job_raw(JobRaw(source="adzuna", source_job_id="abc", raw_payload={"n": 2}))
        rows = repo.list_job_raw_by_source_key("adzuna", "abc")
        assert len(rows) == 2
        assert {row.raw_payload["n"] for row in rows} == {1, 2}


class TestDedup:
    def test_canonical_url_merges(self, repo: JobRepository) -> None:
        url = "https://boards.example.com/jobs/99"
        first = repo.upsert_job(
            _job(source="lever", source_job_id="L1", canonical_url=url, title="Old")
        )
        merged = repo.upsert_job(
            _job(source="greenhouse", source_job_id="G1", canonical_url=url, title="New")
        )
        count = repo._db["jobs"].count
        assert merged.id == first.id
        assert merged.title == "New"
        assert merged.source == "lever"
        assert merged.source_job_id == "L1"
        assert count == 1

    def test_fingerprint_does_not_auto_merge(self, repo: JobRepository) -> None:
        fp = compute_job_fingerprint("Acme", "Software Engineer", "Remote")
        a = repo.upsert_job(_job(source="a", source_job_id="1", fingerprint=fp))
        b = repo.upsert_job(_job(source="b", source_job_id="2", fingerprint=fp))
        assert a.id != b.id
        assert repo._db["jobs"].count == 2
        candidates = repo.find_fingerprint_candidates(fp)
        assert set(candidates) == {a.id, b.id}
        assert a.id not in repo.find_fingerprint_candidates(fp, exclude_id=a.id)


class TestJobTracking:
    def test_patch_comment_favorite_next_step(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        updated = repo.update_hub_job(
            stored.id,
            {
                "favorite": True,
                "comment": "Keep as a writing sample",
                "next_step": "Email recruiter",
            },
        )
        assert updated is not None
        assert updated.favorite is True
        assert updated.comment == "Keep as a writing sample"
        assert updated.next_step == "Email recruiter"
        assert updated.status == JobStatus.UNDER_STUDY

    def test_upsert_does_not_overwrite_tracking_fields(self, repo: JobRepository) -> None:
        first = repo.upsert_job(_job())
        repo.update_hub_job(
            first.id,
            {
                "favorite": True,
                "comment": "mine",
                "next_step": "call",
                "status": JobStatus.REFERENCE,
            },
        )
        second = repo.upsert_job(
            first.model_copy(update={"title": "Renamed", "comment": "collector"})
        )
        assert second.title == "Renamed"
        assert second.favorite is True
        assert second.comment == "mine"
        assert second.next_step == "call"
        assert second.status == JobStatus.REFERENCE

    def test_applied_sets_applied_at(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        updated = repo.update_hub_job(stored.id, {"status": JobStatus.APPLIED})
        assert updated is not None
        assert updated.status == JobStatus.APPLIED
        assert updated.applied_at is not None

    def test_closed_reason(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        updated = repo.update_hub_job(
            stored.id,
            {"status": JobStatus.CLOSED, "close_reason": CloseReason.WITHDREW},
        )
        assert updated is not None
        assert updated.status == JobStatus.CLOSED
        assert updated.close_reason == CloseReason.WITHDREW

    def test_to_do_creates_application_once(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job(title="SWE", company="Acme"))
        assert repo.get_application_by_job_id(stored.id) is None
        moved = repo.update_hub_job(stored.id, {"status": JobStatus.TO_DO})
        assert moved is not None
        app = repo.get_application_by_job_id(stored.id)
        assert app is not None
        assert app.job_id == stored.id
        assert app.title == "SWE"
        assert app.employer == "Acme"
        again = repo.update_hub_job(stored.id, {"status": JobStatus.TO_DO})
        assert again is not None
        assert repo.get_application_by_job_id(stored.id).id == app.id  # type: ignore[union-attr]
        assert repo._db["applications"].count == 1

    def test_patch_deadline_and_follow_up(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        updated = repo.update_hub_job(
            stored.id,
            {"deadline": date(2026, 9, 20), "follow_up_at": "2026-09-05"},
        )
        assert updated is not None
        assert updated.deadline == date(2026, 9, 20)
        assert updated.follow_up_at == date(2026, 9, 5)
        assert updated.last_activity_at is not None
        again = repo.upsert_job(updated.model_copy(update={"title": "v2", "deadline": None}))
        assert again.deadline == date(2026, 9, 20)
        assert again.follow_up_at == date(2026, 9, 5)
        assert again.title == "v2"


class TestJobTasks:
    def test_crud_and_activity_bump(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        assert stored.tasks == []
        assert stored.last_activity_at is None
        created = repo.create_job_task(stored.id, title="Finish OA", due_at=date(2026, 9, 3))
        assert created is not None
        assert created.title == "Finish OA"
        assert created.due_at == date(2026, 9, 3)
        assert created.done is False
        listed = repo.list_job_tasks(stored.id)
        assert [t.id for t in listed] == [created.id]
        job = repo.get_hub_job(stored.id)
        assert job is not None
        assert job.last_activity_at is not None
        assert job.tasks[0].title == "Finish OA"
        patched = repo.update_job_task(
            stored.id, created.id, {"done": True, "title": "OA submitted"}
        )
        assert patched is not None
        assert patched.done is True
        assert patched.title == "OA submitted"
        assert repo.delete_job_task(stored.id, created.id) is True
        assert repo.list_job_tasks(stored.id) == []
        assert repo.delete_job_task(stored.id, created.id) is False
        assert repo.create_job_task("missing", title="Nope") is None

    def test_hydrated_on_list(self, repo: JobRepository) -> None:
        a = repo.upsert_job(_job(source_job_id="a"))
        b = repo.upsert_job(_job(source="remoteok", source_job_id="b"))
        repo.create_job_task(a.id, title="Prep")
        repo.create_job_task(b.id, title="OA")
        jobs = {job.id: job for job in repo.list_hub_jobs()}
        assert [t.title for t in jobs[a.id].tasks] == ["Prep"]
        assert [t.title for t in jobs[b.id].tasks] == ["OA"]
