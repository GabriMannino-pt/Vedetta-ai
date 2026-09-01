import { getDb } from '../storage/db';
import {
  CareerOpportunity,
  ApplicationRecommendation,
  ApplicationChannel,
  CareerOutcomeEventType,
  ApplicationStatus,
  ProposalStatus
} from '../types';
import { getProfile } from './careerProfile';
import { listSkills } from './careerSkills';
import { listEvidence } from './careerEvidence';
import { getOpportunity, listOpportunities } from './careerOpportunities';
import { listRequirements } from './requirementRepository';
import { getApplication, getApplicationForOpportunity, listApplications } from './careerApplications';
import { getProposalForApplication, getProposalClaims } from './careerProposals';
import { listOutcomeEvents, calculateOutcomeSummary } from './careerOutcomes';
import { calculateCareerFunnel, CareerFunnelReport } from './careerFunnel';
import { generateCareerAlerts, CareerAlert } from './careerAlerts';
import { calculateHistoricalMetrics } from './learningEngine';

export interface OpportunityQueueItem {
  id: number;
  title: string;
  company_name: string;
  source: string;
  source_url?: string | null;
  location?: string | null;
  remote_type?: string | null;
  seniority?: string | null;
  deadline?: string | null;
  analysis_status: string;
  fit_score: number | null;
  application_priority: number | null;
  fit_recommendation: ApplicationRecommendation | null;
  critical_gap: boolean;
  evidence_score: number | null;
  application_id?: number | null;
  application_status?: ApplicationStatus | null;
  proposal_status?: ProposalStatus | null;
  final_outcome?: CareerOutcomeEventType | null;
  operational_state: string;
  first_seen_at: string;
}

export interface OpportunityQueueFilters {
  minFitScore?: number;
  maxFitScore?: number;
  recommendation?: ApplicationRecommendation;
  priorityMin?: number;
  source?: string;
  remoteType?: string;
  seniority?: string;
  analysisStatus?: string;
  applicationStatus?: string;
  criticalGap?: boolean;
  search?: string;
}

export interface OpportunityQueueSort {
  field?: 'priority' | 'fitScore' | 'evidence' | 'deadline' | 'createdAt';
  order?: 'ASC' | 'DESC';
}

export interface OpportunityDetailView {
  opportunity: CareerOpportunity;
  requirements: any[];
  fit: {
    fitScore: number | null;
    applicationPriority: number | null;
    recommendation: ApplicationRecommendation | null;
    technicalMatch: number | null;
    experienceMatch: number | null;
    seniorityMatch: number | null;
    domainMatch: number | null;
    evidenceStrength: number | null;
    remoteMatch: number | null;
    languageMatch: number | null;
    mustHaveCoverage: number | null;
    criticalGap: boolean;
    breakdown: any;
    explanation: any;
  };
  application?: any;
  proposal?: any;
  outcome?: any;
}

export interface ApplicationDetailView {
  application: any;
  strategy: any;
  proposal: any;
  claims: any[];
  outcomeHistory: any[];
  outcomeSummary: any;
}

export interface CareerDashboardSummary {
  profile: any;
  skillsCount: number;
  evidenceCount: number;
  totalOpportunities: number;
  strongMatchesCount: number;
  applicationsCount: number;
  readyApplicationsCount: number;
  funnel: CareerFunnelReport;
  metrics: any;
  alerts: CareerAlert[];
  calculatedAt: string;
}

