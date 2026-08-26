import { verifyAndScoreOutreach, generateFirstContactOutreach } from '../outreach/evidenceGuard';
import { ProspectLead, EvidenceItem } from '../types';

export function runEvidenceGuardUnitTests(): { total: number; passed: number; failed: number; results: { test: string; passed: boolean; details: string }[] } {
  console.log('\n🧪 [UNIT-TESTS] Avvio suite 10 test unitari Evidence Guard & Outreach Quality...\n');

  const results: { test: string; passed: boolean; details: string }[] = [];

  const baseProspect: ProspectLead = {
    id: 1,
    mode: 'danceflow',
    name: 'Scuola Danza Test',
    city: 'Milano',
    website: 'https://scuoladanzatest.it',
    email: 'info@scuoladanzatest.it',
    phone: '3480000000',
    social: null,
    estimated_size: 'Media',
    key_signals: ['Modulo iscrizione PDF'],
    evidences: [
      {
        id: 'EV-1',
        claim: 'Modulo di iscrizione gestito in formato PDF scaricabile',
        status: 'FACT',
        source_url: 'https://scuoladanzatest.it/iscrizioni',
        source_page: 'Iscrizioni',
        evidence_text: 'Scarica qui il modulo iscrizioni in PDF',
        confidence: 0.98
      },
      {
        id: 'EV-2',
        claim: 'Possibile sovraccarico segreteria a inizio anno',
        status: 'INFERENCE',
        source_url: 'https://scuoladanzatest.it',
        source_page: 'Homepage',
        evidence_text: 'Molti corsi attivi',
        confidence: 0.70
      }
    ],
    pain_points: ['Gestione moduli cartacei'],
    competitor_current_software: 'Nessuno',
    score_breakdown: { fit: 90, pain: 80, intent: 80, value: 80 },
    opportunity_score: 85,
    classification: 'A',
    reason: 'Valido',
    opening_angle: 'Modulo PDF rilevato',
    recommended_action: 'Email',
    suggested_outreach: { channel: 'whatsapp', subject: '', opening: '', body: '', cta: '' },
    scouted_at: new Date().toISOString()
  };

  // TEST 1: Inference masquerading as fact ("immagino che perdiate 10 ore...") -> MUST BLOCK
  const msg1 = "Ciao, immagino che perdiate molte ore tra scartoffie ogni giorno. Ti mostro DanceFlow?";
  const res1 = verifyAndScoreOutreach(baseProspect, msg1, 'whatsapp', 'FIRST_CONTACT');
  const pass1 = res1.status === 'BLOCKED' && res1.hard_block_reasons.some(r => r.includes('Assunzione di dolore'));
  results.push({ test: 'TEST 1: Inference masquerading as fact', passed: pass1, details: res1.hard_block_reasons.join(', ') || `Status: ${res1.status}` });

  // TEST 2: Unsupported numerical claim ("risparmi 10 ore a settimana") -> MUST BLOCK
  const msg2 = "Ciao! Con il nostro software risparmi 10 ore a settimana garantite. Vuoi una demo?";
  const res2 = verifyAndScoreOutreach(baseProspect, msg2, 'whatsapp', 'FIRST_CONTACT');
  const pass2 = res2.status === 'BLOCKED' && res2.hard_block_reasons.some(r => r.includes('Promessa numerica quantitativa'));
  results.push({ test: 'TEST 2: Unsupported numerical claim', passed: pass2, details: res2.hard_block_reasons.join(', ') || `Status: ${res2.status}` });

  // TEST 3: Unsupported product feature / absolute claim ("elimina completamente...") -> MUST BLOCK
  const msg3 = "Ciao, DanceFlow elimina completamente ogni tuo problema gestionale recupererete l'investimento. Ti va?";
  const res3 = verifyAndScoreOutreach(baseProspect, msg3, 'whatsapp', 'FIRST_CONTACT');
  const pass3 = res3.status === 'BLOCKED' && res3.hard_block_reasons.some(r => r.includes('Promessa commerciale assoluta'));
  results.push({ test: 'TEST 3: Unsupported absolute / ROI claim', passed: pass3, details: res3.hard_block_reasons.join(', ') || `Status: ${res3.status}` });

  // TEST 4: Verified FACT ("ho visto sul vostro sito che utilizzate un modulo scaricabile...") -> MUST PASS
  const msg4 = "Ciao, ho visto sul vostro sito (https://scuoladanzatest.it) che per le iscrizioni utilizzate un modulo scaricabile.\n\nStiamo sviluppando DanceFlow per gestire le quote e le iscrizioni online da smartphone.\n\nTi posso mostrare in 5 minuti come funziona?";
  const res4 = verifyAndScoreOutreach(baseProspect, msg4, 'whatsapp', 'FIRST_CONTACT');
  const pass4 = res4.status === 'READY_FOR_APPROVAL' && res4.score >= 80;
  results.push({ test: 'TEST 4: Verified FACT grounded message', passed: pass4, details: `Score: ${res4.score}/100, Status: ${res4.status}` });

  // TEST 5: FACT + low-friction CTA -> MUST PASS
  const { quality: res5 } = generateFirstContactOutreach(baseProspect, 'whatsapp');
  const pass5 = res5.status === 'READY_FOR_APPROVAL' && res5.score >= 80;
  results.push({ test: 'TEST 5: Generated First Contact with low-friction CTA', passed: pass5, details: `Score: ${res5.score}/100, CTA: "${res5.breakdown.cta_quality}/100"` });

  // TEST 6: First contact with price without request ("€49/mese") -> MUST BLOCK
  const msg6 = "Ciao, ho visto il modulo sul sito. Il costo è di 49€ al mese. Ti interessa?";
  const res6 = verifyAndScoreOutreach(baseProspect, msg6, 'whatsapp', 'FIRST_CONTACT');
  const pass6 = res6.status === 'BLOCKED' && res6.hard_block_reasons.some(r => r.includes('Prezzo esplicito'));
  results.push({ test: 'TEST 6: First contact with unprompted price', passed: pass6, details: res6.hard_block_reasons.join(', ') || `Status: ${res6.status}` });

  // TEST 7: First contact with ROI claim ("garantito al 100%") -> MUST BLOCK
  const msg7 = "Ciao, ho visto il modulo PDF. Il ROI è garantito al 100%. Quando facciamo una call?";
  const res7 = verifyAndScoreOutreach(baseProspect, msg7, 'whatsapp', 'FIRST_CONTACT');
  const pass7 = res7.status === 'BLOCKED' && res7.hard_block_reasons.some(r => r.includes('ROI'));
  results.push({ test: 'TEST 7: First contact with ROI claim', passed: pass7, details: res7.hard_block_reasons.join(', ') || `Status: ${res7.status}` });

  // TEST 8: Evidence missing source URL -> MUST BLOCK
  const brokenProspect = {
    ...baseProspect,
    evidences: [{ id: 'EV-BAD', claim: 'Modulo di iscrizione gestito in formato PDF scaricabile', status: 'FACT' as const, source_url: '', source_page: '', evidence_text: '', confidence: 0.9 }]
  };
  const res8 = verifyAndScoreOutreach(brokenProspect, msg4, 'whatsapp', 'FIRST_CONTACT');
  const pass8 = res8.status === 'BLOCKED' && res8.hard_block_reasons.some(r => r.includes('priva di source_url'));
  results.push({ test: 'TEST 8: Evidence missing source URL', passed: pass8, details: res8.hard_block_reasons.join(', ') || `Status: ${res8.status}` });

  // TEST 9: Product feature verified in Product Registry -> PASS
  const pass9 = res4.product_claims_used.length > 0 && res4.breakdown.product_accuracy >= 90;
  results.push({ test: 'TEST 9: Product feature verified against registry', passed: pass9, details: `Verified claims used: ${res4.product_claims_used.join(', ')}` });

  // TEST 10: Human approval governance (Status is never AUTO_SEND) -> MUST PASS
  const pass10 = res4.status === 'READY_FOR_APPROVAL' && (res4.status as string) !== 'AUTO_SEND';
  results.push({ test: 'TEST 10: Human Approval Required Enforcement', passed: pass10, details: `Final Status: ${res4.status} (Human in the loop guaranteed)` });

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.test} — ${r.details}`);
  });

  console.log(`\n📊 Risultati Unit Tests: ${passed}/${results.length} superati.\n`);

  return { total: results.length, passed, failed, results };
}

if (require.main === module) {
  runEvidenceGuardUnitTests();
}
