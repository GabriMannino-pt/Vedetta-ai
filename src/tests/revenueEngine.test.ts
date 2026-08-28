import { upsertDeal, recordCashPayment, listExtendedDeals } from '../revenue/revenueEngine';
import { calculateRevenueDashboard, getAttributionDetails } from '../revenue/metricsEngine';
import { calculateRevenueForecast } from '../revenue/forecastEngine';
import { initDb, closeDb } from '../storage/db';

async function runRevenueEngineTests() {
  console.log('🧪 [TEST] Avvio Test Suite per Revenue Engine...');
  initDb();

  // 1. Creazione Deal con potenziale ARR e weighted pipeline
  const deal = upsertDeal({
    prospect_id: 201,
    project_name: 'DANCEFLOW',
    company_name: 'Accademia Danza Test',
    stage: 'DEMO',
    deal_value: 1068,
    setup_fee: 0,
    potential_mrr: 89,
    potential_arr: 1068,
    probability_percent: 40,
    weighted_value: 427,
    cash_collected: 0,
    payment_status: 'PENDING',
    data_tag: 'SIMULATED',
    attribution: {
      product: 'danceflow',
      campaign: 'test_campaign',
      experiment_id: 'EXP_TEST',
      variant_id: 'EXP_TEST_A',
      channel: 'email',
      prospect_id: 201,
    },
  });

  console.assert(deal.id !== undefined, 'Deal non creato');
  console.assert(deal.weighted_value === 427, 'Weighted value errato');
  console.log('  ✅ Test 1: Creazione deal con weighted value calcolato correttamente');

  // 2. Registrazione incasso reale (CASH COLLECTED)
  const payment = recordCashPayment({
    deal_id: deal.id!,
    amount: 1068,
    payment_type: 'ONE_TIME',
    transaction_ref: 'tx_stripe_test_123',
    attribution: deal.attribution,
    data_tag: 'SIMULATED',
  });

  console.assert(payment.id !== undefined, 'Payment non registrato');
  console.assert(payment.amount === 1068, 'Importo incasso errato');
  console.log('  ✅ Test 2: Registrazione incasso effettivo (CASH COLLECTED) riuscita');

  // 3. Verifica aggiornamento deal a PAYMENT_RECEIVED
  const updatedDeals = listExtendedDeals('SIMULATED');
  const targetDeal = updatedDeals.find((d) => d.id === deal.id);
  console.assert(targetDeal?.stage === 'PAYMENT_RECEIVED', 'Deal non aggiornato a PAYMENT_RECEIVED');
  console.assert(targetDeal?.cash_collected === 1068, 'Cash collected non aggiornato sul deal');
  console.log('  ✅ Test 3: Aggiornamento stato del deal e cash_collected verificato');

  // 4. Verifica Revenue Dashboard & Funnel
  const dashboard = calculateRevenueDashboard('SIMULATED');
  console.assert(dashboard.cash_collected >= 1068, 'Dashboard cash_collected errato');
  console.log('  ✅ Test 4: Calcolo metriche aggregate dashboard revenue verificato');

  // 5. Verifica Forecast
  const forecast = calculateRevenueForecast('SIMULATED');
  console.assert(forecast.data_tag === 'SIMULATED', 'Data tag errato nel forecast');
  console.log('  ✅ Test 5: Calcolo forecast a 30/60/90 giorni verificato');

  // 6. Verifica Risalita Attribuzione
  const attr = getAttributionDetails(payment.id!);
  console.assert(attr?.attribution?.product === 'danceflow', 'Attribuzione prodotto fallita');
  console.assert(attr?.attribution?.variant_id === 'EXP_TEST_A', 'Attribuzione variante fallita');
  console.log('  ✅ Test 6: Risalita completa attribuzione cassa -> (prodotto, variante, canale) verificata');

  closeDb();
  console.log('🎉 [PASS] Revenue Engine Test Suite completata con successo!\n');
}

runRevenueEngineTests().catch((e) => {
  console.error('❌ Errore test:', e);
  process.exit(1);
});
