import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initDb, getProspectsByMode, getOutreachMessagesByStatus, closeDb } from './db';
import * as path from 'path';
import * as fs from 'fs';

export async function migrateSQLiteToFirestore(projectId: string = 'growth-studio-sales') {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🔥 VEDETTA 1.0 — MIGRAZIONE DA SQLITE A FIRESTORE CLOUD');
  console.log(`🎯 Progetto Firebase: ${projectId}`);
  console.log('═════════════════════════════════════════════════════════════════\n');

  const rootDir = path.resolve(__dirname, '..', '..');
  const files = fs.readdirSync(rootDir);
  const keyFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json')) || 'serviceAccountKey.json';
  const keyPath = path.join(rootDir, keyFile);

  if (fs.existsSync(keyPath)) {
    console.log(`[AUTH] 🔑 Utilizzo chiave di servizio: ${keyFile}`);
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    }
  } else if (!getApps().length) {
    initializeApp({
      projectId,
    });
  }

  const db = getFirestore();

  // 1. Leggi tutti i prospect da SQLite
  initDb();
  const allProspects = getProspectsByMode();
  const allMessages = getOutreachMessagesByStatus();
  closeDb();

  console.log(`[SQLITE] Estratti ${allProspects.length} prospect e ${allMessages.length} messaggi.\n`);

  // 2. Scrittura batch su Firestore (collection: 'prospects')
  console.log(`[FIRESTORE] 📤 Caricamento prospect in corso...`);
  const prospectsBatch = db.batch();
  allProspects.forEach(p => {
    const docRef = db.collection('prospects').doc(String(p.id));
    prospectsBatch.set(docRef, {
      ...p,
      updated_at: FieldValue.serverTimestamp(),
      migrated_at: new Date().toISOString()
    });
  });
  await prospectsBatch.commit();
  console.log(`   ✅ ${allProspects.length} prospect caricati con successo nella collezione "prospects"!`);

  // 3. Scrittura batch su Firestore (collection: 'outreach_messages')
  console.log(`\n[FIRESTORE] 📤 Caricamento outreach messages in corso...`);
  const messagesBatch = db.batch();
  allMessages.forEach(m => {
    const docRef = db.collection('outreach_messages').doc(String(m.id));
    messagesBatch.set(docRef, {
      ...m,
      updated_at: FieldValue.serverTimestamp(),
      migrated_at: new Date().toISOString()
    });
  });
  await messagesBatch.commit();
  console.log(`   ✅ ${allMessages.length} messaggi caricati con successo nella collezione "outreach_messages"!`);

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('🏁 MIGRAZIONE CLOUD COMPLETATA AL 100%!');
  console.log('═════════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  const proj = process.argv[2] || 'growth-studio-sales';
  migrateSQLiteToFirestore(proj).catch(err => {
    console.error('❌ Errore migrazione Firestore:', err.message);
    process.exit(1);
  });
}
