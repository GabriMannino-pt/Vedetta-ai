import { getDb } from '../storage/db';
import { CareerOpportunity, OpportunityStatus } from '../types';
import { normalizeOpportunity } from './opportunityNormalizer';

export function createOpportunity(rawOpp: any): number {
  const opp = normalizeOpportunity(rawOpp);

  const db = getDb();
  const now = new Date().toISOString();

  // Check duplicate by external_id if present
  if (opp.external_id) {
    const existing = db.prepare('SELECT id FROM career_opportunities WHERE source = ? AND external_id = ?')
      .get(opp.source, opp.external_id) as any;
    if (existing) {
      db.prepare('UPDATE career_opportunities SET last_seen_at = ? WHERE id = ?')
        .run(now, existing.id);
      return existing.id;
    }
  }

  // Check duplicate by fingerprint
  const existingFingerprint = db.prepare('SELECT id FROM career_opportunities WHERE fingerprint = ?')
    .get(opp.fingerprint) as any;
  if (existingFingerprint) {
    db.prepare('UPDATE career_opportunities SET last_seen_at = ? WHERE id = ?')
      .run(now, existingFingerprint.id);
    return existingFingerprint.id;
  }

  // Verify profile exists
  const profile = db.prepare('SELECT id FROM career_profile WHERE id = ?').get(opp.profile_id);
  if (!profile) {
    throw new Error(`Referenced career profile ID ${opp.profile_id} does not exist`);
  }

  // Insert
  const stmt = db.prepare(`
    INSERT INTO career_opportunities (
      profile_id, external_id, fingerprint, source, source_url,
      title, company_name, description, opportunity_type, seniority,
      location, remote_type, currency, salary_min, salary_max, salary_period,
      hourly_rate_min, hourly_rate_max, deadline, status,
      first_seen_at, last_seen_at, applied_at,
      analysis_status, analysis_summary, role_focus_json, responsibilities_json,
      technologies_json, languages_json, seniority_signals_json, remote_signals_json,
      risk_signals_json, extraction_confidence, analyzed_at,
      fit_score, evidence_score, priority_score
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `);

  const info = stmt.run(
    opp.profile_id,
    opp.external_id || null,
    opp.fingerprint,
    opp.source,
    opp.source_url || null,
    opp.title,
    opp.company_name,
    opp.description,
    opp.opportunity_type,
    opp.seniority,
    opp.location,
    opp.remote_type,
    opp.currency || null,
    opp.salary_min,
    opp.salary_max,
    opp.salary_period || null,
    opp.hourly_rate_min,
    opp.hourly_rate_max,
    opp.deadline || null,
    opp.status,
    now,
    now,
    opp.applied_at || null,
    opp.analysis_status || 'NOT_ANALYZED',
    opp.analysis_summary || null,
    opp.role_focus_json || null,
    opp.responsibilities_json || null,
    opp.technologies_json || null,
    opp.languages_json || null,
    opp.seniority_signals_json || null,
    opp.remote_signals_json || null,
    opp.risk_signals_json || null,
    opp.extraction_confidence || null,
    opp.analyzed_at || null,
    opp.fit_score || null,
    opp.evidence_score || null,
    opp.priority_score || null
  );

  return info.lastInsertRowid as number;
}

export function getOpportunity(id: number): CareerOpportunity | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_opportunities WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToOpportunity(row);
}

export function listOpportunities(profileId: number): CareerOpportunity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_opportunities WHERE profile_id = ? ORDER BY first_seen_at DESC').all(profileId) as any[];
  return rows.map(mapRowToOpportunity);
}

