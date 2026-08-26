import { ProspectLead, EvidenceItem, ProjectDossier, OutreachClaim, OutreachQualityResult, OutreachMessage, ReplyClassification, ReplyIntent } from '../types';

/** Registro delle feature certificate per prodotto per evitare allucinazioni commerciali */
export const VERIFIED_PRODUCT_REGISTRY: { [key: string]: { name: string; verified_features: string[]; allowed_claims: string[] } } = {
  danceflow: {
    name: 'DanceFlow',
    verified_features: [
      'Modulo iscrizioni digitali online per allievi',
      'Raccolta pagamenti e rette mensili online',
      'Registro presenze corsi e allievi',
      'Area riservata e link diretto per smartphone'
    ],
    allowed_claims: [
      'digitalizzare la raccolta dei moduli di iscrizione',
      'permettere agli allievi di iscriversi da smartphone',
      'gestire le quote e le iscrizioni online',
      'ridurre la gestione cartacea dei moduli'
    ]
  },
  vedetta: {
    name: 'Vedetta AI Sales OS',
    verified_features: [
      'Discovery multi-fonte su web e canali pubblici',
      'Verifica fattuale rigorosa FACT vs INFERENCE',
      'Lead scoring multi-dimensionale',
      'Bozze outreach personalizzate su evidenza reale'
    ],
    allowed_claims: [
      'individuare prospect con evidenze verificabili',
      'qualificare i contatti prima dell\'outreach',
      'generare bozze basate su fatti certi del sito del prospect'
    ]
  },
  'ai-automation': {
    name: 'AI Automation Agency',
    verified_features: [
      'Automazione intake richieste e preventivazione',
      'Integrazione flussi n8n/Make per backoffice',
      'Audit di processo operativo e mappatura colli di bottiglia'
    ],
    allowed_claims: [
      'automatizzare la gestione delle richieste di preventivo',
      'ridurre il data entry manuale tra software diversi',
      'eseguire un audit di processo preliminare'
    ]
  }
};

/**
 * Normalizza e assegna ID univoco alle evidence se mancante
 */
export function ensureEvidenceIds(evidences: EvidenceItem[]): EvidenceItem[] {
  return evidences.map((ev, idx) => ({
    ...ev,
    id: ev.id || `EV-${idx + 1}-${Date.now().toString().slice(-4)}`,
    status: ev.status || ev.type || 'UNKNOWN',
    captured_at: ev.captured_at || new Date().toISOString()
  }));
}

/**
 * Valuta rigorosamente un messaggio di outreach rispetto alle evidence e al dossier prodotto
 */
