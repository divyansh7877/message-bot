import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { CalendarEvent } from "./types";

export class CalendarHelperClient {
  constructor(private readonly helperPath: string) {}

  async listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    if (!existsSync(this.helperPath)) {
      throw new Error(`Calendar helper not found at ${this.helperPath}`);
    }

    const output = await runCommand(this.helperPath, ["list", "--from", fromIso, "--to", toIso]);
    const parsed = JSON.parse(output) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Calendar helper returned invalid JSON.");
    }

    return parsed.map((item) => validateCalendarEvent(item));
  }

  async requestPermissions(): Promise<string> {
    if (!existsSync(this.helperPath)) {
      throw new Error(`Calendar helper not found at ${this.helperPath}`);
    }

    return runCommand(this.helperPath, ["permissions"]);
  }
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `Command exited with code ${code}`));
    });
  });
}

function validateCalendarEvent(value: unknown): CalendarEvent {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid calendar event.");
  }

  const record = value as Record<string, unknown>;
  return {
    eventIdentifier: ensureString(record.eventIdentifier, "eventIdentifier"),
    title: ensureString(record.title, "title"),
    startsAt: ensureString(record.startsAt, "startsAt"),
    endsAt: record.endsAt == null ? null : ensureString(record.endsAt, "endsAt"),
    location: record.location == null ? null : ensureString(record.location, "location"),
    notes: record.notes == null ? null : ensureString(record.notes, "notes"),
    attendees: Array.isArray(record.attendees)
      ? record.attendees.map((attendee) => {
          if (!attendee || typeof attendee !== "object") {
            throw new Error("Invalid attendee.");
          }
          const attendeeRecord = attendee as Record<string, unknown>;
          return {
            name: attendeeRecord.name == null ? null : ensureString(attendeeRecord.name, "attendee.name"),
            email: attendeeRecord.email == null ? null : ensureString(attendeeRecord.email, "attendee.email"),
            phone: attendeeRecord.phone == null ? null : ensureString(attendeeRecord.phone, "attendee.phone"),
          };
        })
      : [],
  };
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}
