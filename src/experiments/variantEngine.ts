import { ProspectLead, ExperimentVariant } from '../types';

export interface GeneratedVariantDraft {
  variant_id: string;
  variant_type: 'A' | 'B' | 'C' | 'CONTROL';
  subject: string;
  body: string;
  opening_hook: string;
  cta: string;
}

/** Genera bozze multivarianti basate su Evidence Guard per un prospect */
export function generateVariantDraftsForProspect(
  prospect: ProspectLead,
  experimentId: string
): GeneratedVariantDraft[] {
  const companyName = prospect.name || 'la vostra azienda';
  const primaryEvidence = prospect.evidences && prospect.evidences.length > 0 ? prospect.evidences[0] : null;
  const factText = primaryEvidence?.evidence_text || 'presenza digitale attiva';
  const factSource = primaryEvidence?.source_page || prospect.website;

  if (prospect.mode === 'danceflow') {
    return [
      {
        variant_id: `${experimentId}_A`,
        variant_type: 'A',
        opening_hook: 'EVIDENCE_FIRST',
        cta: 'DEMO_ACCESSO',
        subject: `Iscrizioni 2026: togliere il PDF per ${companyName}`,
        body: `Buongiorno,\n\nho visto sul vostro sito (${factSource}) che per le iscrizioni fate riferimento a un modulo scaricabile.\n\nCon DanceFlow le famiglie compilano in 2 minuti da smartphone, la quota parte subito e la segreteria riceve tutto già ordinato per corso — senza cambiare le vostre abitudini.\n\nSe le fa piacere le mostro un accesso demo rapido con i vostri corsi già caricati.\n\nGabriele Mannino — Growth Studio`,
      },
      {
        variant_id: `${experimentId}_B`,
        variant_type: 'B',
        opening_hook: 'PROBLEM_FIRST',
        cta: 'TEST_5_MIN',
        subject: `Gestione quote e moduli: semplificare la segreteria di ${companyName}`,
        body: `Buongiorno,\n\na inizio anno accademico le segreterie delle scuole di danza spendono oltre 15 ore a settimana a verificare bonifici e rincorrere moduli non compilati.\n\nDanceFlow automatizza l'intera raccolta iscrizioni e incassi in un'unica schermata chiara.\n\nHa senso un test di 5 minuti senza impegno per vedere come funzionerebbe per i vostri corsi?\n\nGabriele Mannino — Growth Studio`,
      },
      {
        variant_id: `${experimentId}_C`,
        variant_type: 'C',
        opening_hook: 'CURIOSITY_FIRST',
        cta: 'VIDEO_3_MIN',
        subject: `Un modo più semplice per le iscrizioni di ${companyName}`,
        body: `Buongiorno,\n\nabbiamo preparato un breve video di 3 minuti che mostra come le scuole di danza raccolgono iscrizioni e quote direttamente su smartphone in 2 click.\n\nTi andrebbe di vederlo senza alcun impegno?\n\nGabriele Mannino — Growth Studio`,
      },
    ];
  }

  // Fallback B2B / AI Automation
  return [
    {
      variant_id: `${experimentId}_A`,
      variant_type: 'A',
      opening_hook: 'EVIDENCE_FIRST',
      cta: 'TEST_10_PROSPECTS',
      subject: `Opportunità commerciale qualificata per ${companyName}`,
      body: `Gentile team di ${companyName},\n\nho notato sul vostro sito (${factSource}) la vostra offerta di servizi.\n\nStiamo testando Vedetta Sales OS, una tecnologia che qualifica prospect verificando evidenze fattuali prima del contatto.\n\nHa senso se vi mostro 10 prospect mirati per il vostro target?\n\nGabriele Mannino — Growth Studio`,
    },
    {
      variant_id: `${experimentId}_B`,
      variant_type: 'B',
      opening_hook: 'PROBLEM_FIRST',
      cta: 'DEMO_PIPELINE',
      subject: `Acquisizione clienti B2B per ${companyName}`,
      body: `Gentile team di ${companyName},\n\nmolte realtà B2B perdono tempo su prospect non qualificati o contatti a freddo senza contesto.\n\nAbbiamo sviluppato un motore di revenue intelligence che intercetta aziende con reale fabbisogno attivo.\n\nVi andrebbe di vedere una demo pratica sul vostro settore?\n\nGabriele Mannino — Growth Studio`,
    },
  ];
}
