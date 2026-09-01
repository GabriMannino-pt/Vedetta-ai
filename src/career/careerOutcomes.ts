import { getDb } from '../storage/db';
import {
  CareerOutcomeEvent,
  CareerOutcomeEventType,
  CareerOutcomeSummary
} from '../types';
import { getApplication } from './careerApplications';
import { getRealizedRevenueForApplication } from './revenueOutcomeAdapter';

export function canTransitionOutcome(
  fromType: CareerOutcomeEventType | null,
  toType: CareerOutcomeEventType
): boolean {
  if (!fromType) {
    return toType === 'SUBMITTED' || toType === 'WITHDRAWN';
  }

  if (fromType === toType) {
    return true; // Idempotent same-event repetition
  }

  // Terminal states cannot transition to forward stages
  if (['REJECTED', 'LOST', 'WITHDRAWN', 'NO_RESPONSE'].includes(fromType)) {
    // Cannot transition from terminal rejection to interview or offer
    if (['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(toType)) {
      return false;
    }
  }

  switch (fromType) {
    case 'SUBMITTED':
      return ['VIEWED', 'RESPONSE_RECEIVED', 'NO_RESPONSE', 'REJECTED', 'INTERVIEW_INVITED', 'WITHDRAWN'].includes(toType);
    case 'VIEWED':
      return ['RESPONSE_RECEIVED', 'NO_RESPONSE', 'REJECTED', 'INTERVIEW_INVITED', 'WITHDRAWN'].includes(toType);
    case 'RESPONSE_RECEIVED':
      return ['INTERVIEW_INVITED', 'REJECTED', 'OFFER_RECEIVED', 'LOST', 'WITHDRAWN'].includes(toType);
    case 'INTERVIEW_INVITED':
      return ['INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'REJECTED', 'LOST', 'WITHDRAWN'].includes(toType);
    case 'INTERVIEW_COMPLETED':
      return ['OFFER_RECEIVED', 'REJECTED', 'LOST', 'WITHDRAWN', 'WON'].includes(toType);
    case 'OFFER_RECEIVED':
      return ['WON', 'LOST', 'WITHDRAWN'].includes(toType);
    case 'WON':
      return ['WITHDRAWN'].includes(toType);
    default:
      return true;
  }
}

export function recordOutcomeEvent(event: CareerOutcomeEvent): number {
  const db = getDb();
  const app = getApplication(event.applicationId);
  if (!app) {
    throw new Error(`Application ID ${event.applicationId} not found`);
  }

  const latest = getLatestOutcome(event.applicationId);
  const currentType = latest ? latest.eventType : (app.status === 'SUBMITTED' ? 'SUBMITTED' : null);

  if (!canTransitionOutcome(currentType, event.eventType)) {
    throw new Error(`Invalid outcome transition from ${currentType || 'NONE'} to ${event.eventType}`);
  }

  const now = new Date().toISOString();
  const eventAt = event.eventAt || now;

  const stmt = db.prepare(`
    INSERT INTO career_outcome_events (
      profile_id, application_id, opportunity_id,
      event_type, event_at, source, notes, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    event.profileId,
    event.applicationId,
    event.opportunityId,
    event.eventType,
    eventAt,
    event.source,
    event.notes || null,
    event.metadataJson || null,
    now
  );

  // Update application status if submitted or withdrawn
  if (event.eventType === 'SUBMITTED' && app.status !== 'SUBMITTED') {
    db.prepare('UPDATE career_applications SET status = ?, submitted_at = COALESCE(submitted_at, ?), updated_at = ? WHERE id = ?')
      .run('SUBMITTED', eventAt, now, event.applicationId);
  } else if (event.eventType === 'WITHDRAWN') {
    db.prepare('UPDATE career_applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('WITHDRAWN', now, event.applicationId);
  }

  // Rebuild snapshot
  rebuildOutcomeSnapshot(event.applicationId);

  return info.lastInsertRowid as number;
}

export function getOutcomeEvent(id: number): CareerOutcomeEvent | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_outcome_events WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToEvent(row);
}

export function listOutcomeEvents(applicationId?: number): CareerOutcomeEvent[] {
  const db = getDb();
  const rows = applicationId
    ? db.prepare('SELECT * FROM career_outcome_events WHERE application_id = ? ORDER BY event_at ASC, id ASC').all(applicationId) as any[]
    : db.prepare('SELECT * FROM career_outcome_events ORDER BY event_at ASC, id ASC').all() as any[];
  return rows.map(mapRowToEvent);
}

export function getApplicationOutcomeHistory(applicationId: number): CareerOutcomeEvent[] {
  return listOutcomeEvents(applicationId);
}

export function getLatestOutcome(applicationId: number): CareerOutcomeEvent | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_outcome_events WHERE application_id = ? ORDER BY event_at DESC, id DESC LIMIT 1').get(applicationId) as any;
  if (!row) return null;
  return mapRowToEvent(row);
}

export function calculateOutcomeSummary(applicationId: number): CareerOutcomeSummary | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_outcome_snapshots WHERE application_id = ?').get(applicationId) as any;
  if (!row) {
    return rebuildOutcomeSnapshot(applicationId);
  }
  return {
    applicationId: row.application_id,
    submitted: Boolean(row.submitted),
    responseReceived: Boolean(row.response_received),
    interviewInvited: Boolean(row.interview_invited),
    interviewCompleted: Boolean(row.interview_completed),
    offerReceived: Boolean(row.offer_received),
    won: Boolean(row.won),
    lost: Boolean(row.lost),
    finalOutcome: row.final_outcome,
    daysToResponse: row.days_to_response,
    daysToInterview: row.days_to_interview,
    daysToOffer: row.days_to_offer,
    daysToClose: row.days_to_close,
    revenue: row.revenue,
    currency: row.currency,
    calculatedAt: row.calculated_at,
    algorithmVersion: row.algorithm_version
  };
}

export function rebuildOutcomeSnapshot(applicationId: number): CareerOutcomeSummary {
  const events = listOutcomeEvents(applicationId);
  const now = new Date().toISOString();

  let submitted = false;
  let responseReceived = false;
  let interviewInvited = false;
  let interviewCompleted = false;
  let offerReceived = false;
  let won = false;
  let lost = false;
  let finalOutcome: CareerOutcomeEventType = 'SUBMITTED';

  let submittedTime: number | null = null;
  let responseTime: number | null = null;
  let interviewTime: number | null = null;
  let offerTime: number | null = null;
  let closeTime: number | null = null;

  for (const ev of events) {
    finalOutcome = ev.eventType;
    const t = new Date(ev.eventAt).getTime();

    if (ev.eventType === 'SUBMITTED') {
      submitted = true;
      if (!submittedTime) submittedTime = t;
    }
    if (ev.eventType === 'RESPONSE_RECEIVED' || ev.eventType === 'INTERVIEW_INVITED' || ev.eventType === 'REJECTED') {
      responseReceived = true;
      if (!responseTime) responseTime = t;
    }
    if (ev.eventType === 'INTERVIEW_INVITED') {
      interviewInvited = true;
      if (!interviewTime) interviewTime = t;
    }
    if (ev.eventType === 'INTERVIEW_COMPLETED') {
      interviewCompleted = true;
    }
    if (ev.eventType === 'OFFER_RECEIVED') {
      offerReceived = true;
      if (!offerTime) offerTime = t;
    }
    if (ev.eventType === 'WON') {
      won = true;
      if (!closeTime) closeTime = t;
    }
    if (ev.eventType === 'LOST' || ev.eventType === 'REJECTED') {
      lost = true;
      if (!closeTime) closeTime = t;
    }
  }

  const msInDay = 86400000;
  const daysToResponse = submittedTime && responseTime ? Math.max(0, Math.round(((responseTime - submittedTime) / msInDay) * 10) / 10) : null;
  const daysToInterview = submittedTime && interviewTime ? Math.max(0, Math.round(((interviewTime - submittedTime) / msInDay) * 10) / 10) : null;
  const daysToOffer = submittedTime && offerTime ? Math.max(0, Math.round(((offerTime - submittedTime) / msInDay) * 10) / 10) : null;
  const daysToClose = submittedTime && closeTime ? Math.max(0, Math.round(((closeTime - submittedTime) / msInDay) * 10) / 10) : null;

  // Realized revenue query via revenue truth adapter
  const revenue = getRealizedRevenueForApplication(applicationId);

  const db = getDb();
  db.prepare(`
    INSERT INTO career_outcome_snapshots (
      application_id, submitted, response_received, interview_invited,
      interview_completed, offer_received, won, lost, final_outcome,
      days_to_response, days_to_interview, days_to_offer, days_to_close,
      revenue, currency, calculated_at, algorithm_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id) DO UPDATE SET
      submitted = excluded.submitted,
      response_received = excluded.response_received,
      interview_invited = excluded.interview_invited,
      interview_completed = excluded.interview_completed,
      offer_received = excluded.offer_received,
      won = excluded.won,
      lost = excluded.lost,
      final_outcome = excluded.final_outcome,
      days_to_response = excluded.days_to_response,
      days_to_interview = excluded.days_to_interview,
      days_to_offer = excluded.days_to_offer,
      days_to_close = excluded.days_to_close,
      revenue = excluded.revenue,
      calculated_at = excluded.calculated_at,
      algorithm_version = excluded.algorithm_version
  `).run(
    applicationId,
    submitted ? 1 : 0,
    responseReceived ? 1 : 0,
    interviewInvited ? 1 : 0,
    interviewCompleted ? 1 : 0,
    offerReceived ? 1 : 0,
    won ? 1 : 0,
    lost ? 1 : 0,
    finalOutcome,
    daysToResponse,
    daysToInterview,
    daysToOffer,
    daysToClose,
    revenue,
    'EUR',
    now,
    1
  );

  return {
    applicationId,
    submitted,
    responseReceived,
    interviewInvited,
    interviewCompleted,
    offerReceived,
    won,
    lost,
    finalOutcome,
    daysToResponse,
    daysToInterview,
    daysToOffer,
    daysToClose,
    revenue,
    currency: 'EUR',
    calculatedAt: now,
    algorithmVersion: 1
  };
}

function mapRowToEvent(r: any): CareerOutcomeEvent {
  return {
    id: r.id,
    profileId: r.profile_id,
    applicationId: r.application_id,
    opportunityId: r.opportunity_id,
    eventType: r.event_type,
    eventAt: r.event_at,
    source: r.source,
    notes: r.notes,
    metadataJson: r.metadata_json,
    createdAt: r.created_at
  };
}
