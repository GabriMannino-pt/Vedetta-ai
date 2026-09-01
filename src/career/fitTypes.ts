import { ApplicationRecommendation, FitScoreBreakdown, FitExplanation, FitEvaluationResult } from '../types';

export const FIT_ALGORITHM_VERSION = 1;

export const FIT_WEIGHTS = {
  TECHNICAL: 0.30,
  EXPERIENCE: 0.15,
  SENIORITY: 0.10,
  DOMAIN: 0.10,
  REMOTE: 0.05,
  LANGUAGE: 0.05,
  MUST_HAVE: 0.15,
  EVIDENCE: 0.10
} as const;

export interface RequirementMatchDetail {
  requirementId?: number;
  name: string;
  normalizedName: string;
  category: string;
  priority: string;
  requiredYears: number | null;
  candidateSkillLevel?: string;
  matched: boolean;
  partial: boolean;
  matchScore: number; // 0-100
  evidenceLevel: number; // 0, 25, 50, 75, 100
  evidenceSource?: string;
  isCritical: boolean;
}
