import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_7(customDb?: Database.Database): void {
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

  // 1. career_outcome_events table (Append-only event log)
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_outcome_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      opportunity_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_at TEXT NOT NULL,
      source TEXT NOT NULL,
      notes TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES career_profile(id) ON DELETE CASCADE,
      FOREIGN KEY(application_id) REFERENCES career_applications(id) ON DELETE CASCADE,
      FOREIGN KEY(opportunity_id) REFERENCES career_opportunities(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outcome_events_app ON career_outcome_events(application_id);
    CREATE INDEX IF NOT EXISTS idx_outcome_events_opp ON career_outcome_events(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_outcome_events_prof ON career_outcome_events(profile_id);
    CREATE INDEX IF NOT EXISTS idx_outcome_events_type ON career_outcome_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_outcome_events_time ON career_outcome_events(event_at);
  `);

  // 2. career_outcome_snapshots table (Derived consolidated projection)
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_outcome_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL UNIQUE,
      submitted INTEGER NOT NULL DEFAULT 0,
      response_received INTEGER NOT NULL DEFAULT 0,
      interview_invited INTEGER NOT NULL DEFAULT 0,
      interview_completed INTEGER NOT NULL DEFAULT 0,
      offer_received INTEGER NOT NULL DEFAULT 0,
      won INTEGER NOT NULL DEFAULT 0,
      lost INTEGER NOT NULL DEFAULT 0,
      final_outcome TEXT NOT NULL,
      days_to_response REAL,
      days_to_interview REAL,
      days_to_offer REAL,
      days_to_close REAL,
      revenue REAL DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      calculated_at TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(application_id) REFERENCES career_applications(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outcome_snap_app ON career_outcome_snapshots(application_id);
  `);

  // 3. career_learning_observations table (Learning Engine dataset)
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_learning_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL UNIQUE,
      opportunity_id INTEGER NOT NULL,
      fit_score REAL NOT NULL,
      application_priority REAL NOT NULL,
      technical_match REAL NOT NULL,
      experience_match REAL NOT NULL,
      seniority_match REAL NOT NULL,
      domain_match REAL NOT NULL,
      evidence_score REAL NOT NULL,
      must_have_coverage REAL NOT NULL,
      nice_to_have_coverage REAL NOT NULL,
      remote_match REAL NOT NULL,
      language_match REAL NOT NULL,
      critical_gap INTEGER NOT NULL,
      recommendation TEXT NOT NULL,
      channel TEXT NOT NULL,
      source TEXT NOT NULL,
      outcome TEXT NOT NULL,
      revenue REAL NOT NULL DEFAULT 0,
      fit_algorithm_version INTEGER NOT NULL,
      learning_algorithm_version INTEGER NOT NULL DEFAULT 1,
      observed_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES career_applications(id) ON DELETE CASCADE,
      FOREIGN KEY(opportunity_id) REFERENCES career_opportunities(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_obs_outcome ON career_learning_observations(outcome);
    CREATE INDEX IF NOT EXISTS idx_learning_obs_channel ON career_learning_observations(channel);
    CREATE INDEX IF NOT EXISTS idx_learning_obs_fit ON career_learning_observations(fit_score);
    CREATE INDEX IF NOT EXISTS idx_learning_obs_ver ON career_learning_observations(learning_algorithm_version);
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_7();
  console.log('✅ Migrazioni Vedetta 1.7 (Career Outcome Tracking & Learning) completate con successo!');
}
