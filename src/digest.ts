import type { AppDatabase } from "./db";
import { tomorrowRange } from "./lib/time";

export class DigestBuilder {
  constructor(
    private readonly db: AppDatabase,
    private readonly timezone: string,
  ) {}

  build(now = new Date()): string | null {
    const openItems = this.db.getOpenActionItemsForDigest();
    const { start, end } = tomorrowRange(this.timezone, now);
    const tomorrowEvents = this.db.listCalendarEventsBetween(start.toISOString(), end.toISOString());

    const followups = openItems.filter((item) => item.kind === "followup" && item.owner === "me");
    const unresolved = openItems.filter((item) => item.kind !== "followup");

    if (followups.length === 0 && unresolved.length === 0 && tomorrowEvents.length === 0) {
      return null;
    }

    const lines: string[] = ["Daily summary"];

    if (followups.length > 0) {
      lines.push("", "Follow-ups:");
      for (const item of followups.slice(0, 10)) {
        lines.push(`- ${item.title}`);
      }
    }

    if (unresolved.length > 0) {
      lines.push("", "Open threads:");
      for (const item of unresolved.slice(0, 10)) {
        lines.push(`- ${item.title}`);
      }
    }

    if (tomorrowEvents.length > 0) {
      lines.push("", "Tomorrow:");
      for (const event of tomorrowEvents.slice(0, 10)) {
        const when = new Date(event.startsAt).toLocaleString("en-US", {
          timeZone: this.timezone,
          hour: "numeric",
          minute: "2-digit",
        });
        lines.push(`- ${when}: ${event.title}`);
      }
    }

    return lines.join("\n");
  }
}
