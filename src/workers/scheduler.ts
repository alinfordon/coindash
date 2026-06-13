import cron from "node-cron";
import { runAnalysisCron } from "./analysisCron";
import { runPositionCron } from "./positionCron";
import { ANALYSIS_CRON_INTERVAL_MINUTES } from "@/lib/analysisSchedule";

const g = global as any;

export function startSchedulers() {
  if (g.__NEXUS_SCHED__) return g.__NEXUS_SCHED__;
  const analysisCronExpr =
    ANALYSIS_CRON_INTERVAL_MINUTES >= 60 && ANALYSIS_CRON_INTERVAL_MINUTES % 60 === 0
      ? `0 */${ANALYSIS_CRON_INTERVAL_MINUTES / 60} * * *`
      : `*/${ANALYSIS_CRON_INTERVAL_MINUTES} * * * *`;

  const analysis = cron.schedule(
    analysisCronExpr,
    async () => {
      try {
        await runAnalysisCron();
      } catch (e) {
        console.error("analysisCron error", e);
      }
    },
    { scheduled: true }
  );

  const positions = cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runPositionCron();
      } catch (e) {
        console.error("positionCron error", e);
      }
    },
    { scheduled: true }
  );

  g.__NEXUS_SCHED__ = { analysis, positions, startedAt: new Date() };
  console.log("[nexus] cron schedulers started");
  return g.__NEXUS_SCHED__;
}
