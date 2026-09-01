import { getDb } from '../storage/db';
import {
  CareerAction,
  CareerExecutionPolicy,
  CareerActionPriority,
  CareerOpportunity
} from '../types';
import { getOpportunity } from './careerOpportunities';
import { getApplicationForOpportunity } from './careerApplications';
import { getProposalForApplication } from './careerProposals';
import { calculateOutcomeSummary } from './careerOutcomes';

export const DEFAULT_EXECUTION_POLICY: CareerExecutionPolicy = {
  minFitScoreForApplication: 80,
  imminentDeadlineHours: 48,
  followUpDaysInterval: 7,
  blockOnCriticalGap: true,
  requireApprovalForSubmit: true,
  requireApprovalForFollowUp: true
};

export function evaluatePoliciesForOpportunity(
  opportunityId: number,
  policy: CareerExecutionPolicy = DEFAULT_EXECUTION_POLICY
): CareerAction[] {
  const opp = getOpportunity(opportunityId);
  if (!opp) return [];

  const actions: CareerAction[] = [];
  const now = new Date();
  const app = getApplicationForOpportunity(opportunityId);

  // 1. Deadline Imminent (< 48h) or Expired
  if (opp.deadline) {
    const dlDate = new Date(opp.deadline);
    const diffHours = (dlDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) {
      actions.push({
        profileId: opp.profile_id,
        opportunityId: opp.id,
        applicationId: app?.id,
        actionType: 'ARCHIVE_OPPORTUNITY',
        status: 'SUGGESTED',
        priority: 'MEDIUM',
        reason: `Deadline expired on ${opp.deadline}`,
        source: 'DEADLINE_RULE',
        algorithmVersion: 1
      });
    } else if (diffHours <= policy.imminentDeadlineHours) {
      actions.push({
        profileId: opp.profile_id,
        opportunityId: opp.id,
        applicationId: app?.id,
        actionType: 'SCHEDULE_REVIEW',
        status: 'SUGGESTED',
        priority: 'CRITICAL',
        reason: `Imminent deadline in ${Math.round(diffHours)} hours for ${opp.company_name}`,
        source: 'DEADLINE_RULE',
        algorithmVersion: 1,
        scheduledFor: now.toISOString()
      });
    }
  }

  // 2. Critical Gap Safety Check
  if (opp.critical_gap) {
    actions.push({
      profileId: opp.profile_id,
      opportunityId: opp.id,
      applicationId: app?.id,
      actionType: 'REVIEW_OPPORTUNITY',
      status: 'SUGGESTED',
      priority: 'HIGH',
      reason: 'Critical technical gap identified; missing core must-have requirements.',
      source: 'FIT_ENGINE',
      algorithmVersion: 1
    });
    return actions; // Block further application proposals if critical gap exists
  }

  // 3. High Fit Without Application
  if ((opp.fit_score ?? 0) >= policy.minFitScoreForApplication && !app) {
    actions.push({
      profileId: opp.profile_id,
      opportunityId: opp.id,
      actionType: 'CREATE_APPLICATION',
      status: 'PENDING_APPROVAL',
      priority: (opp.fit_score ?? 0) >= 90 ? 'CRITICAL' : 'HIGH',
      reason: `High fit score (${opp.fit_score}%) with strong candidate compatibility.`,
      source: 'FIT_ENGINE',
      algorithmVersion: 1
    });
  }

  // 4. Application & Proposal Ready for Human Submission
  if (app) {
    const proposal = getProposalForApplication(app.id!);
    
    if (proposal && proposal.proposal_status === 'BLOCKED') {
      actions.push({
        profileId: opp.profile_id,
        opportunityId: opp.id,
        applicationId: app.id,
        actionType: 'REVIEW_PROPOSAL',
        status: 'PENDING_APPROVAL',
        priority: 'HIGH',
        reason: 'Proposal Guard flagged unsupported skills or unverified claims in proposal.',
        source: 'SYSTEM',
        algorithmVersion: 1
      });
    } else if (app.status === 'READY' && (!proposal || proposal.proposal_status === 'VALIDATED' || proposal.proposal_status === 'READY')) {
      actions.push({
        profileId: opp.profile_id,
        opportunityId: opp.id,
        applicationId: app.id,
        actionType: 'SUBMIT_APPLICATION',
        status: 'PENDING_APPROVAL',
        priority: (opp.fit_score ?? 0) >= 90 ? 'CRITICAL' : 'HIGH',
        reason: 'Application verified and proposal validated. Ready for human review and dispatch.',
        source: 'SYSTEM',
        algorithmVersion: 1
      });
    }

    // 5. Follow-Up Overdue (Submitted for >= 7 days with no response)
    const summary = calculateOutcomeSummary(app.id!);
    if (summary && summary.submitted && !summary.responseReceived && !summary.lost && !summary.won) {
      if (app.submitted_at) {
        const submittedDate = new Date(app.submitted_at);
        const daysPassed = (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysPassed >= policy.followUpDaysInterval) {
          actions.push({
            profileId: opp.profile_id,
            opportunityId: opp.id,
            applicationId: app.id,
            actionType: 'FOLLOW_UP',
            status: 'PENDING_APPROVAL',
            priority: 'MEDIUM',
            reason: `No response received after ${Math.round(daysPassed)} days since submission.`,
            source: 'OUTCOME_EVENT',
            algorithmVersion: 1
          });
        }
      }
    }

    // 6. Outcome Available for Learning Review
    if (summary && (summary.won || summary.lost || summary.offerReceived)) {
      actions.push({
        profileId: opp.profile_id,
        opportunityId: opp.id,
        applicationId: app.id,
        actionType: 'REVIEW_OUTCOME',
        status: 'SUGGESTED',
        priority: 'LOW',
        reason: `Application reached terminal outcome (${summary.finalOutcome}). Available for learning feedback.`,
        source: 'LEARNING_ENGINE',
        algorithmVersion: 1
      });
    }
  }

  return actions;
}
