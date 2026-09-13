/**
 * Long-running queue worker.
 *
 * Run alongside the web app on a VPS or in Docker:  npm run worker
 * On serverless (Vercel), use the /api/cron/drain route on a 1-minute cron
 * instead — both call the same drainOnce().
 */
import { randomUUID } from "node:crypto";
import { pool } from "../src/lib/db";
import { env } from "../src/lib/env";
import { drainOnce, recoverStale } from "../src/lib/sender";

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
let running = true;

async function main() {
  console.log(`[${workerId}] starting`);
  console.log(`[${workerId}] mode: ${env.mock ? "MOCK (no messages leave this machine)" : "LIVE"}`);
  console.log(`[${workerId}] rate: ${env.workerRatePerSecond}/s, batch: ${env.workerBatchSize}`);

  const reclaimed = await recoverStale();
  if (reclaimed > 0) console.log(`[${workerId}] reclaimed ${reclaimed} stale message(s)`);

  let sinceRecovery = 0;

  while (running) {
    try {
      const result = await drainOnce({ workerId });
      if (result.claimed > 0) {
        console.log(
          `[${workerId}] claimed=${result.claimed} sent=${result.sent} ` +
            `retrying=${result.retrying} failed=${result.failed}`,
        );
      }
      // Nothing to do? wait before asking again.
      if (result.claimed === 0) await sleep(env.workerPollMs);
    } catch (error) {
      console.error(`[${workerId}] drain failed:`, error);
      await sleep(Math.max(env.workerPollMs, 5000));
    }

    sinceRecovery += 1;
    if (sinceRecovery >= 60) {
      sinceRecovery = 0;
      await recoverStale().catch(() => 0);
    }
  }

  await pool.end();
  console.log(`[${workerId}] stopped`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (!running) process.exit(1); // second signal: give up waiting
    console.log(`\n[${workerId}] ${signal} received, finishing current batch...`);
    running = false;
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
