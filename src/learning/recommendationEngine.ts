import { ProductCommercialScores, LearningInsight } from '../types';

export interface CommercialDirective {
  product: string;
  recommendation: 'SCALE' | 'ITERATE' | 'PAUSE' | 'ABANDON';
  headline: string;
  rationale: string;
  allocated_effort_percent: number; // e.g. 70% of effort
  suggested_action: string;
}

/** Genera la sintesi decisionale strategica per ciascun prodotto */
export function generateCommercialDirectives(
  productScores: ProductCommercialScores[],
  insights: LearningInsight[]
): CommercialDirective[] {
  const directives: CommercialDirective[] = [];

  productScores.forEach((p) => {
    const relevantInsights = insights.filter((i) => i.product.toLowerCase() === p.product_id.toLowerCase());
    const hasScaleInsight = relevantInsights.some((i) => i.recommendation === 'SCALE');

    if (p.real_cash_collected > 0 || (p.total_deals_won > 0 && p.metrics.conversion_rate >= 15)) {
      directives.push({
        product: p.name,
        recommendation: 'SCALE',
        headline: `🚀 SCALE: Prodotto con validazione economica reale comprovata`,
        rationale: `Generati €${p.real_cash_collected} reali di cash con ${p.total_deals_won} deal chiusi.`,
        allocated_effort_percent: 60,
        suggested_action: `Aumentare il volume di outreach sull'angolo vincente e avviare campagne parallele su segmenti simili.`,
      });
    } else if (p.metrics.replies > 0 || p.metrics.demos > 0 || hasScaleInsight) {
      directives.push({
        product: p.name,
        recommendation: 'ITERATE',
        headline: `🧪 VALIDATE & ITERATE: Segnali positivi di interesse in corso di maturazione`,
        rationale: `Ottenute ${p.metrics.replies} risposte e ${p.metrics.demos} demo. Il mercato risponde ma occorre ottimizzare la chiusura dei deal.`,
        allocated_effort_percent: 30,
        suggested_action: `Rifinire l'offerta commerciale e testare varianti di CTA orientate alla chiusura diretta.`,
      });
    } else if (p.metrics.prospects_contacted >= 30 && p.metrics.replies === 0) {
      directives.push({
        product: p.name,
        recommendation: 'PAUSE',
        headline: `⏸ PAUSE: Scarsa reattività sul segmento attuale`,
        rationale: `Inviati ${p.metrics.prospects_contacted} contatti senza risposte. Evitare di sprecare ulteriori risorse senza cambiare ICP.`,
        allocated_effort_percent: 5,
        suggested_action: `Pausare l'outreach su questo target e ridefinire l'Ideal Customer Profile prima di riavviare.`,
      });
    } else {
      directives.push({
        product: p.name,
        recommendation: 'ITERATE',
        headline: `🧪 VALIDATE: Campagna iniziale attiva`,
        rationale: `Numero di contatti ancora in fase di espansione (${p.metrics.prospects_contacted}/30 minimi per significatività).`,
        allocated_effort_percent: 10,
        suggested_action: `Completare l'invio della prima tranche di prospect verificati dall'Evidence Guard.`,
      });
    }
  });

  return directives;
}
