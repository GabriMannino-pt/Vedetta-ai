import { Experiment, ExperimentScorecard, ExperimentStatus } from '../types';

export interface ExperimentEvaluationResult {
  status: ExperimentStatus;
  is_statistically_significant: boolean;
  winner_variant_id?: string;
  leading_variant_id?: string;
  recommendation: string;
  scorecards: ExperimentScorecard[];
}

/** Valuta la significatività statistica e le regole di decisione di un esperimento */
export function evaluateExperimentRules(
  experiment: Experiment,
  scorecards: ExperimentScorecard[]
): ExperimentEvaluationResult {
  if (!scorecards || scorecards.length === 0) {
    return {
      status: 'DRAFT',
      is_statistically_significant: false,
      recommendation: 'Nessun dato registrato per le varianti.',
      scorecards: [],
    };
  }

  const minSampleSize = experiment.min_sample_size || 30;
  const totalSent = scorecards.reduce((sum, s) => sum + s.emails_sent, 0);

  // Ordina le varianti per revenue prima, poi per positive reply rate, poi per reply rate
  const sorted = [...scorecards].sort((a, b) => {
    if (b.cash_collected !== a.cash_collected) return b.cash_collected - a.cash_collected;
    if (b.won !== a.won) return b.won - a.won;
    if (b.demos !== a.demos) return b.demos - a.demos;
    if (b.positive_replies !== a.positive_replies) return b.positive_replies - a.positive_replies;
    return b.replies - a.replies;
  });

  const topVariant = sorted[0];
  const leadingId = topVariant?.variant_id;

  // 1. Regola Stop-Loss: campione >= 50 e 0 risposte positive
  if (totalSent >= 50 && scorecards.every((s) => s.positive_replies === 0)) {
    scorecards.forEach((s) => (s.status = 'LOSING'));
    return {
      status: 'FAILED',
      is_statistically_significant: true,
      leading_variant_id: leadingId,
      recommendation: `STOP-LOSS ATTIVATO: Raggiunti ${totalSent} invii senza risposte positive. Suggerito cambio drastico di offerta o segmento.`,
      scorecards,
    };
  }

  // 2. Controllo dimensione minima del campione
  const allReachMinSample = scorecards.every((s) => s.emails_sent >= minSampleSize);

  if (!allReachMinSample) {
    // Aggiorna lo stato di ogni variante come LEADING o INSUFFICIENT_DATA
    scorecards.forEach((s) => {
      if (s.variant_id === leadingId && (s.replies > 0 || s.cash_collected > 0)) {
        s.status = 'LEADING';
      } else {
        s.status = 'INSUFFICIENT_DATA';
      }
    });

    return {
      status: 'INSUFFICIENT_DATA',
      is_statistically_significant: false,
      leading_variant_id: leadingId,
      recommendation: `Dati insufficienti (${totalSent}/${minSampleSize * scorecards.length} invii target). Variante attualmente in testa: ${topVariant.variant_name} (nessun vincitore definitivo dichiarato).`,
      scorecards,
    };
  }

  // 3. Campione sufficiente: verifica se c'è un chiaro vincitore
  const runnerUp = sorted[1];
  const hasClearLead =
    topVariant.cash_collected > (runnerUp?.cash_collected || 0) ||
    topVariant.won > (runnerUp?.won || 0) ||
    topVariant.positive_reply_rate >= (runnerUp?.positive_reply_rate || 0) * 1.3;

  if (hasClearLead) {
    scorecards.forEach((s) => {
      s.status = s.variant_id === leadingId ? 'WINNER' : 'LOSING';
    });

    return {
      status: 'WINNER_FOUND',
      is_statistically_significant: true,
      winner_variant_id: leadingId,
      leading_variant_id: leadingId,
      recommendation: `VINCITORE CONFERMATO: ${topVariant.variant_name} ha dimostrato metriche superiori (${topVariant.positive_reply_rate}% risposte positive, €${topVariant.cash_collected} incassati). Suggerito SCALE su questa variante.`,
      scorecards,
    };
  }

  scorecards.forEach((s) => (s.status = 'LEADING'));
  return {
    status: 'RUNNING',
    is_statistically_significant: false,
    leading_variant_id: leadingId,
    recommendation: `Test bilanciato: le varianti mostrano prestazioni simili. Continuare il test o iterare con una nuova ipotesi più differenziata.`,
    scorecards,
  };
}
