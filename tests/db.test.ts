import { describe, expect, test } from "bun:test";
import { AppDatabase } from "../src/db";

function createDb(): AppDatabase {
  const db = new AppDatabase(":memory:");
  db.init();
  db.upsertChat({
    chatId: "iMessage;+15551234567",
    chatType: "direct",
    participants: ["+15551234567"],
  });
  return db;
}

describe("AppDatabase mergeAnalysisResult", () => {
  test("creates and resolves follow-up items", () => {
    const db = createDb();

    db.mergeAnalysisResult({
      chatId: "iMessage;+15551234567",
      chatSummary: "Pricing chat",
      activeTopics: ["pricing"],
      nextExpectedAction: "Send pricing sheet",
      newItems: [
        {
          kind: "followup",
          title: "Send pricing sheet to Alex",
          owner: "me",
          dueAt: null,
          confidence: 0.9,
          sourceMessageGuids: ["guid-1"],
        },
      ],
      completedItems: [],
    });

    expect(db.getOpenActionItems("iMessage;+15551234567")).toHaveLength(1);

    db.mergeAnalysisResult({
      chatId: "iMessage;+15551234567",
      chatSummary: "Pricing chat",
      activeTopics: ["pricing"],
      nextExpectedAction: null,
      newItems: [],
      completedItems: [
        {
          kind: "followup",
          title: "Send pricing sheet to Alex",
          sourceMessageGuids: ["guid-1"],
        },
      ],
    });

    expect(db.getOpenActionItems("iMessage;+15551234567")).toHaveLength(0);
  });

  test("records the analysis model when starting a run", () => {
    const db = createDb();
    const runId = db.startAnalysisRun("iMessage;+15551234567", "gemini-2.5-flash", 3);

    expect(runId).toBeGreaterThan(0);
  });
});
