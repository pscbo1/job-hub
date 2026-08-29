"""Store raw collector items, then normalize and upsert into ``jobs``."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from loguru import logger

from job_sentinel.core.models import JobRaw
from job_sentinel.ingestion.contract import IngestResult
from job_sentinel.ingestion.normalize import (
    canonicalize_source,
    canonicalize_url,
    normalize_record,
    validation_reasons,
)

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.ingestion.contract import CollectorRecord


def ingest_records(
    repo: JobRepository,
    records: list[CollectorRecord],
    *,
    run_id: str | None = None,
) -> IngestResult:
    """
    For each record: append ``jobs_raw``, then upsert ``jobs`` when valid.

    Dedup and collector-safe field rules live in ``JobRepository.upsert_job``.
    """
    result = IngestResult()
    for record in records:
        try:
            _ingest_one(repo, record, run_id=run_id, result=result)
        except Exception as exc:
            logger.warning("Ingest skipped one record: {}", exc)
            result.errors.append(str(exc))
    return result


def _ingest_one(
    repo: JobRepository,
    record: CollectorRecord,
    *,
    run_id: str | None,
    result: IngestResult,
) -> None:
    source = canonicalize_source(record.channel_key) or record.channel_key
    reasons = validation_reasons(record)
    canonical = canonicalize_url(record.source_url)
    now = datetime.now(tz=UTC)
    raw = JobRaw(
        source=source or "unknown",
        source_job_id=record.source_job_id,
        source_url=record.source_url,
        raw_payload=record.raw_payload or record.model_dump(mode="json"),
        validation_state="invalid" if reasons else "valid",
        validation_reasons=reasons,
        collected_at=record.collected_at,
        processed_at=None,
        job_id=None,
        run_id=run_id,
        created_at=now,
    )
    repo.insert_job_raw(raw)
    result.raw_inserted += 1
    if reasons:
        result.invalid += 1
        return

    job = normalize_record(record)
    existing = repo.get_job_by_source_key(job.source, job.source_job_id)
    if existing is None:
        existing = repo.get_job_by_canonical_url(canonical)
    created = existing is None
    stored = repo.upsert_job(job)
    repo.mark_job_raw_processed(raw.id, job_id=stored.id)
    if created:
        result.jobs_created += 1
    else:
        result.jobs_updated += 1
