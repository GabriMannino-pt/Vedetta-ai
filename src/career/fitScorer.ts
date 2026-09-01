import {
  CareerProfile,
  CareerSkill,
  CareerEvidence,
  CareerOpportunity,
  CareerRequirement,
  FitEvaluationResult,
  FitScoreBreakdown
} from '../types';
import { normalizeSkillName } from './requirementExtractor';
import { FIT_ALGORITHM_VERSION, FIT_WEIGHTS, RequirementMatchDetail } from './fitTypes';
import { buildFitExplanation } from './fitExplainability';
import { getOpportunity, updateOpportunity } from './careerOpportunities';
import { listRequirements } from './requirementRepository';
import { getDb } from '../storage/db';
import { getProfile } from './careerProfile';
import { listSkills } from './careerSkills';
import { listEvidence } from './careerEvidence';

// Seniority ranking
const SENIORITY_MAP: Record<string, number> = {
  INTERN: 1,
  JUNIOR: 2,
  MID: 3,
  SENIOR: 4,
  LEAD: 5,
  PRINCIPAL: 6,
  STAFF: 7
};

// Skill level numeric scale
const SKILL_LEVEL_MAP: Record<string, number> = {
  BEGINNER: 25,
  INTERMEDIATE: 50,
  ADVANCED: 75,
  EXPERT: 100
};

// Deterministic Domain Taxonomy
const DOMAIN_TAXONOMY: Record<string, string[]> = {
  AI: ['ai', 'artificial intelligence', 'llm', 'genai', 'machine learning', 'nlp', 'deep learning', 'rag', 'openai', 'gemini', 'anthropic', 'prompt', 'agents'],
  AUTOMATION: ['automation', 'n8n', 'make', 'make.com', 'zapier', 'workflow', 'airtable', 'integration', 'orchestration', 'rpa'],
  BACKEND_CLOUD: ['backend', 'api', 'node', 'nodejs', 'typescript', 'python', 'aws', 'docker', 'cloud', 'server', 'database', 'sql', 'sqlite', 'postgres', 'postgresql', 'fastapi', 'microservices'],
  FRONTEND_FULLSTACK: ['frontend', 'fullstack', 'react', 'nextjs', 'vue', 'ui', 'ux', 'web', 'javascript', 'html', 'css'],
  SAAS_B2B: ['saas', 'b2b', 'crm', 'sales', 'revenue', 'lead', 'marketing', 'outbound', 'inbound', 'pipeline']
};

export function getSkillName(s: CareerSkill): string {
  return (s as any).skill || (s as any).name || '';
}

export function calculateSkillLevelMatch(candidateLevel?: string, requiredLevel?: string): number {
  if (!requiredLevel) return 100;
  const reqVal = SKILL_LEVEL_MAP[requiredLevel.toUpperCase()] || 50;
  const candVal = candidateLevel ? (SKILL_LEVEL_MAP[candidateLevel.toUpperCase()] || 25) : 0;
  
  if (candVal >= reqVal) return 100;
  if (candVal === 0) return 0;
  return Math.round((candVal / reqVal) * 100);
}

export function calculateExperienceMatch(candidateYears: number, requiredYears?: number | null): number {
  if (requiredYears === undefined || requiredYears === null || requiredYears <= 0) {
    return 100;
  }
  if (candidateYears >= requiredYears) {
    return 100;
  }
  return Math.round((candidateYears / requiredYears) * 100);
}

export function calculateSeniorityMatch(candidateSeniority?: string, jobSeniority?: string): number {
  if (!jobSeniority || jobSeniority === 'UNKNOWN') return 75;
  if (!candidateSeniority || candidateSeniority === 'UNKNOWN') return 50;

  const cRank = SENIORITY_MAP[candidateSeniority.toUpperCase()] || 3;
  const jRank = SENIORITY_MAP[jobSeniority.toUpperCase()] || 3;

  if (cRank === jRank) return 100;
  if (cRank === jRank + 1) return 90; // Slightly overqualified
  if (cRank >= jRank + 2) return 80;  // Well overqualified
  if (cRank === jRank - 1) return 70; // 1 step junior
  if (cRank === jRank - 2) return 40; // 2 steps junior
  return 15;
}

