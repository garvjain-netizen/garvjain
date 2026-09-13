import { env } from "./env";
import { claimBatch, markSent, releaseStale, scheduleRetry } from "./queue";
import { sendTemplateMessage } from "./whatsapp";

export interface DrainOptions {
  workerId?: string;
  batchSize?: number;
  /** Messages per second. Pacing protects the number's quality rating. */
  ratePerSecond?: number;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  mocked: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one batch of due messages.
 *
 * Used by both the long-running worker and the /api/cron/drain route, so a
 * VPS deployment and a serverless one behave identically.
 */
export async function drainOnce(options: DrainOptions = {}): Promise<DrainResult> {
  const workerId = options.workerId ?? `drain-${process.pid}`;
  const batchSize = options.batchSize ?? env.workerBatchSize;
  const ratePerSecond = Math.max(1, options.ratePerSecond ?? env.workerRatePerSecond);
  const gapMs = Math.floor(1000 / ratePerSecond);

  const batch = await claimBatch(workerId, batchSize);
  const result: DrainResult = {
    claimed: batch.length,
    sent: 0,
    retrying: 0,
    failed: 0,
    mocked: env.mock,
  };

  for (const [index, message] of batch.entries()) {
    if (index > 0 && gapMs > 0) await sleep(gapMs);

    const outcome = await sendTemplateMessage({
      to: message.to_phone,
      templateName: message.template_name,
      language: message.template_language,
      bodyParameters: message.variables,
    });

    if (outcome.ok) {
      await markSent(message.id, outcome.waMessageId);
      result.sent += 1;
      continue;
    }

    const error = { code: outcome.code, title: outcome.title, detail: outcome.detail };
    if (outcome.retryable) {
      const decision = await scheduleRetry(message, error);
      if (decision === "retrying") result.retrying += 1;
      else result.failed += 1;
    } else {
      // A permanent error will fail identically on retry, so surface it now
      // instead of spending the attempt budget rediscovering it.
      const { markFailed } = await import("./queue");
      await markFailed(message.id, error);
      result.failed += 1;
    }
  }

  return result;
}

/** Reclaims messages stranded in 'sending' by a crashed worker. */
export async function recoverStale(): Promise<number> {
  return releaseStale();
}
