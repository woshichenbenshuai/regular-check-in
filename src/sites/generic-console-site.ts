import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { setupAccessTokenAuth } from '../core/access-token-auth.js';
import { safeFilePart } from '../core/fs.js';
import type { CheckInMetrics, CheckInResult, SiteAdapter, SiteConfig, SiteRunInput } from '../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function visible(locator: Locator): Promise<boolean> {
  try {
    return await locator.isVisible({ timeout: 1200 });
  } catch {
    return false;
  }
}

function personalUrl(site: SiteConfig): string {
  return `${site.baseUrl}${site.personalPath}`;
}

function includesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function extractFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

function extractMetrics(text: string): CheckInMetrics {
  return {
    balance: extractFirst(text, [/(?:\u5f53\u524d\u4f59\u989d\s*)?\u786c\u5e01\s*([0-9]+(?:\.[0-9]+)?)/, /\u4f59\u989d\s*[:\uff1a]?\s*([0-9]+(?:\.[0-9]+)?)/]),
    monthlyEarned: extractFirst(text, [/\u786c\u5e01\s*([0-9]+(?:\.[0-9]+)?)\s*\u672c\u6708\u83b7\u5f97/, /\u672c\u6708\u83b7\u5f97\s*\u786c\u5e01?\s*([0-9]+(?:\.[0-9]+)?)/]),
    totalEarned: extractFirst(text, [/\u786c\u5e01\s*([0-9]+(?:\.[0-9]+)?)\s*\u7d2f\u8ba1\u83b7\u5f97/, /\u7d2f\u8ba1\u83b7\u5f97\s*\u786c\u5e01?\s*([0-9]+(?:\.[0-9]+)?)/]),
    totalCheckIns: extractFirst(text, [/([0-9]+)\s*\u7d2f\u8ba1\u7b7e\u5230/, /\u7d2f\u8ba1\u7b7e\u5230\s*([0-9]+)/])
  };
}

async function saveScreenshot(page: Page, dataDir: string, siteId: string, suffix: string): Promise<string> {
  const fileName = `${safeFilePart(siteId)}-${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}.png`;
  const screenshotPath = path.join(dataDir, 'screenshots', fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function findCheckInButton(page: Page, label: string): Promise<Locator | undefined> {
  const byRole = page.getByRole('button', { name: new RegExp(escapeRegExp(label)) }).first();
  if (await visible(byRole)) {
    return byRole;
  }

  const byText = page.getByText(label, { exact: false }).first();
  if (await visible(byText)) {
    return byText;
  }

  return undefined;
}

function result(input: SiteRunInput, startedAt: string, status: CheckInResult['status'], message: string, extras: Partial<CheckInResult> = {}): CheckInResult {
  return {
    siteId: input.site.id,
    siteName: input.site.name,
    status,
    message,
    startedAt,
    finishedAt: nowIso(),
    ...extras
  };
}

export class GenericConsoleSiteAdapter implements SiteAdapter {
  async run(input: SiteRunInput): Promise<CheckInResult> {
    const startedAt = nowIso();
    const { page, site } = input;

    await setupAccessTokenAuth(page, site);
    await page.goto(personalUrl(site), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    let text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
    if (includesAny(text, site.selectors.challengeTexts)) {
      const screenshotPath = await saveScreenshot(page, input.dataDir, site.id, 'handoff');
      if (input.handoffTimeoutSeconds > 0) {
        await page.waitForTimeout(input.handoffTimeoutSeconds * 1000);
        text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
        if (!includesAny(text, site.selectors.challengeTexts)) {
          return this.run(input);
        }
      }
      return result(input, startedAt, 'needs_handoff', 'Security challenge detected; manual handoff is required.', { screenshotPath });
    }

    const checkInButton = await findCheckInButton(page, site.selectors.checkInButtonText);
    if (!checkInButton) {
      const metrics = extractMetrics(text);
      const alreadyChecked = includesAny(text, site.selectors.alreadyCheckedTexts);
      const message = alreadyChecked ? 'Page indicates today may already be checked in.' : 'Check-in button was not found; login may have failed or the page changed.';
      const status = alreadyChecked ? 'skipped' : 'failed';
      const screenshotPath = status === 'failed' ? await saveScreenshot(page, input.dataDir, site.id, 'missing-button') : undefined;
      return result(input, startedAt, status, message, { metrics, screenshotPath });
    }

    await checkInButton.click({ timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
    if (includesAny(text, site.selectors.challengeTexts)) {
      const screenshotPath = await saveScreenshot(page, input.dataDir, site.id, 'handoff-after-click');
      return result(input, startedAt, 'needs_handoff', 'Security challenge appeared after clicking check-in; manual handoff is required.', { screenshotPath, metrics: extractMetrics(text) });
    }

    const metrics = extractMetrics(text);
    const screenshotPath = input.screenshotOnSuccess ? await saveScreenshot(page, input.dataDir, site.id, 'success') : undefined;
    const message = includesAny(text, site.selectors.successTexts) ? 'Check-in completed and success text was found.' : 'Check-in button was clicked; verify the result from balance/logs.';

    return result(input, startedAt, 'success', message, { metrics, screenshotPath });
  }
}
