"use client";

import { todayInAppTz } from "@/lib/timezone";
import { canAddAdvanceReminder, isValidAdvanceReminder, uniqueSortedDates } from "@/lib/taskRemindersUi";
import { cn } from "@/lib/utils";

export function TaskReminderEditor({
  due,
  dates,
  today,
  disabled,
  onChange,
}: {
  due: string;
  dates: string[];
  today?: string;
  disabled?: boolean;
  onChange: (dates: string[]) => void;
}) {
  const todayIso = today ?? todayInAppTz();
  const dueDay = due.slice(0, 10);
  const chips = uniqueSortedDates(dueDay ? [...dates, dueDay] : dates);
  const canAdd = !disabled && canAddAdvanceReminder(dueDay, todayIso);

  if (!dueDay) {
    return <p className="text-[11px] text-muted">Set a due date to add reminders.</p>;
  }

  function add(value: string) {
    if (!isValidAdvanceReminder(value, dueDay, todayIso, chips) || disabled) return;
    onChange(uniqueSortedDates([...chips, value]));
  }

  function remove(value: string) {
    if (value === dueDay || disabled) return;
    onChange(uniqueSortedDates(chips.filter((d) => d !== value)));
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted">Reminders</span>
      {chips.map((day) => {
        const isDue = day === dueDay;
        return (
          <span
            key={day}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink",
              isDue && "bg-bg",
            )}
          >
            {isDue ? `On due date · ${day}` : day}
            {!isDue && (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove reminder ${day}`}
                onClick={() => remove(day)}
                className="text-muted hover:text-ink disabled:opacity-50"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
      {canAdd ? (
        <input
          type="date"
          min={todayIso}
          max={dueDay}
          aria-label="Add reminder date"
          disabled={disabled}
          onChange={(e) => {
            const value = e.target.value;
            if (value) add(value);
            e.target.value = "";
          }}
          className="h-7 rounded-md border border-line bg-surface px-1.5 text-[11px] text-ink"
        />
      ) : (
        <span className="text-[11px] text-muted">Advance reminders need a future due date.</span>
      )}
    </div>
  );
}
