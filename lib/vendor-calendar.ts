export type CalendarBusyBlock = { start: string; end: string };

export type CalendarConnection = {
  provider?: string | null;
  status?: string | null;
  connected_at?: string | null;
  metadata?: { busyBlocks?: CalendarBusyBlock[] } | null;
};

export function isCalendarConnected(connection?: CalendarConnection | null) {
  return connection?.status === "connected";
}

export function hasOpenCalendarSlot(
  connection: CalendarConnection | null | undefined,
  neededBy: string | Date | null | undefined,
  durationHours = 2,
) {
  if (!isCalendarConnected(connection) || !neededBy) return false;
  const start = new Date(neededBy).getTime();
  if (!Number.isFinite(start)) return false;
  const end = start + Math.max(1, durationHours) * 60 * 60 * 1000;
  const blocks = connection?.metadata?.busyBlocks ?? [];
  return !blocks.some((block) => {
    const busyStart = new Date(block.start).getTime();
    const busyEnd = new Date(block.end).getTime();
    return Number.isFinite(busyStart) && Number.isFinite(busyEnd) && busyStart < end && busyEnd > start;
  });
}
