import Database from 'better-sqlite3';
import { initDb } from '../storage/db';
import { DataTag, ExtendedDeal } from '../types';
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

export interface ForecastSummary {
  data_tag: DataTag;
  total_open_pipeline: number;
  total_weighted_pipeline: number;
  forecast_30_days: number;
  forecast_60_days: number;
  forecast_90_days: number;
  deals_by_stage: {
    stage: string;
    count: number;
    total_val: number;
    weighted_val: number;
  }[];
}

/** Calcola il forecast finanziario ponderato e temporale */
export function calculateRevenueForecast(dataTag?: DataTag): ForecastSummary {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';

  const deals = db
    .prepare(`
    SELECT * FROM extended_deals
    WHERE data_tag = ? AND stage NOT IN ('LOST', 'PAYMENT_RECEIVED')
  `)
    .all(tag) as ExtendedDeal[];

  let totalOpenPipeline = 0;
  let totalWeightedPipeline = 0;

  const stageMap = new Map<string, { count: number; total_val: number; weighted_val: number }>();

  deals.forEach((d) => {
    const val = d.deal_value || d.potential_arr || 0;
    const weighted = Math.round(val * (d.probability_percent / 100));

    totalOpenPipeline += val;
    totalWeightedPipeline += weighted;

    const curr = stageMap.get(d.stage) || { count: 0, total_val: 0, weighted_val: 0 };
    curr.count += 1;
    curr.total_val += val;
    curr.weighted_val += weighted;
    stageMap.set(d.stage, curr);
  });

  // Previsione temporale (30/60/90 giorni) basata sugli stadi di avanzamento
  let forecast30 = 0;
  let forecast60 = 0;
  let forecast90 = 0;

  deals.forEach((d) => {
    const weighted = Math.round((d.deal_value || d.potential_arr || 0) * (d.probability_percent / 100));
    if (d.stage === 'WON' || d.stage === 'PAYMENT_PENDING') {
      forecast30 += d.deal_value; // Certezza a brevissimo termine
    } else if (d.stage === 'PROPOSAL' || d.stage === 'NEGOTIATION') {
      forecast30 += Math.round(weighted * 0.7);
      forecast60 += weighted;
    } else if (d.stage === 'DEMO') {
      forecast60 += Math.round(weighted * 0.6);
      forecast90 += weighted;
    } else {
      forecast90 += Math.round(weighted * 0.5);
    }
  });

  const dealsByStage = Array.from(stageMap.entries()).map(([stage, data]) => ({
    stage,
    count: data.count,
    total_val: data.total_val,
    weighted_val: data.weighted_val,
  }));

  db.close();

  return {
    data_tag: tag,
    total_open_pipeline: totalOpenPipeline,
    total_weighted_pipeline: totalWeightedPipeline,
    forecast_30_days: forecast30,
    forecast_60_days: forecast60,
    forecast_90_days: forecast90,
    deals_by_stage: dealsByStage,
  };
}
