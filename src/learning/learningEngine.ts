import { getDb } from '../storage/db';
import { DataTag, LearningInsight } from '../types';
import { detectCommercialPatterns } from './patternDetector';

function getDatabase() {
  return getDb();
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
