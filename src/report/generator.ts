import { Lead } from '../types';
import { appConfig } from '../config';
import { getQualifiedLeads } from '../storage/db';

const URGENZA_EMOJI: Record<string, string> = {
  alta: '🔴',
  media: '🟡',
  bassa: '🟢',
};

const FONTE_TAGS: Record<string, string> = {
  upwork: '💼 [UPWORK]',
  reddit: '🤖 [REDDIT]',
  twitter: '🐦 [TWITTER]',
  n8n_forum: '🔌 [FORUM]',
  make_forum: '🔌 [FORUM]',
};

/**
 * Genera il report in formato Markdown con i lead qualificati.
 * Restituisce il testo del report e la lista di lead inclusi (per marcarli come processati).
 */
export function generateReport(): { text: string; leads: Lead[] } {
  const minScore = appConfig.scoring.minIntentScore;
  const maxLeads = appConfig.report.maxLeadsInReport;
  const leads = getQualifiedLeads(minScore, maxLeads);

  if (leads.length === 0) {
    return {
      text: '📭 *Vedetta Report* — Nessuna nuova opportunità qualificata oggi.',
      leads: [],
    };
  }

  const now = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push(`🔭 *VEDETTA REPORT — ${now}*`);
  lines.push(`📊 ${leads.length} opportunità con punteggio ≥ ${minScore}\n`);
  lines.push('─'.repeat(30));

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const urgEmoji = URGENZA_EMOJI[lead.urgenza] || '⚪';
    const budgetTag = lead.evidenza_budget ? ' 💰' : '';
    const sourceTag = FONTE_TAGS[lead.fonte] || `[${lead.fonte.toUpperCase()}]`;

    lines.push('');
    lines.push(`*#${i + 1} — Score: ${lead.punteggio_intent}/10* ${urgEmoji}${budgetTag}`);
    lines.push(`📂 Settore: ${lead.settore}`);
    lines.push(`📌 Fonte: ${sourceTag}`);
    lines.push(`🔗 ${lead.url}`);
    lines.push('');
    lines.push(`*Problema:* ${lead.problema}`);

    if (lead.evidenza_budget_dettaglio) {
      lines.push(`*Budget:* ${lead.evidenza_budget_dettaglio}`);
    }

    lines.push(`*Soluzione proposta:* ${lead.soluzione_proposta}`);
    lines.push('');
    lines.push(`_Bozza risposta:_`);
    lines.push(lead.bozza_risposta);
    lines.push('');
    lines.push('─'.repeat(30));
  }

  lines.push('');
  lines.push(`✅ Fine report. Buon prospecting!`);

  return { text: lines.join('\n'), leads };
}
