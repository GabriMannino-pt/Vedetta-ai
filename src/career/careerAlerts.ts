import { getDb } from '../storage/db';

export interface CareerAlert {
  id: string;
  type: 'DEADLINE' | 'OPPORTUNITY' | 'APPLICATION' | 'LEARNING';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  targetId?: number;
  actionUrl?: string;
  createdAt: string;
}

export function generateCareerAlerts(): CareerAlert[] {
  const db = getDb();
  const alerts: CareerAlert[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Deadline Alerts (Opportunities with imminent deadlines or expired)
  const oppsWithDeadlines = db.prepare(`
    SELECT id, title, company_name, deadline FROM career_opportunities
    WHERE deadline IS NOT NULL AND deadline != ''
  `).all() as any[];

  for (const opp of oppsWithDeadlines) {
    const dlDate = new Date(opp.deadline);
    const diffHours = (dlDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) {
      alerts.push({
        id: `alert_deadline_expired_${opp.id}`,
        type: 'DEADLINE',
        severity: 'CRITICAL',
        title: `Deadline Expired: ${opp.title}`,
        description: `Application deadline at ${opp.company_name} was ${opp.deadline}.`,
        targetId: opp.id,
        createdAt: nowIso
      });
    } else if (diffHours <= 48) {
      alerts.push({
        id: `alert_deadline_imminent_${opp.id}`,
        type: 'DEADLINE',
        severity: 'WARNING',
        title: `Deadline in ${Math.round(diffHours)}h: ${opp.title}`,
        description: `Expiring soon for ${opp.company_name}.`,
        targetId: opp.id,
        createdAt: nowIso
      });
    }
  }

  // 2. High-Fit Unapplied Opportunities
  const highFitUnapplied = db.prepare(`
    SELECT co.id, co.title, co.company_name, co.fit_score, co.application_priority
    FROM career_opportunities co
    LEFT JOIN career_applications ca ON co.id = ca.opportunity_id
    WHERE ca.id IS NULL AND co.fit_score >= 80
    ORDER BY co.fit_score DESC LIMIT 10
  `).all() as any[];

  for (const opp of highFitUnapplied) {
    alerts.push({
      id: `alert_high_fit_unapplied_${opp.id}`,
      type: 'OPPORTUNITY',
      severity: opp.fit_score >= 90 ? 'WARNING' : 'INFO',
      title: `High Fit Opportunity: ${opp.title} (${opp.fit_score}% Fit)`,
      description: `Strong match at ${opp.company_name} without an application created yet.`,
      targetId: opp.id,
      createdAt: nowIso
    });
  }

  // 3. Blocked Proposals (Critical guard rejections)
  const blockedProps = db.prepare(`
    SELECT cp.id, cp.application_id, ca.opportunity_id, co.title, co.company_name
    FROM career_proposals cp
    JOIN career_applications ca ON cp.application_id = ca.id
    JOIN career_opportunities co ON ca.opportunity_id = co.id
    WHERE cp.proposal_status = 'BLOCKED'
  `).all() as any[];

  for (const prop of blockedProps) {
    alerts.push({
      id: `alert_proposal_blocked_${prop.id}`,
      type: 'APPLICATION',
      severity: 'CRITICAL',
      title: `Proposal Blocked: ${prop.title}`,
      description: `Proposal Guard identified unverified or unsupported claims for application #${prop.application_id}.`,
      targetId: prop.application_id,
      createdAt: nowIso
    });
  }

  // 4. Applications Ready for Human Review
  const readyApps = db.prepare(`
    SELECT ca.id, co.title, co.company_name, ca.channel, ca.fit_score_snapshot
    FROM career_applications ca
    JOIN career_opportunities co ON ca.opportunity_id = co.id
    WHERE ca.status = 'READY'
  `).all() as any[];

  for (const app of readyApps) {
    alerts.push({
      id: `alert_app_ready_${app.id}`,
      type: 'APPLICATION',
      severity: 'INFO',
      title: `Application Ready for Review: ${app.title}`,
      description: `Application #${app.id} for ${app.company_name} is validated and ready for human dispatch on ${app.channel}.`,
      targetId: app.id,
      createdAt: nowIso
    });
  }

  // 5. Critical Gap Alerts
  const criticalGapOpps = db.prepare(`
    SELECT id, title, company_name, fit_explanation_json
    FROM career_opportunities
    WHERE critical_gap = 1
    LIMIT 5
  `).all() as any[];

  for (const opp of criticalGapOpps) {
    alerts.push({
      id: `alert_critical_gap_${opp.id}`,
      type: 'OPPORTUNITY',
      severity: 'WARNING',
      title: `Critical Technical Gap: ${opp.title}`,
      description: `Missing core must-have requirements at ${opp.company_name}.`,
      targetId: opp.id,
      createdAt: nowIso
    });
  }

  // 6. Learning Sample Size Protection Alert
  const obsCountRow = db.prepare('SELECT COUNT(*) as c FROM career_learning_observations').get() as any;
  const obsCount = Number(obsCountRow?.c || 0);
  if (obsCount < 10) {
    alerts.push({
      id: 'alert_learning_sample_insufficient',
      type: 'LEARNING',
      severity: 'INFO',
      title: 'Learning Dataset Initializing',
      description: `Current sample size is ${obsCount} observations. Minimum 10 required for preliminary conversion calibration.`,
      createdAt: nowIso
    });
  }

  return alerts;
}
