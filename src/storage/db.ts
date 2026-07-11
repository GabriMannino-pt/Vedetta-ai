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
      stato            TEXT NOT NULL DEFAULT 'nuovo'
    )
  `);

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
       urgenza, data_trovato, stato)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       WHERE stato = 'nuovo' AND punteggio_intent >= ?
       ORDER BY punteggio_intent DESC
       LIMIT ?`
    )
    .all(minScore, limit) as Lead[];
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
