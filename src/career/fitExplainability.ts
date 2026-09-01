import { ApplicationRecommendation, FitExplanation, FitScoreBreakdown } from '../types';
import { RequirementMatchDetail } from './fitTypes';

export function buildFitExplanation(
  fitScore: number,
  breakdown: FitScoreBreakdown,
  criticalGap: boolean,
  matchDetails: RequirementMatchDetail[],
  seniorityDiffLabel?: string,
  experienceGapLabel?: string
): FitExplanation {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const criticalGaps: string[] = [];
  const matchedRequirements: string[] = [];
  const missingRequirements: string[] = [];
  const evidenceHighlights: string[] = [];

  for (const m of matchDetails) {
    if (m.matched) {
      matchedRequirements.push(`${m.name} (${m.priority})`);
      if (m.evidenceLevel >= 75) {
        evidenceHighlights.push(`Verified evidence for ${m.name} (${m.evidenceSource || 'Code/Production'})`);
      }
    } else if (m.partial) {
      gaps.push(`Partial match for ${m.name} (Match score: ${m.matchScore}%)`);
      if (m.priority === 'MUST_HAVE') {
        missingRequirements.push(`${m.name} (MUST_HAVE, partial)`);
      }
    } else {
      missingRequirements.push(`${m.name} (${m.priority})`);
      if (m.priority === 'MUST_HAVE' && m.category === 'TECHNICAL') {
        criticalGaps.push(`Missing critical must-have technical skill: ${m.name}`);
      } else {
        gaps.push(`Missing requirement: ${m.name} (${m.priority})`);
      }
    }
  }

  // Technical strengths
  if (breakdown.technicalMatch >= 85) {
    strengths.push(`High technical capability alignment (${breakdown.technicalMatch}%)`);
  }
  if (breakdown.mustHaveCoverage >= 85) {
    strengths.push(`Strong core requirements coverage (${breakdown.mustHaveCoverage}%)`);
  }
  if (breakdown.evidenceStrength >= 75) {
    strengths.push(`Solid verified evidence across required tech stack (${breakdown.evidenceStrength}%)`);
  }
  if (breakdown.domainMatch >= 80) {
    strengths.push('Strong domain and industry alignment');
  }
  if (breakdown.remoteMatch >= 80) {
    strengths.push('Full remote/location preference alignment');
  }

  // Experience / Seniority labels
  if (seniorityDiffLabel) {
    if (breakdown.seniorityMatch >= 85) {
      strengths.push(`Seniority match: ${seniorityDiffLabel}`);
    } else {
      gaps.push(`Seniority gap: ${seniorityDiffLabel}`);
    }
  }
  if (experienceGapLabel) {
    if (breakdown.experienceMatch >= 85) {
      strengths.push(`Experience alignment: ${experienceGapLabel}`);
    } else {
      gaps.push(`Experience shortfall: ${experienceGapLabel}`);
    }
  }

  // Recommendation Determination
  let recommendation: ApplicationRecommendation;
  if (fitScore >= 85) {
    recommendation = 'STRONG_MATCH';
  } else if (fitScore >= 70) {
    recommendation = 'GOOD_MATCH';
  } else if (fitScore >= 55) {
    recommendation = 'POSSIBLE_MATCH';
  } else if (fitScore >= 40) {
    recommendation = 'LOW_PRIORITY';
  } else {
    recommendation = 'DO_NOT_APPLY';
  }

  // Safety rule for critical gap
  if (criticalGap) {
    if (recommendation === 'STRONG_MATCH' || recommendation === 'GOOD_MATCH' || recommendation === 'POSSIBLE_MATCH') {
      recommendation = 'LOW_PRIORITY';
    }
  }

  return {
    strengths,
    gaps,
    criticalGaps,
    matchedRequirements,
    missingRequirements,
    evidenceHighlights,
    recommendation
  };
}
