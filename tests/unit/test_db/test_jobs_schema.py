"""V0 ``jobs`` / ``jobs_raw`` schema and repository behaviour."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
import sqlite_utils
from pydantic import ValidationError

from job_sentinel.core.models import (
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

_FORBIDDEN = {
    "favorite",
    "next_step",
    "comment",
    "applied_at",
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
        jobs_cols = _column_names(repo, "jobs")
        assert _FORBIDDEN.isdisjoint(jobs_cols)
        assert "filter_state" in jobs_cols
        assert "filter_reasons" in jobs_cols
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

    def test_job_postings_write_still_works(self, repo: JobRepository) -> None:
        posting = JobPosting(posting_id="p-1", title="Legacy scrape")
        assert repo.save_job(posting) is True
        fetched = repo.get_job("p-1")
        assert fetched is not None
        assert fetched.title == "Legacy scrape"


class TestJobStatus:
    def test_status_defaults_to_null(self, repo: JobRepository) -> None:
        stored = repo.upsert_job(_job())
        assert stored.status is None
        row = dict(repo._db["jobs"].get(stored.id))
        assert row["status"] is None

    def test_invalid_status_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Job(source="x", source_job_id="1", status="under_study")  # type: ignore[arg-type]

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
