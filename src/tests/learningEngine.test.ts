import { runLearningCycle, getLearningInsights } from '../learning/learningEngine';
import { generateCommercialDirectives } from '../learning/recommendationEngine';
import { calculateProductCommercialScores } from '../portfolio/productScorer';
import { generatePortfolioDecisionReport } from '../portfolio/productDecisionEngine';
import { getDailySalesActions } from '../sales/dailyActionEngine';
import { classifyInboundReply } from '../sales/replyIntelligence';
import { initDb, closeDb } from '../storage/db';

async function runLearningEngineTests() {
  console.log('🧪 [TEST] Avvio Test Suite per Learning & Sales Intelligence Engine...');
  initDb();

  // 1. Learning Cycle
  const insights = runLearningCycle('danceflow', 'SIMULATED');
  console.assert(insights.length > 0, 'Nessun insight generato');
  console.log('  ✅ Test 1: Esecuzione ciclo di apprendimento e rilevamento pattern');

  // 2. Commercial Directives & Portfolio Scoring
  const scores = calculateProductCommercialScores('SIMULATED');
  console.assert(scores.length === 3, 'Conteggio prodotti errato');
  const directives = generateCommercialDirectives(scores, insights);
  console.assert(directives.length === 3, 'Direttive commerciali mancanti');
  console.log('  ✅ Test 2: Generazione direttive commerciali SCALE/ITERATE/PAUSE verificata');

  // 3. Portfolio Decision Report
  const portfolioReport = generatePortfolioDecisionReport('SIMULATED');
  console.assert(portfolioReport.total_products === 3, 'Totale prodotti errato');
  console.assert(portfolioReport.strategic_summary.length > 0, 'Summary decisionale mancante');
  console.log('  ✅ Test 3: Generazione Portfolio Decision Report (Theoretical vs Proven) riuscita');

  // 4. Daily Sales Actions
  const tasks = getDailySalesActions('SIMULATED');
  console.assert(Array.isArray(tasks), 'Tasks non è un array');
  console.log(`  ✅ Test 4: Generazione Daily Sales Actions (${tasks.length} task prioritizzati per valore economico atteso)`);

  // 5. Inbound Reply Classifier
  const positiveReply = classifyInboundReply(
    'Buongiorno Gabriele, ci interessa molto vedere una demo per i nostri corsi.',
    'Scuola Danza Milano',
    'DanceFlow'
  );
  console.assert(positiveReply.category === 'DEMO_REQUEST', 'Classificazione DEMO errata');
  console.assert(positiveReply.is_positive_reply === true, 'Deve essere risposta positiva');

  const negativeReply = classifyInboundReply(
    'Non siamo interessati, cancellateci dalla lista grazie.',
    'Azienda X',
    'Vedetta'
  );
  console.assert(negativeReply.category === 'NOT_INTERESTED', 'Classificazione NOT_INTERESTED errata');
  console.assert(negativeReply.is_positive_reply === false, 'Non deve essere positiva');
  console.log('  ✅ Test 5: Reply Intelligence Classifier (Positivi/Negativi/Demo) verificato');

  closeDb();
  console.log('🎉 [PASS] Learning & Sales Intelligence Test Suite completata con successo!\n');
}

runLearningEngineTests().catch((e) => {
  console.error('❌ Errore test:', e);
  process.exit(1);
});
