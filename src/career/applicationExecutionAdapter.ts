import { CareerAction } from '../types';
import { getAction, updateActionStatus } from './careerActions';
import { validateActionExecution } from './executionGuard';
import { getOpportunity } from './careerOpportunities';
import { getApplication } from './careerApplications';
import { getProposalForApplication } from './careerProposals';

export interface ExecutionResult {
  success: boolean;
  actionId: number;
  mode: 'HUMAN_HANDOFF' | 'INTERNAL_OPERATION';
  status: string;
  payload?: any;
  message: string;
}

export async function executeApplicationAction(
  actionId: number,
  actor = 'USER'
): Promise<ExecutionResult> {
  const action = getAction(actionId);
  if (!action) {
    throw new Error(`Action ID ${actionId} not found`);
  }

  // 1. Execution Guard Validation
  const validation = validateActionExecution(action);
  if (!validation.valid) {
    updateActionStatus(actionId, 'FAILED', actor, validation.reasons.join('; '));
    throw new Error(`Execution guard rejected action: ${validation.reasons.join('; ')}`);
  }

  // 2. Transition APPROVED -> EXECUTING
  updateActionStatus(actionId, 'EXECUTING', actor, 'Initiating execution');

  let resultPayload: any = null;
  let executionMode: 'HUMAN_HANDOFF' | 'INTERNAL_OPERATION' = 'INTERNAL_OPERATION';
  let message = 'Action executed successfully';

  if (action.actionType === 'SUBMIT_APPLICATION') {
    // ⚠️ ZERO AUTO-SUBMIT MANDATE:
    // This adapter prepares the proposal, copyable links, and validation bundle for HUMAN DISPATCH.
    // It DOES NOT mutate application status to SUBMITTED.
    executionMode = 'HUMAN_HANDOFF';
    const opp = action.opportunityId ? getOpportunity(action.opportunityId) : null;
    const app = action.applicationId ? getApplication(action.applicationId) : null;
    const prop = action.applicationId ? getProposalForApplication(action.applicationId) : null;

    resultPayload = {
      mode: 'HUMAN_HANDOFF',
      status: 'READY_FOR_HUMAN_SUBMISSION',
      opportunity: opp ? { id: opp.id, title: opp.title, company: opp.company_name, sourceUrl: opp.source_url } : null,
      channel: app?.channel || 'MANUAL',
      proposalContent: prop?.content || '',
      instructions: 'Review the proposal above, copy content, and dispatch manually on the target platform. Once sent, record outcome as SUBMITTED.'
    };
    message = 'Handoff bundle prepared for human submission';
  } else if (action.actionType === 'CREATE_APPLICATION') {
    if (action.opportunityId) {
      const { prepareApplication } = require('./applicationIntelligence');
      const res = await prepareApplication(action.opportunityId);
      resultPayload = { applicationId: res.application.id };
      message = `Application #${res.application.id} prepared`;
    }
  }

  // 3. Transition EXECUTING -> COMPLETED
  updateActionStatus(actionId, 'COMPLETED', actor, message, resultPayload);

  return {
    success: true,
    actionId,
    mode: executionMode,
    status: executionMode === 'HUMAN_HANDOFF' ? 'READY_FOR_HUMAN_SUBMISSION' : 'COMPLETED',
    payload: resultPayload,
    message
  };
}
