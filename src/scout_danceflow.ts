import * as fs from 'fs';
import * as path from 'path';
import { discoverDanceSchools } from './discovery/scoutEngine';
import { scoreSchoolProspect } from './scoring/modeScorer';
import { initDb, insertOrUpdateProspect, closeDb, getProspectsByMode } from './storage/db';
import { DanceFlowProspect, ScoutRunStats } from './types';

async function runDanceFlowScout(targetCount: number = 30): Promise<void> {
  const startTime = Date.now();
  console.log('═'.repeat(65));
  console.log('🦅 VEDETTA SALES OPERATING SYSTEM — V0: DANCEFLOW SCOUT');
  console.log(`🎯 Target Prospect Qualificati: ${targetCount}`);
  console.log(`📅 Avvio: ${new Date().toISOString()}`);
  console.log('═'.repeat(65));

  initDb();

  const stats: ScoutRunStats = {
    total_discovered: 0,
    total_crawled: 0,
    valid_schools: 0,
    with_contact: 0,
    with_real_fact_evidence: 0,
    tier_a: 0,
    tier_b: 0,
    tier_c: 0,
    false_positives: 0,
  };

  // 1. Discovery & Crawl
  // Chiediamo un pool ampio (es. 70-80) per assicurarci di raggiungere e superare 30 scuole reali e qualificate
  const crawledSchools = await discoverDanceSchools(75);
  stats.total_discovered = crawledSchools.length;
  stats.total_crawled = crawledSchools.length;

  const qualifiedProspects: DanceFlowProspect[] = [];

  // 2. Scoring & Rigorous Factual Evidence Validation
  console.log(`\n[SCOUT-PIPELINE] 🧠 Avvio Validazione & Scoring Evidence-Based...`);

  for (let i = 0; i < crawledSchools.length; i++) {
    if (qualifiedProspects.length >= targetCount) {
      console.log(`[SCOUT-PIPELINE] 🎯 Raggiunto il target di ${targetCount} prospect qualificati!`);
      break;
    }

    const school = crawledSchools[i];
    console.log(`\n[ANALYSIS ${i + 1}/${crawledSchools.length}] 🔎 Analisi "${school.name}" (${school.website})...`);

    const scoredProspect = await scoreSchoolProspect(school);

    if (!scoredProspect) {
      stats.false_positives++;
      continue;
    }

    stats.valid_schools++;

    if (scoredProspect.email || scoredProspect.phone) {
      stats.with_contact++;
    }

    const hasFact = scoredProspect.evidences.some(e => e.status === 'FACT');
    if (hasFact) {
      stats.with_real_fact_evidence++;
    }

    if (scoredProspect.classification === 'A') stats.tier_a++;
    else if (scoredProspect.classification === 'B') stats.tier_b++;
    else if (scoredProspect.classification === 'C') stats.tier_c++;

    // Salva nel database SQLite
    insertOrUpdateProspect(scoredProspect);
    qualifiedProspects.push(scoredProspect);

    console.log(`  ⭐ Qualificato: Score ${scoredProspect.danceflow_score}/100 [Tier ${scoredProspect.classification}] | Evidenze FACT: ${scoredProspect.evidences.filter(e => e.status === 'FACT').length}`);
    console.log(`  📍 Città: ${scoredProspect.city} | Email: ${scoredProspect.email || 'N/A'} | Tel: ${scoredProspect.phone || 'N/A'}`);
    console.log(`  🎯 Opening Angle: "${scoredProspect.opening_angle.substring(0, 80)}..."`);

    // Piccolo delay per quota API
    await new Promise(r => setTimeout(r, 800));
  }

  // 3. Salvataggio Artefatti Report (JSON & Markdown Dossier)
  const outputDir = path.resolve(__dirname, '..', '.data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonReportPath = path.join(outputDir, 'danceflow_30_prospects.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify({ stats, prospects: qualifiedProspects }, null, 2), 'utf-8');

  const markdownReport = generateMarkdownDossier(stats, qualifiedProspects);
  const mdReportPath = path.join(outputDir, 'danceflow_30_prospects.md');
  fs.writeFileSync(mdReportPath, markdownReport, 'utf-8');

  // Salviamo anche nella cartella brain per consultazione rapida
  const brainDir = path.resolve('C:\\Users\\f3d3r\\.gemini\\antigravity\\brain\\266dc489-c6f9-4266-a852-3ba64ffa0390');
  if (fs.existsSync(brainDir)) {
    fs.writeFileSync(path.join(brainDir, 'danceflow_30_prospects.md'), markdownReport, 'utf-8');
  }

  closeDb();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(65));
  console.log(`🏁 V0 DANCEFLOW SCOUT COMPLETATO IN ${elapsed}s`);
  console.log(`📁 Report salvato in: ${mdReportPath}`);
  console.log(`📁 JSON salvato in: ${jsonReportPath}`);
  console.log('═'.repeat(65));
}

