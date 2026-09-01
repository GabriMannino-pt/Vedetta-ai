import { getDb } from '../storage/db';
import { CareerOptimizationInsight, CareerOptimizationStatus } from '../types';

export function analyzeEvidencePerformance(): {
  evidenceLevels: any[];
  insights: CareerOptimizationInsight[];
} {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_learning_observations').all() as any[];
  const totalObs = rows.length;
  const globalInterviews = rows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const baselineRate = totalObs > 0 ? (globalInterviews / totalObs) * 100 : 0;

  const levelMap = new Map<string, any[]>();
  for (const r of rows) {
    let lvl = 'DECLARED';
    if ((r.evidence_score ?? 0) >= 80) lvl = 'GITHUB_CODE';
    else if ((r.evidence_score ?? 0) >= 60) lvl = 'PORTFOLIO';

    if (!levelMap.has(lvl)) levelMap.set(lvl, []);
    levelMap.get(lvl)!.push(r);
  }

  const evidenceLevels: any[] = [];
  const insights: CareerOptimizationInsight[] = [];

  for (const [lvl, lvlRows] of levelMap.entries()) {
    const count = lvlRows.length;
    const interviews = lvlRows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
    const wins = lvlRows.filter(r => r.outcome === 'WON').length;
    const interviewRate = Math.round((interviews / count) * 1000) / 10;
    const delta = Math.round((interviewRate - baselineRate) * 10) / 10;

    let confidence: CareerOptimizationStatus = 'INSUFFICIENT_DATA';
    if (count >= 30) confidence = 'HIGH_CONFIDENCE';
    else if (count >= 10) confidence = 'OBSERVATIONAL';

    evidenceLevels.push({
      level: lvl,
      sampleSize: count,
      interviewRate,
      winRate: Math.round((wins / count) * 1000) / 10,
      deltaVsBaseline: delta,
      confidence
    });

    if (count >= 10 && delta >= 15) {
      insights.push({
        dimension: 'EVIDENCE',
        segment: lvl,
        metric: 'interview_conversion',
        observedValue: interviewRate,
        baselineValue: Math.round(baselineRate * 10) / 10,
        delta,
        sampleSize: count,
        confidence,
        status: 'ACTIVE',
        recommendation: 'PREFER_EVIDENCE',
        explanation: `Evidence level ${lvl} increases interview conversion by +${delta}% over baseline.`,
        algorithmVersion: 1
      });
    }
  }

  return { evidenceLevels, insights };
}
