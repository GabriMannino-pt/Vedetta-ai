export type ReplyCategory =
  | 'INTERESTED'
  | 'PRICE_REQUEST'
  | 'QUESTION'
  | 'DEMO_REQUEST'
  | 'NOT_INTERESTED'
  | 'EXISTING_SOLUTION'
  | 'TIMING'
  | 'REFERRAL'
  | 'OUT_OF_OFFICE'
  | 'UNCLEAR';

export interface ReplyClassificationResult {
  category: ReplyCategory;
  confidence: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  recommended_next_action: string;
  suggested_reply_draft: string;
  is_positive_reply: boolean;
}

/** Classifica una risposta email in arrivo ed elabora la bozza di risposta */
export function classifyInboundReply(
  replyText: string,
  prospectName?: string,
  product?: string
): ReplyClassificationResult {
  const lower = replyText.toLowerCase();
  const name = prospectName || 'Gentile contatto';
  const prod = product || 'DanceFlow';

  // 1. DEMO REQUEST
  if (
    lower.includes('demo') ||
    lower.includes('vedere') ||
    lower.includes('mostrare') ||
    lower.includes('video') ||
    lower.includes('volentieri') ||
    lower.includes('mandami') ||
    lower.includes('disponibile')
  ) {
    return {
      category: 'DEMO_REQUEST',
      confidence: 90,
      sentiment: 'POSITIVE',
      is_positive_reply: true,
      recommended_next_action: 'Inviare link Calendly o accesso demo riservato entro 2 ore.',
      suggested_reply_draft: `Buongiorno,\n\ngrazie per il riscontro positivo! Vi ho preparato l'accesso demo con una configurazione per i vostri corsi a questo link rapido: [Link Demo]\n\nSe preferite possiamo fare 10 minuti di videochiamata veloce per farvi vedere esattamente come funziona la segreteria.\n\nResto a disposizione,\nGabriele Mannino`,
    };
  }

  // 2. PRICE REQUEST
  if (lower.includes('costo') || lower.includes('prezzo') || lower.includes('quanto') || lower.includes('tariffa')) {
    return {
      category: 'PRICE_REQUEST',
      confidence: 85,
      sentiment: 'POSITIVE',
      is_positive_reply: true,
      recommended_next_action: 'Presentare il pricing trasparente e proporre pilot gratuito.',
      suggested_reply_draft: `Buongiorno,\n\nil piano standard per le scuole prevede un canone di 89€/mese (tutto incluso senza costi di setup), con la possibilità di testarlo gratuitamente per i primi 14 giorni.\n\nSe vuole le mostro una demo veloce per verificare insieme se fa al caso vostro.\n\nUn cordiale saluto,\nGabriele Mannino`,
    };
  }

  // 3. NOT INTERESTED / EXISTING SOLUTION
  if (
    lower.includes('non siamo interessati') ||
    lower.includes('usiamo già') ||
    lower.includes('non ci interessa') ||
    lower.includes('cancellare') ||
    lower.includes('rimuovere')
  ) {
    return {
      category: lower.includes('usiamo già') ? 'EXISTING_SOLUTION' : 'NOT_INTERESTED',
      confidence: 95,
      sentiment: 'NEGATIVE',
      is_positive_reply: false,
      recommended_next_action: 'Prendere atto con educazione e aggiornare lo stato del deal a LOST.',
      suggested_reply_draft: `Grazie per il riscontro, vi auguro buon lavoro e ottima stagione!\n\nCordiali saluti,\nGabriele Mannino`,
    };
  }

  // 4. TIMING / OUT OF OFFICE
  if (lower.includes('ferie') || lower.includes('fuori ufficio') || lower.includes('più avanti') || lower.includes('risentirci')) {
    return {
      category: lower.includes('fuori ufficio') || lower.includes('ferie') ? 'OUT_OF_OFFICE' : 'TIMING',
      confidence: 80,
      sentiment: 'NEUTRAL',
      is_positive_reply: false,
      recommended_next_action: 'Impostare task di follow-up tra 15-30 giorni.',
      suggested_reply_draft: `Perfetto, vi ricontatterò più avanti. Buona continuazione!\n\nGabriele Mannino`,
    };
  }

  // Fallback: QUESTION / UNCLEAR
  return {
    category: 'QUESTION',
    confidence: 60,
    sentiment: 'NEUTRAL',
    is_positive_reply: false,
    recommended_next_action: 'Rispondere alla domanda specifica e rinnovare la proposta di demo.',
    suggested_reply_draft: `Buongiorno,\n\ngrazie per la risposta. Rispondo volentieri alla vostra richiesta: [...]\n\nResto a disposizione per qualsiasi chiarimento.\n\nGabriele Mannino`,
  };
}
