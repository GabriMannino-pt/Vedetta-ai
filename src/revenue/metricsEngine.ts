import { getDb } from '../storage/db';
import { DataTag, ExtendedDeal, RevenueEvent } from '../types';

function getDatabase() {
  return getDb();
}

export interface RevenueDashboardSummary {
  data_tag: DataTag;
  cash_collected: number;
  total_mrr: number;
  total_arr: number;
  won_deals_count: number;
  open_pipeline: number;
  weighted_pipeline: number;
  revenue_by_product: {
    product: string;
    cash_collected: number;
    mrr: number;
    arr: number;
    won_deals: number;
    open_pipeline: number;
  }[];
  funnel_conversion: {
    total_contacted: number;
    replies: number;
    positive_replies: number;
    demos: number;
    proposals: number;
    won: number;
    paid: number;
    reply_rate: number;
    positive_reply_rate: number;
    demo_rate: number;
    close_rate: number;
    cash_conversion_rate: number;
  };
}

/** Calcola le metriche finanziarie e di conversione funnel per la dashboard Revenue */
export function calculateRevenueDashboard(dataTag?: DataTag): RevenueDashboardSummary {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';

  // 1. Incasso effettivo (CASH COLLECTED) dalla tabella revenue_events
  const cashRow = db
    .prepare('SELECT SUM(amount) as total_cash FROM revenue_events WHERE data_tag = ? AND status = ?')
    .get(tag, 'RECEIVED') as { total_cash: number | null };
  const cashCollected = cashRow?.total_cash || 0;

  // 2. Deals
  const deals = db.prepare('SELECT * FROM extended_deals WHERE data_tag = ?').all(tag) as ExtendedDeal[];

  let totalMrr = 0;
  let totalArr = 0;
  let wonDealsCount = 0;
  let openPipeline = 0;
  let weightedPipeline = 0;

  const productMap = new Map<
    string,
    { cash: number; mrr: number; arr: number; won: number; open: number }
  >();

  deals.forEach((d) => {
    const prod = d.project_name.toLowerCase();
    const curr = productMap.get(prod) || { cash: 0, mrr: 0, arr: 0, won: 0, open: 0 };

    if (d.stage === 'WON' || d.stage === 'PAYMENT_RECEIVED' || d.stage === 'PAYMENT_PENDING') {
      wonDealsCount += 1;
      totalMrr += d.potential_mrr || 0;
      totalArr += d.deal_value || d.potential_arr || 0;
      curr.won += 1;
      curr.mrr += d.potential_mrr || 0;
      curr.arr += d.deal_value || d.potential_arr || 0;
      curr.cash += d.cash_collected || 0;
    } else if (d.stage !== 'LOST') {
      const val = d.deal_value || d.potential_arr || 0;
      const weighted = Math.round(val * (d.probability_percent / 100));
      openPipeline += val;
      weightedPipeline += weighted;
      curr.open += val;
    }
    productMap.set(prod, curr);
  });

  const revenueByProduct = Array.from(productMap.entries()).map(([product, data]) => ({
    product,
    cash_collected: data.cash,
    mrr: data.mrr,
    arr: data.arr,
    won_deals: data.won,
    open_pipeline: data.open,
  }));

  // 3. Eventi del funnel commerciale per i tassi di conversione
  const eventRows = db
    .prepare(`
    SELECT event_type, COUNT(*) as cnt
    FROM experiment_events
    WHERE data_tag = ?
    GROUP BY event_type
  `)
    .all(tag) as { event_type: string; cnt: number }[];

  const eMap = new Map<string, number>();
  eventRows.forEach((r) => eMap.set(r.event_type, r.cnt));

  const totalContacted = eMap.get('EMAIL_SENT') || 0;
  const replies = eMap.get('REPLIED') || 0;
  const positiveReplies = eMap.get('POSITIVE_REPLY') || 0;
  const demos = eMap.get('DEMO_BOOKED') || 0;
  const proposals = eMap.get('PROPOSAL_SENT') || 0;
  const won = eMap.get('DEAL_WON') || wonDealsCount;
  const paid = eMap.get('CASH_COLLECTED') || (cashCollected > 0 ? 1 : 0);

  const replyRate = totalContacted > 0 ? Math.round((replies / totalContacted) * 1000) / 10 : 0;
  const positiveReplyRate = replies > 0 ? Math.round((positiveReplies / replies) * 1000) / 10 : 0;
  const demoRate = positiveReplies > 0 ? Math.round((demos / positiveReplies) * 1000) / 10 : 0;
  const closeRate = demos > 0 ? Math.round((won / demos) * 1000) / 10 : 0;
  const cashConversionRate = won > 0 ? Math.round((paid / won) * 1000) / 10 : 0;

  db.close();

  return {
    data_tag: tag,
    cash_collected: cashCollected,
    total_mrr: totalMrr,
    total_arr: totalArr,
    won_deals_count: wonDealsCount,
    open_pipeline: openPipeline,
    weighted_pipeline: weightedPipeline,
    revenue_by_product: revenueByProduct,
    funnel_conversion: {
      total_contacted: totalContacted,
      replies,
      positive_replies: positiveReplies,
      demos,
      proposals,
      won,
      paid,
      reply_rate: replyRate,
      positive_reply_rate: positiveReplyRate,
      demo_rate: demoRate,
      close_rate: closeRate,
      cash_conversion_rate: cashConversionRate,
    },
  };
}

/** Risale la catena di attribuzione per un incasso o deal */
export function getAttributionDetails(revenueEventId: number): {
  amount: number;
  received_at: string;
  attribution: any;
} | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(revenueEventId) as RevenueEvent & {
    attribution_json?: string;
  };
  db.close();

  if (!row) return null;
  return {
    amount: row.amount,
    received_at: row.received_at,
    attribution: row.attribution_json ? JSON.parse(row.attribution_json) : null,
  };
}
