import { getDb } from '../storage/db';
import { CareerAction } from '../types';
import { createAction, listActions, updateActionStatus } from './careerActions';
import { evaluatePoliciesForOpportunity } from './executionPolicy';
import { listOpportunities } from './careerOpportunities';

export function generateDeduplicationKey(action: CareerAction): string {
  const dateStr = action.scheduledFor ? action.scheduledFor.substring(0, 10) : new Date().toISOString().substring(0, 10);
  return `${action.profileId}-${action.opportunityId || 0}-${action.applicationId || 0}-${action.actionType}-${dateStr}-${action.algorithmVersion || 1}`;
}

export function generateScheduledActions(): number {
  const opps = listOpportunities();
  let createdCount = 0;

  for (const opp of opps) {
    const actions = evaluatePoliciesForOpportunity(opp.id!);
    for (const act of actions) {
      const existing = listActions({
        opportunityId: act.opportunityId || undefined,
        actionType: act.actionType
      }).find(a => ['SUGGESTED', 'PENDING_APPROVAL', 'APPROVED'].includes(a.status));

      if (!existing) {
        createAction(act, 'SYSTEM_SCHEDULER');
        createdCount++;
      }
    }
  }

  return createdCount;
}

export function getDueActions(): CareerAction[] {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const rows = db.prepare(`
    SELECT * FROM career_actions 
    WHERE status IN ('SUGGESTED', 'PENDING_APPROVAL', 'APPROVED')
    AND (scheduled_for IS NULL OR scheduled_for <= ?)
    ORDER BY priority DESC, created_at ASC
  `).all(nowIso) as any[];

  return rows.map(r => ({
    id: r.id,
    profileId: r.profile_id,
    opportunityId: r.opportunity_id,
    applicationId: r.application_id,
    actionType: r.action_type,
    status: r.status,
    priority: r.priority,
    reason: r.reason,
    payloadJson: r.payload_json,
    source: r.source,
    algorithmVersion: r.algorithm_version,
    scheduledFor: r.scheduled_for,
    approvedAt: r.approved_at,
    completedAt: r.completed_at,
    failedAt: r.failed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export function expireOverdueActions(): number {
  const db = getDb();
  const now = new Date();
  let count = 0;

  const activeActions = listActions();
  for (const act of activeActions) {
    if (act.opportunityId && ['SUGGESTED', 'PENDING_APPROVAL'].includes(act.status)) {
      const opp = db.prepare('SELECT deadline FROM career_opportunities WHERE id = ?').get(act.opportunityId) as any;
      if (opp && opp.deadline && new Date(opp.deadline).getTime() < now.getTime()) {
        updateActionStatus(act.id!, 'EXPIRED', 'SYSTEM_EXPIRATION', 'Opportunity deadline passed');
        count++;
      }
    }
  }

  return count;
}

export function refreshCareerQueue(): { created: number; expired: number; dueCount: number } {
  const expired = expireOverdueActions();
  const created = generateScheduledActions();
  const due = getDueActions();

  return {
    created,
    expired,
    dueCount: due.length
  };
}
