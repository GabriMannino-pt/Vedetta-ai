import { getDb } from '../storage/db';
import { CareerOptimizationInsight, CareerOptimizationStatus } from '../types';

export function analyzeChannelPerformance(): {
  channels: any[];
  insights: CareerOptimizationInsight[];
} {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_learning_observations WHERE channel IS NOT NULL').all() as any[];
  const totalObs = rows.length;
  const globalInterviews = rows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
  const baselineRate = totalObs > 0 ? (globalInterviews / totalObs) * 100 : 0;

  const channelMap = new Map<string, any[]>();
  for (const r of rows) {
    const ch = r.channel || 'OTHER';
    if (!channelMap.has(ch)) channelMap.set(ch, []);
    channelMap.get(ch)!.push(r);
  }

  const channels: any[] = [];
  const insights: CareerOptimizationInsight[] = [];

  for (const [ch, chRows] of channelMap.entries()) {
    const count = chRows.length;
    const interviews = chRows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
    const wins = chRows.filter(r => r.outcome === 'WON').length;
    const revenue = chRows.reduce((sum, r) => sum + (r.revenue || 0), 0);

    const interviewRate = Math.round((interviews / count) * 1000) / 10;
    const winRate = Math.round((wins / count) * 1000) / 10;
    const delta = Math.round((interviewRate - baselineRate) * 10) / 10;

    let confidence: CareerOptimizationStatus = 'INSUFFICIENT_DATA';
    if (count >= 30) confidence = 'HIGH_CONFIDENCE';
    else if (count >= 10) confidence = 'OBSERVATIONAL';

    channels.push({
      channel: ch,
      sampleSize: count,
      interviewRate,
      winRate,
      totalRevenue: revenue,
      revenuePerApplication: count > 0 ? Math.round(revenue / count) : 0,
      deltaVsBaseline: delta,
      confidence
    });

    if (count >= 10 && delta >= 15) {
      insights.push({
        dimension: 'CHANNEL',
        segment: ch,
        metric: 'interview_conversion',
        observedValue: interviewRate,
        baselineValue: Math.round(baselineRate * 10) / 10,
        delta,
        sampleSize: count,
        confidence,
        status: 'ACTIVE',
        recommendation: 'PREFER_CHANNEL',
        explanation: `Channel ${ch} significantly outperforms baseline conversion (+${delta}% interview rate).`,
        algorithmVersion: 1
      });
    }
  }

  return { channels, insights };
}
