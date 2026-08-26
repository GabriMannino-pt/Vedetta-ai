import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { initDb, getProspectsByMode, insertOrUpdateOutreachMessage, insertOrUpdateProspect, getOutreachMessagesByStatus } from '../storage/db';
import { generateFirstContactOutreach } from './evidenceGuard';
import { ProspectLead, EvidenceItem } from '../types';
import { optionalEnv } from '../config';

const AXIOS_TIMEOUT = 8000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Blacklist globale per directory, aggregatori e portali di lavoro/servizi */
export const GLOBAL_DIRECTORY_BLACKLIST = [
  'europages.it',
  'sortlist.it',
  'paginebianche.it',
  'prontopro.it',
  'cercolavoro.com',
  'trabajo.org',
  'talent.com',
  'indeed.com',
  'linkedin.com',
  'webadorsite.com',
  'multiscreensite.com',
  'paginegialle.it',
  'annunci.net',
  'infoimprese.it'
];

/** Verifica se un URL appartiene alla blacklist */
export function isBlacklistedDomain(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return GLOBAL_DIRECTORY_BLACKLIST.some(b => host.includes(b));
  } catch {
    return false;
  }
}

/** Esegue una query Tavily per canali pubblici */
async function searchPublicContactTavily(query: string): Promise<any[]> {
  const apiKey = optionalEnv('TAVILY_API_KEY');
  if (!apiKey) return [];
  try {
    const res = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 3,
      },
      { timeout: 10000 }
    );
    return res.data?.results || [];
  } catch {
    return [];
  }
}

/** Crawla una singola pagina HTML ed estrae testo e link rilevanti */
async function fetchPage(urlStr: string): Promise<{ text: string; title: string; links: string[]; emails: string[]; phones: string[] } | null> {
  try {
    const res = await axios.get(urlStr, {
      timeout: AXIOS_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
      validateStatus: status => status === 200
    });

    const $ = cheerio.load(res.data);
    const title = $('title').text().trim();

    // Rimuovi script e stili
    $('script, style, noscript, nav, footer, header').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    // Estrai link interni
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const resolved = new URL(href, urlStr).toString();
          const baseHost = new URL(urlStr).hostname;
          if (new URL(resolved).hostname === baseHost) {
            links.push(resolved);
          }
        } catch {}
      }
    });

    // Estrai email e telefoni
    const emailMatches = res.data.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const validEmails = emailMatches.filter((e: string) => !/\.(png|jpg|jpeg|svg|webp|gif|css|js)$/i.test(e) && !e.includes('example') && !e.includes('sentry'));

    const phoneMatches = text.match(/(?:\+39\s?)?(?:0\d{1,4}[-\s]?\d{4,8}|3\d{2}[-\s]?\d{6,7})/g) || [];

    return {
      text,
      title,
      links: Array.from(new Set(links)),
      emails: Array.from(new Set(validEmails)),
      phones: Array.from(new Set(phoneMatches))
    };
  } catch {
    return null;
  }
}

