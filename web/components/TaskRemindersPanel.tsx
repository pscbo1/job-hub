"use client";

import { useEffect, useState } from "react";

import { PopoverMenu } from "@/components/ui/popover-menu";
import {
  listReminders,
  markReminderRead,
  type ReminderInboxItem,
  type ReminderInboxView,
} from "@/lib/api";
import { notifyRemindersChanged } from "@/components/ReminderSync";
import { tasksPageHref } from "@/lib/jobTasksUi";
import { formatCalendarDate } from "@/lib/timezone";
import { reminderDueStatusLabel } from "@/lib/taskRemindersUi";
import { cn } from "@/lib/utils";

export function TaskRemindersPanel() {
  const [view, setView] = useState<ReminderInboxView>("unread");
  const [items, setItems] = useState<ReminderInboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [failed, setFailed] = useState<ReminderInboxItem | null>(null);

  async function load(nextView = view) {
    setError("");
    const inbox = await listReminders({ view: nextView, limit: 100 });
    setItems(inbox.items);
    setLoaded(true);
  }

  useEffect(() => {
    void load(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function openReminder(item: ReminderInboxItem, markRead: boolean) {
    setPendingId(item.id);
    setError("");
    setFailed(null);
    if (markRead) {
      const saved = await markReminderRead(item.id);
      if (!saved) {
        setFailed(item);
        setError("Couldn't mark as read.");
        setPendingId("");
        return;
      }
      notifyRemindersChanged();
    }
    window.location.assign(tasksPageHref(item.job_id, item.task_id));
  }

  return (
    <PopoverMenu
      align="end"
      role="dialog"
      minWidth={340}
      ariaLabel="Reminders"
      triggerClassName="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
      trigger="Reminders"
    >
      {() => (
        <div className="px-1 py-1">
          <div className="flex gap-1 px-2 pb-2">
            {(["unread", "all"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "h-8 rounded-md px-2 text-xs font-medium",
                  view === key ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                {key === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>
          {!loaded ? (
            <p className="px-3 py-4 text-sm text-muted">Loading reminders…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              {view === "unread" ? "All caught up" : "No reminders"}
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void openReminder(item, true)}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-bg disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-ink">{item.task_title}</p>
                    <p className="text-xs text-muted">
                      {[item.job_title, item.company].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      Reminder {formatCalendarDate(item.reminder_on)} · Due{" "}
                      {formatCalendarDate(item.due_date)} · {reminderDueStatusLabel(item.due_status)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && failed && (
            <div className="px-3 py-2 text-xs text-amber-800">
              <p>{error}</p>
              <div className="mt-1 flex gap-3">
                <button type="button" className="underline" onClick={() => void openReminder(failed, true)}>
                  Retry
                </button>
                <button type="button" className="underline" onClick={() => void openReminder(failed, false)}>
                  Open task
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PopoverMenu>
  );
}
