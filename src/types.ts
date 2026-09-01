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
  website_url?: string;
  email: string | null;
  contact_email?: string | null;
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

// ─────────────────────────────────────────────────────────────
// 💰 VEDETTA 1.1 — REVENUE OS & EXPERIMENT ENGINE TYPES
// ─────────────────────────────────────────────────────────────

export type DataTag = 'LIVE' | 'SIMULATED' | 'INSUFFICIENT_DATA';

export type ExperimentStatus =
  | 'DRAFT'
  | 'RUNNING'
  | 'INSUFFICIENT_DATA'
  | 'WINNER_FOUND'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED';

export type ExperimentVariantType = 'A' | 'B' | 'C' | 'CONTROL';

export interface Experiment {
  id: string;
  product: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  start_date: string;
  end_date?: string;
  min_sample_size: number;
  winner_variant_id?: string;
  leading_variant_id?: string;
  is_statistically_significant: boolean;
  data_tag: DataTag;
}

export interface ExperimentVariant {
  id: string;
  experiment_id: string;
  name: string;
  type: ExperimentVariantType;
  opening_hook: string;
  cta_type: string;
  offer_type: string;
  template_content?: string;
}

export interface ExperimentAssignment {
  id?: number;
  experiment_id: string;
  variant_id: string;
  prospect_id: number;
  assigned_at: string;
  channel: string;
  segment: string;
  product: string;
}

export interface ExperimentEvent {
  id?: number;
  experiment_id: string;
  variant_id: string;
  prospect_id: number;
  event_type:
    | 'EMAIL_SENT'
    | 'OPENED'
    | 'REPLIED'
    | 'POSITIVE_REPLY'
    | 'DEMO_BOOKED'
    | 'PROPOSAL_SENT'
    | 'DEAL_WON'
    | 'CASH_COLLECTED';
  value?: number;
  metadata?: Record<string, any>;
  created_at: string;
  data_tag: DataTag;
}

export interface ExperimentScorecard {
  variant_id: string;
  variant_name: string;
  sample_size: number;
  emails_sent: number;
  replies: number;
  positive_replies: number;
  demos: number;
  proposals: number;
  won: number;
  cash_collected: number;
  reply_rate: number;
  positive_reply_rate: number;
  demo_rate: number;
  close_rate: number;
  revenue_per_prospect: number;
  revenue_per_100_prospects: number;
  status: 'WINNER' | 'LEADING' | 'INSUFFICIENT_DATA' | 'LOSING';
}

export type RevenueFunnelStage =
  | 'DISCOVERED'
  | 'QUALIFIED'
  | 'CONTACTED'
  | 'REPLIED'
  | 'POSITIVE_REPLY'
  | 'DEMO'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_RECEIVED'
  | 'LOST'
  | 'NURTURE';

export type PaymentStatus = 'PENDING' | 'RECEIVED' | 'FAILED' | 'REFUNDED';

export interface RevenueAttribution {
  product: string;
  campaign: string;
  experiment_id?: string;
  variant_id?: string;
  segment?: string;
  channel: string;
  prospect_id: number;
  first_contact_date?: string;
}

export interface ExtendedDeal {
  id?: number;
  prospect_id: number;
  project_name: string;
  company_name: string;
  stage: RevenueFunnelStage;
  deal_value: number;
  setup_fee: number;
  potential_mrr: number;
  potential_arr: number;
  probability_percent: number;
  weighted_value: number;
  cash_collected: number;
  payment_status: PaymentStatus;
  won_date?: string;
  lost_reason?: string;
  attribution?: RevenueAttribution;
  data_tag: DataTag;
  created_at: string;
  updated_at: string;
}

export interface RevenueEvent {
  id?: number;
  deal_id: number;
  amount: number;
  payment_type: 'SETUP' | 'RECURRING_MRR' | 'ONE_TIME';
  status: PaymentStatus;
  received_at: string;
  transaction_ref?: string;
  attribution?: RevenueAttribution;
  data_tag: DataTag;
}

export interface DailySalesTask {
  id: string;
  priority_level: 1 | 2 | 3 | 4 | 5;
  title: string;
  reason: string;
  expected_value: number;
  urgency: 'ALTA' | 'MEDIA' | 'BASSA';
  action_type:
    | 'FOLLOW_UP_POSITIVE'
    | 'PREPARE_DEMO'
    | 'APPROVE_OUTREACH'
    | 'ANALYZE_EXPERIMENT'
    | 'STOP_EFFORT'
    | 'COLLECT_PAYMENT';
  prospect_id?: number;
  deal_id?: number;
  status: 'PENDING' | 'DONE' | 'SKIPPED';
  created_at: string;
}

export interface LearningInsight {
  id: string;
  product: string;
  pattern_type: 'SEGMENT' | 'EVIDENCE' | 'OPENING' | 'CTA' | 'OFFER' | 'CHANNEL';
  observation: string;
  confidence_percent: number;
  recommendation: 'SCALE' | 'ITERATE' | 'PAUSE' | 'ABANDON';
  evidence_data?: Record<string, any>;
  created_at: string;
  data_tag: DataTag;
}

export interface ProductCommercialScores {
  product_id: string;
  name: string;
  theoretical_score: number; // 0-100
  proven_score: number;      // 0-100
  real_cash_collected: number;
  total_deals_won: number;
  decision: '🚀 SCALE' | '🧪 VALIDATE' | '🔧 ITERATE' | '⏸ PAUSE' | '❌ ABANDON';
  decision_reason: string;
  metrics: {
    prospects_contacted: number;
    replies: number;
    demos: number;
    conversion_rate: number;
  };
  data_tag: DataTag;
}

