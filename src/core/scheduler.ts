import cron from 'node-cron';
import type { Logger } from 'pino';
import type { RuntimeConfig } from '../types.js';
import { CheckInRunner } from './runner.js';

export function startScheduler(config: RuntimeConfig, logger: Logger): void {
  const runner = new CheckInRunner(config, logger);
  const schedule = config.cron;

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid CHECKIN_CRON expression: ${schedule}`);
  }

  logger.info({ schedule, timezone: config.timezone }, 'scheduler started');
  cron.schedule(
    schedule,
    async () => {
      logger.info('scheduled check-in triggered');
      await runner.run().catch((error) => logger.error({ error }, 'scheduled check-in failed'));
    },
    { timezone: config.timezone }
  );

  const shutdown = async () => {
    logger.info('shutting down scheduler');
    await runner.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
