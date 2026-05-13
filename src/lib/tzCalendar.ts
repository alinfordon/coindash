import { startOfDayInTz } from "@/lib/utils";

/** Calendar fields for `instant` interpreted in `timeZone` (locale fixed to en-US). */
export function calendarPartsInTz(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    year: +get("year"),
    month: +get("month"),
    day: +get("day"),
    weekdayShort: get("weekday"),
  };
}

/** Ordinal days on Gregorian proleptic calendar (used for TZ-neutral day arithmetic). */
export function gregorianOrdinal(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function gregorianFromOrdinal(ordinal: number): { year: number; month: number; day: number } {
  const a = ordinal + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = d + 100 * b + Math.floor(m / 10) - 4800;
  return { year, month, day };
}

function weekdayMon0Sun6(short: string): number {
  const k = short.slice(0, 3);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[k] ?? 0;
}

/**
 * Midnight 00:00 wall-clock on (year-month-day) in `timeZone`, returned as UTC Date instant.
 */
export function midnightWallCalendarInTz(year: number, month: number, day: number, timeZone: string): Date {
  let guessMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  for (let i = 0; i < 28; i++) {
    const guess = new Date(guessMs);
    const sod = startOfDayInTz(guess, timeZone);
    const p = calendarPartsInTz(sod, timeZone);
    if (p.year === year && p.month === month && p.day === day) return sod;
    const delta = gregorianOrdinal(year, month, day) - gregorianOrdinal(p.year, p.month, p.day);
    guessMs += delta * 86400000;
  }
  return startOfDayInTz(new Date(guessMs), timeZone);
}

export function startOfCalendarMonthInTz(now: Date, timeZone: string): Date {
  const { year, month } = calendarPartsInTz(now, timeZone);
  return midnightWallCalendarInTz(year, month, 1, timeZone);
}

export function startOfCalendarYearInTz(now: Date, timeZone: string): Date {
  const { year } = calendarPartsInTz(now, timeZone);
  return midnightWallCalendarInTz(year, 1, 1, timeZone);
}

/** ISO-style week: Monday 00:00 through Sunday in `timeZone`. */
export function startOfIsoWeekMondayInTz(now: Date, timeZone: string): Date {
  const { year, month, day, weekdayShort } = calendarPartsInTz(now, timeZone);
  const wd = weekdayMon0Sun6(weekdayShort);
  const ordMon = gregorianOrdinal(year, month, day) - wd;
  const { year: y, month: m, day: d } = gregorianFromOrdinal(ordMon);
  return midnightWallCalendarInTz(y, m, d, timeZone);
}

export function startOfNextCalendarMonthInTz(now: Date, timeZone: string): Date {
  const { year, month } = calendarPartsInTz(now, timeZone);
  if (month === 12) return midnightWallCalendarInTz(year + 1, 1, 1, timeZone);
  return midnightWallCalendarInTz(year, month + 1, 1, timeZone);
}

export function startOfNextCalendarYearInTz(now: Date, timeZone: string): Date {
  const { year } = calendarPartsInTz(now, timeZone);
  return midnightWallCalendarInTz(year + 1, 1, 1, timeZone);
}

/** Seven calendar days after `weekMondayStart` (next Monday 00:00). */
export function addSevenDaysWallMonday(weekMondayStart: Date, timeZone: string): Date {
  const { year, month, day } = calendarPartsInTz(weekMondayStart, timeZone);
  const ord = gregorianOrdinal(year, month, day) + 7;
  const { year: y, month: m, day: d } = gregorianFromOrdinal(ord);
  return midnightWallCalendarInTz(y, m, d, timeZone);
}
