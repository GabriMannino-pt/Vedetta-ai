import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Lead, DanceFlowProspect } from '../types';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = isServerless ? path.join('/tmp', '.data') : path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

let db: Database.Database;

/** Inizializza il database e crea le tabelle leads e prospects se non esistono */
export function initDb(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  } catch (err: any) {
    db = new Database(':memory:');
  }

  // Tabella Legacy / Social Scout Leads
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      fonte            TEXT NOT NULL,
      url              TEXT NOT NULL UNIQUE,
      titolo           TEXT NOT NULL,
      testo            TEXT NOT NULL,
      punteggio_intent INTEGER NOT NULL,
      settore          TEXT,
      problema         TEXT,
      soluzione_proposta TEXT,
      bozza_risposta   TEXT,
      evidenza_budget  INTEGER DEFAULT 0,
      evidenza_budget_dettaglio TEXT,
      urgenza          TEXT,
      data_trovato     TEXT NOT NULL,
      stato            TEXT NOT NULL DEFAULT 'nuovo',
      pipeline_status  TEXT NOT NULL DEFAULT 'nuovo',
      client_email     TEXT,
      notes            TEXT,
      tipo             TEXT NOT NULL DEFAULT 'inbound'
    )
  `);

  // Tabella SOS Prospects (DanceFlow & futuri mode)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      mode                        TEXT NOT NULL DEFAULT 'danceflow',
      name                        TEXT NOT NULL,
      city                        TEXT NOT NULL,
      website                     TEXT NOT NULL UNIQUE,
      email                       TEXT,
      phone                       TEXT,
      social                      TEXT,
      estimated_size              TEXT,
      key_signals_json            TEXT,
      evidences_json              TEXT,
      pain_points_json            TEXT,
      competitor_current_software TEXT,
      score_fit                   INTEGER,
      score_pain                  INTEGER,
      score_intent                INTEGER,
      score_value                 INTEGER,
      danceflow_score             INTEGER,
      classification              TEXT,
      reason                      TEXT,
      opening_angle               TEXT,
      recommended_action          TEXT,
      suggested_outreach_json     TEXT,
      scouted_at                  TEXT NOT NULL,
      pipeline_status             TEXT NOT NULL DEFAULT 'NEW',
      contacted_at                TEXT,
      notes                       TEXT
    )
  `);

  // Tabella Deals / Opportunità Economiche
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id                 INTEGER,
      project_name                TEXT NOT NULL,
      company_name                TEXT NOT NULL,
      stage                       TEXT NOT NULL DEFAULT 'QUALIFIED',
      potential_mrr               INTEGER NOT NULL DEFAULT 0,
      potential_arr               INTEGER NOT NULL DEFAULT 0,
      one_time_fee                INTEGER NOT NULL DEFAULT 0,
      probability_percent         INTEGER NOT NULL DEFAULT 20,
      weighted_value              INTEGER NOT NULL DEFAULT 0,
      last_interaction            TEXT,
      next_action                 TEXT,
      created_at                  TEXT NOT NULL,
      updated_at                  TEXT NOT NULL
    )
  `);

  // Tabella Projects Portfolio
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      name                        TEXT PRIMARY KEY,
      repo_url                    TEXT,
      local_path                  TEXT,
      description                 TEXT,
      tech_stack_json             TEXT,
      features_json               TEXT,
      target_user                 TEXT,
      business_model              TEXT,
      pricing_model               TEXT,
      estimated_price_range       TEXT,
      maturity                    TEXT,
      commercial_score            INTEGER,
      commercial_decision         TEXT,
      audit_json                  TEXT,
      updated_at                  TEXT NOT NULL
    )
  `);

  // Tabella Outreach Messages con Governance Evidence Guard
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_messages (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id                 INTEGER,
      channel                     TEXT NOT NULL DEFAULT 'whatsapp',
      stage                       TEXT NOT NULL DEFAULT 'FIRST_CONTACT',
      subject                     TEXT,
      content                     TEXT NOT NULL,
      quality_score               INTEGER NOT NULL DEFAULT 0,
      status                      TEXT NOT NULL DEFAULT 'READY_FOR_APPROVAL',
      evidence_ids_json           TEXT,
      claims_json                 TEXT,
      quality_details_json        TEXT,
      created_at                  TEXT NOT NULL,
      approved_at                 TEXT,
      sent_at                     TEXT
    )
  `);

  // Migrazioni retrocompatibili
  try { db.exec("ALTER TABLE leads ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'nuovo'"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN client_email TEXT"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN notes TEXT"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN tipo TEXT NOT NULL DEFAULT 'inbound'"); } catch {}

  // Migrazioni Vedetta 1.1 (Experiments, Revenue, Learning, Product Scores)
  try {
    const { runMigrations1_1 } = require('./migrations_1_1');
    runMigrations1_1(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.1 warning:', e.message);
  }

  // Migrazioni Vedetta 1.2 (Career OS Foundation)
  try {
    const { runMigrations1_2 } = require('./migrations_1_2');
    runMigrations1_2(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.2 warning:', e.message);
  }

  // Migrazioni Vedetta 1.3 (Career Opportunities Core)
  try {
    const { runMigrations1_3 } = require('./migrations_1_3');
    runMigrations1_3(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.3 warning:', e.message);
  }

  // Migrazioni Vedetta 1.4 (Opportunity Requirements)
  try {
    const { runMigrations1_4 } = require('./migrations_1_4');
    runMigrations1_4(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.4 warning:', e.message);
  }

  // Migrazioni Vedetta 1.5 (Fit Scoring Persistence)
  try {
    const { runMigrations1_5 } = require('./migrations_1_5');
    runMigrations1_5(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.5 warning:', e.message);
  }

  // Migrazioni Vedetta 1.6 (Application Intelligence & Proposals)
  try {
    const { runMigrations1_6 } = require('./migrations_1_6');
    runMigrations1_6(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.6 warning:', e.message);
  }

  // Migrazioni Vedetta 1.7 (Career Outcome Tracking & Learning)
  try {
    const { runMigrations1_7 } = require('./migrations_1_7');
    runMigrations1_7(db);
  } catch (e: any) {
    console.warn('[DB] Migrazioni 1.7 warning:', e.message);
  }

  console.log(`[DB] ✅ Database inizializzato: ${DB_PATH}`);
}

export function getDb(): Database.Database {
  if (!db || !db.open) {
    initDb();
  }
  return db;
}

/** Controlla se un URL è già stato processato */
export function isAlreadyProcessed(url: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM leads WHERE url = ?').get(url);
  return !!row;
}

/** Controlla se un prospect per sito web è già presente */
export function isProspectExists(website: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM prospects WHERE website = ?').get(website);
  return !!row;
}

/** Inserisce o aggiorna un prospect qualificato */
export function insertOrUpdateProspect(prospect: any): void {
  const stmt = getDb().prepare(`
    INSERT INTO prospects
      (mode, name, city, website, email, phone, social, estimated_size,
       key_signals_json, evidences_json, pain_points_json, competitor_current_software,
       score_fit, score_pain, score_intent, score_value, danceflow_score,
       classification, reason, opening_angle, recommended_action,
       suggested_outreach_json, scouted_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(website) DO UPDATE SET
      mode=excluded.mode,
      name=excluded.name,
      city=excluded.city,
      email=excluded.email,
      phone=excluded.phone,
      social=excluded.social,
      estimated_size=excluded.estimated_size,
      key_signals_json=excluded.key_signals_json,
      evidences_json=excluded.evidences_json,
      pain_points_json=excluded.pain_points_json,
      competitor_current_software=excluded.competitor_current_software,
      score_fit=excluded.score_fit,
      score_pain=excluded.score_pain,
      score_intent=excluded.score_intent,
      score_value=excluded.score_value,
      danceflow_score=excluded.danceflow_score,
      classification=excluded.classification,
      reason=excluded.reason,
      opening_angle=excluded.opening_angle,
      recommended_action=excluded.recommended_action,
      suggested_outreach_json=excluded.suggested_outreach_json
  `);

  stmt.run(
    prospect.mode || 'danceflow',
    prospect.name,
    prospect.city,
    prospect.website,
    prospect.email,
    prospect.phone,
    prospect.social,
    prospect.estimated_size,
    JSON.stringify(prospect.key_signals || []),
    JSON.stringify(prospect.evidences || []),
    JSON.stringify(prospect.pain_points || []),
    prospect.competitor_current_software,
    prospect.score_breakdown.fit,
    prospect.score_breakdown.pain,
    prospect.score_breakdown.intent,
    prospect.score_breakdown.value,
    prospect.opportunity_score || prospect.danceflow_score || 0,
    prospect.classification,
    prospect.reason,
    prospect.opening_angle,
    prospect.recommended_action,
    JSON.stringify(prospect.suggested_outreach || {}),
    prospect.scouted_at
  );
}

/** Inserisce o aggiorna un Deal economico nel CRM */
export function insertOrUpdateDeal(deal: any): void {
  const stmt = getDb().prepare(`
    INSERT INTO deals
      (prospect_id, project_name, company_name, stage, potential_mrr,
       potential_arr, one_time_fee, probability_percent, weighted_value,
       last_interaction, next_action, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    deal.prospect_id || null,
    deal.project_name,
    deal.company_name,
    deal.stage,
    deal.potential_mrr,
    deal.potential_arr,
    deal.one_time_fee,
    deal.probability_percent,
    deal.weighted_value,
    deal.last_interaction || new Date().toISOString(),
    deal.next_action || '',
    deal.created_at || new Date().toISOString(),
    deal.updated_at || new Date().toISOString()
  );
}

