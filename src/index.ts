import { fetchRedditPosts } from './sources/reddit';
import { fetchUpworkJobs } from './sources/upwork';
import { scorePost } from './scoring/gemini';
import { initDb, isAlreadyProcessed, insertLead, markAsProcessed, closeDb, countLeads } from './storage/db';
import { generateReport } from './report/generator';
import { sendTelegramReport } from './report/sender';
import { appConfig } from './config';
import { RawPost } from './types';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('');
  console.log('═'.repeat(50));
  console.log('🔭 VEDETTA — Lead Scouting Run');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log('═'.repeat(50));
  console.log('');

  // ── 1. Inizializza database ──
  initDb();

  // ── 2. Fetch da tutte le fonti ──
  let allPosts: RawPost[] = [];

  // Reddit
  try {
    const redditPosts = await fetchRedditPosts();
    allPosts.push(...redditPosts);
  } catch (err: any) {
    console.error('[MAIN] ❌ Errore fatale Reddit (continuo con le altre fonti):', err.message);
  }

  // Upwork
  try {
    const upworkJobs = await fetchUpworkJobs();
    allPosts.push(...upworkJobs);
  } catch (err: any) {
    console.error('[MAIN] ❌ Errore fatale Upwork (continuo):', err.message);
  }

  console.log(`\n[MAIN] 📋 Totale post/job raccolti: ${allPosts.length}`);

  // ── 3. Deduplicazione ──
  const newPosts = allPosts.filter((p) => !isAlreadyProcessed(p.url));
  console.log(`[MAIN] 🆕 Nuovi (non ancora processati): ${newPosts.length}`);

  if (newPosts.length === 0) {
    console.log('[MAIN] ℹ️  Nessun nuovo post da analizzare.');
  }

  // ── 4. Scoring con Claude ──
  let scored = 0;
  let qualified = 0;

  for (const post of newPosts) {
    console.log(`\n[SCORING] 🧠 Analisi: "${post.title.substring(0, 70)}..."`);

    const result = await scorePost(post);

    if (!result) {
      console.log('[SCORING]   ⏩ Skip (errore scoring)');
      continue;
    }

    scored++;

    // Salva nel DB indipendentemente dal punteggio (per deduplicazione futura)
    const now = new Date().toISOString();
    insertLead({
      fonte: post.source,
      url: post.url,
      titolo: post.title,
      testo: post.body.substring(0, 2000), // Tronca testi molto lunghi
      punteggio_intent: result.punteggio_intent,
      settore: result.settore || 'N/A',
      problema: result.problema_identificato || '',
      soluzione_proposta: result.soluzione_proposta || '',
      bozza_risposta: result.bozza_risposta || '',
      evidenza_budget: result.evidenza_budget,
      evidenza_budget_dettaglio: result.evidenza_budget_dettaglio,
      urgenza: result.urgenza || 'bassa',
      data_trovato: now,
      stato: 'nuovo',
    });

    if (result.e_opportunita && result.punteggio_intent >= appConfig.scoring.minIntentScore) {
      qualified++;
      console.log(`[SCORING]   ✅ Opportunità! Score: ${result.punteggio_intent}/10 | Settore: ${result.settore}`);
    } else {
      console.log(`[SCORING]   ⬇️  Score: ${result.punteggio_intent}/10 (sotto soglia o scartato)`);
    }

    // Delay tra chiamate Claude per rispettare rate limit
    await sleep(appConfig.scoring.delayBetweenCallsMs);
  }

  console.log(`\n[MAIN] 📊 Scoring completato: ${scored} analizzati, ${qualified} qualificati`);

  // ── 5. Genera e invia report ──
  const { text: reportText, leads: reportLeads } = generateReport();

  if (reportLeads.length > 0) {
    try {
      await sendTelegramReport(reportText);

      // Segna come processati solo dopo invio riuscito
      const leadIds = reportLeads.map((l) => l.id).filter((id): id is number => id !== undefined);
      markAsProcessed(leadIds);

      console.log(`[MAIN] 📬 Report inviato con ${reportLeads.length} lead`);
    } catch (err: any) {
      console.error('[MAIN] ❌ Errore invio report:', err.message);
      console.log('[MAIN] ℹ️  I lead restano in stato "nuovo" e verranno inclusi nel prossimo report');
    }
  } else {
    // Invia comunque un messaggio "nessuna novità" per sapere che il sistema gira
    try {
      await sendTelegramReport(reportText);
    } catch {
      console.log('[MAIN] ℹ️  Nessun lead qualificato e impossibile inviare notifica');
    }
  }

  // ── 6. Cleanup ──
  closeDb();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('═'.repeat(50));
  console.log(`✅ VEDETTA completato in ${elapsed}s | DB totale: ${countLeadsTotal()}`);
  console.log('═'.repeat(50));
  console.log('');
}

function countLeadsTotal(): string {
  try {
    // DB è stato chiuso, riaprilo brevemente per il conteggio
    initDb();
    const count = countLeads();
    closeDb();
    return count.toString();
  } catch {
    return '?';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entry point ──
main().catch((err) => {
  console.error('[FATAL] ❌ Errore non gestito:', err);
  closeDb();
  process.exit(1);
});
