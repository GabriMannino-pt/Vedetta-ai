import { getDb } from '../storage/db';
import { CareerExpectedValue, CareerOptimizationStatus } from '../types';
import { getOpportunity } from './careerOpportunities';

export function calculateOpportunityExpectedValue(opportunityId: number): CareerExpectedValue {
  const opp = getOpportunity(opportunityId);
  if (!opp) {
    throw new Error(`Opportunity ID ${opportunityId} not found`);
  }

  const db = getDb();
  const obsCount = Number((db.prepare('SELECT COUNT(*) as c FROM career_learning_observations').get() as any)?.c || 0);

  const fitScore = opp.fit_score ?? 50;
  const fitNorm = Math.max(0, Math.min(100, fitScore)) / 100;

  // Determine estimated target revenue
  let expectedRevenue = 3000; // default baseline value
  if (opp.salary_max) expectedRevenue = opp.salary_max;
  else if (opp.salary_min) expectedRevenue = opp.salary_min;
  else if (opp.hourly_rate_min) expectedRevenue = opp.hourly_rate_min * 80; // est 80h project

  const expectedTimeCostHours = 4; // Est. preparation, research & interview time

  if (obsCount < 10) {
    // ⚠️ NO FABRICATED PROBABILITIES RULE:
    // With insufficient sample, declare INSUFFICIENT_DATA and derive deterministic baseline from Fit Match.
    const fitProb = fitNorm;
    const responseProb = Math.round(fitNorm * 0.50 * 1000) / 1000;
    const interviewProb = Math.round(fitNorm * 0.35 * 1000) / 1000;
    const offerProb = Math.round(fitNorm * 0.20 * 1000) / 1000;
    const winProb = Math.round(fitNorm * 0.15 * 1000) / 1000;
    const expectedValue = Math.round(winProb * expectedRevenue);

    return {
      opportunityId,
      fitProbability: fitProb,
      responseProbability: responseProb,
      interviewProbability: interviewProb,
      offerProbability: offerProb,
      winProbability: winProb,
      expectedRevenue,
      expectedTimeCostHours,
      expectedValue,
      confidence: 'INSUFFICIENT_DATA',
      algorithmVersion: 1,
      calculatedAt: new Date().toISOString()
    };
  }

  // With historical observations (>= 10), compute empirical conversion chain
  const obs = db.prepare('SELECT * FROM career_learning_observations').all() as any[];
  const submittedCount = obs.length;
  const responsesCount = obs.filter(r => r.outcome !== 'SUBMITTED').length;
  const interviewsCount = obs.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const offersCount = obs.filter(r => ['OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const winsCount = obs.filter(r => r.outcome === 'WON').length;

  const baseResponseRate = submittedCount > 0 ? Math.max(0.2, responsesCount / submittedCount) : 0.5;
  const baseInterviewRate = responsesCount > 0 ? Math.max(0.1, interviewsCount / responsesCount) : 0.4;
  const baseOfferRate = interviewsCount > 0 ? Math.max(0.1, offersCount / interviewsCount) : 0.3;
  const baseWinRate = offersCount > 0 ? Math.max(0.1, winsCount / offersCount) : 0.7;

  // Weight by fit multiplier [0.6 - 1.4]
  const fitWeight = 0.6 + (fitNorm * 0.8);
  const responseProb = Math.min(0.95, Math.round(baseResponseRate * fitWeight * 1000) / 1000);
  const interviewProb = Math.min(0.90, Math.round(responseProb * baseInterviewRate * 1000) / 1000);
  const offerProb = Math.min(0.85, Math.round(interviewProb * baseOfferRate * 1000) / 1000);
  const winProb = Math.min(0.80, Math.round(offerProb * baseWinRate * 1000) / 1000);

  const expectedValue = Math.round(winProb * expectedRevenue);
  const confidence: CareerOptimizationStatus = obsCount >= 30 ? 'HIGH_CONFIDENCE' : 'OBSERVATIONAL';

  return {
    opportunityId,
    fitProbability: fitNorm,
    responseProbability: responseProb,
    interviewProbability: interviewProb,
    offerProbability: offerProb,
    winProbability: winProb,
    expectedRevenue,
    expectedTimeCostHours,
    expectedValue,
    confidence,
    algorithmVersion: 1,
    calculatedAt: new Date().toISOString()
  };
}
