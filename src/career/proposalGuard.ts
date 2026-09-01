import {
  CareerProfile,
  CareerSkill,
  CareerEvidence,
  ApplicationStrategy,
  ProposalClaim,
  ProposalValidationResult,
  ProposalStatus
} from '../types';
import { normalizeSkillName } from './requirementExtractor';
import { getSkillName } from './fitScorer';

export function validateProposal(
  proposalContent: string,
  profile: CareerProfile,
  skills: CareerSkill[],
  evidences: CareerEvidence[],
  strategy: ApplicationStrategy
): ProposalValidationResult {
  const claims: ProposalClaim[] = extractClaims(proposalContent, profile, skills, evidences);
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  let supportedCount = 0;
  let unsupportedCount = 0;

  for (const claim of claims) {
    if (claim.validation_status === 'SUPPORTED') {
      supportedCount++;
    } else {
      unsupportedCount++;
      blockingReasons.push(`Unsupported claim detected (${claim.claim_type}): "${claim.claim_text}"`);
    }
  }

  // Check critical gaps from strategy
  if (strategy.critical_gaps && strategy.critical_gaps.length > 0) {
    warnings.push(`Application contains ${strategy.critical_gaps.length} critical requirement gaps.`);
  }

  const valid = unsupportedCount === 0;
  const proposalStatus: ProposalStatus = valid ? 'VALIDATED' : 'BLOCKED';

  return {
    valid,
    proposal_status: proposalStatus,
    claims_checked: claims.length,
    supported_claims: supportedCount,
    unsupported_claims: unsupportedCount,
    warnings,
    blocking_reasons: blockingReasons,
    claims
  };
}

export function extractClaims(
  content: string,
  profile: CareerProfile,
  skills: CareerSkill[],
  evidences: CareerEvidence[]
): ProposalClaim[] {
  const claims: ProposalClaim[] = [];
  const lowerContent = content.toLowerCase();

  // Known skill names normalized
  const knownSkills = skills.map(s => ({
    raw: getSkillName(s),
    norm: normalizeSkillName(getSkillName(s)),
    skill: s
  }));

  // 1. Detect claims of specific programming languages/frameworks
  const commonTechs = [
    'typescript', 'javascript', 'python', 'golang', 'ruby', 'ruby on rails',
    'java', 'rust', 'c++', 'c#', 'php', 'swift', 'kotlin', 'react', 'vue',
    'angular', 'node.js', 'docker', 'kubernetes', 'aws', 'sqlite', 'postgres'
  ];

  for (const tech of commonTechs) {
    const normTech = normalizeSkillName(tech);
    if (lowerContent.includes(tech) || lowerContent.includes(normTech)) {
      const matchingSkill = knownSkills.find(k => k.norm === normTech);
      const matchingEvidence = evidences.find(e => {
        const titleNorm = normalizeSkillName(e.title);
        const descLower = (e.description || '').toLowerCase();
        return titleNorm.includes(normTech) || descLower.includes(normTech) || (matchingSkill && e.skill_id === matchingSkill.skill.id);
      });

      if (matchingEvidence) {
        claims.push({
          proposal_id: 0,
          claim_text: `Proficiency / experience in ${tech}`,
          claim_type: 'TECHNICAL_SKILL',
          support_level: matchingEvidence.verified ? 'VERIFIED' : 'STRONG',
          evidence_id: matchingEvidence.id,
          source_reference: matchingEvidence.source_url || matchingEvidence.source_type,
          validation_status: 'SUPPORTED'
        });
      } else if (matchingSkill) {
        claims.push({
          proposal_id: 0,
          claim_text: `Proficiency / experience in ${tech}`,
          claim_type: 'TECHNICAL_SKILL',
          support_level: 'PARTIAL',
          evidence_id: undefined,
          source_reference: 'Profile Skill',
          validation_status: 'SUPPORTED'
        });
      } else {
        claims.push({
          proposal_id: 0,
          claim_text: `Claimed experience in unverified tech: ${tech}`,
          claim_type: 'TECHNICAL_SKILL',
          support_level: 'UNSUPPORTED',
          evidence_id: null,
          source_reference: null,
          validation_status: 'UNSUPPORTED'
        });
      }
    }
  }

  // 2. Detect years of experience claims
  const expMatch = content.match(/(\d+)\+?\s+years?(?:\s+of)?\s+(?:experience|building|engineering)/i);
  if (expMatch) {
    const claimedYears = parseInt(expMatch[1], 10);
    if (claimedYears > profile.years_experience) {
      claims.push({
        proposal_id: 0,
        claim_text: `Claimed ${claimedYears} years experience (Profile has ${profile.years_experience} years)`,
        claim_type: 'EXPERIENCE_YEARS',
        support_level: 'UNSUPPORTED',
        evidence_id: null,
        source_reference: null,
        validation_status: 'UNSUPPORTED'
      });
    } else {
      claims.push({
        proposal_id: 0,
        claim_text: `Claimed ${claimedYears} years experience`,
        claim_type: 'EXPERIENCE_YEARS',
        support_level: 'VERIFIED',
        evidence_id: null,
        source_reference: 'CareerProfile.years_experience',
        validation_status: 'SUPPORTED'
      });
    }
  }

  // 3. Detect numerical performance / revenue / scale claims (e.g. $1M, 10x, $5M ARR)
  const metricRegex = /(?:\$?\d+(?:\.\d+)?[kKmMbB]?\s*(?:revenue|arr|mrr|users|requests|scale|growth|increase|optimization|boost)|\b\d+x(?:\s*(?:growth|scale|revenue|boost))?|\$\d+(?:\.\d+)?[kKmMbB]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = metricRegex.exec(content)) !== null) {
    const metricText = m[0].trim();
    // Check if this metric text exists in any evidence description
    const isPresentInEvidence = evidences.some(e => (e.description || '').toLowerCase().includes(metricText.toLowerCase()) || e.title.toLowerCase().includes(metricText.toLowerCase()));
    
    if (isPresentInEvidence) {
      claims.push({
        proposal_id: 0,
        claim_text: `Performance metric: ${metricText}`,
        claim_type: 'METRIC_RESULT',
        support_level: 'STRONG',
        evidence_id: null,
        source_reference: 'Evidence Description',
        validation_status: 'SUPPORTED'
      });
    } else {
      claims.push({
        proposal_id: 0,
        claim_text: `Ungrounded metric claim: ${metricText}`,
        claim_type: 'METRIC_RESULT',
        support_level: 'UNSUPPORTED',
        evidence_id: null,
        source_reference: null,
        validation_status: 'UNSUPPORTED'
      });
    }
  }

  return claims;
}
