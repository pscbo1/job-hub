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
import sqlite3
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any, cast

import sqlite_utils
from loguru import logger
from pydantic import ValidationError

from job_sentinel.core.models import (
    Application,
    ApplicationStage,
    ApplicationStatus,
    CloseReason,
    DocumentKind,
    GeneratedDocument,
    Job,
    JobPosting,
    JobRaw,
    JobStatus,
    JobTask,
    compute_job_fingerprint,
    source_job_id_from_canonical_url,
)
from job_sentinel.sponsorship.models import SponsorshipInfo

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from sqlite_utils.db import Table

SCHEMA_VERSION = 6
_TABLE = "job_postings"
_META_TABLE = "sentinel_meta"
_APP_TABLE = "applications"
_DOC_TABLE = "generated_documents"
_JOBS_TABLE = "jobs"
_JOBS_RAW_TABLE = "jobs_raw"
_JOB_TASKS_TABLE = "job_tasks"
_SPONSOR_EMPLOYERS = "sponsor_employers"
_SPONSOR_SYNC = "sponsor_registry_sync"
_JOB_STATUS_SQL = "'reference', 'under_study', 'to_do', 'applied', 'interview', 'offer', 'closed'"
_CLOSE_REASON_SQL = "'withdrew', 'not_selected', 'no_response', 'auto_archived', 'other'"
_JOBS_CREATE_SQL = f"""
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
                status TEXT DEFAULT 'under_study',
                match_score REAL,
                market TEXT NOT NULL DEFAULT '',
                filter_state TEXT NOT NULL DEFAULT 'included',
                filter_reasons TEXT NOT NULL DEFAULT '[]',
                sponsorship TEXT NOT NULL DEFAULT '{{}}',
                favorite INTEGER NOT NULL DEFAULT 0,
                next_step TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                applied_at TEXT,
                close_reason TEXT,
                deadline TEXT,
                follow_up_at TEXT,
                last_activity_at TEXT,
                CHECK (
                    status IS NULL
                    OR status IN ({_JOB_STATUS_SQL})
                ),
                CHECK (
                    close_reason IS NULL
                    OR close_reason IN ({_CLOSE_REASON_SQL})
                )
            )
            """
