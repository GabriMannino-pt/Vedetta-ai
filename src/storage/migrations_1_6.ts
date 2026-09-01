import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_6(customDb?: Database.Database): void {
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

  // 1. career_applications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      opportunity_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'VALIDATED', 'READY', 'BLOCKED', 'SUBMITTED', 'WITHDRAWN')),
      channel TEXT NOT NULL CHECK(channel IN ('UPWORK', 'LINKEDIN', 'DIRECT', 'REFERRAL', 'OTHER')),
      fit_score_snapshot REAL NOT NULL,
      priority_snapshot REAL NOT NULL,
      recommendation_snapshot TEXT NOT NULL,
      fit_algorithm_version INTEGER NOT NULL DEFAULT 1,
      strategy_json TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL,
      proposal_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      FOREIGN KEY (profile_id) REFERENCES career_profile(id) ON DELETE RESTRICT,
      FOREIGN KEY (opportunity_id) REFERENCES career_opportunities(id) ON DELETE RESTRICT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_career_apps_opp ON career_applications(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_career_apps_status ON career_applications(status);
  `);

  // 2. career_proposals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      proposal_status TEXT NOT NULL CHECK(proposal_status IN ('DRAFT', 'VALIDATED', 'BLOCKED', 'READY')),
      proposal_version INTEGER NOT NULL DEFAULT 1,
      proposal_algorithm_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      validated_at TEXT,
      FOREIGN KEY (application_id) REFERENCES career_applications(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_career_proposals_app ON career_proposals(application_id);
  `);

  // 3. career_proposal_claims table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_proposal_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      claim_text TEXT NOT NULL,
      claim_type TEXT NOT NULL,
      support_level TEXT NOT NULL,
      evidence_id INTEGER,
      source_reference TEXT,
      validation_status TEXT NOT NULL CHECK(validation_status IN ('SUPPORTED', 'UNSUPPORTED', 'FLAGGED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (proposal_id) REFERENCES career_proposals(id) ON DELETE CASCADE,
      FOREIGN KEY (evidence_id) REFERENCES career_evidence(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_career_claims_proposal ON career_proposal_claims(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_career_claims_evidence ON career_proposal_claims(evidence_id);
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_6();
  console.log('✅ Migrazioni Vedetta 1.6 (Application Intelligence) completate con successo!');
}
