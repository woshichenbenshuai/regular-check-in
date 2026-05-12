import 'dotenv/config';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { CheckInRunner } from './core/runner.js';
import { startScheduler } from './core/scheduler.js';
import { bootstrapSession } from './core/auth.js';
import { errorInfo } from './core/error-info.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const program = new Command();
program.name('regular-check-in').description('Run configured check-in automations.');

program
  .command('run')
  .description('Run check-in tasks once.')
  .option('-s, --site <siteId>', 'Run only one site.')
  .action(async (options: { site?: string }) => {
    const runner = new CheckInRunner(config, logger);
    try {
      const results = await runner.run(options.site);
      for (const item of results) {
        logger.info({ result: item }, 'run result');
      }
      const failed = results.some((item) => item.status === 'failed');
      const handoff = results.some((item) => item.status === 'needs_handoff');
      process.exitCode = failed || handoff ? 1 : 0;
    } finally {
      await runner.close();
    }
  });

program
  .command('start')
  .description('Start cron scheduler.')
  .action(() => {
    startScheduler(config, logger);
  });

program
  .command('auth')
  .description('Open a visible browser to log in and save session state.')
  .requiredOption('-s, --site <siteId>', 'Site id to authenticate.')
  .action(async (options: { site: string }) => {
    await bootstrapSession(config, logger, options.site);
  });

program.command('sites').description('List enabled sites.').action(() => {
  for (const site of config.sites) {
    logger.info({ id: site.id, name: site.name, enabled: site.enabled, url: `${site.baseUrl}${site.personalPath}` }, 'configured site');
  }
});

program.parseAsync().catch((error) => {
  logger.error({ error: errorInfo(error) }, 'command failed');
  process.exitCode = 1;
});
