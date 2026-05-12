import type { BrowserContext, Page } from 'playwright';

export type RunStatus = 'success' | 'skipped' | 'failed' | 'needs_handoff';

export interface SiteSelectors {
  checkInButtonText: string;
  checkInButtonTexts: string[];
  alreadyCheckedTexts: string[];
  successTexts: string[];
  challengeTexts: string[];
}

export type AccessTokenHeaderMode = 'auto' | 'raw' | 'bearer';

export interface SiteAccessTokenAuth {
  type: 'accessToken';
  appId: string;
  accessToken?: string;
  accessTokenEnv?: string;
  headerMode: AccessTokenHeaderMode;
}

export type SiteAuthConfig = SiteAccessTokenAuth;

export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  personalPath: string;
  enabled: boolean;
  schedule?: string;
  sessionFile?: string;
  auth?: SiteAuthConfig;
  selectors: SiteSelectors;
}

export interface RuntimeConfig {
  dataDir: string;
  headless: boolean;
  logLevel: string;
  timezone: string;
  cron: string;
  screenshotOnSuccess: boolean;
  handoffTimeoutSeconds: number;
  sites: SiteConfig[];
}

export interface CheckInMetrics {
  balance?: string;
  monthlyEarned?: string;
  totalEarned?: string;
  totalCheckIns?: string;
}

export interface CheckInResult {
  siteId: string;
  siteName: string;
  status: RunStatus;
  message: string;
  startedAt: string;
  finishedAt: string;
  screenshotPath?: string;
  metrics?: CheckInMetrics;
  diagnostics?: Record<string, unknown>;
}

export interface SiteAdapter {
  run(input: SiteRunInput): Promise<CheckInResult>;
}

export interface SiteRunInput {
  site: SiteConfig;
  context: BrowserContext;
  page: Page;
  dataDir: string;
  screenshotOnSuccess: boolean;
  handoffTimeoutSeconds: number;
}
