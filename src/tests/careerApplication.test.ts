import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { addSkill } from '../career/careerSkills';
import { addEvidence } from '../career/careerEvidence';
import { createOpportunity } from '../career/careerOpportunities';
import { addRequirement } from '../career/requirementRepository';
import { matchRequirementToEvidence, rankEvidence } from '../career/evidenceMatcher';
import { generateApplicationStrategy } from '../career/applicationStrategy';
import { validateProposal, extractClaims } from '../career/proposalGuard';
import { setProposalMockMode } from '../career/proposalGenerator';
import { prepareApplication } from '../career/applicationIntelligence';
import { getApplication, listApplications } from '../career/careerApplications';
import { getProposal, getProposalClaims } from '../career/careerProposals';
import { evaluateFit } from '../career/fitScorer';
import { CareerProfile, CareerSkill, CareerEvidence, CareerOpportunity, CareerRequirement } from '../types';

async function runApplicationTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS APPLICATION INTELLIGENCE TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset database tables cleanly
  db.prepare('DELETE FROM career_proposal_claims').run();
  db.prepare('DELETE FROM career_proposals').run();
  db.prepare('DELETE FROM career_applications').run();
  db.prepare('DELETE FROM career_opportunity_requirements').run();
  db.prepare('DELETE FROM career_opportunities').run();
  db.prepare('DELETE FROM career_evidence').run();
  db.prepare('DELETE FROM career_skills').run();
  db.prepare('DELETE FROM career_profile').run();

  // Setup Base Candidate Profile
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

  const baseSkills: CareerSkill[] = [
    { id: tsSkillId, profile_id: profileId, skill: 'TypeScript', category: 'PROGRAMMING', level: 'EXPERT', years_experience: 4, confidence: 'HIGH' },
    { id: pySkillId, profile_id: profileId, skill: 'Python', category: 'PROGRAMMING', level: 'EXPERT', years_experience: 5, confidence: 'HIGH' }
  ];

  const vedettaEvidenceId = addEvidence({
    profile_id: profileId,
    skill_id: tsSkillId,
    type: 'GITHUB_PROJECT',
    title: 'Vedetta AI - Revenue Operating System',
    description: 'Autonomous revenue intelligence built with TypeScript, Node.js, and SQLite with 10k requests/scale.',
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
      description: 'Autonomous revenue intelligence built with TypeScript, Node.js, and SQLite with 10k requests/scale.',
      source_type: 'GITHUB',
      source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
      verified: true,
      confidence: 'HIGH'
    }
  ];

  // ─────────────────────────────────────────────────────────────
  // Test 1: Evidence Matching
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Requirement to Skill and Evidence matching...');
  const reqTS: CareerRequirement = {
    opportunityId: 1,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript is required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  };

  const matchRes = matchRequirementToEvidence(reqTS, baseSkills, baseEvidences);
  if (matchRes.support_level !== 'VERIFIED' || matchRes.evidence_id !== vedettaEvidenceId) {
    throw new Error(`FAIL: Expected VERIFIED match with evidence ID ${vedettaEvidenceId}, got ${matchRes.support_level}`);
  }
  console.log(`  - Matched requirement to verified evidence: ${matchRes.evidence_title} (Support: ${matchRes.support_level})`);

  // ─────────────────────────────────────────────────────────────
  // Test 2: Evidence Ranking
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: Evidence Ranking priority (Verified GitHub > Unverified Portfolio)...');
  const unverifiedPortfolio: CareerEvidence = {
    id: 99,
    profile_id: profileId,
    skill_id: pySkillId,
    type: 'PORTFOLIO',
    title: 'Python Demo',
    description: 'Basic demo',
    source_type: 'OTHER',
    verified: false,
    confidence: 'LOW'
  };
  const ranked = rankEvidence([unverifiedPortfolio, baseEvidences[0]]);
  if (ranked[0].id !== vedettaEvidenceId) {
    throw new Error('FAIL: Verified evidence was not ranked first');
  }
  console.log('  - Evidence ranking priority verified successfully.');

  // ─────────────────────────────────────────────────────────────
  // Test 3: Unsupported Claim Detection by Proposal Guard
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: Unsupported Claim Detection (Claiming ungrounded Ruby on Rails expertise)...');
  const fakeProposal = `I have 5 years experience and deep expertise in Ruby on Rails.`;
  const dummyOpp: CareerOpportunity = { profile_id: profileId, fingerprint: 'fp_dummy_1', source: 'DIRECT', title: 'Fullstack', company_name: 'Co', description: 'desc', opportunity_type: 'FULL_TIME', seniority: 'SENIOR', location: 'Remote', remote_type: 'REMOTE', status: 'NEW' };
  const strategyDummy = generateApplicationStrategy(baseProfile, dummyOpp, [reqTS], evaluateFit(baseProfile, baseSkills, baseEvidences, dummyOpp, [reqTS]), [matchRes]);

  const guardResFail = validateProposal(fakeProposal, baseProfile, baseSkills, baseEvidences, strategyDummy);
  if (guardResFail.valid || guardResFail.proposal_status !== 'BLOCKED') {
    throw new Error('FAIL: Proposal Guard should BLOCK unverified Ruby on Rails claim');
  }
  if (!guardResFail.blocking_reasons.some(r => r.includes('ruby'))) {
    throw new Error('FAIL: Blocking reasons did not flag ruby');
  }
  console.log(`  - Unsupported claim correctly blocked with status: ${guardResFail.proposal_status}`);

  // ─────────────────────────────────────────────────────────────
  // Test 4: Supported Claim Passes Guard
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: Supported Claim Validation...');
  const goodProposal = `I specialize in TypeScript architectures with 5 years experience.`;
  const guardResPass = validateProposal(goodProposal, baseProfile, baseSkills, baseEvidences, strategyDummy);
  if (!guardResPass.valid || guardResPass.proposal_status !== 'VALIDATED') {
    throw new Error(`FAIL: Supported proposal should be VALIDATED, got ${guardResPass.proposal_status}`);
  }
  console.log(`  - Supported proposal validated with status: ${guardResPass.proposal_status}`);

  // ─────────────────────────────────────────────────────────────
  // Test 5: No Hallucinated Technology
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: No Hallucinated Technology Check (Golang)...');
  const claimsWithGolang = extractClaims('I have written distributed systems in Golang and Docker', baseProfile, baseSkills, baseEvidences);
  const golangClaim = claimsWithGolang.find(c => c.claim_text.includes('golang'));
  if (!golangClaim || golangClaim.validation_status !== 'UNSUPPORTED') {
    throw new Error('FAIL: Golang claim was not marked UNSUPPORTED');
  }
  console.log('  - Hallucinated technology correctly tagged UNSUPPORTED.');

  // ─────────────────────────────────────────────────────────────
  // Test 6: No Invented Metrics
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 6: No Invented Metrics Check ($5M ARR)...');
  const metricClaims = extractClaims('Scaled company to $5M ARR with 10x growth', baseProfile, baseSkills, baseEvidences);
  const fakeMetric = metricClaims.find(c => c.claim_text.includes('$5m arr') || c.claim_text.includes('10x growth'));
  if (!fakeMetric || fakeMetric.validation_status !== 'UNSUPPORTED') {
    throw new Error('FAIL: Invented $5M metric was not flagged UNSUPPORTED');
  }
  console.log('  - Invented metric claim correctly tagged UNSUPPORTED.');

  // ─────────────────────────────────────────────────────────────
  // Test 7: Strategy Generation Coherence
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 7: Strategy Generation Coherence...');
  const testOpp: CareerOpportunity = {
    profile_id: profileId,
    fingerprint: 'fp_dummy_2',
    title: 'Senior AI Engineer',
    company_name: 'Apex AI',
    description: 'Looking for a Senior AI Engineer skilled in Python and TypeScript.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    hourly_rate_min: 50,
    hourly_rate_max: 70,
    status: 'NEW'
  };
  const fitEval = evaluateFit(baseProfile, baseSkills, baseEvidences, testOpp, [reqTS]);
  const strategy = generateApplicationStrategy(baseProfile, testOpp, [reqTS], fitEval, [matchRes]);

  if (strategy.recommended_tone !== 'AI' || strategy.recommended_rate !== 60 || strategy.top_strengths.length === 0) {
    throw new Error('FAIL: Strategy generation mismatch');
  }
  console.log(`  - Strategy generated: Tone=${strategy.recommended_tone}, Rate=$${strategy.recommended_rate}, Strengths=${strategy.top_strengths.length}`);

  // ─────────────────────────────────────────────────────────────
  // Test 8: Critical Gap Safety
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 8: Critical Gap Safety (Application cannot be READY if critical gap exists)...');
  const criticalMissingReq: CareerRequirement = {
    opportunityId: 2,
    name: 'Golang',
    normalizedName: 'golang',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Golang required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  };
  const oppCritId = createOpportunity({
    profile_id: profileId,
    title: 'Go Backend Lead',
    company_name: 'Cloud Scale',
    description: 'Golang mandatory',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({ ...criticalMissingReq, opportunityId: oppCritId });

  setProposalMockMode(true, 'Hi Team, I specialize in backend systems with 5 years experience.');
  const critAppRes = await prepareApplication(oppCritId);
  if (critAppRes.application.status === 'READY') {
    throw new Error('FAIL: Application with critical gap must NOT be READY');
  }
  console.log(`  - Critical gap safety verified: Application status is ${critAppRes.application.status}`);

  // ─────────────────────────────────────────────────────────────
  // Test 9: Snapshot Immutability
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 9: Snapshot immutability check...');
  const appPersisted = getApplication(critAppRes.application.id!)!;
  if (appPersisted.fit_score_snapshot === undefined || appPersisted.recommendation_snapshot === undefined) {
    throw new Error('FAIL: Snapshot fields missing from persisted application');
  }
  console.log(`  - Snapshot frozen: Fit=${appPersisted.fit_score_snapshot}, Rec=${appPersisted.recommendation_snapshot}, AlgoV=${appPersisted.fit_algorithm_version}`);

  // ─────────────────────────────────────────────────────────────
  // Test 10: Proposal Versioning
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 10: Proposal Versioning (v1 -> v2 without overwrite)...');
  setProposalMockMode(true, 'Updated version 2 content for application.');
  const v2Res = await prepareApplication(oppCritId, { forceNewProposalVersion: true });
  if (v2Res.proposal.proposal_version <= 1) {
    throw new Error(`FAIL: Expected proposal_version > 1 on re-preparation, got ${v2Res.proposal.proposal_version}`);
  }
  console.log(`  - Proposal versioning verified: New proposal version is ${v2Res.proposal.proposal_version}`);

  // ─────────────────────────────────────────────────────────────
  // Test 11: Transaction Rollback on Error
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 11: Transaction Rollback verification...');
  const appsCountBefore = listApplications().length;
  try {
    // Attempt with invalid opportunity ID
    await prepareApplication(999999);
  } catch (e: any) {
    // Expected failure
  }
  const appsCountAfter = listApplications().length;
  if (appsCountBefore !== appsCountAfter) {
    throw new Error('FAIL: Incomplete transaction wrote records');
  }
  console.log('  - Transaction rollback verified.');

  // ─────────────────────────────────────────────────────────────
  // Test 12: Full End-to-End Pipeline
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 12: Full End-to-End Application Pipeline...');
  const oppFullId = createOpportunity({
    profile_id: profileId,
    title: 'Senior TypeScript Engineer',
    company_name: 'NextGen',
    description: 'Looking for a Senior TypeScript developer.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({ ...reqTS, opportunityId: oppFullId });

  setProposalMockMode(true, `Hi NextGen, regarding your Senior TypeScript Engineer role—I have 5 years experience and verified code in Vedetta AI.`);
  const fullAppRes = await prepareApplication(oppFullId);

  if (fullAppRes.application.status !== 'READY') {
    throw new Error(`FAIL: Full pipeline application status should be READY for human review, got ${fullAppRes.application.status}`);
  }
  if (fullAppRes.validation.proposal_status !== 'VALIDATED') {
    throw new Error(`FAIL: Proposal status should be VALIDATED, got ${fullAppRes.validation.proposal_status}`);
  }

  const propClaims = getProposalClaims(fullAppRes.proposal.id!);
  if (propClaims.length === 0) {
    throw new Error('FAIL: No proposal claims persisted');
  }
  console.log(`  - Full Pipeline verified: Application=${fullAppRes.application.status}, Proposal=${fullAppRes.proposal.proposal_status}, Claims=${propClaims.length}`);

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS APPLICATION INTELLIGENCE TESTS PASSED!');
  console.log('==================================================\n');
}

runApplicationTests().then(() => {
  process.exit(0);
}).catch((e: any) => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