export function verifyAndScoreOutreach(
  prospect: ProspectLead,
  messageContent: string,
  channel: 'whatsapp' | 'email' | 'instagram' | 'linkedin' | 'phone' = 'whatsapp',
  stage: 'FIRST_CONTACT' | 'FOLLOW_UP_1' | 'FOLLOW_UP_2' | 'FOLLOW_UP_3' = 'FIRST_CONTACT',
  productDossier?: ProjectDossier
): OutreachQualityResult {
  const hardBlockReasons: string[] = [];
  const warnings: string[] = [];
  const claims: OutreachClaim[] = [];
  const factsUsed: string[] = [];
  const inferencesExcluded: string[] = [];
  const productClaimsUsed: string[] = [];

  const evidences = ensureEvidenceIds(prospect.evidences || []);
  const verifiedFacts = evidences.filter(e => e.status === 'FACT');
  const inferences = evidences.filter(e => e.status === 'INFERENCE');

  // Traccia le inference escluse da First Contact
  inferences.forEach(inf => inferencesExcluded.push(inf.claim));

  // 1. HARD BLOCK: Numeri o risparmi orari quantitativi non dimostrati
  const numericalHourMatch = messageContent.match(/\b(\d+)\s*(ore|h|giorni|minuti)\s*(a settimana|al mese|al giorno|risparmiate|perse)\b/i);
  const genericQuantPromise = messageContent.match(/\b(risparmi|perdi|azzer)\w*\s*(\d+|decine|centinaia)\b/i);
  if (numericalHourMatch || genericQuantPromise) {
    hardBlockReasons.push(`HARD_BLOCK: Promessa numerica quantitativa non dimostrata ("${(numericalHourMatch || genericQuantPromise)?.[0]}").`);
  }

  // 2. HARD BLOCK: Assunzioni non verificate sul carico o disorganizzazione ("immagino che...")
  const unsupportedPainAssumption = messageContent.match(/\b(immagino che (perdiate|passiate|la vostra segreteria sia sommersa|abbiate il problema)|sicuramente (perdete|avete))\b/i);
  if (unsupportedPainAssumption) {
    hardBlockReasons.push(`HARD_BLOCK: Assunzione di dolore non verificata presentata come certezza ("${unsupportedPainAssumption[0]}").`);
  }

  // 3. HARD BLOCK: Promesse di ROI, sconti o certezze assolute nel First Contact
  const roiMatch = messageContent.match(/(?:recupererete l'investimento|garantito(?: al 100%)?|roi|aumenterete le vendite|triplicherete|sconto del|prezzo bloccato a)/i);
  if (roiMatch) {
    hardBlockReasons.push(`HARD_BLOCK: Promessa commerciale assoluta o ROI non verificabile ("${roiMatch[0]}").`);
  }

  // 4. HARD BLOCK: Prezzo menzionato nel First Contact senza richiesta
  if (stage === 'FIRST_CONTACT') {
    const priceMention = messageContent.match(/(?:€\s*\d+|\d+\s*€|\d+\s*euro|\beuro\s*\d+|\bprezzo\s*è|\bcosto\s*è)/i);
    if (priceMention) {
      hardBlockReasons.push(`HARD_BLOCK: Prezzo esplicito inserito nel messaggio di FIRST_CONTACT senza richiesta del prospect ("${priceMention[0]}").`);
    }
  }

  // 5. HARD BLOCK / VERIFICA EVIDENCE: Controlla che le menzioni fattuali siano verificate
  let hasValidFactLink = false;
  for (const fact of verifiedFacts) {
    if (!fact.source_url || fact.source_url.trim() === '') {
      hardBlockReasons.push(`HARD_BLOCK: L'evidence "${fact.claim}" è priva di source_url verificabile.`);
      continue;
    }

    if (fact.confidence < 0.80) {
      hardBlockReasons.push(`HARD_BLOCK: Confidence dell'evidence "${fact.claim}" troppo bassa (${fact.confidence}).`);
      continue;
    }

    // Verifica se il claim appare nel messaggio
    const isPdfMention = /modulo|pdf|scaricabile|cartaceo/i.test(messageContent) && /pdf|modulo/i.test(fact.claim);
    const isPaymentMention = /bonifico|iban|quote|pagamento/i.test(messageContent) && /bonifico|iban|quote/i.test(fact.claim);
    const isServiceMention = /servizi|lead generation|outbound|sviluppo commerciale/i.test(messageContent) && /lead generation|outbound|servizi|sviluppo commerciale/i.test(fact.claim);
    const isBookingMention = /prenotazione|visite|preventivo|richieste|intake|modulo/i.test(messageContent) && /prenotazione|preventivo|richiesta|intake|modulo|form/i.test(fact.claim);

    if (isPdfMention || isPaymentMention || isServiceMention || isBookingMention) {
      hasValidFactLink = true;
      factsUsed.push(fact.claim);
      claims.push({
        text: fact.claim,
        type: 'FACT',
        evidence_id: fact.id,
        source_url: fact.source_url,
        is_verified: true,
        confidence: fact.confidence,
        notes: `Verificato da ${fact.source_page} (${fact.source_url})`
      });
    }
  }

  // 6. VERIFICA PRODUCT CLAIMS (Feature Registry)
  const productKey = (prospect.mode || 'danceflow').toLowerCase();
  const productMeta = VERIFIED_PRODUCT_REGISTRY[productKey] || VERIFIED_PRODUCT_REGISTRY['danceflow'];

  const productFeaturesMentioned = productMeta.allowed_claims.filter(claim => 
    messageContent.toLowerCase().includes(claim.toLowerCase()) || 
    messageContent.toLowerCase().includes(productMeta.name.toLowerCase())
  );

  productFeaturesMentioned.forEach(claimText => {
    productClaimsUsed.push(claimText);
    claims.push({
      text: claimText,
      type: 'PRODUCT_CLAIM',
      is_verified: true,
      confidence: 0.95,
      notes: `Feature certificata nel registro prodotto di ${productMeta.name}`
    });
  });

  // 7. CALCOLO METRICHE DI QUALITÀ (0-100)
  const wordCount = messageContent.trim().split(/\s+/).length;
  
  // Brevity Score
  let brevityScore = 100;
  if (channel === 'whatsapp' && (wordCount < 20 || wordCount > 100)) brevityScore = 70;
  if (channel === 'email' && (wordCount < 30 || wordCount > 160)) brevityScore = 70;
  if (channel === 'instagram' && (wordCount < 15 || wordCount > 80)) brevityScore = 70;

  // CTA Quality: verifica che termini con una domanda a bassa frizione
  let ctaScore = 90;
  const hasQuestionMark = messageContent.includes('?');
  const hasAggressiveCta = /quando possiamo fare un(a)? (demo|chiamata di vendita)|firma subito|compra/i.test(messageContent);
  if (!hasQuestionMark) {
    ctaScore = 40;
    warnings.push('Il messaggio non contiene una domanda finale chiara.');
  } else if (hasAggressiveCta) {
    ctaScore = 50;
    warnings.push('CTA troppo aggressiva per un primo contatto.');
  }

  // Evidence Validity
  let evidenceValidityScore = hasValidFactLink ? 95 : 60;
  if (verifiedFacts.length === 0) evidenceValidityScore = 50;

  // Personalization
  let personalizationScore = (messageContent.includes(prospect.name) || messageContent.includes(prospect.website)) && hasValidFactLink ? 95 : 65;

  // Clarity & Conversation Potential
  const clarityScore = wordCount <= 130 && !messageContent.includes('•') ? 95 : 80;
  const conversationScore = hasQuestionMark && !hasAggressiveCta && hardBlockReasons.length === 0 ? 90 : 60;
  const productAccuracyScore = hardBlockReasons.length === 0 ? 95 : 40;

  const totalScore = Math.round(
    (evidenceValidityScore * 0.30) +
    (personalizationScore * 0.20) +
    (clarityScore * 0.15) +
    (conversationScore * 0.15) +
    (ctaScore * 0.10) +
    (brevityScore * 0.05) +
    (productAccuracyScore * 0.05)
  );

  let status: OutreachQualityResult['status'] = 'READY_FOR_APPROVAL';
  if (hardBlockReasons.length > 0) {
    status = 'BLOCKED';
  } else if (totalScore < 80) {
    status = 'NEEDS_REVIEW';
  }

  return {
    score: totalScore,
    breakdown: {
      evidence_validity: evidenceValidityScore,
      personalization: personalizationScore,
      clarity: clarityScore,
      conversation_potential: conversationScore,
      cta_quality: ctaScore,
      brevity: brevityScore,
      product_accuracy: productAccuracyScore,
    },
    status,
    hard_block_reasons: hardBlockReasons,
    warnings,
    claims,
    facts_used: factsUsed,
    inferences_excluded: inferencesExcluded,
    product_claims_used: productClaimsUsed,
  };
}

/**
 * Genera una bozza di FIRST_CONTACT focalizzata solo su FACT ed inizio conversazione (senza feature dump o prezzi)
 */
export function generateFirstContactOutreach(
  prospect: ProspectLead,
  channel: 'whatsapp' | 'email' | 'instagram' | 'linkedin' = 'whatsapp',
  productDossier?: ProjectDossier
): { draft: OutreachMessage; quality: OutreachQualityResult } {
  const evidences = ensureEvidenceIds(prospect.evidences || []);
  const factEvidence = evidences.find(e => e.status === 'FACT');

  let subject = '';
  let content = '';
  const mode = prospect.mode || 'danceflow';

  if (mode === 'danceflow') {
    subject = `Iscrizioni online per ${prospect.name}`;
    if (channel === 'whatsapp') {
      if (factEvidence && /pdf|modulo/i.test(factEvidence.claim)) {
        content = `Ciao, ho visto sul vostro sito (${prospect.website}) che per le iscrizioni utilizzate un modulo scaricabile.\n\nStiamo sviluppando DanceFlow per consentire alle scuole di danza di raccogliere iscrizioni e quote direttamente da smartphone con un link semplice.\n\nHa senso se ti mostro in 5 minuti come funziona?`;
      } else if (factEvidence && /bonifico|iban/i.test(factEvidence.claim)) {
        content = `Ciao, ho visto sul vostro sito (${prospect.website}) che le quote vengono saldate tramite bonifico in segreteria.\n\nStiamo sviluppando DanceFlow per semplificare i rinnovi e l'anagrafica degli allievi direttamente da smartphone.\n\nÈ un processo che gestite ancora manualmente o avete già un software dedicato?`;
      } else {
        content = `Ciao, ho visto le attività di ${prospect.name} a ${prospect.city}.\n\nStiamo sviluppando un sistema per digitalizzare le iscrizioni e le presenze dei corsi di danza.\n\nTi andrebbe di vedere un breve esempio di 5 minuti senza impegno?`;
      }
    } else if (channel === 'email') {
      content = `Gentile direzione di ${prospect.name},\n\nho notato sul vostro sito (${prospect.website}) che per le iscrizioni fate riferimento a un modulo scaricabile.\n\nAbbiamo progettato DanceFlow proprio per aiutare le scuole di danza a digitalizzare la raccolta dei moduli e la conferma delle quote da smartphone, senza passaggi cartacei.\n\nHa senso se ti mando un breve video di 3 minuti per mostrarti come funziona?`;
    } else {
      // Instagram DM
      content = `Ciao! Ho notato sul vostro sito (${prospect.website}) che utilizzate un modulo scaricabile per le iscrizioni.\n\nStiamo sviluppando DanceFlow per gestire iscrizioni e quote direttamente da smartphone.\n\nTi posso inviare un rapido esempio?`;
    }
  } else if (mode === 'vedetta') {
    subject = `Ricerca prospect B2B per ${prospect.name}`;
    if (channel === 'email' || channel === 'linkedin') {
      content = `Gentile team di ${prospect.name},\n\nho visto sul vostro sito (${prospect.website}) che offrite servizi di sviluppo commerciale e lead generation B2B per i vostri clienti.\n\nStiamo testando Vedetta Sales OS, una tecnologia che qualifica i prospect estraendo evidenze fattuali certe dai loro siti prima di contattarli.\n\nHa senso se vi mostro un test pratico di 5 minuti con 10 prospect per il vostro target?`;
    } else {
      content = `Ciao, ho visto sul vostro sito (${prospect.website}) che vi occupate di sviluppo commerciale e lead generation B2B.\n\nStiamo sviluppando Vedetta per identificare lead con evidenze certificate.\n\nVi andrebbe di fare un test su 5 prospect reali?`;
    }
  } else if (mode === 'ai-automation') {
    subject = `Gestione richieste e processi per ${prospect.name}`;
    if (factEvidence && /preventivo|visite|prenotazione|intake/i.test(factEvidence.claim)) {
      content = `Gentile direzione di ${prospect.name},\n\nho notato sul vostro sito (${prospect.website}) che raccogliete le richieste tramite modulo web per preventivo o prenotazione.\n\nSupportiamo le aziende del settore ad automatizzare l'intake delle pratiche e il passaggio dati nei gestionali interni.\n\nÈ un flusso che richiede ancora lavoro manuale al vostro team o avete già integrato automazioni?`;
    } else {
      content = `Gentile direzione di ${prospect.name},\n\nho notato sul vostro sito (${prospect.website}) che raccogliete le richieste tramite modulo di contatto.\n\nSupportiamo le aziende del settore ad automatizzare l'intake delle pratiche e il passaggio dati nei gestionali interni.\n\nÈ un flusso che richiede ancora lavoro manuale al vostro team o avete già integrato automazioni?`;
    }
  }

  // Esegui la verifica con l'Evidence Guard
  const quality = verifyAndScoreOutreach(prospect, content, channel, 'FIRST_CONTACT', productDossier);

  const draft: OutreachMessage = {
    prospect_id: prospect.id || 0,
    channel,
    stage: 'FIRST_CONTACT',
    subject: subject || undefined,
    content,
    quality_score: quality.score,
    status: quality.status,
    evidence_ids: quality.claims.filter(c => c.evidence_id).map(c => c.evidence_id!),
    claims: quality.claims,
    quality_details: quality,
    created_at: new Date().toISOString(),
    approved_at: null,
    sent_at: null,
  };

  return { draft, quality };
}

/**
 * Follow-Up Engine con obiettivi distinti per ogni step
 */
export function generateFollowUpOutreach(
  prospect: ProspectLead,
  step: 1 | 2 | 3,
  channel: 'whatsapp' | 'email' | 'instagram' | 'linkedin' = 'whatsapp'
): OutreachMessage {
  let content = '';
  let stage: OutreachMessage['stage'] = 'FOLLOW_UP_1';

  if (step === 1) {
    stage = 'FOLLOW_UP_1';
    content = `Ciao, ti lascio un rapido promemoria al messaggio sopra per sapere se hai avuto modo di vederlo.\n\nSe può esserti utile dare un'occhiata veloce al funzionamento, resto a disposizione.`;
  } else if (step === 2) {
    stage = 'FOLLOW_UP_2';
    content = `Ciao, ti condivido un breve spunto: abbiamo visto che digitalizzare anche solo la raccolta del modulo di inizio anno evita di dover reinserire a mano le anagrafiche.\n\nSe ti va di vedere una schermata di esempio, fammi sapere.`;
  } else {
    stage = 'FOLLOW_UP_3';
    content = `Ciao, non voglio disturbarti oltre. Se in futuro vorrete valutare come digitalizzare moduli e quote allievi, sai dove trovarci.\n\nBuon lavoro con le attività della scuola!`;
  }

  const quality = verifyAndScoreOutreach(prospect, content, channel, stage);

  return {
    prospect_id: prospect.id || 0,
    channel,
    stage,
    content,
    quality_score: quality.score,
    status: quality.status,
    evidence_ids: [],
    claims: quality.claims,
    quality_details: quality,
    created_at: new Date().toISOString(),
  };
}

/**
 * Classificatore delle risposte del prospect e generatore di strategia Human-in-the-Loop
 */
export function classifyAndRespondToReply(replyText: string, prospect: ProspectLead): ReplyClassification {
  const textLower = replyText.toLowerCase();

  // 1. PRICE_REQUEST
  if (/quanto costa|prezzo|tariffe|listino|costi|preventivo/i.test(textLower)) {
    return {
      intent: 'PRICE_REQUEST',
      confidence: 0.95,
      detected_objection: 'Richiesta esplicita di prezzo',
      recommended_response_strategy: 'Fornire trasparenza sul pricing base (€49/m), indicare brevemente cosa include, porre una domanda qualificante.',
      suggested_reply_draft: `L'abbonamento parte da €49/mese e include moduli online illimitati e portale allievi, senza costi di attivazione. Per darti un'indicazione precisa, quanti allievi o corsi gestite indicativamente?`
    };
  }

  // 2. INTERESTED
  if (/interessante|dimmi di più|volentieri|come funziona|vediamo|mandami|quando/i.test(textLower)) {
    return {
      intent: 'INTERESTED',
      confidence: 0.92,
      recommended_response_strategy: 'Fissare una call di 7 minuti senza attrito o inviare link diretto a demo registrata.',
      suggested_reply_draft: `Ottimo! Ti posso condividere lo schermo per 7 minuti su Meet quando ti è più comodo: hai uno slot domani alle 11:30 o preferisci nel pomeriggio?`
    };
  }

  // 3. EXISTING_SOLUTION
  if (/usiamo già|abbiamo già|utilizziamo|golee|teamup|sportrick|gestionale|excel/i.test(textLower)) {
    return {
      intent: 'EXISTING_SOLUTION',
      confidence: 0.90,
      detected_objection: 'Software concorrente o foglio di calcolo già in uso',
      recommended_response_strategy: 'Accogliere la risposta positivamente e chiedere con curiosità se copre anche i moduli digitali per smartphone.',
      suggested_reply_draft: `Ottimo, avere già un sistema impostato è un vantaggio. Vi trovate bene anche per la firma digitale dei moduli da smartphone degli allievi o quella parte la gestite ancora a mano?`
    };
  }

  // 4. NOT_INTERESTED
  if (/non mi interessa|non siamo interessati|non serve|lasciate perdere|no grazie|cancellatemi/i.test(textLower)) {
    return {
      intent: 'NOT_INTERESTED',
      confidence: 0.96,
      recommended_response_strategy: 'Ringraziare cordialmente senza alcuna insistenza e archiviare il lead.',
      suggested_reply_draft: `Grazie mille per il riscontro! Nessun problema, vi auguro una splendida stagione sportiva.`
    };
  }

  // 5. REFERRAL
  if (/parla con|senti|contatta|responsabile|segreteria|scrivi a/i.test(textLower)) {
    return {
      intent: 'REFERRAL',
      confidence: 0.88,
      recommended_response_strategy: 'Ringraziare per il contatto e spostare la conversazione sul referente indicato.',
      suggested_reply_draft: `Grazie per l'indicazione! Provvedo a contattare direttamente il referente citato.`
    };
  }

  // 6. QUESTION
  return {
    intent: 'QUESTION',
    confidence: 0.80,
    recommended_response_strategy: 'Rispondere in modo chiaro e conciso alla domanda specifica.',
    suggested_reply_draft: `Grazie per la domanda. Il sistema è pensato specificamente per essere usato senza installazione, direttamente da browser o smartphone.`
  };
}
