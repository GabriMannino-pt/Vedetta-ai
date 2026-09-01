import { getDb } from '../storage/db';
import {
  CareerOptimizationSnapshot,
  CareerOptimizationInsight,
  CareerAdaptationProposal,
  CareerOptimizationRun,
  CareerExpectedValue
} from '../types';
import { calculateFitCalibration } from './adaptiveCalibration';
import { analyzeChannelPerformance } from './channelOptimizer';
import { analyzeEvidencePerformance } from './evidenceOptimizer';
import { analyzeDomainPerformance } from './domainOptimizer';
import { analyzeProposalPerformance } from './proposalOptimizer';
import { calculateOpportunityExpectedValue } from './expectedValue';
import { listOpportunities } from './careerOpportunities';

export function runCareerOptimization(): CareerOptimizationSnapshot {
  const db = getDb();
  const startTime = new Date().toISOString();
  const algorithmVersion = 1;

  // Start run record
  const runStmt = db.prepare(`
    INSERT INTO career_optimization_runs (
      algorithm_version, started_at, observations_count, insights_generated,
      adaptations_proposed, status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, 'RUNNING', ?)
  `);
  const runInfo = runStmt.run(algorithmVersion, startTime, 0, 0, 0, JSON.stringify({ trigger: 'MANUAL_OR_PIPELINE' }));
  const runId = runInfo.lastInsertRowid as number;

  try {
    const obsCount = Number((db.prepare('SELECT COUNT(*) as c FROM career_learning_observations').get() as any)?.c || 0);

    // 1. Run Optimizers
    const calib = calculateFitCalibration();
    const channelRes = analyzeChannelPerformance();
    const evidenceRes = analyzeEvidencePerformance();
    const domainRes = analyzeDomainPerformance();
    const proposalRes = analyzeProposalPerformance();

    const allInsights: CareerOptimizationInsight[] = [
      ...calib.insights,
      ...channelRes.insights,
      ...evidenceRes.insights,
      ...domainRes.insights,
      ...proposalRes.insights
    ];

    // Transaction for saving run outputs
    const transaction = db.transaction(() => {
      // Mark old insights SUPERSEDED
      db.prepare("UPDATE career_optimization_insights SET status = 'SUPERSEDED' WHERE status = 'ACTIVE'").run();

      // Persist new insights
      const insStmt = db.prepare(`
        INSERT INTO career_optimization_insights (
          dimension, segment, metric, observed_value, baseline_value,
          delta, sample_size, confidence, status, recommendation,
          explanation, algorithm_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
      `);

      for (const ins of allInsights) {
        insStmt.run(
          ins.dimension,
          ins.segment,
          ins.metric,
          ins.observedValue,
          ins.baselineValue,
          ins.delta,
          ins.sampleSize,
          ins.confidence,
          ins.recommendation,
          ins.explanation,
          algorithmVersion,
          startTime
        );
      }

      // 2. Compute and persist Expected Values for all opportunities
      db.prepare('DELETE FROM career_expected_values').run();
      const opps = listOpportunities();
      const evStmt = db.prepare(`
        INSERT INTO career_expected_values (
          opportunity_id, fit_probability, response_probability, interview_probability,
          offer_probability, win_probability, expected_revenue, expected_time_cost_hours,
          expected_value, confidence, algorithm_version, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const opp of opps) {
        if (opp.id) {
          const ev = calculateOpportunityExpectedValue(opp.id);
          evStmt.run(
            ev.opportunityId,
            ev.fitProbability,
            ev.responseProbability,
            ev.interviewProbability,
            ev.offerProbability,
            ev.winProbability,
            ev.expectedRevenue,
            ev.expectedTimeCostHours,
            ev.expectedValue,
            ev.confidence,
            algorithmVersion,
            startTime
          );
        }
      }

      // 3. Generate Adaptation Proposals (NO AUTO-TUNING MANDATE)
      // High-confidence or strong observational insights generate proposals for HUMAN REVIEW
      const propStmt = db.prepare(`
        INSERT INTO career_adaptation_proposals (
          dimension, current_value, proposed_value, rationale,
          supporting_insights_json, sample_size, confidence, expected_impact,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?)
      `);

      const highConfInsights = allInsights.filter(i => i.confidence === 'HIGH_CONFIDENCE' || (i.confidence === 'OBSERVATIONAL' && Math.abs(i.delta) >= 20));
      for (const ins of highConfInsights) {
        propStmt.run(
          ins.dimension,
          `Baseline: ${ins.baselineValue}%`,
          `Adjusted: ${ins.observedValue}%`,
          ins.explanation,
          JSON.stringify([ins]),
          ins.sampleSize,
          ins.confidence,
          `Expected impact: ${ins.delta > 0 ? '+' : ''}${ins.delta}% on ${ins.metric}`,
          startTime
        );
      }
    });

    transaction();

    const endTime = new Date().toISOString();
    const adaptationsCount = allInsights.filter(i => i.confidence === 'HIGH_CONFIDENCE' || (i.confidence === 'OBSERVATIONAL' && Math.abs(i.delta) >= 20)).length;

    db.prepare(`
      UPDATE career_optimization_runs SET
        completed_at = ?,
        observations_count = ?,
        insights_generated = ?,
        adaptations_proposed = ?,
        status = 'COMPLETED'
      WHERE id = ?
    `).run(endTime, obsCount, allInsights.length, adaptationsCount, runId);

    return getOptimizationSnapshot();
  } catch (err: any) {
    db.prepare(`
      UPDATE career_optimization_runs SET
        completed_at = ?,
        status = 'FAILED',
        metadata_json = ?
      WHERE id = ?
    `).run(new Date().toISOString(), JSON.stringify({ error: err.message }), runId);
    throw err;
  }
}

export function getOptimizationSnapshot(): CareerOptimizationSnapshot {
  const db = getDb();
  const obsCount = Number((db.prepare('SELECT COUNT(*) as c FROM career_learning_observations').get() as any)?.c || 0);

  const calib = calculateFitCalibration();
  const channelRes = analyzeChannelPerformance();
  const domainRes = analyzeDomainPerformance();
  const evidenceRes = analyzeEvidencePerformance();
  const proposalRes = analyzeProposalPerformance();

  const proposals = db.prepare('SELECT * FROM career_adaptation_proposals ORDER BY created_at DESC LIMIT 10').all() as any[];
  const evs = db.prepare('SELECT * FROM career_expected_values ORDER BY expected_value DESC LIMIT 10').all() as any[];
  const lastRun = db.prepare('SELECT * FROM career_optimization_runs ORDER BY started_at DESC LIMIT 1').get() as any;

  let confidenceLevel: 'INSUFFICIENT_DATA' | 'OBSERVATIONAL' | 'HIGH_CONFIDENCE' = 'INSUFFICIENT_DATA';
  if (obsCount >= 30) confidenceLevel = 'HIGH_CONFIDENCE';
  else if (obsCount >= 10) confidenceLevel = 'OBSERVATIONAL';

  return {
    totalObservations: obsCount,
    confidenceLevel,
    fitCalibration: calib.buckets,
    channelInsights: channelRes.insights,
    domainInsights: domainRes.insights,
    evidenceInsights: evidenceRes.insights,
    proposalInsights: proposalRes.insights,
    adaptationProposals: proposals.map(p => ({
      id: p.id,
      dimension: p.dimension,
      currentValue: p.current_value,
      proposedValue: p.proposed_value,
      rationale: p.rationale,
      supportingInsightsJson: p.supporting_insights_json,
      sampleSize: p.sample_size,
      confidence: p.confidence,
      expectedImpact: p.expected_impact,
      status: p.status,
      createdAt: p.created_at,
      reviewedAt: p.reviewed_at
    })),
    topExpectedValues: evs.map(e => ({
      id: e.id,
      opportunityId: e.opportunity_id,
      fitProbability: e.fit_probability,
      responseProbability: e.response_probability,
      interviewProbability: e.interview_probability,
      offerProbability: e.offer_probability,
      winProbability: e.win_probability,
      expectedRevenue: e.expected_revenue,
      expectedTimeCostHours: e.expected_time_cost_hours,
      expectedValue: e.expected_value,
      confidence: e.confidence,
      algorithmVersion: e.algorithm_version,
      calculatedAt: e.calculated_at
    })),
    lastRun: lastRun ? {
      id: lastRun.id,
      algorithmVersion: lastRun.algorithm_version,
      startedAt: lastRun.started_at,
      completedAt: lastRun.completed_at,
      observationsCount: lastRun.observations_count,
      insightsGenerated: lastRun.insights_generated,
      adaptationsProposed: lastRun.adaptations_proposed,
      status: lastRun.status,
      metadataJson: lastRun.metadata_json
    } : null,
    calculatedAt: new Date().toISOString()
  };
}
