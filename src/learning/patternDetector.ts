import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import { DataTag, LearningInsight } from '../types';
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

/** Rileva pattern statistici di conversione commerciale da tutti gli esperimenti */
export function detectCommercialPatterns(product?: string, dataTag?: DataTag): LearningInsight[] {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';

  const insights: LearningInsight[] = [];
  const now = new Date().toISOString();

  // 1. Analisi Pattern per Hook / Opening Variant
  let variantQuery = `
    SELECT ev.opening_hook, ev.cta_type, ev.offer_type, e.product,
           COUNT(DISTINCT ea.prospect_id) as assigned,
           SUM(CASE WHEN ee.event_type = 'EMAIL_SENT' THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN ee.event_type = 'REPLIED' THEN 1 ELSE 0 END) as replies,
           SUM(CASE WHEN ee.event_type = 'POSITIVE_REPLY' THEN 1 ELSE 0 END) as positive,
           SUM(CASE WHEN ee.event_type = 'DEMO_BOOKED' THEN 1 ELSE 0 END) as demos,
           SUM(CASE WHEN ee.event_type = 'CASH_COLLECTED' THEN ee.value ELSE 0 END) as cash
    FROM experiment_variants ev
    JOIN experiments e ON ev.experiment_id = e.id
    LEFT JOIN experiment_assignments ea ON ev.id = ea.variant_id
    LEFT JOIN experiment_events ee ON ev.id = ee.variant_id AND ee.data_tag = ?
    WHERE e.data_tag = ?
  `;
  const params: any[] = [tag, tag];

  if (product) {
    variantQuery += ' AND e.product = ?';
    params.push(product);
  }
  variantQuery += ' GROUP BY ev.opening_hook, ev.cta_type, ev.offer_type, e.product';

  const rows = db.prepare(variantQuery).all(...params) as any[];

  rows.forEach((r, idx) => {
    if (r.sent >= 5) {
      const posReplyRate = r.replies > 0 ? Math.round((r.positive / r.replies) * 100) : 0;
      const demoRate = r.positive > 0 ? Math.round((r.demos / r.positive) * 100) : 0;

      // Pattern Opening Hook
      if (r.opening_hook === 'EVIDENCE_FIRST' && posReplyRate >= 30) {
        insights.push({
          id: `INS_HOOK_${r.product}_${idx}`,
          product: r.product,
          pattern_type: 'OPENING',
          observation: `L'angolo Evidence-First per ${r.product} genera il ${posReplyRate}% di risposte positive su ${r.sent} contatti.`,
          confidence_percent: r.sent >= 30 ? 92 : 65,
          recommendation: 'SCALE',
          evidence_data: { hook: r.opening_hook, sent: r.sent, positive_rate: posReplyRate, cash: r.cash },
          created_at: now,
          data_tag: tag,
        });
      }

      // Pattern CTA Demo
      if (r.cta_type.includes('DEMO') && r.demos > 0) {
        insights.push({
          id: `INS_CTA_${r.product}_${idx}`,
          product: r.product,
          pattern_type: 'CTA',
          observation: `La CTA con accesso demo rapido ha un tasso di conversione in appuntamento del ${demoRate}%.`,
          confidence_percent: r.positive >= 10 ? 88 : 60,
          recommendation: 'SCALE',
          evidence_data: { cta: r.cta_type, demos: r.demos, demo_rate: demoRate },
          created_at: now,
          data_tag: tag,
        });
      }
    }
  });

  // Se nessun pattern è ancora maturo, crea un insight informativo di raccolta
  if (insights.length === 0) {
    insights.push({
      id: `INS_INITIAL_${product || 'ALL'}`,
      product: product || 'all',
      pattern_type: 'SEGMENT',
      observation: `Campagne iniziali attive: i dati statistici stanno maturando con i primi contatti inviati.`,
      confidence_percent: 45,
      recommendation: 'ITERATE',
      evidence_data: { status: 'INSUFFICIENT_DATA' },
      created_at: now,
      data_tag: tag,
    });
  }

  db.close();
  return insights;
}
