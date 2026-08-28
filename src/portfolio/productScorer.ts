import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import { ProductCommercialScores, DataTag, ExtendedDeal } from '../types';
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

/** Calcola sia il Theoretical Commercial Score che il Proven Commercial Score */
export function calculateProductCommercialScores(dataTag?: DataTag): ProductCommercialScores[] {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';

  const products = [
    { id: 'danceflow', name: 'DanceFlow', theoretical: 88 },
    { id: 'vedetta', name: 'Vedetta B2B Outbound Engine', theoretical: 85 },
    { id: 'ai-automation', name: 'AI Automation & Agents Studio', theoretical: 82 },
  ];

  const results: ProductCommercialScores[] = [];

  products.forEach((p) => {
    // 1. Dati Deals
    const deals = db
      .prepare(`
      SELECT * FROM extended_deals
      WHERE project_name = ? AND data_tag = ?
    `)
      .all(p.id.toUpperCase(), tag) as ExtendedDeal[];

    let realCash = 0;
    let wonDeals = 0;

    deals.forEach((d) => {
      realCash += d.cash_collected || 0;
      if (d.stage === 'WON' || d.stage === 'PAYMENT_RECEIVED') {
        wonDeals += 1;
      }
    });

    // 2. Eventi Outreach / Funnel
    const events = db
      .prepare(`
      SELECT ee.event_type, COUNT(*) as cnt
      FROM experiment_events ee
      JOIN experiments e ON ee.experiment_id = e.id
      WHERE e.product = ? AND ee.data_tag = ?
      GROUP BY ee.event_type
    `)
      .all(p.id, tag) as { event_type: string; cnt: number }[];

    const eMap = new Map<string, number>();
    events.forEach((e) => eMap.set(e.event_type, e.cnt));

    const contacted = eMap.get('EMAIL_SENT') || 0;
    const replies = eMap.get('REPLIED') || 0;
    const positiveReplies = eMap.get('POSITIVE_REPLY') || 0;
    const demos = eMap.get('DEMO_BOOKED') || 0;

    // 3. Calcolo PROVEN COMMERCIAL SCORE (0-100)
    // Peso metriche reali: Cash (40%), Won (25%), Demos (15%), Positive Replies (10%), Sample Size (10%)
    let provenScore = 0;
    if (realCash > 0) provenScore += Math.min(40, (realCash / 500) * 40);
    if (wonDeals > 0) provenScore += Math.min(25, wonDeals * 15);
    if (demos > 0) provenScore += Math.min(15, demos * 5);
    if (positiveReplies > 0) provenScore += Math.min(10, positiveReplies * 3);
    if (contacted >= 30) provenScore += 10;
    else provenScore += Math.round((contacted / 30) * 10);

    provenScore = Math.min(100, Math.round(provenScore));

    // 4. Decisione Commerciale Rigorosa
    let decision: ProductCommercialScores['decision'] = '🧪 VALIDATE';
    let decisionReason = 'Dati commerciali in fase di accumulo iniziale.';

    if (provenScore >= 60 || realCash > 0) {
      decision = '🚀 SCALE';
      decisionReason = `Validazione confermata dal mercato: generati €${realCash} di cassa con ${wonDeals} clienti paganti.`;
    } else if (demos > 0 || positiveReplies > 0) {
      decision = '🔧 ITERATE';
      decisionReason = `Interesse confermato (${demos} demo, ${positiveReplies} risposte positive); ottimizzare la proposta economica.`;
    } else if (contacted >= 30 && replies === 0) {
      decision = '⏸ PAUSE';
      decisionReason = `Raggiunti ${contacted} contatti senza risposte. Pausare prima di investire ulteriori ore.`;
    } else if (contacted < 30) {
      decision = '🧪 VALIDATE';
      decisionReason = `Campagna attiva con ${contacted}/30 contatti minimi inviati.`;
    }

    const conversionRate = contacted > 0 ? Math.round((wonDeals / contacted) * 1000) / 10 : 0;

    results.push({
      product_id: p.id,
      name: p.name,
      theoretical_score: p.theoretical,
      proven_score: provenScore,
      real_cash_collected: realCash,
      total_deals_won: wonDeals,
      decision,
      decision_reason: decisionReason,
      metrics: {
        prospects_contacted: contacted,
        replies,
        demos,
        conversion_rate: conversionRate,
      },
      data_tag: tag,
    });
  });

  db.close();
  return results;
}
