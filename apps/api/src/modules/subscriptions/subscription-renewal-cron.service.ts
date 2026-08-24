import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';

/**
 * Optional local/dev renewal tick. Default off (RENEWAL_CRON_ENABLED=false).
 * Production trigger remains POST /v1/internal/jobs/subscription-renewals.
 * Uses a simple interval (no Nest schedule package). Expr star-slash-N maps
 * to an N-minute interval; otherwise defaults to 5 minutes.
 */
@Injectable()
export class SubscriptionRenewalCronService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionRenewalCronService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: SubscriptionsRenewalProcessor,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('payments.renewalCronEnabled');
    if (!enabled) {
      return;
    }
    const expr =
      this.config.get<string>('payments.renewalCronExpr') ?? '*/5 * * * *';
    const intervalMs = this.resolveIntervalMs(expr);
    this.logger.log(
      `Renewal cron enabled (interval ${intervalMs}ms; expr=${expr})`,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.processor.processDueBatch({});
      this.logger.debug(
        `Renewal cron tick: scanned=${result.scanned} processed=${result.processed}`,
      );
    } catch (err) {
      this.logger.error(
        `Renewal cron tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Map star-slash-N minute cron to N minutes; otherwise 5 minutes. */
  private resolveIntervalMs(expr: string): number {
    const match = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(expr.trim());
    const minutes = match ? Number(match[1]) : 5;
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
    return safe * 60_000;
  }
}
