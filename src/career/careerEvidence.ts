import { getDb } from '../storage/db';
import { CareerEvidence } from '../types';

export function addEvidence(evidence: CareerEvidence): number {
  if (!evidence.title || evidence.title.trim() === '') {
    throw new Error('Evidence title cannot be empty');
  }
  if (!evidence.description || evidence.description.trim() === '') {
    throw new Error('Evidence description cannot be empty');
  }
  if (evidence.verified && (!evidence.source_url || evidence.source_url.trim() === '')) {
    throw new Error('Verified evidence must have a valid source_url');
  }

  const db = getDb();

  // Validate skill exists
  const skill = db.prepare('SELECT id FROM career_skills WHERE id = ?').get(evidence.skill_id);
  if (!skill) {
    throw new Error(`Referenced skill ID ${evidence.skill_id} does not exist`);
  }

  // Validate project exists if project_id is provided
  if (evidence.project_id) {
    const project = db.prepare('SELECT name FROM projects WHERE name = ?').get(evidence.project_id);
    if (!project) {
      throw new Error(`Referenced project "${evidence.project_id}" does not exist`);
    }
  }

  // Prevent duplicate evidence for same project & skill
  if (evidence.project_id) {
    const existing = db.prepare('SELECT id FROM career_evidence WHERE project_id = ? AND skill_id = ?')
      .get(evidence.project_id, evidence.skill_id);
    if (existing) {
      throw new Error(`Evidence linking project "${evidence.project_id}" to skill ID ${evidence.skill_id} already exists`);
    }
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO career_evidence (
      profile_id, project_id, type, title, description,
      source_type, source_url, source_reference, skill_id, verified, confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    evidence.profile_id,
    evidence.project_id || null,
    evidence.type,
    evidence.title.trim(),
    evidence.description.trim(),
    evidence.source_type,
    evidence.source_url || null,
    evidence.source_reference || null,
    evidence.skill_id,
    evidence.verified ? 1 : 0,
    evidence.confidence || 'LOW',
    now,
    now
  );

  return info.lastInsertRowid as number;
}

export function listEvidence(profileId: number): CareerEvidence[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_evidence WHERE profile_id = ? ORDER BY created_at DESC').all(profileId) as any[];
  return rows.map(r => ({
    id: r.id,
    profile_id: r.profile_id,
    project_id: r.project_id || undefined,
    type: r.type,
    title: r.title,
    description: r.description,
    source_type: r.source_type,
    source_url: r.source_url || undefined,
    source_reference: r.source_reference || undefined,
    skill_id: r.skill_id,
    verified: r.verified === 1,
    confidence: r.confidence,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}

export function getEvidenceForSkill(skillId: number): CareerEvidence[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_evidence WHERE skill_id = ? ORDER BY created_at DESC').all(skillId) as any[];
  return rows.map(r => ({
    id: r.id,
    profile_id: r.profile_id,
    project_id: r.project_id || undefined,
    type: r.type,
    title: r.title,
    description: r.description,
    source_type: r.source_type,
    source_url: r.source_url || undefined,
    source_reference: r.source_reference || undefined,
    skill_id: r.skill_id,
    verified: r.verified === 1,
    confidence: r.confidence,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}

export function getEvidenceForProject(projectName: string): CareerEvidence[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_evidence WHERE project_id = ? ORDER BY created_at DESC').all(projectName) as any[];
  return rows.map(r => ({
    id: r.id,
    profile_id: r.profile_id,
    project_id: r.project_id || undefined,
    type: r.type,
    title: r.title,
    description: r.description,
    source_type: r.source_type,
    source_url: r.source_url || undefined,
    source_reference: r.source_reference || undefined,
    skill_id: r.skill_id,
    verified: r.verified === 1,
    confidence: r.confidence,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}

export function verifyEvidence(id: number, verified: boolean): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE career_evidence SET verified = ?, updated_at = ? WHERE id = ?')
    .run(verified ? 1 : 0, now, id);
}
