// ─── Tipi condivisi per il progetto Vedetta 1.0 ───

/** Singolo elemento di evidenza con verifica fattuale rigorosa */
export interface EvidenceItem {
  id?: string;
  claim: string;
  status: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  type?: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  source_url: string;
  source_page: string;
  evidence_text: string;
  confidence: number;
  captured_at?: string;
}

/** Claim tracciabile in una bozza di outreach */
export interface OutreachClaim {
  text: string;
  type: 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'PRODUCT_CLAIM';
  evidence_id?: string;
  source_url?: string;
  is_verified: boolean;
  confidence: number;
  notes?: string;
}

/** Valutazione di qualità e controllo Evidence Guard di un messaggio */
export interface OutreachQualityResult {
  score: number; // 0-100
  breakdown: {
    evidence_validity: number;       // 30%
    personalization: number;         // 20%
    clarity: number;                 // 15%
    conversation_potential: number;  // 15%
    cta_quality: number;             // 10%
    brevity: number;                 // 5%
    product_accuracy: number;        // 5%
  };
  status: 'READY_FOR_APPROVAL' | 'NEEDS_REVIEW' | 'BLOCKED';
  hard_block_reasons: string[];
  warnings: string[];
  claims: OutreachClaim[];
  facts_used: string[];
  inferences_excluded: string[];
  product_claims_used: string[];
}

/** Messaggio di Outreach tracciato nel database con governance rigorosa */
export interface OutreachMessage {
  id?: number;
  prospect_id: number;
  channel: 'whatsapp' | 'email' | 'instagram' | 'linkedin' | 'phone';
  stage: 'FIRST_CONTACT' | 'FOLLOW_UP_1' | 'FOLLOW_UP_2' | 'FOLLOW_UP_3';
  subject?: string;
  content: string;
  quality_score: number;
  status: 'DRAFT' | 'NEEDS_REVIEW' | 'BLOCKED' | 'READY_FOR_APPROVAL' | 'APPROVED' | 'SENT' | 'REPLIED' | 'ARCHIVED';
  evidence_ids: string[];
  claims: OutreachClaim[];
  quality_details?: OutreachQualityResult;
  created_at: string;
  approved_at?: string | null;
  sent_at?: string | null;
}

/** Classificazione delle risposte ricevute */
export type ReplyIntent = 'PRICE_REQUEST' | 'INTERESTED' | 'EXISTING_SOLUTION' | 'NOT_INTERESTED' | 'REFERRAL' | 'QUESTION';

export interface ReplyClassification {
  intent: ReplyIntent;
  confidence: number;
  detected_objection?: string;
  recommended_response_strategy: string;
  suggested_reply_draft: string;
}

/** Risultato dettagliato della scomposizione del punteggio (0-100) */
export interface ProspectScoreBreakdown {
  fit: number;       // Quanto assomiglia al cliente ideale (0-100)
  pain: number;      // Quanto è evidente e pesante il problema (0-100)
  intent: number;    // Quanto è vicino o reattivo all'acquisto (0-100)
  value: number;     // Valore economico potenziale per il prodotto (0-100)
}

/** Scheda Prospect Generica per qualsiasi Mode (DanceFlow, Vedetta, AI-Automation, ecc.) */
export interface ProspectLead {
  id?: number;
  mode: string;
  name: string;
  city: string;
  website: string;
  email: string | null;
  phone: string | null;
  social: string | null;
  estimated_size: string;
  key_signals: string[];
  evidences: EvidenceItem[];
  pain_points: string[];
  competitor_current_software: string;
  score_breakdown: ProspectScoreBreakdown;
  opportunity_score: number;
  danceflow_score?: number;
  classification: 'A+' | 'A' | 'B' | 'C' | 'IGNORE';
  reason: string;
  opening_angle: string;
  recommended_action: string;
  suggested_outreach: {
    channel: 'email' | 'whatsapp' | 'linkedin' | 'phone';
    subject: string;
    opening: string;
    body: string;
    cta: string;
  };
  outreach_draft?: OutreachMessage;
  deal_value?: {
    estimated_mrr: number;
    setup_fee: number;
    probability_percent: number;
  };
  scouted_at: string;
}

/** Tipo alias per retrocompatibilità */
export type DanceFlowProspect = ProspectLead;