// ─────────────────────────────────────────────────────────────
// 👤 CAREER-001 — CAREER INTELLIGENCE TYPES
// ─────────────────────────────────────────────────────────────

export type CareerSkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type CareerSkillConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
export type CareerEvidenceType = 'GITHUB_PROJECT' | 'PRODUCTION_SYSTEM' | 'PORTFOLIO' | 'CV' | 'WORK_EXPERIENCE' | 'CASE_STUDY' | 'CERTIFICATION' | 'OTHER';

export interface CareerProfile {
  id?: number;
  name: string;
  headline: string;
  summary: string;
  years_experience: number;
  seniority: string;
  target_salary_min: number;
  target_salary_max: number;
  target_hourly_rate: number;
  remote_preference: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  location: string;
  career_goal: string;
  created_at?: string;
  updated_at?: string;
}

export interface CareerSkill {
  id?: number;
  profile_id: number;
  skill: string;
  category: 'PROGRAMMING' | 'AI' | 'LLM' | 'AUTOMATION' | 'DATABASE' | 'CLOUD' | 'DEVOPS' | 'FRONTEND' | 'BACKEND' | 'ARCHITECTURE' | 'OTHER';
  level: CareerSkillLevel;
  years_experience: number;
  confidence: CareerSkillConfidence;
  created_at?: string;
  updated_at?: string;
}

export interface CareerEvidence {
  id?: number;
  profile_id: number;
  project_id?: string; // Links to existing `projects` table (primary key is name: TEXT)
  type: CareerEvidenceType;
  title: string;
  description: string;
  source_type: 'GITHUB' | 'CV' | 'CERTIFICATION' | 'CLIENT_RESULT' | 'OTHER';
  source_url?: string;
  source_reference?: string; // File name, commit SHA, or class name
  skill_id: number; // Links to `career_skills` table
  verified: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at?: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────────
// 💼 CAREER-001.2 — CAREER OPPORTUNITY CORE TYPES
// ─────────────────────────────────────────────────────────────

export type OpportunitySource = 'LINKEDIN' | 'UPWORK' | 'DIRECT' | 'RECRUITER' | 'REFERRAL' | 'OTHER';
export type OpportunityType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'FREELANCE' | 'INTERNSHIP' | 'OTHER';
export type Seniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'STAFF' | 'PRINCIPAL' | 'MANAGER' | 'OTHER' | 'UNKNOWN';
export type RemoteType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type SalaryPeriod = 'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'PROJECT' | 'UNKNOWN';
export type OpportunityStatus = 
  | 'NEW' 
  | 'REVIEW' 
  | 'SHORTLISTED' 
  | 'REJECTED' 
  | 'DRAFT_READY' 
  | 'READY_TO_APPLY' 
  | 'APPLIED' 
  | 'INTERVIEW' 
  | 'OFFER' 
  | 'ACCEPTED' 
  | 'CLOSED';

export interface CareerOpportunity {
  id?: number;
  profile_id: number;
  external_id?: string | null;
  fingerprint: string;
  source: OpportunitySource;
  source_url?: string | null;
  created_at?: string;
  updated_at?: string;

  // Detail
  title: string;
  company_name: string;
  description: string;
  opportunity_type: OpportunityType;
  seniority: Seniority;
  location: string;
  remote_type: RemoteType;

  // Compensation (Strictly nullable, not 0)
  currency?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: SalaryPeriod | null;
  hourly_rate_min?: number | null;
  hourly_rate_max?: number | null;

  // Lifecycle & Application
  deadline?: string | null;
  status: OpportunityStatus;
  first_seen_at?: string;
  last_seen_at?: string;
  applied_at?: string | null;

  // Analysis placeholders (Strictly nullable)
  analysis_status?: 'NOT_ANALYZED' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  analysis_summary?: string | null;
  role_focus_json?: string | null;
  responsibilities_json?: string | null;
  technologies_json?: string | null;
  languages_json?: string | null;
  seniority_signals_json?: string | null;
  remote_signals_json?: string | null;
  risk_signals_json?: string | null;
  extraction_confidence?: number | null;
  analyzed_at?: string | null;
  fit_score?: number | null;
  evidence_score?: number | null;
  priority_score?: number | null;
}

// ─────────────────────────────────────────────────────────────
// 🧬 CAREER-001.3 — OPPORTUNITY INTELLIGENCE TYPES
// ─────────────────────────────────────────────────────────────

export type RequirementPriority = 'MUST_HAVE' | 'SHOULD_HAVE' | 'NICE_TO_HAVE' | 'UNKNOWN';

export type RequirementCategory = 
  | 'TECHNICAL' 
  | 'EXPERIENCE' 
  | 'EDUCATION' 
  | 'LANGUAGE' 
  | 'LOCATION' 
  | 'DOMAIN' 
  | 'SOFT_SKILL' 
  | 'RESPONSIBILITY' 
  | 'OTHER';

export interface RequirementEvidence {
  sourceText: string;
  sourceType: 'JOB_DESCRIPTION';
  confidence: number;
}

export interface CareerRequirement {
  id?: number;
  opportunityId: number;
  name: string;
  normalizedName: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  yearsRequired?: number | null;
  evidence: RequirementEvidence;
  analysis_version?: number; // Forward-compatible analysis version
}

export interface OpportunityAnalysis {
  opportunityId: number;
  summary: string;
  roleFocus: string[];
  responsibilities: string[];
  requirements: CareerRequirement[];
  technologies: string[];
  languages: string[];
  senioritySignals: string[];
  remoteSignals: string[];
  riskSignals: string[];
  extractionConfidence: number;
  analyzedAt?: string;
  analysis_version?: number;
}



