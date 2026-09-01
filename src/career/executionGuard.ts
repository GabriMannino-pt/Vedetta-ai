import { CareerAction } from '../types';
import { getAction } from './careerActions';
import { getOpportunity } from './careerOpportunities';
import { getApplication } from './careerApplications';
import { getProposalForApplication } from './careerProposals';

export interface ActionValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validateActionExecution(actionOrId: number | CareerAction): ActionValidationResult {
  const action = typeof actionOrId === 'number' ? getAction(actionOrId) : actionOrId;
  const reasons: string[] = [];

  if (!action) {
    return { valid: false, reasons: ['Action not found'] };
  }

  // 1. Check status is approved or executable
  if (!['APPROVED', 'SUGGESTED', 'PENDING_APPROVAL'].includes(action.status)) {
    reasons.push(`Action status ${action.status} is not executable`);
  }

  // 2. If SUBMIT_APPLICATION or FOLLOW_UP, strictly require APPROVED
  if (['SUBMIT_APPLICATION', 'FOLLOW_UP'].includes(action.actionType) && action.status !== 'APPROVED') {
    reasons.push(`Action type ${action.actionType} requires explicit human approval before execution`);
  }

  // 3. Entity Integrity Validation
  if (['SUBMIT_APPLICATION', 'CREATE_APPLICATION', 'REVIEW_OPPORTUNITY', 'SCHEDULE_REVIEW'].includes(action.actionType)) {
    if (!action.opportunityId) {
      reasons.push(`Opportunity ID is required for action ${action.actionType}`);
    } else {
      const opp = getOpportunity(action.opportunityId);
      if (!opp) {
        reasons.push(`Opportunity ID ${action.opportunityId} not found`);
      } else {
        if (opp.status === 'ARCHIVED' || opp.status === 'CLOSED') {
          reasons.push(`Opportunity ID ${action.opportunityId} is ${opp.status}`);
        }
        if (opp.critical_gap && action.actionType === 'SUBMIT_APPLICATION') {
          reasons.push('Cannot submit application for opportunity with unresolved critical technical gap');
        }
      }
    }
  }

  // 4. Application & Proposal Integrity Validation
  if (action.actionType === 'SUBMIT_APPLICATION' || action.actionType === 'FOLLOW_UP') {
    if (action.applicationId) {
      const app = getApplication(action.applicationId);
      if (!app) {
        reasons.push(`Application ID ${action.applicationId} not found`);
      } else {
        const prop = getProposalForApplication(action.applicationId);
        if (prop && prop.proposal_status === 'BLOCKED') {
          reasons.push('Cannot execute submission when proposal has been BLOCKED by Proposal Guard');
        }
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}