/** Recupera tutti i deal */
export function getAllDeals(): any[] {
  return getDb().prepare('SELECT * FROM deals ORDER BY weighted_value DESC, potential_arr DESC').all();
}

/** Recupera tutti i prospect per una modalità specifica o tutte */
export function getProspectsByMode(mode?: string): any[] {
  const rows = mode
    ? getDb().prepare('SELECT * FROM prospects WHERE mode = ? ORDER BY danceflow_score DESC, scouted_at DESC').all(mode)
    : getDb().prepare('SELECT * FROM prospects ORDER BY danceflow_score DESC, scouted_at DESC').all();

  return (rows as any[]).map((r) => ({
    id: r.id,
    mode: r.mode,
    name: r.name,
    city: r.city,
    website: r.website,
    email: r.email,
    phone: r.phone,
    social: r.social,
    estimated_size: r.estimated_size,
    key_signals: JSON.parse(r.key_signals_json || '[]'),
    evidences: JSON.parse(r.evidences_json || '[]'),
    pain_points: JSON.parse(r.pain_points_json || '[]'),
    competitor_current_software: r.competitor_current_software,
    score_breakdown: {
      fit: r.score_fit || 0,
      pain: r.score_pain || 0,
      intent: r.score_intent || 0,
      value: r.score_value || 0,
    },
    opportunity_score: r.danceflow_score || 0,
    danceflow_score: r.danceflow_score || 0,
    classification: r.classification,
    reason: r.reason,
    opening_angle: r.opening_angle,
    recommended_action: r.recommended_action,
    suggested_outreach: JSON.parse(r.suggested_outreach_json || '{}'),
    scouted_at: r.scouted_at,
  }));
}

