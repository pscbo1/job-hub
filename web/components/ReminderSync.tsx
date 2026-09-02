"use client";

import { useCallback, useEffect, useRef } from "react";

import { listReminders, syncReminders } from "@/lib/api";

export const REMINDERS_CHANGED_EVENT = "job-hub:reminders-refresh";
export const REMINDERS_COUNT_EVENT = "job-hub:reminders";

export function notifyRemindersChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export function ReminderSync() {
  const seq = useRef(0);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    await syncReminders();
    const inbox = await listReminders({ view: "unread", limit: 1 });
    if (mine !== seq.current) return;
    window.dispatchEvent(
      new CustomEvent(REMINDERS_COUNT_EVENT, { detail: { unread_count: inbox.unread_count } }),
    );
  }, []);

  useEffect(() => {
    void run();
    const onRefresh = () => {
      void run();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, 60_000);
    return () => {
      seq.current += 1;
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [run]);

  return null;
}
