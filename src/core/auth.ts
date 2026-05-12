import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { Logger } from 'pino';
import { chromium } from 'playwright';
import type { RuntimeConfig, SiteConfig } from '../types.js';
import { ensureRuntimeDirs } from './fs.js';
import { BrowserManager } from './browser.js';

function personalUrl(site: SiteConfig): string {
  return `${site.baseUrl}${site.personalPath}`;
}

export async function bootstrapSession(config: RuntimeConfig, logger: Logger, siteId: string): Promise<void> {
  ensureRuntimeDirs(config.dataDir);
  const site = config.sites.find((candidate) => candidate.id === siteId);
  if (!site) {
    throw new Error(`Unknown site: ${siteId}`);
  }

  const browserManager = new BrowserManager({ ...config, headless: false });
  const browser = await chromium.launch({ headless: false, args: ['--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    locale: 'zh-CN',
    timezoneId: config.timezone,
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  await page.goto(personalUrl(site), { waitUntil: 'domcontentloaded' });

  logger.info({ siteId, url: personalUrl(site) }, 'login in the opened browser, then press Enter here');
  const rl = createInterface({ input, output });
  await rl.question('登录完成后按 Enter 保存会话：');
  rl.close();

  await context.storageState({ path: browserManager.sessionPath(site) });
  await browser.close();
  logger.info({ siteId, sessionPath: browserManager.sessionPath(site) }, 'session saved');
}
