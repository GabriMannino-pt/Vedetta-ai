import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_1(customDb?: Database.Database): void {
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

  // 1. Tabella experiments
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      name TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      start_date TEXT NOT NULL,
      end_date TEXT,
      min_sample_size INTEGER NOT NULL DEFAULT 30,
      winner_variant_id TEXT,
      leading_variant_id TEXT,
      is_statistically_significant INTEGER NOT NULL DEFAULT 0,
      data_tag TEXT NOT NULL DEFAULT 'LIVE'
    );
  `);

  // 2. Tabella experiment_variants
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment_variants (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      opening_hook TEXT NOT NULL,
      cta_type TEXT NOT NULL,
      offer_type TEXT NOT NULL,
      template_content TEXT,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );
  `);

  // 3. Tabella experiment_assignments
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      prospect_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      segment TEXT NOT NULL DEFAULT 'default',
      product TEXT NOT NULL,
      UNIQUE(experiment_id, prospect_id),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES experiment_variants(id) ON DELETE CASCADE
    );
  `);

  // 4. Tabella experiment_events
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      prospect_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      value REAL DEFAULT 0,
      metadata TEXT,
      created_at TEXT NOT NULL,
      data_tag TEXT NOT NULL DEFAULT 'LIVE',
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES experiment_variants(id) ON DELETE CASCADE
    );
  `);

  // 5. Tabella extended_deals (tracciamento revenue e pagamenti)
  db.exec(`
    CREATE TABLE IF NOT EXISTS extended_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      project_name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'DISCOVERED',
      deal_value REAL NOT NULL DEFAULT 0,
      setup_fee REAL NOT NULL DEFAULT 0,
      potential_mrr REAL NOT NULL DEFAULT 0,
      potential_arr REAL NOT NULL DEFAULT 0,
      probability_percent INTEGER NOT NULL DEFAULT 20,
      weighted_value REAL NOT NULL DEFAULT 0,
      cash_collected REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      won_date TEXT,
      lost_reason TEXT,
      attribution_json TEXT,
      data_tag TEXT NOT NULL DEFAULT 'LIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 6. Tabella revenue_events
  db.exec(`
    CREATE TABLE IF NOT EXISTS revenue_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'SETUP',
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      received_at TEXT NOT NULL,
      transaction_ref TEXT,
      attribution_json TEXT,
      data_tag TEXT NOT NULL DEFAULT 'LIVE',
      FOREIGN KEY (deal_id) REFERENCES extended_deals(id) ON DELETE CASCADE
    );
  `);

  // 7. Tabella sales_tasks (Daily Actions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_tasks (
      id TEXT PRIMARY KEY,
      priority_level INTEGER NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      expected_value REAL NOT NULL,
      urgency TEXT NOT NULL,
      action_type TEXT NOT NULL,
      prospect_id INTEGER,
      deal_id INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );
  `);

  // 8. Tabella learning_insights
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_insights (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      observation TEXT NOT NULL,
      confidence_percent REAL NOT NULL,
      recommendation TEXT NOT NULL,
      evidence_data TEXT,
      created_at TEXT NOT NULL,
      data_tag TEXT NOT NULL DEFAULT 'LIVE'
    );
  `);

  // 9. Tabella product_scores
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_scores (
      product_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      theoretical_score REAL NOT NULL DEFAULT 0,
      proven_score REAL NOT NULL DEFAULT 0,
      real_cash_collected REAL NOT NULL DEFAULT 0,
      total_deals_won INTEGER NOT NULL DEFAULT 0,
      decision TEXT NOT NULL DEFAULT '🧪 VALIDATE',
      decision_reason TEXT NOT NULL,
      metrics_json TEXT,
      data_tag TEXT NOT NULL DEFAULT 'LIVE',
      updated_at TEXT NOT NULL
    );
  `);

  // Inizializza Baseline Experiment per DanceFlow (DANCEFLOW_BASELINE_001)
  const existingExp = db.prepare('SELECT id FROM experiments WHERE id = ?').get('DANCEFLOW_BASELINE_001');
  if (!existingExp) {
    db.prepare(`
      INSERT INTO experiments (id, product, name, hypothesis, status, start_date, min_sample_size, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DANCEFLOW_BASELINE_001',
      'danceflow',
      'DanceFlow Baseline Contact Test',
      'Direct factual evidence on registration workflow generates initial awareness and demos',
      'RUNNING',
      new Date().toISOString(),
      30,
      'LIVE'
    );

    db.prepare(`
      INSERT INTO experiment_variants (id, experiment_id, name, type, opening_hook, cta_type, offer_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DANCEFLOW_BASELINE_001_CONTROL',
      'DANCEFLOW_BASELINE_001',
      'Control (Evidence-First Workflow)',
      'CONTROL',
      'EVIDENCE_FIRST',
      'DEMO_OFFER',
      'FREE_PILOT'
    );
  }

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_1();
  console.log('✅ Migrazioni Vedetta 1.1 completate con successo!');
}
