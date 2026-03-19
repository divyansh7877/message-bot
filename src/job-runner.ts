import type { Notifier } from "./notifier";
import type { AppDatabase } from "./db";
import type { DigestBuilder } from "./digest";
import type { ReminderPlanner } from "./reminders";
import { withinHours } from "./lib/time";

export class JobRunner {
  constructor(
    private readonly db: AppDatabase,
    private readonly notifier: Notifier,
    private readonly digestBuilder: DigestBuilder,
    private readonly reminderPlanner: ReminderPlanner,
  ) {}

  async runDueJobs(now = new Date()): Promise<void> {
    const dueJobs = this.db.listDueJobs(now);

    for (const job of dueJobs) {
      if (!withinHours(job.runAt, 2, now)) {
        this.db.markJobSkipped(job.id, "Missed by more than 2 hours.");
        continue;
      }

      try {
        if (job.jobType === "daily_digest") {
          const digest = this.digestBuilder.build(now);
          if (!digest) {
            this.db.markJobSkipped(job.id, "Nothing to send.");
            continue;
          }

          await this.notifier.sendToSelf(digest);
          this.db.markJobSent(job.id);
          continue;
        }

        if (job.jobType === "event_reminder") {
          const payload = JSON.parse(job.payloadJson) as {
            eventIdentifier: string;
          };
          const event = this.db
            .listFutureCalendarEvents(new Date(0).toISOString())
            .find((item) => item.eventIdentifier === payload.eventIdentifier);

          if (!event) {
            this.db.markJobSkipped(job.id, "Event no longer exists.");
            continue;
          }

          await this.notifier.sendToSelf(this.reminderPlanner.buildReminderMessage(event));
          this.db.markJobSent(job.id);
        }
      } catch (error) {
        this.db.markJobFailed(job.id, toErrorMessage(error));
      }
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
