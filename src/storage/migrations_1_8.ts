import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_8(customDb?: Database.Database): void {
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

  // 1. career_actions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      opportunity_id INTEGER,
      application_id INTEGER,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload_json TEXT,
      source TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL DEFAULT 1,
      scheduled_for TEXT,
      approved_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES career_profile(id) ON DELETE CASCADE,
      FOREIGN KEY(opportunity_id) REFERENCES career_opportunities(id) ON DELETE SET NULL,
      FOREIGN KEY(application_id) REFERENCES career_applications(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_career_actions_prof ON career_actions(profile_id);
    CREATE INDEX IF NOT EXISTS idx_career_actions_opp ON career_actions(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_career_actions_app ON career_actions(application_id);
    CREATE INDEX IF NOT EXISTS idx_career_actions_status ON career_actions(status);
    CREATE INDEX IF NOT EXISTS idx_career_actions_priority ON career_actions(priority);
    CREATE INDEX IF NOT EXISTS idx_career_actions_type ON career_actions(action_type);
    CREATE INDEX IF NOT EXISTS idx_career_actions_sched ON career_actions(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_career_actions_created ON career_actions(created_at);
  `);

  // 2. career_action_audit table (Append-only action audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_action_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(action_id) REFERENCES career_actions(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_action_audit_action ON career_action_audit(action_id);
    CREATE INDEX IF NOT EXISTS idx_action_audit_time ON career_action_audit(created_at);
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_8();
  console.log('✅ Migrazioni Vedetta 1.8 (Career Execution Engine & Audit) completate con successo!');
}
