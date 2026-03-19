import type { CalendarHelperClient } from "./calendar-helper";
import type { AppDatabase } from "./db";
import { addMinutes } from "./lib/time";

export class CalendarSyncService {
  constructor(
    private readonly db: AppDatabase,
    private readonly helper: CalendarHelperClient,
  ) {}

  async sync(now = new Date()): Promise<void> {
    const fromIso = now.toISOString();
    const toIso = addMinutes(fromIso, 60 * 24 * 7);
    const events = await this.helper.listEvents(fromIso, toIso);
    this.db.upsertCalendarEvents(events);
  }
}
