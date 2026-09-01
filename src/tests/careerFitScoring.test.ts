import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { addSkill } from '../career/careerSkills';
import { addEvidence } from '../career/careerEvidence';
import { createOpportunity, getOpportunity } from '../career/careerOpportunities';
import { addRequirement } from '../career/requirementRepository';
import { evaluateFit, evaluateAndPersistFit, calculateExperienceMatch, calculateSeniorityMatch, calculateSalaryCompatibility } from '../career/fitScorer';
import { normalizeSkillName } from '../career/requirementExtractor';
import { CareerProfile, CareerSkill, CareerEvidence, CareerOpportunity, CareerRequirement } from '../types';

async function runFitScoringTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS DETERMINISTIC FIT SCORING TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset database tables
  db.prepare('DELETE FROM career_opportunity_requirements').run();
  db.prepare('DELETE FROM career_opportunities').run();
  db.prepare('DELETE FROM career_evidence').run();
  db.prepare('DELETE FROM career_skills').run();
  db.prepare('DELETE FROM career_profile').run();

  // Base Profile Setup
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'Senior AI & Workflow Automation Engineer',
    summary: 'Expert in Python, TypeScript, n8n, LLMs, and backend architectures.',
    years_experience: 5,
    seniority: 'SENIOR',
    target_salary_min: 50000,
    target_salary_max: 65000,
    target_hourly_rate: 50,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Scale AI automation systems'
  });

  const baseProfile: CareerProfile = {
    id: profileId,
    name: 'Gabriele Mannino',
    headline: 'Senior AI & Workflow Automation Engineer',
    summary: 'Expert in Python, TypeScript, n8n, LLMs, and backend architectures.',
    years_experience: 5,
    seniority: 'SENIOR',
    target_salary_min: 50000,
    target_salary_max: 65000,
    target_hourly_rate: 50,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Scale AI automation systems'
  };

  const tsSkillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 4,
    confidence: 'HIGH'
  });

  const pySkillId = addSkill({
    profile_id: profileId,
    skill: 'Python',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 5,
    confidence: 'HIGH'
  });

  const n8nSkillId = addSkill({
    profile_id: profileId,
    skill: 'n8n',
    category: 'AUTOMATION',
    level: 'ADVANCED',
    years_experience: 3,
    confidence: 'HIGH'
  });

  const baseSkills: CareerSkill[] = [
    { id: tsSkillId, profile_id: profileId, skill: 'TypeScript', category: 'PROGRAMMING', level: 'EXPERT', years_experience: 4, confidence: 'HIGH' },
    { id: pySkillId, profile_id: profileId, skill: 'Python', category: 'PROGRAMMING', level: 'EXPERT', years_experience: 5, confidence: 'HIGH' },
    { id: n8nSkillId, profile_id: profileId, skill: 'n8n', category: 'AUTOMATION', level: 'ADVANCED', years_experience: 3, confidence: 'HIGH' }
  ];

  const vedettaEvidenceId = addEvidence({
    profile_id: profileId,
    skill_id: tsSkillId,
    type: 'GITHUB_PROJECT',
    title: 'Vedetta AI - Revenue Operating System',
    description: 'Autonomous revenue intelligence built with TypeScript, Node.js, and SQLite.',
    source_type: 'GITHUB',
    source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    verified: true,
    confidence: 'HIGH'
  });

  const baseEvidences: CareerEvidence[] = [
    {
      id: vedettaEvidenceId,
      profile_id: profileId,
      skill_id: tsSkillId,
      type: 'GITHUB_PROJECT',
      title: 'Vedetta AI - Revenue Operating System',
      description: 'Autonomous revenue intelligence built with TypeScript, Node.js, and SQLite.',
      source_type: 'GITHUB',
      source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
      verified: true,
      confidence: 'HIGH'
    }
  ];

  // ─────────────────────────────────────────────────────────────
  // Test 1: Perfect Match Scenario
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Perfect Match Scenario (Expect fitScore >= 90)...');
  const opp1Id = createOpportunity({
    profile_id: profileId,
    title: 'Senior AI Engineer',
    company_name: 'AI Labs',
    description: 'Looking for a Senior AI Engineer skilled in Python, TypeScript, and AI workflow automation.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    salary_min: 55000,
    salary_max: 70000,
    status: 'NEW'
  });

  const opp1Reqs: CareerRequirement[] = [
    {
      opportunityId: opp1Id,
      name: 'Python',
      normalizedName: 'python',
      category: 'TECHNICAL',
      priority: 'MUST_HAVE',
      yearsRequired: 5,
      evidence: { sourceText: 'Python required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
    },
    {
      opportunityId: opp1Id,
      name: 'TypeScript',
      normalizedName: 'typescript',
      category: 'TECHNICAL',
      priority: 'MUST_HAVE',
      yearsRequired: 3,
      evidence: { sourceText: 'TypeScript required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
    }
  ];

  for (const r of opp1Reqs) addRequirement(r);

  const res1 = evaluateAndPersistFit(opp1Id);
  if (res1.fitScore < 90) {
    throw new Error(`FAIL: Expected fitScore >= 90 for perfect match, got ${res1.fitScore}`);
  }
  if (res1.recommendation !== 'STRONG_MATCH') {
    throw new Error(`FAIL: Expected STRONG_MATCH recommendation, got ${res1.recommendation}`);
  }
  if (res1.criticalGap) {
    throw new Error('FAIL: criticalGap should be false for perfect match');
  }
  console.log(`  - Perfect Match passed with fitScore: ${res1.fitScore}, recommendation: ${res1.recommendation}`);

  // ─────────────────────────────────────────────────────────────
  // Test 2: Partial Technical Match
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: Partial Technical Match Scenario...');
  const opp2Id = createOpportunity({
    profile_id: profileId,
    title: 'Full Stack Engineer',
    company_name: 'Tech Corp',
    description: 'Requires TypeScript and Ruby on Rails.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  const opp2Reqs: CareerRequirement[] = [
    {
      opportunityId: opp2Id,
      name: 'TypeScript',
      normalizedName: 'typescript',
      category: 'TECHNICAL',
      priority: 'MUST_HAVE',
      evidence: { sourceText: 'TypeScript', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
    },
    {
      opportunityId: opp2Id,
      name: 'Ruby on Rails',
      normalizedName: 'ruby on rails',
      category: 'TECHNICAL',
      priority: 'SHOULD_HAVE',
      evidence: { sourceText: 'Ruby on Rails', sourceType: 'JOB_DESCRIPTION', confidence: 0.90 }
    }
  ];
  for (const r of opp2Reqs) addRequirement(r);

  const res2 = evaluateAndPersistFit(opp2Id);
  if (res2.fitScore >= res1.fitScore) {
    throw new Error('FAIL: Partial match score should be lower than perfect match');
  }
  if (!res2.explanation.gaps.some(g => g.includes('Ruby on Rails') || g.includes('Missing'))) {
    throw new Error('FAIL: Gaps did not mention missing Ruby on Rails');
  }
  console.log(`  - Partial match verified with fitScore: ${res2.fitScore}`);

  // ─────────────────────────────────────────────────────────────
  // Test 3: Critical Missing Skill Rule
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: Critical Missing Skill Rule...');
  const opp3Id = createOpportunity({
    profile_id: profileId,
    title: 'Go Systems Engineer',
    company_name: 'Infra Corp',
    description: 'Requires Golang systems engineering.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  const opp3Reqs: CareerRequirement[] = [
    {
      opportunityId: opp3Id,
      name: 'Golang',
      normalizedName: 'golang',
      category: 'TECHNICAL',
      priority: 'MUST_HAVE',
      evidence: { sourceText: 'Golang is mandatory', sourceType: 'JOB_DESCRIPTION', confidence: 0.99 }
    }
  ];
  for (const r of opp3Reqs) addRequirement(r);

  const res3 = evaluateAndPersistFit(opp3Id);
  if (!res3.criticalGap) {
    throw new Error('FAIL: criticalGap must be true when mandatory MUST_HAVE technical skill is absent');
  }
  if (res3.recommendation === 'STRONG_MATCH' || res3.recommendation === 'GOOD_MATCH') {
    throw new Error(`FAIL: Recommendation should be downgraded on criticalGap, got ${res3.recommendation}`);
  }
  console.log(`  - Critical missing skill correctly triggered criticalGap=true and recommendation: ${res3.recommendation}`);

  // ─────────────────────────────────────────────────────────────
  // Test 4: Evidence Level Difference (Declared vs Verified)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: Evidence Level Difference (Declared vs Verified)...');
  const dummyOpp: CareerOpportunity = {
    profile_id: profileId,
    fingerprint: 'dummy_fp_ts_dev',
    source: 'DIRECT',
    title: 'TS Developer',
    company_name: 'Test Co',
    description: 'TypeScript',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  };
  const dummyReqs: CareerRequirement[] = [
    {
      opportunityId: 0,
      name: 'TypeScript',
      normalizedName: 'typescript',
      category: 'TECHNICAL',
      priority: 'MUST_HAVE',
      evidence: { sourceText: 'TS', sourceType: 'JOB_DESCRIPTION', confidence: 0.9 }
    }
  ];

  // Scenario A: Only declared skill, no evidence
  const resA = evaluateFit(baseProfile, [{ profile_id: profileId, skill: 'TypeScript', category: 'PROGRAMMING', level: 'ADVANCED', years_experience: 2, confidence: 'MEDIUM' }], [], dummyOpp, dummyReqs);
  
  // Scenario B: Declared skill with verified GitHub evidence
  const resB = evaluateFit(baseProfile, [{ profile_id: profileId, skill: 'TypeScript', category: 'PROGRAMMING', level: 'ADVANCED', years_experience: 2, confidence: 'MEDIUM' }], baseEvidences, dummyOpp, dummyReqs);

  if (resB.breakdown.evidenceStrength <= resA.breakdown.evidenceStrength) {
    throw new Error(`FAIL: Verified evidence (${resB.breakdown.evidenceStrength}) should exceed declared-only (${resA.breakdown.evidenceStrength})`);
  }
  console.log(`  - Evidence distinction verified: Declared (${resA.breakdown.evidenceStrength}) < Verified (${resB.breakdown.evidenceStrength})`);

  // ─────────────────────────────────────────────────────────────
  // Test 5: Skill Normalization
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: Skill Normalization Verification...');
  const testNames = ['Node', 'Node.js', 'nodejs', 'Node JS'];
  for (const n of testNames) {
    const norm = normalizeSkillName(n);
    if (norm !== 'node.js') {
      throw new Error(`FAIL: Expected normalizeSkillName("${n}") to equal "node.js", got "${norm}"`);
    }
  }
  console.log('  - Skill normalization verified across all node variants.');

  // ─────────────────────────────────────────────────────────────
  // Test 6: Experience Scenarios
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 6: Experience calculation scenarios...');
  const expMatchExact = calculateExperienceMatch(5, 5);
  const expMatchLower = calculateExperienceMatch(3, 5);
  const expMatchHigher = calculateExperienceMatch(7, 5);

  if (expMatchExact !== 100 || expMatchHigher !== 100 || expMatchLower !== 60) {
    throw new Error(`FAIL: Experience calculation error: 5/5=${expMatchExact}, 3/5=${expMatchLower}, 7/5=${expMatchHigher}`);
  }
  console.log('  - Experience match calculations verified (100%, 60%, 100%).');

  // ─────────────────────────────────────────────────────────────
  // Test 7: Seniority Scenarios
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 7: Seniority comparison scenarios...');
  const senJuniorToSenior = calculateSeniorityMatch('JUNIOR', 'SENIOR');
  const senSeniorToSenior = calculateSeniorityMatch('SENIOR', 'SENIOR');
  const senSeniorToLead = calculateSeniorityMatch('SENIOR', 'LEAD');
  const senLeadToSenior = calculateSeniorityMatch('LEAD', 'SENIOR');

  if (senSeniorToSenior !== 100) throw new Error('FAIL: Senior to Senior should be 100');
  if (senJuniorToSenior > senSeniorToLead) throw new Error('FAIL: Junior->Senior should score lower than Senior->Lead');
  if (senLeadToSenior < 85) throw new Error('FAIL: Lead->Senior should score high (overqualified)');
  console.log(`  - Seniority matches verified (Junior->Senior: ${senJuniorToSenior}, Senior->Senior: ${senSeniorToSenior}, Senior->Lead: ${senSeniorToLead}, Lead->Senior: ${senLeadToSenior})`);

  // ─────────────────────────────────────────────────────────────
  // Test 8: Missing Salary Fallback
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 8: Missing Salary Compatibility...');
  const noSalaryOpp: CareerOpportunity = { ...dummyOpp, salary_min: null, salary_max: null, hourly_rate_min: null, hourly_rate_max: null };
  const salComp = calculateSalaryCompatibility(baseProfile, noSalaryOpp);
  if (salComp !== 50) {
    throw new Error(`FAIL: Expected salaryCompatibility = 50 on missing salary, got ${salComp}`);
  }
  console.log('  - Missing salary fallback verified (50).');

  // ─────────────────────────────────────────────────────────────
  // Test 9: Determinism Test
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 9: Determinism verification (result1 === result2)...');
  const runA = evaluateFit(baseProfile, baseSkills, baseEvidences, dummyOpp, opp1Reqs);
  const runB = evaluateFit(baseProfile, baseSkills, baseEvidences, dummyOpp, opp1Reqs);

  if (runA.fitScore !== runB.fitScore || runA.applicationPriority !== runB.applicationPriority || runA.recommendation !== runB.recommendation) {
    throw new Error('FAIL: Fit evaluation is non-deterministic!');
  }
  console.log('  - Determinism verified: 2 identical runs produced identical scores and recommendations.');

  // ─────────────────────────────────────────────────────────────
  // Test 10: Explainability Coherence
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 10: Explainability structure and contents...');
  if (!Array.isArray(runA.explanation.strengths) || runA.explanation.strengths.length === 0) {
    throw new Error('FAIL: Strengths list is empty for matching profile');
  }
  if (!Array.isArray(runA.explanation.matchedRequirements) || runA.explanation.matchedRequirements.length !== 2) {
    throw new Error('FAIL: Matched requirements list mismatch');
  }
  console.log('  - Explainability lists verified.');

  // ─────────────────────────────────────────────────────────────
  // Test 11: Persistence Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 11: Persistence in career_opportunities table...');
  const persistedOpp = getOpportunity(opp1Id)!;
  if (persistedOpp.fit_score !== res1.fitScore) {
    throw new Error(`FAIL: Persisted fit_score ${persistedOpp.fit_score} does not match computed ${res1.fitScore}`);
  }
  if (persistedOpp.fit_algorithm_version !== 1) {
    throw new Error(`FAIL: Persisted algorithm version ${persistedOpp.fit_algorithm_version} != 1`);
  }
  if (!persistedOpp.fit_calculated_at) {
    throw new Error('FAIL: fit_calculated_at was not persisted');
  }
  if (!persistedOpp.fit_breakdown_json || !persistedOpp.fit_explanation_json) {
    throw new Error('FAIL: JSON breakdown/explanation was not persisted');
  }
  console.log('  - SQLite persistence verified.');

  // ─────────────────────────────────────────────────────────────
  // Test 12: Full Pipeline Integration
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 12: Full Pipeline (Profile -> Skills -> Evidence -> Opportunity -> Requirements -> Fit Scorer -> Recommendation)...');
  const fullResult = evaluateAndPersistFit(opp1Id);
  if (fullResult.recommendation !== 'STRONG_MATCH' || fullResult.fitScore < 85 || fullResult.applicationPriority < 80) {
    throw new Error('FAIL: Full pipeline evaluation assertion failure');
  }
  console.log('  - Full pipeline integration verified successfully.');

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS DETERMINISTIC FIT SCORING TESTS PASSED!');
  console.log('==================================================\n');
}

runFitScoringTests().then(() => {
  process.exit(0);
}).catch((e: any) => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
