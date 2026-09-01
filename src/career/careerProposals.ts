import { getDb } from '../storage/db';
import { CareerProposal, ProposalClaim, ProposalStatus } from '../types';

export function createProposal(prop: CareerProposal, claims: ProposalClaim[] = []): number {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO career_proposals (
      application_id, content, proposal_status, proposal_version,
      proposal_algorithm_version, created_at, validated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    prop.application_id,
    prop.content,
    prop.proposal_status,
    prop.proposal_version || 1,
    prop.proposal_algorithm_version || 1,
    now,
    prop.validated_at || null
  );

  const proposalId = info.lastInsertRowid as number;

  if (claims.length > 0) {
    const claimStmt = db.prepare(`
      INSERT INTO career_proposal_claims (
        proposal_id, claim_text, claim_type, support_level,
        evidence_id, source_reference, validation_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of claims) {
      claimStmt.run(
        proposalId,
        c.claim_text,
        c.claim_type,
        c.support_level,
        c.evidence_id || null,
        c.source_reference || null,
        c.validation_status,
        now
      );
    }
  }

  // Update application proposal_id link
  db.prepare('UPDATE career_applications SET proposal_id = ? WHERE id = ?').run(proposalId, prop.application_id);

  return proposalId;
}

export function getProposal(id: number): CareerProposal | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_proposals WHERE id = ?').get(id) as any;
  if (!row) return null;
  const claims = getProposalClaims(id);
  return {
    ...mapRowToProposal(row),
    claims
  };
}

export function getProposalForApplication(applicationId: number): CareerProposal | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM career_proposals WHERE application_id = ? ORDER BY proposal_version DESC, id DESC LIMIT 1').get(applicationId) as any;
  if (!row) return null;
  const claims = getProposalClaims(row.id);
  return {
    ...mapRowToProposal(row),
    claims
  };
}

export function getProposalClaims(proposalId: number): ProposalClaim[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM career_proposal_claims WHERE proposal_id = ? ORDER BY id ASC').all(proposalId) as any[];
  return rows.map(r => ({
    id: r.id,
    proposal_id: r.proposal_id,
    claim_text: r.claim_text,
    claim_type: r.claim_type,
    support_level: r.support_level,
    evidence_id: r.evidence_id,
    source_reference: r.source_reference,
    validation_status: r.validation_status,
    created_at: r.created_at
  }));
}

export function updateProposalStatus(id: number, status: ProposalStatus): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE career_proposals SET proposal_status = ?, validated_at = ? WHERE id = ?').run(status, now, id);
}

function mapRowToProposal(r: any): CareerProposal {
  return {
    id: r.id,
    application_id: r.application_id,
    content: r.content,
    proposal_status: r.proposal_status,
    proposal_version: r.proposal_version,
    proposal_algorithm_version: r.proposal_algorithm_version,
    created_at: r.created_at,
    validated_at: r.validated_at
  };
}
