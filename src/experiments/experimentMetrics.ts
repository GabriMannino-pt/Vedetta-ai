import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import { ExperimentScorecard, DataTag, ExperimentVariant } from '../types';
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

/** Calcola la scorecard dettagliata per tutte le varianti di un esperimento */
export function calculateExperimentScorecards(
  experimentId: string,
  dataTag?: DataTag
): ExperimentScorecard[] {
  const db = getDatabase();

  const variants = db
    .prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?')
    .all(experimentId) as ExperimentVariant[];

  const scorecards: ExperimentScorecard[] = [];

  for (const variant of variants) {
    // 1. Sample Size (prospect assegnati)
    const assignRow = db
      .prepare('SELECT COUNT(*) as cnt FROM experiment_assignments WHERE experiment_id = ? AND variant_id = ?')
      .get(experimentId, variant.id) as { cnt: number };
    const sampleSize = assignRow ? assignRow.cnt : 0;

    // 2. Eventi aggregati per tipo
    let eventQuery = `
      SELECT event_type, COUNT(*) as cnt, SUM(value) as total_val
      FROM experiment_events
      WHERE experiment_id = ? AND variant_id = ?
    `;
    const params: any[] = [experimentId, variant.id];

    if (dataTag) {
      eventQuery += ' AND data_tag = ?';
      params.push(dataTag);
    }
    eventQuery += ' GROUP BY event_type';

    const eventRows = db.prepare(eventQuery).all(...params) as {
      event_type: string;
      cnt: number;
      total_val: number | null;
    }[];

    const eventMap = new Map<string, { cnt: number; total_val: number }>();
    eventRows.forEach((r) => {
      eventMap.set(r.event_type, { cnt: r.cnt, total_val: r.total_val || 0 });
    });

    const emailsSent = eventMap.get('EMAIL_SENT')?.cnt || 0;
    const replies = eventMap.get('REPLIED')?.cnt || 0;
    const positiveReplies = eventMap.get('POSITIVE_REPLY')?.cnt || 0;
    const demos = eventMap.get('DEMO_BOOKED')?.cnt || 0;
    const proposals = eventMap.get('PROPOSAL_SENT')?.cnt || 0;
    const won = eventMap.get('DEAL_WON')?.cnt || 0;
    const cashCollected = eventMap.get('CASH_COLLECTED')?.total_val || 0;

    // 3. Tassi di conversione (arrotondati a 1 decimale)
    const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 1000) / 10 : 0;
    const positiveReplyRate = replies > 0 ? Math.round((positiveReplies / replies) * 1000) / 10 : 0;
    const demoRate = positiveReplies > 0 ? Math.round((demos / positiveReplies) * 1000) / 10 : 0;
    const closeRate = demos > 0 ? Math.round((won / demos) * 1000) / 10 : 0;

    const revPerProspect = sampleSize > 0 ? Math.round((cashCollected / sampleSize) * 100) / 100 : 0;
    const revPer100 = Math.round(revPerProspect * 100);

    scorecards.push({
      variant_id: variant.id,
      variant_name: variant.name,
      sample_size: sampleSize,
      emails_sent: emailsSent,
      replies,
      positive_replies: positiveReplies,
      demos,
      proposals,
      won,
      cash_collected: cashCollected,
      reply_rate: replyRate,
      positive_reply_rate: positiveReplyRate,
      demo_rate: demoRate,
      close_rate: closeRate,
      revenue_per_prospect: revPerProspect,
      revenue_per_100_prospects: revPer100,
      status: 'INSUFFICIENT_DATA', // Verrà aggiornato da experimentRules
    });
  }

  db.close();
  return scorecards;
}
