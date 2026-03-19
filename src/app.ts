import { IMessageSDK } from "@photon-ai/imessage-kit";
import { GeminiAnalyzer } from "./analyzer";
import { AnalysisService } from "./analysis-service";
import { CalendarHelperClient } from "./calendar-helper";
import { CalendarSyncService } from "./calendar-sync";
import type { AppConfig } from "./config";
import { AppDatabase } from "./db";
import { DigestBuilder } from "./digest";
import { MessageIngestor } from "./ingestor";
import { JobRunner } from "./job-runner";
import { Notifier } from "./notifier";
import { ReminderPlanner } from "./reminders";
import { Scheduler } from "./scheduler";

export class AssistantApp {
  readonly db: AppDatabase;
  readonly sdk: IMessageSDK;
  readonly analyzer: GeminiAnalyzer;
  readonly analysisService: AnalysisService;
  readonly calendarHelper: CalendarHelperClient;
  readonly calendarSync: CalendarSyncService;
  readonly notifier: Notifier;
  readonly digestBuilder: DigestBuilder;
  readonly reminderPlanner: ReminderPlanner;
  readonly jobRunner: JobRunner;
  readonly scheduler: Scheduler;
  readonly ingestor: MessageIngestor;

  constructor(private readonly config: AppConfig) {
    this.db = new AppDatabase(config.dbPath);
    this.db.init();

    this.sdk = new IMessageSDK({
      debug: true,
      watcher: {
        pollInterval: config.messagePollIntervalMs,
        unreadOnly: false,
        excludeOwnMessages: true,
      },
    });

    this.analyzer = new GeminiAnalyzer(config);
    this.analysisService = new AnalysisService(this.db, this.analyzer, config);
    this.calendarHelper = new CalendarHelperClient(config.calendarHelperPath);
    this.calendarSync = new CalendarSyncService(this.db, this.calendarHelper);
    this.notifier = new Notifier(config, this.sdk);
    this.digestBuilder = new DigestBuilder(this.db, config.timezone);
    this.reminderPlanner = new ReminderPlanner(this.db, config);
    this.jobRunner = new JobRunner(this.db, this.notifier, this.digestBuilder, this.reminderPlanner);
    this.scheduler = new Scheduler(this.db, config);
    this.ingestor = new MessageIngestor(this.db, config, this.sdk, async (chatId) => {
      await this.analysisService.analyzeChat(chatId);
    });
  }

  async start(): Promise<void> {
    await this.ingestor.refreshChats();
    await this.calendarSync.sync();
    this.reminderPlanner.plan();
    this.scheduler.ensureDailyDigestJob();
    await this.ingestor.startWatching();

    setInterval(() => {
      void this.calendarSync
        .sync()
        .then(() => this.reminderPlanner.plan())
        .catch((error) => console.error("Calendar sync failed:", error));
    }, 15 * 60_000);

    setInterval(() => {
      this.scheduler.ensureDailyDigestJob();
      void this.jobRunner.runDueJobs().catch((error) => console.error("Job runner failed:", error));
    }, 60_000);

    await this.jobRunner.runDueJobs();
  }

  async close(): Promise<void> {
    await this.sdk.close();
    this.db.close();
  }
}
