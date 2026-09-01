import { getDb } from '../storage/db';
import { CareerOptimizationInsight, CareerOptimizationStatus } from '../types';

export function analyzeDomainPerformance(): {
  domains: any[];
  insights: CareerOptimizationInsight[];
} {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_learning_observations').all() as any[];
  const totalObs = rows.length;
  const globalInterviews = rows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const baselineRate = totalObs > 0 ? (globalInterviews / totalObs) * 100 : 0;

  const domainMap = new Map<string, any[]>();
  for (const r of rows) {
    let dom = 'SAAS_WEB';
    if ((r.domain_match ?? 0) >= 80) dom = 'AI_LLM';
    else if ((r.domain_match ?? 0) >= 60) dom = 'AUTOMATION';

    if (!domainMap.has(dom)) domainMap.set(dom, []);
    domainMap.get(dom)!.push(r);
  }

  const domains: any[] = [];
  const insights: CareerOptimizationInsight[] = [];

  for (const [dom, domRows] of domainMap.entries()) {
    const count = domRows.length;
    const interviews = domRows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
    const wins = domRows.filter(r => r.outcome === 'WON').length;
    const revenue = domRows.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const interviewRate = Math.round((interviews / count) * 1000) / 10;
    const delta = Math.round((interviewRate - baselineRate) * 10) / 10;

    let confidence: CareerOptimizationStatus = 'INSUFFICIENT_DATA';
    if (count >= 30) confidence = 'HIGH_CONFIDENCE';
    else if (count >= 10) confidence = 'OBSERVATIONAL';

    domains.push({
      domain: dom,
      sampleSize: count,
      interviewRate,
      winRate: Math.round((wins / count) * 1000) / 10,
      totalRevenue: revenue,
      deltaVsBaseline: delta,
      confidence
    });

    if (count >= 10 && delta >= 15) {
      insights.push({
        dimension: 'DOMAIN',
        segment: dom,
        metric: 'interview_conversion',
        observedValue: interviewRate,
        baselineValue: Math.round(baselineRate * 10) / 10,
        delta,
        sampleSize: count,
        confidence,
        status: 'ACTIVE',
        recommendation: 'PREFER_DOMAIN',
        explanation: `Domain ${dom} generates superior conversion (+${delta}% interview rate).`,
        algorithmVersion: 1
      });
    }
  }

  return { domains, insights };
}
