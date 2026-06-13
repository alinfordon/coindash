/** Interval between analysis cron runs (matches worker + node-cron). */
export const ANALYSIS_CRON_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const ANALYSIS_CRON_INTERVAL_MINUTES = ANALYSIS_CRON_INTERVAL_MS / 60_000;

export function computeAnalysisSchedule(lastRunAt: Date | string | null, now = Date.now()) {
  if (!lastRunAt) {
    return {
      secsUntil: Math.floor(ANALYSIS_CRON_INTERVAL_MS / 1000),
      nextRunAt: new Date(now + ANALYSIS_CRON_INTERVAL_MS),
      overdue: false,
    };
  }
  const lastMs = new Date(lastRunAt).getTime();
  const nextRunAt = new Date(lastMs + ANALYSIS_CRON_INTERVAL_MS);
  const secsUntil = Math.max(0, Math.floor((nextRunAt.getTime() - now) / 1000));
  return {
    secsUntil,
    nextRunAt,
    overdue: nextRunAt.getTime() <= now,
  };
}

export function formatAnalysisCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
