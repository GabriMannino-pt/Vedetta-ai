import { getDb } from '../storage/db';
import { OpportunityAnalysis } from '../types';
import { getOpportunity } from './careerOpportunities';
import { extractRequirements } from './requirementExtractor';
import { replaceRequirements } from './requirementRepository';

export async function analyzeOpportunity(opportunityId: number, version = 1): Promise<OpportunityAnalysis> {
  const opp = getOpportunity(opportunityId);
  if (!opp) {
    throw new Error(`Opportunity with ID ${opportunityId} not found`);
  }

  const db = getDb();
  
  // Set status to ANALYZING
  db.prepare('UPDATE career_opportunities SET analysis_status = ? WHERE id = ?')
    .run('ANALYZING', opportunityId);

  try {
    const analysis = await extractRequirements(opp);
    analysis.analysis_version = version;

    // Persist transationally
    db.prepare('BEGIN TRANSACTION').run();
    try {
      // Update opportunity fields
      const stmt = db.prepare(`
        UPDATE career_opportunities SET
          analysis_status = ?,
          analysis_summary = ?,
          role_focus_json = ?,
          responsibilities_json = ?,
          technologies_json = ?,
          languages_json = ?,
          seniority_signals_json = ?,
          remote_signals_json = ?,
          risk_signals_json = ?,
          extraction_confidence = ?,
          analyzed_at = ?
        WHERE id = ?
      `);

      const now = new Date().toISOString();
      stmt.run(
        'ANALYZED',
        analysis.summary,
        JSON.stringify(analysis.roleFocus),
        JSON.stringify(analysis.responsibilities),
        JSON.stringify(analysis.technologies),
        JSON.stringify(analysis.languages),
        JSON.stringify(analysis.senioritySignals),
        JSON.stringify(analysis.remoteSignals),
        JSON.stringify(analysis.riskSignals),
        analysis.extractionConfidence,
        now,
        opportunityId
      );

      // Persist requirements
      replaceRequirements(opportunityId, analysis.requirements, version);

      db.prepare('COMMIT').run();
      
      analysis.analyzedAt = now;
      return analysis;
    } catch (dbErr) {
      db.prepare('ROLLBACK').run();
      throw dbErr;
    }
  } catch (err) {
    // Set status to FAILED on error
    db.prepare('UPDATE career_opportunities SET analysis_status = ? WHERE id = ?')
      .run('FAILED', opportunityId);
    throw err;
  }
}

export function getOpportunityAnalysis(opportunityId: number, version = 1): OpportunityAnalysis | null {
  const opp = getOpportunity(opportunityId);
  if (!opp || opp.analysis_status !== 'ANALYZED') {
    return null;
  }

  const db = getDb();
  const requirements = db.prepare(`
    SELECT * FROM career_opportunity_requirements 
    WHERE opportunity_id = ? AND analysis_version = ?
    ORDER BY id ASC
  `).all(opportunityId, version) as any[];

  const mappedReqs = requirements.map(r => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    name: r.name,
    normalizedName: r.normalized_name,
    category: r.category,
    priority: r.priority,
    yearsRequired: r.years_required,
    evidence: {
      sourceText: r.source_text,
      sourceType: r.source_type,
      confidence: r.confidence
    },
    analysis_version: r.analysis_version
  }));

  return {
    opportunityId,
    summary: opp.analysis_summary || '',
    roleFocus: opp.role_focus_json ? JSON.parse(opp.role_focus_json) : [],
    responsibilities: opp.responsibilities_json ? JSON.parse(opp.responsibilities_json) : [],
    requirements: mappedReqs,
    technologies: opp.technologies_json ? JSON.parse(opp.technologies_json) : [],
    languages: opp.languages_json ? JSON.parse(opp.languages_json) : [],
    senioritySignals: opp.seniority_signals_json ? JSON.parse(opp.seniority_signals_json) : [],
    remoteSignals: opp.remote_signals_json ? JSON.parse(opp.remote_signals_json) : [],
    riskSignals: opp.risk_signals_json ? JSON.parse(opp.risk_signals_json) : [],
    extractionConfidence: opp.extraction_confidence || 0,
    analyzedAt: opp.analyzed_at || undefined,
    analysis_version: version
  };
}
