import { getOpportunity } from './careerOpportunities';
import { calculateOpportunityExpectedValue } from './expectedValue';
import { analyzeChannelPerformance } from './channelOptimizer';
import { analyzeEvidencePerformance } from './evidenceOptimizer';
import { analyzeDomainPerformance } from './domainOptimizer';
import { CareerOptimizationStatus } from '../types';

export interface RecommendedStrategyReport {
  opportunityId: number;
  recommendedChannel: string;
  evidenceEmphasis: string;
  positioningFocus: string;
  expectedValueEur: number;
  winProbabilityPercent: number;
  confidence: CareerOptimizationStatus;
  strategicRationale: string[];
}

export function getRecommendedStrategy(opportunityId: number): RecommendedStrategyReport {
  const opp = getOpportunity(opportunityId);
  if (!opp) {
    throw new Error(`Opportunity ID ${opportunityId} not found`);
  }

  const ev = calculateOpportunityExpectedValue(opportunityId);
  const channelAnalysis = analyzeChannelPerformance();
  const evidenceAnalysis = analyzeEvidencePerformance();

  // Determine preferred channel based on empirical data or opportunity source
  let recommendedChannel = opp.source || 'DIRECT';
  const bestChannel = channelAnalysis.channels.sort((a, b) => b.winRate - a.winRate)[0];
  if (bestChannel && bestChannel.confidence !== 'INSUFFICIENT_DATA' && bestChannel.deltaVsBaseline > 10) {
    recommendedChannel = bestChannel.channel;
  }

  // Determine evidence emphasis
  let evidenceEmphasis = 'PORTFOLIO';
  const bestEvidence = evidenceAnalysis.evidenceLevels.sort((a, b) => b.interviewRate - a.interviewRate)[0];
  if (bestEvidence && bestEvidence.confidence !== 'INSUFFICIENT_DATA') {
    evidenceEmphasis = bestEvidence.level;
  } else {
    evidenceEmphasis = 'GITHUB_CODE';
  }

  // Determine positioning
  const positioningFocus = opp.role_focus_json ? JSON.parse(opp.role_focus_json)[0] || 'Technical Specialist' : 'Senior Specialist';

  const rationale: string[] = [];
  rationale.push(`Fit Score: ${opp.fit_score ?? 'N/A'}% with EV: €${ev.expectedValue.toLocaleString()}`);
  if (ev.confidence === 'INSUFFICIENT_DATA') {
    rationale.push('Dataset in baseline phase (<10 observations); using deterministic fit prior.');
  } else {
    rationale.push(`Empirical conversion modeled with ${ev.confidence} confidence.`);
  }

  return {
    opportunityId,
    recommendedChannel,
    evidenceEmphasis,
    positioningFocus,
    expectedValueEur: ev.expectedValue,
    winProbabilityPercent: Math.round(ev.winProbability * 100),
    confidence: ev.confidence,
    strategicRationale: rationale
  };
}
