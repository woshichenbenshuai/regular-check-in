import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import type { RuntimeConfig, SiteConfig, SiteSelectors } from './types.js';

const defaultSelectors: SiteSelectors = {
  checkInButtonText: '立即签到',
  alreadyCheckedTexts: ['已签到', '今日已签到', '已经签到', '明日再来'],
  successTexts: ['签到成功', '领取成功', '获得', '奖励'],
  challengeTexts: ['人机验证', '安全验证', '验证码', 'captcha', 'challenge', 'cf-challenge']
};

const siteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  personalPath: z.string().default('/console/personal'),
  enabled: z.boolean().default(true),
  schedule: z.string().optional(),
  sessionFile: z.string().optional(),
  selectors: z
    .object({
      checkInButtonText: z.string().optional(),
      alreadyCheckedTexts: z.array(z.string()).optional(),
      successTexts: z.array(z.string()).optional(),
      challengeTexts: z.array(z.string()).optional()
    })
    .optional()
});

const sitesSchema = z.array(siteSchema);

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

function loadRawSites(): unknown {
  if (process.env.CHECKIN_SITES_JSON) {
    return JSON.parse(process.env.CHECKIN_SITES_JSON);
  }

  const sitesPath = path.resolve(process.cwd(), 'config', 'sites.json');
  if (!fs.existsSync(sitesPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
}

function normalizeSite(site: z.infer<typeof siteSchema>): SiteConfig {
  return {
    id: site.id,
    name: site.name,
    baseUrl: site.baseUrl.replace(/\/$/, ''),
    personalPath: site.personalPath.startsWith('/') ? site.personalPath : `/${site.personalPath}`,
    enabled: site.enabled,
    schedule: site.schedule,
    sessionFile: site.sessionFile,
    selectors: {
      checkInButtonText: site.selectors?.checkInButtonText ?? defaultSelectors.checkInButtonText,
      alreadyCheckedTexts: site.selectors?.alreadyCheckedTexts ?? defaultSelectors.alreadyCheckedTexts,
      successTexts: site.selectors?.successTexts ?? defaultSelectors.successTexts,
      challengeTexts: site.selectors?.challengeTexts ?? defaultSelectors.challengeTexts
    }
  };
}

export function loadConfig(): RuntimeConfig {
  const rawSites = loadRawSites();
  const parsedSites = sitesSchema.parse(rawSites).map(normalizeSite);
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));

  return {
    dataDir,
    headless: boolFromEnv('HEADLESS', true),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    timezone: process.env.TIMEZONE ?? 'Asia/Shanghai',
    cron: process.env.CHECKIN_CRON ?? '15 9 * * *',
    screenshotOnSuccess: boolFromEnv('SCREENSHOT_ON_SUCCESS', false),
    handoffTimeoutSeconds: numberFromEnv('HANDOFF_TIMEOUT_SECONDS', 0),
    sites: parsedSites
  };
}