_JOBS_COLUMN_ORDER = (
    "id",
    "source",
    "source_job_id",
    "job_url",
    "canonical_url",
    "title",
    "company",
    "location",
    "description",
    "employment_type",
    "salary",
    "published_at",
    "discovered_at",
    "last_seen_at",
    "updated_at",
    "fingerprint",
    "status",
    "match_score",
    "market",
    "filter_state",
    "filter_reasons",
    "sponsorship",
    "favorite",
    "next_step",
    "comment",
    "applied_at",
    "close_reason",
    "deadline",
    "follow_up_at",
    "last_activity_at",
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
                    "job_id": str,
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
        self._ensure_application_job_id()

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
        self._ensure_job_tasks_table()
        self._ensure_sponsorship_tables()

    def _ensure_jobs_table(self) -> None:
        if _JOBS_TABLE not in self._db.table_names():
            self._db.execute(_JOBS_CREATE_SQL)
        elif self._jobs_schema_needs_rebuild():
            self._rebuild_jobs_table()
        self._ensure_job_filter_columns()
        self._ensure_job_sponsorship_column()
        self._ensure_job_tracking_columns()
        jobs = self._table(_JOBS_TABLE)
        jobs.create_index(["source", "source_job_id"], unique=True, if_not_exists=True)
        for col in (
            "discovered_at",
            "published_at",
            "status",
            "source",
            "fingerprint",
            "canonical_url",
            "filter_state",
            "favorite",
        ):
            jobs.create_index([col], if_not_exists=True)

    def _jobs_table_sql(self) -> str:
        row = self._db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'"
        ).fetchone()
        return str(row[0]) if row and row[0] else ""

    def _jobs_schema_needs_rebuild(self) -> bool:
        sql = self._jobs_table_sql()
        if not sql:
            return False
        required = (
            "under_study",
            "interview",
            "offer",
            "favorite",
            "next_step",
            "comment",
            "applied_at",
            "close_reason",
            "deadline",
            "follow_up_at",
            "last_activity_at",
            "auto_archived",
        )
        return any(token not in sql for token in required)

    def _rebuild_jobs_table(self) -> None:
        """Recreate ``jobs`` so status CHECK and tracking columns match v6."""
        src = "jobs_migrate_src"
        self._db.execute(f"ALTER TABLE {_JOBS_TABLE} RENAME TO {src}")
        self._db.execute(_JOBS_CREATE_SQL)
        src_cols = {str(row[1]) for row in self._db.execute(f"PRAGMA table_info({src})").fetchall()}
        select_exprs = [_jobs_rebuild_select(col, src_cols) for col in _JOBS_COLUMN_ORDER]
        columns = ", ".join(_JOBS_COLUMN_ORDER)
        selects = ", ".join(select_exprs)
        self._db.execute(
            f"INSERT INTO {_JOBS_TABLE} ({columns}) SELECT {selects} FROM {src}"  # noqa: S608
        )
        self._db.execute(f"DROP TABLE {src}")
        logger.info("Rebuilt jobs table for pipeline schema v{}", SCHEMA_VERSION)

    def _ensure_job_tracking_columns(self) -> None:
        names = {col.name for col in self._table(_JOBS_TABLE).columns}
        if "favorite" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
        if "next_step" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN next_step TEXT NOT NULL DEFAULT ''")
        if "comment" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN comment TEXT NOT NULL DEFAULT ''")
        if "applied_at" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN applied_at TEXT")
        if "close_reason" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN close_reason TEXT")
        if "deadline" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN deadline TEXT")
        if "follow_up_at" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN follow_up_at TEXT")
        if "last_activity_at" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN last_activity_at TEXT")

    def _ensure_application_job_id(self) -> None:
        if _APP_TABLE not in self._db.table_names():
            return
        names = {col.name for col in self._table(_APP_TABLE).columns}
        if "job_id" not in names:
            self._db.execute("ALTER TABLE applications ADD COLUMN job_id TEXT")
        self._db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_id "
            "ON applications(job_id) WHERE job_id IS NOT NULL AND job_id != ''"
        )

    def _ensure_job_filter_columns(self) -> None:
        """V0 reversible exclusion: keep jobs, hide them from the default pool."""
        names = {col.name for col in self._table(_JOBS_TABLE).columns}
        if "filter_state" not in names:
            self._db.execute(
                "ALTER TABLE jobs ADD COLUMN filter_state TEXT NOT NULL DEFAULT 'included'"
            )
        if "filter_reasons" not in names:
            self._db.execute(
                "ALTER TABLE jobs ADD COLUMN filter_reasons TEXT NOT NULL DEFAULT '[]'"
            )

    def _ensure_job_sponsorship_column(self) -> None:
        names = {col.name for col in self._table(_JOBS_TABLE).columns}
        if "sponsorship" not in names:
            self._db.execute("ALTER TABLE jobs ADD COLUMN sponsorship TEXT NOT NULL DEFAULT '{}'")

    def _ensure_sponsorship_tables(self) -> None:
        self._ensure_job_sponsorship_column()
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS sponsor_employers (
                country TEXT NOT NULL,
                registry_id TEXT NOT NULL,
                name_raw TEXT NOT NULL,
                employer_id TEXT NOT NULL DEFAULT '',
                visa_route TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT ''
            )
            """
        )
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS sponsor_registry_sync (
                registry_id TEXT PRIMARY KEY,
                country TEXT NOT NULL,
                registry_name TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT '',
                downloaded_url TEXT NOT NULL DEFAULT '',
                fetched_at TEXT NOT NULL DEFAULT '',
                row_count INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT ''
            )
            """
        )
        emp = self._table(_SPONSOR_EMPLOYERS)
        emp.create_index(["registry_id"], if_not_exists=True)
        emp.create_index(["country"], if_not_exists=True)

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

    def _ensure_job_tasks_table(self) -> None:
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS job_tasks (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                title TEXT NOT NULL,
                due_at TEXT,
                done INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        tasks = self._table(_JOB_TASKS_TABLE)
        tasks.create_index(["job_id"], if_not_exists=True)
        tasks.create_index(["due_at"], if_not_exists=True)

    def _get_meta(self, key: str) -> str | None:
        rows = list(self._table(_META_TABLE).rows_where("key = ?", [key]))
        return rows[0]["value"] if rows else None

    def _set_meta(self, key: str, value: str) -> None:
        self._table(_META_TABLE).upsert({"key": key, "value": value}, pk="key")

    def get_meta(self, key: str) -> str | None:
        return self._get_meta(key)

    def set_meta(self, key: str, value: str) -> None:
        self._set_meta(key, value)

    def _migrate(self, from_version: int) -> None:
        logger.info("Migrating DB schema v{} → v{}", from_version, SCHEMA_VERSION)
        if from_version < 2:
            # Idempotent — only creates tables when they don't already exist.
            self._ensure_applications_table()
            self._ensure_documents_table()
        if from_version < 3:
            self._ensure_v0_tables()
        if from_version < 4:
            self._ensure_jobs_table()
            self._ensure_job_filter_columns()
        if from_version < 5:
            self._ensure_sponsorship_tables()
        if from_version < 6:
            self._ensure_jobs_table()
            self._ensure_application_job_id()
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
        ``status``, ``match_score``, ``discovered_at``, ``favorite``,
        ``next_step``, ``comment``, ``applied_at``, ``close_reason``,
        ``deadline``, ``follow_up_at``, and ``last_activity_at``
        are preserved.
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
            job = _hub_job_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None
        job.tasks = self.list_job_tasks(job.id)
        return job

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

    def list_hub_jobs(
        self,
        *,
        limit: int = 100,
        since: datetime | None = None,
        filter_state: str = "included",
        market_values: Sequence[str] | None = None,
        empty_market_sources: Sequence[str] | None = None,
        sources: Sequence[str] | None = None,
        posted_since: datetime | None = None,
        country: str | None = None,
        remote: bool | None = None,
    ) -> list[Job]:
        """Job Pool rows, newest ``discovered_at`` first.

        ``filter_state``: ``included`` (default pool), ``excluded``, or ``all``.
        Market / source / posted date are SQL filters. Country and remote are
        applied after location normalization so ISO mapping stays in one place.
        """
        scan_limit = max(1, min(limit, 500))
        needs_scan = bool(
            (country and country.strip().lower() not in {"", "all"}) or remote is not None
        )
        if needs_scan:
            scan_limit = max(scan_limit, 2000)
        clauses: list[str] = []
        params: list[str] = []
        if since is not None:
            clauses.append("discovered_at >= ?")
            params.append(since.isoformat())
        state = filter_state.strip().lower()
        if state == "excluded":
            clauses.append("filter_state = ?")
            params.append("excluded")
        elif state != "all":
            clauses.append(
                "(filter_state IS NULL OR filter_state = '' OR filter_state = 'included')"
            )
        if market_values:
            market_clause, market_params = _market_sql(market_values, empty_market_sources)
            clauses.append(market_clause)
            params.extend(market_params)
        if sources:
            keys = [s.strip().lower() for s in sources if s.strip()]
            if keys:
                placeholders = ",".join("?" * len(keys))
                clauses.append(f"lower(source) IN ({placeholders})")
                params.extend(keys)
        if posted_since is not None:
            clauses.append("published_at IS NOT NULL AND published_at >= ?")
            params.append(posted_since.isoformat())
        where = " AND ".join(clauses) if clauses else "1=1"
        rows = self._table(_JOBS_TABLE).rows_where(
            where,
            params,
            order_by="discovered_at DESC",
            limit=scan_limit,
        )
        jobs = [_hub_job_from_row(dict(r)) for r in rows]
        if country and country.strip().lower() not in {"", "all"}:
            jobs = [j for j in jobs if _job_matches_country(j, country)]
        if remote is True:
            jobs = [j for j in jobs if j.is_remote]
        elif remote is False:
            jobs = [j for j in jobs if not j.is_remote]
        sliced = jobs[: max(1, min(limit, 500))]
        return self._attach_job_tasks(sliced)

    def list_all_hub_jobs(self) -> list[Job]:
        """Every canonical job, for reversible re-filtering."""
        rows = self._table(_JOBS_TABLE).rows_where(order_by="discovered_at DESC")
        return self._attach_job_tasks([_hub_job_from_row(dict(r)) for r in rows])

    def update_hub_job_filter(
        self,
        job_id: str,
        *,
        filter_state: str,
        filter_reasons: list[str],
    ) -> Job | None:
        """Set exclusion state only. Never touches status, match_score, discovered_at."""
        if self.get_hub_job(job_id) is None:
            return None
        self._table(_JOBS_TABLE).update(
            job_id,
            {
                "filter_state": filter_state,
                "filter_reasons": json.dumps(filter_reasons),
                "updated_at": _now_iso(),
            },
        )
        return self.get_hub_job(job_id)

    def update_hub_job_status(self, job_id: str, status: JobStatus | None) -> Job | None:
        """Set lifecycle status. ``None`` clears it. Does not touch ingest fields."""
        return self.update_hub_job(job_id, {"status": status})

    def update_hub_job(self, job_id: str, fields: dict[str, Any]) -> Job | None:
        """Patch tracking fields. Collector ingest never calls this."""
        job = self.get_hub_job(job_id)
        if job is None:
            return None
        payload = _tracking_payload(job, fields)
        if payload:
            self._table(_JOBS_TABLE).update(job_id, payload)
        if "status" in fields:
            status_value = payload.get("status")
            if status_value == JobStatus.TO_DO.value:
                stored = self.get_hub_job(job_id)
                if stored is not None:
                    self.ensure_application_for_job(stored)
            elif status_value == JobStatus.APPLIED.value:
                self._mark_application_submitted(job_id)
        return self.get_hub_job(job_id)

    def get_application_by_job_id(self, job_id: str) -> Application | None:
        """The single Application linked to a pool job, if any."""
        key = job_id.strip()
        if not key:
            return None
        rows = list(self._table(_APP_TABLE).rows_where("job_id = ?", [key], limit=1))
        return _app_from_row(dict(rows[0])) if rows else None

    def ensure_application_for_job(self, job: Job) -> Application:
        """Create an Application for this job if one does not already exist."""
        existing = self.get_application_by_job_id(job.id)
        if existing is not None:
            return existing
        app = Application(
            title=job.title,
            employer=job.company,
            location=job.location,
            url=job.job_url,
            source=job.source,
            stage=ApplicationStage.SAVED,
            job_id=job.id,
        )
        try:
            return self.create_application(app)
        except sqlite3.IntegrityError:
            raced = self.get_application_by_job_id(job.id)
            if raced is not None:
                return raced
            raise

    def _mark_application_submitted(self, job_id: str) -> None:
        app = self.get_application_by_job_id(job_id)
        if app is None:
            return
        updates: dict[str, Any] = {"stage": ApplicationStage.APPLIED}
        if not app.applied_date:
            updates["applied_date"] = datetime.now(tz=UTC).date().isoformat()
        self.update_application(app.id, **updates)

    def _touch_job_activity(self, job_id: str) -> None:
        now = _now_iso()
        self._table(_JOBS_TABLE).update(job_id, {"last_activity_at": now, "updated_at": now})

    def _attach_job_tasks(self, jobs: list[Job]) -> list[Job]:
        grouped = self.list_job_tasks_for_jobs([j.id for j in jobs])
        for job in jobs:
            job.tasks = grouped.get(job.id, [])
        return jobs

    def list_job_tasks(self, job_id: str) -> list[JobTask]:
        rows = self._table(_JOB_TASKS_TABLE).rows_where(
            "job_id = ?",
            [job_id],
            order_by="sort_order ASC, created_at ASC",
        )
        return [_job_task_from_row(dict(r)) for r in rows]

    def list_job_tasks_for_jobs(self, job_ids: Sequence[str]) -> dict[str, list[JobTask]]:
        grouped: dict[str, list[JobTask]] = {jid: [] for jid in job_ids}
        ids = [jid for jid in job_ids if jid]
        if not ids:
            return grouped
        placeholders = ",".join("?" * len(ids))
        rows = self._table(_JOB_TASKS_TABLE).rows_where(
            f"job_id IN ({placeholders})",
            list(ids),
            order_by="sort_order ASC, created_at ASC",
        )
        for row in rows:
            task = _job_task_from_row(dict(row))
            grouped.setdefault(task.job_id, []).append(task)
        return grouped

    def create_job_task(
        self,
        job_id: str,
        *,
        title: str,
        due_at: date | None = None,
        sort_order: int | None = None,
    ) -> JobTask | None:
        if self.get_hub_job(job_id) is None:
            return None
        order = sort_order
        if order is None:
            existing = self.list_job_tasks(job_id)
            order = (existing[-1].sort_order + 1) if existing else 0
        task = JobTask(job_id=job_id, title=title, due_at=due_at, sort_order=order)
        self._table(_JOB_TASKS_TABLE).insert(_job_task_to_row(task))
        self._touch_job_activity(job_id)
        return task

    def update_job_task(self, job_id: str, task_id: str, fields: dict[str, Any]) -> JobTask | None:
        task = self.get_job_task(task_id)
        if task is None or task.job_id != job_id:
            return None
        payload: dict[str, Any] = {}
        if "title" in fields and fields["title"] is not None:
            payload["title"] = str(fields["title"]).strip()
        if "due_at" in fields:
            payload["due_at"] = _optional_date_str(fields["due_at"])
        if "done" in fields:
            payload["done"] = 1 if fields["done"] else 0
        if "sort_order" in fields and fields["sort_order"] is not None:
            payload["sort_order"] = int(fields["sort_order"])
        if payload:
            self._table(_JOB_TASKS_TABLE).update(task_id, payload)
            self._touch_job_activity(job_id)
        return self.get_job_task(task_id)

    def get_job_task(self, task_id: str) -> JobTask | None:
        try:
            row = self._table(_JOB_TASKS_TABLE).get(task_id)
            return _job_task_from_row(dict(row))
        except sqlite_utils.db.NotFoundError:
            return None

    def delete_job_task(self, job_id: str, task_id: str) -> bool:
        task = self.get_job_task(task_id)
        if task is None or task.job_id != job_id:
            return False
        self._table(_JOB_TASKS_TABLE).delete(task_id)
        self._touch_job_activity(job_id)
        return True

    def update_hub_job_sponsorship(self, job_id: str, info: SponsorshipInfo) -> Job | None:
        """Store sponsorship enrichment. Does not touch status or ingest fields."""
        if self.get_hub_job(job_id) is None:
            return None
        self._table(_JOBS_TABLE).update(
            job_id,
            {"sponsorship": json.dumps(info.as_store())},
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
        "job_id": app.job_id or None,
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
        job_id=row.get("job_id") or None,
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


def _parse_json_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if not value:
        return []
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, list):
        return [str(item) for item in parsed]
    return []


def _parse_sponsorship(value: object) -> SponsorshipInfo:
    if isinstance(value, SponsorshipInfo):
        return value
    if isinstance(value, dict):
        try:
            return SponsorshipInfo.model_validate(value)
        except (ValidationError, TypeError, ValueError):
            return SponsorshipInfo()
    if not value:
        return SponsorshipInfo()
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError:
        return SponsorshipInfo()
    if isinstance(parsed, dict):
        try:
            return SponsorshipInfo.model_validate(parsed)
        except (ValidationError, TypeError, ValueError):
            return SponsorshipInfo()
    return SponsorshipInfo()


def _jobs_rebuild_select(col: str, src_cols: set[str]) -> str:
    """SELECT expression copying ``col`` from the pre-v6 jobs table."""
    if col == "status":
        if "status" in src_cols:
            return (
                "CASE WHEN status IS NULL OR status = '' OR status = 'saved' "
                "THEN 'under_study' ELSE status END"
            )
        return "'under_study'"
    if col == "favorite":
        return "COALESCE(favorite, 0)" if "favorite" in src_cols else "0"
    if col in {"next_step", "comment"}:
        return f"COALESCE({col}, '')" if col in src_cols else "''"
    if col in {
        "applied_at",
        "close_reason",
        "published_at",
        "match_score",
        "deadline",
        "follow_up_at",
    }:
        return col if col in src_cols else "NULL"
    if col == "last_activity_at":
        if "last_activity_at" in src_cols:
            return "last_activity_at"
        if "updated_at" in src_cols:
            return "updated_at"
        if "discovered_at" in src_cols:
            return "discovered_at"
        return "NULL"
    if col == "filter_state":
        return "COALESCE(filter_state, 'included')" if "filter_state" in src_cols else "'included'"
    if col == "filter_reasons":
        return "COALESCE(filter_reasons, '[]')" if "filter_reasons" in src_cols else "'[]'"
    if col == "sponsorship":
        return "COALESCE(sponsorship, '{}')" if "sponsorship" in src_cols else "'{}'"
    if col in src_cols:
        return col
    return "''"


def _tracking_payload(job: Job, fields: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if "status" in fields:
        status = fields["status"]
        if status is None or status == "":
            payload["status"] = None
        elif isinstance(status, JobStatus):
            payload["status"] = status.value
        else:
            payload["status"] = str(status)
        if (
            payload["status"] == JobStatus.APPLIED.value
            and "applied_at" not in fields
            and job.applied_at is None
        ):
            payload["applied_at"] = _now_iso()
    if "comment" in fields:
        payload["comment"] = fields["comment"] or ""
    if "favorite" in fields:
        payload["favorite"] = 1 if fields["favorite"] else 0
    if "next_step" in fields:
        payload["next_step"] = fields["next_step"] or ""
    if "applied_at" in fields:
        value = fields["applied_at"]
        if isinstance(value, datetime):
            payload["applied_at"] = value.isoformat()
        elif value is None or value == "":
            payload["applied_at"] = None
        else:
            payload["applied_at"] = str(value)
    if "close_reason" in fields:
        reason = fields["close_reason"]
        if reason is None or reason == "":
            payload["close_reason"] = None
        elif isinstance(reason, CloseReason):
            payload["close_reason"] = reason.value
        else:
            payload["close_reason"] = str(reason)
    if "deadline" in fields:
        payload["deadline"] = _optional_date_str(fields["deadline"])
    if "follow_up_at" in fields:
        payload["follow_up_at"] = _optional_date_str(fields["follow_up_at"])
    if payload:
        payload["updated_at"] = _now_iso()
        payload["last_activity_at"] = _now_iso()
    return payload


def _optional_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _optional_date_str(value: object) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return text or None


def _parse_optional_date(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        return date.fromisoformat(text[:10])
    except (ValueError, TypeError):
        return None


def _market_sql(
    market_values: Sequence[str],
    empty_market_sources: Sequence[str] | None,
) -> tuple[str, list[str]]:
    values = [v.strip().upper() for v in market_values if v.strip()]
    if not values:
        return ("1=1", [])
    placeholders = ",".join("?" * len(values))
    market_part = f"upper(market) IN ({placeholders})"
    params = list(values)
    sources = [s.strip().lower() for s in (empty_market_sources or []) if s.strip()]
    if not sources:
        return (market_part, params)
    src_ph = ",".join("?" * len(sources))
    clause = f"({market_part} OR ((market IS NULL OR market = '') AND lower(source) IN ({src_ph})))"
    params.extend(sources)
    return (clause, params)


def _job_matches_country(job: Job, selected: str) -> bool:
    from job_sentinel.geo.country import matches_country_filter

    if matches_country_filter(job.country, selected):
        return True
    sponsor = job.sponsorship.country if job.sponsorship is not None else None
    if sponsor:
        return matches_country_filter(sponsor, selected)
    return False


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
        "favorite": 1 if job.favorite else 0,
        "next_step": job.next_step,
        "comment": job.comment,
        "applied_at": _optional_iso(job.applied_at),
        "close_reason": job.close_reason.value if job.close_reason is not None else None,
        "deadline": _optional_date_str(job.deadline),
        "follow_up_at": _optional_date_str(job.follow_up_at),
        "last_activity_at": _optional_iso(job.last_activity_at),
        "match_score": job.match_score,
        "market": job.market,
        "filter_state": job.filter_state or "included",
        "filter_reasons": json.dumps(list(job.filter_reasons)),
        "sponsorship": json.dumps(job.sponsorship.as_store()),
    }


def _hub_job_from_row(row: dict[str, Any]) -> Job:
    from job_sentinel.geo.country import normalize_location

    raw_status = row.get("status")
    status: JobStatus | None = JobStatus(raw_status) if raw_status else None
    raw_reason = row.get("close_reason")
    close_reason = CloseReason(raw_reason) if raw_reason else None
    score = row.get("match_score")
    location = row.get("location", "") or ""
    employment = row.get("employment_type", "") or ""
    geo = normalize_location(str(location), str(employment))
    return Job(
        id=row["id"],
        source=row.get("source", ""),
        source_job_id=row.get("source_job_id", ""),
        job_url=row.get("job_url", ""),
        canonical_url=row.get("canonical_url", ""),
        title=row.get("title", ""),
        company=row.get("company", ""),
        location=location,
        description=row.get("description", ""),
        employment_type=employment,
        salary=row.get("salary", ""),
        published_at=_parse_optional_dt(row.get("published_at")),
        discovered_at=_parse_dt(row.get("discovered_at", "")),
        last_seen_at=_parse_dt(row.get("last_seen_at", "")),
        updated_at=_parse_dt(row.get("updated_at", "")),
        fingerprint=row.get("fingerprint", ""),
        status=status,
        favorite=bool(row.get("favorite") or 0),
        next_step=str(row.get("next_step") or ""),
        comment=str(row.get("comment") or ""),
        applied_at=_parse_optional_dt(row.get("applied_at")),
        close_reason=close_reason,
        deadline=_parse_optional_date(row.get("deadline")),
        follow_up_at=_parse_optional_date(row.get("follow_up_at")),
        last_activity_at=_parse_optional_dt(row.get("last_activity_at")),
        match_score=float(score) if score is not None else None,
        market=row.get("market", ""),
        filter_state=str(row.get("filter_state") or "included"),
        filter_reasons=_parse_json_list(row.get("filter_reasons")),
        sponsorship=_parse_sponsorship(row.get("sponsorship")),
        country=geo.code,
        country_name=geo.name,
        is_remote=geo.is_remote,
    )


def _job_task_to_row(task: JobTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "job_id": task.job_id,
        "title": task.title,
        "due_at": _optional_date_str(task.due_at),
        "done": 1 if task.done else 0,
        "sort_order": task.sort_order,
        "created_at": task.created_at.isoformat(),
    }


def _job_task_from_row(row: dict[str, Any]) -> JobTask:
    return JobTask(
        id=row["id"],
        job_id=row.get("job_id", ""),
        title=row.get("title", ""),
        due_at=_parse_optional_date(row.get("due_at")),
        done=bool(row.get("done") or 0),
        sort_order=int(row.get("sort_order") or 0),
        created_at=_parse_dt(row.get("created_at", "")),
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
