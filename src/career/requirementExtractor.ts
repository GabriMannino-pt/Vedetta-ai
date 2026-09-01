import { GoogleGenerativeAI } from '@google/generative-ai';
import { optionalEnv } from '../config';
import { CareerOpportunity, OpportunityAnalysis, CareerRequirement, RequirementPriority, RequirementCategory } from '../types';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  const key = optionalEnv('GEMINI_API_KEY');
  if (!key) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

// Global flag to enable mock mode for testing
let isMockMode = false;
let mockResponse: any = null;

export function setMockMode(enabled: boolean, response?: any): void {
  isMockMode = enabled;
  if (response) {
    mockResponse = response;
  }
}

/** Deterministic skills normalization */
export function normalizeSkillName(name: string): string {
  const clean = name.trim().toLowerCase();
  
  // Rule map
  const rules = [
    { regex: /\b(type\s*script|typescript)\b/g, replacement: 'typescript' },
    { regex: /\b(node\s*js|nodejs|node)\b/g, replacement: 'node.js' },
    { regex: /\b(python)\b/g, replacement: 'python' },
    { regex: /\b(sqlite)\b/g, replacement: 'sqlite' },
    { regex: /\b(n8n)\b/g, replacement: 'n8n' },
    { regex: /\b(make|make\.com)\b/g, replacement: 'make' },
    { regex: /\b(react\s*js|reactjs)\b/g, replacement: 'react' },
    { regex: /\b(aws)\b/g, replacement: 'aws' },
    { regex: /\b(docker)\b/g, replacement: 'docker' },
    { regex: /\b(kubernetes|k8s)\b/g, replacement: 'kubernetes' }
  ];

  for (const r of rules) {
    if (r.regex.test(clean)) {
      return r.replacement;
    }
  }

  // Fallback to simple lowercasing and trimming
  return clean.replace(/\s+/g, ' ');
}

export async function extractRequirements(opp: CareerOpportunity): Promise<OpportunityAnalysis> {
  if (!opp.description || opp.description.trim() === '') {
    throw new Error('Opportunity description is empty or missing');
  }

  if (isMockMode && mockResponse) {
    return parseAndValidateAnalysis(opp.id!, mockResponse);
  }

  const client = getClient();
  if (!client) {
    throw new Error('Gemini API key is not configured and mock mode is off');
  }

  // Model schema generation
  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `
    Analyze the following job description for the opportunity at "${opp.company_name}" titled "${opp.title}".
    Extract key requirements, technologies, responsibilities, languages, and signals structured in JSON.

    CRITICAL RULES:
    1. DO NOT hallucinate. Only extract requirements and technologies explicitly mentioned in the text.
    2. For every requirement, capture the exact phrase from the job description ("sourceText").
    3. Categorize requirements strictly into: TECHNICAL, EXPERIENCE, EDUCATION, LANGUAGE, LOCATION, DOMAIN, SOFT_SKILL, RESPONSILIBITY, OTHER.
    4. Set requirement priority strictly to: MUST_HAVE, SHOULD_HAVE, NICE_TO_HAVE, UNKNOWN.
    5. If years of experience is explicitly specified for a requirement, extract it into "yearsRequired" as a number. Otherwise leave null.
    6. Extract salary, remote status, seniority and risks only if explicitly stated.

    JSON Schema format to return:
    {
      "summary": "Brief summary of the role",
      "roleFocus": ["Core focal points of the role"],
      "responsibilities": ["Primary responsibilities"],
      "requirements": [
        {
          "name": "Skill/Requirement name",
          "normalizedName": "Normalized name of skill",
          "category": "TECHNICAL/EXPERIENCE/LANGUAGE/etc.",
          "priority": "MUST_HAVE/SHOULD_HAVE/NICE_TO_HAVE",
          "yearsRequired": 5 or null,
          "sourceText": "Exact quote from text",
          "sourceType": "JOB_DESCRIPTION",
          "confidence": 0.95
        }
      ],
      "technologies": ["List of tech mentioned"],
      "languages": ["Languages required"],
      "senioritySignals": ["Signals of seniority level requested"],
      "remoteSignals": ["Signals of remote/hybrid preference"],
      "riskSignals": ["Red flags or mismatch indicators"],
      "extractionConfidence": 0.95
    }

    Job Description:
    """
    ${opp.description}
    """
  `;

  try {
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    const data = JSON.parse(text);
    return parseAndValidateAnalysis(opp.id!, data);
  } catch (err: any) {
    throw new Error(`Failed to extract requirements via Gemini: ${err.message}`);
  }
}