/** Salva o aggiorna un progetto nel portfolio */
export function saveProjectDossier(project: any): void {
  const stmt = getDb().prepare(`
    INSERT INTO projects
      (name, repo_url, local_path, description, tech_stack_json, features_json,
       target_user, business_model, pricing_model, estimated_price_range,
       maturity, commercial_score, commercial_decision, audit_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      repo_url=excluded.repo_url,
      local_path=excluded.local_path,
      description=excluded.description,
      tech_stack_json=excluded.tech_stack_json,
      features_json=excluded.features_json,
      target_user=excluded.target_user,
      business_model=excluded.business_model,
      pricing_model=excluded.pricing_model,
      estimated_price_range=excluded.estimated_price_range,
      maturity=excluded.maturity,
      commercial_score=excluded.commercial_score,
      commercial_decision=excluded.commercial_decision,
      audit_json=excluded.audit_json,
      updated_at=excluded.updated_at
  `);

  stmt.run(
    project.name,
    project.repo_url,
    project.local_path || null,
    project.description,
    JSON.stringify(project.tech_stack || []),
    JSON.stringify(project.features || []),
    project.target_user,
    project.business_model,
    project.pricing_model,
    project.estimated_price_range,
    project.maturity,
    project.commercial_audit?.commercial_score || 0,
    project.commercial_audit?.decision || 'WATCH',
    JSON.stringify(project.commercial_audit || {}),
    new Date().toISOString()
  );
}

