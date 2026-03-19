# Personal iMessage Assistant

A Mac-local assistant that watches selected iMessage chats, extracts follow-ups and plans with Gemini, stores compact per-chat memory in SQLite, sends a daily summary at 8:00 PM, and sends reminder texts before Apple Calendar events.

## Purpose

This project is designed for one user on one Mac.

It continuously reads selected direct and group chats, keeps a small rolling memory for each chat, and turns message activity into:

- follow-ups you still owe
- unresolved questions and decisions
- lightweight plan summaries
- reminder texts for upcoming events
- one end-of-day digest

The intent is to make iMessage a passive capture layer for personal task tracking without moving the full system to the cloud.

## How it works

1. `@photon-ai/imessage-kit` watches iMessage and backfills message history.
2. New messages are normalized and stored in local SQLite.
3. Gemini receives only the recent message delta plus the compact chat memory.
4. Gemini returns structured JSON for plans, follow-ups, questions, and completed items.
5. The app merges that output into local chat memory and open action items.
6. A local scheduler sends:
   - a daily digest at `8:00 PM`
   - event reminders `60 minutes` before Apple Calendar events

## Stack

- Bun + TypeScript daemon
- `@photon-ai/imessage-kit` for iMessage reads and sends
- SQLite via `bun:sqlite`
- Gemini API via `fetch`
- Swift `EventKit` helper for Apple Calendar access
- `launchd` for keeping the daemon alive on macOS

## Current features

- real-time iMessage watching for direct and group chats
- backfill of recent message history
- per-chat memory and action-item storage
- Gemini-based structured extraction
- calendar sync through a Swift helper CLI
- DB-backed daily digest and event reminder jobs
- CLI commands for local operation and debugging
- unit tests for state merge, digest suppression, and reminder dedupe

## Project layout

- `src/` contains the Bun daemon, database layer, analyzer, scheduler, and CLI
- `calendar-helper/` contains the Swift `EventKit` helper
- `launchd/` contains a sample LaunchAgent plist
- `tests/` contains Bun unit tests

## Requirements

- macOS
- Bun
- Swift / Xcode Command Line Tools
- Full Disk Access for the terminal or IDE that runs the daemon
- a Gemini API key

## Setup

1. Install dependencies.

```bash
bun install
```

2. Copy the example environment file.

```bash
cp .env.example .env
```

3. Set at least these values in `.env`.

```bash
GEMINI_API_KEY=...
SELF_RECIPIENT=+15551234567
```

You can use `SELF_CHAT_ID` instead of `SELF_RECIPIENT` if you want to target a specific chat directly.

4. Grant Full Disk Access to the terminal or IDE that will run the assistant.

5. Build the Swift calendar helper.

```bash
cd calendar-helper
swift build -c release
cd ..
```

6. Start the assistant.

```bash
bun run start
```

If startup fails with `authorization denied` when opening `~/Library/Messages/chat.db`, the app running Bun does not yet have Full Disk Access. Give Full Disk Access to the exact app you are using, fully quit and reopen it, then rerun `bun run start`.

## Configuration

The main environment variables are:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SELF_RECIPIENT` or `SELF_CHAT_ID`
- `DB_PATH`
- `MESSAGE_POLL_INTERVAL_MS`
- `DIGEST_HOUR_LOCAL`
- `EVENT_REMINDER_MINUTES_BEFORE`
- `TIMEZONE`
- `ENABLED_CHAT_ALLOWLIST`
- `GROUP_CHAT_ALLOWLIST`
- `CALENDAR_HELPER_PATH`

See `.env.example` for defaults.

## CLI

Start the daemon:

```bash
bun run start
```

Backfill the last 24 hours:

```bash
bun run backfill
```

Backfill a custom range:

```bash
bun run src/cli.ts backfill --hours 72
```

Send the digest immediately:

```bash
bun run run-digest-now
```

Refresh calendar events and schedule reminders:

```bash
bun run sync-calendar
```

Analyze one chat manually:

```bash
bun run src/cli.ts analyze-chat --chat-id iMessage;+15551234567
```

Request calendar permissions through the helper:

```bash
bun run src/cli.ts calendar-permissions
```

## Running with launchd

A sample LaunchAgent plist is included at `launchd/com.messagebot.assistant.plist`.

Update the hard-coded paths first, then copy it into `~/Library/LaunchAgents/` and load it:

```bash
cp launchd/com.messagebot.assistant.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.messagebot.assistant.plist
```

## Swift calendar helper

The helper supports:

```bash
./calendar-helper/.build/release/calendar-helper permissions
./calendar-helper/.build/release/calendar-helper list --from 2026-03-19T00:00:00Z --to 2026-03-20T00:00:00Z
```

## Development

Run tests:

```bash
bun test
```

Run the TypeScript check:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

## Troubleshooting

### `Failed to open database at ~/Library/Messages/chat.db: authorization denied`

This means macOS blocked the process from reading the Messages database.

Fix it by granting Full Disk Access to the exact app that launched Bun:

1. Open `System Settings > Privacy & Security > Full Disk Access`.
2. Add your terminal or IDE if it is not already listed.
3. Turn it on.
4. Fully quit and reopen that app.
5. Run `bun run start` again.

Common cases:

- Terminal
- iTerm
- Warp
- Cursor
- VS Code integrated terminal

Granting Full Disk Access to one terminal app does not automatically grant it to the others.

## Notes

- This is intentionally local-first. Raw message content stays on the Mac in SQLite.
- Convex is not used as the primary database in v1.
- Group event-to-chat linking is intentionally not implemented in v1.
- The Swift helper depends on a working local Xcode / Command Line Tools setup.
