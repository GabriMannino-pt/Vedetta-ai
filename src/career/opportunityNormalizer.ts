import * as crypto from 'crypto';
import { CareerOpportunity, OpportunitySource, OpportunityType, Seniority, RemoteType, SalaryPeriod, OpportunityStatus } from '../types';

export function normalizeOpportunity(raw: any): CareerOpportunity {
  if (!raw.title || raw.title.trim() === '') {
    throw new Error('Title cannot be empty');
  }
  if (!raw.company_name && !raw.companyName) {
    throw new Error('Company name cannot be empty');
  }

  const title = raw.title.trim();
  const company_name = (raw.company_name || raw.companyName || '').trim();
  const description = (raw.description || '').trim();
  
  // Normalizzazione Enums
  const source: OpportunitySource = (raw.source || 'OTHER').toUpperCase() as OpportunitySource;
  const opportunity_type: OpportunityType = (raw.opportunity_type || raw.opportunityType || 'OTHER').toUpperCase() as OpportunityType;
  const seniority: Seniority = (raw.seniority || 'UNKNOWN').toUpperCase() as Seniority;
  const remote_type: RemoteType = (raw.remote_type || raw.remoteType || 'UNKNOWN').toUpperCase() as RemoteType;
  
  // Validazione Compensation (strictly positive or null, not 0)
  const salary_min = raw.salary_min !== undefined && raw.salary_min !== null && raw.salary_min !== '' ? Number(raw.salary_min) : null;
  const salary_max = raw.salary_max !== undefined && raw.salary_max !== null && raw.salary_max !== '' ? Number(raw.salary_max) : null;
  const hourly_rate_min = raw.hourly_rate_min !== undefined && raw.hourly_rate_min !== null && raw.hourly_rate_min !== '' ? Number(raw.hourly_rate_min) : null;
  const hourly_rate_max = raw.hourly_rate_max !== undefined && raw.hourly_rate_max !== null && raw.hourly_rate_max !== '' ? Number(raw.hourly_rate_max) : null;

  if (salary_min !== null && salary_min < 0) throw new Error('Salary min cannot be negative');
  if (salary_max !== null && salary_max < 0) throw new Error('Salary max cannot be negative');
  if (salary_max !== null && salary_min !== null && salary_max < salary_min) {
    throw new Error('Salary max cannot be less than salary min');
  }
  if (hourly_rate_min !== null && hourly_rate_min < 0) throw new Error('Hourly rate min cannot be negative');
  if (hourly_rate_max !== null && hourly_rate_max < 0) throw new Error('Hourly rate max cannot be negative');
  if (hourly_rate_max !== null && hourly_rate_min !== null && hourly_rate_max < hourly_rate_min) {
    throw new Error('Hourly rate max cannot be less than hourly rate min');
  }

  const currency = raw.currency ? raw.currency.trim() : null;
  const salary_period: SalaryPeriod | null = raw.salary_period ? (raw.salary_period.toUpperCase() as SalaryPeriod) : null;

  // External ID & URL
  const external_id = raw.external_id || raw.externalId || null;
  const source_url = raw.source_url || raw.sourceUrl || null;

  // Fingerprint generation
  const hashSrc = source.trim().toLowerCase();
  const hashCompany = company_name.trim().toLowerCase();
  const hashTitle = title.trim().toLowerCase();
  const hashUrl = (source_url || '').trim().toLowerCase();
  const fingerprintInput = `${hashSrc}|${hashCompany}|${hashTitle}|${hashUrl}`;
  const fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex');

  // Status
  const status: OpportunityStatus = (raw.status || 'NEW').toUpperCase() as OpportunityStatus;

  return {
    profile_id: Number(raw.profile_id),
    external_id,
    fingerprint,
    source,
    source_url,
    title,
    company_name,
    description,
    opportunity_type,
    seniority,
    location: (raw.location || 'UNKNOWN').trim(),
    remote_type,
    currency,
    salary_min,
    salary_max,
    salary_period,
    hourly_rate_min,
    hourly_rate_max,
    deadline: raw.deadline || null,
    status,
    applied_at: raw.applied_at || null,
    analysis_status: raw.analysis_status || 'NOT_ANALYZED',
    analysis_summary: raw.analysis_summary || null,
    role_focus_json: raw.role_focus_json || null,
    responsibilities_json: raw.responsibilities_json || null,
    technologies_json: raw.technologies_json || null,
    languages_json: raw.languages_json || null,
    seniority_signals_json: raw.seniority_signals_json || null,
    remote_signals_json: raw.remote_signals_json || null,
    risk_signals_json: raw.risk_signals_json || null,
    extraction_confidence: raw.extraction_confidence !== undefined && raw.extraction_confidence !== null ? Number(raw.extraction_confidence) : null,
    analyzed_at: raw.analyzed_at || null,
    fit_score: raw.fit_score !== undefined && raw.fit_score !== null ? Number(raw.fit_score) : null,
    evidence_score: raw.evidence_score !== undefined && raw.evidence_score !== null ? Number(raw.evidence_score) : null,
    priority_score: raw.priority_score !== undefined && raw.priority_score !== null ? Number(raw.priority_score) : null
  };
}
