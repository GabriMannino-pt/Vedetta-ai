import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_2(customDb?: Database.Database): void {
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

  // 1. Tabella career_profile
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      years_experience INTEGER NOT NULL DEFAULT 0,
      seniority TEXT NOT NULL,
      target_salary_min REAL NOT NULL DEFAULT 0,
      target_salary_max REAL NOT NULL DEFAULT 0,
      target_hourly_rate REAL NOT NULL DEFAULT 0,
      remote_preference TEXT NOT NULL DEFAULT 'REMOTE',
      location TEXT NOT NULL,
      career_goal TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 2. Tabella career_skills
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      skill TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      years_experience INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'LOW',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES career_profile(id) ON DELETE CASCADE
    );
  `);

  // 3. Tabella career_evidence
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      project_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      source_reference TEXT,
      skill_id INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'LOW',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES career_profile(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(name) ON DELETE SET NULL,
      FOREIGN KEY (skill_id) REFERENCES career_skills(id) ON DELETE CASCADE
    );
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_2();
  console.log('✅ Migrazioni Vedetta 1.2 (Career OS) completate con successo!');
}
