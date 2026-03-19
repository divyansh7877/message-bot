import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { AppConfig } from "./config";
import { logInfo } from "./logger";

export class Notifier {
  constructor(
    private readonly config: AppConfig,
    private readonly sdk: IMessageSDK,
  ) {}

  async sendToSelf(text: string): Promise<void> {
    const target = this.config.selfChatId ?? this.config.selfRecipient;
    if (!target) {
      throw new Error("SELF_CHAT_ID or SELF_RECIPIENT must be configured.");
    }

    logInfo("notify", "Sending iMessage", {
      target,
      preview: text.slice(0, 80),
    });
    await this.sdk.send(target, text);
  }
}
