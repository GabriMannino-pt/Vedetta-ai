import { createProfile } from './careerProfile';
import { addSkill } from './careerSkills';
import { addEvidence } from './careerEvidence';
import { getDb, saveProjectDossier } from '../storage/db';
import { CareerProfile } from '../types';

export function seedCareerData(): void {
  const db = getDb();

  // Clean old career data to prevent constraints errors on seed runs
  db.prepare('DELETE FROM career_profile').run();

  console.log('[SEED] 👤 Creazione profilo carriera di Gabriele...');
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'AI & Workflow Automation Engineer | Full-Stack Developer',
    summary: 'Specialist in building production-grade autonomous agent systems, custom API integrations, and workflow pipelines using TypeScript, Node.js, and n8n.',
    years_experience: 3,
    seniority: 'MID-SENIOR',
    target_salary_min: 40000,
    target_salary_max: 55000,
    target_hourly_rate: 40,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Develop robust, high-value AI systems and automation backends for enterprise and fast-growing brands.'
  });

  console.log('[SEED] 📊 Aggiunta competenze...');
  const tsSkillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 3,
    confidence: 'VERIFIED'
  });

  const aiSkillId = addSkill({
    profile_id: profileId,
    skill: 'AI Agent Systems',
    category: 'AI',
    level: 'ADVANCED',
    years_experience: 1.5,
    confidence: 'VERIFIED'
  });

  const n8nSkillId = addSkill({
    profile_id: profileId,
    skill: 'n8n',
    category: 'AUTOMATION',
    level: 'ADVANCED',
    years_experience: 2,
    confidence: 'HIGH'
  });

  // Ensure mock/seed projects exist in projects table
  console.log('[SEED] 📁 Creazione progetti di portfolio...');
  saveProjectDossier({
    name: 'Vedetta AI',
    repo_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    description: 'Autonomous lead scraping, qualification, and sales system built in TypeScript.',
    tech_stack: ['TypeScript', 'Node.js', 'SQLite', 'Gemini API'],
    features: ['FACT vs INFERENCE classification', 'Lead scoring', 'Outreach drafts'],
    target_user: 'B2B agencies',
    pricing_model: 'SaaS',
    estimated_price_range: '49-149/m',
    maturity: 'Production / Ready',
    dependencies: [],
    commercial_audit: {
      commercial_score: 85,
      decision: '🚀 LAUNCH',
      estimated_tam: '€10M',
      recommended_first_step: 'Launch outbound campaign'
    }
  });

  console.log('[SEED] 🛡️ Aggiunta evidenze collegate ai progetti...');
  addEvidence({
    profile_id: profileId,
    project_id: 'Vedetta AI',
    type: 'GITHUB_PROJECT',
    title: 'Vedetta AI Repository',
    description: 'Production system codebase verifying advanced TypeScript skills and Gemini API orchestration.',
    source_type: 'GITHUB',
    source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    source_reference: 'src/scoring/gemini.ts',
    skill_id: tsSkillId,
    verified: true,
    confidence: 'HIGH'
  });

  addEvidence({
    profile_id: profileId,
    project_id: 'Vedetta AI',
    type: 'PRODUCTION_SYSTEM',
    title: 'Lead Decision Engine',
    description: 'Algorithmic pipeline qualifying B2B leads by checking factual evidence.',
    source_type: 'GITHUB',
    source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    source_reference: 'src/scoring/modeScorer.ts',
    skill_id: aiSkillId,
    verified: true,
    confidence: 'HIGH'
  });

  console.log('[SEED] ✅ Seeding modulo Career completato con successo!');
}