export function getCareerDashboard(): CareerDashboardSummary {
  const db = getDb();
  const profile = getProfile();
  const skillsCount = profile?.id ? listSkills(profile.id).length : 0;
  const evidenceCount = profile?.id ? listEvidence(profile.id).length : 0;
  const totalOpportunities = Number((db.prepare('SELECT COUNT(*) as c FROM career_opportunities').get() as any)?.c || 0);
  const strongMatchesCount = Number((db.prepare("SELECT COUNT(*) as c FROM career_opportunities WHERE fit_recommendation IN ('STRONG_MATCH', 'GOOD_MATCH')").get() as any)?.c || 0);
  const applicationsCount = Number((db.prepare('SELECT COUNT(*) as c FROM career_applications').get() as any)?.c || 0);
  const readyApplicationsCount = Number((db.prepare("SELECT COUNT(*) as c FROM career_applications WHERE status = 'READY'").get() as any)?.c || 0);

  const funnel = calculateCareerFunnel();
  const metrics = calculateHistoricalMetrics();
  const alerts = generateCareerAlerts();

  return {
    profile,
    skillsCount,
    evidenceCount,
    totalOpportunities,
    strongMatchesCount,
    applicationsCount,
    readyApplicationsCount,
    funnel,
    metrics,
    alerts,
    calculatedAt: new Date().toISOString()
  };
}

export function getOpportunityQueue(
  filters: OpportunityQueueFilters = {},
  sort: OpportunityQueueSort = { field: 'priority', order: 'DESC' },
  page = 1,
  limit = 50
): { items: OpportunityQueueItem[]; totalCount: number; page: number; limit: number } {
  const db = getDb();

  let query = `
    SELECT
      co.id, co.title, co.company_name, co.source, co.source_url,
      co.location, co.remote_type, co.seniority, co.deadline,
      co.analysis_status, co.fit_score, co.application_priority,
      co.fit_recommendation, co.critical_gap, co.evidence_score,
      co.first_seen_at,
      ca.id as application_id, ca.status as application_status,
      cp.proposal_status,
      cos.final_outcome
    FROM career_opportunities co
    LEFT JOIN career_applications ca ON co.id = ca.opportunity_id
    LEFT JOIN career_proposals cp ON ca.id = cp.application_id
    LEFT JOIN career_outcome_snapshots cos ON ca.id = cos.application_id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (filters.minFitScore !== undefined) {
    query += ' AND co.fit_score >= ?';
    params.push(filters.minFitScore);
  }
  if (filters.maxFitScore !== undefined) {
    query += ' AND co.fit_score <= ?';
    params.push(filters.maxFitScore);
  }
  if (filters.recommendation) {
    query += ' AND co.fit_recommendation = ?';
    params.push(filters.recommendation);
  }
  if (filters.priorityMin !== undefined) {
    query += ' AND co.application_priority >= ?';
    params.push(filters.priorityMin);
  }
  if (filters.source) {
    query += ' AND co.source = ?';
    params.push(filters.source);
  }
  if (filters.remoteType) {
    query += ' AND co.remote_type = ?';
    params.push(filters.remoteType);
  }
  if (filters.seniority) {
    query += ' AND co.seniority = ?';
    params.push(filters.seniority);
  }
  if (filters.analysisStatus) {
    query += ' AND co.analysis_status = ?';
    params.push(filters.analysisStatus);
  }
  if (filters.applicationStatus) {
    query += ' AND ca.status = ?';
    params.push(filters.applicationStatus);
  }
  if (filters.criticalGap !== undefined) {
    query += ' AND co.critical_gap = ?';
    params.push(filters.criticalGap ? 1 : 0);
  }
  if (filters.search) {
    query += ' AND (co.title LIKE ? OR co.company_name LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  // Count total matching
  const countQuery = query.replace(/SELECT[\s\S]*?FROM career_opportunities co/, 'SELECT COUNT(DISTINCT co.id) as c FROM career_opportunities co');
  const countRow = db.prepare(countQuery).get(...params) as any;
  const totalCount = Number(countRow?.c || 0);

  // Sorting
  let orderClause = 'ORDER BY co.application_priority DESC NULLS LAST, co.fit_score DESC NULLS LAST';
  const dir = sort.order === 'ASC' ? 'ASC' : 'DESC';
  if (sort.field === 'fitScore') {
    orderClause = `ORDER BY co.fit_score ${dir} NULLS LAST`;
  } else if (sort.field === 'evidence') {
    orderClause = `ORDER BY co.evidence_score ${dir} NULLS LAST`;
  } else if (sort.field === 'deadline') {
    orderClause = `ORDER BY co.deadline ${dir} NULLS LAST`;
  } else if (sort.field === 'createdAt') {
    orderClause = `ORDER BY co.first_seen_at ${dir}`;
  } else if (sort.field === 'priority') {
    orderClause = `ORDER BY co.application_priority ${dir} NULLS LAST, co.fit_score ${dir} NULLS LAST`;
  }

  query += ` ${orderClause} LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);

  const rows = db.prepare(query).all(...params) as any[];

  const items: OpportunityQueueItem[] = rows.map(r => {
    // Determine operational state
    let opState = 'NEW';
    if (r.final_outcome) {
      opState = r.final_outcome;
    } else if (r.application_status === 'SUBMITTED') {
      opState = 'SUBMITTED';
    } else if (r.application_status === 'READY') {
      opState = 'READY_FOR_REVIEW';
    } else if (r.application_id) {
      opState = 'APPLICATION_CREATED';
    } else if (r.analysis_status === 'ANALYZED') {
      opState = 'ANALYZED';
    }

    return {
      id: r.id,
      title: r.title,
      company_name: r.company_name,
      source: r.source,
      source_url: r.source_url,
      location: r.location,
      remote_type: r.remote_type,
      seniority: r.seniority,
      deadline: r.deadline,
      analysis_status: r.analysis_status,
      fit_score: r.fit_score,
      application_priority: r.application_priority,
      fit_recommendation: r.fit_recommendation,
      critical_gap: Boolean(r.critical_gap),
      evidence_score: r.evidence_score,
      application_id: r.application_id,
      application_status: r.application_status,
      proposal_status: r.proposal_status,
      final_outcome: r.final_outcome,
      operational_state: opState,
      first_seen_at: r.first_seen_at
    };
  });

  return { items, totalCount, page, limit };
}

