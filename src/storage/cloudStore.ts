import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';
import { initDb, getProspectsByMode, getOutreachMessagesByStatus, updateOutreachStatus, closeDb } from './db';
import { sendApprovedEmail, getEmailConfig } from '../outreach/emailService';
import { ProspectLead, OutreachMessage } from '../types';

let isFirestoreReady = false;

function initCloudFirestore(): any | null {
  try {
    if (getApps().length) {
      return getFirestore();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || 'growth-studio-sales';

    // 1. Controlla variabile d'ambiente con JSON o Base64 della chiave di servizio
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if (raw.startsWith('{')) {
          const creds = JSON.parse(raw);
          initializeApp({ credential: cert(creds), projectId: creds.project_id || projectId });
          isFirestoreReady = true;
          return getFirestore();
        } else {
          const decoded = Buffer.from(raw, 'base64').toString('utf-8');
          const creds = JSON.parse(decoded);
          initializeApp({ credential: cert(creds), projectId: creds.project_id || projectId });
          isFirestoreReady = true;
          return getFirestore();
        }
      } catch (e: any) {
        console.warn('[CLOUD-STORE] Errore parsing FIREBASE_SERVICE_ACCOUNT:', e.message);
      }
    }

    // 2. Controlla file locale
    const rootDir = path.resolve(__dirname, '..', '..');
    const files = fs.existsSync(rootDir) ? fs.readdirSync(rootDir) : [];
    const keyFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json')) || 'serviceAccountKey.json';
    const keyPath = path.join(rootDir, keyFile);

    if (fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
      initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || projectId });
      isFirestoreReady = true;
      return getFirestore();
    }

    // 3. Fallback standard
    initializeApp({ projectId });
    isFirestoreReady = true;
    return getFirestore();
  } catch (err: any) {
    console.warn('[CLOUD-STORE] Firestore non inizializzato, fallback a SQLite:', err.message);
    return null;
  }
}

/** Recupera i messaggi in stato READY_FOR_APPROVAL con fallback automatico */
export async function getPendingOutreachList(): Promise<any[]> {
  const db = initCloudFirestore();

  if (db) {
    try {
      const messagesSnap = await db.collection('outreach_messages').where('status', '==', 'READY_FOR_APPROVAL').get();
      const prospectsSnap = await db.collection('prospects').get();

      const pMap = new Map<number, any>();
      prospectsSnap.docs.forEach((doc: any) => {
        const data = doc.data();
        pMap.set(data.id, data);
      });

      const seen = new Set();
      const pendingList: any[] = [];

      messagesSnap.docs.forEach((doc: any) => {
        const m = doc.data();
        if (!seen.has(m.prospect_id)) {
          seen.add(m.prospect_id);
          const p = pMap.get(m.prospect_id);
          if (p) {
            pendingList.push({
              id: m.id || doc.id,
              prospect_id: p.id,
              mode: p.mode,
              company_name: p.name,
              city: p.city,
              website: p.website,
              email: p.email,
              phone: p.phone,
              channel: m.channel,
              subject: m.subject,
              content: m.content,
              quality_score: m.quality_score,
              status: m.status,
              facts_used: m.quality_details?.facts_used || [],
              evidences: p.evidences || [],
              claims: m.claims || [],
              created_at: m.created_at
            });
          }
        }
      });

      if (pendingList.length > 0) {
        return pendingList;
      }
    } catch (err: any) {
      console.warn('[CLOUD-STORE] Errore lettura Firestore, provo SQLite:', err.message);
    }
  }

  // Fallback SQLite
  initDb();
  const allProspects = getProspectsByMode();
  const pMap = new Map(allProspects.map(p => [p.id, p]));
  const messages = getOutreachMessagesByStatus('READY_FOR_APPROVAL');

  const seen = new Set();
  const pendingList: any[] = [];

  messages.forEach(m => {
    if (!seen.has(m.prospect_id)) {
      seen.add(m.prospect_id);
      const p = pMap.get(m.prospect_id);
      if (p) {
        pendingList.push({
          id: m.id,
          prospect_id: p.id,
          mode: p.mode,
          company_name: p.name,
          city: p.city,
          website: p.website,
          email: p.email,
          phone: p.phone,
          channel: m.channel,
          subject: m.subject,
          content: m.content,
          quality_score: m.quality_score,
          status: m.status,
          facts_used: m.quality_details?.facts_used || [],
          evidences: p.evidences || [],
          claims: m.claims || [],
          created_at: m.created_at
        });
      }
    }
  });

  closeDb();
  return pendingList;
}

