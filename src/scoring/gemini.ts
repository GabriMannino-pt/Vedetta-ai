import { GoogleGenerativeAI } from '@google/generative-ai';
import { RawPost, ScoringResult } from '../types';
import { appConfig, requireEnv } from '../config';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(requireEnv('GEMINI_API_KEY'));
  }
  return genAI;
}

// ── Prompt esatto fornito dall'utente (NON modificare) ──────────────────────
function buildPrompt(post: RawPost): string {
  const testo = [post.title, post.body].filter(Boolean).join('\n\n');
  const fonte = post.source;
  const url = post.url;

  if (fonte === 'outbound') {
    return `Sei un esperto di Lead Generation B2B e automazione aziendale. Ti fornirò i dettagli di un decisore aziendale (CEO/Founder/Titolare) in Italia. Il tuo compito è valutare se il settore e l'azienda si prestano bene all'automazione dei processi (es. n8n, Make, CRM, AI).

DETTAGLI PROSPECT DA ANALIZZARE:
"""
${testo}
"""

Rispondi SOLO in formato JSON, nessun testo aggiuntivo, seguendo esattamente questa struttura:

{
  "e_opportunita": true/false,
  "punteggio_intent": 0-10,
  "settore": "es. immobiliare, e-commerce, clinica dentale, logistica, agenzia marketing, ecc",
  "problema_identificato": "principale collo di bottiglia operativo tipico di questo specifico settore (es. inserimento manuale annunci, follow-up lento dei lead, preventivazione manuale)",
  "evidenza_budget": false,
  "evidenza_budget_dettaglio": null,
  "urgenza": "media",
  "soluzione_proposta": "come risolveresti il collo di bottiglia tipico di questo settore usando n8n, Make o l'AI (max 2 frasi)",
  "bozza_risposta": "una COLD EMAIL di prospezione in ITALIANO rivolta direttamente al decisore (usa il suo nome, es. 'Gentile Mario Rossi' o 'Gentile Dott. Rossi'). Il tono deve essere professionale, diretto ed estremamente cordiale. Spiega brevemente che aiuti le aziende del settore [Settore] ad automatizzare [problema tipico] per far risparmiare ore di lavoro. Proponi una brevissima chiamata conoscitiva di 10 minuti. NON usare formule vecchie o impersonali.",
  "motivazione_scarto": "se e_opportunita è false, spiega perché il settore o l'azienda non ha processi facilmente automatizzabili"
}

CRITERI DI SCORING per punteggio_intent (Potenziale di automazione del settore):
- 8-10: Settori ad alto volume transazionale o ricchi di contatti e dati (es. agenzie immobiliari, e-commerce, agenzie di marketing, recruiting/HR, cliniche mediche, studi legali/commercialisti).
- 5-7: Settori con volume medio o processi fisici preponderanti (es. hotel, ristoranti, edilizia locale, artigianato, aziende manifatturiere medio-piccole).
- 0-4: Settori con pochissimo lavoro d'ufficio o impossibili da automatizzare (es. liberi professionisti singoli senza struttura, negozi fisici molto piccoli, attività a conduzione familiare senza digitalizzazione).

SCARTA (e_opportunita: false) se:
- Il settore dell'azienda non ha flussi digitali da automatizzare.
- Non si rilevano colli di bottiglia operativi evidenti risolvibili con n8n/AI.`;
  }

  return `Sei un analista che identifica opportunità di business per servizi di automazione (n8n, Zapier, script custom, integrazioni AI).

Ti fornirò il testo di un post/thread/job posting. Il tuo compito è valutare se rappresenta un'opportunità commerciale reale e concreta.

TESTO DA ANALIZZARE:
"""
${testo}
"""

FONTE: ${fonte}
LINK: ${url}

Rispondi SOLO in formato JSON, nessun testo aggiuntivo, seguendo esattamente questa struttura:

{
  "e_opportunita": true/false,
  "punteggio_intent": 0-10,
  "settore": "es. immobiliare, dentisti, e-commerce, agenzie marketing, ecc",
  "problema_identificato": "descrizione breve e concreta del dolore operativo espresso",
  "evidenza_budget": true/false,
  "evidenza_budget_dettaglio": "citazione o riferimento a budget/prezzo se presente, altrimenti null",
  "urgenza": "alta/media/bassa",
  "soluzione_proposta": "breve descrizione tecnica di come risolveresti il problema con un'automazione (max 2 frasi)",
  "bozza_risposta": "testo pronto da postare come commento pubblico o messaggio - deve essere utile e genuino, NON un pitch di vendita diretto, con un CTA soft alla fine tipo 'se vuoi approfondire scrivimi'",
  "motivazione_scarto": "se e_opportunita è false, spiega perché (es. solo sfogo senza intento d'azione, problema troppo generico, fuori scope automazioni)"
}

CRITERI DI SCORING per punteggio_intent:
- 8-10: menziona esplicitamente di voler pagare/assumere qualcuno, usa verbi di azione decisi ("cerco", "voglio assumere", "budget di X")
- 5-7: descrive il problema con dettaglio e frustrazione ma senza menzione esplicita di budget
- 0-4: sfogo generico, nessun segnale di intenzione di risolvere a breve, o problema troppo vago per essere risolto con automazione

SCARTA (e_opportunita: false) se:
- Il post è solo lamentela senza intento di agire
- Il problema richiede sviluppo software complesso, non automazione/integrazione
- Il settore o il problema sono già saturi di soluzioni standard (es. "voglio automatizzare l'invio di email con Mailchimp" - già risolto da tool esistenti)

SE LA FONTE È 'upwork', SCARTA RIGIDAMENTE (e_opportunita: false) se:
- Il budget indicato (fisso o orario) è inferiore a 500$ (es. progetti fissi da 50$-300$, tariffe orarie irrisorie < 20$/ora) o assente a fronte di richieste complesse.
- Il post proviene da agenzie intermediarie che cercano sviluppatori a basso costo per subappalto, outsourcing o contratti "white label" (es. cercano programmatori generici da inserire nel loro pool a basso costo).
- La richiesta è scritta in modo estremamente generico, approssimativo e senza dettagli operativi minimi (es. "I need an automation helper" o "automate my business" senza specificare strumenti, software o flussi di lavoro concreti).`;
}