export function getOpportunityDetail(opportunityId: number): OpportunityDetailView | null {
  const opp = getOpportunity(opportunityId);
  if (!opp) return null;

  const requirements = listRequirements(opportunityId, 1);
  const app = getApplicationForOpportunity(opportunityId);
  let prop: any = null;
  let outcome: any = null;

  if (app) {
    prop = getProposalForApplication(app.id!);
    outcome = calculateOutcomeSummary(app.id!);
  }

  let breakdown: any = null;
  if (opp.fit_breakdown_json) {
    try {
      breakdown = JSON.parse(opp.fit_breakdown_json);
    } catch (e) {}
  }

  let explanation: any = null;
  if (opp.fit_explanation_json) {
    try {
      explanation = JSON.parse(opp.fit_explanation_json);
    } catch (e) {}
  }

  return {
    opportunity: opp,
    requirements,
    fit: {
      fitScore: opp.fit_score ?? null,
      applicationPriority: opp.application_priority ?? null,
      recommendation: opp.fit_recommendation ?? null,
      technicalMatch: opp.technical_match ?? null,
      experienceMatch: opp.experience_match ?? null,
      seniorityMatch: opp.seniority_match ?? null,
      domainMatch: opp.domain_match ?? null,
      evidenceStrength: opp.evidence_score ?? null,
      remoteMatch: opp.remote_match ?? null,
      languageMatch: opp.language_match ?? null,
      mustHaveCoverage: opp.must_have_coverage ?? null,
      criticalGap: Boolean(opp.critical_gap),
      breakdown,
      explanation
    },
    application: app,
    proposal: prop,
    outcome
  };
}

export function getApplicationDetail(applicationId: number): ApplicationDetailView | null {
  const app = getApplication(applicationId);
  if (!app) return null;

  let strategy: any = null;
  if (app.strategy_json) {
    try {
      strategy = JSON.parse(app.strategy_json);
    } catch (e) {}
  }

  const proposal = getProposalForApplication(applicationId);
  const claims = proposal ? getProposalClaims(proposal.id!) : [];
  const outcomeHistory = listOutcomeEvents(applicationId);
  const outcomeSummary = calculateOutcomeSummary(applicationId);

  return {
    application: app,
    strategy,
    proposal,
    claims,
    outcomeHistory,
    outcomeSummary
  };
}
