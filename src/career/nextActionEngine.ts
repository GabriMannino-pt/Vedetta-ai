import {
  CareerNextAction,
  CareerActionPriority,
  CareerActionType,
  CareerAction
} from '../types';
import { getOpportunity } from './careerOpportunities';
import { evaluatePoliciesForOpportunity } from './executionPolicy';
import { getApplicationForOpportunity } from './careerApplications';
import { listActions } from './careerActions';

export function getNextAction(opportunityId: number): CareerNextAction | null {
  const opp = getOpportunity(opportunityId);
  if (!opp) return null;

  const app = getApplicationForOpportunity(opportunityId);
  const actions = evaluatePoliciesForOpportunity(opportunityId);

  // Check if there are already persisted actions in database
  const existingActions = listActions({
    opportunityId,
    status: 'PENDING_APPROVAL'
  });

  const primaryCandidate = existingActions[0] || actions[0];
  if (!primaryCandidate) return null;

  const blockingFactors: string[] = [];
  if (opp.critical_gap) {
    blockingFactors.push('Critical technical gap prevents application submission');
  }
  if (primaryCandidate.actionType === 'SUBMIT_APPLICATION' && (!app || app.status !== 'READY')) {
    blockingFactors.push('Application must be in READY status before submission approval');
  }

  return {
    actionType: primaryCandidate.actionType,
    priority: primaryCandidate.priority,
    reason: primaryCandidate.reason,
    opportunityId,
    applicationId: app?.id || null,
    blockingFactors,
    recommendedAt: primaryCandidate.scheduledFor || new Date().toISOString(),
    requiresApproval: ['SUBMIT_APPLICATION', 'FOLLOW_UP', 'CREATE_APPLICATION'].includes(primaryCandidate.actionType),
    actionId: primaryCandidate.id || null
  };
}

export function getNextActions(): CareerNextAction[] {
  const { listOpportunities } = require('./careerOpportunities');
  const opps = listOpportunities();
  const nextActions: CareerNextAction[] = [];

  for (const opp of opps) {
    const next = getNextAction(opp.id!);
    if (next) nextActions.push(next);
  }

  return prioritizeNextActions(nextActions);
}

export function prioritizeNextActions(actions: CareerNextAction[]): CareerNextAction[] {
  const priorityWeight: Record<CareerActionPriority, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  return [...actions].sort((a, b) => {
    const weightDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (weightDiff !== 0) return weightDiff;
    return new Date(a.recommendedAt).getTime() - new Date(b.recommendedAt).getTime();
  });
}

export function explainAction(action: CareerAction | CareerNextAction): string {
  return `Action: ${action.actionType} | Priority: ${action.priority} | Reason: ${action.reason}`;
}
