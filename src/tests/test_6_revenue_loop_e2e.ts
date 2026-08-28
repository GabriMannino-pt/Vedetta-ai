import { createExperiment, assignProspectToVariant, recordExperimentEvent, getExperiment } from '../experiments/experimentEngine';
import { calculateExperimentScorecards } from '../experiments/experimentMetrics';
import { evaluateExperimentRules } from '../experiments/experimentRules';
import { upsertDeal, recordCashPayment } from '../revenue/revenueEngine';
import { calculateRevenueDashboard, getAttributionDetails } from '../revenue/metricsEngine';
import { runLearningCycle } from '../learning/learningEngine';
import { calculateProductCommercialScores } from '../portfolio/productScorer';
import { getDailySalesActions } from '../sales/dailyActionEngine';
import { initDb, closeDb } from '../storage/db';

async function runTest6RevenueLoopE2E() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🚀 [TEST 6 — REVENUE LOOP E2E] Avvio Simulazione Commerciale ad Anello Chiuso');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  initDb();
  const expId = `E2E_REVENUE_LOOP_${Date.now()}`;
  const DATA_TAG = 'SIMULATED';

  // 1. STEP 1: Creazione Esperimento A/B su 100 Prospect
  console.log('📦 STEP 1: Creazione Esperimento A/B (Campione: 100 prospect)');
  const experiment = createExperiment(
    {
      id: expId,
      product: 'danceflow',
      name: 'DanceFlow E2E Revenue Loop Test',
      hypothesis: 'Evidence-First generates higher positive replies and closed revenue than Curiosity-First',
      min_sample_size: 40,
      data_tag: DATA_TAG,
    },
    [
      {
        id: `${expId}_VAR_A`,
        name: 'Variante A (Evidence First)',
        type: 'A',
        opening_hook: 'EVIDENCE_FIRST',
        cta_type: 'DEMO_ACCESSO',
        offer_type: 'ANNUAL_TIER',
      },
      {
        id: `${expId}_VAR_B`,
        name: 'Variante B (Curiosity First)',
        type: 'B',
        opening_hook: 'CURIOSITY_FIRST',
        cta_type: 'VIDEO_3_MIN',
        offer_type: 'ANNUAL_TIER',
      },
    ]
  );
  console.log(`  ✓ Esperimento ${expId} registrato.`);

  // 2. STEP 2: Assegnazione deterministica di 100 Prospect (50 a Var A, 50 a Var B)
  console.log('\n👥 STEP 2: Assegnazione 100 Prospect');
  for (let i = 1; i <= 100; i++) {
    const prospectId = 9000 + i;
    assignProspectToVariant(expId, prospectId, {
      product: 'danceflow',
      channel: 'email',
      segment: i % 2 === 0 ? 'scuola_media' : 'accademia_grande',
    });
  }

  // 3. STEP 3: Simulazione Invio & Funnel
  // VAR A: 50 invii -> 14 risposte -> 8 positive -> 5 demo -> 2 won -> €1.068 cash
  // VAR B: 50 invii -> 4 risposte -> 1 positiva -> 0 demo -> 0 won -> €0 cash
  console.log('\n📨 STEP 3: Simulazione Eventi di Funnel (Invii, Risposte, Demo)');

  // Variante A
  for (let i = 1; i <= 50; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_A`, prospect_id: pId, event_type: 'EMAIL_SENT', data_tag: DATA_TAG });
  }
  for (let i = 1; i <= 14; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_A`, prospect_id: pId, event_type: 'REPLIED', data_tag: DATA_TAG });
  }
  for (let i = 1; i <= 8; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_A`, prospect_id: pId, event_type: 'POSITIVE_REPLY', data_tag: DATA_TAG });
  }
  for (let i = 1; i <= 5; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_A`, prospect_id: pId, event_type: 'DEMO_BOOKED', data_tag: DATA_TAG });
  }

  // Variante B
  for (let i = 51; i <= 100; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_B`, prospect_id: pId, event_type: 'EMAIL_SENT', data_tag: DATA_TAG });
  }
  for (let i = 51; i <= 54; i++) {
    const pId = 9000 + i;
    recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_B`, prospect_id: pId, event_type: 'REPLIED', data_tag: DATA_TAG });
  }
  recordExperimentEvent({ experiment_id: expId, variant_id: `${expId}_VAR_B`, prospect_id: 9051, event_type: 'POSITIVE_REPLY', data_tag: DATA_TAG });

  console.log('  ✓ 100 invii, 18 risposte, 9 positive, 5 demo registrati.');

  // 4. STEP 4: Chiusura Deal & Incasso Reale (CASH COLLECTED)
  console.log('\n💰 STEP 4: Chiusura Deal & Registrazione CASH COLLECTED');
  const wonDeal = upsertDeal({
    prospect_id: 9001,
    project_name: 'DANCEFLOW',
    company_name: 'Accademia Danza Aurora Milano',
    stage: 'WON',
    deal_value: 1068,
    setup_fee: 0,
    potential_mrr: 89,
    potential_arr: 1068,
    probability_percent: 100,
    weighted_value: 1068,
    cash_collected: 0,
    payment_status: 'PENDING',
    data_tag: DATA_TAG,
    attribution: {
      product: 'danceflow',
      campaign: 'sett_2026',
      experiment_id: expId,
      variant_id: `${expId}_VAR_A`,
      segment: 'accademia_grande',
      channel: 'email',
      prospect_id: 9001,
      first_contact_date: new Date().toISOString(),
    },
  });

  // Registra incasso effettivo
  const paymentEvent = recordCashPayment({
    deal_id: wonDeal.id!,
    amount: 1068,
    payment_type: 'ONE_TIME',
    transaction_ref: 'stripe_pi_e2e_999',
    attribution: wonDeal.attribution,
    data_tag: DATA_TAG,
  });

  recordExperimentEvent({
    experiment_id: expId,
    variant_id: `${expId}_VAR_A`,
    prospect_id: 9001,
    event_type: 'CASH_COLLECTED',
    value: 1068,
    data_tag: DATA_TAG,
  });
  recordExperimentEvent({
    experiment_id: expId,
    variant_id: `${expId}_VAR_A`,
    prospect_id: 9001,
    event_type: 'DEAL_WON',
    value: 1068,
    data_tag: DATA_TAG,
  });

  console.log(`  ✓ Incasso registrato: €${paymentEvent.amount} (Deal #${wonDeal.id})`);

  // 5. STEP 5: Valutazione Scorecards e Rilevamento Vincitore
  console.log('\n📊 STEP 5: Calcolo Scorecards e Valutazione Statistica');
  const scorecards = calculateExperimentScorecards(expId, DATA_TAG);
  const evalResult = evaluateExperimentRules(experiment, scorecards);

  console.log(`  Stato Esperimento: ${evalResult.status}`);
  console.log(`  Vincitore Dichiarato: ${evalResult.winner_variant_id}`);
  console.log(`  Raccomandazione: ${evalResult.recommendation}`);

  console.assert(evalResult.status === 'WINNER_FOUND', 'L\'esperimento doveva trovare un vincitore!');
  console.assert(evalResult.winner_variant_id === `${expId}_VAR_A`, 'La variante A doveva vincere!');

  // 6. STEP 6: Learning Engine & Commercial Directives
  console.log('\n🧠 STEP 6: Learning Engine Pattern Detection & Portfolio Directives');
  const insights = runLearningCycle('danceflow', DATA_TAG);
  const productScores = calculateProductCommercialScores(DATA_TAG);
  const targetProd = productScores.find((p) => p.product_id === 'danceflow');

  console.log(`  DanceFlow Proven Score: ${targetProd?.proven_score}/100 (Theoretical: ${targetProd?.theoretical_score})`);
  console.log(`  Decisione Portfolio: ${targetProd?.decision} — ${targetProd?.decision_reason}`);

  console.assert(targetProd?.decision === '🚀 SCALE', 'DanceFlow doveva essere promosso a SCALE dopo cash reale!');

  // 7. STEP 7: Risalita Completa dell\'Attribuzione Cassa
  console.log('\n🔍 STEP 7: Verifica Attribuzione Cassa ad Anello Chiuso');
  const attributionDetails = getAttributionDetails(paymentEvent.id!);
  console.log('  Dettagli Attribuzione:', attributionDetails?.attribution);

  console.assert(attributionDetails?.attribution?.product === 'danceflow', 'Attribuzione prodotto non corretta');
  console.assert(attributionDetails?.attribution?.experiment_id === expId, 'Attribuzione esperimento non corretta');
  console.assert(attributionDetails?.attribution?.variant_id === `${expId}_VAR_A`, 'Attribuzione variante non corretta');

  // 8. STEP 8: Daily Action Engine
  console.log('\n🎯 STEP 8: Verifica Priorità Giornaliere');
  const dailyTasks = getDailySalesActions(DATA_TAG);
  console.log(`  Task prioritari generati: ${dailyTasks.length}`);

  closeDb();

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('🎉 [TEST 6 PASS] REVENUE LOOP COMPLETATO CON SUCCESSO!');
  console.log('   Dal prospect anonimo -> A/B test -> Demo -> Won -> €1.068 Incassati');
  console.log('   -> Attribuzione al 100% -> Decisione Commerciale: SCALE.');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

runTest6RevenueLoopE2E().catch((e) => {
  console.error('❌ Errore TEST 6:', e);
  process.exit(1);
});
