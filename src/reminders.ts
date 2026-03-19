import type { AppConfig } from "./config";
import type { AppDatabase } from "./db";
import { normalizePersonIdentifier } from "./lib/normalize";
import { minutesBefore } from "./lib/time";
import type { CalendarEventRecord, ChatRecord } from "./types";

export class ReminderPlanner {
  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
  ) {}

  plan(now = new Date()): void {
    const events = this.db.listFutureCalendarEvents(now.toISOString());

    for (const event of events) {
      const reminderAt = minutesBefore(event.startsAt, this.config.eventReminderMinutesBefore);
      if (new Date(reminderAt).getTime() <= now.getTime()) {
        continue;
      }

      this.db.enqueueJob(
        "event_reminder",
        `${event.eventIdentifier}:${this.config.eventReminderMinutesBefore}`,
        reminderAt,
        {
          eventIdentifier: event.eventIdentifier,
          reminderOffsetMinutes: this.config.eventReminderMinutesBefore,
        },
      );
    }
  }

  buildReminderMessage(event: CalendarEventRecord): string {
    const linkedChat = findLinkedChat(this.db, event);
    const lines = [
      `Reminder: ${event.title}`,
      `Starts in ${this.config.eventReminderMinutesBefore} minutes.`,
    ];

    if (event.location) {
      lines.push(`Location: ${event.location}`);
    }

    if (linkedChat) {
      const memory = this.db.getChatMemory(linkedChat.chatId);
      const nextAction = memory?.nextExpectedAction;
      if (nextAction) {
        lines.push(`Prep: ${nextAction}`);
      }
    }

    return lines.join("\n");
  }
}

function findLinkedChat(db: AppDatabase, event: CalendarEventRecord): ChatRecord | null {
  const attendees = JSON.parse(event.attendeesJson) as Array<{
    name: string | null;
    email: string | null;
    phone: string | null;
  }>;

  for (const attendee of attendees) {
    const identifiers = [attendee.phone, attendee.email, attendee.name]
      .map((value) => normalizePersonIdentifier(value))
      .filter((value): value is string => Boolean(value));

    for (const identifier of identifiers) {
      const match = db.findChatByParticipantIdentifier(identifier);
      if (match) {
        return match;
      }
    }
  }

  return null;
}