/** Project Dossier generato da GitHub / Workspace */
export interface ProjectDossier {
  name: string;
  repo_url: string;
  local_path?: string;
  description: string;
  tech_stack: string[];
  features: string[];
  target_user: string;
  business_model: 'SaaS B2B' | 'High-Ticket Services' | 'SaaS B2C' | 'Open Source / Tool' | 'Unknown';
  pricing_model: string;
  estimated_price_range: string;
  maturity: 'Production / Ready' | 'MVP / Testing' | 'Early Stage' | 'Abandoned / Concept';
  dependencies: string[];
  last_meaningful_change: {
    date: string;
    type: 'STRIPE_ADDED' | 'PRICING_ADDED' | 'ONBOARDING_ADDED' | 'CORE_FEATURE' | 'LANDING_PAGE' | 'GENERAL_UPDATE';
    description: string;
  };
  commercial_audit?: CommercialAuditResult;
}

/** Valutazione Commerciale e Market Auditor di un Progetto */
export interface CommercialAuditResult {
  project_name: string;
  market_size_score: number;       // 0-100
  demand_score: number;            // 0-100
  pain_score: number;              // 0-100
  competition_score: number;       // 0-100
  pricing_power_score: number;     // 0-100
  differentiation_score: number;   // 0-100
  commercial_score: number;        // 0-100
  decision: '🚀 LAUNCH' | '🧪 VALIDATE' | '👀 WATCH' | '❌ ABANDON';
  rationale: string;
  target_mode: string;
  recommended_first_step: string;
  estimated_tam: string;
  autonomous_alert?: string;
}

/** Opportunità / Deal nel CRM Economico */
export interface DealItem {
  id?: number;
  prospect_id?: number;
  project_name: string;
  company_name: string;
  stage: 'DISCOVERED' | 'QUALIFIED' | 'CONTACTED' | 'REPLIED' | 'INTERESTED' | 'DEMO' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST' | 'NURTURE';
  potential_mrr: number;
  potential_arr: number;
  one_time_fee: number;
  probability_percent: number;
  weighted_value: number;
  last_interaction?: string;
  next_action?: string;
  created_at: string;
  updated_at: string;
}

/** Task operativo del Sales Manager per la giornata */
export interface DailyActionTask {
  id: string;
  priority: 'URGENT_A_PLUS' | 'FOLLOW_UP' | 'DEMO_SCHEDULED' | 'APPROVAL_REQUIRED' | 'PORTFOLIO_REVIEW';
  title: string;
  target_name: string;
  channel: string;
  description: string;
  action_cta: string;
  due_date: string;
}

/** Scorecard per un singolo test della suite */
export interface TestScorecard {
  test_name: string;
  mode_or_project: string;
  records_found: number;
  records_valid: number;
  fact_evidences_count: number;
  tier_a_plus: number;
  tier_a: number;
  tier_b: number;
  tier_c: number;
  false_positives: number;
  potential_pipeline_eur: number;
  weighted_pipeline_eur: number;
  errors_or_blockers: string[];
}

/** Statistiche run scouting generico */
export interface ScoutRunStats {
  total_discovered: number;
  total_crawled: number;
  valid_schools: number;
  with_contact: number;
  with_real_fact_evidence: number;
  tier_a: number;
  tier_b: number;
  tier_c: number;
  false_positives: number;
}

/** Post grezzo recuperato da una qualsiasi fonte */
export interface RawPost {
  source: 'reddit' | 'upwork' | 'outbound' | 'twitter' | 'n8n_forum' | 'make_forum';
  id: string;
  url: string;
  title: string;
  body: string;
  author: string;
  createdAt: Date;
  subreddit?: string;
  upworkBudget?: string;
}

/** Risultato dello scoring — struttura legacy */
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
  pipeline_status?: 'nuovo' | 'contattato' | 'in_trattativa' | 'preventivo_inviato' | 'chiuso_vinto' | 'chiuso_perso';
  client_email?: string | null;
  notes?: string | null;
  tipo?: 'inbound' | 'outbound';
}

/** Configurazione caricata da config.json */
export interface AppConfig {
  reddit: {
    searchQueries: string[];
    resultsPerQuery: number;
    maxPostAgeDays: number;
  };
  upwork: {
    keywords: string[];
    resultsPerKeyword: number;
    maxPostAgeDays: number;
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
