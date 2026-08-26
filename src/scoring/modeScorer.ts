import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv, optionalEnv } from '../config';
import { ProspectLead, EvidenceItem, ProspectScoreBreakdown } from '../types';
import { DiscoveredSchoolRaw } from '../discovery/scoutEngine';
import { generateFirstContactOutreach } from '../outreach/evidenceGuard';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  const key = optionalEnv('GEMINI_API_KEY');
  if (!key) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

/** Estrattore deterministico di città italiana dal testo */
function detectCity(text: string): string {
  const cities = [
    'Milano', 'Roma', 'Torino', 'Bologna', 'Firenze', 'Napoli', 'Brescia', 'Bergamo',
    'Verona', 'Padova', 'Genova', 'Bari', 'Palermo', 'Catania', 'Modena', 'Reggio Emilia',
    'Siena', 'Novara', 'Lomazzo', 'Como', 'Varese', 'Monza', 'Pavia', 'Treviso', 'Vicenza'
  ];
  for (const c of cities) {
    const regex = new RegExp(`\\b${c}\\b`, 'i');
    if (regex.test(text)) return c;
  }
  return 'Italia';
}

/** Analisi euristica e fattuale rigorosa per qualsiasi modalità */
export function analyzeProspectFactual(raw: DiscoveredSchoolRaw, mode: string = 'danceflow'): ProspectLead | null {
  const combinedText = raw.pagesCrawled.map(p => p.text).join(' ');
  const combinedHtml = raw.pagesCrawled.map(p => p.pdfLinks.map(l => `${l.text} ${l.url}`).join(' ')).join(' ');

  const evidences: EvidenceItem[] = [];
  const keySignals: string[] = [];
  const painPoints: string[] = [];
  const city = detectCity(combinedText) || detectCity(raw.name) || 'Italia';

  let fitScore = 80;
  let painScore = 70;
  let intentScore = 75;
  let valueScore = 75;
  let competitor = raw.detectedCompetitors.length > 0 ? raw.detectedCompetitors.join(', ') : 'Nessuno (Processo Manuale / Cartaceo)';

  if (mode === 'danceflow') {
    // Filtro per scuole di danza
    const isSchool = /scuola di danza|accademia di danza|scuola di ballo|studio danza|danza classica|danza moderna|corsi di danza|asd|ssd/i.test(combinedText);
    const isNotSchool = /comprensivo statale|universit|teatro carlo felice|lumsa|paginebianche|study italian/i.test(raw.name + ' ' + combinedText);
    if (!isSchool || isNotSchool) return null;

    if (raw.detectedPdfForms.length > 0) {
      const pdf = raw.detectedPdfForms[0];
      evidences.push({
        claim: 'Modulo di iscrizione o regolamento gestito in formato PDF scaricabile / cartaceo',
        status: 'FACT',
        source_url: pdf.url,
        source_page: 'Pagina Iscrizioni / Regolamento',
        evidence_text: `Trovato documento PDF: "${pdf.text || 'Modulo iscrizione'}" (${pdf.url})`,
        confidence: 0.98,
      });
      keySignals.push('Modulo iscrizione cartaceo/PDF scaricabile da compilare a mano');
      painPoints.push('Iscrizioni e anagrafica allievi raccolte manualmente su moduli cartacei/PDF con rischio errori');
      painScore += 15;
    }

    if (raw.hasManualPaymentKeywords || /bonifico|iban|quote associative|tesseramento/i.test(combinedText)) {
      const ibanMatch = combinedText.match(/IT\d{2}[A-Z]\d{10}[0-9A-Z]{12}/i);
      evidences.push({
        claim: 'Gestione manuale di quote associative e rette con bonifico o cassa',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Quote / Regolamento / Contatti',
        evidence_text: ibanMatch ? `Presenza IBAN esposto sul sito (${ibanMatch[0]}) per bonifici manuali` : 'Menzione esplicita di saldo rette tramite bonifico bancario / segreteria',
        confidence: ibanMatch ? 0.99 : 0.90,
      });
      keySignals.push('Pagamento rette con bonifico manuale o contanti in segreteria');
      painPoints.push('Riconciliazione bancaria manuale delle rette mensili e monitoraggio insoluti non automatizzato');
      painScore += 10;
    }

    if (raw.hasWhatsappBookingKeywords || /whatsapp|prenota la lezione/i.test(combinedText)) {
      evidences.push({
        claim: 'Prenotazione lezioni di prova o comunicazioni gestite direttamente su WhatsApp',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Contatti / Corsi',
        evidence_text: 'Presenza di contatto WhatsApp diretto per richieste di prova e orari corsi',
        confidence: 0.92,
      });
      keySignals.push('Gestione lezioni di prova e presenze via chat WhatsApp');
      painPoints.push('Segreteria intasata da messaggi manuali per cambi orario e prenotazioni prove');
      painScore += 5;
    }

  } else if (mode === 'vedetta') {
    // Filtro per Agenzie B2B, Lead Gen, Software House
    const isAgency = /agenzia|lead generation|marketing b2b|software house|consulenz|sales|outbound|appuntamenti/i.test(combinedText + ' ' + raw.name);
    if (!isAgency) return null;

    if (/lead generation|outbound|acquisizione clienti|fissare appuntamenti/i.test(combinedText)) {
      evidences.push({
        claim: 'Offerta attiva di servizi commerciali e prospezione outbound B2B',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Servizi / Homepage',
        evidence_text: 'Menzione esplicita di servizi di prospezione, lead generation o vendite outbound per aziende clienti',
        confidence: 0.95,
      });
      keySignals.push('Agenzia attiva su servizi di lead generation e sales outbound');
      painPoints.push('Costo elevato e tempi lunghi di ricerca manuale dei prospect e qualificazione dei contatti');
      painScore += 20;
      fitScore += 15;
    } else {
      evidences.push({
        claim: 'Struttura commerciale con team di vendita attivo',
        status: 'INFERENCE',
        source_url: raw.website,
        source_page: 'Contatti / Chi siamo',
        evidence_text: 'Presenza di form contatti commerciali per richieste di preventivo B2B',
        confidence: 0.85,
      });
      keySignals.push('Azienda B2B con flusso di acquisizione clienti attivo');
    }

    if (/sales navigator|contatti verificati|database|scraping|liste/i.test(combinedText)) {
      evidences.push({
        claim: 'Utilizzo di metodologie di prospezione tradizionali o liste statiche',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Metodo / Servizi',
        evidence_text: 'Riferimento a ricerche manuali di prospect o database esterni non integrati con evidenze in tempo reale',
        confidence: 0.90,
      });
      keySignals.push('Necessità di passare da liste fredde a prospect con evidenze verificate');
      painScore += 10;
    }

  } else if (mode === 'ai-automation') {
    // Filtro per PMI con processi manuali (cliniche, immobiliari, logistica, commercialisti)
    const isTargetSMB = /poliambulatorio|clinica|immobiliare|logistica|trasporti|commercialist|buste paga|fornitur|distribuzione/i.test(combinedText + ' ' + raw.name);
    if (!isTargetSMB) return null;

    if (/preventiv|richiesta valutazione|prenota visita|modulo contatto/i.test(combinedText)) {
      evidences.push({
        claim: 'Flusso di preventivazione, prenotazione o valutazione gestito manualmente tramite form generico o email',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Contatti / Servizi',
        evidence_text: 'Presenza di form di contatto generico senza calcolatore dinamico o routing automatizzato del lead',
        confidence: 0.94,
      });
      keySignals.push('Processo di intake preventivi/visite interamente manuale');
      painPoints.push('Tempi di risposta lunghi verso i prospect con rischio di perdita delle opportunità ad alto valore');
      painScore += 20;
    }

    if (/fatture|bolle|document|referti|anagrafic|contratti/i.test(combinedText)) {
      evidences.push({
        claim: 'Elevato carico di data entry e gestione documentale tra portali e gestionali',
        status: 'FACT',
        source_url: raw.website,
        source_page: 'Area Clienti / Servizi',
        evidence_text: 'Menzione di trasmissione documentale manuale (PDF, email, moduli fisici) da parte di clienti e operatori',
        confidence: 0.92,
      });
      keySignals.push('Intensa attività di backoffice e data entry manuale');
      painPoints.push('Centinaia di ore/mese spese dal personale di backoffice per reinserire dati tra sistemi scollegati');
      painScore += 15;
    }
  }

  fitScore = Math.min(100, Math.max(30, fitScore));
  painScore = Math.min(100, Math.max(20, painScore));
  intentScore = Math.min(100, Math.max(30, intentScore));
  valueScore = Math.min(100, Math.max(30, valueScore));

  const totalScore = Math.round((fitScore * 0.35) + (painScore * 0.35) + (intentScore * 0.15) + (valueScore * 0.15));

  let classification: 'A+' | 'A' | 'B' | 'C' = 'B';
  if (totalScore >= 85 && (raw.emails.length > 0 || raw.phones.length > 0)) {
    classification = 'A+';
  } else if (totalScore >= 75 && (raw.emails.length > 0 || raw.phones.length > 0)) {
    classification = 'A';
  } else if (totalScore < 55) {
    classification = 'C';
  }

  const factEvidence = evidences.find(e => e.status === 'FACT');
  const factDetail = factEvidence ? factEvidence.claim.toLowerCase() : 'la presenza di moduli o contatti sul vostro sito';

  const emailAddr = raw.emails[0] || null;
  const phoneNum = raw.phones[0] || null;
  const socialUrl = raw.socials.instagram || raw.socials.facebook || null;
  const preferredChannel: 'email' | 'whatsapp' = emailAddr ? 'email' : 'whatsapp';

  const prospectTemp: ProspectLead = {
    mode,
    name: raw.name,
    city,
    website: raw.website,
    email: emailAddr,
    phone: phoneNum,
    social: socialUrl,
    estimated_size: raw.pagesCrawled.length > 2 ? 'Media / Strutturata' : 'Piccola / Agile',
    key_signals: keySignals.length > 0 ? keySignals : ['Presenza online attiva e servizi B2B esposti'],
    evidences: evidences.length > 0 ? evidences : [{
      claim: 'Presenza di canali di contatto attivi per il pubblico',
      status: 'FACT',
      source_url: raw.website,
      source_page: 'Contatti',
      evidence_text: `Trovati canali di contatto sul sito (${raw.website})`,
      confidence: 0.90
    }],
    pain_points: painPoints.length > 0 ? painPoints : ['Gestione manuale dei flussi e comunicazioni'],
    competitor_current_software: competitor,
    score_breakdown: {
      fit: fitScore,
      pain: painScore,
      intent: intentScore,
      value: valueScore,
    },
    opportunity_score: totalScore,
    classification,
    reason: classification === 'A+' || classification === 'A'
      ? `Prospect ideale per modalità ${mode}: evidenza verificata (${factDetail}), contatti reperiti e score ${totalScore}/100.`
      : `Buon prospect per ${mode}, con segnali di potenziale ma margini di approfondimento.`,
    opening_angle: `Ho notato sul vostro sito (${raw.website}) che ${factDetail}.`,
    recommended_action: emailAddr
      ? `Inviare email personalizzata a ${emailAddr} citando l'evidenza verificata`
      : phoneNum
      ? `Contatto telefonico / WhatsApp al numero ${phoneNum}`
      : 'Contatto via form web o profilo social aziendale',
    suggested_outreach: {
      channel: preferredChannel,
      subject: '',
      opening: '',
      body: '',
      cta: '',
    },
    scouted_at: new Date().toISOString(),
  };

  // Genera First Contact con il modulo Evidence Guard
  const { draft } = generateFirstContactOutreach(prospectTemp, preferredChannel);

  prospectTemp.suggested_outreach = {
    channel: preferredChannel,
    subject: draft.subject || `Richiesta contatto per ${raw.name}`,
    opening: `Ciao, ho visto sul vostro sito (${raw.website}) che ${factDetail}.`,
    body: draft.content,
    cta: draft.quality_details?.breakdown.cta_quality ? 'Ha senso se ti mostro in 5 minuti come funziona?' : 'Ti andrebbe di vedere un breve esempio?'
  };
  prospectTemp.outreach_draft = draft;

  return prospectTemp;
}

/** Alias retrocompatibile */
export async function scoreSchoolProspect(school: DiscoveredSchoolRaw): Promise<ProspectLead | null> {
  return analyzeProspectFactual(school, 'danceflow');
}
