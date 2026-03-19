import type { GeminiAnalyzer } from "./analyzer";
import type { AppConfig } from "./config";
import type { AppDatabase } from "./db";

export class AnalysisService {
  constructor(
    private readonly db: AppDatabase,
    private readonly analyzer: GeminiAnalyzer,
    private readonly config: AppConfig,
  ) {}

  async analyzeChat(chatId: string): Promise<void> {
    const messages = this.db.getUnprocessedMessages(chatId);
    if (messages.length === 0) {
      return;
    }

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
    } catch (error) {
      this.db.finishAnalysisRun(runId, "failed", toErrorMessage(error));
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