/** Recupera i messaggi in stato SENT con fallback automatico */
export async function getSentOutreachList(): Promise<any[]> {
  const db = initCloudFirestore();

  if (db) {
    try {
      const messagesSnap = await db.collection('outreach_messages').where('status', '==', 'SENT').get();
      const prospectsSnap = await db.collection('prospects').get();

      const pMap = new Map<number, any>();
      prospectsSnap.docs.forEach((doc: any) => {
        const data = doc.data();
        pMap.set(data.id, data);
      });

      const sentList: any[] = [];
      messagesSnap.docs.forEach((doc: any) => {
        const m = doc.data();
        const p = pMap.get(m.prospect_id);
        sentList.push({
          id: m.id || doc.id,
          company_name: p?.name || 'Azienda',
          company: p?.name || 'Azienda',
          recipient: p?.email || '',
          email: p?.email || '',
          subject: m.subject || '',
          content: m.content || '',
          body: m.content || '',
          sent_at: m.sent_at || m.created_at,
          sentAt: m.sent_at || m.created_at,
          channel: m.channel || 'email',
          mode: p?.mode || 'vedetta',
          product: p?.mode || 'vedetta',
          opened: Boolean(m.opened),
          replied: Boolean(m.replied)
        });
      });

      return sentList;
    } catch (err: any) {
      console.warn('[CLOUD-STORE] Errore lettura messaggi inviati Firestore:', err.message);
    }
  }

  // Fallback SQLite
  initDb();
  const sentMessages = getOutreachMessagesByStatus('SENT');
  const allProspects = getProspectsByMode();
  const pMap = new Map(allProspects.map(p => [p.id, p]));

  const result = sentMessages.map(m => {
    const p = pMap.get(m.prospect_id);
    return {
      id: m.id,
      company_name: p?.name || 'Azienda',
      company: p?.name || 'Azienda',
      recipient: p?.email || '',
      email: p?.email || '',
      subject: m.subject,
      content: m.content,
      body: m.content,
      sent_at: m.sent_at || m.created_at,
      sentAt: m.sent_at || m.created_at,
      channel: m.channel,
      mode: p?.mode,
      product: p?.mode
    };
  });

  closeDb();
  return result;
}

/** Esegue l'approvazione e l'invio su cloud/locale */
export async function executeOutreachApproval(
  msgId: string | number,
  editedContent?: string,
  editedSubject?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const db = initCloudFirestore();

  if (db) {
    try {
      let docRef = db.collection('outreach_messages').doc(String(msgId));
      let msgDoc = await docRef.get();

      if (!msgDoc.exists) {
        // Cerca per id numerico o per prospect_id associato
        const snap = await db.collection('outreach_messages').where('status', '==', 'READY_FOR_APPROVAL').get();
        const match = snap.docs.find((d: any) => 
          String(d.id) === String(msgId) || 
          String(d.data().id) === String(msgId) || 
          String(d.data().prospect_id) === String(msgId)
        );
        if (match) {
          docRef = match.ref;
          msgDoc = match;
        }
      }

      if (!msgDoc.exists) {
        return { success: false, error: `Messaggio #${msgId} non trovato su Firestore` };
      }

      const msgData = msgDoc.data() as OutreachMessage;
      let prospectDoc = await db.collection('prospects').doc(String(msgData.prospect_id)).get();
      if (!prospectDoc.exists) {
        // Cerca prospect per nome o ID
        const pSnap = await db.collection('prospects').get();
        const pMatch = pSnap.docs.find((d: any) => String(d.id) === String(msgData.prospect_id) || String(d.data().id) === String(msgData.prospect_id));
        if (pMatch) prospectDoc = pMatch;
      }

      if (!prospectDoc.exists) {
        return { success: false, error: `Prospect associato non trovato su Firestore` };
      }

      const prospectData = prospectDoc.data() as ProspectLead;

      if (editedContent) msgData.content = editedContent;
      if (editedSubject) msgData.subject = editedSubject;

      // STEP 1: Aggiorna a APPROVED
      msgData.status = 'APPROVED';
      msgData.approved_at = new Date().toISOString();
      await docRef.update({
        status: 'APPROVED',
        approved_at: msgData.approved_at,
        content: msgData.content,
        subject: msgData.subject || '',
        updated_at: FieldValue.serverTimestamp()
      });

      // STEP 2: Invio via Gmail
      const sendRes = await sendApprovedEmail(msgData, prospectData);
      if (!sendRes.success) {
        // Rollback
        await docRef.update({
          status: 'READY_FOR_APPROVAL',
          updated_at: FieldValue.serverTimestamp()
        });
        return { success: false, error: sendRes.error };
      }

      // STEP 3: Aggiorna a SENT
      await docRef.update({
        status: 'SENT',
        sent_at: new Date().toISOString(),
        gmail_message_id: sendRes.messageId,
        updated_at: FieldValue.serverTimestamp()
      });

      return { success: true, messageId: sendRes.messageId };
    } catch (err: any) {
      console.warn('[CLOUD-STORE] Errore approvazione Firestore, provo SQLite:', err.message);
    }
  }

  // Fallback SQLite
  initDb();
  const messages = getOutreachMessagesByStatus();
  const targetMsg = messages.find(m => String(m.id) === String(msgId) || String(m.prospect_id) === String(msgId));
  if (!targetMsg) {
    closeDb();
    return { success: false, error: `Messaggio #${msgId} non trovato` };
  }

  const allProspects = getProspectsByMode();
  const prospect = allProspects.find(p => p.id === targetMsg.prospect_id);
  if (!prospect) {
    closeDb();
    return { success: false, error: `Prospect non trovato` };
  }

  if (editedContent) targetMsg.content = editedContent;
  if (editedSubject) targetMsg.subject = editedSubject;

  updateOutreachStatus(targetMsg.id, 'APPROVED', new Date().toISOString());
  targetMsg.status = 'APPROVED';

  const sendResult = await sendApprovedEmail(targetMsg, prospect);
  if (!sendResult.success) {
    updateOutreachStatus(targetMsg.id, 'READY_FOR_APPROVAL');
    closeDb();
    return { success: false, error: sendResult.error };
  }

  closeDb();
  return { success: true, messageId: sendResult.messageId };
}
