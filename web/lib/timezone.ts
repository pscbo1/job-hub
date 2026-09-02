/** Display timezone. Default Asia/Shanghai; override with NEXT_PUBLIC_APP_TZ. */

export const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TZ?.trim() ||
  process.env.NEXT_PUBLIC_TIMEZONE?.trim() ||
  "Asia/Shanghai";

export function todayInAppTz(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Format a calendar date (YYYY-MM-DD) without shifting the day across zones. */
export function formatCalendarDate(value: string): string {
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value || "—";
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  return utc.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTimeInAppTz(value: string): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return formatCalendarDate(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
