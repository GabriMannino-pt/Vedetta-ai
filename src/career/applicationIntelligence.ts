import { getDb } from '../storage/db';
import {
  CareerApplication,
  CareerProposal,
  ApplicationChannel,
  ApplicationStatus,
  ProposalValidationResult,
  ApplicationStrategy
} from '../types';
import { getOpportunity } from './careerOpportunities';
import { getProfile } from './careerProfile';
import { listSkills } from './careerSkills';
import { listEvidence } from './careerEvidence';
import { listRequirements } from './requirementRepository';
import { evaluateAndPersistFit } from './fitScorer';
import { matchOpportunityEvidence } from './evidenceMatcher';
import { generateApplicationStrategy } from './applicationStrategy';
import { generateProposal } from './proposalGenerator';
import { validateProposal } from './proposalGuard';
import { createApplication, getApplicationForOpportunity } from './careerApplications';
import { createProposal } from './careerProposals';

export interface PreparedApplicationResult {
  application: CareerApplication;
  proposal: CareerProposal;
  strategy: ApplicationStrategy;
  validation: ProposalValidationResult;
}

export async function prepareApplication(
  opportunityId: number,
  options: { channel?: ApplicationChannel; forceNewProposalVersion?: boolean } = {}
): Promise<PreparedApplicationResult> {
  const opp = getOpportunity(opportunityId);
  if (!opp) {
    throw new Error(`Opportunity ID ${opportunityId} not found`);
  }

  const profile = getProfile(opp.profile_id);
  if (!profile) {
    throw new Error(`Referenced profile ID ${opp.profile_id} not found`);
  }

  const skills = listSkills(opp.profile_id);
  const evidences = listEvidence(opp.profile_id);
  const requirements = listRequirements(opportunityId, 1);

  // 1. Calculate & Persist Fit Evaluation
  const fitResult = evaluateAndPersistFit(opportunityId, 1);

  // 2. Evidence Matching
  const matchedEvidence = matchOpportunityEvidence(requirements, skills, evidences);

  // 3. Application Strategy
  const strategy = generateApplicationStrategy(profile, opp, requirements, fitResult, matchedEvidence);

  // 4. Generate Proposal Content
  const proposalContent = await generateProposal(profile, opp, requirements, strategy, strategy.top_evidence);

  // 5. Run Proposal Guard
  const validation = validateProposal(proposalContent, profile, skills, evidences, strategy);

  // 6. Determine Application & Proposal Status
  // Directive 1: READY means ready for human review, never auto-submitted
  let appStatus: ApplicationStatus = 'DRAFT';
  if (validation.valid && !fitResult.criticalGap) {
    appStatus = 'READY';
  } else if (!validation.valid || fitResult.criticalGap) {
    appStatus = validation.valid ? 'DRAFT' : 'BLOCKED';
  }

  const channel: ApplicationChannel = options.channel || (opp.source === 'UPWORK' ? 'UPWORK' : opp.source === 'LINKEDIN' ? 'LINKEDIN' : 'DIRECT');
  const evidenceIds = strategy.top_evidence.map(e => e.evidence_id).filter(id => id !== undefined);

  // 7. Atomic DB Persistence inside SQLite Transaction
  const db = getDb();
  let createdApp: CareerApplication;
  let createdProp: CareerProposal;

  const transaction = db.transaction(() => {
    // Check if application already exists for this opportunity
    let existingApp = getApplicationForOpportunity(opportunityId);
    let appId: number;
    let nextProposalVersion = 1;

    if (existingApp) {
      appId = existingApp.id!;
      db.prepare(`
        UPDATE career_applications SET
          status = ?, channel = ?, fit_score_snapshot = ?, priority_snapshot = ?,
          recommendation_snapshot = ?, fit_algorithm_version = ?,
          strategy_json = ?, evidence_ids_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        appStatus,
        channel,
        fitResult.fitScore,
        fitResult.applicationPriority,
        fitResult.recommendation,
        fitResult.algorithmVersion,
        JSON.stringify(strategy),
        JSON.stringify(evidenceIds),
        new Date().toISOString(),
        appId
      );

      const latestPropRow = db.prepare('SELECT MAX(proposal_version) as max_v FROM career_proposals WHERE application_id = ?').get(appId) as any;
      if (latestPropRow && latestPropRow.max_v) {
        nextProposalVersion = latestPropRow.max_v + 1;
      }
    } else {
      appId = createApplication({
        profile_id: opp.profile_id,
        opportunity_id: opportunityId,
        status: appStatus,
        channel,
        fit_score_snapshot: fitResult.fitScore,
        priority_snapshot: fitResult.applicationPriority,
        recommendation_snapshot: fitResult.recommendation,
        fit_algorithm_version: fitResult.algorithmVersion,
        strategy_json: JSON.stringify(strategy),
        evidence_ids_json: JSON.stringify(evidenceIds)
      });
    }

    const proposalId = createProposal({
      application_id: appId,
      content: proposalContent,
      proposal_status: validation.proposal_status,
      proposal_version: nextProposalVersion,
      proposal_algorithm_version: 1,
      validated_at: validation.valid ? new Date().toISOString() : null
    }, validation.claims);

    createdApp = {
      id: appId,
      profile_id: opp.profile_id,
      opportunity_id: opportunityId,
      status: appStatus,
      channel,
      fit_score_snapshot: fitResult.fitScore,
      priority_snapshot: fitResult.applicationPriority,
      recommendation_snapshot: fitResult.recommendation,
      fit_algorithm_version: fitResult.algorithmVersion,
      strategy_json: JSON.stringify(strategy),
      evidence_ids_json: JSON.stringify(evidenceIds),
      proposal_id: proposalId
    };

    createdProp = {
      id: proposalId,
      application_id: appId,
      content: proposalContent,
      proposal_status: validation.proposal_status,
      proposal_version: nextProposalVersion,
      proposal_algorithm_version: 1,
      claims: validation.claims
    };
  });

  transaction();

  return {
    application: createdApp!,
    proposal: createdProp!,
    strategy,
    validation
  };
}
