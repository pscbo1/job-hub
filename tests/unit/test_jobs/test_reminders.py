"""In-app reminders for due-dated job_tasks."""

from __future__ import annotations

import sqlite3
from contextlib import suppress
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Job, TaskReminderKind
from job_sentinel.db.repository import SCHEMA_VERSION, JobRepository
from job_sentinel.jobs.reminders import (
    list_reminder_inbox,
    sync_in_app_reminders,
    today_in_app_tz,
)

if TYPE_CHECKING:
    from pathlib import Path

# 2026-09-02 00:00 Asia/Shanghai
_SEP2_START = datetime(2026, 9, 1, 16, 0, tzinfo=UTC)
# 2026-09-01 23:59 Asia/Shanghai
_SEP1_END = datetime(2026, 9, 1, 15, 59, tzinfo=UTC)


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "zhaopin",
        "source_job_id": "j1",
        "title": "SWE",
        "company": "Acme",
        "market": "cn",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def _client(tmp_path: Path) -> tuple[TestClient, Path]:
    db = tmp_path / "api.db"
    JobRepository(db).close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    return client, db


def test_schema_version_is_current() -> None:
    assert SCHEMA_VERSION == 20


def test_dated_task_gets_due_node_only(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(stored.id, title="OA", due_at=date(2026, 9, 10), now=_SEP2_START)
    assert task is not None
    assert [row.kind for row in task.reminders] == [TaskReminderKind.DUE]
    assert task.reminders[0].reminder_on == date(2026, 9, 10)
    repo.close()


def test_undated_task_has_no_reminders(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(stored.id, title="Prep", now=_SEP2_START)
    assert task is not None
    assert task.reminders == []
    repo.close()


def test_save_task_and_reminders_one_transaction(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    created = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={
            "title": "OA",
            "due_at": "2026-12-20",
            "reminders": ["2026-12-10", "2026-12-20"],
        },
    )
    assert created.status_code == 200
    body = created.json()
    dates = sorted(row["reminder_on"] for row in body["reminders"] if row["enabled"])
    assert dates == ["2026-12-10", "2026-12-20"]
    kinds = {row["reminder_on"]: row["kind"] for row in body["reminders"]}
    assert kinds["2026-12-10"] == "advance"
    assert kinds["2026-12-20"] == "due"


def test_invalid_advance_does_not_write(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    created = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={"title": "OA", "due_at": "2026-09-10", "reminders": ["2026-09-12"]},
    )
    assert created.status_code == 422
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM job_tasks").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM task_reminders").fetchone()[0] == 0


def test_clear_due_disables_all_nodes(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 10),
        reminder_dates=[date(2026, 9, 4), date(2026, 9, 10)],
        now=_SEP2_START,
    )
    assert task is not None
    updated = repo.update_job_task(
        stored.id, task.id, {"due_at": None}, reminders_set=False, now=_SEP2_START
    )
    assert updated is not None
    assert updated.due_at is None
    assert updated.reminders == []
    rows = repo.list_reminders_for_tasks([task.id])[task.id]
    assert rows
    assert all(not row.enabled for row in rows)
    repo.close()


def test_due_change_keeps_valid_advances_and_old_cycle(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 10),
        reminder_dates=[date(2026, 9, 4), date(2026, 9, 10)],
        now=_SEP2_START,
    )
    assert task is not None
    updated = repo.update_job_task(
        stored.id, task.id, {"due_at": date(2026, 9, 20)}, now=_SEP2_START
    )
    assert updated is not None
    current = {row.reminder_on for row in updated.reminders}
    assert current == {date(2026, 9, 4), date(2026, 9, 20)}
    old = repo.list_reminders_for_task_due(task.id, date(2026, 9, 10))
    assert {row.reminder_on for row in old} >= {date(2026, 9, 4), date(2026, 9, 10)}
    repo.close()


