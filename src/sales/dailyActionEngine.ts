import { getDb } from '../storage/db';
import { DailySalesTask, DataTag, ExtendedDeal, OutreachMessage, ProspectLead } from '../types';

function getDatabase() {
  return getDb();
}

/** Genera e restituisce la lista prioritaria di azioni commerciali per oggi */
export function getDailySalesActions(dataTag?: DataTag): DailySalesTask[] {
  const db = getDatabase();
  const tag = dataTag || 'LIVE';
  const now = new Date().toISOString();
  const tasks: DailySalesTask[] = [];

  // 1. PRIORITÀ 1: Deal in chiusura / Incasso pagamento pendente
  const pendingPaymentDeals = db
    .prepare("SELECT * FROM extended_deals WHERE stage = 'PAYMENT_PENDING' AND data_tag = ?")
    .all(tag) as ExtendedDeal[];

  pendingPaymentDeals.forEach((d) => {
    tasks.push({
      id: `TASK_PAYMENT_${d.id}`,
      priority_level: 1,
      title: `Incassare pagamento €${d.deal_value} — ${d.company_name}`,
      reason: `Deal approvato in attesa di conferma bonifico/Stripe.`,
      expected_value: d.deal_value,
      urgency: 'ALTA',
      action_type: 'COLLECT_PAYMENT',
      deal_id: d.id,
      status: 'PENDING',
      created_at: now,
    });
  });

  // 2. PRIORITÀ 2: Follow-up su prospect con risposta positiva
  const positiveDeals = db
    .prepare("SELECT * FROM extended_deals WHERE stage = 'POSITIVE_REPLY' AND data_tag = ?")
    .all(tag) as ExtendedDeal[];

  positiveDeals.forEach((d) => {
    tasks.push({
      id: `TASK_POS_REPLY_${d.id}`,
      priority_level: 1,
      title: `Fissare Demo per ${d.company_name} (${d.project_name})`,
      reason: `Il prospect ha risposto con interesse positivo. Rispondere entro 2 ore per massimizzare la conversione.`,
      expected_value: d.deal_value * 0.5,
      urgency: 'ALTA',
      action_type: 'FOLLOW_UP_POSITIVE',
      deal_id: d.id,
      prospect_id: d.prospect_id,
      status: 'PENDING',
      created_at: now,
    });
  });

  // 3. PRIORITÀ 3: Preparare demo per prospect in stadio DEMO
  const demoDeals = db
    .prepare("SELECT * FROM extended_deals WHERE stage = 'DEMO' AND data_tag = ?")
    .all(tag) as ExtendedDeal[];

  demoDeals.forEach((d) => {
    tasks.push({
      id: `TASK_DEMO_${d.id}`,
      priority_level: 2,
      title: `Eseguire Demo personalizzata per ${d.company_name}`,
      reason: `Presentare la soluzione pre-caricata con i dati estratti dal sito.`,
      expected_value: d.deal_value * 0.35,
      urgency: 'ALTA',
      action_type: 'PREPARE_DEMO',
      deal_id: d.id,
      prospect_id: d.prospect_id,
      status: 'PENDING',
      created_at: now,
    });
  });

  // 4. PRIORITÀ 4: Approvare ed inviare nuovi prospect verificati
  const pendingOutreach = db
    .prepare("SELECT COUNT(*) as cnt FROM outreach_messages WHERE status = 'READY_FOR_APPROVAL'")
    .get() as { cnt: number };

  if (pendingOutreach && pendingOutreach.cnt > 0) {
    tasks.push({
      id: `TASK_APPROVE_OUTREACH`,
      priority_level: 3,
      title: `Approvare ${pendingOutreach.cnt} email pronte in coda`,
      reason: `Prospect qualificati dall'Evidence Guard con punteggio medio > 85/100.`,
      expected_value: pendingOutreach.cnt * 89,
      urgency: 'MEDIA',
      action_type: 'APPROVE_OUTREACH',
      status: 'PENDING',
      created_at: now,
    });
  }

  // 5. PRIORITÀ 5: Analisi esperimenti attivi
  const runningExps = db
    .prepare("SELECT id, name, product FROM experiments WHERE status = 'RUNNING' AND data_tag = ?")
    .all(tag) as any[];

  if (runningExps.length > 0) {
    tasks.push({
      id: `TASK_ANALYZE_EXPS`,
      priority_level: 4,
      title: `Monitorare ${runningExps.length} esperimenti commerciali attivi`,
      reason: `Verificare tassi di apertura e risposte per individuare la variante vincente.`,
      expected_value: 500,
      urgency: 'BASSA',
      action_type: 'ANALYZE_EXPERIMENT',
      status: 'PENDING',
      created_at: now,
    });
  }

  // Ordina rigorosamente per Priority Level (1 -> 5) e Expected Value decrescente
  tasks.sort((a, b) => {
    if (a.priority_level !== b.priority_level) return a.priority_level - b.priority_level;
    return b.expected_value - a.expected_value;
  });

  db.close();
  return tasks;
}
