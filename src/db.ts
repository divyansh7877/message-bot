import { Database } from "bun:sqlite";
import type {
  ActionItemCandidate,
  ActionItemRecord,
  AnalysisRunRecord,
  CalendarEvent,
  CalendarEventRecord,
  ChatMemoryRecord,
  ChatRecord,
  ChatType,
  CompletedItemCandidate,
  JobType,
  ScheduledJobRecord,
} from "./types";
import { normalizePersonIdentifier, normalizeTitle } from "./lib/normalize";
import { nowIso } from "./lib/time";

export class AppDatabase {
  readonly sqlite: Database;

  constructor(path: string) {
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
  }

  init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL UNIQUE,
        chat_type TEXT NOT NULL,
        title TEXT,
        participants_json TEXT NOT NULL DEFAULT '[]',
        last_message_at TEXT,
        last_analyzed_at TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_guid TEXT NOT NULL UNIQUE,
        chat_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        sender_name TEXT,
        text TEXT,
        sent_at TEXT NOT NULL,
        is_from_me INTEGER NOT NULL,
        raw_hash TEXT NOT NULL,
        processed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS chat_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL UNIQUE,
        summary TEXT,
        active_topics_json TEXT NOT NULL DEFAULT '[]',
        next_expected_action TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS action_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        owner TEXT NOT NULL,
        due_at TEXT,
        confidence REAL NOT NULL,
        source_message_guids_json TEXT NOT NULL DEFAULT '[]',
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_identifier TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT,
        location TEXT,
        attendees_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        last_synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        run_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TEXT
      );

      CREATE TABLE IF NOT EXISTS analysis_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        input_message_count INTEGER NOT NULL,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_processed ON messages (chat_id, processed_at, sent_at);
      CREATE INDEX IF NOT EXISTS idx_action_items_chat_status ON action_items (chat_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON scheduled_jobs (status, run_at);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON calendar_events (starts_at);
    `);
  }

  close(): void {
    this.sqlite.close();
  }

  upsertChat(input: {
    chatId: string;
    chatType: ChatType;
    title?: string | null;
    participants?: string[];
    lastMessageAt?: string | null;
    isEnabled?: boolean;
  }): void {
    this.sqlite
      .query(`
        INSERT INTO chats (chat_id, chat_type, title, participants_json, last_message_at, is_enabled)
        VALUES ($chatId, $chatType, $title, $participantsJson, $lastMessageAt, $isEnabled)
        ON CONFLICT(chat_id) DO UPDATE SET
          chat_type = excluded.chat_type,
          title = COALESCE(excluded.title, chats.title),
          participants_json = CASE
            WHEN excluded.participants_json = '[]' THEN chats.participants_json
            ELSE excluded.participants_json
          END,
          last_message_at = COALESCE(excluded.last_message_at, chats.last_message_at),
          is_enabled = excluded.is_enabled
      `)
      .run({
        $chatId: input.chatId,
        $chatType: input.chatType,
        $title: input.title ?? null,
        $participantsJson: JSON.stringify(input.participants ?? []),
        $lastMessageAt: input.lastMessageAt ?? null,
        $isEnabled: input.isEnabled === false ? 0 : 1,
      });

    this.sqlite
      .query(`
        INSERT INTO chat_memory (chat_id, summary, active_topics_json, next_expected_action, updated_at)
        VALUES ($chatId, NULL, '[]', NULL, $updatedAt)
        ON CONFLICT(chat_id) DO NOTHING
      `)
      .run({
        $chatId: input.chatId,
        $updatedAt: nowIso(),
      });
  }

  ingestMessage(input: {
    messageGuid: string;
    chatId: string;
    sender: string;
    senderName: string | null;
    text: string | null;
    sentAt: string;
    isFromMe: boolean;
    rawHash: string;
  }): boolean {
    const result = this.sqlite
      .query(`
        INSERT OR IGNORE INTO messages (
          message_guid, chat_id, sender, sender_name, text, sent_at, is_from_me, raw_hash
        ) VALUES (
          $messageGuid, $chatId, $sender, $senderName, $text, $sentAt, $isFromMe, $rawHash
        )
      `)
      .run({
        $messageGuid: input.messageGuid,
        $chatId: input.chatId,
        $sender: input.sender,
        $senderName: input.senderName,
        $text: input.text,
        $sentAt: input.sentAt,
        $isFromMe: input.isFromMe ? 1 : 0,
        $rawHash: input.rawHash,
      });

    if (result.changes > 0) {
      this.sqlite
        .query(`UPDATE chats SET last_message_at = $sentAt WHERE chat_id = $chatId`)
        .run({ $chatId: input.chatId, $sentAt: input.sentAt });
      return true;
    }

    return false;
  }

  getUnprocessedMessages(chatId: string): Array<{
    messageGuid: string;
    chatId: string;
    sender: string;
    senderName: string | null;
    text: string | null;
    sentAt: string;
  }> {
    return this.sqlite
      .query(`
        SELECT message_guid AS messageGuid,
               chat_id AS chatId,
               sender,
               sender_name AS senderName,
               text,
               sent_at AS sentAt
        FROM messages
        WHERE chat_id = $chatId AND processed_at IS NULL
        ORDER BY sent_at ASC
      `)
      .all({ $chatId: chatId }) as Array<{
      messageGuid: string;
      chatId: string;
      sender: string;
      senderName: string | null;
      text: string | null;
      sentAt: string;
    }>;
  }

  markMessagesProcessed(chatId: string, processedAt = nowIso()): void {
    this.sqlite
      .query(`
        UPDATE messages
        SET processed_at = $processedAt
        WHERE chat_id = $chatId AND processed_at IS NULL
      `)
      .run({ $chatId: chatId, $processedAt: processedAt });
  }

  getChat(chatId: string): ChatRecord | null {
    return (
      (this.sqlite
        .query(`
          SELECT id,
                 chat_id AS chatId,
                 chat_type AS chatType,
                 title,
                 participants_json AS participantsJson,
                 last_message_at AS lastMessageAt,
                 last_analyzed_at AS lastAnalyzedAt,
                 is_enabled AS isEnabled
          FROM chats
          WHERE chat_id = $chatId
        `)
        .get({ $chatId: chatId }) as ChatRecord | null) ?? null
    );
  }

  getAllEnabledChats(): ChatRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               chat_id AS chatId,
               chat_type AS chatType,
               title,
               participants_json AS participantsJson,
               last_message_at AS lastMessageAt,
               last_analyzed_at AS lastAnalyzedAt,
               is_enabled AS isEnabled
        FROM chats
        WHERE is_enabled = 1
        ORDER BY COALESCE(last_message_at, '') DESC
      `)
      .all() as ChatRecord[];
  }

  getChatMemory(chatId: string): ChatMemoryRecord | null {
    return (
      (this.sqlite
        .query(`
          SELECT id,
                 chat_id AS chatId,
                 summary,
                 active_topics_json AS activeTopicsJson,
                 next_expected_action AS nextExpectedAction,
                 updated_at AS updatedAt
          FROM chat_memory
          WHERE chat_id = $chatId
        `)
        .get({ $chatId: chatId }) as ChatMemoryRecord | null) ?? null
    );
  }

  getOpenActionItems(chatId: string): ActionItemRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               chat_id AS chatId,
               kind,
               title,
               status,
               owner,
               due_at AS dueAt,
               confidence,
               source_message_guids_json AS sourceMessageGuidsJson,
               last_seen_at AS lastSeenAt,
               resolved_at AS resolvedAt
        FROM action_items
        WHERE chat_id = $chatId AND status = 'open'
        ORDER BY last_seen_at DESC
      `)
      .all({ $chatId: chatId }) as ActionItemRecord[];
  }

  getOpenActionItemsForDigest(): ActionItemRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               chat_id AS chatId,
               kind,
               title,
               status,
               owner,
               due_at AS dueAt,
               confidence,
               source_message_guids_json AS sourceMessageGuidsJson,
               last_seen_at AS lastSeenAt,
               resolved_at AS resolvedAt
        FROM action_items
        WHERE status = 'open'
        ORDER BY last_seen_at DESC
      `)
      .all() as ActionItemRecord[];
  }

  startAnalysisRun(chatId: string, model: string, inputMessageCount: number): number {
    const result = this.sqlite
      .query(`
        INSERT INTO analysis_runs (chat_id, started_at, status, model, input_message_count, error)
        VALUES ($chatId, $startedAt, 'running', $model, $count, NULL)
      `)
      .run({
        $chatId: chatId,
        $startedAt: nowIso(),
        $model: model,
        $count: inputMessageCount,
      });

    return Number(result.lastInsertRowid);
  }

  finishAnalysisRun(id: number, status: AnalysisRunRecord["status"], error: string | null): void {
    this.sqlite
      .query(`
        UPDATE analysis_runs
        SET status = $status,
            error = $error,
            completed_at = $completedAt
        WHERE id = $id
      `)
      .run({
        $id: id,
        $status: status,
        $error: error,
        $completedAt: nowIso(),
      });
  }

  mergeAnalysisResult(input: {
    chatId: string;
    chatSummary: string;
    activeTopics: string[];
    nextExpectedAction: string | null;
    newItems: ActionItemCandidate[];
    completedItems: CompletedItemCandidate[];
  }): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite
        .query(`
          UPDATE chat_memory
          SET summary = $summary,
              active_topics_json = $topics,
              next_expected_action = $next,
              updated_at = $updatedAt
          WHERE chat_id = $chatId
        `)
        .run({
          $chatId: input.chatId,
          $summary: input.chatSummary,
          $topics: JSON.stringify(input.activeTopics),
          $next: input.nextExpectedAction,
          $updatedAt: nowIso(),
        });

      for (const item of input.completedItems) {
        const match = this.findMatchingOpenActionItem(input.chatId, item.title, item.sourceMessageGuids);
        if (match) {
          this.sqlite
            .query(`
              UPDATE action_items
              SET status = 'done',
                  resolved_at = $resolvedAt,
                  last_seen_at = $lastSeenAt
              WHERE id = $id
            `)
            .run({
              $id: match.id,
              $resolvedAt: nowIso(),
              $lastSeenAt: nowIso(),
            });
        }
      }

      for (const item of input.newItems) {
        const existing = this.findMatchingAnyActionItem(input.chatId, item.title, item.sourceMessageGuids);

        if (existing) {
          this.sqlite
            .query(`
              UPDATE action_items
              SET status = 'open',
                  kind = $kind,
                  owner = $owner,
                  due_at = $dueAt,
                  confidence = $confidence,
                  source_message_guids_json = $sourceMessageGuidsJson,
                  last_seen_at = $lastSeenAt,
                  resolved_at = NULL
              WHERE id = $id
            `)
            .run({
              $id: existing.id,
              $kind: item.kind,
              $owner: item.owner,
              $dueAt: item.dueAt,
              $confidence: item.confidence,
              $sourceMessageGuidsJson: JSON.stringify(item.sourceMessageGuids),
              $lastSeenAt: nowIso(),
            });
        } else {
          this.sqlite
            .query(`
              INSERT INTO action_items (
                chat_id, kind, title, status, owner, due_at, confidence, source_message_guids_json, last_seen_at, resolved_at
              ) VALUES (
                $chatId, $kind, $title, 'open', $owner, $dueAt, $confidence, $sourceMessageGuidsJson, $lastSeenAt, NULL
              )
            `)
            .run({
              $chatId: input.chatId,
              $kind: item.kind,
              $title: item.title,
              $owner: item.owner,
              $dueAt: item.dueAt,
              $confidence: item.confidence,
              $sourceMessageGuidsJson: JSON.stringify(item.sourceMessageGuids),
              $lastSeenAt: nowIso(),
            });
        }
      }

      this.sqlite
        .query(`UPDATE chats SET last_analyzed_at = $lastAnalyzedAt WHERE chat_id = $chatId`)
        .run({
          $chatId: input.chatId,
          $lastAnalyzedAt: nowIso(),
        });
    });

    tx();
  }

  private findMatchingOpenActionItem(chatId: string, title: string, sourceMessageGuids: string[]): ActionItemRecord | null {
    const openItems = this.getOpenActionItems(chatId);
    return findMatchingActionItem(openItems, title, sourceMessageGuids);
  }

  private findMatchingAnyActionItem(chatId: string, title: string, sourceMessageGuids: string[]): ActionItemRecord | null {
    const all = this.sqlite
      .query(`
        SELECT id,
               chat_id AS chatId,
               kind,
               title,
               status,
               owner,
               due_at AS dueAt,
               confidence,
               source_message_guids_json AS sourceMessageGuidsJson,
               last_seen_at AS lastSeenAt,
               resolved_at AS resolvedAt
        FROM action_items
        WHERE chat_id = $chatId
        ORDER BY last_seen_at DESC
      `)
      .all({ $chatId: chatId }) as ActionItemRecord[];

    return findMatchingActionItem(all, title, sourceMessageGuids);
  }

  upsertCalendarEvents(events: CalendarEvent[]): void {
    const syncedAt = nowIso();
    const tx = this.sqlite.transaction(() => {
      for (const event of events) {
        this.sqlite
          .query(`
            INSERT INTO calendar_events (
              event_identifier, title, starts_at, ends_at, location, attendees_json, notes, last_synced_at
            ) VALUES (
              $eventIdentifier, $title, $startsAt, $endsAt, $location, $attendeesJson, $notes, $lastSyncedAt
            )
            ON CONFLICT(event_identifier) DO UPDATE SET
              title = excluded.title,
              starts_at = excluded.starts_at,
              ends_at = excluded.ends_at,
              location = excluded.location,
              attendees_json = excluded.attendees_json,
              notes = excluded.notes,
              last_synced_at = excluded.last_synced_at
          `)
          .run({
            $eventIdentifier: event.eventIdentifier,
            $title: event.title,
            $startsAt: event.startsAt,
            $endsAt: event.endsAt,
            $location: event.location,
            $attendeesJson: JSON.stringify(event.attendees),
            $notes: event.notes,
            $lastSyncedAt: syncedAt,
          });
      }
    });

    tx();
  }

  listFutureCalendarEvents(fromIso: string): CalendarEventRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               event_identifier AS eventIdentifier,
               title,
               starts_at AS startsAt,
               ends_at AS endsAt,
               location,
               attendees_json AS attendeesJson,
               notes,
               last_synced_at AS lastSyncedAt
        FROM calendar_events
        WHERE starts_at >= $fromIso
        ORDER BY starts_at ASC
      `)
      .all({ $fromIso: fromIso }) as CalendarEventRecord[];
  }

  listCalendarEventsBetween(startIso: string, endIso: string): CalendarEventRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               event_identifier AS eventIdentifier,
               title,
               starts_at AS startsAt,
               ends_at AS endsAt,
               location,
               attendees_json AS attendeesJson,
               notes,
               last_synced_at AS lastSyncedAt
        FROM calendar_events
        WHERE starts_at >= $startIso AND starts_at < $endIso
        ORDER BY starts_at ASC
      `)
      .all({ $startIso: startIso, $endIso: endIso }) as CalendarEventRecord[];
  }

  enqueueJob(jobType: JobType, dedupeKey: string, runAt: string, payload: unknown): void {
    this.sqlite
      .query(`
        INSERT OR IGNORE INTO scheduled_jobs (
          job_type, dedupe_key, run_at, payload_json, status, attempt_count, last_error, sent_at
        ) VALUES (
          $jobType, $dedupeKey, $runAt, $payloadJson, 'pending', 0, NULL, NULL
        )
      `)
      .run({
        $jobType: jobType,
        $dedupeKey: dedupeKey,
        $runAt: runAt,
        $payloadJson: JSON.stringify(payload),
      });
  }

  listDueJobs(now = new Date()): ScheduledJobRecord[] {
    return this.sqlite
      .query(`
        SELECT id,
               job_type AS jobType,
               dedupe_key AS dedupeKey,
               run_at AS runAt,
               payload_json AS payloadJson,
               status,
               attempt_count AS attemptCount,
               last_error AS lastError,
               sent_at AS sentAt
        FROM scheduled_jobs
        WHERE status = 'pending' AND run_at <= $runAt
        ORDER BY run_at ASC
      `)
      .all({ $runAt: now.toISOString() }) as ScheduledJobRecord[];
  }

  markJobSent(id: number): void {
    this.sqlite
      .query(`
        UPDATE scheduled_jobs
        SET status = 'sent',
            sent_at = $sentAt,
            attempt_count = attempt_count + 1,
            last_error = NULL
        WHERE id = $id
      `)
      .run({ $id: id, $sentAt: nowIso() });
  }

  markJobSkipped(id: number, reason: string): void {
    this.sqlite
      .query(`
        UPDATE scheduled_jobs
        SET status = 'skipped',
            last_error = $reason
        WHERE id = $id
      `)
      .run({ $id: id, $reason: reason });
  }

  markJobFailed(id: number, error: string): void {
    this.sqlite
      .query(`
        UPDATE scheduled_jobs
        SET attempt_count = attempt_count + 1,
            last_error = $error,
            status = CASE WHEN attempt_count + 1 >= 3 THEN 'failed' ELSE 'pending' END
        WHERE id = $id
      `)
      .run({ $id: id, $error: error });
  }

  findChatByParticipantIdentifier(identifier: string): ChatRecord | null {
    const normalizedNeedle = normalizePersonIdentifier(identifier);
    if (!normalizedNeedle) {
      return null;
    }

    for (const chat of this.getAllEnabledChats().filter((item) => item.chatType === "direct")) {
      const participants = JSON.parse(chat.participantsJson) as string[];
      if (participants.some((participant) => normalizePersonIdentifier(participant) === normalizedNeedle)) {
        return chat;
      }
      if (normalizePersonIdentifier(chat.chatId) === normalizedNeedle) {
        return chat;
      }
    }

    return null;
  }
}

function findMatchingActionItem(
  items: ActionItemRecord[],
  title: string,
  sourceMessageGuids: string[],
): ActionItemRecord | null {
  const normalizedSource = new Set(sourceMessageGuids);
  const exactSourceMatch = items.find((item) => {
    const sources = JSON.parse(item.sourceMessageGuidsJson) as string[];
    return sources.some((source) => normalizedSource.has(source));
  });

  if (exactSourceMatch) {
    return exactSourceMatch;
  }

  const normalizedNeedle = normalizeTitle(title);
  return items.find((item) => normalizeTitle(item.title) === normalizedNeedle) ?? null;
}
