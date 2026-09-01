import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_3(customDb?: Database.Database): void {
  let db: Database.Database;
  let shouldClose = false;

  if (customDb) {
    db = customDb;
  } else {
    initDb();
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    shouldClose = true;
  }

  // Tabella career_opportunities
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      external_id TEXT,
      fingerprint TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      title TEXT NOT NULL,
      company_name TEXT NOT NULL,
      description TEXT NOT NULL,
      opportunity_type TEXT NOT NULL,
      seniority TEXT NOT NULL,
      location TEXT NOT NULL,
      remote_type TEXT NOT NULL,
      currency TEXT,
      salary_min REAL,
      salary_max REAL,
      salary_period TEXT,
      hourly_rate_min REAL,
      hourly_rate_max REAL,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      applied_at TEXT,
      requirements_extracted TEXT,
      fit_score REAL,
      evidence_score REAL,
      priority_score REAL,
      FOREIGN KEY (profile_id) REFERENCES career_profile(id) ON DELETE CASCADE,
      UNIQUE (source, external_id)
    );
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_3();
  console.log('✅ Migrazioni Vedetta 1.3 (Career Opportunities) completate con successo!');
}
