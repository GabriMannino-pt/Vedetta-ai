import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import { DataTag, LearningInsight } from '../types';
import { detectCommercialPatterns } from './patternDetector';
import * as path from 'path';
import * as fs from 'fs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

function getDatabase(): Database.Database {
  initDb();
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  return new Database(DB_PATH);
}

/** Esegue il ciclo completo di learning engine e sincronizza gli insight */
export function runLearningCycle(product?: string, dataTag?: DataTag): LearningInsight[] {
  const tag = dataTag || 'LIVE';
  const insights = detectCommercialPatterns(product, tag);

  const db = getDatabase();
  const upsertStmt = db.prepare(`
    INSERT INTO learning_insights (id, product, pattern_type, observation, confidence_percent, recommendation, evidence_data, created_at, data_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      observation = excluded.observation,
      confidence_percent = excluded.confidence_percent,
      recommendation = excluded.recommendation,
      evidence_data = excluded.evidence_data,
      data_tag = excluded.data_tag
  `);

  insights.forEach((i) => {
    upsertStmt.run(
      i.id,
      i.product,
      i.pattern_type,
      i.observation,
      i.confidence_percent,
      i.recommendation,
      i.evidence_data ? JSON.stringify(i.evidence_data) : null,
      i.created_at,
      i.data_tag
    );
  });

  db.close();
  return insights;
}

/** Recupera gli insight dal database */
export function getLearningInsights(product?: string, dataTag?: DataTag): LearningInsight[] {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';

  let query = 'SELECT * FROM learning_insights WHERE data_tag = ?';
  const params: any[] = [tag];

  if (product) {
    query += ' AND product = ?';
    params.push(product);
  }
  query += ' ORDER BY confidence_percent DESC';

  const rows = db.prepare(query).all(...params) as any[];
  db.close();

  return rows.map((r) => ({
    ...r,
    evidence_data: r.evidence_data ? JSON.parse(r.evidence_data) : undefined,
  }));
}