function parseAndValidateAnalysis(opportunityId: number, data: any): OpportunityAnalysis {
  // Validate schema properties
  if (typeof data.summary !== 'string') throw new Error('Invalid schema: summary must be a string');
  if (!Array.isArray(data.roleFocus)) throw new Error('Invalid schema: roleFocus must be an array');
  if (!Array.isArray(data.responsibilities)) throw new Error('Invalid schema: responsibilities must be an array');
  if (!Array.isArray(data.requirements)) throw new Error('Invalid schema: requirements must be an array');
  if (!Array.isArray(data.technologies)) throw new Error('Invalid schema: technologies must be an array');
  if (!Array.isArray(data.languages)) throw new Error('Invalid schema: languages must be an array');
  if (typeof data.extractionConfidence !== 'number' || data.extractionConfidence < 0 || data.extractionConfidence > 1) {
    throw new Error('Invalid schema: extractionConfidence must be a number between 0 and 1');
  }

  const validPriorities = new Set(['MUST_HAVE', 'SHOULD_HAVE', 'NICE_TO_HAVE', 'UNKNOWN']);
  const validCategories = new Set(['TECHNICAL', 'EXPERIENCE', 'EDUCATION', 'LANGUAGE', 'LOCATION', 'DOMAIN', 'SOFT_SKILL', 'RESPONSIBILITY', 'OTHER']);

  const requirements = [];
  const seenUniqueReqs = new Set();

  for (const r of data.requirements) {
    if (!r.name || typeof r.name !== 'string') throw new Error('Invalid requirement name');
    if (!validPriorities.has(r.priority)) throw new Error(`Invalid priority value: ${r.priority}`);
    if (!validCategories.has(r.category)) throw new Error(`Invalid category value: ${r.category}`);
    if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) {
      throw new Error(`Invalid confidence value: ${r.confidence}`);
    }
    if (!r.sourceText || typeof r.sourceText !== 'string') {
      throw new Error('Requirement sourceText is missing or not a string');
    }

    const normName = normalizeSkillName(r.name);
    const uniqueKey = `${normName}|${r.category}`;
    
    // Prevent duplicate requirements in extraction list
    if (seenUniqueReqs.has(uniqueKey)) {
      continue;
    }
    seenUniqueReqs.add(uniqueKey);

    requirements.push({
      opportunityId,
      name: r.name,
      normalizedName: normName,
      category: r.category,
      priority: r.priority,
      yearsRequired: r.yearsRequired !== undefined && r.yearsRequired !== null && r.yearsRequired !== '' ? Number(r.yearsRequired) : null,
      evidence: {
        sourceText: r.sourceText,
        sourceType: 'JOB_DESCRIPTION' as const,
        confidence: r.confidence
      }
    });
  }

  return {
    opportunityId,
    summary: data.summary,
    roleFocus: data.roleFocus.map((s: any) => String(s)),
    responsibilities: data.responsibilities.map((s: any) => String(s)),
    requirements,
    technologies: data.technologies.map((s: any) => String(s)),
    languages: data.languages.map((s: any) => String(s)),
    senioritySignals: Array.isArray(data.senioritySignals) ? data.senioritySignals.map((s: any) => String(s)) : [],
    remoteSignals: Array.isArray(data.remoteSignals) ? data.remoteSignals.map((s: any) => String(s)) : [],
    riskSignals: Array.isArray(data.riskSignals) ? data.riskSignals.map((s: any) => String(s)) : [],
    extractionConfidence: data.extractionConfidence
  };
}