export function updateOpportunity(opp: CareerOpportunity): void {
  if (!opp.id) {
    throw new Error('Opportunity ID is required for updates');
  }

  // Validate fields by normalizing first
  const normalized = normalizeOpportunity(opp);

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE career_opportunities SET
      title = ?, company_name = ?, description = ?, opportunity_type = ?, seniority = ?,
      location = ?, remote_type = ?, currency = ?, salary_min = ?, salary_max = ?,
      salary_period = ?, hourly_rate_min = ?, hourly_rate_max = ?, deadline = ?,
      status = ?, applied_at = ?, 
      analysis_status = ?, analysis_summary = ?, role_focus_json = ?, responsibilities_json = ?,
      technologies_json = ?, languages_json = ?, seniority_signals_json = ?, remote_signals_json = ?,
      risk_signals_json = ?, extraction_confidence = ?, analyzed_at = ?,
      fit_score = ?, evidence_score = ?, priority_score = ?, last_seen_at = ?
    WHERE id = ?
  `);

  stmt.run(
    normalized.title,
    normalized.company_name,
    normalized.description,
    normalized.opportunity_type,
    normalized.seniority,
    normalized.location,
    normalized.remote_type,
    normalized.currency || null,
    normalized.salary_min,
    normalized.salary_max,
    normalized.salary_period || null,
    normalized.hourly_rate_min,
    normalized.hourly_rate_max,
    normalized.deadline || null,
    normalized.status,
    normalized.applied_at || null,
    normalized.analysis_status || 'NOT_ANALYZED',
    normalized.analysis_summary || null,
    normalized.role_focus_json || null,
    normalized.responsibilities_json || null,
    normalized.technologies_json || null,
    normalized.languages_json || null,
    normalized.seniority_signals_json || null,
    normalized.remote_signals_json || null,
    normalized.risk_signals_json || null,
    normalized.extraction_confidence || null,
    normalized.analyzed_at || null,
    normalized.fit_score || null,
    normalized.evidence_score || null,
    normalized.priority_score || null,
    now,
    opp.id
  );
}

export function deleteOpportunity(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM career_opportunities WHERE id = ?').run(id);
}

export function findByExternalId(source: string, externalId: string): CareerOpportunity | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_opportunities WHERE source = ? AND external_id = ?').get(source, externalId) as any;
  if (!row) return null;
  return mapRowToOpportunity(row);
}

export function findByFingerprint(fingerprint: string): CareerOpportunity | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_opportunities WHERE fingerprint = ?').get(fingerprint) as any;
  if (!row) return null;
  return mapRowToOpportunity(row);
}

export function updateStatus(id: number, status: OpportunityStatus): void {
  const db = getDb();
  const now = new Date().toISOString();
  // If status is APPLIED, set applied_at to now if not set
  if (status === 'APPLIED') {
    db.prepare('UPDATE career_opportunities SET status = ?, applied_at = COALESCE(applied_at, ?), last_seen_at = ? WHERE id = ?')
      .run(status, now, now, id);
  } else {
    db.prepare('UPDATE career_opportunities SET status = ?, last_seen_at = ? WHERE id = ?')
      .run(status, now, id);
  }
}

export function listBySource(source: string): CareerOpportunity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_opportunities WHERE source = ? ORDER BY first_seen_at DESC').all(source) as any[];
  return rows.map(mapRowToOpportunity);
}

export function listByStatus(status: string): CareerOpportunity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_opportunities WHERE status = ? ORDER BY first_seen_at DESC').all(status) as any[];
  return rows.map(mapRowToOpportunity);
}

export function listRecent(limit: number): CareerOpportunity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_opportunities ORDER BY first_seen_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(mapRowToOpportunity);
}

function mapRowToOpportunity(r: any): CareerOpportunity {
  return {
    id: r.id,
    profile_id: r.profile_id,
    external_id: r.external_id,
    fingerprint: r.fingerprint,
    source: r.source,
    source_url: r.source_url,
    title: r.title,
    company_name: r.company_name,
    description: r.description,
    opportunity_type: r.opportunity_type,
    seniority: r.seniority,
    location: r.location,
    remote_type: r.remote_type,
    currency: r.currency,
    salary_min: r.salary_min,
    salary_max: r.salary_max,
    salary_period: r.salary_period,
    hourly_rate_min: r.hourly_rate_min,
    hourly_rate_max: r.hourly_rate_max,
    deadline: r.deadline,
    status: r.status,
    first_seen_at: r.first_seen_at,
    last_seen_at: r.last_seen_at,
    applied_at: r.applied_at,
    analysis_status: r.analysis_status,
    analysis_summary: r.analysis_summary,
    role_focus_json: r.role_focus_json,
    responsibilities_json: r.responsibilities_json,
    technologies_json: r.technologies_json,
    languages_json: r.languages_json,
    seniority_signals_json: r.seniority_signals_json,
    remote_signals_json: r.remote_signals_json,
    risk_signals_json: r.risk_signals_json,
    extraction_confidence: r.extraction_confidence,
    analyzed_at: r.analyzed_at,
    fit_score: r.fit_score,
    evidence_score: r.evidence_score,
    priority_score: r.priority_score
  };
}
