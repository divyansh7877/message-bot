#!/usr/bin/env bun
import { loadConfig } from "./config";
import { AssistantApp } from "./app";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";
  const config = loadConfig();
  const app = new AssistantApp(config);

  try {
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
    await app.close();
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
  console.error(error);
  process.exitCode = 1;
});
