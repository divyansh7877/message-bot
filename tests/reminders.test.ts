import { describe, expect, test } from "bun:test";
import { AppDatabase } from "../src/db";
import { ReminderPlanner } from "../src/reminders";

describe("ReminderPlanner", () => {
  test("deduplicates reminder jobs by event identifier and offset", () => {
    const db = new AppDatabase(":memory:");
    db.init();
    db.upsertCalendarEvents([
      {
        eventIdentifier: "evt-1",
        title: "Meeting",
        startsAt: "2026-03-19T20:00:00Z",
        endsAt: "2026-03-19T21:00:00Z",
        location: null,
        attendees: [],
        notes: null,
      },
    ]);

    const planner = new ReminderPlanner(db, {
      geminiApiKey: "",
      geminiModel: "gemini-2.5-flash",
      selfRecipient: "+15551234567",
      selfChatId: null,
      dbPath: ":memory:",
      initialMessageLimit: 10,
      messagePollIntervalMs: 3000,
      digestHourLocal: 20,
      eventReminderMinutesBefore: 60,
      timezone: "America/Los_Angeles",
      enabledChatAllowlist: new Set(),
      groupChatAllowlist: new Set(),
      calendarHelperPath: "/tmp/calendar-helper",
    });

    planner.plan(new Date("2026-03-19T18:00:00Z"));
    planner.plan(new Date("2026-03-19T18:05:00Z"));

    const jobs = db.listDueJobs(new Date("2026-03-19T19:01:00Z"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.dedupeKey).toBe("evt-1:60");
  });
});
