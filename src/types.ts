export type ChatType = "direct" | "group";
export type ActionKind = "followup" | "plan" | "decision" | "question";
export type ActionStatus = "open" | "done" | "dismissed";
export type ActionOwner = "me" | "other" | "unknown";
export type JobType = "daily_digest" | "event_reminder";
export type JobStatus = "pending" | "sent" | "skipped" | "failed";

export interface ChatRecord {
  id: number;
  chatId: string;
  chatType: ChatType;
  title: string | null;
  participantsJson: string;
  lastMessageAt: string | null;
  lastAnalyzedAt: string | null;
  isEnabled: number;
}

export interface MessageRecord {
  id: number;
  messageGuid: string;
  chatId: string;
  sender: string;
  senderName: string | null;
  text: string | null;
  sentAt: string;
  isFromMe: number;
  rawHash: string;
  processedAt: string | null;
}

export interface ChatMemoryRecord {
  id: number;
  chatId: string;
  summary: string | null;
  activeTopicsJson: string;
  nextExpectedAction: string | null;
  updatedAt: string;
}

export interface ActionItemRecord {
  id: number;
  chatId: string;
  kind: ActionKind;
  title: string;
  status: ActionStatus;
  owner: ActionOwner;
  dueAt: string | null;
  confidence: number;
  sourceMessageGuidsJson: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface CalendarEventRecord {
  id: number;
  eventIdentifier: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  attendeesJson: string;
  notes: string | null;
  lastSyncedAt: string;
}

export interface ScheduledJobRecord {
  id: number;
  jobType: JobType;
  dedupeKey: string;
  runAt: string;
  payloadJson: string;
  status: JobStatus;
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
}

export interface AnalysisRunRecord {
  id: number;
  chatId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  model: string;
  inputMessageCount: number;
  error: string | null;
}

export interface AssistantMessage {
  guid: string;
  chatId: string;
  sender: string;
  senderName: string | null;
  text: string | null;
  isGroupChat: boolean;
  isFromMe: boolean;
  date: Date;
}

export interface ActionItemCandidate {
  kind: ActionKind;
  title: string;
  owner: ActionOwner;
  dueAt: string | null;
  confidence: number;
  sourceMessageGuids: string[];
}

export interface CompletedItemCandidate {
  kind: ActionKind;
  title: string;
  sourceMessageGuids: string[];
}

export interface AnalyzerResult {
  chatSummary: string;
  activeTopics: string[];
  newItems: ActionItemCandidate[];
  completedItems: CompletedItemCandidate[];
  nextExpectedAction: string | null;
  noActionNeeded: boolean;
}

export interface CalendarAttendee {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface CalendarEvent {
  eventIdentifier: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  attendees: CalendarAttendee[];
  notes: string | null;
}

export interface DueJobPayloads {
  daily_digest: {
    scheduledFor: string;
  };
  event_reminder: {
    eventIdentifier: string;
    reminderOffsetMinutes: number;
  };
}
