import {
  CareerProfile,
  CareerOpportunity,
  CareerRequirement,
  FitEvaluationResult,
  MatchedRequirementEvidence,
  ApplicationStrategy
} from '../types';

export function generateApplicationStrategy(
  profile: CareerProfile,
  opportunity: CareerOpportunity,
  requirements: CareerRequirement[],
  fitEvaluation: FitEvaluationResult,
  matchedEvidence: MatchedRequirementEvidence[]
): ApplicationStrategy {
  // 1. Top Strengths (max 5)
  const topStrengths: string[] = [];
  const supportedItems = matchedEvidence.filter(m => m.support_level === 'VERIFIED' || m.support_level === 'STRONG');
  for (const item of supportedItems.slice(0, 5)) {
    topStrengths.push(`Proven expertise in ${item.requirement_name} (${item.match_reason})`);
  }

  if (topStrengths.length === 0 && fitEvaluation.explanation.strengths.length > 0) {
    topStrengths.push(...fitEvaluation.explanation.strengths.slice(0, 3));
  }

  // 2. Top Evidence (max 5, prioritized)
  const topEvidence = matchedEvidence
    .filter(m => m.evidence_id !== undefined)
    .sort((a, b) => {
      const rankA = a.support_level === 'VERIFIED' ? 2 : a.support_level === 'STRONG' ? 1 : 0;
      const rankB = b.support_level === 'VERIFIED' ? 2 : b.support_level === 'STRONG' ? 1 : 0;
      return rankB - rankA;
    })
    .slice(0, 5);

  // 3. Positioning Angle
  let positioningAngle = 'Hands-on Software & Systems Engineer';
  const roleTitle = (opportunity.title || '').toLowerCase();
  if (roleTitle.includes('ai') || roleTitle.includes('llm') || roleTitle.includes('machine learning')) {
    positioningAngle = 'Production AI & LLM Systems Architect';
  } else if (roleTitle.includes('automation') || roleTitle.includes('workflow')) {
    positioningAngle = 'Autonomous Workflow & Automation Specialist';
  } else if (roleTitle.includes('full stack') || roleTitle.includes('frontend')) {
    positioningAngle = 'Full Stack Technical Lead';
  } else if (roleTitle.includes('backend') || roleTitle.includes('node') || roleTitle.includes('python')) {
    positioningAngle = 'High-Reliability Backend & Distributed Systems Engineer';
  }

  // 4. Tone Determination
  let recommendedTone: ApplicationStrategy['recommended_tone'] = 'TECHNICAL';
  if (roleTitle.includes('consultant') || roleTitle.includes('advisor')) {
    recommendedTone = 'CONSULTING';
  } else if (roleTitle.includes('automation')) {
    recommendedTone = 'AUTOMATION';
  } else if (roleTitle.includes('ai') || roleTitle.includes('llm')) {
    recommendedTone = 'AI';
  } else if (opportunity.opportunity_type === 'CONTRACT' || opportunity.opportunity_type === 'FREELANCE') {
    recommendedTone = 'FREELANCE';
  }

  // 5. Recommended Rate
  let recommendedRate: number | null = null;
  if (opportunity.hourly_rate_min && opportunity.hourly_rate_max) {
    recommendedRate = Math.round((opportunity.hourly_rate_min + opportunity.hourly_rate_max) / 2);
  } else if (opportunity.hourly_rate_max) {
    recommendedRate = opportunity.hourly_rate_max;
  } else if (profile.target_hourly_rate) {
    recommendedRate = profile.target_hourly_rate;
  }

  // 6. Why Fit Synthesis
  const whyFit = `Direct technical compatibility (${fitEvaluation.fitScore}% Fit Score) across core requirements, backed by ${topEvidence.length} verified production/code proofs.`;

  return {
    why_fit: whyFit,
    top_strengths: topStrengths,
    top_evidence: topEvidence,
    critical_gaps: fitEvaluation.explanation.criticalGaps || [],
    positioning_angle: positioningAngle,
    recommended_rate: recommendedRate,
    recommended_tone: recommendedTone,
    recommended_structure: [
      'Hook citing specific role challenge',
      'Relevant background and core stack match',
      'Proof points with concrete verified repository and project evidence',
      'Execution plan / immediate value proposition',
      'Professional CTA'
    ]
  };
}
