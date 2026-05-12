import type { Page } from 'playwright';
import { createAccessTokenSession } from '../core/access-token-auth.js';
import type { CheckInMetrics, CheckInResult, SiteConfig } from '../types.js';

interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
}

interface CheckinStatusData {
  stats?: {
    total_checkins?: number;
    total_quota?: number;
    checkin_count?: number;
    checked_in_today?: boolean;
  };
}

interface CheckinData {
  quota_awarded?: number;
  checkin_date?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function authHeaders(authorization: string, appId: string): Record<string, string> {
  return {
    Authorization: authorization,
    'New-Api-User': appId,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
}

function statusToMetrics(data?: CheckinStatusData): CheckInMetrics {
  const stats = data?.stats;
  return {
    totalCheckIns: stats?.total_checkins === undefined ? undefined : String(stats.total_checkins),
    totalEarned: stats?.total_quota === undefined ? undefined : String(stats.total_quota),
    monthlyEarned: stats?.checkin_count === undefined ? undefined : String(stats.checkin_count)
  };
}

async function readJson<T>(response: Awaited<ReturnType<Page['request']['post']>>): Promise<ApiResponse<T>> {
  return (await response.json().catch(async () => ({
    success: false,
    message: await response.text().catch(() => response.statusText())
  }))) as ApiResponse<T>;
}

async function fetchStatus(page: Page, site: SiteConfig, authorization: string, appId: string): Promise<ApiResponse<CheckinStatusData> | undefined> {
  const response = await page.request.get(`${site.baseUrl}/api/user/checkin?month=${currentMonth()}`, {
    headers: authHeaders(authorization, appId),
    timeout: 15_000
  });
  return readJson<CheckinStatusData>(response);
}

function isAlreadyChecked(message: string): boolean {
  return /今日.*已.*签到|已.*签到|already/i.test(message);
}

function needsVerification(message: string): boolean {
  return /turnstile|captcha|验证码|人机|安全验证/i.test(message);
}

export async function runNewApiCheckin(page: Page, site: SiteConfig, startedAt: string): Promise<CheckInResult | undefined> {
  const session = await createAccessTokenSession(page, site);
  if (!session) {
    return undefined;
  }

  const response = await page.request.post(`${site.baseUrl}/api/user/checkin`, {
    headers: authHeaders(session.authorization, session.appId),
    timeout: 15_000
  });
  const body = await readJson<CheckinData>(response);
  const status = await fetchStatus(page, site, session.authorization, session.appId).catch(() => undefined);
  const message = body.message ?? response.statusText();

  if (response.ok() && body.success) {
    return {
      siteId: site.id,
      siteName: site.name,
      status: 'success',
      message: `API check-in completed${body.data?.quota_awarded === undefined ? '' : `, awarded ${body.data.quota_awarded}`}.`,
      startedAt,
      finishedAt: nowIso(),
      metrics: statusToMetrics(status?.data),
      diagnostics: {
        mode: 'api',
        endpoint: '/api/user/checkin',
        response: body
      }
    };
  }

  return {
    siteId: site.id,
    siteName: site.name,
    status: needsVerification(message) ? 'needs_handoff' : isAlreadyChecked(message) || status?.data?.stats?.checked_in_today ? 'skipped' : 'failed',
    message,
    startedAt,
    finishedAt: nowIso(),
    metrics: statusToMetrics(status?.data),
    diagnostics: {
      mode: 'api',
      endpoint: '/api/user/checkin',
      httpStatus: response.status(),
      response: body
    }
  };
}
