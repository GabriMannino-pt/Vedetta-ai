import { ProductCommercialScores, DataTag } from '../types';
import { calculateProductCommercialScores } from './productScorer';

export interface PortfolioDecisionReport {
  timestamp: string;
  data_tag: DataTag;
  total_products: number;
  scale_count: number;
  validate_count: number;
  iterate_count: number;
  pause_count: number;
  products: ProductCommercialScores[];
  top_priority_product: string;
  strategic_summary: string;
}

/** Genera il report decisionale del portfolio prodotti basato sui dati reali */
export function generatePortfolioDecisionReport(dataTag?: DataTag): PortfolioDecisionReport {
  const tag = dataTag || 'LIVE';
  const products = calculateProductCommercialScores(tag);

  let scaleCount = 0;
  let validateCount = 0;
  let iterateCount = 0;
  let pauseCount = 0;

  products.forEach((p) => {
    if (p.decision === '🚀 SCALE') scaleCount += 1;
    else if (p.decision === '🧪 VALIDATE') validateCount += 1;
    else if (p.decision === '🔧 ITERATE') iterateCount += 1;
    else if (p.decision === '⏸ PAUSE' || p.decision === '❌ ABANDON') pauseCount += 1;
  });

  const sortedByProven = [...products].sort((a, b) => b.proven_score - a.proven_score);
  const topProduct = sortedByProven[0]?.name || 'DanceFlow';

  return {
    timestamp: new Date().toISOString(),
    data_tag: tag,
    total_products: products.length,
    scale_count: scaleCount,
    validate_count: validateCount,
    iterate_count: iterateCount,
    pause_count: pauseCount,
    products,
    top_priority_product: topProduct,
    strategic_summary: `Priorità commerciale concentrata su ${topProduct}. Dati costantemente verificati dall'Evidence Guard e confrontati con gli incassi reali.`,
  };
}
