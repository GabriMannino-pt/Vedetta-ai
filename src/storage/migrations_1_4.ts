import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_4(customDb?: Database.Database): void {
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

  // 1. Aggiunta colonne a career_opportunities (ALTER TABLE)
  const columnsToAdd = [
    { name: 'analysis_status', type: "TEXT NOT NULL DEFAULT 'NOT_ANALYZED'" },
    { name: 'analysis_summary', type: 'TEXT' },
    { name: 'role_focus_json', type: 'TEXT' },
    { name: 'responsibilities_json', type: 'TEXT' },
    { name: 'technologies_json', type: 'TEXT' },
    { name: 'languages_json', type: 'TEXT' },
    { name: 'seniority_signals_json', type: 'TEXT' },
    { name: 'remote_signals_json', type: 'TEXT' },
    { name: 'risk_signals_json', type: 'TEXT' },
    { name: 'extraction_confidence', type: 'REAL' },
    { name: 'analyzed_at', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE career_opportunities ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column might already exist, ignore error safely
    }
  }

  // 2. Tabella career_opportunity_requirements
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_opportunity_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      years_required REAL,
      source_text TEXT NOT NULL,
      source_type TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      analysis_version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (opportunity_id) REFERENCES career_opportunities(id) ON DELETE CASCADE,
      UNIQUE (opportunity_id, normalized_name, category, analysis_version)
    );
  `);

  // 3. Indici utili per i requisiti
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_req_opp_id ON career_opportunity_requirements(opportunity_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_req_norm_name ON career_opportunity_requirements(normalized_name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_req_priority ON career_opportunity_requirements(priority)`);
  } catch (e) {}

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_4();
  console.log('✅ Migrazioni Vedetta 1.4 (Opportunity Requirements) completate con successo!');
}
