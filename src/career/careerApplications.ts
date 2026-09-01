import { getDb } from '../storage/db';
import { CareerApplication, ApplicationStatus } from '../types';

export function createApplication(app: CareerApplication): number {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO career_applications (
      profile_id, opportunity_id, status, channel,
      fit_score_snapshot, priority_snapshot, recommendation_snapshot,
      fit_algorithm_version, strategy_json, evidence_ids_json, proposal_id,
      created_at, updated_at, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    app.profile_id,
    app.opportunity_id,
    app.status,
    app.channel,
    app.fit_score_snapshot,
    app.priority_snapshot,
    app.recommendation_snapshot,
    app.fit_algorithm_version || 1,
    app.strategy_json,
    app.evidence_ids_json,
    app.proposal_id || null,
    now,
    now,
    app.submitted_at || null
  );

  return info.lastInsertRowid as number;
}

export function getApplication(id: number): CareerApplication | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_applications WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToApplication(row);
}

export function getApplicationForOpportunity(opportunityId: number): CareerApplication | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_applications WHERE opportunity_id = ? ORDER BY id DESC LIMIT 1').get(opportunityId) as any;
  if (!row) return null;
  return mapRowToApplication(row);
}

export function listApplications(profileId?: number): CareerApplication[] {
  const db = getDb();
  const rows = profileId
    ? db.prepare('SELECT * FROM career_applications WHERE profile_id = ? ORDER BY created_at DESC').all(profileId) as any[]
    : db.prepare('SELECT * FROM career_applications ORDER BY created_at DESC').all() as any[];
  return rows.map(mapRowToApplication);
}

export function updateApplicationStatus(id: number, status: ApplicationStatus): void {
  const db = getDb();
  const now = new Date().toISOString();
  const submittedAt = status === 'SUBMITTED' ? now : null;

  db.prepare(`
    UPDATE career_applications SET
      status = ?,
      updated_at = ?,
      submitted_at = COALESCE(submitted_at, ?)
    WHERE id = ?
  `).run(status, now, submittedAt, id);
}

function mapRowToApplication(r: any): CareerApplication {
  return {
    id: r.id,
    profile_id: r.profile_id,
    opportunity_id: r.opportunity_id,
    status: r.status,
    channel: r.channel,
    fit_score_snapshot: r.fit_score_snapshot,
    priority_snapshot: r.priority_snapshot,
    recommendation_snapshot: r.recommendation_snapshot,
    fit_algorithm_version: r.fit_algorithm_version,
    strategy_json: r.strategy_json,
    evidence_ids_json: r.evidence_ids_json,
    proposal_id: r.proposal_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    submitted_at: r.submitted_at
  };
}
