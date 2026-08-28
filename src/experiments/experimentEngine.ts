import { getDb } from '../storage/db';
import {
  Experiment,
  ExperimentVariant,
  ExperimentAssignment,
  ExperimentEvent,
  DataTag,
  ExperimentStatus,
} from '../types';

function getDatabase() {
  return getDb();
}

/** Crea un nuovo esperimento A/B/C controllato */
export function createExperiment(
  exp: Omit<Experiment, 'status' | 'start_date' | 'is_statistically_significant'>,
  variants: Omit<ExperimentVariant, 'experiment_id'>[]
): Experiment {
  const db = getDatabase();

  const newExp: Experiment = {
    ...exp,
    status: 'RUNNING',
    start_date: new Date().toISOString(),
    min_sample_size: exp.min_sample_size || 30,
    is_statistically_significant: false,
    data_tag: exp.data_tag || 'LIVE',
  };

  db.prepare(`
    INSERT INTO experiments (id, product, name, hypothesis, status, start_date, min_sample_size, data_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newExp.id,
    newExp.product,
    newExp.name,
    newExp.hypothesis,
    newExp.status,
    newExp.start_date,
    newExp.min_sample_size,
    newExp.data_tag
  );

  const insertVariant = db.prepare(`
    INSERT INTO experiment_variants (id, experiment_id, name, type, opening_hook, cta_type, offer_type, template_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  variants.forEach((v) => {
    insertVariant.run(
      v.id,
      newExp.id,
      v.name,
      v.type,
      v.opening_hook,
      v.cta_type,
      v.offer_type,
      v.template_content || null
    );
  });

  db.close();
  return newExp;
}

/** Assegna in modo deterministico e univoco un prospect a una variante */
export function assignProspectToVariant(
  experimentId: string,
  prospectId: number,
  metadata: { channel?: string; segment?: string; product: string }
): ExperimentAssignment {
  const db = getDatabase();

  // Controlla se già assegnato in questo esperimento
  const existing = db
    .prepare('SELECT * FROM experiment_assignments WHERE experiment_id = ? AND prospect_id = ?')
    .get(experimentId, prospectId) as ExperimentAssignment | undefined;

  if (existing) {
    db.close();
    return existing;
  }

  // Prendi le varianti disponibili
  const variants = db
    .prepare('SELECT * FROM experiment_variants WHERE experiment_id = ? ORDER BY type ASC')
    .all(experimentId) as ExperimentVariant[];

  if (variants.length === 0) {
    db.close();
    throw new Error(`Nessuna variante trovata per l'esperimento ${experimentId}`);
  }

  // Assegnazione bilanciata deterministica (round-robin o hash su prospectId)
  const variantIndex = prospectId % variants.length;
  const assignedVariant = variants[variantIndex];

  const assignment: ExperimentAssignment = {
    experiment_id: experimentId,
    variant_id: assignedVariant.id,
    prospect_id: prospectId,
    assigned_at: new Date().toISOString(),
    channel: metadata.channel || 'email',
    segment: metadata.segment || 'default',
    product: metadata.product,
  };

  db.prepare(`
    INSERT INTO experiment_assignments (experiment_id, variant_id, prospect_id, assigned_at, channel, segment, product)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    assignment.experiment_id,
    assignment.variant_id,
    assignment.prospect_id,
    assignment.assigned_at,
    assignment.channel,
    assignment.segment,
    assignment.product
  );

  db.close();
  return assignment;
}

/** Registra un evento di funnel per l'esperimento */
export function recordExperimentEvent(event: Omit<ExperimentEvent, 'id' | 'created_at'>): ExperimentEvent {
  const db = getDatabase();

  const newEvent: ExperimentEvent = {
    ...event,
    created_at: new Date().toISOString(),
    data_tag: event.data_tag || 'LIVE',
  };

  const res = db
    .prepare(`
    INSERT INTO experiment_events (experiment_id, variant_id, prospect_id, event_type, value, metadata, created_at, data_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      newEvent.experiment_id,
      newEvent.variant_id,
      newEvent.prospect_id,
      newEvent.event_type,
      newEvent.value || 0,
      newEvent.metadata ? JSON.stringify(newEvent.metadata) : null,
      newEvent.created_at,
      newEvent.data_tag
    );

  newEvent.id = Number(res.lastInsertRowid);
  db.close();
  return newEvent;
}

/** Ottieni un esperimento con relative varianti */
export function getExperiment(experimentId: string): {
  experiment: Experiment | null;
  variants: ExperimentVariant[];
  assignmentsCount: number;
} {
  const db = getDatabase();

  const experiment = db.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId) as Experiment | undefined;
  if (!experiment) {
    db.close();
    return { experiment: null, variants: [], assignmentsCount: 0 };
  }

  const variants = db
    .prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?')
    .all(experimentId) as ExperimentVariant[];

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM experiment_assignments WHERE experiment_id = ?')
    .get(experimentId) as { cnt: number };

  db.close();
  return {
    experiment,
    variants,
    assignmentsCount: countRow ? countRow.cnt : 0,
  };
}

/** Lista tutti gli esperimenti con filtro prodotto e data_tag */
export function listExperiments(product?: string, dataTag?: DataTag): Experiment[] {
  const db = getDatabase();

  let query = 'SELECT * FROM experiments';
  const params: any[] = [];
  const clauses: string[] = [];

  if (product) {
    clauses.push('product = ?');
    params.push(product);
  }
  if (dataTag) {
    clauses.push('data_tag = ?');
    params.push(dataTag);
  }

  if (clauses.length > 0) {
    query += ' WHERE ' + clauses.join(' AND ');
  }

  query += ' ORDER BY start_date DESC';

  const rows = db.prepare(query).all(...params) as Experiment[];
  db.close();
  return rows;
}
