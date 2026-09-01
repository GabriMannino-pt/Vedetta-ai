import { GoogleGenerativeAI } from '@google/generative-ai';
import { optionalEnv } from '../config';
import { CareerProfile, CareerOpportunity, CareerRequirement, ApplicationStrategy, MatchedRequirementEvidence } from '../types';

let isMockMode = false;
let mockProposalText: string | null = null;

export function setProposalMockMode(enabled: boolean, mockText?: string): void {
  isMockMode = enabled;
  if (mockText) {
    mockProposalText = mockText;
  }
}

export async function generateProposal(
  profile: CareerProfile,
  opportunity: CareerOpportunity,
  requirements: CareerRequirement[],
  strategy: ApplicationStrategy,
  topEvidence: MatchedRequirementEvidence[]
): Promise<string> {
  if (isMockMode && mockProposalText) {
    return mockProposalText;
  }

  // Deterministic fallback template if no Gemini key or mock mode with no template
  const apiKey = optionalEnv('GEMINI_API_KEY');
  if (!apiKey || isMockMode) {
    return generateDeterministicTemplate(profile, opportunity, strategy, topEvidence);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const evidenceBulletPoints = topEvidence
      .map(e => `- ${e.requirement_name}: ${e.evidence_title} (${e.source_url || e.source_type})`)
      .join('\n');

    const prompt = `
You are a senior technical professional drafting a concise, evidence-based project proposal / application.

STRICT RULES:
1. NEVER start with generic cliches like "I am excited to apply", "I hope this finds you well", or buzzwords.
2. Hook directly onto the specific problem/opportunity of "${opportunity.title}" at "${opportunity.company_name}".
3. ONLY reference the candidate's real experience: ${profile.years_experience} years in ${profile.headline}.
4. ONLY cite the verified evidence proofs listed below. DO NOT invent metrics, clients, or technologies.
5. Keep it punchy, technical, and high-signal (under 250 words).

Candidate Profile:
Name: ${profile.name}
Headline: ${profile.headline}
Experience: ${profile.years_experience} years
Positioning Angle: ${strategy.positioning_angle}

Opportunity:
Title: ${opportunity.title}
Company: ${opportunity.company_name}
Description: ${opportunity.description}

Verified Evidence Proofs:
${evidenceBulletPoints || 'None specified'}

Draft the structured proposal in markdown.
`;

    const response = await model.generateContent(prompt);
    return response.response.text().trim();
  } catch (err: any) {
    return generateDeterministicTemplate(profile, opportunity, strategy, topEvidence);
  }
}

function generateDeterministicTemplate(
  profile: CareerProfile,
  opportunity: CareerOpportunity,
  strategy: ApplicationStrategy,
  topEvidence: MatchedRequirementEvidence[]
): string {
  const proofs = topEvidence
    .map(e => `* **${e.requirement_name}**: Demonstrated in [${e.evidence_title}](${e.source_url || 'Production Evidence'})`)
    .join('\n');

  return `Hi ${opportunity.company_name || 'Team'},

Regarding your ${opportunity.title} role—I specialize as a ${strategy.positioning_angle} with ${profile.years_experience} years of experience building reliable architectures.

### Relevant Proof & Stack Alignment
${proofs || '* Core engineering expertise aligned with role requirements.'}

### Approach
I focus on clean, deterministic implementations with robust test coverage and automated validation.

Let's connect to discuss how I can immediately contribute to your stack.

Best regards,
${profile.name}`;
}