/** Recupera tutti i progetti salvati */
export function getAllProjects(): any[] {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY commercial_score DESC').all() as any[];
  return rows.map(r => ({
    name: r.name,
    repo_url: r.repo_url,
    local_path: r.local_path,
    description: r.description,
    tech_stack: JSON.parse(r.tech_stack_json || '[]'),
    features: JSON.parse(r.features_json || '[]'),
    target_user: r.target_user,
    business_model: r.business_model,
    pricing_model: r.pricing_model,
    estimated_price_range: r.estimated_price_range,
    maturity: r.maturity,
    commercial_score: r.commercial_score,
    commercial_decision: r.commercial_decision,
    commercial_audit: JSON.parse(r.audit_json || '{}'),
    updated_at: r.updated_at
  }));
}

/** Inserisce un nuovo lead nel database (legacy) */
export function insertLead(lead: any): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO leads
      (fonte, url, titolo, testo, punteggio_intent, settore, problema,
       soluzione_proposta, bozza_risposta, evidenza_budget, evidenza_budget_dettaglio,
       urgenza, data_trovato, stato, pipeline_status, tipo)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    lead.fonte,
    lead.url,
    lead.titolo,
    lead.testo,
    lead.punteggio_intent,
    lead.settore,
    lead.problema,
    lead.soluzione_proposta,
    lead.bozza_risposta,
    lead.evidenza_budget ? 1 : 0,
    lead.evidenza_budget_dettaglio,
    lead.urgenza,
    lead.data_trovato,
    lead.stato,
    lead.pipeline_status || 'nuovo',
    lead.tipo || 'inbound'
  );
}

/** Recupera i lead qualificati (non ancora inviati) per il report */
export function getQualifiedLeads(minScore: number, limit: number): any[] {
  return getDb()
    .prepare(
      `SELECT * FROM leads
       WHERE stato = 'nuovo' AND tipo = 'inbound' AND punteggio_intent >= ?
       ORDER BY punteggio_intent DESC
       LIMIT ?`
    )
    .all(minScore, limit);
}

/** Recupera tutti i lead nel database per la dashboard */
export function getAllLeads(): any[] {
  return getDb()
    .prepare('SELECT * FROM leads ORDER BY punteggio_intent DESC, data_trovato DESC')
    .all();
}

/** Recupera i lead filtrati per tipo (inbound o outbound) */
export function getLeadsByType(tipo: 'inbound' | 'outbound'): any[] {
  return getDb()
    .prepare('SELECT * FROM leads WHERE tipo = ? ORDER BY punteggio_intent DESC, data_trovato DESC')
    .all(tipo);
}

/** Aggiorna lo stato del lead nella pipeline del CRM */
export function updateLeadStatus(id: number, status: string): void {
  getDb()
    .prepare('UPDATE leads SET pipeline_status = ? WHERE id = ?')
    .run(status, id);
}

/** Aggiorna la mail del cliente associata al lead */
export function updateLeadEmail(id: number, email: string): void {
  getDb()
    .prepare('UPDATE leads SET client_email = ? WHERE id = ?')
    .run(email, id);
}

/** Aggiorna le note personali del lead */
export function updateLeadNotes(id: number, notes: string): void {
  getDb()
    .prepare('UPDATE leads SET notes = ? WHERE id = ?')
    .run(notes, id);
}

