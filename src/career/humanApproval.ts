import { getAction, updateActionStatus } from './careerActions';

export function requestApproval(actionId: number, actor = 'USER'): void {
  const action = getAction(actionId);
  if (!action) throw new Error(`Action ID ${actionId} not found`);
  updateActionStatus(actionId, 'PENDING_APPROVAL', actor, 'Submitted for human review');
}

export function approveAction(actionId: number, actor = 'USER', notes?: string): void {
  const action = getAction(actionId);
  if (!action) throw new Error(`Action ID ${actionId} not found`);
  updateActionStatus(actionId, 'APPROVED', actor, notes || 'Approved by human reviewer');
}

export function rejectAction(actionId: number, actor = 'USER', reason?: string): void {
  const action = getAction(actionId);
  if (!action) throw new Error(`Action ID ${actionId} not found`);
  updateActionStatus(actionId, 'REJECTED', actor, reason || 'Rejected by human reviewer');
}

export function cancelAction(actionId: number, actor = 'USER', reason?: string): void {
  const action = getAction(actionId);
  if (!action) throw new Error(`Action ID ${actionId} not found`);
  updateActionStatus(actionId, 'CANCELLED', actor, reason || 'Cancelled by user');
}
