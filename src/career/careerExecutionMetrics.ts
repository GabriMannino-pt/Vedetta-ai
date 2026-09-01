import { getDb } from '../storage/db';
import { CareerExecutionMetrics } from '../types';

export function calculateExecutionMetrics(): CareerExecutionMetrics {
  const db = getDb();

  const actions = db.prepare('SELECT * FROM career_actions').all() as any[];
  const audits = db.prepare('SELECT * FROM career_action_audit').all() as any[];

  const suggested = actions.filter(a => a.status === 'SUGGESTED').length;
  const approved = actions.filter(a => a.approved_at !== null || a.status === 'APPROVED' || a.status === 'COMPLETED').length;
  const rejected = actions.filter(a => a.status === 'REJECTED').length;
  const completed = actions.filter(a => a.status === 'COMPLETED').length;
  const failed = actions.filter(a => a.status === 'FAILED').length;
  const expired = actions.filter(a => a.status === 'EXPIRED').length;

  const totalDecision = approved + rejected;
  const approvalRate = totalDecision > 0 ? Math.round((approved / totalDecision) * 1000) / 10 : 0;
  const totalExec = completed + failed;
  const executionSuccessRate = totalExec > 0 ? Math.round((completed / totalExec) * 1000) / 10 : 0;
  const executionEfficiency = (actions.length > 0) ? Math.round((approved / actions.length) * 1000) / 10 : 0;

  // Calculate average approval delay in hours
  const delays: number[] = [];
  for (const act of actions) {
    if (act.approved_at && act.created_at) {
      const diffMs = new Date(act.approved_at).getTime() - new Date(act.created_at).getTime();
      delays.push(Math.max(0, diffMs / (1000 * 60 * 60)));
    }
  }
  const averageApprovalDelayHours = delays.length > 0
    ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
    : null;

  const overdueActionsCount = actions.filter(a => a.scheduled_for && new Date(a.scheduled_for).getTime() < Date.now() && ['SUGGESTED', 'PENDING_APPROVAL'].includes(a.status)).length;
  const pendingApprovalsCount = actions.filter(a => a.status === 'PENDING_APPROVAL').length;

  // Opportunity leakage: fit >= 80, no application, deadline not expired
  const leakageRow = db.prepare(`
    SELECT COUNT(*) as c FROM career_opportunities co
    LEFT JOIN career_applications ca ON co.id = ca.opportunity_id
    WHERE ca.id IS NULL AND co.fit_score >= 80 AND (co.deadline IS NULL OR co.deadline >= datetime('now'))
  `).get() as any;
  const opportunityLeakageCount = Number(leakageRow?.c || 0);

  return {
    actionsSuggested: suggested,
    actionsApproved: approved,
    actionsRejected: rejected,
    actionsCompleted: completed,
    actionsFailed: failed,
    actionsExpired: expired,
    approvalRate,
    executionSuccessRate,
    executionEfficiency,
    averageApprovalDelayHours,
    overdueActionsCount,
    pendingApprovalsCount,
    opportunityLeakageCount
  };
}
