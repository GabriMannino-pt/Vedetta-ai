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
  createAction,
  getAction,
  listActions,
  updateActionStatus,
  getActionAudit,
  getPendingActions,
  getScheduledActions,
  canTransitionAction
} from '../career/careerActions';
import { evaluatePoliciesForOpportunity } from '../career/executionPolicy';
import { getNextAction, getNextActions, prioritizeNextActions } from '../career/nextActionEngine';
import {
  generateScheduledActions,
  getDueActions,
  expireOverdueActions,
  refreshCareerQueue
} from '../career/careerScheduler';
import { validateActionExecution } from '../career/executionGuard';
import { approveAction, rejectAction, cancelAction, requestApproval } from '../career/humanApproval';
import { executeApplicationAction } from '../career/applicationExecutionAdapter';
import { calculateExecutionMetrics } from '../career/careerExecutionMetrics';
import { getApplication } from '../career/careerApplications';

async function runExecutionTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS EXECUTION ENGINE & ACTION AUDIT TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset clean tables
  db.prepare('DELETE FROM career_action_audit').run();
  db.prepare('DELETE FROM career_actions').run();
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

  // Setup Base Profile & Skill
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'Senior Full Stack & AI Systems Architect',
    summary: 'Expert in TypeScript and AI Orchestration',
    years_experience: 6,
    seniority: 'SENIOR',
    target_salary_min: 60000,
    target_salary_max: 80000,
    target_hourly_rate: 60,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Scale AI execution systems'
  });

  const tsSkillId = addSkill({
    profile_id: profileId,
    skill: 'TypeScript',
    category: 'PROGRAMMING',
    level: 'EXPERT',
    years_experience: 5,
    confidence: 'HIGH'
  });

  const oppId = createOpportunity({
    profile_id: profileId,
    title: 'Senior TypeScript Architect',
    company_name: 'Alpha Systems',
    description: 'TypeScript core developer needed',
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

  // ─────────────────────────────────────────────────────────────
  // Action Lifecycle Tests (1-10)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Action Creation...');
  const action1Id = createAction({
    profileId,
    opportunityId: oppId,
    actionType: 'REVIEW_OPPORTUNITY',
    status: 'SUGGESTED',
    priority: 'HIGH',
    reason: 'Initial review suggested',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const act1 = getAction(action1Id);
  if (!act1 || act1.status !== 'SUGGESTED') {
    throw new Error('FAIL: Action 1 not created properly');
  }
  console.log(`  - Action created: ID=${action1Id}, Type=${act1.actionType}, Status=${act1.status}`);

  console.log('\nTest 2: Valid State Transition (SUGGESTED -> PENDING_APPROVAL)...');
  updateActionStatus(action1Id, 'PENDING_APPROVAL', 'USER', 'Moved to pending approval');
  const act1Updated = getAction(action1Id)!;
  if (act1Updated.status !== 'PENDING_APPROVAL') {
    throw new Error('FAIL: Valid transition failed');
  }
  console.log(`  - State transition verified: ${act1Updated.status}`);

  console.log('\nTest 3: Invalid State Transition Rejection (PENDING_APPROVAL -> COMPLETED without APPROVED)...');
  let threw = false;
  try {
    updateActionStatus(action1Id, 'COMPLETED', 'USER', 'Invalid skip');
  } catch (e: any) {
    threw = true;
  }
  if (!threw) {
    throw new Error('FAIL: Invalid transition was not rejected');
  }
  console.log('  - Invalid transition blocked deterministically.');

  console.log('\nTest 4: Append-Only Audit Trail...');
  const audits = getActionAudit(action1Id);
  if (audits.length !== 2 || audits[1].newStatus !== 'PENDING_APPROVAL') {
    throw new Error(`FAIL: Audit trail mismatch, count=${audits.length}`);
  }
  console.log(`  - Audit records verified: ${audits.length} events logged.`);

  console.log('\nTest 5: Human Approval Transition (PENDING_APPROVAL -> APPROVED)...');
  approveAction(action1Id, 'USER', 'Looks good to execute');
  const act1Approved = getAction(action1Id)!;
  if (act1Approved.status !== 'APPROVED' || !act1Approved.approvedAt) {
    throw new Error('FAIL: Approve transition failed');
  }
  console.log(`  - Approved transition verified: Status=${act1Approved.status}, ApprovedAt=${act1Approved.approvedAt}`);

  console.log('\nTest 6: Action Rejection...');
  const action2Id = createAction({
    profileId,
    opportunityId: oppId,
    actionType: 'CREATE_APPLICATION',
    status: 'PENDING_APPROVAL',
    priority: 'MEDIUM',
    reason: 'Test rejection',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  rejectAction(action2Id, 'USER', 'Not relevant at this time');
  const act2 = getAction(action2Id)!;
  if (act2.status !== 'REJECTED') {
    throw new Error('FAIL: Action rejection failed');
  }
  console.log('  - Rejection verified.');

  console.log('\nTest 7: Action Cancellation...');
  const action3Id = createAction({
    profileId,
    opportunityId: oppId,
    actionType: 'SCHEDULE_REVIEW',
    status: 'APPROVED',
    priority: 'LOW',
    reason: 'Test cancellation',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  cancelAction(action3Id, 'USER', 'User cancelled');
  const act3 = getAction(action3Id)!;
  if (act3.status !== 'CANCELLED') {
    throw new Error('FAIL: Action cancellation failed');
  }
  console.log('  - Cancellation verified.');

  console.log('\nTest 8: Action Completion via Execution Adapter...');
  const action4Id = createAction({
    profileId,
    opportunityId: oppId,
    actionType: 'REVIEW_OPPORTUNITY',
    status: 'APPROVED',
    priority: 'HIGH',
    reason: 'Review complete test',
    source: 'USER',
    algorithmVersion: 1
  });
  const execRes = await executeApplicationAction(action4Id, 'USER');
  const act4 = getAction(action4Id)!;
  if (act4.status !== 'COMPLETED' || !execRes.success) {
    throw new Error('FAIL: Action completion failed');
  }
  console.log(`  - Action completion verified: Status=${act4.status}, Mode=${execRes.mode}`);

  console.log('\nTest 9: Action Failure Handling in Execution Guard...');
  const tempOppId = createOpportunity({
    profile_id: profileId,
    title: 'Temp Opp',
    company_name: 'TempCo',
    description: 'Temp',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  const action5Id = createAction({
    profileId,
    opportunityId: tempOppId,
    actionType: 'SUBMIT_APPLICATION',
    status: 'APPROVED',
    priority: 'HIGH',
    reason: 'Non-existent opp test',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  db.prepare('DELETE FROM career_opportunities WHERE id = ?').run(tempOppId);
  let execFailed = false;
  try {
    await executeApplicationAction(action5Id, 'USER');
  } catch (e: any) {
    execFailed = true;
  }
  const act5 = getAction(action5Id)!;
  if (!execFailed || act5.status !== 'FAILED') {
    throw new Error('FAIL: Action failure not handled properly');
  }
  console.log(`  - Action failure handled correctly: Status=${act5.status}`);

  console.log('\nTest 10: Action Expiration...');
  const expiredOppId = createOpportunity({
    profile_id: profileId,
    title: 'Expired Role',
    company_name: 'Past Corp',
    description: 'Role expired yesterday',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    deadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    status: 'NEW'
  });
  const actionExpId = createAction({
    profileId,
    opportunityId: expiredOppId,
    actionType: 'REVIEW_OPPORTUNITY',
    status: 'SUGGESTED',
    priority: 'MEDIUM',
    reason: 'Review expired role',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const expCount = expireOverdueActions();
  const actExp = getAction(actionExpId)!;
  if (actExp.status !== 'EXPIRED' || expCount < 1) {
    throw new Error('FAIL: Overdue action did not expire');
  }
  console.log(`  - Action expiration verified: Status=${actExp.status}, ExpiredCount=${expCount}`);

  // ─────────────────────────────────────────────────────────────
  // Policy Engine Tests (11-18)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 11: High-Fit Policy (fitScore >= 80, no app -> CREATE_APPLICATION)...');
  const { evaluateAndPersistFit } = require('../career/fitScorer');
  evaluateAndPersistFit(oppId);
  const policiesOpp = evaluatePoliciesForOpportunity(oppId);
  const createAct = policiesOpp.find(a => a.actionType === 'CREATE_APPLICATION');
  if (!createAct) {
    throw new Error('FAIL: Expected CREATE_APPLICATION policy action for high-fit opportunity');
  }
  console.log(`  - High-fit policy verified: Action=${createAct.actionType}, Priority=${createAct.priority}`);

  console.log('\nTest 12: Proposal Ready Policy -> SUBMIT_APPLICATION with requiresApproval...');
  setProposalMockMode(true, 'Hi Alpha Systems, I have 5 years experience in TypeScript.');
  const appResult = await prepareApplication(oppId, { channel: 'UPWORK' });
  const policiesReady = evaluatePoliciesForOpportunity(oppId);
  const submitAct = policiesReady.find(a => a.actionType === 'SUBMIT_APPLICATION');
  if (!submitAct || submitAct.status !== 'PENDING_APPROVAL') {
    throw new Error('FAIL: Expected SUBMIT_APPLICATION with PENDING_APPROVAL');
  }
  console.log(`  - Proposal ready policy verified: Action=${submitAct.actionType}, Status=${submitAct.status}`);

  console.log('\nTest 13: Proposal Blocked Policy -> REVIEW_PROPOSAL...');
  const oppBlockedId = createOpportunity({
    profile_id: profileId,
    title: 'Ruby Lead',
    company_name: 'RubyCo',
    description: 'Ruby required',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'LEAD',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: oppBlockedId,
    name: 'Ruby',
    normalizedName: 'ruby',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Ruby required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  setProposalMockMode(true, 'I have 10 years experience in Ruby.');
  const appBlockedRes = await prepareApplication(oppBlockedId);
  const policiesBlocked = evaluatePoliciesForOpportunity(oppBlockedId);
  const reviewPropAct = policiesBlocked.find(a => a.actionType === 'REVIEW_PROPOSAL' || a.actionType === 'REVIEW_OPPORTUNITY');
  if (!reviewPropAct) {
    throw new Error('FAIL: Expected review action for blocked/gap opportunity');
  }
  console.log(`  - Blocked/Gap policy verified: Action=${reviewPropAct.actionType}`);

  console.log('\nTest 14: Critical Gap Policy -> REVIEW_OPPORTUNITY...');
  const oppCritId = createOpportunity({
    profile_id: profileId,
    title: 'Rust Engineer',
    company_name: 'RustLab',
    description: 'Rust required',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: oppCritId,
    name: 'Rust',
    normalizedName: 'rust',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'Rust required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  evaluateAndPersistFit(oppCritId);
  const policiesCrit = evaluatePoliciesForOpportunity(oppCritId);
  const critAct = policiesCrit.find(a => a.actionType === 'REVIEW_OPPORTUNITY');
  if (!critAct) {
    throw new Error('FAIL: Expected REVIEW_OPPORTUNITY for critical gap');
  }
  console.log(`  - Critical gap policy verified: Action=${critAct.actionType}`);

  console.log('\nTest 15: Imminent Deadline Policy (<48h -> CRITICAL SCHEDULE_REVIEW)...');
  const oppDlId = createOpportunity({
    profile_id: profileId,
    title: 'Fast Deadline Role',
    company_name: 'SpeedCo',
    description: 'Expiring in 24 hours',
    source: 'UPWORK',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: 'NEW'
  });
  addRequirement({
    opportunityId: oppDlId,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  evaluateAndPersistFit(oppDlId);
  const policiesDl = evaluatePoliciesForOpportunity(oppDlId);
  const dlAct = policiesDl.find(a => a.actionType === 'SCHEDULE_REVIEW' && a.priority === 'CRITICAL');
  if (!dlAct) {
    throw new Error('FAIL: Expected CRITICAL SCHEDULE_REVIEW for imminent deadline');
  }
  console.log(`  - Deadline policy verified: Action=${dlAct.actionType}, Priority=${dlAct.priority}`);

  console.log('\nTest 16: Expired Deadline Policy -> ARCHIVE_OPPORTUNITY...');
  const policiesExp = evaluatePoliciesForOpportunity(expiredOppId);
  const expAct = policiesExp.find(a => a.actionType === 'ARCHIVE_OPPORTUNITY');
  if (!expAct) {
    throw new Error('FAIL: Expected ARCHIVE_OPPORTUNITY for expired deadline');
  }
  console.log(`  - Expired deadline policy verified: Action=${expAct.actionType}`);

  console.log('\nTest 17: Follow-Up Overdue Policy...');
  // Record submission on app 8 days ago
  db.prepare('UPDATE career_applications SET submitted_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 8 * 86400000).toISOString(), appResult.application.id);
  recordOutcomeEvent({
    applicationId: appResult.application.id!,
    opportunityId: oppId,
    profileId,
    eventType: 'SUBMITTED',
    eventAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    source: 'UPWORK'
  });
  const policiesFollowUp = evaluatePoliciesForOpportunity(oppId);
  const followUpAct = policiesFollowUp.find(a => a.actionType === 'FOLLOW_UP');
  if (!followUpAct) {
    throw new Error('FAIL: Expected FOLLOW_UP policy action after 8 days of submission');
  }
  console.log(`  - Follow-up policy verified: Action=${followUpAct.actionType}, Priority=${followUpAct.priority}`);

  console.log('\nTest 18: Outcome Available Policy -> REVIEW_OUTCOME...');
  recordOutcomeEvent({
    applicationId: appResult.application.id!,
    opportunityId: oppId,
    profileId,
    eventType: 'RESPONSE_RECEIVED',
    eventAt: new Date().toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: appResult.application.id!,
    opportunityId: oppId,
    profileId,
    eventType: 'INTERVIEW_INVITED',
    eventAt: new Date().toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: appResult.application.id!,
    opportunityId: oppId,
    profileId,
    eventType: 'OFFER_RECEIVED',
    eventAt: new Date().toISOString(),
    source: 'UPWORK'
  });
  recordOutcomeEvent({
    applicationId: appResult.application.id!,
    opportunityId: oppId,
    profileId,
    eventType: 'WON',
    eventAt: new Date().toISOString(),
    source: 'UPWORK',
    metadataJson: JSON.stringify({ realized_revenue: 6000, currency: 'EUR' })
  });
  const policiesOutcome = evaluatePoliciesForOpportunity(oppId);
  const reviewOutcomeAct = policiesOutcome.find(a => a.actionType === 'REVIEW_OUTCOME');
  if (!reviewOutcomeAct) {
    throw new Error('FAIL: Expected REVIEW_OUTCOME after WON outcome event');
  }
  console.log(`  - Review outcome policy verified: Action=${reviewOutcomeAct.actionType}`);

  // ─────────────────────────────────────────────────────────────
  // Safety & Execution Guard Tests (19-23)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 19: Submit without approval blocked by Execution Guard...');
  const unapprovedSubmitActId = createAction({
    profileId,
    opportunityId: oppId,
    applicationId: appResult.application.id,
    actionType: 'SUBMIT_APPLICATION',
    status: 'PENDING_APPROVAL',
    priority: 'HIGH',
    reason: 'Unapproved submit test',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const guardRes1 = validateActionExecution(unapprovedSubmitActId);
  if (guardRes1.valid) {
    throw new Error('FAIL: Execution guard should have blocked unapproved submit');
  }
  console.log(`  - Guard blocked unapproved submit: ${guardRes1.reasons.join(', ')}`);

  console.log('\nTest 20: Submit with critical gap blocked by Execution Guard...');
  const critGapSubmitActId = createAction({
    profileId,
    opportunityId: oppCritId,
    actionType: 'SUBMIT_APPLICATION',
    status: 'APPROVED',
    priority: 'HIGH',
    reason: 'Critical gap submit test',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const guardRes2 = validateActionExecution(critGapSubmitActId);
  if (guardRes2.valid) {
    throw new Error('FAIL: Execution guard should have blocked submit on critical gap');
  }
  console.log(`  - Guard blocked critical gap submit: ${guardRes2.reasons.join(', ')}`);

  console.log('\nTest 21: Submit with blocked proposal blocked by Execution Guard...');
  const blockedPropSubmitActId = createAction({
    profileId,
    opportunityId: oppBlockedId,
    applicationId: appBlockedRes.application.id,
    actionType: 'SUBMIT_APPLICATION',
    status: 'APPROVED',
    priority: 'HIGH',
    reason: 'Blocked prop submit test',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const guardRes3 = validateActionExecution(blockedPropSubmitActId);
  if (guardRes3.valid) {
    throw new Error('FAIL: Execution guard should have blocked submit on blocked proposal');
  }
  console.log(`  - Guard blocked submit on blocked proposal: ${guardRes3.reasons.join(', ')}`);

  console.log('\nTest 22: Execution Guard blocks archived opportunity action...');
  db.prepare("UPDATE career_opportunities SET status = 'ARCHIVED' WHERE id = ?").run(expiredOppId);
  const archivedActId = createAction({
    profileId,
    opportunityId: expiredOppId,
    actionType: 'SUBMIT_APPLICATION',
    status: 'APPROVED',
    priority: 'HIGH',
    reason: 'Archived opp test',
    source: 'SYSTEM',
    algorithmVersion: 1
  });
  const guardRes4 = validateActionExecution(archivedActId);
  if (guardRes4.valid) {
    throw new Error('FAIL: Execution guard should have blocked action on archived opportunity');
  }
  console.log(`  - Guard blocked archived opportunity: ${guardRes4.reasons.join(', ')}`);

  console.log('\nTest 23: External execution produces HUMAN_HANDOFF and NEVER falsifies SUBMITTED...');
  // Fresh opportunity for valid submission approval
  const oppHandoffId = createOpportunity({
    profile_id: profileId,
    title: 'Handoff Full Stack Lead',
    company_name: 'NextGen AI',
    description: 'TypeScript leader',
    source: 'UPWORK',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Remote',
    remote_type: 'REMOTE',
    status: 'NEW'
  });
  addRequirement({
    opportunityId: oppHandoffId,
    name: 'TypeScript',
    normalizedName: 'typescript',
    category: 'TECHNICAL',
    priority: 'MUST_HAVE',
    evidence: { sourceText: 'TypeScript required', sourceType: 'JOB_DESCRIPTION', confidence: 0.95 }
  });
  setProposalMockMode(true, 'Hi NextGen AI, I have 5 years TypeScript expertise.');
  const appHandoff = await prepareApplication(oppHandoffId, { channel: 'UPWORK' });
  
  const submitActionId = createAction({
    profileId,
    opportunityId: oppHandoffId,
    applicationId: appHandoff.application.id,
    actionType: 'SUBMIT_APPLICATION',
    status: 'PENDING_APPROVAL',
    priority: 'HIGH',
    reason: 'Valid proposal ready for handoff',
    source: 'SYSTEM',
    algorithmVersion: 1
  });

  approveAction(submitActionId, 'USER', 'Approved for human handoff');
  const handoffRes = await executeApplicationAction(submitActionId, 'USER');

  const appAfterExecution = getApplication(appHandoff.application.id!)!;
  if (handoffRes.mode !== 'HUMAN_HANDOFF' || handoffRes.status !== 'READY_FOR_HUMAN_SUBMISSION') {
    throw new Error(`FAIL: Expected HUMAN_HANDOFF mode, got ${handoffRes.mode}`);
  }
  if (appAfterExecution.status === 'SUBMITTED') {
    throw new Error('CRITICAL FAIL: Execution adapter must NEVER falsely mark application as SUBMITTED!');
  }
  console.log(`  - Zero auto-submit verified: Mode=${handoffRes.mode}, ApplicationStatus remains=${appAfterExecution.status}`);

  // ─────────────────────────────────────────────────────────────
  // Determinism & Scheduler Tests (24-25)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 24: Deterministic Policy Evaluation...');
  const runP1 = evaluatePoliciesForOpportunity(oppHandoffId);
  const runP2 = evaluatePoliciesForOpportunity(oppHandoffId);
  if (JSON.stringify(runP1) !== JSON.stringify(runP2)) {
    throw new Error('FAIL: Policy engine is non-deterministic');
  }
  console.log('  - Policy evaluation verified 100% deterministic.');

  console.log('\nTest 25: Scheduler Idempotency (no duplicate actions generated)...');
  const run1Created = generateScheduledActions();
  const run2Created = generateScheduledActions();
  if (run2Created !== 0) {
    throw new Error(`FAIL: Scheduler created duplicate actions on rerun (${run2Created} created)`);
  }
  console.log(`  - Scheduler idempotency verified: Run 1 created=${run1Created}, Run 2 created=${run2Created}`);

  // Verify Metrics Calculation
  const metrics = calculateExecutionMetrics();
  console.log(`\nExecution Metrics: Approved=${metrics.actionsApproved}, Completed=${metrics.actionsCompleted}, ApprovalRate=${metrics.approvalRate}%`);

  console.log('\n==================================================');
  console.log('✅ ALL CAREER OS EXECUTION & HUMAN-IN-THE-LOOP TESTS PASSED! (25/25)');
  console.log('==================================================\n');
}

runExecutionTests().then(() => {
  process.exit(0);
}).catch((e: any) => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
