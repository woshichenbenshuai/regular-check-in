import fs from 'node:fs';
import path from 'node:path';

export function ensureRuntimeDirs(dataDir: string): void {
  for (const dir of ['sessions', 'screenshots']) {
    fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
  }
}

export function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}
