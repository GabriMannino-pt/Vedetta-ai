import { initDb, getProspectsByMode, getOutreachMessagesByProspect, insertOrUpdateOutreachMessage, updateOutreachStatus } from './storage/db';
import { generateFirstContactOutreach } from './outreach/evidenceGuard';
import { sendApprovedEmail, getEmailConfig } from './outreach/emailService';
import { ProspectLead, OutreachMessage } from './types';

export const TARGET_5_SCHOOLS_DOMAINS = [
  'accademiascuoladidanza.it',
  'ilmosaicodanza.it',
  'scuolahamlyn.com',
  'arthurmurraybrescia.it',
  'danzae.org'
];

export async function run5DanceFlowEmailsTest(approveAndSend: boolean = false) {
  initDb();
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🩰 VEDETTA 1.0 — TEST 5 EMAIL DANCEFLOW (GROWTH STUDIO)');
  console.log('📧 Mittente:', 'Growth Studio — Sales <growthstudio.ai.sales@gmail.com>');
  console.log('═════════════════════════════════════════════════════════════════\n');

  const allProspects = getProspectsByMode('danceflow');
  const selectedProspects = allProspects.filter(p => 
    TARGET_5_SCHOOLS_DOMAINS.some(d => p.website.toLowerCase().includes(d)) && p.email
  );

  console.log(`[TEST-BATCH] Selezionate ${selectedProspects.length} scuole di danza con email verificata:\n`);

  const preparedDrafts: { prospect: ProspectLead; message: OutreachMessage }[] = [];

  for (let i = 0; i < selectedProspects.length; i++) {
    const p = selectedProspects[i];
    const { draft, quality } = generateFirstContactOutreach(p, 'email');

    // Inserisci o recupera dal database
    const msgId = insertOrUpdateOutreachMessage({
      prospect_id: p.id || 0,
      channel: 'email',
      stage: 'FIRST_CONTACT',
      subject: draft.subject,
      content: draft.content,
      quality_score: quality.score,
      status: 'READY_FOR_APPROVAL',
      evidence_ids: quality.claims.filter(c => c.evidence_id).map(c => c.evidence_id),
      claims: quality.claims,
      quality_details: quality,
      created_at: new Date().toISOString()
    });

    draft.id = msgId;
    preparedDrafts.push({ prospect: p, message: draft });

    console.log(`[${i + 1}/5] ${p.name} (${p.city})`);
    console.log(`   Destinatario: ${p.email}`);
    console.log(`   Sito: ${p.website}`);
    console.log(`   Evidenza [FACT]: ${quality.facts_used.join(' | ') || 'Presente modulo/corsi'}`);
    console.log(`   Quality Score: ${quality.score}/100 | Status: ${quality.status}`);
    console.log(`   Oggetto: "${draft.subject}"`);
    console.log(`   Anteprima Testo:`);
    console.log(`   --------------------------------------------------------`);
    console.log(`   ${draft.content.split('\n').join('\n   ')}`);
    console.log(`   --------------------------------------------------------\n`);
  }

  const emailConfig = getEmailConfig();
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('🔐 VERIFICA CREDENZIALI GMAIL:');
  if (!emailConfig) {
    console.log('   ⚠️  GMAIL_APP_PASSWORD non configurata nel file .env.');
    console.log('   ℹ️  Per collegare l\'account:');
    console.log('      1. Accedi a https://myaccount.google.com/apppasswords con growthstudio.ai.sales@gmail.com');
    console.log('      2. Genera una "Password per le app" (16 caratteri)');
    console.log('      3. Inserisci nel file .env:');
    console.log('         GMAIL_USER=growthstudio.ai.sales@gmail.com');
    console.log('         GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx');
  } else {
    console.log(`   ✅ Credenziali presenti per ${emailConfig.user}`);
  }
  console.log('─────────────────────────────────────────────────────────────────\n');

  if (!approveAndSend) {
    console.log('🔒 STATO ATTUALE: READY_FOR_APPROVAL (Nessun invio eseguito)');
    console.log('👉 Per approvare e inviare il batch di test, fornisci la conferma con la password applicativa.\n');
    return;
  }

  // Se è stato richiesto l'invio approvato
  console.log('🚀 AVVIO INVIO BATCH APPROVATO DALL\'UTENTE...');
  for (const item of preparedDrafts) {
    // Aggiorna stato ad APPROVED
    updateOutreachStatus(item.message.id!, 'APPROVED', new Date().toISOString());
    item.message.status = 'APPROVED';
    item.message.approved_at = new Date().toISOString();

    const sendRes = await sendApprovedEmail(item.message, item.prospect);
    if (sendRes.success) {
      console.log(`   ✅ [SENT] ${item.prospect.name} -> ${item.prospect.email}`);
    } else {
      console.log(`   ❌ [FAILED] ${item.prospect.name} -> ${sendRes.error}`);
    }
  }
}

if (require.main === module) {
  const isApprove = process.argv.includes('--approve-and-send');
  run5DanceFlowEmailsTest(isApprove).catch(console.error);
}
