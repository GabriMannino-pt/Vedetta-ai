import { initDb, getDb, saveProjectDossier } from '../storage/db';
import { createProfile, getProfile, updateProfile } from '../career/careerProfile';
import { addSkill, listSkills, updateSkill, removeSkill } from '../career/careerSkills';
import { addEvidence, listEvidence, getEvidenceForSkill, getEvidenceForProject, verifyEvidence } from '../career/careerEvidence';
import { seedCareerData } from '../career/careerSeed';

function runTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS FOUNDATION TEST SUITE');
  console.log('==================================================\n');

  // Initialize DB in memory/test mode
  initDb();
  const db = getDb();

  // Test 1: Profile CRUD & Validations
  console.log('Test 1: Career Profile CRUD & Validations...');
  
  // Invalid inputs validation
  try {
    createProfile({
      name: '',
      headline: 'Dev',
      summary: 'Summary',
      years_experience: 3,
      seniority: 'Mid',
      target_salary_min: 0,
      target_salary_max: 0,
      target_hourly_rate: 0,
      remote_preference: 'REMOTE',
      location: 'Italy',
      career_goal: 'Goal'
    });
    throw new Error('FAIL: Allowed empty name');
  } catch (e: any) {
    if (e.message !== 'Profile name cannot be empty') throw e;
  }

  try {
    createProfile({
      name: 'Gabriele',
      headline: 'Dev',
      summary: 'Summary',
      years_experience: -1,
      seniority: 'Mid',
      target_salary_min: 0,
      target_salary_max: 0,
      target_hourly_rate: 0,
      remote_preference: 'REMOTE',
      location: 'Italy',
      career_goal: 'Goal'
    });
    throw new Error('FAIL: Allowed negative experience');
  } catch (e: any) {
    if (e.message !== 'Years of experience cannot be negative') throw e;
  }

  // Valid insert
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'AI Automation Developer',
    summary: 'Building n8n & Node systems',
    years_experience: 3,
    seniority: 'Mid',
    target_salary_min: 40000,
    target_salary_max: 50000,
    target_hourly_rate: 40,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Become Senior Architect'
  });
  console.log(`  - Profile created successfully. ID: ${profileId}`);

  const profile = getProfile();
  if (!profile || profile.name !== 'Gabriele Mannino') {
    throw new Error(`FAIL: Profile retrieve error`);
  }
  console.log('  - Profile retrieved successfully.');

  // Update profile
  profile.headline = 'Lead AI Architect';
  updateProfile(profile);
  const updated = getProfile();
  if (!updated || updated.headline !== 'Lead AI Architect') {
    throw new Error('FAIL: Profile update failed');
  }
  console.log('  - Profile updated successfully.');

  // Test 2: Skills CRUD & Deduplication
  console.log('\nTest 2: Skills CRUD & Deduplication...');
  
  // Valid skill insert
  const tsSkillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 3,
    confidence: 'VERIFIED'
  });
  console.log(`  - Skill added: TypeScript. ID: ${tsSkillId}`);

  // Duplicate prevention check
  try {
    addSkill({
      profile_id: profileId,
      skill: '  typescript  ',
      category: 'PROGRAMMING',
      level: 'BEGINNER',
      years_experience: 1,
      confidence: 'LOW'
    });
    throw new Error('FAIL: Allowed duplicate skill');
  } catch (e: any) {
    if (!e.message.includes('already exists')) throw e;
  }
  console.log('  - Duplicate skill prevention passed.');

  // List skills
  const skills = listSkills(profileId);
  if (skills.length !== 1 || skills[0].skill !== 'TypeScript') {
    throw new Error('FAIL: Skills listing failed');
  }
  console.log('  - Skills listed successfully.');

  // Update skill
  skills[0].level = 'ADVANCED';
  updateSkill(skills[0]);
  const skillsUpdated = listSkills(profileId);
  if (skillsUpdated[0].level !== 'ADVANCED') {
    throw new Error('FAIL: Skill update failed');
  }
  console.log('  - Skill updated successfully.');

  // Test 3: Evidence Links & Validations
  console.log('\nTest 3: Evidence Links & Validations...');

  // Set up project first
  saveProjectDossier({
    name: 'Vedetta AI',
    repo_url: 'https://github.com/test/vedetta',
    description: 'Test Project',
    tech_stack: ['TypeScript'],
    features: ['E2E tests'],
    target_user: 'Users',
    business_model: 'Open Source / Tool',
    pricing_model: 'Free',
    estimated_price_range: '0',
    maturity: 'MVP / Testing',
    dependencies: [],
    commercial_audit: {
      commercial_score: 90,
      decision: '🚀 LAUNCH',
      estimated_tam: '1',
      recommended_first_step: 'Run'
    }
  });

  // Invalid: verified evidence without source_url
  try {
    addEvidence({
      profile_id: profileId,
      project_id: 'Vedetta AI',
      type: 'GITHUB_PROJECT',
      title: 'GitHub code references',
      description: 'Testing',
      source_type: 'GITHUB',
      source_url: '',
      verified: true,
      confidence: 'HIGH',
      skill_id: tsSkillId
    });
    throw new Error('FAIL: Allowed verified evidence without source_url');
  } catch (e: any) {
    if (e.message !== 'Verified evidence must have a valid source_url') throw e;
  }
  console.log('  - Verification constraints passed (verified requires source_url).');

  // Invalid project ID references
  try {
    addEvidence({
      profile_id: profileId,
      project_id: 'NonExistentProject',
      type: 'GITHUB_PROJECT',
      title: 'GitHub code references',
      description: 'Testing',
      source_type: 'GITHUB',
      source_url: 'https://github.com/test',
      verified: true,
      confidence: 'HIGH',
      skill_id: tsSkillId
    });
    throw new Error('FAIL: Allowed non-existent project reference');
  } catch (e: any) {
    if (!e.message.includes('does not exist')) throw e;
  }
  console.log('  - Verification constraints passed (invalid project rejected).');

  // Valid insert
  const evidenceId = addEvidence({
    profile_id: profileId,
    project_id: 'Vedetta AI',
    type: 'GITHUB_PROJECT',
    title: 'TypeScript parser codebase',
    description: 'TS orchestration logic in Vedetta',
    source_type: 'GITHUB',
    source_url: 'https://github.com/test/vedetta',
    source_reference: 'src/scoring/modeScorer.ts',
    skill_id: tsSkillId,
    verified: true,
    confidence: 'HIGH'
  });
  console.log(`  - Evidence added successfully. ID: ${evidenceId}`);

  // Retrieve evidence
  const evidenceList = listEvidence(profileId);
  if (evidenceList.length !== 1 || evidenceList[0].project_id !== 'Vedetta AI' || !evidenceList[0].verified) {
    throw new Error('FAIL: Evidence list retrieval error');
  }
  console.log('  - Evidence retrieved successfully.');

  const skillEvidence = getEvidenceForSkill(tsSkillId);
  if (skillEvidence.length !== 1 || skillEvidence[0].skill_id !== tsSkillId) {
    throw new Error('FAIL: Get evidence for skill failed');
  }
  console.log('  - Evidence for skill retrieved successfully.');

  const projectEvidence = getEvidenceForProject('Vedetta AI');
  if (projectEvidence.length !== 1 || projectEvidence[0].project_id !== 'Vedetta AI') {
    throw new Error('FAIL: Get evidence for project failed');
  }
  console.log('  - Evidence for project retrieved successfully.');

  // Test 4: Seeding & Clean Integration Check
  console.log('\nTest 4: Seeding & Verification Integration...');
  seedCareerData();
  
  const seededProfile = getProfile();
  if (!seededProfile || seededProfile.name !== 'Gabriele Mannino') {
    throw new Error('FAIL: Seed profile not created');
  }
  const seededSkills = listSkills(seededProfile.id!);
  if (seededSkills.length < 3) {
    throw new Error('FAIL: Seed skills not loaded');
  }
  const seededEvidence = listEvidence(seededProfile.id!);
  if (seededEvidence.length < 2) {
    throw new Error('FAIL: Seed evidence not loaded');
  }
  console.log('  - Seeding verified successfully.');

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS FOUNDATION TESTS PASSED!');
  console.log('==================================================\n');
}

try {
  runTests();
  process.exit(0);
} catch (e: any) {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
}
