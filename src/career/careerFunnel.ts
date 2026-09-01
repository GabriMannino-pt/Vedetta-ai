import { getDb } from '../storage/db';

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  stepConversionRate: number;    // % relative to previous stage
  overallConversionRate: number; // % relative to initial opportunities
}

export interface CareerFunnelReport {
  stages: FunnelStage[];
  totalOpportunities: number;
  totalWon: number;
  realizedRevenue: number;
  calculatedAt: string;
}

export function calculateCareerFunnel(): CareerFunnelReport {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Opportunities Total
  const totalOppRow = db.prepare('SELECT COUNT(*) as c FROM career_opportunities').get() as any;
  const totalOpportunities = Number(totalOppRow?.c || 0);

  // 2. Analyzed
  const analyzedRow = db.prepare("SELECT COUNT(*) as c FROM career_opportunities WHERE analysis_status = 'ANALYZED' OR fit_calculated_at IS NOT NULL OR fit_score IS NOT NULL").get() as any;
  const totalAnalyzed = Number(analyzedRow?.c || 0);

  // 3. Good/Strong Match
  const matchRow = db.prepare("SELECT COUNT(*) as c FROM career_opportunities WHERE fit_recommendation IN ('STRONG_MATCH', 'GOOD_MATCH')").get() as any;
  const totalMatched = Number(matchRow?.c || 0);

  // 4. Application Created
  const appCreatedRow = db.prepare('SELECT COUNT(DISTINCT opportunity_id) as c FROM career_applications').get() as any;
  const totalAppCreated = Number(appCreatedRow?.c || 0);

  // 5. Proposal Ready
  const propReadyRow = db.prepare(`
    SELECT COUNT(DISTINCT ca.id) as c FROM career_applications ca
    LEFT JOIN career_proposals cp ON ca.id = cp.application_id
    WHERE ca.status = 'READY' OR cp.proposal_status IN ('VALIDATED', 'READY')
  `).get() as any;
  const totalPropReady = Number(propReadyRow?.c || 0);

  // 6. Submitted
  const submittedRow = db.prepare(`
    SELECT COUNT(DISTINCT application_id) as c FROM career_outcome_snapshots WHERE submitted = 1
  `).get() as any;
  const totalSubmitted = Number(submittedRow?.c || 0);

  // 7. Response Received
  const responseRow = db.prepare(`
    SELECT COUNT(DISTINCT application_id) as c FROM career_outcome_snapshots WHERE response_received = 1
  `).get() as any;
  const totalResponses = Number(responseRow?.c || 0);

  // 8. Interview
  const interviewRow = db.prepare(`
    SELECT COUNT(DISTINCT application_id) as c FROM career_outcome_snapshots WHERE interview_invited = 1 OR interview_completed = 1
  `).get() as any;
  const totalInterviews = Number(interviewRow?.c || 0);

  // 9. Offer
  const offerRow = db.prepare(`
    SELECT COUNT(DISTINCT application_id) as c FROM career_outcome_snapshots WHERE offer_received = 1
  `).get() as any;
  const totalOffers = Number(offerRow?.c || 0);

  // 10. Won
  const wonRow = db.prepare(`
    SELECT COUNT(DISTINCT application_id) as c, SUM(revenue) as total_rev FROM career_outcome_snapshots WHERE won = 1
  `).get() as any;
  const totalWon = Number(wonRow?.c || 0);
  const realizedRevenue = Number(wonRow?.total_rev || 0);

  const rawStages = [
    { stage: 'OPPORTUNITIES', label: 'Opportunities Sourced', count: totalOpportunities },
    { stage: 'ANALYZED', label: 'Analyzed & Scored', count: totalAnalyzed },
    { stage: 'GOOD_STRONG_MATCH', label: 'Strong/Good Match (Fit >= 70)', count: totalMatched },
    { stage: 'APPLICATION_CREATED', label: 'Applications Created', count: totalAppCreated },
    { stage: 'PROPOSAL_READY', label: 'Proposals Validated & Ready', count: totalPropReady },
    { stage: 'SUBMITTED', label: 'Submitted (Dispatched)', count: totalSubmitted },
    { stage: 'RESPONSE', label: 'Responses Received', count: totalResponses },
    { stage: 'INTERVIEW', label: 'Interviews Invited', count: totalInterviews },
    { stage: 'OFFER', label: 'Offers Received', count: totalOffers },
    { stage: 'WON', label: 'Deals Won', count: totalWon }
  ];

  const stages: FunnelStage[] = rawStages.map((st, idx) => {
    const prevCount = idx === 0 ? st.count : rawStages[idx - 1].count;
    const stepConversionRate = prevCount > 0 ? Math.round((st.count / prevCount) * 1000) / 10 : 0;
    const overallConversionRate = totalOpportunities > 0 ? Math.round((st.count / totalOpportunities) * 1000) / 10 : 0;

    return {
      stage: st.stage,
      label: st.label,
      count: st.count,
      stepConversionRate,
      overallConversionRate
    };
  });

  return {
    stages,
    totalOpportunities,
    totalWon,
    realizedRevenue,
    calculatedAt: now
  };
}