def test_unique_key_does_not_duplicate(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 10),
        reminder_dates=[date(2026, 9, 4), date(2026, 9, 10)],
        now=_SEP2_START,
    )
    assert task is not None
    again = repo.update_job_task(
        stored.id,
        task.id,
        {},
        reminder_dates=[date(2026, 9, 4), date(2026, 9, 10)],
        reminders_set=True,
        now=_SEP2_START,
    )
    assert again is not None
    assert len(again.reminders) == 2
    with sqlite3.connect(tmp_path / "j.db") as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM task_reminders WHERE task_id = ?", [task.id]
        ).fetchone()[0]
    assert count == 2
    repo.close()


def test_backfill_due_node_only(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(stored.id, title="OA", due_at=date(2026, 9, 10), now=_SEP2_START)
    assert task is not None
    with sqlite3.connect(tmp_path / "j.db") as conn:
        conn.execute("DELETE FROM task_reminders")
        conn.commit()
    repo._backfill_due_reminder_nodes()
    rows = repo.list_reminders_for_task_due(task.id, date(2026, 9, 10))
    assert len(rows) == 1
    assert rows[0].kind == TaskReminderKind.DUE
    repo.close()


def test_sync_catch_up_latest_only(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    created_at = datetime(2026, 8, 29, 16, 0, tzinfo=UTC)  # 2026-08-30 Shanghai
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 10),
        reminder_dates=[date(2026, 8, 30), date(2026, 9, 1), date(2026, 9, 2), date(2026, 9, 10)],
        now=created_at,
    )
    assert task is not None
    before_midnight = sync_in_app_reminders(repo, now=_SEP1_END)
    assert before_midnight.triggered == 1
    assert before_midnight.skipped == 1
    inbox_before = list_reminder_inbox(repo, view="all", now=_SEP1_END)
    assert [item.reminder_on for item in inbox_before.items] == [date(2026, 9, 1)]

    again = sync_in_app_reminders(repo, now=_SEP2_START)
    assert again.today == date(2026, 9, 2)
    assert again.tz == "Asia/Shanghai"
    assert again.triggered == 1
    inbox = list_reminder_inbox(repo, view="all", now=_SEP2_START)
    dates = [item.reminder_on for item in inbox.items]
    assert dates == [date(2026, 9, 1), date(2026, 9, 2)]
    unread = list_reminder_inbox(repo, view="unread", now=_SEP2_START)
    assert unread.unread_count == 2
    skipped = [
        row
        for row in repo.list_reminders_for_task_due(task.id, date(2026, 9, 10))
        if row.in_app_skipped_at is not None
    ]
    assert {row.reminder_on for row in skipped} == {date(2026, 8, 30)}
    repo.close()


def test_sync_reuses_triggered_including_read(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 2),
        reminder_dates=[date(2026, 9, 2)],
        now=_SEP2_START,
    )
    assert task is not None
    sync_in_app_reminders(repo, now=_SEP2_START)
    inbox = list_reminder_inbox(repo, view="unread", now=_SEP2_START)
    assert len(inbox.items) == 1
    reminder_id = inbox.items[0].id
    marked = repo.mark_task_reminder_read(reminder_id, _SEP2_START)
    assert marked is not None
    assert marked.read_at is not None
    sync_in_app_reminders(repo, now=_SEP2_START)
    again = repo.get_task_reminder(reminder_id)
    assert again is not None
    assert again.read_at is not None
    unread = list_reminder_inbox(repo, view="unread", now=_SEP2_START)
    assert unread.unread_count == 0
    all_rows = list_reminder_inbox(repo, view="all", now=_SEP2_START)
    assert len(all_rows.items) == 1
    repo.close()


def test_future_and_skipped_hidden_from_inbox(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 10),
        reminder_dates=[date(2026, 9, 4), date(2026, 9, 10)],
        now=_SEP2_START,
    )
    assert task is not None
    sync_in_app_reminders(repo, now=_SEP2_START)
    inbox = list_reminder_inbox(repo, view="all", now=_SEP2_START)
    assert inbox.items == []
    repo.close()


