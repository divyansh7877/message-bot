import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  selfRecipient: string | null;
  selfChatId: string | null;
  dbPath: string;
  initialMessageLimit: number;
  messagePollIntervalMs: number;
  digestHourLocal: number;
  eventReminderMinutesBefore: number;
  timezone: string;
  enabledChatAllowlist: Set<string>;
  groupChatAllowlist: Set<string>;
  calendarHelperPath: string;
}

function parseList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env = process.env): AppConfig {
  const geminiApiKey = env.GEMINI_API_KEY ?? "";
  const geminiModel = env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const selfRecipient = env.SELF_RECIPIENT ?? null;
  const selfChatId = env.SELF_CHAT_ID ?? null;
  const dbPath = resolve(env.DB_PATH ?? "./data/assistant.sqlite");
  const calendarHelperPath = resolve(
    env.CALENDAR_HELPER_PATH ?? "./calendar-helper/.build/release/calendar-helper",
  );
  const timezone = env.TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!selfRecipient && !selfChatId) {
    throw new Error("Set SELF_RECIPIENT or SELF_CHAT_ID in the environment.");
  }

  mkdirSync(dirname(dbPath), { recursive: true });

  return {
    geminiApiKey,
    geminiModel,
    selfRecipient,
    selfChatId,
    dbPath,
    initialMessageLimit: parseNumber(env.INITIAL_MESSAGE_LIMIT, 10),
    messagePollIntervalMs: parseNumber(env.MESSAGE_POLL_INTERVAL_MS, 3000),
    digestHourLocal: parseNumber(env.DIGEST_HOUR_LOCAL, 20),
    eventReminderMinutesBefore: parseNumber(env.EVENT_REMINDER_MINUTES_BEFORE, 60),
    timezone,
    enabledChatAllowlist: parseList(env.ENABLED_CHAT_ALLOWLIST),
    groupChatAllowlist: parseList(env.GROUP_CHAT_ALLOWLIST),
    calendarHelperPath,
  };
}
