#!/usr/bin/env bun
import { loadConfig } from "./config";
import { logInfo } from "./logger";
import { AssistantApp } from "./app";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";
  const config = loadConfig();
  let app: AssistantApp | null = null;

  try {
    logInfo("cli", "Command starting", { command });
    app = new AssistantApp(config);

    switch (command) {
      case "start":
        await app.start();
        await new Promise(() => {});
        break;
      case "backfill": {
        const hours = readOption("--hours") ?? "24";
        await app.ingestor.refreshChats();
        await app.ingestor.backfill(Number.parseInt(hours, 10));
        break;
      }
      case "run-digest-now": {
        const digest = app.digestBuilder.build();
        if (digest) {
          await app.notifier.sendToSelf(digest);
          console.log("Digest sent.");
        } else {
          console.log("Digest suppressed: nothing actionable.");
        }
        break;
      }
      case "sync-calendar":
        await app.calendarSync.sync();
        app.reminderPlanner.plan();
        console.log("Calendar synced.");
        break;
      case "analyze-chat": {
        const chatId = readOption("--chat-id");
        if (!chatId) {
          throw new Error("Missing --chat-id");
        }
        await app.analysisService.analyzeChat(chatId);
        console.log(`Analyzed chat ${chatId}`);
        break;
      }
      case "calendar-permissions":
        console.log(await app.calendarHelper.requestPermissions());
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    if (app) {
      await app.close();
    }
  }
}

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

main().catch((error) => {
  console.error(formatStartupError(error));
  process.exitCode = 1;
});

function formatStartupError(error: unknown): string {
  if (isMessagesDatabasePermissionError(error)) {
    return [
      "Cannot access the macOS Messages database.",
      "",
      "The process running Bun needs Full Disk Access to open:",
      "~/Library/Messages/chat.db",
      "",
      "Fix:",
      "1. Open System Settings > Privacy & Security > Full Disk Access.",
      "2. Add and enable the exact app you are using to run this command.",
      "   Examples: Terminal, iTerm, Warp, Cursor, VS Code.",
      "3. Fully quit and reopen that app.",
      "4. Run `bun run start` again.",
      "",
      "Original error:",
      error instanceof Error ? error.message : String(error),
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function isMessagesDatabasePermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "DATABASE" &&
    typeof record.message === "string" &&
    record.message.includes("/Library/Messages/chat.db") &&
    record.message.toLowerCase().includes("authorization denied")
  );
}
