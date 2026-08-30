"""SQLite cache for official sponsor lists (same DB as jobs)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from job_sentinel.sponsorship.registry import RegistrySyncMeta, SponsorEmployer
from job_sentinel.sponsorship.registry.index import SponsorIndex, index_from_rows

if TYPE_CHECKING:
    from sqlite_utils.db import Table

    from job_sentinel.db.repository import JobRepository

_EMP = "sponsor_employers"
_META = "sponsor_registry_sync"


def replace_registry_rows(
    repo: JobRepository,
    *,
    registry_id: str,
    country: str,
    registry_name: str,
    source_url: str,
    downloaded_url: str,
    rows: list[SponsorEmployer],
) -> RegistrySyncMeta:
    emp = _table(repo, _EMP)
    emp.delete_where("registry_id = ?", [registry_id])
    payload = [
        {
            "country": row.country,
            "registry_id": row.registry_id,
            "name_raw": row.employer_name,
            "employer_id": row.employer_id,
            "visa_route": row.visa_route,
            "source_url": row.source_url,
        }
        for row in rows
    ]
    if payload:
        emp.insert_all(payload)
    fetched = datetime.now(tz=UTC).isoformat()
    meta = {
        "registry_id": registry_id,
        "country": country,
        "registry_name": registry_name,
        "source_url": source_url,
        "downloaded_url": downloaded_url,
        "fetched_at": fetched,
        "row_count": len(rows),
        "error": "",
    }
    _table(repo, _META).upsert(meta, pk="registry_id")
    return RegistrySyncMeta.model_validate(meta)


def record_registry_error(
    repo: JobRepository,
    *,
    registry_id: str,
    country: str,
    registry_name: str,
    source_url: str,
    error: str,
) -> None:
    sync = _table(repo, _META)
    existing = list(sync.rows_where("registry_id = ?", [registry_id]))
    prev = dict(existing[0]) if existing else {}
    sync.upsert(
        {
            "registry_id": registry_id,
            "country": country,
            "registry_name": registry_name,
            "source_url": source_url,
            "downloaded_url": prev.get("downloaded_url", ""),
            "fetched_at": prev.get("fetched_at", ""),
            "row_count": int(prev.get("row_count") or 0),
            "error": error[:2000],
        },
        pk="registry_id",
    )


def load_index(repo: JobRepository) -> SponsorIndex:
    names = {str(m["registry_id"]): str(m["registry_name"]) for m in _table(repo, _META).rows}
    rows = [
        SponsorEmployer(
            country=str(r["country"]),
            registry_id=str(r["registry_id"]),
            registry_name=str(names.get(str(r["registry_id"])) or r["registry_id"]),
            source_url=str(r.get("source_url") or ""),
            employer_name=str(r["name_raw"]),
            employer_id=str(r.get("employer_id") or ""),
            visa_route=str(r.get("visa_route") or ""),
        )
        for r in _table(repo, _EMP).rows
    ]
    return index_from_rows(rows)


def list_sync_meta(repo: JobRepository) -> list[RegistrySyncMeta]:
    return [RegistrySyncMeta.model_validate(dict(r)) for r in _table(repo, _META).rows]


def _table(repo: JobRepository, name: str) -> Table:
    return repo._table(name)
