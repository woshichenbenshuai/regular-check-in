import type { Logger } from 'pino';
import { BrowserManager } from './browser.js';
import { ensureRuntimeDirs } from './fs.js';
import { AppStorage } from './storage.js';
import { GenericConsoleSiteAdapter } from '../sites/generic-console-site.js';
import type { CheckInResult, RuntimeConfig, SiteConfig } from '../types.js';

export class CheckInRunner {
  private readonly browserManager: BrowserManager;
  private readonly storagePromise: Promise<AppStorage>;
  private readonly adapter = new GenericConsoleSiteAdapter();

  constructor(
    private readonly config: RuntimeConfig,
    private readonly logger: Logger
  ) {
    ensureRuntimeDirs(config.dataDir);
    this.browserManager = new BrowserManager(config);
    this.storagePromise = AppStorage.open(config.dataDir);
  }

  enabledSites(siteId?: string): SiteConfig[] {
    const sites = this.config.sites.filter((site) => site.enabled);
    if (!siteId) {
      return sites;
    }
    return sites.filter((site) => site.id === siteId);
  }

  async runSite(site: SiteConfig): Promise<CheckInResult> {
    this.logger.info({ siteId: site.id, url: `${site.baseUrl}${site.personalPath}` }, 'starting check-in');
    const context = await this.browserManager.newContext(site);
    const page = await context.newPage();

    try {
      const result = await this.adapter.run({
        site,
        context,
        page,
        dataDir: this.config.dataDir,
        screenshotOnSuccess: this.config.screenshotOnSuccess,
        handoffTimeoutSeconds: this.config.handoffTimeoutSeconds
      });
      await this.browserManager.saveContext(site, context);
      const storage = await this.storagePromise;
      storage.recordRun(result);
      this.logger.info(
        {
          siteId: site.id,
          status: result.status,
          message: result.message,
          metrics: result.metrics,
          screenshotPath: result.screenshotPath
        },
        'finished check-in'
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: CheckInResult = {
        siteId: site.id,
        siteName: site.name,
        status: 'failed',
        message,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      };
      const storage = await this.storagePromise;
      storage.recordRun(result);
      this.logger.error({ siteId: site.id, error }, 'check-in failed');
      return result;
    } finally {
      await context.close();
    }
  }

  async run(siteId?: string): Promise<CheckInResult[]> {
    const sites = this.enabledSites(siteId);
    if (siteId && sites.length === 0) {
      throw new Error(`Unknown or disabled site: ${siteId}`);
    }

    const results: CheckInResult[] = [];
    for (const site of sites) {
      results.push(await this.runSite(site));
    }
    return results;
  }

  async close(): Promise<void> {
    const storage = await this.storagePromise;
    storage.close();
    await this.browserManager.close();
  }
}