/**
 * Tenta di estrarre un oggetto JSON valido dalla risposta di Gemini,
 * anche se contiene testo extra (code fences, spazi, etc.)
 */
function parseJsonResponse(raw: string): ScoringResult {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Nessun oggetto JSON trovato nella risposta');
  }

  const jsonStr = cleaned.substring(start, end + 1);
  const parsed = JSON.parse(jsonStr);

  if (typeof parsed.e_opportunita !== 'boolean' || typeof parsed.punteggio_intent !== 'number') {
    throw new Error('JSON valido ma manca e_opportunita o punteggio_intent');
  }

  return parsed as ScoringResult;
}

/**
 * Analizza un singolo post con Gemini e restituisce il risultato di scoring.
 * Retry automatico in caso di errore di parsing (max config.scoring.maxRetries tentativi).
 */
export async function scorePost(post: RawPost): Promise<ScoringResult | null> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: appConfig.scoring.geminiModel,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
    },
  });
  const prompt = buildPrompt(post);
  const maxRetries = appConfig.scoring.maxRetries;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Risposta Gemini vuota');
      }

      const parsed = parseJsonResponse(text);
      return parsed;
    } catch (err: any) {
      const isLastAttempt = attempt === maxRetries + 1;
      const isRateLimit = err?.status === 429 || err?.message?.includes('429');

      if (isRateLimit) {
        const waitMs = 60_000; // Gemini free tier: aspetta 1 minuto intero per sbloccare la quota
        console.warn(`[GEMINI] ⚠️  Rate limited, attendo ${waitMs / 1000}s...`);
        await sleep(waitMs);
        continue;
      }

      if (isLastAttempt) {
        console.error(`[GEMINI] ❌ Scoring fallito per "${post.title.substring(0, 60)}..." dopo ${maxRetries + 1} tentativi:`, err.message);
        return null;
      }

      console.warn(`[GEMINI] ⚠️  Tentativo ${attempt}/${maxRetries + 1} fallito, retry...`);
      await sleep(2000);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
