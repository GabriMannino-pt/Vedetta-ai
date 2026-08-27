import { ProspectLead, DealItem, DailyActionTask } from '../types';

/** Converte un prospect in un'opportunità economica di pipeline */
export function createDealFromProspect(prospect: ProspectLead): DealItem {
  let defaultMrr = 0;
  let defaultSetup = 0;
  let defaultProb = 0.20;

  if (prospect.mode === 'danceflow') {
    defaultMrr = 89;
    defaultSetup = 0;
    defaultProb = prospect.classification === 'A+' ? 0.35 : prospect.classification === 'A' ? 0.25 : 0.15;
  } else if (prospect.mode === 'vedetta') {
    defaultMrr = 290;
    defaultSetup = 500;
    defaultProb = prospect.classification === 'A+' ? 0.30 : prospect.classification === 'A' ? 0.20 : 0.10;
  } else if (prospect.mode === 'ai-automation') {
    defaultMrr = 500;
    defaultSetup = 3000;
    defaultProb = prospect.classification === 'A+' ? 0.25 : prospect.classification === 'A' ? 0.18 : 0.10;
  }

  const potentialArr = (defaultMrr * 12) + defaultSetup;
  const weightedValue = Math.round(potentialArr * defaultProb);

  let initialStage: DealItem['stage'] = 'QUALIFIED';
  if (prospect.classification === 'A+' || prospect.classification === 'A') {
    initialStage = 'QUALIFIED';
  } else {
    initialStage = 'DISCOVERED';
  }

  return {
    prospect_id: prospect.id,
    project_name: prospect.mode.toUpperCase(),
    company_name: prospect.name,
    stage: initialStage,
    potential_mrr: defaultMrr,
    potential_arr: potentialArr,
    one_time_fee: defaultSetup,
    probability_percent: Math.round(defaultProb * 100),
    weighted_value: weightedValue,
    last_interaction: prospect.scouted_at,
    next_action: prospect.recommended_action,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Calcola le metriche finanziarie aggregate di pipeline */
export function calculatePipelineMetrics(deals: DealItem[]): {
  total_deals: number;
  total_pipeline_eur: number;
  weighted_pipeline_eur: number;
  total_potential_mrr: number;
  weighted_mrr: number;
  breakdown_by_project: { [key: string]: { deals_count: number; total_potential: number; weighted_value: number; potential_mrr: number } };
} {
  let totalPipeline = 0;
  let weightedPipeline = 0;
  let totalMrr = 0;
  let weightedMrr = 0;
  const breakdown: { [key: string]: { deals_count: number; total_potential: number; weighted_value: number; potential_mrr: number } } = {};

  for (const deal of deals) {
    totalPipeline += deal.potential_arr;
    weightedPipeline += deal.weighted_value;
    totalMrr += deal.potential_mrr;
    weightedMrr += Math.round(deal.potential_mrr * (deal.probability_percent / 100));

    const proj = deal.project_name || 'ALTRO';
    if (!breakdown[proj]) {
      breakdown[proj] = { deals_count: 0, total_potential: 0, weighted_value: 0, potential_mrr: 0 };
    }
    breakdown[proj].deals_count++;
    breakdown[proj].total_potential += deal.potential_arr;
    breakdown[proj].weighted_value += deal.weighted_value;
    breakdown[proj].potential_mrr += deal.potential_mrr;
  }

  return {
    total_deals: deals.length,
    total_pipeline_eur: totalPipeline,
    weighted_pipeline_eur: weightedPipeline,
    total_potential_mrr: totalMrr,
    weighted_mrr: weightedMrr,
    breakdown_by_project: breakdown,
  };
}

/** Genera la checklist operativa "Cosa Vedetta mi consiglia di fare domani mattina" */
export function generateDailyActionPlan(prospects: ProspectLead[]): DailyActionTask[] {
  const tasks: DailyActionTask[] = [];

  // 1. Identifica i Top Prospect A+ e A da contattare
  const topProspects = prospects
    .filter(p => p.classification === 'A+' || p.classification === 'A')
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 5);

  topProspects.forEach((p, idx) => {
    tasks.push({
      id: `task-contact-${idx + 1}`,
      priority: 'URGENT_A_PLUS',
      title: `Contatto Diretto Tier ${p.classification}: ${p.name} (${p.city})`,
      target_name: p.name,
      channel: p.suggested_outreach.channel.toUpperCase(),
      description: `Inviare messaggio personalizzato: "${p.opening_angle}". Evidenza certificata: ${p.evidences.find(e => e.status === 'FACT')?.claim || 'Processo manuale rilevato'}.`,
      action_cta: p.recommended_action,
      due_date: 'Domani mattina ore 09:30',
    });
  });

  // 2. Task di follow-up e review
  tasks.push({
    id: 'task-review-outreach',
    priority: 'APPROVAL_REQUIRED',
    title: 'Approvazione Umana Batch Outreach (DanceFlow & Vedetta)',
    target_name: 'Campagne Outbound',
    channel: 'EMAIL / LINKEDIN',
    description: 'Revisionare e dare il via libera alle bozze evidence-based generate senza invio automatico.',
    action_cta: 'Approva bozze nella dashboard',
    due_date: 'Domani ore 11:00',
  });

  tasks.push({
    id: 'task-portfolio-priority',
    priority: 'PORTFOLIO_REVIEW',
    title: 'Allocazione Tempo Commerciale Portfolio',
    target_name: 'DanceFlow & AI Automation',
    channel: 'MANAGEMENT',
    description: 'Destinare il 70% degli sforzi commerciali sui 16 prospect Tier A DanceFlow (conversione stimata più rapida) e il 30% sull\'audit cliniche AI Automation.',
    action_cta: 'Esegui chiamate e demo discovery',
    due_date: 'Domani pomeriggio',
  });

  return tasks;
}
