import Database from 'better-sqlite3';
import { initDb, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

export function runMigrations1_5(customDb?: Database.Database): void {
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

  // Aggiunta colonne per il Fit Scoring a career_opportunities (ALTER TABLE)
  const columnsToAdd = [
    { name: 'application_priority', type: 'REAL' },
    { name: 'technical_match', type: 'REAL' },
    { name: 'experience_match', type: 'REAL' },
    { name: 'seniority_match', type: 'REAL' },
    { name: 'domain_match', type: 'REAL' },
    { name: 'remote_match', type: 'REAL' },
    { name: 'language_match', type: 'REAL' },
    { name: 'must_have_coverage', type: 'REAL' },
    { name: 'nice_to_have_coverage', type: 'REAL' },
    { name: 'critical_gap', type: 'INTEGER DEFAULT 0' },
    { name: 'fit_recommendation', type: 'TEXT' },
    { name: 'fit_breakdown_json', type: 'TEXT' },
    { name: 'fit_explanation_json', type: 'TEXT' },
    { name: 'fit_calculated_at', type: 'TEXT' },
    { name: 'fit_algorithm_version', type: 'INTEGER DEFAULT 1' }
  ];

  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE career_opportunities ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column might already exist, ignore safely
    }
  }

  if (shouldClose) {
    db.close();
    closeDb();
  }
}

if (require.main === module) {
  runMigrations1_5();
  console.log('✅ Migrazioni Vedetta 1.5 (Fit Scoring Persistence) completate con successo!');
}
