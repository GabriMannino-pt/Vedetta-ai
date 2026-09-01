import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_9(customDb?: Database.Database): void {
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

  // 1. career_optimization_insights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_optimization_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      segment TEXT NOT NULL,
      metric TEXT NOT NULL,
      observed_value REAL NOT NULL,
      baseline_value REAL NOT NULL,
      delta REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      recommendation TEXT NOT NULL,
      explanation TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opt_insights_dim ON career_optimization_insights(dimension);
    CREATE INDEX IF NOT EXISTS idx_opt_insights_conf ON career_optimization_insights(confidence);
    CREATE INDEX IF NOT EXISTS idx_opt_insights_stat ON career_optimization_insights(status);
    CREATE INDEX IF NOT EXISTS idx_opt_insights_time ON career_optimization_insights(created_at);
  `);

  // 2. career_expected_values table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_expected_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id INTEGER NOT NULL,
      fit_probability REAL NOT NULL,
      response_probability REAL NOT NULL,
      interview_probability REAL NOT NULL,
      offer_probability REAL NOT NULL,
      win_probability REAL NOT NULL,
      expected_revenue REAL NOT NULL,
      expected_time_cost_hours REAL NOT NULL,
      expected_value REAL NOT NULL,
      confidence TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL DEFAULT 1,
      calculated_at TEXT NOT NULL,
      FOREIGN KEY(opportunity_id) REFERENCES career_opportunities(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opt_ev_opp ON career_expected_values(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_opt_ev_val ON career_expected_values(expected_value);
    CREATE INDEX IF NOT EXISTS idx_opt_ev_time ON career_expected_values(calculated_at);
  `);

  // 3. career_adaptation_proposals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_adaptation_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      current_value TEXT NOT NULL,
      proposed_value TEXT NOT NULL,
      rationale TEXT NOT NULL,
      supporting_insights_json TEXT,
      sample_size INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      expected_impact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROPOSED',
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opt_prop_dim ON career_adaptation_proposals(dimension);
    CREATE INDEX IF NOT EXISTS idx_opt_prop_stat ON career_adaptation_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_opt_prop_conf ON career_adaptation_proposals(confidence);
  `);

  // 4. career_optimization_runs table (Audit of Optimization Runs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_optimization_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      algorithm_version INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      observations_count INTEGER NOT NULL DEFAULT 0,
      insights_generated INTEGER NOT NULL DEFAULT 0,
      adaptations_proposed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      metadata_json TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opt_runs_stat ON career_optimization_runs(status);
    CREATE INDEX IF NOT EXISTS idx_opt_runs_time ON career_optimization_runs(started_at);
  `);

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_9();
  console.log('✅ Migrazioni Vedetta 1.9 (Career Optimization & Strategy) completate con successo!');
}
