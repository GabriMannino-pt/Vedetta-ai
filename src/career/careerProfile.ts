import { getDb } from '../storage/db';
import { CareerProfile } from '../types';

export function createProfile(profile: CareerProfile): number {
  if (!profile.name || profile.name.trim() === '') {
    throw new Error('Profile name cannot be empty');
  }
  if (!profile.headline || profile.headline.trim() === '') {
    throw new Error('Profile headline cannot be empty');
  }
  if (profile.years_experience < 0) {
    throw new Error('Years of experience cannot be negative');
  }
  if (profile.target_salary_min < 0 || profile.target_salary_max < 0 || profile.target_hourly_rate < 0) {
    throw new Error('Salaries/rates cannot be negative');
  }

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO career_profile (
      name, headline, summary, years_experience, seniority,
      target_salary_min, target_salary_max, target_hourly_rate,
      remote_preference, location, career_goal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    profile.name,
    profile.headline,
    profile.summary,
    profile.years_experience,
    profile.seniority,
    profile.target_salary_min,
    profile.target_salary_max,
    profile.target_hourly_rate,
    profile.remote_preference || 'REMOTE',
    profile.location,
    profile.career_goal,
    now,
    now
  );

  return info.lastInsertRowid as number;
}

export function getProfile(id?: number): CareerProfile | null {
  const db = getDb();
  const row = id
    ? db.prepare('SELECT * FROM career_profile WHERE id = ?').get(id) as any
    : db.prepare('SELECT * FROM career_profile ORDER BY id DESC LIMIT 1').get() as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    summary: row.summary,
    years_experience: row.years_experience,
    seniority: row.seniority,
    target_salary_min: row.target_salary_min,
    target_salary_max: row.target_salary_max,
    target_hourly_rate: row.target_hourly_rate,
    remote_preference: row.remote_preference,
    location: row.location,
    career_goal: row.career_goal,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function updateProfile(profile: CareerProfile): void {
  if (!profile.id) {
    throw new Error('Profile ID is required for updates');
  }
  if (!profile.name || profile.name.trim() === '') {
    throw new Error('Profile name cannot be empty');
  }
  if (!profile.headline || profile.headline.trim() === '') {
    throw new Error('Profile headline cannot be empty');
  }
  if (profile.years_experience < 0) {
    throw new Error('Years of experience cannot be negative');
  }
  if (profile.target_salary_min < 0 || profile.target_salary_max < 0 || profile.target_hourly_rate < 0) {
    throw new Error('Salaries/rates cannot be negative');
  }

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE career_profile SET
      name = ?, headline = ?, summary = ?, years_experience = ?, seniority = ?,
      target_salary_min = ?, target_salary_max = ?, target_hourly_rate = ?,
      remote_preference = ?, location = ?, career_goal = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    profile.name,
    profile.headline,
    profile.summary,
    profile.years_experience,
    profile.seniority,
    profile.target_salary_min,
    profile.target_salary_max,
    profile.target_hourly_rate,
    profile.remote_preference,
    profile.location,
    profile.career_goal,
    now,
    profile.id
  );
}
