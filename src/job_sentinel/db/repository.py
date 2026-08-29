"""
db/repository.py
─────────────────
SQLite persistence layer using **sqlite-utils**.

Why sqlite-utils over raw sqlite3?
  • ``db[table].insert()`` / ``.upsert()`` — no hand-written SQL for writes
  • Auto-creates tables from Python dicts (schema-less insertion)
  • ``db[table].transform()`` for zero-downtime schema migrations
  • Built-in ``enable_wal()`` for concurrent reader/writer safety
  • Full-text search via ``enable_fts()`` — one line to add FTS5
  • Still just SQLite under the hood — zero external services needed

Schema evolution
────────────────
  bump ``SCHEMA_VERSION`` and add a branch in ``_migrate()`` when the
  schema changes.  sqlite-utils' ``.transform()`` does column adds/renames
  without needing ALTER TABLE boilerplate.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

import sqlite_utils
from loguru import logger

from job_sentinel.core.models import (
    Application,
    ApplicationStage,
    ApplicationStatus,
    DocumentKind,
    GeneratedDocument,
    Job,
    JobPosting,
    JobRaw,
    JobStatus,
    compute_job_fingerprint,
    source_job_id_from_canonical_url,
)

if TYPE_CHECKING:
    from pathlib import Path

    from sqlite_utils.db import Table

SCHEMA_VERSION = 3
_TABLE = "job_postings"
_META_TABLE = "sentinel_meta"
_APP_TABLE = "applications"
_DOC_TABLE = "generated_documents"
_JOBS_TABLE = "jobs"
_JOBS_RAW_TABLE = "jobs_raw"
_FORBIDDEN_JOB_COLUMNS = frozenset(
    {"favorite", "next_step", "comment", "applied_at", "filter_state", "filter_reasons"}
)


class JobRepository:
    """
    Data-access object for the ``job_postings`` SQLite table.

    Thread-safe: sqlite-utils uses WAL mode; safe for the scheduler thread
    and Telegram bot thread to read/write concurrently.

    Parameters
    ----------
    db_path : Path
        Absolute path to the SQLite database file.
        Created (with parent directories) if it does not exist.
    """

    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite_utils.Database(str(db_path))
        self._db.enable_wal()  # concurrent safe
        self._db.execute("PRAGMA foreign_keys = ON")
        self._init_schema()
        logger.info("Database ready | path={}", db_path)

    def _table(self, name: str) -> Table:
        """Typed accessor — ``db[name]`` is ``Table | View`` to mypy; we only
        ever address real tables here, so narrow it once in one place."""
        return cast("Table", self._db[name])

    # ─────────────────────────────────────────────────────────────────────
    # Schema management
    # ─────────────────────────────────────────────────────────────────────

    def _init_schema(self) -> None:
        """Create tables and run pending migrations."""
        # Meta table stores schema version
        if _META_TABLE not in self._db.table_names():
            self._table(_META_TABLE).insert(
                {"key": "schema_version", "value": str(SCHEMA_VERSION)}, pk="key"
            )
            logger.debug("Schema initialised at version {}", SCHEMA_VERSION)
        else:
            # DBs created before the meta table had a real primary key: back-fill
            # it so later upsert(..., pk="key") calls have a unique index to
            # target instead of raising "ON CONFLICT clause does not match".
            if self._table(_META_TABLE).pks == ["rowid"]:
                self._table(_META_TABLE).transform(pk="key")
                logger.debug("Backfilled primary key on {}", _META_TABLE)
            stored = self._get_meta("schema_version")
            version = int(stored) if stored else 0
            if version < SCHEMA_VERSION:
                self._migrate(from_version=version)

        # Ensure job_postings table exists with correct columns
        if _TABLE not in self._db.table_names():
            self._table(_TABLE).create(
                {
                    "posting_id": str,
                    "title": str,
                    "employer": str,
                    "location": str,
                    "job_type": str,
                    "posted_date": str,
                    "deadline": str,
                    "description_snippet": str,
                    "portal_url": str,
                    "status": str,
                    "discovered_at": str,
                    "updated_at": str,
                    "keywords_matched": str,  # JSON array
                    "source_adapter": str,
                    "raw_data": str,  # JSON object
                },
                pk="posting_id",
            )

            # Indexes for common query patterns
            self._table(_TABLE).create_index(["status"], if_not_exists=True)
            self._table(_TABLE).create_index(["discovered_at"], if_not_exists=True)
            self._table(_TABLE).create_index(["source_adapter"], if_not_exists=True)
            logger.debug("job_postings table created")

        self._ensure_applications_table()
        self._ensure_documents_table()
        self._ensure_v0_tables()

    def _ensure_applications_table(self) -> None:
        if _APP_TABLE not in self._db.table_names():
            self._table(_APP_TABLE).create(
                {
                    "id": str,
                    "title": str,
                    "employer": str,
                    "location": str,
                    "url": str,
                    "source": str,
                    "stage": str,
                    "salary": str,
                    "applied_date": str,
                    "deadline": str,
                    "notes": str,
                    "posting_id": str,
                    "resume_document_id": str,
                    "created_at": str,
                    "updated_at": str,
                    "raw_data": str,  # JSON
                },
                pk="id",
            )
            self._table(_APP_TABLE).create_index(["stage"], if_not_exists=True)
            self._table(_APP_TABLE).create_index(["created_at"], if_not_exists=True)
            logger.debug("applications table created")

    def _ensure_documents_table(self) -> None:
        if _DOC_TABLE not in self._db.table_names():
            self._table(_DOC_TABLE).create(
                {
                    "id": str,
                    "kind": str,
                    "label": str,
                    "title": str,
                    "employer": str,
                    "file_path": str,
                    "tex_path": str,
                    "ats_score": float,
                    "provider": str,
                    "tailored": int,  # SQLite has no bool; 0/1
                    "job_snippet": str,
                    "application_id": str,
                    "posting_id": str,
                    "created_at": str,
                    "raw_data": str,  # JSON
                },
                pk="id",
            )
            self._table(_DOC_TABLE).create_index(["kind"], if_not_exists=True)
            self._table(_DOC_TABLE).create_index(["created_at"], if_not_exists=True)
            logger.debug("generated_documents table created")

    def _ensure_v0_tables(self) -> None:
        self._ensure_jobs_table()
        self._ensure_jobs_raw_table()

    def _ensure_jobs_table(self) -> None:
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
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
                CHECK (
                    status IS NULL
                    OR status IN ('saved', 'to_do', 'applied', 'closed', 'reference')
                )
            )
            """
        )
        jobs = self._table(_JOBS_TABLE)
        extra = {col.name for col in jobs.columns} & _FORBIDDEN_JOB_COLUMNS
        if extra:
            jobs.transform(drop=extra)
            logger.debug("Dropped non-V0 columns from jobs: {}", extra)

        jobs.create_index(["source", "source_job_id"], unique=True, if_not_exists=True)
        for col in (
            "discovered_at",
            "published_at",
            "status",
            "source",
            "fingerprint",
            "canonical_url",
        ):
            jobs.create_index([col], if_not_exists=True)

    def _ensure_jobs_raw_table(self) -> None:
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs_raw (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_job_id TEXT,
                source_url TEXT NOT NULL DEFAULT '',
                raw_payload TEXT NOT NULL DEFAULT '{}',
                validation_state TEXT NOT NULL DEFAULT 'valid',
                validation_reasons TEXT NOT NULL DEFAULT '[]',
                collected_at TEXT NOT NULL,
                processed_at TEXT,
                job_id TEXT,
                run_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        raw = self._table(_JOBS_RAW_TABLE)
        raw.create_index(["source", "source_job_id"], if_not_exists=True)
        raw.create_index(["collected_at"], if_not_exists=True)
        raw.create_index(["job_id"], if_not_exists=True)

    def _get_meta(self, key: str) -> str | None:
        rows = list(self._table(_META_TABLE).rows_where("key = ?", [key]))
        return rows[0]["value"] if rows else None

    def _set_meta(self, key: str, value: str) -> None:
        self._table(_META_TABLE).upsert({"key": key, "value": value}, pk="key")

    def _migrate(self, from_version: int) -> None:
        logger.info("Migrating DB schema v{} → v{}", from_version, SCHEMA_VERSION)
        if from_version < 2:
            # Idempotent — only creates tables when they don't already exist.
            self._ensure_applications_table()
            self._ensure_documents_table()
        if from_version < 3:
            self._ensure_v0_tables()
        self._set_meta("schema_version", str(SCHEMA_VERSION))

    # ─────────────────────────────────────────────────────────────────────
    # Write operations
    # ─────────────────────────────────────────────────────────────────────

    def save_job(self, job: JobPosting) -> bool:
        """
        Persist a job posting (upsert semantics).

        If the record already exists with a user-set status (APPLIED /
        IGNORED), the status is preserved — the scraper cannot undo
        a human decision.

        Returns
        -------
        bool
            ``True`` if this was a brand-new insertion.
        """
        existing = self.get_job(job.posting_id)
        is_new = existing is None

        # Preserve human-set status
        if existing and existing.status not in (ApplicationStatus.NEW, ApplicationStatus.SEEN):
            job = job.model_copy(update={"status": existing.status})

        row = _to_row(job)
        self._table(_TABLE).upsert(row, pk="posting_id")

        action = "Inserted" if is_new else "Updated"
        logger.debug("{} job | id={} title={!r}", action, job.posting_id, job.title)
        return is_new

    def update_status(self, posting_id: str, status: ApplicationStatus) -> bool:
        """
        Update the tracking status of a job posting.

        Returns ``True`` if the record was found and updated.
        """
        if not self.exists(posting_id):
            logger.warning("update_status: posting {} not found", posting_id)
            return False

        self._table(_TABLE).update(
            posting_id,
            {
                "status": status.value,
                "updated_at": _now_iso(),
            },
        )
        logger.info("Status updated | id={} status={}", posting_id, status.value)
        return True

    def mark_seen(self, posting_id: str) -> None:
        """Convenience: mark posting as SEEN after alert is sent."""
        self.update_status(posting_id, ApplicationStatus.SEEN)

    # ─────────────────────────────────────────────────────────────────────
    # V0 jobs / jobs_raw
    # ─────────────────────────────────────────────────────────────────────

    def upsert_job(self, job: Job) -> Job:
        """
        Insert or update a canonical job.

        Dedup: (1) ``(source, source_job_id)`` (2) non-empty ``canonical_url``.
        Fingerprint is never used to merge. Ingest fields only on update —
        ``status``, ``match_score``, and ``discovered_at`` are preserved.
        """
        source_job_id = job.source_job_id.strip() or source_job_id_from_canonical_url(
            job.canonical_url
        )
        fingerprint = job.fingerprint or compute_job_fingerprint(
            job.company, job.title, job.location
        )
        existing = self.get_job_by_source_key(job.source, source_job_id)
        if existing is None:
            existing = self.get_job_by_canonical_url(job.canonical_url)

        if existing is None:
            prepared = job.model_copy(
                update={"source_job_id": source_job_id, "fingerprint": fingerprint}
            )
            self._table(_JOBS_TABLE).insert(_hub_job_to_row(prepared))
            stored = self.get_hub_job(prepared.id)
            if stored is None:
                msg = f"insert of job {prepared.id} did not persist"
                raise RuntimeError(msg)
            logger.debug("Inserted pool job | id={} source={}", stored.id, stored.source)
            return stored

        now = _now_iso()
        ingest = {
            "job_url": job.job_url,
            "canonical_url": job.canonical_url,
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "description": job.description,
            "employment_type": job.employment_type,
            "salary": job.salary,
            "published_at": _optional_iso(job.published_at),
            "last_seen_at": now,
            "updated_at": now,
            "fingerprint": fingerprint,
            "market": job.market,
        }
        self._table(_JOBS_TABLE).update(existing.id, ingest)
        stored = self.get_hub_job(existing.id)
        if stored is None:
            msg = f"update of job {existing.id} did not persist"
            raise RuntimeError(msg)
        logger.debug("Updated pool job | id={} source={}", stored.id, stored.source)
        return stored

    def get_hub_job(self, job_id: str) -> Job | None:
        """Fetch a canonical ``jobs`` row by id."""
        try:
            row = self._table(_JOBS_TABLE).get(job_id)
            return _hub_job_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def get_job_by_source_key(self, source: str, source_job_id: str) -> Job | None:
        """Lookup by UNIQUE ``(source, source_job_id)``."""
        rows = list(
            self._table(_JOBS_TABLE).rows_where(
                "source = ? AND source_job_id = ?",
                [source, source_job_id],
                limit=1,
            )
        )
        return _hub_job_from_row(dict(rows[0])) if rows else None

    def get_job_by_canonical_url(self, canonical_url: str) -> Job | None:
        """Oldest job with this non-empty canonical URL (merge target)."""
        url = canonical_url.strip()
        if not url:
            return None
        rows = list(
            self._table(_JOBS_TABLE).rows_where(
                "canonical_url = ?",
                [url],
                order_by="discovered_at ASC",
                limit=1,
            )
        )
        return _hub_job_from_row(dict(rows[0])) if rows else None

    def list_hub_jobs(self, *, limit: int = 100, since: datetime | None = None) -> list[Job]:
        """Job Pool rows, newest ``discovered_at`` first."""
        capped = max(1, min(limit, 500))
        if since is None:
            rows = self._table(_JOBS_TABLE).rows_where(
                order_by="discovered_at DESC",
                limit=capped,
            )
        else:
            rows = self._table(_JOBS_TABLE).rows_where(
                "discovered_at >= ?",
                [since.isoformat()],
                order_by="discovered_at DESC",
                limit=capped,
            )
        return [_hub_job_from_row(dict(r)) for r in rows]

    def update_hub_job_status(self, job_id: str, status: JobStatus | None) -> Job | None:
        """Set lifecycle status. ``None`` clears it. Does not touch ingest fields."""
        if self.get_hub_job(job_id) is None:
            return None
        self._table(_JOBS_TABLE).update(
            job_id,
            {
                "status": None if status is None else status.value,
                "updated_at": _now_iso(),
            },
        )
        return self.get_hub_job(job_id)

    def find_fingerprint_candidates(
        self,
        fingerprint: str,
        *,
        exclude_id: str | None = None,
    ) -> list[str]:
        """Return job ids sharing a fingerprint. Does not merge."""
        if not fingerprint:
            return []
        if exclude_id:
            rows = self._table(_JOBS_TABLE).rows_where(
                "fingerprint = ? AND id != ?",
                [fingerprint, exclude_id],
            )
        else:
            rows = self._table(_JOBS_TABLE).rows_where("fingerprint = ?", [fingerprint])
        return [str(row["id"]) for row in rows]

    def insert_job_raw(self, raw: JobRaw) -> JobRaw:
        """Append a ``jobs_raw`` row (never upsert)."""
        self._table(_JOBS_RAW_TABLE).insert(_job_raw_to_row(raw))
        logger.debug("Inserted jobs_raw | id={} source={}", raw.id, raw.source)
        return raw

    def get_job_raw(self, raw_id: str) -> JobRaw | None:
        try:
            row = self._table(_JOBS_RAW_TABLE).get(raw_id)
            return _job_raw_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def list_job_raw_by_source_key(self, source: str, source_job_id: str) -> list[JobRaw]:
        rows = self._table(_JOBS_RAW_TABLE).rows_where(
            "source = ? AND source_job_id = ?",
            [source, source_job_id],
            order_by="collected_at ASC",
        )
        return [_job_raw_from_row(dict(r)) for r in rows]

    def mark_job_raw_processed(self, raw_id: str, *, job_id: str) -> None:
        """Link a raw row to the upserted pool job after a successful normalize."""
        self._table(_JOBS_RAW_TABLE).update(
            raw_id,
            {"job_id": job_id, "processed_at": _now_iso(), "validation_state": "valid"},
        )

    # ─────────────────────────────────────────────────────────────────────
    # Read operations
    # ─────────────────────────────────────────────────────────────────────

    def get_job(self, posting_id: str) -> JobPosting | None:
        """Fetch a single posting by ID, or ``None``."""
        try:
            row = self._table(_TABLE).get(posting_id)
            return _from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def exists(self, posting_id: str) -> bool:
        """Return ``True`` if this posting ID is already in the DB."""
        return self._table(_TABLE).count_where("posting_id = ?", [posting_id]) > 0

    def get_new_jobs(self) -> list[JobPosting]:
        """All postings with status NEW, newest-first."""
        return self._query_status(ApplicationStatus.NEW)

    def get_recent_jobs(self, limit: int = 10) -> list[JobPosting]:
        """Most recently discovered postings (any status)."""
        rows = self._table(_TABLE).rows_where(
            order_by="discovered_at DESC",
            limit=limit,
        )
        return [_from_row(dict(r)) for r in rows]

    def get_by_status(self, status: ApplicationStatus) -> list[JobPosting]:
        """All postings with the given status."""
        return self._query_status(status)

    def _query_status(self, status: ApplicationStatus) -> list[JobPosting]:
        rows = self._table(_TABLE).rows_where(
            "status = ?",
            [status.value],
            order_by="discovered_at DESC",
        )
        return [_from_row(dict(r)) for r in rows]

    # ─────────────────────────────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────────────────────────────

    def get_stats(self) -> dict[str, int]:
        """Aggregate counts per status — used by /stats Telegram command."""
        counts: dict[str, int] = {s.value: 0 for s in ApplicationStatus}
        for row in self._db.execute(
            f"SELECT status, COUNT(*) AS cnt FROM {_TABLE} GROUP BY status"  # noqa: S608 — _TABLE is a module constant, never user input
        ).fetchall():
            counts[row[0]] = row[1]
        counts["total"] = sum(counts.values())
        return counts

    # ─────────────────────────────────────────────────────────────────────
    # Housekeeping
    # ─────────────────────────────────────────────────────────────────────

    def close(self) -> None:
        self._db.conn.close()
        logger.debug("Database connection closed")

    # ─────────────────────────────────────────────────────────────────────
    # Application CRUD
    # ─────────────────────────────────────────────────────────────────────

    def create_application(self, app: Application) -> Application:
        """Persist a new Application row and return it."""
        self._table(_APP_TABLE).insert(_app_to_row(app))
        logger.debug("Application created | id={}", app.id)
        return app

    def get_application(self, app_id: str) -> Application | None:
        """Fetch a single Application by id, or None."""
        try:
            row = self._table(_APP_TABLE).get(app_id)
            return _app_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def list_applications(
        self,
        stage: ApplicationStage | None = None,
        limit: int = 200,
    ) -> list[Application]:
        """Return applications newest-first, optionally filtered by stage."""
        if stage is not None:
            rows = self._table(_APP_TABLE).rows_where(
                "stage = ?",
                [stage.value],
                order_by="created_at DESC",
                limit=limit,
            )
        else:
            rows = self._table(_APP_TABLE).rows_where(
                order_by="created_at DESC",
                limit=limit,
            )
        return [_app_from_row(dict(r)) for r in rows]

    def update_application(self, app_id: str, **fields: Any) -> bool:
        """
        Partially update an Application row.

        Always bumps ``updated_at``.  Returns True if the row existed.
        """
        if self.get_application(app_id) is None:
            return False
        fields["updated_at"] = _now_iso()
        # Coerce stage enum to its value string if passed.
        if "stage" in fields and isinstance(fields["stage"], ApplicationStage):
            fields["stage"] = fields["stage"].value
        self._table(_APP_TABLE).update(app_id, fields)
        return True

    def delete_application(self, app_id: str) -> bool:
        """Delete an application. Returns True if the row existed."""
        if self.get_application(app_id) is None:
            return False
        self._table(_APP_TABLE).delete(app_id)
        return True

    def application_stats(self) -> dict[str, int]:
        """Count of applications per stage, plus a 'total' key."""
        counts: dict[str, int] = {s.value: 0 for s in ApplicationStage}
        for row in self._db.execute(
            f"SELECT stage, COUNT(*) AS cnt FROM {_APP_TABLE} GROUP BY stage"  # noqa: S608
        ).fetchall():
            counts[row[0]] = row[1]
        counts["total"] = sum(counts.values())
        return counts

    def application_analytics(self) -> dict[str, object]:
        """
        Compute richer application analytics over the local tracker data.

        Returns a dict with three sections:
        - ``funnel``: stage → count + pct_of_applied for the conversion funnel
        - ``by_source``: source → {applied, responded, response_rate}
        - ``weekly_volume``: list of {week, count} for the last 8 ISO weeks
        """
        # ── Funnel ────────────────────────────────────────────────────────
        stage_counts: dict[str, int] = {s.value: 0 for s in ApplicationStage}
        for row in self._db.execute(
            f"SELECT stage, COUNT(*) AS cnt FROM {_APP_TABLE} GROUP BY stage"  # noqa: S608
        ).fetchall():
            stage_counts[row[0]] = row[1]

        applied = stage_counts.get(ApplicationStage.APPLIED, 0)
        funnel: list[dict[str, object]] = []
        downstream = [
            ApplicationStage.INTERVIEWING,
            ApplicationStage.OFFER,
            ApplicationStage.REJECTED,
        ]
        for stage in ApplicationStage:
            cnt = stage_counts[stage.value]
            pct: float | None = None
            if stage in downstream and applied > 0:
                pct = round(cnt / applied * 100, 1)
            funnel.append({"stage": stage.value, "count": cnt, "pct_of_applied": pct})

        # Response = interviewing + offer (any non-silence after applying)
        responded = stage_counts.get(ApplicationStage.INTERVIEWING, 0) + stage_counts.get(
            ApplicationStage.OFFER, 0
        )
        overall_response_rate: float | None = (
            round(responded / applied * 100, 1) if applied > 0 else None
        )

        # ── By source ─────────────────────────────────────────────────────
        source_rows = self._db.execute(
            f"""
            SELECT
                source,
                COUNT(*) AS total,
                SUM(CASE WHEN stage IN ('interviewing','offer') THEN 1 ELSE 0 END) AS responded
            FROM {_APP_TABLE}
            WHERE stage NOT IN ('saved','archived')
            GROUP BY source
            ORDER BY total DESC
            """  # noqa: S608
        ).fetchall()
        by_source: list[dict[str, object]] = []
        for src_row in source_rows:
            src, total, src_responded = src_row
            rr: float | None = round(src_responded / total * 100, 1) if total > 0 else None
            by_source.append(
                {
                    "source": src or "manual",
                    "applied": total,
                    "responded": src_responded,
                    "response_rate": rr,
                }
            )

        # ── Weekly volume (last 8 weeks) ───────────────────────────────────
        weekly_rows = self._db.execute(
            f"""
            SELECT
                strftime('%Y-W%W', applied_date) AS week,
                COUNT(*) AS cnt
            FROM {_APP_TABLE}
            WHERE applied_date != ''
              AND applied_date IS NOT NULL
              AND date(applied_date) >= date('now', '-56 days')
            GROUP BY week
            ORDER BY week ASC
            """  # noqa: S608
        ).fetchall()
        weekly_volume = [{"week": r[0], "count": r[1]} for r in weekly_rows]

        return {
            "funnel": funnel,
            "overall_response_rate": overall_response_rate,
            "by_source": by_source,
            "weekly_volume": weekly_volume,
        }

    # ─────────────────────────────────────────────────────────────────────
    # GeneratedDocument CRUD
    # ─────────────────────────────────────────────────────────────────────

    def create_document(self, doc: GeneratedDocument) -> GeneratedDocument:
        """Persist a new GeneratedDocument row and return it."""
        self._table(_DOC_TABLE).insert(_doc_to_row(doc))
        logger.debug("Document created | id={} kind={}", doc.id, doc.kind.value)
        return doc

    def get_document(self, doc_id: str) -> GeneratedDocument | None:
        """Fetch a single GeneratedDocument by id, or None."""
        try:
            row = self._table(_DOC_TABLE).get(doc_id)
            return _doc_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def list_documents(
        self,
        kind: DocumentKind | None = None,
        limit: int = 200,
    ) -> list[GeneratedDocument]:
        """Return documents newest-first, optionally filtered by kind."""
        if kind is not None:
            rows = self._table(_DOC_TABLE).rows_where(
                "kind = ?",
                [kind.value],
                order_by="created_at DESC",
                limit=limit,
            )
        else:
            rows = self._table(_DOC_TABLE).rows_where(
                order_by="created_at DESC",
                limit=limit,
            )
        return [_doc_from_row(dict(r)) for r in rows]

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document record. Returns True if the row existed."""
        if self.get_document(doc_id) is None:
            return False
        self._table(_DOC_TABLE).delete(doc_id)
        return True


# ─────────────────────────────────────────────────────────────────────────────
# Serialisation helpers
# ─────────────────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def _to_row(job: JobPosting) -> dict[str, Any]:
    return {
        "posting_id": job.posting_id,
        "title": job.title,
        "employer": job.employer,
        "location": job.location,
        "job_type": job.job_type,
        "posted_date": job.posted_date,
        "deadline": job.deadline,
        "description_snippet": job.description_snippet,
        "portal_url": job.portal_url,
        "status": job.status.value,
        "discovered_at": job.discovered_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
        "keywords_matched": json.dumps(job.keywords_matched),
        "source_adapter": job.source_adapter,
        "raw_data": json.dumps(job.raw_data),
    }


def _from_row(row: dict[str, Any]) -> JobPosting:
    return JobPosting(
        posting_id=row["posting_id"],
        title=row.get("title", ""),
        employer=row.get("employer", ""),
        location=row.get("location", ""),
        job_type=row.get("job_type", ""),
        posted_date=row.get("posted_date", ""),
        deadline=row.get("deadline", ""),
        description_snippet=row.get("description_snippet", ""),
        portal_url=row.get("portal_url", ""),
        status=ApplicationStatus(row.get("status", "new")),
        discovered_at=_parse_dt(row.get("discovered_at", "")),
        updated_at=_parse_dt(row.get("updated_at", "")),
        keywords_matched=json.loads(row.get("keywords_matched") or "[]"),
        source_adapter=row.get("source_adapter", ""),
        raw_data=json.loads(row.get("raw_data") or "{}"),
    )


def _parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return datetime.now(tz=UTC)


# ── Application helpers ───────────────────────────────────────────────────────


def _app_to_row(app: Application) -> dict[str, Any]:
    return {
        "id": app.id,
        "title": app.title,
        "employer": app.employer,
        "location": app.location,
        "url": app.url,
        "source": app.source,
        "stage": app.stage.value,
        "salary": app.salary,
        "applied_date": app.applied_date,
        "deadline": app.deadline,
        "notes": app.notes,
        "posting_id": app.posting_id,
        "resume_document_id": app.resume_document_id,
        "created_at": app.created_at.isoformat(),
        "updated_at": app.updated_at.isoformat(),
        "raw_data": json.dumps(app.raw_data),
    }


def _app_from_row(row: dict[str, Any]) -> Application:
    return Application(
        id=row["id"],
        title=row.get("title", ""),
        employer=row.get("employer", ""),
        location=row.get("location", ""),
        url=row.get("url", ""),
        source=row.get("source", ""),
        stage=ApplicationStage(row.get("stage", ApplicationStage.SAVED.value)),
        salary=row.get("salary", ""),
        applied_date=row.get("applied_date", ""),
        deadline=row.get("deadline", ""),
        notes=row.get("notes", ""),
        posting_id=row.get("posting_id") or None,
        resume_document_id=row.get("resume_document_id") or None,
        created_at=_parse_dt(row.get("created_at", "")),
        updated_at=_parse_dt(row.get("updated_at", "")),
        raw_data=json.loads(row.get("raw_data") or "{}"),
    )


# ── GeneratedDocument helpers ─────────────────────────────────────────────────


def _doc_to_row(doc: GeneratedDocument) -> dict[str, Any]:
    return {
        "id": doc.id,
        "kind": doc.kind.value,
        "label": doc.label,
        "title": doc.title,
        "employer": doc.employer,
        "file_path": doc.file_path,
        "tex_path": doc.tex_path,
        "ats_score": doc.ats_score,
        "provider": doc.provider,
        "tailored": 1 if doc.tailored else 0,
        "job_snippet": doc.job_snippet,
        "application_id": doc.application_id,
        "posting_id": doc.posting_id,
        "created_at": doc.created_at.isoformat(),
        "raw_data": json.dumps(doc.raw_data),
    }


def _doc_from_row(row: dict[str, Any]) -> GeneratedDocument:
    ats_raw = row.get("ats_score")
    return GeneratedDocument(
        id=row["id"],
        kind=DocumentKind(row.get("kind", DocumentKind.RESUME.value)),
        label=row.get("label", ""),
        title=row.get("title", ""),
        employer=row.get("employer", ""),
        file_path=row.get("file_path", ""),
        tex_path=row.get("tex_path") or None,
        ats_score=float(ats_raw) if ats_raw is not None else None,
        provider=row.get("provider", ""),
        tailored=bool(row.get("tailored", 0)),
        job_snippet=row.get("job_snippet", ""),
        application_id=row.get("application_id") or None,
        posting_id=row.get("posting_id") or None,
        created_at=_parse_dt(row.get("created_at", "")),
        raw_data=json.loads(row.get("raw_data") or "{}"),
    )


# ── V0 Job / JobRaw helpers ───────────────────────────────────────────────────


def _optional_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _parse_optional_dt(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _hub_job_to_row(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "source": job.source,
        "source_job_id": job.source_job_id,
        "job_url": job.job_url,
        "canonical_url": job.canonical_url,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "description": job.description,
        "employment_type": job.employment_type,
        "salary": job.salary,
        "published_at": _optional_iso(job.published_at),
        "discovered_at": job.discovered_at.isoformat(),
        "last_seen_at": job.last_seen_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
        "fingerprint": job.fingerprint,
        "status": job.status.value if job.status is not None else None,
        "match_score": job.match_score,
        "market": job.market,
    }


def _hub_job_from_row(row: dict[str, Any]) -> Job:
    raw_status = row.get("status")
    status: JobStatus | None = JobStatus(raw_status) if raw_status else None
    score = row.get("match_score")
    return Job(
        id=row["id"],
        source=row.get("source", ""),
        source_job_id=row.get("source_job_id", ""),
        job_url=row.get("job_url", ""),
        canonical_url=row.get("canonical_url", ""),
        title=row.get("title", ""),
        company=row.get("company", ""),
        location=row.get("location", ""),
        description=row.get("description", ""),
        employment_type=row.get("employment_type", ""),
        salary=row.get("salary", ""),
        published_at=_parse_optional_dt(row.get("published_at")),
        discovered_at=_parse_dt(row.get("discovered_at", "")),
        last_seen_at=_parse_dt(row.get("last_seen_at", "")),
        updated_at=_parse_dt(row.get("updated_at", "")),
        fingerprint=row.get("fingerprint", ""),
        status=status,
        match_score=float(score) if score is not None else None,
        market=row.get("market", ""),
    )


def _job_raw_to_row(raw: JobRaw) -> dict[str, Any]:
    return {
        "id": raw.id,
        "source": raw.source,
        "source_job_id": raw.source_job_id,
        "source_url": raw.source_url,
        "raw_payload": json.dumps(raw.raw_payload),
        "validation_state": raw.validation_state,
        "validation_reasons": json.dumps(raw.validation_reasons),
        "collected_at": raw.collected_at.isoformat(),
        "processed_at": _optional_iso(raw.processed_at),
        "job_id": raw.job_id,
        "run_id": raw.run_id,
        "created_at": raw.created_at.isoformat(),
    }


def _job_raw_from_row(row: dict[str, Any]) -> JobRaw:
    payload = row.get("raw_payload") or "{}"
    reasons = row.get("validation_reasons") or "[]"
    parsed_payload = json.loads(payload) if isinstance(payload, str) else payload
    parsed_reasons = json.loads(reasons) if isinstance(reasons, str) else reasons
    return JobRaw(
        id=row["id"],
        source=row.get("source", ""),
        source_job_id=row.get("source_job_id"),
        source_url=row.get("source_url", ""),
        raw_payload=parsed_payload if isinstance(parsed_payload, dict) else {},
        validation_state=row.get("validation_state", "valid"),
        validation_reasons=parsed_reasons if isinstance(parsed_reasons, list) else [],
        collected_at=_parse_dt(row.get("collected_at", "")),
        processed_at=_parse_optional_dt(row.get("processed_at")),
        job_id=row.get("job_id") or None,
        run_id=row.get("run_id") or None,
        created_at=_parse_dt(row.get("created_at", "")),
    )