export function calculateDomainMatch(
  profile: CareerProfile,
  skills: CareerSkill[],
  evidences: CareerEvidence[],
  opportunity: CareerOpportunity,
  requirements: CareerRequirement[]
): number {
  // Collect candidate text tokens
  const candidateText = [
    profile.headline || '',
    profile.summary || '',
    profile.career_goal || '',
    ...skills.map(s => getSkillName(s)),
    ...evidences.map(e => `${e.title} ${e.description || ''}`)
  ].join(' ').toLowerCase();

  // Collect opportunity text tokens
  const oppText = [
    opportunity.title || '',
    opportunity.description || '',
    opportunity.role_focus_json ? JSON.parse(opportunity.role_focus_json).join(' ') : '',
    opportunity.technologies_json ? JSON.parse(opportunity.technologies_json).join(' ') : '',
    ...requirements.map(r => r.name)
  ].join(' ').toLowerCase();

  // Check matched domains in taxonomy
  let targetDomainsCount = 0;
  let matchedDomainsCount = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_TAXONOMY)) {
    const oppHasDomain = keywords.some(k => oppText.includes(k));
    if (oppHasDomain) {
      targetDomainsCount++;
      const candHasDomain = keywords.some(k => candidateText.includes(k));
      if (candHasDomain) {
        matchedDomainsCount++;
      }
    }
  }

  if (targetDomainsCount === 0) {
    return 75; // Neutral domain alignment
  }

  return Math.round((matchedDomainsCount / targetDomainsCount) * 100);
}

export function calculateRemoteMatch(candidatePreference?: string, jobRemoteType?: string): number {
  if (!jobRemoteType || jobRemoteType === 'UNKNOWN') return 50;
  if (!candidatePreference) return 50;

  const cand = candidatePreference.toUpperCase();
  const job = jobRemoteType.toUpperCase();

  if (cand === job || cand === 'FLEXIBLE' || cand === 'ANY') return 100;
  if (cand === 'REMOTE' && job === 'HYBRID') return 60;
  if (cand === 'REMOTE' && job === 'ONSITE') return 20;
  if (cand === 'ONSITE' && job === 'REMOTE') return 80;
  if (cand === 'HYBRID' && job === 'REMOTE') return 90;
  return 50;
}

export function calculateLanguageMatch(profile: CareerProfile, requirements: CareerRequirement[]): number {
  const langReqs = requirements.filter(r => r.category === 'LANGUAGE');
  if (langReqs.length === 0) return 100;

  const profileText = `${profile.summary || ''} ${profile.headline || ''} ${profile.location || ''}`.toLowerCase();
  
  let matched = 0;
  for (const req of langReqs) {
    const norm = req.normalizedName.toLowerCase();
    if (profileText.includes(norm) || norm.includes('italian') || norm.includes('italiano') || norm.includes('english') || norm.includes('inglese')) {
      matched++;
    }
  }

  return Math.round((matched / langReqs.length) * 100);
}

export function calculateSalaryCompatibility(profile: CareerProfile, opportunity: CareerOpportunity): number {
  if (
    (opportunity.salary_min === null || opportunity.salary_min === undefined) &&
    (opportunity.salary_max === null || opportunity.salary_max === undefined) &&
    (opportunity.hourly_rate_min === null || opportunity.hourly_rate_min === undefined) &&
    (opportunity.hourly_rate_max === null || opportunity.hourly_rate_max === undefined)
  ) {
    return 50; // Neutral if completely unspecified
  }

  if (opportunity.salary_max !== null && opportunity.salary_max !== undefined && profile.target_salary_min !== null && profile.target_salary_min !== undefined) {
    if (opportunity.salary_max >= profile.target_salary_min) {
      return 100;
    }
    return Math.max(10, Math.round((opportunity.salary_max / profile.target_salary_min) * 100));
  }

  if (opportunity.hourly_rate_max !== null && opportunity.hourly_rate_max !== undefined && profile.target_hourly_rate !== null && profile.target_hourly_rate !== undefined) {
    if (opportunity.hourly_rate_max >= profile.target_hourly_rate) {
      return 100;
    }
    return Math.max(10, Math.round((opportunity.hourly_rate_max / profile.target_hourly_rate) * 100));
  }

  return 50;
}

