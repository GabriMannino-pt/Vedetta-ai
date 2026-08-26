import { ProjectDossier, CommercialAuditResult } from '../types';

/** Valuta commercialmente un progetto e ne determina lo score e la decisione */
export function auditProjectCommercial(project: ProjectDossier): CommercialAuditResult {
  let marketSize = 70;
  let demand = 70;
  let pain = 70;
  let competition = 65;
  let pricingPower = 70;
  let differentiation = 70;

  let targetMode = 'custom';
  let estimatedTam = '€1M - €5M';
  let recommendedStep = 'Validazione iniziale con 30 prospect';

  const nameLower = project.name.toLowerCase();

  if (nameLower.includes('danceflow')) {
    targetMode = 'danceflow';
    marketSize = 85;       // ~8.500 scuole e accademie di danza in Italia
    demand = 88;           // Forte bisogno di digitalizzare pagamenti e moduli
    pain = 92;             // Segreterie sommerse a inizio anno
    competition = 75;      // Solo software generici di palestre (TeamUp, Golee) ma pochi verticali dedicati alla danza
    pricingPower = 82;     // €49 - €129 / mese ben sostenibili da scuole con 100-500 allievi
    differentiation = 90;  // Modulo saggi, quote danza, presenze corsi
    estimatedTam = '€8.5M TAM potenziale in Italia';
    recommendedStep = 'Avviare campagna outbound mirata su 30 scuole Tier A+ (Milano, Roma, Torino, Brescia, Verona)';
  } else if (nameLower.includes('vedetta')) {
    targetMode = 'vedetta';
    marketSize = 90;       // Mercato B2B Lead Gen & Sales Tech globale e nazionale
    demand = 94;           // Tutte le agenzie cercano clienti e pipeline
    pain = 90;             // Costo elevato di SDR umani e inefficienza scraper generici
    competition = 70;      // Apollo/Clay esistono ma manca la granularità evidence-based locale
    pricingPower = 88;     // €79 - €199/mese + agenzie disposte a pagare subito per ROI
    differentiation = 92;  // Factual evidence extractor, portfolio monitor e script direct outreach
    estimatedTam = '€25M+ B2B Sales Tech per PMI e Agenzie';
    recommendedStep = 'Lanciare campagna su 30 agenzie di marketing e consulenti di vendita B2B';
  } else if (nameLower.includes('ai automation')) {
    targetMode = 'ai-automation';
    marketSize = 80;
    demand = 85;
    pain = 88;             // Inserimento dati manuale, preventivi lenti
    competition = 60;      // Molta offerta generica, ma poca verticale
    pricingPower = 95;     // High ticket €3.500 setup + €500/m
    differentiation = 80;
    estimatedTam = '€15M per servizi di automazione PMI in Italia';
    recommendedStep = 'Contattare 30 cliniche private e aziende di logistica per audit gratuito di processo';
  } else if (nameLower.includes('blog') || nameLower.includes('markdown')) {
    marketSize = 30;
    demand = 25;
    pain = 20;
    competition = 20;
    pricingPower = 10;
    differentiation = 15;
    estimatedTam = '<€10k (Mercato Open Source saturo)';
    recommendedStep = 'Non investire tempo commerciale. Mantenere come utility o archiviare.';
  }

  // Calcolo Commercial Score ponderato
  const commercialScore = Math.round(
    (marketSize * 0.15) +
    (demand * 0.25) +
    (pain * 0.25) +
    (competition * 0.10) +
    (pricingPower * 0.15) +
    (differentiation * 0.10)
  );

  let decision: CommercialAuditResult['decision'] = '👀 WATCH';
  let autonomousAlert: string | undefined;

  if (commercialScore >= 80) {
    decision = '🚀 LAUNCH';
    autonomousAlert = `🚨 COMMERCIAL ALERT: ${project.name} ha raggiunto uno score di ${commercialScore}/100. Maturità commerciale elevata, mercato pronto. Azione consigliata: LAUNCH immediato della campagna outbound.`;
  } else if (commercialScore >= 65) {
    decision = '🧪 VALIDATE';
    autonomousAlert = `🧪 VALIDATION ALERT: ${project.name} (Score ${commercialScore}/100) presenta forte potenziale ma richiede validazione su 30 prospect target per affinare l'offerta.`;
  } else if (commercialScore >= 45) {
    decision = '👀 WATCH';
  } else {
    decision = '❌ ABANDON';
    autonomousAlert = `⚠️ COMMERCIAL WARNING: ${project.name} (Score ${commercialScore}/100) ha scarsa domanda monetizzabile o mercato saturo. Raccomandazione: NON INVESTIRE ULTERIORE TEMPO COMMERCIALE.`;
  }

  return {
    project_name: project.name,
    market_size_score: marketSize,
    demand_score: demand,
    pain_score: pain,
    competition_score: competition,
    pricing_power_score: pricingPower,
    differentiation_score: differentiation,
    commercial_score: commercialScore,
    decision,
    rationale: `Progetto ${project.name} con Commercial Score ${commercialScore}/100. Business Model: ${project.business_model}. Pricing stimato: ${project.estimated_price_range}. Decisione: ${decision}.`,
    target_mode: targetMode,
    recommended_first_step: recommendedStep,
    estimated_tam: estimatedTam,
    autonomous_alert: autonomousAlert,
  };
}
