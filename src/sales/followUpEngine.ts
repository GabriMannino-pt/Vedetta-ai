import { ProspectLead, OutreachMessage } from '../types';

export interface FollowUpPlan {
  prospect_id: number;
  stage: 'FOLLOW_UP_1' | 'FOLLOW_UP_2' | 'FINAL_FOLLOW_UP';
  scheduled_delay_days: number;
  suggested_subject: string;
  suggested_body: string;
  status: 'DRAFT' | 'READY_FOR_APPROVAL';
}

/** Genera bozza per sequenza di follow-up (subordinata ad approvazione umana) */
export function generateFollowUpPlan(
  prospect: ProspectLead,
  previousMessage: OutreachMessage,
  currentStage: 'FOLLOW_UP_1' | 'FOLLOW_UP_2' | 'FINAL_FOLLOW_UP'
): FollowUpPlan {
  const name = prospect.name || 'la vostra azienda';
  const prod = prospect.mode === 'danceflow' ? 'DanceFlow' : 'Vedetta Sales OS';

  if (currentStage === 'FOLLOW_UP_1') {
    return {
      prospect_id: prospect.id || 0,
      stage: 'FOLLOW_UP_1',
      scheduled_delay_days: 3,
      suggested_subject: `Re: ${previousMessage.subject || `Iscrizioni e corsi per ${name}`}`,
      suggested_body: `Buongiorno,\n\nvi riscrivo brevemente per sapere se avevate avuto modo di vedere il mio messaggio precedente.\n\nSe vi può far comodo, posso inviarvi un accesso demo già configurato con i vostri corsi, così da vedere l'esperienza dal punto di vista dei genitori in 2 minuti.\n\nResto a disposizione,\nGabriele Mannino`,
      status: 'READY_FOR_APPROVAL',
    };
  }

  if (currentStage === 'FOLLOW_UP_2') {
    return {
      prospect_id: prospect.id || 0,
      stage: 'FOLLOW_UP_2',
      scheduled_delay_days: 7,
      suggested_subject: `Un esempio pratico per ${name}`,
      suggested_body: `Buongiorno,\n\nimmagino che questo periodo sia molto intenso per le attività di inizio anno.\n\nVi lascio solo questo breve video riepilogativo di 2 minuti sul funzionamento del modulo digitale di ${prod}. Se preferite risentirci a stagione avviata, fatemelo sapere tranquillamente.\n\nUn cordiale saluto,\nGabriele Mannino`,
      status: 'READY_FOR_APPROVAL',
    };
  }

  return {
    prospect_id: prospect.id || 0,
    stage: 'FINAL_FOLLOW_UP',
    scheduled_delay_days: 14,
    suggested_subject: `Ultimo aggiornamento per ${name}`,
    suggested_body: `Buongiorno,\n\nnon vorrei essere insistente: deduco che al momento abbiate già un'organizzazione consolidata per le iscrizioni.\n\nChiudo qui i contatti; qualora voleste semplificare la segreteria in futuro, i miei riferimenti restano sempre validi.\n\nBuon proseguimento di stagione,\nGabriele Mannino`,
    status: 'READY_FOR_APPROVAL',
  };
}
