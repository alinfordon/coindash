import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(n: number | null | undefined, min = 2, max = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const fractionDigits = abs >= 1 ? min : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: Math.max(fractionDigits, max),
  });
}

export function fmtNum(n: number | null | undefined, digits = 4) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtDuration(ms: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function classOfPnl(n: number) {
  if (n > 0) return "text-profit";
  if (n < 0) return "text-loss";
  return "text-text-muted";
}

/**
 * Returns the Date object for 00:00:00 *in the given IANA timezone* on the
 * day `now` falls in (within that timezone). Works regardless of the process's
 * local time — useful for consistent "today" windows across deployments.
 *
 * Example: in Europe/Bucharest (UTC+3 in summer), if `now` is 2026-04-24
 * 02:00:00 UTC (which is 05:00 local), returns a Date that equals
 * 2026-04-24T00:00:00 in Bucharest → 2026-04-23T21:00:00Z in UTC.
 */
export function startOfDayInTz(now: Date, timeZone: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => +parts.find((p) => p.type === t)!.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  let h = get("hour");
  if (h === 24) h = 0; // Intl occasionally emits "24" for midnight
  const mi = get("minute");
  const se = get("second");
  // Wall-clock at `now` in the target tz, expressed as a UTC instant.
  const wallAsUtcMs = Date.UTC(y, m - 1, d, h, mi, se);
  // tz offset (minutes east of UTC) at this moment:
  const offsetMs = wallAsUtcMs - now.getTime();
  // Midnight wall-clock on the same local day, expressed as UTC instant:
  const midnightWallAsUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(midnightWallAsUtcMs - offsetMs);
}