export function calculateEvidenceLevel(
  skillName: string,
  skills: CareerSkill[],
  evidences: CareerEvidence[]
): { level: number; source?: string } {
  const norm = normalizeSkillName(skillName);
  
  // Find matching evidence first (highest weight)
  const matchingEvidences = evidences.filter(e => {
    const titleMatch = normalizeSkillName(e.title).includes(norm);
    const descMatch = (e.description || '').toLowerCase().includes(norm);
    return titleMatch || descMatch;
  });

  if (matchingEvidences.length > 0) {
    const hasVerified = matchingEvidences.some(e => Boolean(e.verified));
    const hasGithub = matchingEvidences.some(e => e.source_type === 'GITHUB' || (e.source_url || '').includes('github.com'));
    
    if (hasVerified) {
      return { level: 100, source: 'Verified Production Evidence' };
    }
    if (hasGithub) {
      return { level: 75, source: 'GitHub / Code Repository' };
    }
    return { level: 50, source: 'Portfolio Project' };
  }

  // Check if declared skill exists
  const hasSkill = skills.some(s => normalizeSkillName(getSkillName(s)) === norm);
  if (hasSkill) {
    return { level: 25, source: 'Declared Profile Skill' };
  }

  return { level: 0 };
}

export function evaluateFit(
  profile: CareerProfile,
  skills: CareerSkill[],
  evidences: CareerEvidence[],
  opportunity: CareerOpportunity,
  requirements: CareerRequirement[]
): FitEvaluationResult {
  const matchDetails: RequirementMatchDetail[] = [];
  let technicalMatchesSum = 0;
  let technicalReqsCount = 0;
  let mustHaveTotal = 0;
  let mustHaveMatched = 0;
  let niceToHaveTotal = 0;
  let niceToHaveMatched = 0;
  let evidenceStrengthSum = 0;
  let criticalGap = false;
  let requiredYearsMax: number | null = null;

  for (const req of requirements) {
    const norm = normalizeSkillName(req.name);
    const candSkill = skills.find(s => normalizeSkillName(getSkillName(s)) === norm);
    const evidenceInfo = calculateEvidenceLevel(req.name, skills, evidences);

    const isMustHave = req.priority === 'MUST_HAVE';
    const isNiceToHave = req.priority === 'NICE_TO_HAVE';
    const isTechnical = req.category === 'TECHNICAL';

    if (req.yearsRequired && (requiredYearsMax === null || req.yearsRequired > requiredYearsMax)) {
      requiredYearsMax = req.yearsRequired;
    }

    let matchScore = 0;
    if (candSkill) {
      matchScore = calculateSkillLevelMatch(candSkill.level);
    } else if (evidenceInfo.level >= 50) {
      matchScore = 75; // Supported by evidence even if not in explicit skills list
    }

    const matched = matchScore >= 70;
    const partial = matchScore > 0 && matchScore < 70;

    if (isTechnical) {
      technicalReqsCount++;
      technicalMatchesSum += matchScore;
      evidenceStrengthSum += evidenceInfo.level;
    }

    if (isMustHave) {
      mustHaveTotal++;
      if (matched) {
        mustHaveMatched++;
      } else if (isTechnical && matchScore < 50 && evidenceInfo.level === 0) {
        criticalGap = true;
      }
    }

    if (isNiceToHave) {
      niceToHaveTotal++;
      if (matched || partial) {
        niceToHaveMatched++;
      }
    }

    matchDetails.push({
      requirementId: req.id,
      name: req.name,
      normalizedName: norm,
      category: req.category,
      priority: req.priority,
      requiredYears: req.yearsRequired || null,
      candidateSkillLevel: candSkill?.level,
      matched,
      partial,
      matchScore,
      evidenceLevel: evidenceInfo.level,
      evidenceSource: evidenceInfo.source,
      isCritical: isMustHave && isTechnical
    });
  }

  // Calculate Breakdown Scores
  const technicalMatch = technicalReqsCount > 0 ? Math.round(technicalMatchesSum / technicalReqsCount) : 100;
  const experienceMatch = calculateExperienceMatch(profile.years_experience, requiredYearsMax);
  const seniorityMatch = calculateSeniorityMatch(profile.seniority, opportunity.seniority);
  const domainMatch = calculateDomainMatch(profile, skills, evidences, opportunity, requirements);
  const remoteMatch = calculateRemoteMatch(profile.remote_preference, opportunity.remote_type);
  const languageMatch = calculateLanguageMatch(profile, requirements);
  const mustHaveCoverage = mustHaveTotal > 0 ? Math.round((mustHaveMatched / mustHaveTotal) * 100) : 100;
  const niceToHaveCoverage = niceToHaveTotal > 0 ? Math.round((niceToHaveMatched / niceToHaveTotal) * 100) : 100;
  const evidenceStrength = technicalReqsCount > 0 ? Math.round(evidenceStrengthSum / technicalReqsCount) : (evidences.length > 0 ? 75 : 25);
  const salaryCompatibility = calculateSalaryCompatibility(profile, opportunity);

  // Compute Primary Deterministic Fit Score (0-100)
  const rawFitScore = (
    technicalMatch * FIT_WEIGHTS.TECHNICAL +
    experienceMatch * FIT_WEIGHTS.EXPERIENCE +
    seniorityMatch * FIT_WEIGHTS.SENIORITY +
    domainMatch * FIT_WEIGHTS.DOMAIN +
    remoteMatch * FIT_WEIGHTS.REMOTE +
    languageMatch * FIT_WEIGHTS.LANGUAGE +
    mustHaveCoverage * FIT_WEIGHTS.MUST_HAVE +
    evidenceStrength * FIT_WEIGHTS.EVIDENCE
  );
  const fitScore = Math.min(100, Math.max(0, Math.round(rawFitScore)));

  // Application Priority (70% Fit Score + 30% Evidence Strength with penalties)
  let appPriority = (0.70 * fitScore) + (0.30 * evidenceStrength);
  if (criticalGap) appPriority -= 30;
  if (remoteMatch < 40) appPriority -= 15;
  const applicationPriority = Math.min(100, Math.max(0, Math.round(appPriority)));

  const breakdown: FitScoreBreakdown = {
    technicalMatch,
    experienceMatch,
    seniorityMatch,
    domainMatch,
    remoteMatch,
    languageMatch,
    mustHaveCoverage,
    evidenceStrength,
    niceToHaveCoverage,
    salaryCompatibility
  };

  const explanation = buildFitExplanation(
    fitScore,
    breakdown,
    criticalGap,
    matchDetails,
    `${profile.seniority || 'Mid'} vs ${opportunity.seniority || 'Mid'}`,
    `${profile.years_experience}y experience`
  );

  const now = new Date().toISOString();

  return {
    opportunityId: opportunity.id || 0,
    fitScore,
    applicationPriority,
    breakdown,
    criticalGap,
    recommendation: explanation.recommendation,
    explanation,
    calculatedAt: now,
    algorithmVersion: FIT_ALGORITHM_VERSION
  };
}