/** Segna i lead come 'processato' dopo l'invio del report */
export function markAsProcessed(ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  getDb()
    .prepare(`UPDATE leads SET stato = 'processato' WHERE id IN (${placeholders})`)
    .run(...ids);
}

/** Conta totale lead nel database */
export function countLeads(): number {
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM leads').get() as { cnt: number };
  return row ? row.cnt : 0;
}

/** Inserisce o aggiorna un messaggio di outreach */
export function insertOrUpdateOutreachMessage(msg: any): number {
  const stmt = getDb().prepare(`
    INSERT INTO outreach_messages
      (prospect_id, channel, stage, subject, content, quality_score, status,
       evidence_ids_json, claims_json, quality_details_json, created_at, approved_at, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    msg.prospect_id || 0,
    msg.channel || 'whatsapp',
    msg.stage || 'FIRST_CONTACT',
    msg.subject || null,
    msg.content,
    msg.quality_score || 0,
    msg.status || 'READY_FOR_APPROVAL',
    JSON.stringify(msg.evidence_ids || []),
    JSON.stringify(msg.claims || []),
    JSON.stringify(msg.quality_details || {}),
    msg.created_at || new Date().toISOString(),
    msg.approved_at || null,
    msg.sent_at || null
  );

  return info.lastInsertRowid as number;
}

/** Recupera i messaggi di outreach per un prospect */
export function getOutreachMessagesByProspect(prospectId: number): any[] {
  const rows = getDb().prepare('SELECT * FROM outreach_messages WHERE prospect_id = ? ORDER BY created_at DESC').all(prospectId) as any[];
  return rows.map(r => ({
    id: r.id,
    prospect_id: r.prospect_id,
    channel: r.channel,
    stage: r.stage,
    subject: r.subject,
    content: r.content,
    quality_score: r.quality_score,
    status: r.status,
    evidence_ids: JSON.parse(r.evidence_ids_json || '[]'),
    claims: JSON.parse(r.claims_json || '[]'),
    quality_details: JSON.parse(r.quality_details_json || '{}'),
    created_at: r.created_at,
    approved_at: r.approved_at,
    sent_at: r.sent_at
  }));
}

/** Recupera tutti i messaggi di outreach filtrati per status */
export function getOutreachMessagesByStatus(status?: string): any[] {
  const rows = status
    ? getDb().prepare('SELECT * FROM outreach_messages WHERE status = ? ORDER BY created_at DESC').all(status) as any[]
    : getDb().prepare('SELECT * FROM outreach_messages ORDER BY created_at DESC').all() as any[];

  return rows.map(r => ({
    id: r.id,
    prospect_id: r.prospect_id,
    channel: r.channel,
    stage: r.stage,
    subject: r.subject,
    content: r.content,
    quality_score: r.quality_score,
    status: r.status,
    evidence_ids: JSON.parse(r.evidence_ids_json || '[]'),
    claims: JSON.parse(r.claims_json || '[]'),
    quality_details: JSON.parse(r.quality_details_json || '{}'),
    created_at: r.created_at,
    approved_at: r.approved_at,
    sent_at: r.sent_at
  }));
}

/** Aggiorna lo stato di approvazione di un messaggio di outreach */
export function updateOutreachStatus(id: number, status: string, approvedAt?: string): void {
  getDb().prepare('UPDATE outreach_messages SET status = ?, approved_at = ? WHERE id = ?').run(status, approvedAt || (status === 'APPROVED' ? new Date().toISOString() : null), id);
}

/** Chiude il db */
export function closeDb(): void {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) return;
  if (db && db.open) {
    try {
      db.close();
    } catch {}
    db = null as any;
  }
}

/** Conta totale prospects nel database per mode */
export function countProspects(mode?: string): number {
  if (mode) {
    const row = getDb().prepare('SELECT COUNT(*) as cnt FROM prospects WHERE mode = ?').get(mode) as { cnt: number };
    return row ? row.cnt : 0;
  }
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM prospects').get() as { cnt: number };
  return row ? row.cnt : 0;
}



