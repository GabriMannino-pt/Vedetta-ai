import Anthropic from '@anthropic-ai/sdk';
import { RawPost, ScoringResult } from '../types';
import { appConfig, requireEnv } from '../config';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  }
  return client;
}

// ── Prompt esatto fornito dall'utente (NON modificare) ──────────────────────
function buildPrompt(post: RawPost): string {
  const testo = [post.title, post.body].filter(Boolean).join('\n\n');
  const fonte = post.source;
  const url = post.url;

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
- Il settore o il problema sono già saturi di soluzioni standard (es. "voglio automatizzare l'invio di email con Mailchimp" - già risolto da tool esistenti)`;
}

/**
 * Tenta di estrarre un oggetto JSON valido dalla risposta di Claude,
 * anche se contiene testo extra (code fences, spazi, etc.)
 */
function parseJsonResponse(raw: string): ScoringResult {
  // Rimuovi eventuale code fence ```json ... ```
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Trova il primo { e l'ultimo }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Nessun oggetto JSON trovato nella risposta');
  }

  const jsonStr = cleaned.substring(start, end + 1);
  const parsed = JSON.parse(jsonStr);

  // Validazione minima dei campi obbligatori
  if (typeof parsed.e_opportunita !== 'boolean' || typeof parsed.punteggio_intent !== 'number') {
    throw new Error('JSON valido ma manca e_opportunita o punteggio_intent');
  }

  return parsed as ScoringResult;
}

/**
 * Analizza un singolo post con Claude e restituisce il risultato di scoring.
 * Retry automatico in caso di errore di parsing (max config.scoring.maxRetries tentativi).
 */
export async function scorePost(post: RawPost): Promise<ScoringResult | null> {
  const anthropic = getClient();
  const prompt = buildPrompt(post);
  const maxRetries = appConfig.scoring.maxRetries;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: appConfig.scoring.claudeModel,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Risposta Claude senza blocco testo');
      }

      const result = parseJsonResponse(textBlock.text);
      return result;
    } catch (err: any) {
      const isLastAttempt = attempt === maxRetries + 1;
      const isRateLimit = err?.status === 429;

      if (isRateLimit) {
        const waitMs = 30_000;
        console.warn(`[CLAUDE] ⚠️  Rate limited, attendo ${waitMs / 1000}s...`);
        await sleep(waitMs);
        continue;
      }

      if (isLastAttempt) {
        console.error(`[CLAUDE] ❌ Scoring fallito per "${post.title.substring(0, 60)}..." dopo ${maxRetries + 1} tentativi:`, err.message);
        return null;
      }

      console.warn(`[CLAUDE] ⚠️  Tentativo ${attempt}/${maxRetries + 1} fallito, retry...`);
      await sleep(2000);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
