import { CareerRequirement, CareerSkill, CareerEvidence, MatchedRequirementEvidence, ClaimSupportLevel } from '../types';
import { normalizeSkillName } from './requirementExtractor';
import { getSkillName } from './fitScorer';

export function matchRequirementToEvidence(
  req: CareerRequirement,
  skills: CareerSkill[],
  evidences: CareerEvidence[]
): MatchedRequirementEvidence {
  const norm = normalizeSkillName(req.name);

  // 1. Find matching skill
  const matchedSkill = skills.find(s => normalizeSkillName(getSkillName(s)) === norm);

  // 2. Find matching evidence
  const matchingEvidences = evidences.filter(e => {
    const titleNorm = normalizeSkillName(e.title);
    const descLower = (e.description || '').toLowerCase();
    return titleNorm.includes(norm) || descLower.includes(norm) || (matchedSkill && e.skill_id === matchedSkill.id);
  });

  // Rank matching evidences by proof strength
  let bestEvidence: CareerEvidence | undefined;
  let supportLevel: ClaimSupportLevel = 'UNSUPPORTED';
  let matchReason = 'No matching skill or evidence found';

  if (matchingEvidences.length > 0) {
    // Check verified production
    const verified = matchingEvidences.find(e => Boolean(e.verified));
    const github = matchingEvidences.find(e => e.source_type === 'GITHUB' || (e.source_url || '').includes('github.com'));
    
    if (verified) {
      bestEvidence = verified;
      supportLevel = 'VERIFIED';
      matchReason = `Verified production proof: "${verified.title}"`;
    } else if (github) {
      bestEvidence = github;
      supportLevel = 'STRONG';
      matchReason = `GitHub repository proof: "${github.title}"`;
    } else {
      bestEvidence = matchingEvidences[0];
      supportLevel = 'STRONG';
      matchReason = `Portfolio project proof: "${bestEvidence.title}"`;
    }
  } else if (matchedSkill) {
    supportLevel = 'PARTIAL';
    matchReason = `Declared profile skill: ${matchedSkill.level} level`;
  }

  return {
    requirement_name: req.name,
    normalized_name: norm,
    category: req.category,
    priority: req.priority,
    skill_id: matchedSkill?.id,
    skill_name: matchedSkill ? getSkillName(matchedSkill) : undefined,
    skill_level: matchedSkill?.level,
    evidence_id: bestEvidence?.id,
    evidence_title: bestEvidence?.title,
    evidence_type: bestEvidence?.type,
    source_type: bestEvidence?.source_type,
    source_url: bestEvidence?.source_url,
    verified: Boolean(bestEvidence?.verified),
    support_level: supportLevel,
    match_reason: matchReason
  };
}

export function matchOpportunityEvidence(
  requirements: CareerRequirement[],
  skills: CareerSkill[],
  evidences: CareerEvidence[]
): MatchedRequirementEvidence[] {
  return requirements.map(req => matchRequirementToEvidence(req, skills, evidences));
}

export function rankEvidence(evidences: CareerEvidence[]): CareerEvidence[] {
  return [...evidences].sort((a, b) => {
    const scoreA = (a.verified ? 100 : 0) + (a.source_type === 'GITHUB' ? 50 : 20);
    const scoreB = (b.verified ? 100 : 0) + (b.source_type === 'GITHUB' ? 50 : 20);
    return scoreB - scoreA;
  });
}
