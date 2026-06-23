/** Shared SWR options — import per hook; global defaults are conservative. */

export const SWR_STATIC = {
  refreshInterval: 0,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60_000,
  keepPreviousData: true,
} as const;

/** Settings, profile — load once per mount unless mutated. */
export const SWR_SETTINGS = SWR_STATIC;

/** Dashboard header stats — pilot badge, open count. */
export const SWR_DASHBOARD_STATS = {
  ...SWR_STATIC,
  refreshInterval: 60_000,
} as const;

/** Main dashboard cards — positions, P&L summary. */
export const SWR_DASHBOARD_PAGE = {
  ...SWR_STATIC,
  refreshInterval: 45_000,
} as const;

/** Analysis list — cron-driven, no need for aggressive polling. */
export const SWR_ANALYSIS_LIST = {
  ...SWR_STATIC,
  refreshInterval: 120_000,
} as const;

/** Open positions — moderate when pilot may trade. */
export const SWR_OPEN_TRADES = {
  ...SWR_STATIC,
  refreshInterval: 30_000,
} as const;
