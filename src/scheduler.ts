import type { AppConfig } from "./config";
import type { AppDatabase } from "./db";
import { addMinutes, digestRunCandidates, localDateKey } from "./lib/time";

export class Scheduler {
  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
  ) {}

  ensureDailyDigestJob(now = new Date()): void {
    const candidates = digestRunCandidates(this.config.digestHourLocal, this.config.timezone, now);
    const runDate =
      now.getTime() <= new Date(addMinutes(candidates.today.toISOString(), 120)).getTime()
        ? candidates.today
        : candidates.tomorrow;
    const runAt = runDate.toISOString();
    const dateKey = localDateKey(this.config.timezone, runDate);
    this.db.enqueueJob("daily_digest", `daily-digest:${dateKey}`, runAt, {
      scheduledFor: runAt,
    });
  }
}
