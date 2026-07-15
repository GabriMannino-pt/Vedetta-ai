import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Lead } from '../types';

const DB_DIR = path.resolve(__dirname, '..', '..', '.data');
const DB_PATH = path.join(DB_DIR, 'vedetta.db');

let db: Database.Database | null = null;

/** Inizializza il database e crea la tabella leads se non esiste */
export function initDb(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // WAL mode per performance migliori
  db.pragma('journal_mode = WAL');

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

  // Migrazione retrocompatibile per le colonne del CRM e il tipo
  try { db.exec("ALTER TABLE leads ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'nuovo'"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN client_email TEXT"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN notes TEXT"); } catch {}
  try { db.exec("ALTER TABLE leads ADD COLUMN tipo TEXT NOT NULL DEFAULT 'inbound'"); } catch {}

  console.log(`[DB] ✅ Database inizializzato: ${DB_PATH}`);
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database non inizializzato. Chiama initDb() prima.');
  return db;
}

/** Controlla se un URL è già stato processato */
export function isAlreadyProcessed(url: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM leads WHERE url = ?').get(url);
  return !!row;
}

/** Inserisce un nuovo lead nel database */
export function insertLead(lead: Omit<Lead, 'id'>): void {
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

/**
 * Recupera i lead qualificati (non ancora inviati) per il report.
 * Restituisce solo lead con stato 'nuovo' e punteggio >= minScore,
 * ordinati per punteggio decrescente.
 */
export function getQualifiedLeads(minScore: number, limit: number): Lead[] {
  return getDb()
    .prepare(
      `SELECT * FROM leads
       WHERE stato = 'nuovo' AND tipo = 'inbound' AND punteggio_intent >= ?
       ORDER BY punteggio_intent DESC
       LIMIT ?`
    )
      .all(minScore, limit) as Lead[];
}

/** Recupera tutti i lead nel database per la dashboard */
export function getAllLeads(): Lead[] {
  return getDb()
    .prepare('SELECT * FROM leads ORDER BY punteggio_intent DESC, data_trovato DESC')
    .all() as Lead[];
}

/** Recupera i lead filtrati per tipo (inbound o outbound) */
export function getLeadsByType(tipo: 'inbound' | 'outbound'): Lead[] {
  return getDb()
    .prepare('SELECT * FROM leads WHERE tipo = ? ORDER BY punteggio_intent DESC, data_trovato DESC')
    .all(tipo) as Lead[];
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

/** Chiude la connessione al database */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Conta totale lead nel database */
export function countLeads(): number {
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM leads').get() as { cnt: number };
  return row.cnt;
}
