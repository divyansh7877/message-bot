import type { AppConfig } from "./config";
import type { AnalyzerResult, ChatMemoryRecord, MessageRecord, ActionItemRecord } from "./types";

interface GeminiEnvelope {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiAnalyzer {
  constructor(private readonly config: AppConfig) {}

  async analyzeChat(input: {
    messages: Array<{
      messageGuid: string;
      sender: string;
      senderName: string | null;
      text: string | null;
      sentAt: string;
    }>;
    memory: ChatMemoryRecord | null;
    openItems: ActionItemRecord[];
  }): Promise<AnalyzerResult> {
    if (input.messages.length === 0) {
      return emptyResult(input.memory);
    }

    if (!this.config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required for analysis.");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:generateContent?key=${this.config.geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildPrompt(input),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed with ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as GeminiEnvelope;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no text content.");
    }

    const parsed = JSON.parse(text) as unknown;
    return validateAnalyzerResult(parsed);
  }
}

function buildPrompt(input: {
  messages: Array<{
    messageGuid: string;
    sender: string;
    senderName: string | null;
    text: string | null;
    sentAt: string;
  }>;
  memory: ChatMemoryRecord | null;
  openItems: ActionItemRecord[];
}): string {
  return `
You are extracting actionable state from a single iMessage chat.

Rules:
- Return JSON only.
- Only extract actionable commitments, plans, decisions, unanswered questions, and follow-ups.
- If there is nothing actionable, set "noActionNeeded" to true and leave "newItems" empty.
- Do not invent dates, attendees, or commitments.
- Use source message GUIDs from the input.
- Keep "chatSummary" short and rolling.

Required JSON shape:
{
  "chatSummary": "string",
  "activeTopics": ["string"],
  "newItems": [
    {
      "kind": "followup" | "plan" | "decision" | "question",
      "title": "string",
      "owner": "me" | "other" | "unknown",
      "dueAt": "ISO-8601 string or null",
      "confidence": 0.0,
      "sourceMessageGuids": ["guid"]
    }
  ],
  "completedItems": [
    {
      "kind": "followup" | "plan" | "decision" | "question",
      "title": "string",
      "sourceMessageGuids": ["guid"]
    }
  ],
  "nextExpectedAction": "string or null",
  "noActionNeeded": true
}

Current memory:
${JSON.stringify(
    input.memory
      ? {
          summary: input.memory.summary,
          activeTopics: JSON.parse(input.memory.activeTopicsJson),
          nextExpectedAction: input.memory.nextExpectedAction,
        }
      : null,
    null,
    2,
  )}

Open items:
${JSON.stringify(
    input.openItems.map((item) => ({
      kind: item.kind,
      title: item.title,
      owner: item.owner,
      dueAt: item.dueAt,
      sourceMessageGuids: JSON.parse(item.sourceMessageGuidsJson),
    })),
    null,
    2,
  )}

New messages:
${JSON.stringify(input.messages, null, 2)}
  `.trim();
}

function validateAnalyzerResult(value: unknown): AnalyzerResult {
  if (!value || typeof value !== "object") {
    throw new Error("Analyzer result must be an object.");
  }

  const record = value as Record<string, unknown>;
  const activeTopics = ensureStringArray(record.activeTopics, "activeTopics");
  const newItems = ensureArray(record.newItems, "newItems").map(validateNewItem);
  const completedItems = ensureArray(record.completedItems, "completedItems").map(validateCompletedItem);
  const nextExpectedAction =
    record.nextExpectedAction == null ? null : ensureString(record.nextExpectedAction, "nextExpectedAction");

  return {
    chatSummary: ensureString(record.chatSummary, "chatSummary"),
    activeTopics,
    newItems,
    completedItems,
    nextExpectedAction,
    noActionNeeded: ensureBoolean(record.noActionNeeded, "noActionNeeded"),
  };
}

function validateNewItem(value: unknown): AnalyzerResult["newItems"][number] {
  if (!value || typeof value !== "object") {
    throw new Error("newItems entries must be objects.");
  }

  const record = value as Record<string, unknown>;
  return {
    kind: validateKind(record.kind),
    title: ensureString(record.title, "newItems.title"),
    owner: validateOwner(record.owner),
    dueAt: record.dueAt == null ? null : ensureString(record.dueAt, "newItems.dueAt"),
    confidence: ensureNumber(record.confidence, "newItems.confidence"),
    sourceMessageGuids: ensureStringArray(record.sourceMessageGuids, "newItems.sourceMessageGuids"),
  };
}

function validateCompletedItem(value: unknown): AnalyzerResult["completedItems"][number] {
  if (!value || typeof value !== "object") {
    throw new Error("completedItems entries must be objects.");
  }

  const record = value as Record<string, unknown>;
  return {
    kind: validateKind(record.kind),
    title: ensureString(record.title, "completedItems.title"),
    sourceMessageGuids: ensureStringArray(record.sourceMessageGuids, "completedItems.sourceMessageGuids"),
  };
}

function validateKind(value: unknown): AnalyzerResult["newItems"][number]["kind"] {
  const kind = ensureString(value, "kind");
  if (kind === "followup" || kind === "plan" || kind === "decision" || kind === "question") {
    return kind;
  }
  throw new Error(`Invalid item kind: ${kind}`);
}

function validateOwner(value: unknown): AnalyzerResult["newItems"][number]["owner"] {
  const owner = ensureString(value, "owner");
  if (owner === "me" || owner === "other" || owner === "unknown") {
    return owner;
  }
  throw new Error(`Invalid item owner: ${owner}`);
}

function ensureArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  return value;
}

function ensureStringArray(value: unknown, field: string): string[] {
  return ensureArray(value, field).map((item) => ensureString(item, field));
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function ensureNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number.`);
  }
  return value;
}

function ensureBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function emptyResult(memory: ChatMemoryRecord | null): AnalyzerResult {
  return {
    chatSummary: memory?.summary ?? "",
    activeTopics: memory ? (JSON.parse(memory.activeTopicsJson) as string[]) : [],
    newItems: [],
    completedItems: [],
    nextExpectedAction: memory?.nextExpectedAction ?? null,
    noActionNeeded: true,
  };
}