export async function runDeepEvidenceEnrichment() {
  initDb();
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🦅 VEDETTA 1.0 — DEEP EVIDENCE ENRICHMENT PIPELINE');
  console.log('═════════════════════════════════════════════════════════════════\n');

  const allProspects = getProspectsByMode();
  const messages = getOutreachMessagesByStatus();

  // Mappa i messaggi più recenti per prospect_id
  const latestMessageMap = new Map<number, any>();
  messages.forEach(m => {
    if (!latestMessageMap.has(m.prospect_id)) {
      latestMessageMap.set(m.prospect_id, m);
    }
  });

  const needsReviewProspects: ProspectLead[] = [];
  allProspects.forEach(p => {
    const m = latestMessageMap.get(p.id!);
    if (m && m.status === 'NEEDS_REVIEW') {
      needsReviewProspects.push(p);
    }
  });

  console.log(`[ENRICHMENT] Identificati ${needsReviewProspects.length} prospect in stato NEEDS_REVIEW.\n`);

  let countReadyForApproval = 0;
  let countRemainingNeedsReview = 0;
  let countDiscardedFalsePositive = 0;
  const newFactsFound: { prospect: string; claim: string; url: string; snippet: string }[] = [];
  const claimsNowSupported: string[] = [];
  const updatedQualityScores: number[] = [];

  for (let i = 0; i < needsReviewProspects.length; i++) {
    const prospect = needsReviewProspects[i];
    const pid = prospect.id!;
    console.log(`[${i + 1}/${needsReviewProspects.length}] Analisi: "${prospect.name}" (${prospect.website})...`);

    // ─────────────────────────────────────────────────────────────
    // CLUSTER C: Controllo Aggregatori / Blacklist
    // ─────────────────────────────────────────────────────────────
    if (isBlacklistedDomain(prospect.website)) {
      console.log(`   🚫 [CLUSTER C] Rilevato aggregatore/portale blacklist: "${prospect.website}". Archiviazione come FALSE_POSITIVE.`);
      countDiscardedFalsePositive++;
      prospect.classification = 'IGNORE';
      insertOrUpdateProspect(prospect);
      insertOrUpdateOutreachMessage({
        prospect_id: pid,
        channel: 'email',
        stage: 'FIRST_CONTACT',
        subject: '',
        content: 'ARCHIVIATO_FALSE_POSITIVE_DIRECTORY',
        quality_score: 0,
        status: 'ARCHIVED',
        evidence_ids: [],
        claims: [],
        quality_details: { status: 'ARCHIVED', hard_block_reasons: ['Dominio aggregatore/directory blacklistato'] },
        created_at: new Date().toISOString()
      });
      continue;
    }

    let currentEvidences = [...(prospect.evidences || [])];
    let currentEmail = prospect.email;
    let currentPhone = prospect.phone;

    // ─────────────────────────────────────────────────────────────
    // CLUSTER B: Enrichment Canali Pubblici se mancanti
    // ─────────────────────────────────────────────────────────────
    if (!currentEmail && !currentPhone) {
      console.log(`   🔍 [CLUSTER B] Canale diretto assente. Esecuzione ricerca canali pubblici...`);
      // 1. Prova a scansionare /contatti o /chi-siamo sul sito
      const contactUrls = [
        `${prospect.website.replace(/\/$/, '')}/contatti`,
        `${prospect.website.replace(/\/$/, '')}/chi-siamo`,
        `${prospect.website.replace(/\/$/, '')}/contact`,
        `${prospect.website.replace(/\/$/, '')}/about`
      ];

      for (const curl of contactUrls) {
        const pdata = await fetchPage(curl);
        if (pdata) {
          if (!currentEmail && pdata.emails.length > 0) currentEmail = pdata.emails[0];
          if (!currentPhone && pdata.phones.length > 0) currentPhone = pdata.phones[0];
          if (currentEmail || currentPhone) break;
        }
      }

      // 2. Se ancora assente, interroga Tavily per contatti pubblici
      if (!currentEmail && !currentPhone) {
        const tavilyRes = await searchPublicContactTavily(`"${prospect.name}" contatti OR email OR telefono`);
        for (const tr of tavilyRes) {
          const emailMatch = tr.content?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          const phoneMatch = tr.content?.match(/(?:\+39\s?)?(?:0\d{1,4}[-\s]?\d{4,8}|3\d{2}[-\s]?\d{6,7})/);
          if (!currentEmail && emailMatch) currentEmail = emailMatch[0];
          if (!currentPhone && phoneMatch) currentPhone = phoneMatch[0];
          if (currentEmail || currentPhone) break;
        }
      }

      if (currentEmail || currentPhone) {
        console.log(`   ✅ [CLUSTER B] Canale pubblico verificato: ${currentEmail || currentPhone}`);
      } else {
        console.log(`   ⚠️ [CLUSTER B] Nessun canale pubblico diretto reperibile. Richiederà scelta manuale canale.`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // CLUSTER A: Deep Selective Crawl delle subpagine per FACT
    // ─────────────────────────────────────────────────────────────
    console.log(`   🕷️  [CLUSTER A] Avvio deep crawl selettivo subpagine...`);
    const homeData = await fetchPage(prospect.website);
    const candidateSubpages: string[] = [];

    if (homeData && homeData.links.length > 0) {
      // Prioritizza link a subpagine di processo
      const priorityPatterns = [/iscrizion/i, /serviz/i, /cors/i, /prenot/i, /preventiv/i, /tariff/i, /prezz/i, /contatt/i, /soluzion/i, /b2b/i, /aree/i];
      for (const l of homeData.links) {
        if (priorityPatterns.some(p => p.test(l)) && candidateSubpages.length < 4) {
          if (!candidateSubpages.includes(l)) candidateSubpages.push(l);
        }
      }
    }

    // Se non ha trovato link prioritari, prova percorsi standard
    if (candidateSubpages.length === 0) {
      const base = prospect.website.replace(/\/$/, '');
      if (prospect.mode === 'danceflow') {
        candidateSubpages.push(`${base}/iscrizioni`, `${base}/corsi`, `${base}/contatti`);
      } else if (prospect.mode === 'ai-automation') {
        candidateSubpages.push(`${base}/servizi`, `${base}/prenota`, `${base}/preventivo`, `${base}/contatti`);
      } else {
        candidateSubpages.push(`${base}/servizi`, `${base}/lead-generation`, `${base}/contatti`);
      }
    }

    // Crawla fino a 3 subpagine rilevanti
    for (const subUrl of candidateSubpages.slice(0, 3)) {
      const subData = await fetchPage(subUrl);
      if (!subData || subData.text.length < 50) continue;

      if (!currentEmail && subData.emails.length > 0) currentEmail = subData.emails[0];
      if (!currentPhone && subData.phones.length > 0) currentPhone = subData.phones[0];

      const textLower = subData.text.toLowerCase();

      // Rilevamento FACT 1: Moduli PDF scaricabili
      if (/scarica (il )?modulo|modulo (di )?iscrizione|modulo pdf|adesione \.pdf/i.test(textLower)) {
        const factText = subData.text.slice(0, 200);
        const newFact: EvidenceItem = {
          id: `FACT-DEEP-${Date.now().toString().slice(-4)}-1`,
          claim: 'Modulo di iscrizione o adesione gestito in formato PDF scaricabile dal sito',
          status: 'FACT',
          type: 'FACT',
          source_url: subUrl,
          source_page: subData.title || 'Iscrizioni / Documenti',
          evidence_text: `Rilevato riferimento a modulo scaricabile su ${subUrl}`,
          confidence: 0.96,
          captured_at: new Date().toISOString()
        };
        currentEvidences.push(newFact);
        newFactsFound.push({ prospect: prospect.name, claim: newFact.claim, url: subUrl, snippet: newFact.evidence_text });
        claimsNowSupported.push('Utilizzo di moduli scaricabili per adesione o iscrizione');
        console.log(`      ✅ [NEW FACT] Modulo PDF rilevato su: ${subUrl}`);
      }

      // Rilevamento FACT 2: Form di richiesta preventivo o prenotazione intake
      if (/richiedi (un )?preventivo|prenota (la )?visita|modulo di contatto per quotazione|calcola preventivo/i.test(textLower)) {
        const newFact: EvidenceItem = {
          id: `FACT-DEEP-${Date.now().toString().slice(-4)}-2`,
          claim: 'Flusso di richiesta preventivo o prenotazione gestito tramite modulo web di intake',
          status: 'FACT',
          type: 'FACT',
          source_url: subUrl,
          source_page: subData.title || 'Servizi / Preventivi',
          evidence_text: `Presenza di form di intake per quotazioni/prenotazioni su ${subUrl}`,
          confidence: 0.95,
          captured_at: new Date().toISOString()
        };
        currentEvidences.push(newFact);
        newFactsFound.push({ prospect: prospect.name, claim: newFact.claim, url: subUrl, snippet: newFact.evidence_text });
        claimsNowSupported.push('Gestione richieste preventivo/prenotazioni via modulo di intake');
        console.log(`      ✅ [NEW FACT] Form preventivo/prenotazione rilevato su: ${subUrl}`);
      }

      // Rilevamento FACT 3: Pagamenti via Bonifico / IBAN / Cassa
      if (/bonifico|iban|coordinate bancarie|ricevuta di versamento/i.test(textLower)) {
        const newFact: EvidenceItem = {
          id: `FACT-DEEP-${Date.now().toString().slice(-4)}-3`,
          claim: 'Pagamento e versamento delle quote indicato tramite bonifico bancario / IBAN',
          status: 'FACT',
          type: 'FACT',
          source_url: subUrl,
          source_page: subData.title || 'Modalità di Pagamento',
          evidence_text: `Indicazione di pagamento tramite bonifico/IBAN su ${subUrl}`,
          confidence: 0.94,
          captured_at: new Date().toISOString()
        };
        currentEvidences.push(newFact);
        newFactsFound.push({ prospect: prospect.name, claim: newFact.claim, url: subUrl, snippet: newFact.evidence_text });
        claimsNowSupported.push('Pagamento tramite bonifico bancario con gestione contabile manuale');
        console.log(`      ✅ [NEW FACT] Menzione bonifico/IBAN su: ${subUrl}`);
      }

      // Rilevamento FACT 4: Servizi di sviluppo commerciale / prospezione B2B
      if (/lead generation|sviluppo commerciale|prospezione|acquisizione clienti b2b/i.test(textLower)) {
        const newFact: EvidenceItem = {
          id: `FACT-DEEP-${Date.now().toString().slice(-4)}-4`,
          claim: 'Offerta attiva di servizi commerciali e prospezione outbound B2B',
          status: 'FACT',
          type: 'FACT',
          source_url: subUrl,
          source_page: subData.title || 'Servizi B2B',
          evidence_text: `Offerta commerciale esplicita di lead generation B2B su ${subUrl}`,
          confidence: 0.95,
          captured_at: new Date().toISOString()
        };
        currentEvidences.push(newFact);
        newFactsFound.push({ prospect: prospect.name, claim: newFact.claim, url: subUrl, snippet: newFact.evidence_text });
        claimsNowSupported.push('Offerta esplicita di servizi di lead generation e prospezione B2B');
        console.log(`      ✅ [NEW FACT] Servizio B2B rilevato su: ${subUrl}`);
      }
    }

    // Deduplica le evidence per claim
    const uniqueEvidences = currentEvidences.filter((v, idx, arr) => arr.findIndex(t => t.claim === v.claim) === idx);

    // Aggiorna il prospect
    prospect.evidences = uniqueEvidences;
    prospect.email = currentEmail;
    prospect.phone = currentPhone;
    insertOrUpdateProspect(prospect);

    // ─────────────────────────────────────────────────────────────
    // RIGENERAZIONE FIRST_CONTACT CON EVIDENCE GUARD
    // ─────────────────────────────────────────────────────────────
    const preferredChannel = currentEmail ? 'email' : (currentPhone ? 'whatsapp' : 'email');
    const { draft, quality } = generateFirstContactOutreach(prospect, preferredChannel);

    insertOrUpdateOutreachMessage({
      prospect_id: pid,
      channel: preferredChannel,
      stage: 'FIRST_CONTACT',
      subject: draft.subject,
      content: draft.content,
      quality_score: quality.score,
      status: quality.status,
      evidence_ids: quality.claims.filter(c => c.evidence_id).map(c => c.evidence_id),
      claims: quality.claims,
      quality_details: quality,
      created_at: new Date().toISOString()
    });

    updatedQualityScores.push(quality.score);

    if (quality.status === 'READY_FOR_APPROVAL') {
      countReadyForApproval++;
      console.log(`   🎉 [PROMOSSO] Score: ${quality.score}/100 -> READY_FOR_APPROVAL`);
    } else {
      countRemainingNeedsReview++;
      console.log(`   ⏳ [NEEDS_REVIEW] Score: ${quality.score}/100 (In attesa di ulteriore dettaglio)`);
    }
  }

  const avgQualityScore = updatedQualityScores.length > 0 
    ? Math.round(updatedQualityScores.reduce((a, b) => a + b, 0) / updatedQualityScores.length)
    : 0;

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('🏁 DEEP EVIDENCE ENRICHMENT COMPLETATO!');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  • Prospect promossi a READY_FOR_APPROVAL: ${countReadyForApproval}`);
  console.log(`  • Prospect rimasti in NEEDS_REVIEW: ${countRemainingNeedsReview}`);
  console.log(`  • Prospect scartati come FALSE_POSITIVE (Directory): ${countDiscardedFalsePositive}`);
  console.log(`  • Nuove evidenze FACT scoperte: ${newFactsFound.length}`);
  console.log(`  • Claim precedentemente non supportati ora certificati: ${Array.from(new Set(claimsNowSupported)).length}`);
  console.log(`  • Qualità media dei messaggi rigenerati: ${avgQualityScore}/100`);

  // Salva report
  const dataDir = path.resolve(__dirname, '..', '..', '.data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const reportPath = path.join(dataDir, 'deep_enrichment_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    metrics: {
      totalAnalyzed: needsReviewProspects.length,
      promotedToReadyForApproval: countReadyForApproval,
      remainingNeedsReview: countRemainingNeedsReview,
      discardedFalsePositive: countDiscardedFalsePositive,
      newFactsDiscovered: newFactsFound.length,
      uniqueSupportedClaimsCount: Array.from(new Set(claimsNowSupported)).length,
      avgQualityScore
    },
    newFactsFound,
    uniqueSupportedClaims: Array.from(new Set(claimsNowSupported))
  }, null, 2), 'utf8');

  console.log(`📁 Report salvato in: ${reportPath}`);
}

if (require.main === module) {
  runDeepEvidenceEnrichment().catch(err => {
    console.error('❌ Errore Deep Enrichment:', err);
    process.exit(1);
  });
}
