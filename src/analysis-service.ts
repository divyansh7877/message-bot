import type { GeminiAnalyzer } from "./analyzer";
import type { AppConfig } from "./config";
import type { AppDatabase } from "./db";
import { logError, logInfo } from "./logger";

export class AnalysisService {
  constructor(
    private readonly db: AppDatabase,
    private readonly analyzer: GeminiAnalyzer,
    private readonly config: AppConfig,
  ) {}

  async analyzeChat(chatId: string): Promise<void> {
    const messages = this.db.getUnprocessedMessages(chatId);
    if (messages.length === 0) {
      logInfo("analysis", "No unprocessed messages for chat", { chatId });
      return;
    }

    logInfo("analysis", "Starting chat analysis", {
      chatId,
      messageCount: messages.length,
      model: this.config.geminiModel,
    });
    const runId = this.db.startAnalysisRun(chatId, this.config.geminiModel, messages.length);

    try {
      const result = await this.analyzer.analyzeChat({
        messages,
        memory: this.db.getChatMemory(chatId),
        openItems: this.db.getOpenActionItems(chatId),
      });

      this.db.mergeAnalysisResult({
        chatId,
        chatSummary: result.chatSummary,
        activeTopics: result.activeTopics,
        nextExpectedAction: result.nextExpectedAction,
        newItems: result.newItems,
        completedItems: result.completedItems,
      });
      this.db.markMessagesProcessed(chatId);
      this.db.finishAnalysisRun(runId, "completed", null);
      logInfo("analysis", "Chat analysis complete", {
        chatId,
        newItems: result.newItems.length,
        completedItems: result.completedItems.length,
        noActionNeeded: result.noActionNeeded,
      });
    } catch (error) {
      this.db.finishAnalysisRun(runId, "failed", toErrorMessage(error));
      logError("analysis", "Chat analysis failed", {
        chatId,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
