export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function minutesBefore(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function withinHours(iso: string, hours: number, now = new Date()): boolean {
  const deltaMs = now.getTime() - new Date(iso).getTime();
  return deltaMs <= hours * 60 * 60_000;
}

export function tomorrowRange(timezone: string, now = new Date()): { start: Date; end: Date } {
  const parts = getZonedParts(timezone, now);
  const todayMarker = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const tomorrowMarker = new Date(todayMarker);
  const dayAfterMarker = new Date(todayMarker);
  tomorrowMarker.setUTCDate(tomorrowMarker.getUTCDate() + 1);
  dayAfterMarker.setUTCDate(dayAfterMarker.getUTCDate() + 2);

  return {
    start: zonedDate(timezone, {
      year: tomorrowMarker.getUTCFullYear(),
      month: tomorrowMarker.getUTCMonth() + 1,
      day: tomorrowMarker.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    }),
    end: zonedDate(timezone, {
      year: dayAfterMarker.getUTCFullYear(),
      month: dayAfterMarker.getUTCMonth() + 1,
      day: dayAfterMarker.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    }),
  };
}

export function digestRunCandidates(
  hourLocal: number,
  timezone: string,
  now = new Date(),
): { today: Date; tomorrow: Date } {
  const parts = getZonedParts(timezone, now);
  const todayMarker = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const tomorrowMarker = new Date(todayMarker);
  tomorrowMarker.setUTCDate(tomorrowMarker.getUTCDate() + 1);

  return {
    today: zonedDate(timezone, {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: hourLocal,
      minute: 0,
      second: 0,
    }),
    tomorrow: zonedDate(timezone, {
      year: tomorrowMarker.getUTCFullYear(),
      month: tomorrowMarker.getUTCMonth() + 1,
      day: tomorrowMarker.getUTCDate(),
      hour: hourLocal,
      minute: 0,
      second: 0,
    }),
  };
}

export function localDateKey(timezone: string, date: Date): string {
  const parts = getZonedParts(timezone, date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localOffsetMinutes(timezone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function getZonedParts(
  timezone: string,
  date: Date,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zonedDate(
  timezone: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
): Date {
  const guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const offsetMinutes = localOffsetMinutes(timezone, guess);
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
      offsetMinutes * 60_000,
  );
}
