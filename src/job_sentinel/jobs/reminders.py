"""In-app reminders for due-dated job_tasks.

Only checklist due dates create reminder nodes. Job DDL and follow_up_at are
not sources. No email, push, snooze, or scheduler — nodes become visible on
the next client sync after local midnight.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field

from job_sentinel.core.models import Job, TaskReminder, TaskReminderKind

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

DEFAULT_APP_TIMEZONE = "Asia/Shanghai"
DueStatus = Literal["upcoming", "due_today", "overdue"]


class ReminderPlanError(ValueError):
    """Invalid reminder dates; callers map this to HTTP 422."""


class ReminderInboxItem(BaseModel):
    id: str
    task_id: str
    job_id: str
    task_title: str
    job_title: str
    company: str
    reminder_on: date
    due_date: date
    kind: TaskReminderKind
    due_status: DueStatus
    read_at: datetime | None = None
    in_app_triggered_at: datetime | None = None
    market: str = ""


class ReminderInbox(BaseModel):
    items: list[ReminderInboxItem] = Field(default_factory=list)
    unread_count: int = 0
    total: int = 0
    today: date
    tz: str


class ReminderSyncResult(BaseModel):
    today: date
    tz: str
    triggered: int = 0
    skipped: int = 0


def resolve_app_timezone(name: str | None = None) -> str:
    raw = (name or os.environ.get("APP_TIMEZONE") or "").strip()
    return raw or DEFAULT_APP_TIMEZONE


def today_in_app_tz(*, now: datetime | None = None, tz_name: str | None = None) -> date:
    zone_name = resolve_app_timezone(tz_name)
    try:
        zone = ZoneInfo(zone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo(DEFAULT_APP_TIMEZONE)
        zone_name = DEFAULT_APP_TIMEZONE
    moment = now or datetime.now(tz=UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(zone).date()


def due_status_for(due: date, today: date) -> DueStatus:
    if due < today:
        return "overdue"
    if due == today:
        return "due_today"
    return "upcoming"


def job_is_reminder_visible(job: Job) -> bool:
    if job.dismissed_at is not None:
        return False
    if job.archived_at is not None:
        return False
    return (job.filter_state or "included").strip().lower() != "excluded"


def reminder_kind_for(reminder_on: date, due: date) -> TaskReminderKind:
    if reminder_on == due:
        return TaskReminderKind.DUE
    return TaskReminderKind.ADVANCE


def normalize_reminder_plan(
    due: date | None,
    requested: list[date] | None,
    *,
    today: date,
    existing: set[date],
) -> list[tuple[date, TaskReminderKind]] | None:
    """Return an explicit (date, kind) plan, or None to keep implicit due-node rules.

    ``requested is None`` means the client did not edit the chip list.
    """
    if due is None:
        return []
    if requested is None:
        return None
    dates = sorted(set(requested))
    if due not in dates:
        dates.append(due)
        dates.sort()
    plan: list[tuple[date, TaskReminderKind]] = []
    for day in dates:
        if day == due:
            plan.append((day, TaskReminderKind.DUE))
            continue
        if day > due:
            raise ReminderPlanError("Advance reminder must be before the due date.")
        if day < today and day not in existing:
            raise ReminderPlanError(
                "Advance reminder must be on or after today and before the due date."
            )
        plan.append((day, TaskReminderKind.ADVANCE))
    return plan


def sync_in_app_reminders(
    repo: JobRepository,
    *,
    now: datetime | None = None,
    tz_name: str | None = None,
) -> ReminderSyncResult:
    """Catch-up: per task + current due, trigger only the latest reminder_on <= today."""
    moment = now or datetime.now(tz=UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    tz = resolve_app_timezone(tz_name)
    today = today_in_app_tz(now=moment, tz_name=tz)
    triggered = 0
    skipped = 0
    for task, job in repo.list_open_dated_tasks_for_reminders():
        if not job_is_reminder_visible(job) or task.done or task.due_at is None:
            continue
        nodes = [
            row for row in repo.list_reminders_for_task_due(task.id, task.due_at) if row.enabled
        ]
        eligible = [row for row in nodes if row.reminder_on <= today]
        if not eligible:
            continue
        latest_on = max(row.reminder_on for row in eligible)
        latest = [row for row in eligible if row.reminder_on == latest_on]
        latest_ids = {row.id for row in latest}
        for row in eligible:
            if row.id in latest_ids:
                continue
            if (
                row.in_app_triggered_at is None
                and row.in_app_skipped_at is None
                and repo.skip_task_reminder(row.id, moment)
            ):
                skipped += 1
        for row in latest:
            if row.in_app_triggered_at is not None or row.in_app_skipped_at is not None:
                continue
            if repo.trigger_task_reminder(row.id, moment):
                triggered += 1
    return ReminderSyncResult(today=today, tz=tz, triggered=triggered, skipped=skipped)


def list_reminder_inbox(
    repo: JobRepository,
    *,
    view: str = "unread",
    market: str | None = None,
    limit: int = 50,
    offset: int = 0,
    now: datetime | None = None,
    tz_name: str | None = None,
) -> ReminderInbox:
    tz = resolve_app_timezone(tz_name)
    today = today_in_app_tz(now=now, tz_name=tz)
    key = view.strip().lower() or "unread"
    unread_only = key != "all"
    rows = repo.list_triggered_reminder_rows(market=market)
    items = [_inbox_item(row, today) for row in rows]
    items.sort(
        key=lambda item: (
            item.due_date.isoformat(),
            item.task_title.lower(),
            item.reminder_on.isoformat(),
            item.id,
        )
    )
    unread_count = sum(1 for item in items if item.read_at is None)
    visible = [item for item in items if (item.read_at is None)] if unread_only else items
    start = max(0, offset)
    end = start + max(1, min(limit, 200))
    return ReminderInbox(
        items=visible[start:end],
        unread_count=unread_count,
        total=len(visible),
        today=today,
        tz=tz,
    )


def mark_reminder_read(
    repo: JobRepository,
    reminder_id: str,
    *,
    now: datetime | None = None,
) -> TaskReminder | None:
    moment = now or datetime.now(tz=UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return repo.mark_task_reminder_read(reminder_id, moment)


def _inbox_item(row: dict[str, object], today: date) -> ReminderInboxItem:
    due = date.fromisoformat(str(row["due_date"])[:10])
    reminder_on = date.fromisoformat(str(row["reminder_on"])[:10])
    kind_raw = str(row.get("kind") or "advance")
    kind = TaskReminderKind.DUE if kind_raw == "due" else TaskReminderKind.ADVANCE
    return ReminderInboxItem(
        id=str(row["id"]),
        task_id=str(row["task_id"]),
        job_id=str(row["job_id"]),
        task_title=str(row.get("task_title") or ""),
        job_title=str(row.get("job_title") or ""),
        company=str(row.get("company") or ""),
        reminder_on=reminder_on,
        due_date=due,
        kind=kind,
        due_status=due_status_for(due, today),
        read_at=_dt_or_none(row.get("read_at")),
        in_app_triggered_at=_dt_or_none(row.get("in_app_triggered_at")),
        market=str(row.get("market") or ""),
    )


def _dt_or_none(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
