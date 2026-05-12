import type { Page } from 'playwright';
import type { SiteAccessTokenAuth, SiteConfig } from '../types.js';

interface AccessTokenSession {
  authorization: string;
  userId: string;
  user: Record<string, unknown>;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

function stripBearer(token: string): string {
  return token.replace(/^bearer\s+/i, '').trim();
}

function resolveToken(auth: SiteAccessTokenAuth, siteId: string): string {
  const value = auth.accessToken ?? (auth.accessTokenEnv ? process.env[auth.accessTokenEnv] : undefined);
  if (!value?.trim()) {
    const source = auth.accessTokenEnv ? `env ${auth.accessTokenEnv}` : 'auth.accessToken';
    throw new Error(`Missing access token for ${siteId}: set ${source}`);
  }
  return value.trim();
}

function authorizationCandidates(token: string, mode: SiteAccessTokenAuth['headerMode']): string[] {
  const raw = stripBearer(token);
  if (mode === 'raw') {
    return [raw];
  }
  if (mode === 'bearer') {
    return [`Bearer ${raw}`];
  }
  return [raw, `Bearer ${raw}`];
}

async function readApiResponse(response: Awaited<ReturnType<Page['request']['get']>>): Promise<ApiResponse> {
  const contentType = response.headers()['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return { success: false, message: await response.text().catch(() => response.statusText()) };
  }
  return (await response.json().catch(() => ({ success: false, message: response.statusText() }))) as ApiResponse;
}

export async function setupAccessTokenAuth(page: Page, site: SiteConfig): Promise<void> {
  if (site.auth?.type !== 'accessToken') {
    return;
  }

  const token = resolveToken(site.auth, site.id);
  const userId = site.auth.userId;
  const selfUrl = `${site.baseUrl}/api/user/self`;
  const errors: string[] = [];

  for (const authorization of authorizationCandidates(token, site.auth.headerMode)) {
    const response = await page.request.get(selfUrl, {
      headers: {
        Authorization: authorization,
        'New-Api-User': userId,
        'Cache-Control': 'no-store'
      },
      timeout: 15_000
    });
    const body = await readApiResponse(response);
    if (response.ok() && body.success && body.data) {
      await installBrowserAuth(page, {
        authorization,
        userId,
        user: { ...body.data, token: stripBearer(token) }
      });
      return;
    }
    errors.push(`${response.status()} ${body.message ?? response.statusText()}`);
  }

  throw new Error(`Access token auth failed for ${site.id}: ${errors.join('; ')}`);
}

async function installBrowserAuth(page: Page, session: AccessTokenSession): Promise<void> {
  await page.route('**/api/**', async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        Authorization: session.authorization,
        'New-Api-User': session.userId,
        'Cache-Control': 'no-store'
      }
    });
  });

  await page.addInitScript(({ userId, user }) => {
    window.localStorage.setItem('uid', userId);
    window.localStorage.setItem('user', JSON.stringify(user));
  }, {
    userId: session.userId,
    user: session.user
  });
}