def test_done_or_invisible_job_does_not_trigger(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 2),
        now=_SEP2_START,
    )
    assert task is not None
    repo.update_job_task(stored.id, task.id, {"done": True}, now=_SEP2_START)
    result = sync_in_app_reminders(repo, now=_SEP2_START)
    assert result.triggered == 0
    other = repo.upsert_job(_job(source_job_id="j2", title="Hidden"))
    hidden = repo.create_job_task(other.id, title="OA", due_at=date(2026, 9, 2), now=_SEP2_START)
    assert hidden is not None
    repo.update_hub_job_filter(other.id, filter_state="excluded", filter_reasons=["x"])
    result2 = sync_in_app_reminders(repo, now=_SEP2_START)
    assert result2.triggered == 0
    repo.close()


def test_due_today_to_overdue_is_copy_only(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(
        stored.id,
        title="OA",
        due_at=date(2026, 9, 2),
        now=_SEP2_START,
    )
    assert task is not None
    sync_in_app_reminders(repo, now=_SEP2_START)
    today_inbox = list_reminder_inbox(repo, view="unread", now=_SEP2_START)
    assert today_inbox.items[0].due_status == "due_today"
    reminder_id = today_inbox.items[0].id
    later = datetime(2026, 9, 2, 16, 0, tzinfo=UTC)  # 2026-09-03 00:00 Shanghai
    sync_in_app_reminders(repo, now=later)
    overdue = list_reminder_inbox(repo, view="unread", now=later)
    assert len(overdue.items) == 1
    assert overdue.items[0].id == reminder_id
    assert overdue.items[0].due_status == "overdue"
    assert overdue.unread_count == 1
    repo.close()


def test_reminders_api_sync_read_and_get_job(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    clock = client.post("/api/reminders/sync")
    assert clock.status_code == 200
    today = clock.json()["today"]
    created = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={"title": "OA", "due_at": today},
    )
    assert created.status_code == 200
    task_id = created.json()["id"]
    synced = client.post("/api/reminders/sync")
    assert synced.status_code == 200
    body = synced.json()
    assert body["tz"] == "Asia/Shanghai"
    listed = client.get("/api/reminders?view=unread")
    assert listed.status_code == 200
    payload = listed.json()
    assert payload["unread_count"] == 1
    assert payload["items"][0]["task_id"] == task_id
    reminder_id = payload["items"][0]["id"]
    read = client.patch(f"/api/reminders/{reminder_id}/read")
    assert read.status_code == 200
    assert read.json()["read_at"]
    again = client.patch(f"/api/reminders/{reminder_id}/read")
    assert again.status_code == 200
    empty = client.get("/api/reminders?view=unread")
    assert empty.json()["unread_count"] == 0
    all_rows = client.get("/api/reminders?view=all")
    assert len(all_rows.json()["items"]) == 1
    job = client.get(f"/api/jobs/{stored.id}")
    assert job.status_code == 200
    assert job.json()["id"] == stored.id
    missing = client.get("/api/jobs/does-not-exist")
    assert missing.status_code == 404


def test_reminder_rollback_leaves_no_task(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            CREATE TRIGGER fail_reminders
            BEFORE INSERT ON task_reminders
            BEGIN
                SELECT RAISE(ABORT, 'forced reminder failure');
            END
            """
        )
        conn.commit()
    with suppress(Exception):
        client.post(
            f"/api/jobs/{stored.id}/tasks",
            json={"title": "OA", "due_at": "2026-09-10"},
        )
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM job_tasks").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM task_reminders").fetchone()[0] == 0


def test_today_uses_app_timezone() -> None:
    assert today_in_app_tz(now=_SEP2_START) == date(2026, 9, 2)
    assert today_in_app_tz(now=_SEP1_END) == date(2026, 9, 1)
