import { getDb } from '../storage/db';
import { CareerRequirement } from '../types';

export function addRequirement(req: CareerRequirement): number {
  if (!req.name || req.name.trim() === '') {
    throw new Error('Requirement name cannot be empty');
  }
  if (!req.normalizedName || req.normalizedName.trim() === '') {
    throw new Error('Requirement normalized name cannot be empty');
  }
  if (req.evidence.confidence < 0 || req.evidence.confidence > 1) {
    throw new Error('Confidence must be between 0 and 1');
  }

  const db = getDb();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO career_opportunity_requirements (
      opportunity_id, name, normalized_name, category, priority,
      years_required, source_text, source_type, confidence, created_at, analysis_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    req.opportunityId,
    req.name.trim(),
    req.normalizedName.trim(),
    req.category,
    req.priority,
    req.yearsRequired !== undefined && req.yearsRequired !== null ? req.yearsRequired : null,
    req.evidence.sourceText,
    req.evidence.sourceType,
    req.evidence.confidence,
    now,
    req.analysis_version || 1
  );

  return info.lastInsertRowid as number;
}

export function listRequirements(opportunityId: number, version = 1): CareerRequirement[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM career_opportunity_requirements 
    WHERE opportunity_id = ? AND analysis_version = ? 
    ORDER BY id ASC
  `).all(opportunityId, version) as any[];

  return rows.map(mapRowToRequirement);
}

export function getMustHaveRequirements(opportunityId: number, version = 1): CareerRequirement[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM career_opportunity_requirements 
    WHERE opportunity_id = ? AND priority = 'MUST_HAVE' AND analysis_version = ? 
    ORDER BY id ASC
  `).all(opportunityId, version) as any[];

  return rows.map(mapRowToRequirement);
}

export function getNiceToHaveRequirements(opportunityId: number, version = 1): CareerRequirement[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM career_opportunity_requirements 
    WHERE opportunity_id = ? AND priority = 'NICE_TO_HAVE' AND analysis_version = ? 
    ORDER BY id ASC
  `).all(opportunityId, version) as any[];

  return rows.map(mapRowToRequirement);
}

export function deleteRequirements(opportunityId: number, version = 1): void {
  const db = getDb();
  db.prepare('DELETE FROM career_opportunity_requirements WHERE opportunity_id = ? AND analysis_version = ?')
    .run(opportunityId, version);
}

export function replaceRequirements(opportunityId: number, requirements: CareerRequirement[], version = 1): void {
  const db = getDb();
  
  // Make sure we run inside a transaction
  const inTransaction = db.inTransaction;
  if (!inTransaction) {
    db.prepare('BEGIN TRANSACTION').run();
  }

  try {
    deleteRequirements(opportunityId, version);
    for (const req of requirements) {
      addRequirement({ ...req, opportunityId, analysis_version: version });
    }
    if (!inTransaction) {
      db.prepare('COMMIT').run();
    }
  } catch (err) {
    if (!inTransaction) {
      db.prepare('ROLLBACK').run();
    }
    throw err;
  }
}

function mapRowToRequirement(r: any): CareerRequirement {
  return {
    id: r.id,
    opportunityId: r.opportunity_id,
    name: r.name,
    normalizedName: r.normalized_name,
    category: r.category,
    priority: r.priority,
    yearsRequired: r.years_required,
    evidence: {
      sourceText: r.source_text,
      sourceType: r.source_type,
      confidence: r.confidence
    },
    analysis_version: r.analysis_version
  };
}
