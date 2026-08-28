import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import {
  ExtendedDeal,
  RevenueEvent,
  RevenueFunnelStage,
  PaymentStatus,
  DataTag,
  RevenueAttribution,
} from '../types';
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

/** Crea o aggiorna un deal con pricing strutturato e tracciamento funnel */
export function upsertDeal(
  deal: Omit<ExtendedDeal, 'id' | 'created_at' | 'updated_at'> & { id?: number }
): ExtendedDeal {
  const db = getDatabase();
  const now = new Date().toISOString();

  const potentialArr = deal.deal_value || deal.potential_mrr * 12 + (deal.setup_fee || 0);
  const weightedValue = Math.round(potentialArr * (deal.probability_percent / 100));

  let savedDeal: ExtendedDeal;

  if (deal.id) {
    db.prepare(`
      UPDATE extended_deals SET
        stage = ?, deal_value = ?, setup_fee = ?, potential_mrr = ?, potential_arr = ?,
        probability_percent = ?, weighted_value = ?, cash_collected = ?, payment_status = ?,
        won_date = ?, lost_reason = ?, attribution_json = ?, data_tag = ?, updated_at = ?
      WHERE id = ?
    `).run(
      deal.stage,
      potentialArr,
      deal.setup_fee || 0,
      deal.potential_mrr || 0,
      potentialArr,
      deal.probability_percent,
      weightedValue,
      deal.cash_collected || 0,
      deal.payment_status || 'PENDING',
      deal.won_date || null,
      deal.lost_reason || null,
      deal.attribution ? JSON.stringify(deal.attribution) : null,
      deal.data_tag || 'LIVE',
      now,
      deal.id
    );

    savedDeal = {
      ...deal,
      deal_value: potentialArr,
      potential_arr: potentialArr,
      weighted_value: weightedValue,
      created_at: now,
      updated_at: now,
    };
  } else {
    const res = db
      .prepare(`
      INSERT INTO extended_deals (
        prospect_id, project_name, company_name, stage, deal_value, setup_fee,
        potential_mrr, potential_arr, probability_percent, weighted_value, cash_collected,
        payment_status, won_date, lost_reason, attribution_json, data_tag, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        deal.prospect_id,
        deal.project_name,
        deal.company_name,
        deal.stage,
        potentialArr,
        deal.setup_fee || 0,
        deal.potential_mrr || 0,
        potentialArr,
        deal.probability_percent,
        weightedValue,
        deal.cash_collected || 0,
        deal.payment_status || 'PENDING',
        deal.won_date || null,
        deal.lost_reason || null,
        deal.attribution ? JSON.stringify(deal.attribution) : null,
        deal.data_tag || 'LIVE',
        now,
        now
      );

    savedDeal = {
      ...deal,
      id: Number(res.lastInsertRowid),
      deal_value: potentialArr,
      potential_arr: potentialArr,
      weighted_value: weightedValue,
      created_at: now,
      updated_at: now,
    };
  }

  db.close();
  return savedDeal;
}

/** Registra un incasso di denaro effettivo (CASH COLLECTED) associato a un deal */
export function recordCashPayment(payment: {
  deal_id: number;
  amount: number;
  payment_type: 'SETUP' | 'RECURRING_MRR' | 'ONE_TIME';
  transaction_ref?: string;
  attribution?: RevenueAttribution;
  data_tag?: DataTag;
}): RevenueEvent {
  const db = getDatabase();
  const now = new Date().toISOString();
  const dataTag = payment.data_tag || 'LIVE';

  // 1. Inserisci evento di revenue
  const res = db
    .prepare(`
    INSERT INTO revenue_events (deal_id, amount, payment_type, status, received_at, transaction_ref, attribution_json, data_tag)
    VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?)
  `)
    .run(
      payment.deal_id,
      payment.amount,
      payment.payment_type,
      now,
      payment.transaction_ref || null,
      payment.attribution ? JSON.stringify(payment.attribution) : null,
      dataTag
    );

  // 2. Aggiorna lo stato del deal: somma cash_collected e passa lo stage a PAYMENT_RECEIVED
  const currentDeal = db
    .prepare('SELECT * FROM extended_deals WHERE id = ?')
    .get(payment.deal_id) as any;

  if (currentDeal) {
    const newCash = (currentDeal.cash_collected || 0) + payment.amount;
    db.prepare(`
      UPDATE extended_deals SET
        stage = 'PAYMENT_RECEIVED',
        cash_collected = ?,
        payment_status = 'RECEIVED',
        won_date = COALESCE(won_date, ?),
        updated_at = ?
      WHERE id = ?
    `).run(newCash, now, now, payment.deal_id);
  }

  db.close();

  return {
    id: Number(res.lastInsertRowid),
    deal_id: payment.deal_id,
    amount: payment.amount,
    payment_type: payment.payment_type,
    status: 'RECEIVED',
    received_at: now,
    transaction_ref: payment.transaction_ref,
    attribution: payment.attribution,
    data_tag: dataTag,
  };
}

/** Ottieni la lista dei deal filtrata */
export function listExtendedDeals(dataTag?: DataTag): ExtendedDeal[] {
  const db = getDatabase();
  let query = 'SELECT * FROM extended_deals';
  const params: any[] = [];

  if (dataTag) {
    query += ' WHERE data_tag = ?';
    params.push(dataTag);
  }
  query += ' ORDER BY weighted_value DESC, deal_value DESC';

  const rows = db.prepare(query).all(...params) as any[];
  db.close();

  return rows.map((r) => ({
    ...r,
    attribution: r.attribution_json ? JSON.parse(r.attribution_json) : undefined,
  }));
}
