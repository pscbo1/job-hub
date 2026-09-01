"""Deterministic exclusion rules and reversible re-filter."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.core.models import Job, JobRaw, JobStatus
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.contract import CollectorRecord
from job_sentinel.ingestion.filters import (
    FILTER_STATE_EXCLUDED,
    FILTER_STATE_INCLUDED,
    FilterSettings,
    dismiss_hub_job,
    evaluate_job,
    reapply_filters,
    save_filter_settings,
    undismiss_hub_job,
)
from job_sentinel.ingestion.pipeline import ingest_records

if TYPE_CHECKING:
    from pathlib import Path


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "zhaopin",
        "source_job_id": "1",
        "title": "产品经理",
        "company": "示例科技",
        "description": "负责用户研究",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def test_presets_are_independent() -> None:
    intern = _job(title="产品实习")
    part = _job(title="产品兼职")
    out = _job(title="外包开发")
    all_on = FilterSettings()
    assert evaluate_job(intern, all_on).filter_reasons == ["internship"]
    assert evaluate_job(part, all_on).filter_reasons == ["part_time"]
    assert evaluate_job(out, all_on).filter_reasons == ["outsourcing"]

    no_intern = FilterSettings(exclude_internship=False)
    assert evaluate_job(intern, no_intern).filter_state == FILTER_STATE_INCLUDED
    assert evaluate_job(part, no_intern).filter_state == FILTER_STATE_EXCLUDED


def test_intern_does_not_match_international() -> None:
    job = _job(title="International Product Manager")
    assert evaluate_job(job, FilterSettings()).filter_state == FILTER_STATE_INCLUDED


def test_custom_keyword_and_hidden_company() -> None:
    settings = FilterSettings(
        exclude_outsourcing=False,
        exclude_part_time=False,
        exclude_internship=False,
        custom_keywords=["驻场"],
        excluded_companies=["科锐国际"],
    )
    assert "custom_keyword" in evaluate_job(_job(description="需要驻场"), settings).filter_reasons
    company = evaluate_job(_job(company="科锐国际人力资源股份有限公司"), settings)
    assert company.filter_reasons == ["excluded_company"]


def test_reapply_without_rescrape_preserves_user_fields(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        first = repo.upsert_job(
            _job(
                title="产品实习",
                status=JobStatus.APPLIED,
                match_score=0.7,
            )
        )
        discovered = first.discovered_at
        save_filter_settings(repo, FilterSettings())
        excluded = reapply_filters(repo)
        stored = repo.get_hub_job(first.id)
        assert stored is not None
        assert excluded.excluded == 1
        assert stored.filter_state == FILTER_STATE_EXCLUDED
        assert stored.filter_reasons == ["internship"]
        assert stored.status == JobStatus.APPLIED
        assert stored.match_score == 0.7
        assert stored.discovered_at == discovered

        save_filter_settings(repo, FilterSettings(exclude_internship=False))
        included = reapply_filters(repo)
        again = repo.get_hub_job(first.id)
        assert again is not None
        assert included.included == 1
        assert again.filter_state == FILTER_STATE_INCLUDED
        assert again.filter_reasons == []
        assert again.status == JobStatus.APPLIED
        assert again.discovered_at == discovered
        pool = repo.list_hub_jobs(filter_state="included")
        assert any(j.id == first.id for j in pool)
    finally:
        repo.close()


def test_excluded_job_stays_in_raw_and_hidden_from_pool(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        save_filter_settings(repo, FilterSettings())
        records = [
            CollectorRecord(
                channel_key="zhaopin",
                source_url="https://www.zhaopin.com/jobdetail/INTERNSHIP1.htm",
                title="产品实习生",
                company="示例",
            )
        ]
        result = ingest_records(repo, records)
        assert result.raw_inserted == 1
        assert result.excluded == 1
        assert repo._db["jobs_raw"].count == 1
        assert repo._db["jobs"].count == 1
        assert repo.list_hub_jobs(filter_state="included") == []
        hidden = repo.list_hub_jobs(filter_state="excluded")
        assert len(hidden) == 1
        assert hidden[0].filter_reasons == ["internship"]
    finally:
        repo.close()


def test_manual_dismiss_and_undismiss_preserve_status_and_raw(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        save_filter_settings(
            repo,
            FilterSettings(
                exclude_outsourcing=False,
                exclude_part_time=False,
                exclude_internship=False,
            ),
        )
        job = repo.upsert_job(
            _job(source_job_id="keep-me", company="示例科技", status=JobStatus.TO_DO)
        )
        repo.insert_job_raw(
            JobRaw(
                source="zhaopin",
                source_job_id="keep-me",
                job_id=job.id,
            )
        )
        raw_count = repo._db["jobs_raw"].count
        dismissed = dismiss_hub_job(repo, job.id)
        assert dismissed is not None
        assert dismissed.filter_state == FILTER_STATE_EXCLUDED
        assert "manual_dismiss" in dismissed.filter_reasons
        assert dismissed.status == JobStatus.TO_DO
        assert repo._db["jobs_raw"].count == raw_count
        assert repo.list_hub_jobs(filter_state="included") == []
        assert any(j.id == job.id for j in repo.list_hub_jobs(filter_state="excluded"))

        reapply_filters(repo)
        still = repo.get_hub_job(job.id)
        assert still is not None
        assert still.filter_state == FILTER_STATE_EXCLUDED
        assert "manual_dismiss" in still.filter_reasons
        assert still.status == JobStatus.TO_DO

        restored = undismiss_hub_job(repo, job.id)
        assert restored is not None
        assert restored.filter_state == FILTER_STATE_INCLUDED
        assert restored.filter_reasons == []
        assert restored.status == JobStatus.TO_DO
        assert any(j.id == job.id for j in repo.list_hub_jobs(filter_state="included"))
    finally:
        repo.close()


def test_hide_company_refilter_hides_matches_preserves_status(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        rules = FilterSettings(
            exclude_outsourcing=False,
            exclude_part_time=False,
            exclude_internship=False,
        )
        save_filter_settings(repo, rules)
        keep = repo.upsert_job(
            _job(
                source_job_id="other",
                company="别的公司",
                title="产品经理",
                status=JobStatus.UNDER_STUDY,
            )
        )
        hide_a = repo.upsert_job(
            _job(source_job_id="a", company="科锐国际", title="招聘顾问", status=JobStatus.TO_DO)
        )
        hide_b = repo.upsert_job(
            _job(
                source_job_id="b",
                company="科锐国际人力资源股份有限公司",
                title="猎头",
                status=JobStatus.APPLIED,
            )
        )
        repo.insert_job_raw(JobRaw(source="zhaopin", source_job_id="a", job_id=hide_a.id))
        repo.insert_job_raw(JobRaw(source="zhaopin", source_job_id="b", job_id=hide_b.id))
        raw_count = repo._db["jobs_raw"].count

        hidden = FilterSettings(
            exclude_outsourcing=False,
            exclude_part_time=False,
            exclude_internship=False,
            excluded_companies=["科锐国际"],
        )
        save_filter_settings(repo, hidden)
        result = reapply_filters(repo, hidden)
        assert result.excluded == 2
        assert result.included == 1
        assert repo._db["jobs_raw"].count == raw_count

        pool = {j.id: j for j in repo.list_hub_jobs(filter_state="included")}
        assert keep.id in pool
        assert hide_a.id not in pool
        assert hide_b.id not in pool
        excluded = {j.id: j for j in repo.list_hub_jobs(filter_state="excluded")}
        assert excluded[hide_a.id].filter_reasons == ["excluded_company"]
        assert excluded[hide_b.id].filter_reasons == ["excluded_company"]
        assert excluded[hide_a.id].status == JobStatus.TO_DO
        assert excluded[hide_b.id].status == JobStatus.APPLIED
        assert excluded[hide_a.id].discovered_at == hide_a.discovered_at

        save_filter_settings(repo, rules)
        restored = reapply_filters(repo, rules)
        assert restored.included == 3
        again = repo.get_hub_job(hide_a.id)
        assert again is not None
        assert again.filter_state == FILTER_STATE_INCLUDED
        assert again.status == JobStatus.TO_DO
    finally:
        repo.close()