export function evaluateAndPersistFit(opportunityId: number, version = 1): FitEvaluationResult {
  const opp = getOpportunity(opportunityId);
  if (!opp) {
    throw new Error(`Opportunity with ID ${opportunityId} not found`);
  }

  const profile = getProfile(opp.profile_id);
  if (!profile) {
    throw new Error(`Referenced profile ID ${opp.profile_id} not found`);
  }

  const skills = listSkills(opp.profile_id);
  const evidences = listEvidence(opp.profile_id);
  const requirements = listRequirements(opportunityId, version);

  const result = evaluateFit(profile, skills, evidences, opp, requirements);

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE career_opportunities SET
      fit_score = ?,
      application_priority = ?,
      evidence_score = ?,
      technical_match = ?,
      experience_match = ?,
      seniority_match = ?,
      domain_match = ?,
      remote_match = ?,
      language_match = ?,
      must_have_coverage = ?,
      nice_to_have_coverage = ?,
      critical_gap = ?,
      fit_recommendation = ?,
      fit_breakdown_json = ?,
      fit_explanation_json = ?,
      fit_calculated_at = ?,
      fit_algorithm_version = ?
    WHERE id = ?
  `);

  stmt.run(
    result.fitScore,
    result.applicationPriority,
    result.breakdown.evidenceStrength,
    result.breakdown.technicalMatch,
    result.breakdown.experienceMatch,
    result.breakdown.seniorityMatch,
    result.breakdown.domainMatch,
    result.breakdown.remoteMatch,
    result.breakdown.languageMatch,
    result.breakdown.mustHaveCoverage,
    result.breakdown.niceToHaveCoverage,
    result.criticalGap ? 1 : 0,
    result.recommendation,
    JSON.stringify(result.breakdown),
    JSON.stringify(result.explanation),
    result.calculatedAt,
    result.algorithmVersion,
    opportunityId
  );

  return result;
}
