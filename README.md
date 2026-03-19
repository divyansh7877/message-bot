# Personal iMessage Assistant

Mac-local assistant that watches selected iMessage chats, extracts follow-ups and plans with Gemini, sends a daily digest at 8:00 PM, and sends event reminders before Apple Calendar events.

## Stack

- Bun + TypeScript daemon
- `@photon-ai/imessage-kit` for iMessage reads/writes
- SQLite via `bun:sqlite`
- Gemini API over `fetch`
- Swift `EventKit` sidecar for Apple Calendar

## What is implemented

- iMessage watcher and backfill flow
- SQLite schema and repositories
- Per-chat rolling memory and action items
- Gemini JSON extraction pipeline
- Calendar sync through a Swift helper CLI
- DB-backed scheduled jobs for daily digests and event reminders
- CLI commands for daemon start, backfill, digest, calendar sync, and chat analysis
- Unit tests for merge logic, digest suppression, and reminder dedupe

## Setup

1. Install dependencies:

```bash
bun install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Grant Full Disk Access to the terminal or IDE that will run this app.

4. Build the Swift calendar helper:

```bash
cd calendar-helper
swift build -c release
cd ..
```

5. Start the daemon:

```bash
bun run start
```

## CLI

```bash
bun run src/cli.ts start
bun run src/cli.ts backfill --hours 24
bun run src/cli.ts run-digest-now
bun run src/cli.ts sync-calendar
bun run src/cli.ts analyze-chat --chat-id iMessage;+15551234567
```

## Launchd

An example plist is included at [launchd/com.messagebot.assistant.plist](/Users/divagarwal/Projects/message-bot/launchd/com.messagebot.assistant.plist). Update the paths before loading it:

```bash
launchctl load ~/Library/LaunchAgents/com.messagebot.assistant.plist
```

## Swift helper

The helper source is in [calendar-helper/Sources/calendar-helper/main.swift](/Users/divagarwal/Projects/message-bot/calendar-helper/Sources/calendar-helper/main.swift). It supports:

```bash
./calendar-helper/.build/release/calendar-helper permissions
./calendar-helper/.build/release/calendar-helper list --from 2026-03-19T00:00:00Z --to 2026-03-20T00:00:00Z
```

## Notes

- This is intentionally local-first. Raw message content stays in SQLite on the Mac.
- Convex is not wired in as the primary database.
- Group event-to-chat linking is not attempted in v1.
