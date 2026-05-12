import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { RuntimeConfig, SiteConfig } from '../types.js';

export class BrowserManager {
  private browser?: Browser;

  constructor(private readonly config: RuntimeConfig) {}

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: ['--disable-dev-shm-usage']
      });
    }
    return this.browser;
  }

  sessionPath(site: SiteConfig): string {
    return path.join(this.config.dataDir, 'sessions', site.sessionFile ?? `${site.id}.json`);
  }

  async newContext(site: SiteConfig): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const storageState = this.sessionPath(site);
    const hasStorageState = fs.existsSync(storageState);

    return browser.newContext({
      locale: 'zh-CN',
      timezoneId: this.config.timezone,
      viewport: { width: 1440, height: 1000 },
      storageState: hasStorageState ? storageState : undefined
    });
  }

  async saveContext(site: SiteConfig, context: BrowserContext): Promise<void> {
    await context.storageState({ path: this.sessionPath(site) });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}
