export type QboSyncMode = "manual" | "automatic" | "once" | "recurring";
export type QboFrequency = "daily" | "weekly" | "monthly";

export type QboSchedule = {
  frequency?: QboFrequency;
  time?: string;
  weekday?: number;
  dayOfMonth?: number;
  timezone?: string;
  onceAt?: string;
  completedAt?: string;
};

export const AUTOMATIC_INTERVAL_MS = 15 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function timeValue(value: string | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  return match ? `${match[1]}:${match[2]}` : "06:00";
}

export function zoneParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const observed = zoneParts(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0);
  let result = new Date(utcGuess - (asUtc - utcGuess));
  const check = zoneParts(result, timeZone);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) {
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const seen = Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, 0);
    result = new Date(result.getTime() + (target - seen));
  }
  return result;
}

function addCivilDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function nextRecurringRun(schedule: QboSchedule, after = new Date()) {
  const timeZone = schedule.timezone && isTimeZone(schedule.timezone) ? schedule.timezone : "America/Denver";
  const [hour, minute] = timeValue(schedule.time).split(":").map(Number);
  const frequency = schedule.frequency || "daily";
  const weekday = Number.isInteger(schedule.weekday) ? Number(schedule.weekday) : 1;
  const dayOfMonth = schedule.dayOfMonth && schedule.dayOfMonth >= 1 && schedule.dayOfMonth <= 28 ? schedule.dayOfMonth : 1;
  const today = zoneParts(after, timeZone);
  let cursor = { year: today.year, month: today.month, day: today.day };
  for (let i = 0; i < 400; i += 1) {
    const civilWeekday = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay();
    const matches = frequency === "daily"
      || (frequency === "weekly" && civilWeekday === weekday)
      || (frequency === "monthly" && cursor.day === dayOfMonth);
    if (matches) {
      const instant = zonedTimeToUtc(cursor.year, cursor.month, cursor.day, hour, minute, timeZone);
      if (instant.getTime() > after.getTime()) return instant;
    }
    cursor = addCivilDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return new Date(after.getTime() + 24 * 60 * 60 * 1000);
}

export function onceRunAt(onceAt: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(onceAt);
  if (!match) return null;
  const zone = isTimeZone(timeZone) ? timeZone : "America/Denver";
  return zonedTimeToUtc(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), zone);
}

export function normalizeSettings(input: { syncMode?: unknown; schedule?: unknown }, now = new Date()) {
  const syncMode = String(input.syncMode || "manual") as QboSyncMode;
  if (!["manual", "automatic", "once", "recurring"].includes(syncMode)) return { error: "Choose manual, automatic, one time, or recurring." };
  const raw = input.schedule && typeof input.schedule === "object" ? input.schedule as QboSchedule : {};
  const timezone = typeof raw.timezone === "string" && isTimeZone(raw.timezone) ? raw.timezone : "America/Denver";
  const schedule: QboSchedule = {
    frequency: raw.frequency === "weekly" || raw.frequency === "monthly" ? raw.frequency : "daily",
    time: timeValue(typeof raw.time === "string" ? raw.time : undefined),
    weekday: Number.isInteger(Number(raw.weekday)) ? Math.min(6, Math.max(0, Number(raw.weekday))) : 1,
    dayOfMonth: Number.isInteger(Number(raw.dayOfMonth)) ? Math.min(28, Math.max(1, Number(raw.dayOfMonth))) : 1,
    timezone,
    onceAt: typeof raw.onceAt === "string" ? raw.onceAt : "",
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : "",
  };
  if (syncMode === "manual") return { syncMode, schedule, nextRunAt: null as string | null };
  if (syncMode === "automatic") return { syncMode, schedule, nextRunAt: now.toISOString() };
  if (syncMode === "once") {
    const at = onceRunAt(schedule.onceAt || "", timezone);
    if (!at) return { error: "Choose the date and time for the one-time sync." };
    if (at.getTime() <= now.getTime()) return { error: "Choose a future time for the one-time sync." };
    schedule.completedAt = "";
    return { syncMode, schedule, nextRunAt: at.toISOString() };
  }
  schedule.completedAt = "";
  return { syncMode, schedule, nextRunAt: nextRecurringRun(schedule, now).toISOString() };
}

export function isSyncDue(input: { status: string; syncMode: string; nextRunAt: string | null }, now = Date.now()) {
  if (input.status !== "connected" || input.syncMode === "manual") return false;
  if (!input.nextRunAt) return input.syncMode === "automatic";
  const at = Date.parse(input.nextRunAt);
  return Number.isFinite(at) && at <= now;
}
