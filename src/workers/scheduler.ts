import cron from "node-cron";
import { runAnalysisCron } from "./analysisCron";
import { runPositionCron } from "./positionCron";

const g = global as any;

export function startSchedulers() {
  if (g.__NEXUS_SCHED__) return g.__NEXUS_SCHED__;
  const analysis = cron.schedule(
    "*/15 * * * *",
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
