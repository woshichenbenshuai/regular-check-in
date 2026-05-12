import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import type { CheckInResult } from '../types.js';

export class AppStorage {
  private readonly dbPath: string;

  private constructor(
    private readonly db: Database,
    dataDir: string
  ) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.dbPath = path.join(dataDir, 'app.db');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkin_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        site_name TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        screenshot_path TEXT,
        metrics_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.persist();
  }

  static async open(dataDir: string): Promise<AppStorage> {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'app.db');
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    });
    const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    return new AppStorage(db, dataDir);
  }

  recordRun(result: CheckInResult): void {
    const statement = this.db.prepare(
      `INSERT INTO checkin_runs (
          site_id,
          site_name,
          status,
          message,
          started_at,
          finished_at,
          screenshot_path,
          metrics_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    statement.run([
      result.siteId,
      result.siteName,
      result.status,
      result.message,
      result.startedAt,
      result.finishedAt,
      result.screenshotPath ?? null,
      result.metrics ? JSON.stringify(result.metrics) : null
    ]);
    statement.free();
    this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  close(): void {
    this.persist();
    this.db.close();
  }
}
