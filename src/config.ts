import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import type { RuntimeConfig, SiteConfig, SiteAuthConfig } from './types.js';

const authSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('accessToken'),
      appId: z.union([z.string(), z.number()]).optional(),
      userId: z.union([z.string(), z.number()]).optional(),
      accessToken: z.string().optional(),
      accessTokenEnv: z.string().optional(),
      headerMode: z.enum(['auto', 'raw', 'bearer']).default('auto')
    })
  ])
  .optional();

const siteSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  url: z.string().url().optional(),
  baseUrl: z.string().url().optional(),
  personalPath: z.string().default('/console/personal'),
  enabled: z.boolean().default(true),
  schedule: z.string().optional(),
  sessionFile: z.string().optional(),
  appId: z.union([z.string(), z.number()]).optional(),
  userId: z.union([z.string(), z.number()]).optional(),
  accessToken: z.string().optional(),
  accessTokenEnv: z.string().optional(),
  headerMode: z.enum(['auto', 'raw', 'bearer']).default('auto'),
  auth: authSchema,
  selectors: z
    .object({
      checkInButtonText: z.string().optional(),
      checkInButtonTexts: z.array(z.string()).optional(),
      alreadyCheckedTexts: z.array(z.string()).optional(),
      successTexts: z.array(z.string()).optional(),
      challengeTexts: z.array(z.string()).optional()
    })
    .optional()
});

const sitesSchema = z.array(siteSchema);
const appConfigSchema = z.object({
  headless: z.boolean().optional(),
  timezone: z.string().optional(),
  cron: z.string().optional(),
  screenshotOnSuccess: z.boolean().optional(),
  handoffTimeoutSeconds: z.number().optional(),
  sites: sitesSchema.default([])
});

type FileConfig = z.infer<typeof appConfigSchema>;
type SiteInput = z.infer<typeof siteSchema>;

function boolFromEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function numberFromEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function loadFileConfig(): FileConfig {
  const configPath = path.resolve(process.cwd(), 'config', 'config.json');
  if (fs.existsSync(configPath)) {
    return appConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  }

  const legacySitesPath = path.resolve(process.cwd(), 'config', 'sites.json');
  if (fs.existsSync(legacySitesPath)) {
    return appConfigSchema.parse({
      sites: JSON.parse(fs.readFileSync(legacySitesPath, 'utf8'))
    });
  }

  return appConfigSchema.parse({});
}

function loadRawSites(fileConfig: FileConfig): unknown {
  if (process.env.CHECKIN_SITES_JSON) {
    return JSON.parse(process.env.CHECKIN_SITES_JSON);
  }

  return fileConfig.sites;
}

function normalizeAuth(site: SiteInput): SiteAuthConfig | undefined {
  if (site.auth?.type === 'accessToken') {
    const appId = site.auth.appId ?? site.auth.userId;
    if (appId === undefined) {
      throw new Error(`Site ${site.id} auth.appId is required for accessToken auth`);
    }
    return {
      type: 'accessToken',
      appId: String(appId),
      accessToken: site.auth.accessToken,
      accessTokenEnv: site.auth.accessTokenEnv,
      headerMode: site.auth.headerMode
    };
  }

  const appId = site.appId ?? site.userId;
  if (appId === undefined && !site.accessToken && !site.accessTokenEnv) {
    return undefined;
  }
  if (appId === undefined) {
    throw new Error(`Site ${site.id} appId is required when accessToken/accessTokenEnv is configured`);
  }

  return {
    type: 'accessToken',
    appId: String(appId),
    accessToken: site.accessToken,
    accessTokenEnv: site.accessTokenEnv,
    headerMode: site.headerMode
  };
}

function normalizeSite(site: SiteInput): SiteConfig {
  const baseUrl = site.baseUrl ?? site.url;
  if (!baseUrl) {
    throw new Error(`Site ${site.id} requires url or baseUrl`);
  }

  return {
    id: site.id,
    name: site.name ?? site.id,
    baseUrl: baseUrl.replace(/\/$/, ''),
    personalPath: site.personalPath.startsWith('/') ? site.personalPath : `/${site.personalPath}`,
    enabled: site.enabled,
    schedule: site.schedule,
    sessionFile: site.sessionFile,
    auth: normalizeAuth(site),
    selectors: {
      checkInButtonText: site.selectors?.checkInButtonText ?? '\u7acb\u5373\u7b7e\u5230',
      checkInButtonTexts: site.selectors?.checkInButtonTexts ?? [site.selectors?.checkInButtonText ?? '\u7acb\u5373\u7b7e\u5230', '\u7b7e\u5230', '\u7acb\u5373\u9886\u53d6', '\u9886\u53d6\u5956\u52b1'],
      alreadyCheckedTexts: site.selectors?.alreadyCheckedTexts ?? ['\u5df2\u7b7e\u5230', '\u4eca\u65e5\u5df2\u7b7e\u5230', '\u5df2\u7ecf\u7b7e\u5230', '\u660e\u65e5\u518d\u6765'],
      successTexts: site.selectors?.successTexts ?? ['\u7b7e\u5230\u6210\u529f', '\u9886\u53d6\u6210\u529f', '\u83b7\u5f97', '\u5956\u52b1'],
      challengeTexts: site.selectors?.challengeTexts ?? ['\u4eba\u673a\u9a8c\u8bc1', '\u5b89\u5168\u9a8c\u8bc1', '\u9a8c\u8bc1\u7801', 'captcha', 'challenge', 'cf-challenge']
    }
  };
}

export function loadConfig(): RuntimeConfig {
  const fileConfig = loadFileConfig();
  const rawSites = loadRawSites(fileConfig);
  const parsedSites = sitesSchema.parse(rawSites).map(normalizeSite);
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));

  return {
    dataDir,
    headless: boolFromEnv('HEADLESS', fileConfig.headless ?? true),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    timezone: process.env.TIMEZONE ?? fileConfig.timezone ?? 'Asia/Shanghai',
    cron: process.env.CHECKIN_CRON ?? fileConfig.cron ?? '15 9 * * *',
    screenshotOnSuccess: boolFromEnv('SCREENSHOT_ON_SUCCESS', fileConfig.screenshotOnSuccess ?? false),
    handoffTimeoutSeconds: numberFromEnv('HANDOFF_TIMEOUT_SECONDS', fileConfig.handoffTimeoutSeconds ?? 0),
    sites: parsedSites
  };
}
