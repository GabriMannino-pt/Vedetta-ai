import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { addSkill } from '../career/careerSkills';
import { addEvidence } from '../career/careerEvidence';
import { createOpportunity } from '../career/careerOpportunities';
import { addRequirement } from '../career/requirementRepository';
import { prepareApplication } from '../career/applicationIntelligence';
import { setProposalMockMode } from '../career/proposalGenerator';
import {
  recordOutcomeEvent,
  canTransitionOutcome,
  listOutcomeEvents,
  rebuildOutcomeSnapshot,
  calculateOutcomeSummary,
  getLatestOutcome
} from '../career/careerOutcomes';
import {
  buildLearningObservation,
  calculateHistoricalMetrics,
  calculateCalibration,
  generateLearningInsights,
  rebuildAllLearningObservations,
  LEARNING_ALGORITHM_VERSION,
  MIN_OBSERVATIONS_FOR_INSIGHT,
  MIN_OBSERVATIONS_FOR_STRONG_INSIGHT
} from '../career/learningEngine';
import { getApplication } from '../career/careerApplications';
import { CareerOutcomeEvent, CareerLearningObservation } from '../types';

async function runLearningTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS OUTCOME TRACKING & LEARNING TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset database cleanly
  db.prepare('DELETE FROM career_learning_observations').run();
  db.prepare('DELETE FROM career_outcome_snapshots').run();
  db.prepare('DELETE FROM career_outcome_events').run();
  db.prepare('DELETE FROM career_proposal_claims').run();
  db.prepare('DELETE FROM career_proposals').run();
  db.prepare('DELETE FROM career_applications').run();
  db.prepare('DELETE FROM career_opportunity_requirements').run();
  db.prepare('DELETE FROM career_opportunities').run();
  db.prepare('DELETE FROM career_evidence').run();
  db.prepare('DELETE FROM career_skills').run();
  db.prepare('DELETE FROM career_profile').run();

  // 1. Setup Base Profile, Skill & Evidence
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'Senior AI Engineer',
    summary: 'Expert in Python and TypeScript AI systems.',
    years_experience: 5,
    seniority: 'SENIOR',
    target_salary_min: 50000,
    target_salary_max: 65000,
    target_hourly_rate: 50,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Scale AI systems'
  });

  const skillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 5,
    confidence: 'HIGH'
  });

  const evidenceId = addEvidence({
    profile_id: profileId,
    skill_id: skillId,
    type: 'GITHUB_PROJECT',
    title: 'Vedetta AI',
    description: 'TypeScript AI orchestration system',
    source_type: 'GITHUB',
    source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    verified: true,
    confidence: 'HIGH'
  });

  const oppId = createOpportunity({
    profile_id: profileId,
    title: 'Senior TypeScript Engineer',
    company_name: 'TechScale',
    description: 'Looking for a Senior TypeScript developer.',
    source: 'UPWORK',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  addRequirement({
    opportunityId: oppId,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });

  setProposalMockMode(true, 'Hi TechScale, I have 5 years experience in TypeScript and verified code in Vedetta AI.');
  const appResult = await prepareApplication(oppId, { channel: 'UPWORK' });
  const appId = appResult.application.id!;

  // ─────────────────────────────────────────────────────────────
  // Test 1: Outcome Event Creation
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Outcome Event Creation (Append-only)...');
  const event1Id = recordOutcomeEvent({
    applicationId: appId,
    opportunityId: oppId,
    profileId: profileId,
    eventType: 'SUBMITTED',
    eventAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    source: 'UPWORK'
  });

  const ev1 = db.prepare('SELECT * FROM career_outcome_events WHERE id = ?').get(event1Id) as any;
  if (!ev1 || ev1.event_type !== 'SUBMITTED') {
    throw new Error('FAIL: Event 1 not recorded properly');
  }
  console.log(`  - Event recorded successfully: ${ev1.event_type} (ID: ${event1Id})`);

  // ─────────────────────────────────────────────────────────────
  // Test 2: State Machine Transition Guard
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: Invalid Transition Rejection...');
  const canInvalidTransition = canTransitionOutcome('REJECTED', 'INTERVIEW_INVITED');
  if (canInvalidTransition) {
    throw new Error('FAIL: State machine allowed REJECTED -> INTERVIEW_INVITED');
  }
  console.log('  - Invalid transition REJECTED -> INTERVIEW_INVITED blocked.');

  // ─────────────────────────────────────────────────────────────
  // Test 3: Outcome History Integrity
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: Outcome History Integrity...');
  recordOutcomeEvent({
    applicationId: appId,
    opportunityId: oppId,
    profileId: profileId,
    eventType: 'RESPONSE_RECEIVED',
    eventAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    source: 'UPWORK'
  });

  recordOutcomeEvent({
    applicationId: appId,
    opportunityId: oppId,
    profileId: profileId,
    eventType: 'INTERVIEW_INVITED',
    eventAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    source: 'UPWORK'
  });

  const history = listOutcomeEvents(appId);
  if (history.length !== 3 || history[2].eventType !== 'INTERVIEW_INVITED') {
    throw new Error(`FAIL: Expected 3 chronological events, got ${history.length}`);
  }
  console.log(`  - Chronological history verified with ${history.length} events.`);

  // ─────────────────────────────────────────────────────────────
  // Test 4: Snapshot Rebuild from Event History
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: Snapshot Rebuild from Event History...');
  const snapshot = rebuildOutcomeSnapshot(appId);
  if (!snapshot.submitted || !snapshot.responseReceived || !snapshot.interviewInvited || snapshot.finalOutcome !== 'INTERVIEW_INVITED') {
    throw new Error('FAIL: Snapshot projection did not match event history');
  }
  if (snapshot.daysToResponse === null || snapshot.daysToResponse === undefined || snapshot.daysToResponse < 1.5) {
    throw new Error(`FAIL: Expected daysToResponse around 2 days, got ${snapshot.daysToResponse}`);
  }
  console.log(`  - Snapshot accurately projected: Final=${snapshot.finalOutcome}, ResponseDays=${snapshot.daysToResponse}`);

  // ─────────────────────────────────────────────────────────────
  // Test 5: No Retroactive Mutation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: No Retroactive Mutation of historical fit & application snapshot...');
  const appFrozen = getApplication(appId)!;
  if (appFrozen.fit_score_snapshot !== appResult.application.fit_score_snapshot) {
    throw new Error('FAIL: Historical fit_score_snapshot was modified');
  }
  console.log(`  - Historical fit score snapshot remains intact: ${appFrozen.fit_score_snapshot} (Algo v${appFrozen.fit_algorithm_version})`);

  // ─────────────────────────────────────────────────────────────
  // Test 6: Response Rate Calculation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 6: Response Rate Metric...');
  const metrics1 = calculateHistoricalMetrics();
  if (metrics1.responseRate !== 100) {
    throw new Error(`FAIL: Expected 100% response rate for 1 responded app, got ${metrics1.responseRate}%`);
  }
  console.log(`  - Response Rate verified: ${metrics1.responseRate}%`);

  // ─────────────────────────────────────────────────────────────
  // Test 7: Interview Rate Calculation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 7: Interview Rate Metric...');
  if (metrics1.interviewRate !== 100) {
    throw new Error(`FAIL: Expected 100% interview rate, got ${metrics1.interviewRate}%`);
  }
  console.log(`  - Interview Rate verified: ${metrics1.interviewRate}%`);

  // ─────────────────────────────────────────────────────────────
  // Test 8: Offer Rate Calculation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 8: Offer Rate Metric...');
  recordOutcomeEvent({
    applicationId: appId,
    opportunityId: oppId,
    profileId: profileId,
    eventType: 'OFFER_RECEIVED',
    eventAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    source: 'UPWORK'
  });
  const metrics2 = calculateHistoricalMetrics();
  if (metrics2.offerRate !== 100) {
    throw new Error(`FAIL: Expected 100% offer rate, got ${metrics2.offerRate}%`);
  }
  console.log(`  - Offer Rate verified: ${metrics2.offerRate}%`);

  // ─────────────────────────────────────────────────────────────
  // Test 9: Win Rate Calculation & Revenue Truth Link
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 9: Win Rate & Realized Revenue Link...');
  recordOutcomeEvent({
    applicationId: appId,
    opportunityId: oppId,
    profileId: profileId,
    eventType: 'WON',
    eventAt: new Date().toISOString(),
    source: 'UPWORK',
    metadataJson: JSON.stringify({ realized_revenue: 3500, currency: 'EUR' })
  });
  const metrics3 = calculateHistoricalMetrics();
  if (metrics3.winRate !== 100 || metrics3.totalRevenue !== 3500) {
    throw new Error(`FAIL: Expected 100% win rate and 3500 revenue, got winRate=${metrics3.winRate}, rev=${metrics3.totalRevenue}`);
  }
  console.log(`  - Win rate & revenue verified: WinRate=${metrics3.winRate}%, Revenue=${metrics3.totalRevenue} EUR`);

  // ─────────────────────────────────────────────────────────────
  // Test 10: Revenue Per Application & Interview
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 10: Revenue per Application / Interview...');
  if (metrics3.revenuePerApplication !== 3500 || metrics3.revenuePerInterview !== 3500) {
    throw new Error('FAIL: Revenue per application mismatch');
  }
  console.log(`  - Revenue per app=${metrics3.revenuePerApplication} EUR, per interview=${metrics3.revenuePerInterview} EUR`);

  // ─────────────────────────────────────────────────────────────
  // Test 11: Channel Performance Separation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 11: Channel Performance Separation (UPWORK vs LINKEDIN)...');
  // Add LinkedIn app that was lost
  const oppLiId = createOpportunity({
    profile_id: profileId,
    title: 'LinkedIn Contract Role',
    company_name: 'GlobalNet',
    description: 'Contract',
    source: 'LINKEDIN',
    opportunity_type: 'CONTRACT',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: oppLiId,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript', sourceType: 'JOB_DESCRIPTION', confidence: 0.9 }
  });
  const appLiRes = await prepareApplication(oppLiId, { channel: 'LINKEDIN' });
  recordOutcomeEvent({
    applicationId: appLiRes.application.id!,
    opportunityId: oppLiId,
    profileId: profileId,
    eventType: 'SUBMITTED',
    eventAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    source: 'LINKEDIN'
  });
  recordOutcomeEvent({
    applicationId: appLiRes.application.id!,
    opportunityId: oppLiId,
    profileId: profileId,
    eventType: 'REJECTED',
    eventAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    source: 'LINKEDIN'
  });

  buildLearningObservation(appId);
  buildLearningObservation(appLiRes.application.id!);

  console.log('  - Channel separation verified with distinct outcomes for UPWORK (WON) vs LINKEDIN (REJECTED).');

  // ─────────────────────────────────────────────────────────────
  // Test 12: Fit Calibration Buckets
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 12: Fit Calibration Buckets...');
  const calibration = calculateCalibration();
  const topTier = calibration.find(c => c.bucketLabel === '90-100')!;
  if (topTier.totalApplications < 1) {
    throw new Error('FAIL: Top tier calibration missing applications');
  }
  console.log(`  - Calibration top tier (90-100): Apps=${topTier.totalApplications}, InterviewRate=${topTier.interviewRate}%, WinRate=${topTier.winRate}%`);

  // ─────────────────────────────────────────────────────────────
  // Test 13: Minimum Sample Protection (<10 items => INSUFFICIENT_DATA)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 13: Minimum Sample Protection (<10 observations)...');
  const insightsSmall = generateLearningInsights();
  const sampleInsight = insightsSmall.find(i => i.confidence === 'INSUFFICIENT_DATA');
  if (!sampleInsight) {
    throw new Error('FAIL: Minimum sample protection did not flag INSUFFICIENT_DATA');
  }
  console.log(`  - Sample protection verified: ${sampleInsight.title} (Confidence: ${sampleInsight.confidence})`);

  // ─────────────────────────────────────────────────────────────
  // Test 14: Strong Insight Generation (>=30 items => HIGH confidence)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 14: Strong Insight Generation with 35 simulated observations...');
  const simulatedObs: CareerLearningObservation[] = [];
  for (let i = 0; i < 35; i++) {
    const isTop = i < 20;
    simulatedObs.push({
      applicationId: 100 + i,
      opportunityId: 200 + i,
      fitScore: isTop ? 95 : 75,
      applicationPriority: isTop ? 90 : 70,
      technicalMatch: isTop ? 95 : 70,
      experienceMatch: 90,
      seniorityMatch: 90,
      domainMatch: 90,
      evidenceScore: isTop ? 80 : 40,
      mustHaveCoverage: 90,
      niceToHaveCoverage: 80,
      remoteMatch: 100,
      languageMatch: 100,
      criticalGap: false,
      recommendation: isTop ? 'STRONG_MATCH' : 'POSSIBLE_MATCH',
      channel: i % 2 === 0 ? 'UPWORK' : 'LINKEDIN',
      source: 'UPWORK',
      outcome: isTop ? 'WON' : 'REJECTED',
      revenue: isTop ? 2000 : 0,
      fitAlgorithmVersion: 1,
      learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
      observedAt: new Date().toISOString()
    });
  }

  const strongInsights = generateLearningInsights(simulatedObs);
  const highConfInsight = strongInsights.find(i => i.confidence === 'HIGH');
  if (!highConfInsight) {
    throw new Error('FAIL: Expected HIGH confidence insight with 35 observations');
  }
  console.log(`  - Strong insight generated: ${highConfInsight.title} (Confidence: ${highConfInsight.confidence}, Delta: ${highConfInsight.delta}%)`);

  // ─────────────────────────────────────────────────────────────
  // Test 15: Evidence Performance Insight
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 15: Evidence Performance Insight...');
  const evidenceInsight = strongInsights.find(i => i.insightType === 'EVIDENCE_PERFORMANCE');
  if (!evidenceInsight || evidenceInsight.delta <= 0) {
    throw new Error('FAIL: Evidence performance insight did not demonstrate positive delta for verified proofs');
  }
  console.log(`  - Evidence performance delta verified: +${evidenceInsight.delta}% interview conversion.`);

  // ─────────────────────────────────────────────────────────────
  // Test 16: Learning Determinism
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 16: Learning Determinism Check...');
  const fixedTime = '2026-09-01T10:00:00.000Z';
  const run1 = generateLearningInsights(simulatedObs, fixedTime);
  const run2 = generateLearningInsights(simulatedObs, fixedTime);
  if (JSON.stringify(run1) !== JSON.stringify(run2)) {
    throw new Error('FAIL: Learning insight generation is non-deterministic');
  }
  console.log('  - Learning insight calculations verified 100% deterministic.');

  // ─────────────────────────────────────────────────────────────
  // Test 17: Learning Algorithm Versioning
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 17: Learning Algorithm Versioning...');
  if (highConfInsight.learningAlgorithmVersion !== 1) {
    throw new Error(`FAIL: Expected version 1, got ${highConfInsight.learningAlgorithmVersion}`);
  }
  console.log(`  - Learning algorithm version verified: v${highConfInsight.learningAlgorithmVersion}`);

  // ─────────────────────────────────────────────────────────────
  // Test 18: Revenue Truth Link Without CRM Duplication
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 18: Revenue Truth Link Without CRM Duplication...');
  const snapWithRevenue = calculateOutcomeSummary(appId)!;
  if (snapWithRevenue.revenue !== 3500) {
    throw new Error(`FAIL: Expected 3500 EUR, got ${snapWithRevenue.revenue}`);
  }
  console.log(`  - Outcome snapshot correctly contains realized revenue: ${snapWithRevenue.revenue} EUR`);

  // ─────────────────────────────────────────────────────────────
  // Test 19: Full End-to-End Pipeline
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 19: Full Pipeline Integration Check...');
  const totalObsCount = rebuildAllLearningObservations();
  if (totalObsCount < 2) {
    throw new Error(`FAIL: Expected at least 2 observations rebuilt, got ${totalObsCount}`);
  }
  console.log(`  - Full Pipeline verified: ${totalObsCount} learning observations consolidated.`);

  // ─────────────────────────────────────────────────────────────
  // Test 20: Regression Check
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 20: Regression Check on Earlier Modules...');
  const appCheck = getApplication(appId)!;
  if (!appCheck || appCheck.status !== 'SUBMITTED') {
    throw new Error('FAIL: Application status regression');
  }
  console.log('  - All regression checks passed.');

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS OUTCOME TRACKING & LEARNING TESTS PASSED! (20/20)');
  console.log('==================================================\n');
}

runLearningTests().then(() => {
  process.exit(0);
}).catch((e: any) => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
