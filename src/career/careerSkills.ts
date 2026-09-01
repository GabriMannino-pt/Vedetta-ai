import { getDb } from '../storage/db';
import { CareerSkill } from '../types';

export function addSkill(skill: CareerSkill): number {
  if (!skill.skill || skill.skill.trim() === '') {
    throw new Error('Skill name cannot be empty');
  }
  if (skill.years_experience < 0) {
    throw new Error('Years of experience cannot be negative');
  }

  const db = getDb();
  
  // Prevent duplication of the same skill under the same profile
  const existing = db.prepare('SELECT id FROM career_skills WHERE profile_id = ? AND lower(skill) = ?')
    .get(skill.profile_id, skill.skill.toLowerCase().trim());
  if (existing) {
    throw new Error(`Skill "${skill.skill}" already exists for this profile`);
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO career_skills (
      profile_id, skill, category, level, years_experience, confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    skill.profile_id,
    skill.skill.trim(),
    skill.category,
    skill.level,
    skill.years_experience,
    skill.confidence || 'LOW',
    now,
    now
  );

  return info.lastInsertRowid as number;
}

export function listSkills(profileId: number): CareerSkill[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_skills WHERE profile_id = ? ORDER BY skill ASC').all(profileId) as any[];
  return rows.map(r => ({
    id: r.id,
    profile_id: r.profile_id,
    skill: r.skill,
    category: r.category,
    level: r.level,
    years_experience: r.years_experience,
    confidence: r.confidence,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}

export function updateSkill(skill: CareerSkill): void {
  if (!skill.id) {
    throw new Error('Skill ID is required for updates');
  }
  if (!skill.skill || skill.skill.trim() === '') {
    throw new Error('Skill name cannot be empty');
  }
  if (skill.years_experience < 0) {
    throw new Error('Years of experience cannot be negative');
  }

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE career_skills SET
      skill = ?, category = ?, level = ?, years_experience = ?, confidence = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    skill.skill.trim(),
    skill.category,
    skill.level,
    skill.years_experience,
    skill.confidence,
    now,
    skill.id
  );
}

export function removeSkill(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM career_skills WHERE id = ?').run(id);
}
