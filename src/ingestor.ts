import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { AppConfig } from "./config";
import type { AppDatabase } from "./db";
import { sha256 } from "./lib/hash";
import { logError, logInfo } from "./logger";
import type { AssistantMessage } from "./types";

export class MessageIngestor {
  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
    private readonly sdk: IMessageSDK,
    private readonly onChatReady: (chatId: string) => Promise<void>,
  ) {}

  async startWatching(): Promise<void> {
    logInfo("ingestor", "Starting iMessage watcher");
    await this.sdk.startWatching({
      onDirectMessage: async (message) => {
        await this.handleIncoming(message as AssistantMessage);
      },
      onGroupMessage: async (message) => {
        await this.handleIncoming(message as AssistantMessage);
      },
      onError: (error) => {
        logError("ingestor", "iMessage watcher error", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  async backfill(hours: number): Promise<void> {
    logInfo("ingestor", "Backfill starting", { hours });
    const since = new Date(Date.now() - hours * 60 * 60_000);
    const result = await this.sdk.getMessages({
      since,
      excludeOwnMessages: true,
      limit: 1000,
    });
    const changedChats = new Set<string>();

    for (const message of result.messages as unknown as readonly AssistantMessage[]) {
      const chatId = await this.handleIncoming(message, { analyzeImmediately: false });
      if (chatId) {
        changedChats.add(chatId);
      }
    }

    for (const chatId of changedChats) {
      await this.onChatReady(chatId);
    }

    logInfo("ingestor", "Backfill complete", {
      fetchedMessages: result.messages.length,
      changedChats: changedChats.size,
    });
  }

  async bootstrapRecentMessages(limit = this.config.initialMessageLimit): Promise<void> {
    if (limit <= 0) {
      logInfo("ingestor", "Startup bootstrap skipped", { limit });
      return;
    }

    logInfo("ingestor", "Bootstrapping recent messages", { limit });
    const result = await this.sdk.getMessages({
      excludeOwnMessages: true,
      limit,
    });
    const changedChats = new Set<string>();
    const messages = [...(result.messages as unknown as readonly AssistantMessage[])].reverse();

    for (const message of messages) {
      const chatId = await this.handleIncoming(message, { analyzeImmediately: false });
      if (chatId) {
        changedChats.add(chatId);
      }
    }

    for (const chatId of changedChats) {
      await this.onChatReady(chatId);
    }

    logInfo("ingestor", "Bootstrap complete", {
      fetchedMessages: result.messages.length,
      changedChats: changedChats.size,
    });
  }

  async refreshChats(): Promise<void> {
    const chats = (await this.sdk.listChats()) as unknown as Array<Record<string, unknown>>;
    let enabledChats = 0;

    for (const chat of chats) {
      const chatId = typeof chat.chatId === "string" ? chat.chatId : null;
      if (!chatId) {
        continue;
      }

      const isGroup =
        typeof chat.isGroup === "boolean"
          ? chat.isGroup
          : typeof chat.type === "string"
            ? chat.type === "group"
            : chatId.startsWith("chat");
      const participants = Array.isArray(chat.participants)
        ? chat.participants.filter((item): item is string => typeof item === "string")
        : [];

      this.db.upsertChat({
        chatId,
        chatType: isGroup ? "group" : "direct",
        title: typeof chat.displayName === "string" ? chat.displayName : null,
        participants,
        isEnabled: this.isChatEnabled(chatId, isGroup),
      });

      if (this.isChatEnabled(chatId, isGroup)) {
        enabledChats += 1;
      }
    }

    logInfo("ingestor", "Chat list refreshed", {
      totalChats: chats.length,
      enabledChats,
    });
  }

  private async handleIncoming(
    message: AssistantMessage,
    options: { analyzeImmediately?: boolean } = { analyzeImmediately: true },
  ): Promise<string | null> {
    if (message.isFromMe || !this.isChatEnabled(message.chatId, message.isGroupChat)) {
      return null;
    }

    this.db.upsertChat({
      chatId: message.chatId,
      chatType: message.isGroupChat ? "group" : "direct",
      title: null,
      participants: [message.sender],
      lastMessageAt: message.date.toISOString(),
      isEnabled: true,
    });

    const inserted = this.db.ingestMessage({
      messageGuid: message.guid,
      chatId: message.chatId,
      sender: message.sender,
      senderName: message.senderName,
      text: message.text,
      sentAt: message.date.toISOString(),
      isFromMe: message.isFromMe,
      rawHash: await sha256(
        JSON.stringify({
          guid: message.guid,
          chatId: message.chatId,
          sender: message.sender,
          text: message.text,
          date: message.date.toISOString(),
        }),
      ),
    });

    if (inserted && options.analyzeImmediately !== false) {
      logInfo("ingestor", "New message ingested", {
        chatId: message.chatId,
        guid: message.guid,
        isGroupChat: message.isGroupChat,
      });
      await this.onChatReady(message.chatId);
    }

    return inserted ? message.chatId : null;
  }

  private isChatEnabled(chatId: string, isGroupChat: boolean): boolean {
    if (isGroupChat) {
      return this.config.groupChatAllowlist.size === 0 || this.config.groupChatAllowlist.has(chatId);
    }

    if (this.config.enabledChatAllowlist.size === 0) {
      return true;
    }

    return (
      this.config.enabledChatAllowlist.has(chatId) ||
      this.config.enabledChatAllowlist.has(chatId.split(";").at(-1) ?? chatId)
    );
  }
}
