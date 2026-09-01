import { getDb } from '../storage/db';
import {
  CareerAction,
  CareerActionStatus,
  CareerActionAudit,
  CareerActionPriority,
  CareerActionType
} from '../types';

export function canTransitionAction(
  fromStatus: CareerActionStatus | null,
  toStatus: CareerActionStatus
): boolean {
  if (!fromStatus) {
    return toStatus === 'SUGGESTED' || toStatus === 'PENDING_APPROVAL' || toStatus === 'APPROVED';
  }

  if (fromStatus === toStatus) {
    return true;
  }

  switch (fromStatus) {
    case 'SUGGESTED':
      return ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(toStatus);
    case 'PENDING_APPROVAL':
      return ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(toStatus);
    case 'APPROVED':
      return ['EXECUTING', 'CANCELLED', 'COMPLETED', 'FAILED'].includes(toStatus);
    case 'EXECUTING':
      return ['COMPLETED', 'FAILED'].includes(toStatus);
    case 'COMPLETED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'FAILED':
    case 'EXPIRED':
      return false; // Terminal states
    default:
      return false;
  }
}

export function createAction(action: CareerAction, actor = 'SYSTEM'): number {
  const db = getDb();
  const now = new Date().toISOString();

  if (!canTransitionAction(null, action.status)) {
    throw new Error(`Invalid initial action status: ${action.status}`);
  }

  const stmt = db.prepare(`
    INSERT INTO career_actions (
      profile_id, opportunity_id, application_id, action_type,
      status, priority, reason, payload_json, source,
      algorithm_version, scheduled_for, approved_at, completed_at,
      failed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    action.profileId,
    action.opportunityId || null,
    action.applicationId || null,
    action.actionType,
    action.status,
    action.priority,
    action.reason,
    action.payloadJson || null,
    action.source || 'SYSTEM',
    action.algorithmVersion || 1,
    action.scheduledFor || null,
    action.approvedAt || null,
    action.completedAt || null,
    action.failedAt || null,
    now,
    now
  );

  const actionId = info.lastInsertRowid as number;

  // Log audit record
  db.prepare(`
    INSERT INTO career_action_audit (
      action_id, previous_status, new_status, actor, reason, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionId,
    null,
    action.status,
    actor,
    action.reason || 'Action created',
    action.payloadJson || null,
    now
  );

  return actionId;
}

export function getAction(id: number): CareerAction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_actions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToAction(row);
}

export function listActions(filters: {
  profileId?: number;
  opportunityId?: number;
  applicationId?: number;
  status?: CareerActionStatus;
  priority?: CareerActionPriority;
  actionType?: CareerActionType;
} = {}): CareerAction[] {
  const db = getDb();
  let query = 'SELECT * FROM career_actions WHERE 1=1';
  const params: any[] = [];

  if (filters.profileId) {
    query += ' AND profile_id = ?';
    params.push(filters.profileId);
  }
  if (filters.opportunityId) {
    query += ' AND opportunity_id = ?';
    params.push(filters.opportunityId);
  }
  if (filters.applicationId) {
    query += ' AND application_id = ?';
    params.push(filters.applicationId);
  }
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.priority) {
    query += ' AND priority = ?';
    params.push(filters.priority);
  }
  if (filters.actionType) {
    query += ' AND action_type = ?';
    params.push(filters.actionType);
  }

  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(mapRowToAction);
}

export function updateActionStatus(
  actionId: number,
  newStatus: CareerActionStatus,
  actor: string,
  reason?: string,
  metadata?: any
): void {
  const action = getAction(actionId);
  if (!action) {
    throw new Error(`Action ID ${actionId} not found`);
  }

  if (!canTransitionAction(action.status, newStatus)) {
    throw new Error(`Invalid action transition from ${action.status} to ${newStatus}`);
  }

  const now = new Date().toISOString();
  const db = getDb();

  let approvedAt = action.approvedAt;
  let completedAt = action.completedAt;
  let failedAt = action.failedAt;

  if (newStatus === 'APPROVED') approvedAt = now;
  if (newStatus === 'COMPLETED') completedAt = now;
  if (newStatus === 'FAILED') failedAt = now;

  db.prepare(`
    UPDATE career_actions SET
      status = ?,
      approved_at = ?,
      completed_at = ?,
      failed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(newStatus, approvedAt, completedAt, failedAt, now, actionId);

  // Append audit record
  db.prepare(`
    INSERT INTO career_action_audit (
      action_id, previous_status, new_status, actor, reason, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionId,
    action.status,
    newStatus,
    actor,
    reason || null,
    metadata ? JSON.stringify(metadata) : null,
    now
  );
}

export function getPendingActions(): CareerAction[] {
  return listActions({ status: 'PENDING_APPROVAL' });
}

export function getScheduledActions(): CareerAction[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM career_actions WHERE status IN ('SUGGESTED', 'PENDING_APPROVAL', 'APPROVED') AND scheduled_for IS NOT NULL ORDER BY scheduled_for ASC").all() as any[];
  return rows.map(mapRowToAction);
}

export function getActionAudit(actionId: number): CareerActionAudit[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_action_audit WHERE action_id = ? ORDER BY created_at ASC, id ASC').all(actionId) as any[];
  return rows.map(r => ({
    id: r.id,
    actionId: r.action_id,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    actor: r.actor,
    reason: r.reason,
    metadataJson: r.metadata_json,
    createdAt: r.created_at
  }));
}

function mapRowToAction(r: any): CareerAction {
  return {
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
  };
}