function generateMarkdownDossier(stats: ScoutRunStats, prospects: DanceFlowProspect[]): string {
  let md = `# 🦅 VEDETTA SALES OPERATING SYSTEM — V0: DANCEFLOW SCOUT DOSSIER

**Data Generazione:** ${new Date().toLocaleString('it-IT')}  
**Prodotto Target:** DanceFlow (Gestionale Scuole & Accademie di Danza)  
**Mercato / Geo:** Italia (Milano, Roma, Torino, Bologna, Firenze, Napoli, Brescia, Verona, ecc.)  

---

## 📊 FUNNEL DI QUALITÀ & METRICHE V0

| Metrica | Valore | Note |
| :--- | :--- | :--- |
| **Totale Domini Discovered** | **${stats.total_discovered}** | Ricerca web multi-query mirata |
| **Siti Crawlati con Successo** | **${stats.total_crawled}** | Estrazione HTML, testi, PDF e contatti |
| **Scuole di Danza Valide** | **${stats.valid_schools}** | Filtrate attività non pertinenti / blog |
| **Con Contatto Diretto (Email / Tel)** | **${stats.with_contact}** (${stats.valid_schools > 0 ? Math.round((stats.with_contact / stats.valid_schools) * 100) : 0}%) | Email o recapito telefonico verificato |
| **Con Evidenza Fattuale (FACT)** | **${stats.with_real_fact_evidence}** (${stats.valid_schools > 0 ? Math.round((stats.with_real_fact_evidence / stats.valid_schools) * 100) : 0}%) | Prova testuale certa sul sito (PDF, IBAN, WhatsApp) |
| 🔴 **Tier A (Contact Now - Score 75+)** | **${stats.tier_a}** | Massima urgenza / inefficienza manuale evidente |
| 🟠 **Tier B (Contact This Week - Score 55-74)** | **${stats.tier_b}** | Ottimo potenziale |
| 🟡 **Tier C (Nurture - Score 35-54)** | **${stats.tier_c}** | Da monitorare o scuola piccola |
| ⚪ **Falsi Positivi Scartati (IGNORE)** | **${stats.false_positives}** | Negozi abbigliamento, portali generici, non scuole |

---

## 🏆 TOP PROSPECT QUALIFICATI (${prospects.length} SCUOLE)

`;

  // Ordina per score decrescente
  const sorted = [...prospects].sort((a, b) => (b.opportunity_score || b.danceflow_score || 0) - (a.opportunity_score || a.danceflow_score || 0));

  sorted.forEach((p, idx) => {
    const currentScore = p.opportunity_score || p.danceflow_score || 0;
    const tierBadge = p.classification === 'A+' || p.classification === 'A' ? '🔴 **TIER A (CONTATTA ORA)**' : p.classification === 'B' ? '🟠 **TIER B (QUESTA SETTIMANA)**' : '🟡 **TIER C (NURTURE)**';

    md += `### ${idx + 1}. ${p.name} — ${p.city}
- **Tier & Score:** ${tierBadge} | **Score:** \`${currentScore}/100\` (Fit: ${p.score_breakdown.fit} | Pain: ${p.score_breakdown.pain} | Intent: ${p.score_breakdown.intent} | Value: ${p.score_breakdown.value})
- **Sito Web:** [${p.website}](${p.website})
- **Email:** \`${p.email || 'N/A'}\`
- **Telefono / WhatsApp:** \`${p.phone || 'N/A'}\`
- **Social:** ${p.social ? `[Social Link](${p.social})` : 'N/A'}
- **Dimensione Stimata:** ${p.estimated_size}
- **Software Attuale / Competitor:** \`${p.competitor_current_software}\`

#### 🔍 Segnali Chiave & Evidenze Fattuali (FACT vs INFERENCE):
${p.evidences.map(e => `  - **[${e.status}]** *${e.claim}*  
    *Fonte:* \`${e.source_page}\` (${e.source_url})  
    *Testo/Fatto estratto:* "${e.evidence_text}" (Confidenza: ${Math.round(e.confidence * 100)}%)`).join('\n')}

#### ⚠️ Pain Points Identificati:
${p.pain_points.map(pain => `  - ${pain}`).join('\n')}

#### 💡 Opening Angle (Gancio di Apertura Verificabile):
> "${p.opening_angle}"

#### 🎯 Azione Raccomandata:
**${p.recommended_action}**

#### ✉️ Bozza Outreach Suggerita (Da approvare prima dell'invio):
- **Canale:** \`${p.suggested_outreach.channel.toUpperCase()}\`
- **Oggetto:** \`${p.suggested_outreach.subject}\`
- **Messaggio:**
\`\`\`text
${p.suggested_outreach.opening}

${p.suggested_outreach.body}

${p.suggested_outreach.cta}
\`\`\`

---

`;
  });

  return md;
}

// Esecuzione se lanciato da CLI
if (require.main === module) {
  runDanceFlowScout(30).catch(err => {
    console.error('[FATAL] ❌ Errore scout danceflow:', err);
    closeDb();
    process.exit(1);
  });
}

export { runDanceFlowScout };
