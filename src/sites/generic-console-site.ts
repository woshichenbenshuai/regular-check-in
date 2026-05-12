import path from 'node:path';
import type { Locator, Page } from 'playwright';
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
    balance: extractFirst(text, [/(?:当前余额\s*)?硬币\s*([0-9]+(?:\.[0-9]+)?)/, /余额\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/]),
    monthlyEarned: extractFirst(text, [/硬币\s*([0-9]+(?:\.[0-9]+)?)\s*本月获得/, /本月获得\s*硬币?\s*([0-9]+(?:\.[0-9]+)?)/]),
    totalEarned: extractFirst(text, [/硬币\s*([0-9]+(?:\.[0-9]+)?)\s*累计获得/, /累计获得\s*硬币?\s*([0-9]+(?:\.[0-9]+)?)/]),
    totalCheckIns: extractFirst(text, [/([0-9]+)\s*累计签到/, /累计签到\s*([0-9]+)/])
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
      return result(input, startedAt, 'needs_handoff', '检测到人机验证或安全验证，需要人工处理。', { screenshotPath });
    }

    const checkInButton = await findCheckInButton(page, site.selectors.checkInButtonText);
    if (!checkInButton) {
      const metrics = extractMetrics(text);
      const alreadyChecked = includesAny(text, site.selectors.alreadyCheckedTexts);
      const message = alreadyChecked ? '页面显示今日可能已签到。' : '未找到签到按钮，可能未登录或页面结构已变化。';
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
      return result(input, startedAt, 'needs_handoff', '点击签到后触发安全验证，需要人工处理。', { screenshotPath, metrics: extractMetrics(text) });
    }

    const metrics = extractMetrics(text);
    const screenshotPath = input.screenshotOnSuccess ? await saveScreenshot(page, input.dataDir, site.id, 'success') : undefined;
    const message = includesAny(text, site.selectors.successTexts) ? '签到完成，页面包含成功提示。' : '已点击签到按钮，请结合余额和截图确认结果。';

    return result(input, startedAt, 'success', message, { metrics, screenshotPath });
  }
}
