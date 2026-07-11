// ─── Tipi condivisi per il progetto Vedetta ───

/** Post grezzo recuperato da una qualsiasi fonte */
export interface RawPost {
  source: 'reddit' | 'upwork';
  id: string;
  url: string;
  title: string;
  body: string;
  author: string;
  createdAt: Date;
  subreddit?: string;       // solo per Reddit
  upworkBudget?: string;    // solo per Upwork
}

/** Risultato dello scoring — struttura esatta del prompt */
export interface ScoringResult {
  e_opportunita: boolean;
  punteggio_intent: number;
  settore: string;
  problema_identificato: string;
  evidenza_budget: boolean;
  evidenza_budget_dettaglio: string | null;
  urgenza: 'alta' | 'media' | 'bassa';
  soluzione_proposta: string;
  bozza_risposta: string;
  motivazione_scarto: string | null;
}

/** Lead salvato nel database */
export interface Lead {
  id?: number;
  fonte: string;
  url: string;
  titolo: string;
  testo: string;
  punteggio_intent: number;
  settore: string;
  problema: string;
  soluzione_proposta: string;
  bozza_risposta: string;
  evidenza_budget: boolean;
  evidenza_budget_dettaglio: string | null;
  urgenza: string;
  data_trovato: string;
  stato: 'nuovo' | 'processato' | 'contattato';
}

/** Configurazione caricata da config.json */
export interface AppConfig {
  reddit: {
    subreddits: string[];
    maxPostAgeDays: number;
    postsPerSubreddit: number;
  };
  upwork: {
    keywords: string[];
    maxResults: number;
  };
  scoring: {
    minIntentScore: number;
    geminiModel: string;
    maxRetries: number;
    delayBetweenCallsMs: number;
  };
  report: {
    maxLeadsInReport: number;
  };
}
