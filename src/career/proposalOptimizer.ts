import { getDb } from '../storage/db';
import { CareerOptimizationInsight, CareerOptimizationStatus } from '../types';

export function analyzeProposalPerformance(): {
  strategies: any[];
  insights: CareerOptimizationInsight[];
} {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_learning_observations').all() as any[];
  const totalObs = rows.length;
  const globalInterviews = rows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const baselineRate = totalObs > 0 ? (globalInterviews / totalObs) * 100 : 0;

  const strategyMap = new Map<string, any[]>();
  for (const r of rows) {
    let st = 'GENERAL';
    if (r.recommendation === 'STRONG_MATCH') st = 'TECHNICAL_EXPERT';
    else if (r.recommendation === 'GOOD_MATCH') st = 'SENIOR_SPECIALIST';

    if (!strategyMap.has(st)) strategyMap.set(st, []);
    strategyMap.get(st)!.push(r);
  }

  const strategies: any[] = [];
  const insights: CareerOptimizationInsight[] = [];

  for (const [st, stRows] of strategyMap.entries()) {
    const count = stRows.length;
    const interviews = stRows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
    const wins = stRows.filter(r => r.outcome === 'WON').length;
    const interviewRate = Math.round((interviews / count) * 1000) / 10;
    const delta = Math.round((interviewRate - baselineRate) * 10) / 10;

    let confidence: CareerOptimizationStatus = 'INSUFFICIENT_DATA';
    if (count >= 30) confidence = 'HIGH_CONFIDENCE';
    else if (count >= 10) confidence = 'OBSERVATIONAL';

    strategies.push({
      positioning: st,
      sampleSize: count,
      interviewRate,
      winRate: Math.round((wins / count) * 1000) / 10,
      deltaVsBaseline: delta,
      confidence
    });

    if (count >= 10 && delta >= 15) {
      insights.push({
        dimension: 'PROPOSAL_STRATEGY',
        segment: st,
        metric: 'interview_conversion',
        observedValue: interviewRate,
        baselineValue: Math.round(baselineRate * 10) / 10,
        delta,
        sampleSize: count,
        confidence,
        status: 'ACTIVE',
        recommendation: 'ADJUST_STRATEGY',
        explanation: `Proposal strategy '${st}' produces +${delta}% higher interview rate.`,
        algorithmVersion: 1
      });
    }
  }

  return { strategies, insights };
}
