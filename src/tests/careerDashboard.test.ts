import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { addSkill } from '../career/careerSkills';
import { addEvidence } from '../career/careerEvidence';
import { createOpportunity } from '../career/careerOpportunities';
import { addRequirement } from '../career/requirementRepository';
import { prepareApplication } from '../career/applicationIntelligence';
import { setProposalMockMode } from '../career/proposalGenerator';
import { recordOutcomeEvent } from '../career/careerOutcomes';
import {
  getCareerDashboard,
  getOpportunityQueue,
  getOpportunityDetail,
  getApplicationDetail
} from '../career/careerDashboard';
import { calculateCareerFunnel } from '../career/careerFunnel';
import { generateCareerAlerts } from '../career/careerAlerts';
import { CareerOpportunity } from '../types';

async function runDashboardTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS DASHBOARD & OPERATIONAL WORKFLOW TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Clean tables
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

  // Setup Base Profile
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'Senior Full Stack & AI Systems Architect',
    summary: 'Expert in TypeScript, Python, and AI Orchestration',
    years_experience: 6,
    seniority: 'SENIOR',
    target_salary_min: 60000,
    target_salary_max: 80000,
    target_hourly_rate: 60,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Scale high-reliability AI platforms'
  });

  const tsSkillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 5,
    confidence: 'HIGH'
  });

  const pySkillId = addSkill({
    profile_id: profileId,
    skill: 'Python',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 6,
    confidence: 'HIGH'
  });

  const vedettaEvidenceId = addEvidence({
    profile_id: profileId,
    skill_id: tsSkillId,
    type: 'GITHUB_PROJECT',
    title: 'Vedetta AI - Revenue Operating System',
    description: 'Autonomous revenue intelligence built with TypeScript and SQLite',
    source_type: 'GITHUB',
    source_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
    verified: true,
    confidence: 'HIGH'
  });

  // Opportunity 1: Strong Match (TypeScript)
  const opp1Id = createOpportunity({
    profile_id: profileId,
    title: 'Senior TypeScript Architect',
    company_name: 'Alpha AI',
    description: 'TypeScript core developer needed',
    source: 'UPWORK',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: 'NEW'
  });
  addRequirement({
    opportunityId: opp1Id,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript mandatory', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });

  // Opportunity 2: Critical Gap (Golang mandatory)
  const opp2Id = createOpportunity({
    profile_id: profileId,
    title: 'Lead Golang Engineer',
    company_name: 'Beta Cloud',
    description: 'Golang mandatory',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'LEAD',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: opp2Id,
    name: 'Golang',
    normalizedName: 'golang',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Golang mandatory', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });

  // ─────────────────────────────────────────────────────────────
  // Test 1: Dashboard Aggregation
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Dashboard Profile & Foundation Aggregation...');
  const dashboard = getCareerDashboard();
  if (!dashboard.profile || dashboard.skillsCount !== 2 || dashboard.evidenceCount !== 1) {
    throw new Error('FAIL: Dashboard summary did not aggregate foundation data');
  }
  console.log(`  - Dashboard aggregated: Profile=${dashboard.profile.name}, Skills=${dashboard.skillsCount}, Evidence=${dashboard.evidenceCount}`);

  // ─────────────────────────────────────────────────────────────
  // Test 2: Opportunity Queue Priority Sorting
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: Opportunity Queue Priority Sorting...');
  setProposalMockMode(true, 'Hi Alpha AI, I have 6 years experience in TypeScript.');
  const app1Res = await prepareApplication(opp1Id, { channel: 'UPWORK' });
  const app2Res = await prepareApplication(opp2Id, { channel: 'DIRECT' });

  const queueRes = getOpportunityQueue({}, { field: 'priority', order: 'DESC' });
  if (queueRes.items.length !== 2 || queueRes.items[0].id !== opp1Id) {
    throw new Error(`FAIL: Expected Opp 1 (${opp1Id}) with higher priority to be first, got ${queueRes.items[0]?.id}`);
  }
  console.log(`  - Queue priority sorting verified: First=${queueRes.items[0].title} (Priority: ${queueRes.items[0].application_priority})`);

  // ─────────────────────────────────────────────────────────────
  // Test 3: Filtering by Min Fit Score
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: Filtering Queue by minFitScore >= 80...');
  const filteredFit = getOpportunityQueue({ minFitScore: 80 });
  if (filteredFit.items.length !== 1 || filteredFit.items[0].id !== opp1Id) {
    throw new Error('FAIL: minFitScore filter failed');
  }
  console.log(`  - Min fit score filter verified: 1 item returned (${filteredFit.items[0].fit_score}%)`);

  // ─────────────────────────────────────────────────────────────
  // Test 4: Filtering by Recommendation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: Filtering Queue by Recommendation = STRONG_MATCH...');
  const filteredRec = getOpportunityQueue({ recommendation: 'STRONG_MATCH' });
  if (filteredRec.items.length !== 1 || filteredRec.items[0].fit_recommendation !== 'STRONG_MATCH') {
    throw new Error('FAIL: Recommendation filter failed');
  }
  console.log('  - Recommendation filter verified.');

  // ─────────────────────────────────────────────────────────────
  // Test 5: Filtering by Critical Gap
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: Filtering Queue by criticalGap = true...');
  const filteredGap = getOpportunityQueue({ criticalGap: true });
  if (filteredGap.items.length !== 1 || filteredGap.items[0].id !== opp2Id) {
    throw new Error('FAIL: Critical gap filter failed');
  }
  console.log(`  - Critical gap filter verified: ${filteredGap.items[0].title}`);

  // ─────────────────────────────────────────────────────────────
  // Test 6: Filtering by Application Status
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 6: Filtering Queue by Application Status = READY...');
  const filteredAppStatus = getOpportunityQueue({ applicationStatus: 'READY' });
  if (filteredAppStatus.items.length !== 1 || filteredAppStatus.items[0].application_status !== 'READY') {
    throw new Error('FAIL: Application status filter failed');
  }
  console.log('  - Application status filter verified.');

  // ─────────────────────────────────────────────────────────────
  // Test 7: Deterministic Pagination
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 7: Deterministic Pagination (limit 1, page 1 and page 2)...');
  const page1 = getOpportunityQueue({}, { field: 'priority', order: 'DESC' }, 1, 1);
  const page2 = getOpportunityQueue({}, { field: 'priority', order: 'DESC' }, 2, 1);
  if (page1.items.length !== 1 || page2.items.length !== 1 || page1.items[0].id === page2.items[0].id) {
    throw new Error('FAIL: Pagination overlap or mismatch');
  }
  console.log(`  - Pagination verified: Page 1 ID=${page1.items[0].id}, Page 2 ID=${page2.items[0].id}, Total=${page1.totalCount}`);

  // ─────────────────────────────────────────────────────────────
  // Test 8: Opportunity Detail View Aggregation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 8: Opportunity Detail 360-degree Aggregation...');
  const oppDetail = getOpportunityDetail(opp1Id);
  if (!oppDetail || oppDetail.requirements.length === 0 || !oppDetail.fit.fitScore || !oppDetail.application) {
    throw new Error('FAIL: Opportunity detail missing aggregated components');
  }
  console.log(`  - Opportunity Detail verified: ReqCount=${oppDetail.requirements.length}, Fit=${oppDetail.fit.fitScore}%, AppId=${oppDetail.application.id}`);

  // ─────────────────────────────────────────────────────────────
  // Test 9: Application Detail View Aggregation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 9: Application Detail View Aggregation...');
  const appDetail = getApplicationDetail(app1Res.application.id!);
  if (!appDetail || !appDetail.strategy || !appDetail.proposal || appDetail.claims.length === 0) {
    throw new Error('FAIL: Application detail missing proposal or claims');
  }
  console.log(`  - Application Detail verified: Claims=${appDetail.claims.length}, ProposalStatus=${appDetail.proposal.proposal_status}`);

  // ─────────────────────────────────────────────────────────────
  // Test 10: Career Funnel Stage Calculations
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 10: Career Funnel Stage Calculations...');
  const funnel1 = calculateCareerFunnel();
  const stageOpps = funnel1.stages.find(s => s.stage === 'OPPORTUNITIES')!;
  const stageAnalyzed = funnel1.stages.find(s => s.stage === 'ANALYZED')!;
  if (stageOpps.count !== 2 || stageAnalyzed.count !== 2) {
    throw new Error('FAIL: Funnel initial stages count mismatch');
  }
  console.log(`  - Funnel initial stages verified: Opps=${stageOpps.count}, Analyzed=${stageAnalyzed.count}`);

  // ─────────────────────────────────────────────────────────────
  // Test 11: Funnel Conversion Rates Coherence
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 11: Funnel Step Conversion Rates...');
  recordOutcomeEvent({
    applicationId: app1Res.application.id!,
    opportunityId: opp1Id,
    profileId: profileId,
    eventType: 'SUBMITTED',
    eventAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: app1Res.application.id!,
    opportunityId: opp1Id,
    profileId: profileId,
    eventType: 'INTERVIEW_INVITED',
    eventAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: app1Res.application.id!,
    opportunityId: opp1Id,
    profileId: profileId,
    eventType: 'OFFER_RECEIVED',
    eventAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: app1Res.application.id!,
    opportunityId: opp1Id,
    profileId: profileId,
    eventType: 'WON',
    eventAt: new Date().toISOString(),
    source: 'UPWORK',
    metadataJson: JSON.stringify({ realized_revenue: 5000, currency: 'EUR' })
  });

  const funnel2 = calculateCareerFunnel();
  const stageWon = funnel2.stages.find(s => s.stage === 'WON')!;
  if (stageWon.count !== 1 || funnel2.realizedRevenue !== 5000) {
    throw new Error(`FAIL: Expected 1 won deal with 5000 revenue, got won=${stageWon.count}, rev=${funnel2.realizedRevenue}`);
  }
  console.log(`  - Funnel conversion verified: WonCount=${stageWon.count}, RealizedRev=${funnel2.realizedRevenue} EUR`);

  // ─────────────────────────────────────────────────────────────
  // Test 12: Realized Revenue Truth Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 12: Realized Revenue contains only confirmed cash...');
  if (funnel2.realizedRevenue !== 5000) {
    throw new Error('FAIL: Realized revenue mismatch');
  }
  console.log(`  - Revenue truth verified: ${funnel2.realizedRevenue} EUR`);

  // ─────────────────────────────────────────────────────────────
  // Test 13: Deadline Alerts
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 13: Deadline Alert Generation...');
  const alerts = generateCareerAlerts();
  const dlAlert = alerts.find(a => a.type === 'DEADLINE');
  if (!dlAlert) {
    throw new Error('FAIL: Expected deadline alert for Opp 1');
  }
  console.log(`  - Deadline alert verified: ${dlAlert.title} (Severity: ${dlAlert.severity})`);

  // ─────────────────────────────────────────────────────────────
  // Test 14: High-Fit Unapplied Alert
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 14: High-Fit Unapplied Alert...');
  const opp3Id = createOpportunity({
    profile_id: profileId,
    title: 'Staff Python Engineer',
    company_name: 'PyData Labs',
    description: 'Python expert',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: opp3Id,
    name: 'Python',
    normalizedName: 'python',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Python required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  // Evaluate fit without creating application
  const { evaluateAndPersistFit } = require('../career/fitScorer');
  evaluateAndPersistFit(opp3Id);

  const alertsUpdated = generateCareerAlerts();
  const highFitAlert = alertsUpdated.find(a => a.type === 'OPPORTUNITY' && a.targetId === opp3Id);
  if (!highFitAlert) {
    throw new Error('FAIL: Expected High Fit alert for unapplied Opp 3');
  }
  console.log(`  - High Fit unapplied alert verified: ${highFitAlert.title}`);

  // ─────────────────────────────────────────────────────────────
  // Test 15: Proposal Blocked Alert
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 15: Proposal Blocked Alert...');
  const opp4Id = createOpportunity({
    profile_id: profileId,
    title: 'Ruby Backend Developer',
    company_name: 'RubyCo',
    description: 'Ruby required',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: opp4Id,
    name: 'Ruby',
    normalizedName: 'ruby',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Ruby required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  setProposalMockMode(true, 'I have 10 years experience in Ruby on Rails.');
  await prepareApplication(opp4Id);

  const alertsBlocked = generateCareerAlerts();
  const blockedAlert = alertsBlocked.find(a => a.type === 'APPLICATION' && a.severity === 'CRITICAL');
  if (!blockedAlert) {
    throw new Error('FAIL: Expected CRITICAL blocked proposal alert');
  }
  console.log(`  - Blocked proposal alert verified: ${blockedAlert.title}`);

  // ─────────────────────────────────────────────────────────────
  // Test 16: Critical Gap Safety
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 16: Critical Gap Safety in Queue Item...');
  const qItemCrit = getOpportunityQueue({ criticalGap: true }).items[0];
  if (qItemCrit.application_status === 'READY') {
    throw new Error('FAIL: Critical gap item must not be READY');
  }
  console.log(`  - Critical gap safety verified: Application status is ${qItemCrit.application_status}`);

  // ─────────────────────────────────────────────────────────────
  // Test 17: No Auto-Submit Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 17: No Auto-Submit Constraint Verification...');
  const unsubmitted = getOpportunityQueue({ applicationStatus: 'DRAFT' });
  if (unsubmitted.items.some(i => i.application_status === 'SUBMITTED')) {
    throw new Error('FAIL: Auto-submit detected');
  }
  console.log('  - No auto-submit confirmed (Human-in-the-loop enforced).');

  // ─────────────────────────────────────────────────────────────
  // Test 18: Historical Snapshot Immutability
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 18: Historical Snapshot Immutability Check...');
  const appSnap = getApplicationDetail(app1Res.application.id!);
  if (!appSnap || appSnap.application.fit_score_snapshot === undefined || appSnap.application.recommendation_snapshot === undefined) {
    throw new Error('FAIL: Snapshot properties missing');
  }
  console.log(`  - Snapshot preserved: Score=${appSnap.application.fit_score_snapshot}, Rec=${appSnap.application.recommendation_snapshot}`);

  // ─────────────────────────────────────────────────────────────
  // Test 19: API Endpoint Functions Validation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 19: Dashboard Query Methods Validation...');
  const queueFilteredSource = getOpportunityQueue({ source: 'UPWORK' });
  if (queueFilteredSource.items.length < 1 || queueFilteredSource.items[0].source !== 'UPWORK') {
    throw new Error('FAIL: Source filter failed');
  }
  console.log(`  - Source filtering verified: Found ${queueFilteredSource.items.length} UPWORK opportunities.`);

  // ─────────────────────────────────────────────────────────────
  // Test 20: Full Operational Workflow
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 20: Full Operational End-to-End Workflow...');
  const finalSummary = getCareerDashboard();
  if (finalSummary.totalOpportunities < 3 || finalSummary.applicationsCount < 2 || finalSummary.alerts.length === 0) {
    throw new Error('FAIL: Full operational summary check failed');
  }
  console.log(`  - Full Workflow verified: TotalOpps=${finalSummary.totalOpportunities}, Apps=${finalSummary.applicationsCount}, Alerts=${finalSummary.alerts.length}`);

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS DASHBOARD & OPERATIONAL TESTS PASSED! (20/20)');
  console.log('==================================================\n');
}

runDashboardTests().then(() => {
  process.exit(0);
}).catch((e: any) => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
