import { getDb } from '../storage/db';
import {
  CareerLearningObservation,
  CareerLearningMetrics,
  CareerLearningInsight,
  FitCalibrationBucket
} from '../types';
import { getApplication } from './careerApplications';
import { getOpportunity } from './careerOpportunities';
import { calculateOutcomeSummary } from './careerOutcomes';

export const LEARNING_ALGORITHM_VERSION = 1;
export const MIN_OBSERVATIONS_FOR_INSIGHT = 10;
export const MIN_OBSERVATIONS_FOR_STRONG_INSIGHT = 30;

export function buildLearningObservation(applicationId: number): CareerLearningObservation | null {
  const app = getApplication(applicationId);
  if (!app) return null;

  const opp = getOpportunity(app.opportunity_id);
  if (!opp) return null;

  const summary = calculateOutcomeSummary(applicationId);
  if (!summary) return null;

  let breakdown: any = {};
  if (opp.fit_breakdown_json) {
    try {
      breakdown = JSON.parse(opp.fit_breakdown_json);
    } catch (e) {}
  }

  const obs: CareerLearningObservation = {
    applicationId,
    opportunityId: app.opportunity_id,
    fitScore: app.fit_score_snapshot,
    applicationPriority: app.priority_snapshot,
    technicalMatch: breakdown.technicalMatch ?? opp.technical_match ?? 0,
    experienceMatch: breakdown.experienceMatch ?? opp.experience_match ?? 0,
    seniorityMatch: breakdown.seniorityMatch ?? opp.seniority_match ?? 0,
    domainMatch: breakdown.domainMatch ?? opp.domain_match ?? 0,
    evidenceScore: breakdown.evidenceStrength ?? opp.evidence_score ?? 0,
    mustHaveCoverage: breakdown.mustHaveCoverage ?? opp.must_have_coverage ?? 0,
    niceToHaveCoverage: breakdown.niceToHaveCoverage ?? opp.nice_to_have_coverage ?? 0,
    remoteMatch: breakdown.remoteMatch ?? opp.remote_match ?? 0,
    languageMatch: breakdown.languageMatch ?? opp.language_match ?? 0,
    criticalGap: Boolean(opp.critical_gap),
    recommendation: app.recommendation_snapshot,
    channel: app.channel,
    source: opp.source,
    outcome: summary.finalOutcome,
    revenue: summary.revenue || 0,
    fitAlgorithmVersion: app.fit_algorithm_version,
    learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
    observedAt: new Date().toISOString()
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO career_learning_observations (
      application_id, opportunity_id, fit_score, application_priority,
      technical_match, experience_match, seniority_match, domain_match,
      evidence_score, must_have_coverage, nice_to_have_coverage,
      remote_match, language_match, critical_gap, recommendation,
      channel, source, outcome, revenue, fit_algorithm_version,
      learning_algorithm_version, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id) DO UPDATE SET
      fit_score = excluded.fit_score,
      application_priority = excluded.application_priority,
      technical_match = excluded.technical_match,
      experience_match = excluded.experience_match,
      seniority_match = excluded.seniority_match,
      domain_match = excluded.domain_match,
      evidence_score = excluded.evidence_score,
      must_have_coverage = excluded.must_have_coverage,
      nice_to_have_coverage = excluded.nice_to_have_coverage,
      remote_match = excluded.remote_match,
      language_match = excluded.language_match,
      critical_gap = excluded.critical_gap,
      recommendation = excluded.recommendation,
      channel = excluded.channel,
      source = excluded.source,
      outcome = excluded.outcome,
      revenue = excluded.revenue,
      fit_algorithm_version = excluded.fit_algorithm_version,
      learning_algorithm_version = excluded.learning_algorithm_version,
      observed_at = excluded.observed_at
  `).run(
    obs.applicationId,
    obs.opportunityId,
    obs.fitScore,
    obs.applicationPriority,
    obs.technicalMatch,
    obs.experienceMatch,
    obs.seniorityMatch,
    obs.domainMatch,
    obs.evidenceScore,
    obs.mustHaveCoverage,
    obs.niceToHaveCoverage,
    obs.remoteMatch,
    obs.languageMatch,
    obs.criticalGap ? 1 : 0,
    obs.recommendation,
    obs.channel,
    obs.source,
    obs.outcome,
    obs.revenue,
    obs.fitAlgorithmVersion,
    obs.learningAlgorithmVersion,
    obs.observedAt
  );

  return obs;
}

export function listLearningObservations(): CareerLearningObservation[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_learning_observations ORDER BY observed_at DESC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    applicationId: r.application_id,
    opportunityId: r.opportunity_id,
    fitScore: r.fit_score,
    applicationPriority: r.application_priority,
    technicalMatch: r.technical_match,
    experienceMatch: r.experience_match,
    seniorityMatch: r.seniority_match,
    domainMatch: r.domain_match,
    evidenceScore: r.evidence_score,
    mustHaveCoverage: r.must_have_coverage,
    niceToHaveCoverage: r.nice_to_have_coverage,
    remoteMatch: r.remote_match,
    languageMatch: r.language_match,
    criticalGap: Boolean(r.critical_gap),
    recommendation: r.recommendation,
    channel: r.channel,
    source: r.source,
    outcome: r.outcome,
    revenue: r.revenue,
    fitAlgorithmVersion: r.fit_algorithm_version,
    learningAlgorithmVersion: r.learning_algorithm_version,
    observedAt: r.observed_at
  }));
}

export function calculateHistoricalMetrics(observations?: CareerLearningObservation[]): CareerLearningMetrics {
  const obs = observations || listLearningObservations();
  const db = getDb();

  const snapshots = db.prepare('SELECT * FROM career_outcome_snapshots').all() as any[];
  const totalApps = snapshots.length;
  const submittedApps = snapshots.filter(s => s.submitted).length;
  const responsesReceived = snapshots.filter(s => s.response_received).length;
  const interviewsInvited = snapshots.filter(s => s.interview_invited).length;
  const interviewsCompleted = snapshots.filter(s => s.interview_completed).length;
  const offersReceived = snapshots.filter(s => s.offer_received).length;
  const wonDeals = snapshots.filter(s => s.won).length;
  const lostDeals = snapshots.filter(s => s.lost).length;
  const totalRevenue = snapshots.reduce((acc, s) => acc + (s.revenue || 0), 0);

  const responseRate = submittedApps > 0 ? Math.round((responsesReceived / submittedApps) * 1000) / 10 : 0;
  const interviewRate = submittedApps > 0 ? Math.round((interviewsInvited / submittedApps) * 1000) / 10 : 0;
  const interviewConversionRate = responsesReceived > 0 ? Math.round((interviewsInvited / responsesReceived) * 1000) / 10 : 0;
  const offerRate = interviewsInvited > 0 ? Math.round((offersReceived / interviewsInvited) * 1000) / 10 : 0;
  const winRate = submittedApps > 0 ? Math.round((wonDeals / submittedApps) * 1000) / 10 : 0;
  const revenuePerApplication = submittedApps > 0 ? Math.round(totalRevenue / submittedApps) : 0;
  const revenuePerInterview = interviewsInvited > 0 ? Math.round(totalRevenue / interviewsInvited) : 0;

  const validResponseDays = snapshots.map(s => s.days_to_response).filter(d => typeof d === 'number') as number[];
  const validInterviewDays = snapshots.map(s => s.days_to_interview).filter(d => typeof d === 'number') as number[];
  const validOfferDays = snapshots.map(s => s.days_to_offer).filter(d => typeof d === 'number') as number[];
  const validCloseDays = snapshots.map(s => s.days_to_close).filter(d => typeof d === 'number') as number[];

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  return {
    totalApplications: totalApps,
    submittedApplications: submittedApps,
    responsesReceived,
    interviewsInvited,
    interviewsCompleted,
    offersReceived,
    wonDeals,
    lostDeals,
    totalRevenue,
    responseRate,
    interviewRate,
    interviewConversionRate,
    offerRate,
    winRate,
    revenuePerApplication,
    revenuePerInterview,
    avgDaysToResponse: avg(validResponseDays),
    avgDaysToInterview: avg(validInterviewDays),
    avgDaysToOffer: avg(validOfferDays),
    avgDaysToClose: avg(validCloseDays)
  };
}

export function calculateCalibration(observations?: CareerLearningObservation[]): FitCalibrationBucket[] {
  const obs = observations || listLearningObservations();

  const buckets = [
    { label: '90-100', min: 90, max: 100 },
    { label: '80-89', min: 80, max: 89 },
    { label: '70-79', min: 70, max: 79 },
    { label: '60-69', min: 60, max: 69 },
    { label: '<60', min: 0, max: 59 }
  ];

  return buckets.map(b => {
    const bucketObs = obs.filter(o => o.fitScore >= b.min && o.fitScore <= b.max);
    const total = bucketObs.length;
    const interviews = bucketObs.filter(o => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(o.outcome)).length;
    const offers = bucketObs.filter(o => ['OFFER_RECEIVED', 'WON'].includes(o.outcome)).length;
    const wins = bucketObs.filter(o => o.outcome === 'WON').length;
    const totalRev = bucketObs.reduce((acc, o) => acc + o.revenue, 0);

    return {
      bucketLabel: b.label,
      minScore: b.min,
      maxScore: b.max,
      totalApplications: total,
      interviews,
      offers,
      wins,
      interviewRate: total > 0 ? Math.round((interviews / total) * 1000) / 10 : 0,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      avgRevenue: total > 0 ? Math.round(totalRev / total) : 0
    };
  });
}

export function generateLearningInsights(observations?: CareerLearningObservation[], generatedAt?: string): CareerLearningInsight[] {
  const obs = observations || listLearningObservations();
  const sampleSize = obs.length;
  const now = generatedAt || new Date().toISOString();
  const insights: CareerLearningInsight[] = [];

  let confidence: CareerLearningInsight['confidence'] = 'INSUFFICIENT_DATA';
  if (sampleSize >= MIN_OBSERVATIONS_FOR_STRONG_INSIGHT) {
    confidence = 'HIGH';
  } else if (sampleSize >= MIN_OBSERVATIONS_FOR_INSIGHT) {
    confidence = 'MEDIUM';
  }

  if (sampleSize < MIN_OBSERVATIONS_FOR_INSIGHT) {
    insights.push({
      id: 'insight_sample_protection',
      insightType: 'PRIORITY_PERFORMANCE',
      title: 'Insufficient Sample for Statistical Convergence',
      description: `Only ${sampleSize} observations collected. Minimum ${MIN_OBSERVATIONS_FOR_INSIGHT} required for preliminary baseline.`,
      dimension: 'all',
      dimensionValue: 'all',
      sampleSize,
      confidence: 'INSUFFICIENT_DATA',
      observedMetric: sampleSize,
      baselineMetric: MIN_OBSERVATIONS_FOR_INSIGHT,
      delta: sampleSize - MIN_OBSERVATIONS_FOR_INSIGHT,
      recommendedAction: 'Continue collecting real outcome events without modifying algorithm weights.',
      learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
      generatedAt: now
    });
    return insights;
  }

  // 1. Fit Calibration Insight
  const calibration = calculateCalibration(obs);
  const topBucket = calibration.find(c => c.bucketLabel === '90-100');
  const midBucket = calibration.find(c => c.bucketLabel === '70-79');
  if (topBucket && midBucket && topBucket.totalApplications > 0 && midBucket.totalApplications > 0) {
    const deltaRate = Math.round((topBucket.interviewRate - midBucket.interviewRate) * 10) / 10;
    insights.push({
      id: 'insight_fit_calibration',
      insightType: 'FIT_CALIBRATION',
      title: 'Fit Score Predictive Correlation',
      description: `Top tier (90-100) candidates achieve ${topBucket.interviewRate}% interview rate vs ${midBucket.interviewRate}% in 70-79 tier.`,
      dimension: 'fitScore',
      dimensionValue: '90-100',
      sampleSize: topBucket.totalApplications + midBucket.totalApplications,
      confidence,
      observedMetric: topBucket.interviewRate,
      baselineMetric: midBucket.interviewRate,
      delta: deltaRate,
      recommendedAction: deltaRate > 0 ? 'Maintain current deterministic fit weighting.' : 'Calibrate technical match criteria.',
      learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
      generatedAt: now
    });
  }

  // 2. Channel Performance Insight
  const channels = ['UPWORK', 'LINKEDIN', 'DIRECT', 'REFERRAL', 'OTHER'] as const;
  const channelMetrics = channels.map(ch => {
    const chObs = obs.filter(o => o.channel === ch);
    const count = chObs.length;
    const wins = chObs.filter(o => o.outcome === 'WON').length;
    const rev = chObs.reduce((a, b) => a + b.revenue, 0);
    return {
      channel: ch,
      count,
      wins,
      winRate: count > 0 ? (wins / count) * 100 : 0,
      revPerApp: count > 0 ? rev / count : 0
    };
  }).filter(c => c.count >= 3);

  if (channelMetrics.length >= 2) {
    const bestChannel = channelMetrics.reduce((prev, curr) => curr.winRate > prev.winRate ? curr : prev);
    insights.push({
      id: `insight_channel_${bestChannel.channel.toLowerCase()}`,
      insightType: 'CHANNEL_PERFORMANCE',
      title: `Top Channel Efficiency: ${bestChannel.channel}`,
      description: `${bestChannel.channel} leads with ${bestChannel.winRate.toFixed(1)}% win rate across ${bestChannel.count} applications.`,
      dimension: 'channel',
      dimensionValue: bestChannel.channel,
      sampleSize: bestChannel.count,
      confidence,
      observedMetric: Math.round(bestChannel.winRate),
      baselineMetric: 20,
      delta: Math.round(bestChannel.winRate - 20),
      recommendedAction: `Prioritize applications on ${bestChannel.channel} channel.`,
      learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
      generatedAt: now
    });
  }

  // 3. Evidence Performance Insight
  const verifiedObs = obs.filter(o => o.evidenceScore >= 75);
  const declaredObs = obs.filter(o => o.evidenceScore < 50);
  if (verifiedObs.length >= 3 && declaredObs.length >= 3) {
    const verifiedRate = (verifiedObs.filter(o => ['INTERVIEW_INVITED', 'WON'].includes(o.outcome)).length / verifiedObs.length) * 100;
    const declaredRate = (declaredObs.filter(o => ['INTERVIEW_INVITED', 'WON'].includes(o.outcome)).length / declaredObs.length) * 100;
    const delta = Math.round(verifiedRate - declaredRate);

    insights.push({
      id: 'insight_evidence_performance',
      insightType: 'EVIDENCE_PERFORMANCE',
      title: 'Verified Proof Conversion Multiplier',
      description: `Applications with verified GitHub/production proofs achieve ${verifiedRate.toFixed(1)}% interview conversion vs ${declaredRate.toFixed(1)}% for declared skills only.`,
      dimension: 'evidenceScore',
      dimensionValue: '>=75',
      sampleSize: verifiedObs.length + declaredObs.length,
      confidence,
      observedMetric: Math.round(verifiedRate),
      baselineMetric: Math.round(declaredRate),
      delta,
      recommendedAction: 'Strengthen portfolio repositories for requirements lacking verified evidence.',
      learningAlgorithmVersion: LEARNING_ALGORITHM_VERSION,
      generatedAt: now
    });
  }

  return insights;
}

export function rebuildAllLearningObservations(): number {
  const db = getDb();
  const apps = db.prepare('SELECT id FROM career_applications').all() as any[];
  let count = 0;
  for (const a of apps) {
    const obs = buildLearningObservation(a.id);
    if (obs) count++;
  }
  return count;
}
