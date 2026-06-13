// Standalone worker process that runs the cron schedulers independently of Next.js.
// Usage: `npm run worker` (requires .env.local to be populated).

import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Use tsx/swc-like transpilation via ts-node if available, otherwise fall back.
// For simplicity, we invoke the compiled Next build's server runtime by dynamic import.
// In development we recommend running `npm run dev` (the server route triggers workers on demand).

async function main() {
  console.log("[nexus worker] starting...");
  try {
    // Preload env from .env.local if not already provided
    await import("./_env.mjs");
  } catch {}
  const { startSchedulers } = await import("../.next/server/chunks/worker-runtime.js").catch(async () => {
    // Fallback: boot a minimal loop and hit our own API.
    const base = process.env.NEXT_WORKER_BASE_URL || "http://localhost:3000";
    const hit = async (path) => {
      try {
        const r = await fetch(`${base}${path}`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (j?.skipped) {
          console.log(`[worker] ${path} → skipped: ${j.reason || "disabled"}`);
        } else {
          console.log(`[worker] ${path} → ${r.status}`);
        }
      } catch (e) {
        console.error(`[worker] ${path} error:`, e.message);
      }
    };
    // 5-min positions — never adds ?force=1, so the AI Pilot/per-cron
    // toggles in Settings are honored.
    setInterval(() => hit("/api/cron/positions"), 5 * 60 * 1000);
    // 2h analysis — same: respects pilotActive + analysisCronActive.
    setInterval(() => hit("/api/cron/analysis"), 2 * 60 * 60 * 1000);
    return { startSchedulers: () => console.log("[nexus worker] fallback HTTP loop started") };
  });
  startSchedulers?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
