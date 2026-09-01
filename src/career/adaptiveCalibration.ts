import { getDb } from '../storage/db';
import { CareerOptimizationInsight, CareerOptimizationStatus } from '../types';

export interface FitBucketCalibration {
  bucketLabel: string;
  minScore: number;
  maxScore: number;
  totalApplications: number;
  interviewsCount: number;
  winsCount: number;
  predictedConversionRate: number;
  observedConversionRate: number;
  delta: number;
  isOverpredicted: boolean;
  isUnderpredicted: boolean;
  confidence: CareerOptimizationStatus;
}

export function calculateFitCalibration(): {
  buckets: FitBucketCalibration[];
  totalSample: number;
  insights: CareerOptimizationInsight[];
} {
  const db = getDb();
  const bucketDefs = [
    { label: '90-100', min: 90, max: 100, predictedRate: 70 },
    { label: '80-89', min: 80, max: 89, predictedRate: 55 },
    { label: '70-79', min: 70, max: 79, predictedRate: 40 },
    { label: '60-69', min: 60, max: 69, predictedRate: 25 },
    { label: '<60', min: 0, max: 59, predictedRate: 10 }
  ];

  const rows = db.prepare('SELECT * FROM career_learning_observations WHERE fit_score IS NOT NULL').all() as any[];
  const totalSample = rows.length;

  const buckets: FitBucketCalibration[] = [];
  const insights: CareerOptimizationInsight[] = [];

  for (const def of bucketDefs) {
    const bucketRows = rows.filter(r => r.fit_score >= def.min && r.fit_score <= def.max);
    const count = bucketRows.length;
    const interviews = bucketRows.filter(r => ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETED', 'OFFER_RECEIVED', 'WON'].includes(r.outcome)).length;
    const wins = bucketRows.filter(r => r.outcome === 'WON').length;

    const observedRate = count > 0 ? Math.round((interviews / count) * 1000) / 10 : 0;
    const delta = Math.round((observedRate - def.predictedRate) * 10) / 10;

    let confidence: CareerOptimizationStatus = 'INSUFFICIENT_DATA';
    if (count >= 30) confidence = 'HIGH_CONFIDENCE';
    else if (count >= 10) confidence = 'OBSERVATIONAL';

    const isOverpredicted = count >= 10 && delta <= -15;
    const isUnderpredicted = count >= 10 && delta >= 15;

    buckets.push({
      bucketLabel: def.label,
      minScore: def.min,
      maxScore: def.max,
      totalApplications: count,
      interviewsCount: interviews,
      winsCount: wins,
      predictedConversionRate: def.predictedRate,
      observedConversionRate: observedRate,
      delta,
      isOverpredicted,
      isUnderpredicted,
      confidence
    });

    if (count >= 10) {
      if (isOverpredicted) {
        insights.push({
          dimension: 'FIT_CALIBRATION',
          segment: def.label,
          metric: 'interview_conversion',
          observedValue: observedRate,
          baselineValue: def.predictedRate,
          delta,
          sampleSize: count,
          confidence,
          status: 'ACTIVE',
          recommendation: 'RECALIBRATE_SCORE',
          explanation: `Fit bucket ${def.label} appears overpredicted by ${Math.abs(delta)}% compared to actual interview rate.`,
          algorithmVersion: 1
        });
      } else if (isUnderpredicted) {
        insights.push({
          dimension: 'FIT_CALIBRATION',
          segment: def.label,
          metric: 'interview_conversion',
          observedValue: observedRate,
          baselineValue: def.predictedRate,
          delta,
          sampleSize: count,
          confidence,
          status: 'ACTIVE',
          recommendation: 'INCREASE_PRIORITY',
          explanation: `Fit bucket ${def.label} outperforms expectation with a +${delta}% delta in interview conversion.`,
          algorithmVersion: 1
        });
      }
    }
  }

  return { buckets, totalSample, insights };
}
