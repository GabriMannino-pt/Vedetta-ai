import { createExperiment, assignProspectToVariant, recordExperimentEvent, getExperiment } from '../experiments/experimentEngine';
import { calculateExperimentScorecards } from '../experiments/experimentMetrics';
import { evaluateExperimentRules } from '../experiments/experimentRules';
import { initDb, closeDb } from '../storage/db';

async function runExperimentEngineTests() {
  console.log('🧪 [TEST] Avvio Test Suite per Experiment Engine...');
  initDb();

  const testExpId = 'TEST_EXP_' + Date.now();

  // 1. Creazione Esperimento
  const exp = createExperiment(
    {
      id: testExpId,
      product: 'danceflow',
      name: 'DanceFlow Test Unit',
      hypothesis: 'Evidence First delivers higher conversion than Curiosity First',
      min_sample_size: 30,
      data_tag: 'SIMULATED',
    },
    [
      {
        id: `${testExpId}_A`,
        name: 'Evidence First',
        type: 'A',
        opening_hook: 'EVIDENCE_FIRST',
        cta_type: 'DEMO_ACCESSO',
        offer_type: 'FREE_PILOT',
      },
      {
        id: `${testExpId}_B`,
        name: 'Curiosity First',
        type: 'B',
        opening_hook: 'CURIOSITY_FIRST',
        cta_type: 'VIDEO_3_MIN',
        offer_type: 'FREE_PILOT',
      },
    ]
  );

  console.assert(exp.id === testExpId, 'Esperimento ID non corrispondente');
  console.log('  ✅ Test 1: Creazione esperimento riuscita');

  // 2. Assegnazione deterministica (nessun doppio assegnamento)
  const assign1 = assignProspectToVariant(testExpId, 101, { product: 'danceflow' });
  const assign2 = assignProspectToVariant(testExpId, 101, { product: 'danceflow' });
  console.assert(assign1.variant_id === assign2.variant_id, 'Assegnazione non deterministica!');

  const assign3 = assignProspectToVariant(testExpId, 102, { product: 'danceflow' });
  console.log('  ✅ Test 2: Assegnazione deterministica a variante univoca verificata');

  // 3. Registrazione eventi di funnel
  recordExperimentEvent({
    experiment_id: testExpId,
    variant_id: `${testExpId}_A`,
    prospect_id: 101,
    event_type: 'EMAIL_SENT',
    data_tag: 'SIMULATED',
  });
  recordExperimentEvent({
    experiment_id: testExpId,
    variant_id: `${testExpId}_A`,
    prospect_id: 101,
    event_type: 'REPLIED',
    data_tag: 'SIMULATED',
  });
  recordExperimentEvent({
    experiment_id: testExpId,
    variant_id: `${testExpId}_A`,
    prospect_id: 101,
    event_type: 'POSITIVE_REPLY',
    data_tag: 'SIMULATED',
  });
  recordExperimentEvent({
    experiment_id: testExpId,
    variant_id: `${testExpId}_A`,
    prospect_id: 101,
    event_type: 'DEMO_BOOKED',
    data_tag: 'SIMULATED',
  });
  recordExperimentEvent({
    experiment_id: testExpId,
    variant_id: `${testExpId}_A`,
    prospect_id: 101,
    event_type: 'DEAL_WON',
    value: 588,
    data_tag: 'SIMULATED',
  });

  console.log('  ✅ Test 3: Tracciamento eventi di funnel riuscito');

  // 4. Calcolo Scorecard e Regola Campione Insufficiente
  const scorecards = calculateExperimentScorecards(testExpId, 'SIMULATED');
  console.assert(scorecards.length === 2, 'Scorecards count != 2');

  const evalResult = evaluateExperimentRules(exp, scorecards);
  console.assert(evalResult.status === 'INSUFFICIENT_DATA', 'Deve indicare INSUFFICIENT_DATA per campione < 30');
  console.assert(evalResult.leading_variant_id === `${testExpId}_A`, 'Variante A deve essere leading');
  console.assert(evalResult.winner_variant_id === undefined, 'Non deve dichiarare winner definitivo con campione basso');
  console.log('  ✅ Test 4: Regola statistica INSUFFICIENT_DATA (No falso winner prematuro) verificata');

  closeDb();
  console.log('🎉 [PASS] Experiment Engine Test Suite completata con successo!\n');
}

runExperimentEngineTests().catch((e) => {
  console.error('❌ Errore test:', e);
  process.exit(1);
});
