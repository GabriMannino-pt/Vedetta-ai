import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getDb } from '../storage/db';
import { getEmailConfig } from './emailService';

export interface IngestedReply {
  id: number;
  uid: number;
  from_address: string;
  from_name: string;
  to_address: string;
  subject: string;
  body_text: string;
  received_at: string;
  intent_classification: 'INTERESTED' | 'OBJECTION_STATUS_QUO' | 'QUESTION' | 'NOT_INTERESTED' | 'OUT_OF_OFFICE' | 'OTHER';
  sentiment_score: number;
  prospect_id?: number;
  company_name?: string;
  product_key?: string;
  proposed_action: string;
  action_status: 'PENDING' | 'ACTED' | 'DISMISSED';
  created_at: string;
}

export interface IngestedBounce {
  id: number;
  uid: number;
  failed_recipient: string;
  bounce_type: 'HARD_BOUNCE' | 'INVALID_DOMAIN' | 'MAILBOX_NOT_FOUND' | 'PEC_REJECTED' | 'MALFORMED_EMAIL' | 'DELAY';
  raw_subject: string;
  raw_excerpt: string;
  detected_at: string;
  prospect_id?: number;
  company_name?: string;
}

export function initInboxTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbox_replies (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      uid                     INTEGER UNIQUE,
      from_address            TEXT NOT NULL,
      from_name               TEXT,
      to_address              TEXT,
      subject                 TEXT,
      body_text               TEXT,
      received_at             TEXT NOT NULL,
      intent_classification   TEXT NOT NULL,
      sentiment_score         REAL DEFAULT 0,
      prospect_id             INTEGER,
      company_name            TEXT,
      product_key             TEXT,
      proposed_action         TEXT,
      action_status           TEXT NOT NULL DEFAULT 'PENDING',
      created_at              TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_bounces (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      uid                     INTEGER UNIQUE,
      failed_recipient        TEXT NOT NULL,
      bounce_type             TEXT NOT NULL,
      raw_subject             TEXT,
      raw_excerpt             TEXT,
      detected_at             TEXT NOT NULL,
      prospect_id             INTEGER,
      company_name            TEXT,
      cleaned_from_outreach   INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_inbox_replies_from ON inbox_replies(from_address);
    CREATE INDEX IF NOT EXISTS idx_email_bounces_recip ON email_bounces(failed_recipient);
  `);
}

function extractFailedRecipient(text: string, subject: string): { email: string; type: IngestedBounce['bounce_type'] } {
  let match = text.match(/(?:delivered to|recapitato a|messaggio per)\s+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[^\s<>]+@[^\s<>]+)>?/i);
  if (match && match[1]) {
    const rawEmail = match[1].replace(/^[<"']|["'>]$/g, '').trim();
    let type: IngestedBounce['bounce_type'] = 'MAILBOX_NOT_FOUND';
    if (rawEmail.endsWith('.svg') || rawEmail.includes('itorar') || rawEmail.includes('itrisp') || rawEmail.includes('telefono')) {
      type = 'MALFORMED_EMAIL';
    } else if (rawEmail.includes('@pec.') || rawEmail.endsWith('.pec.it')) {
      type = 'PEC_REJECTED';
    } else if (text.includes('dominio') && text.includes('inesistente')) {
      type = 'INVALID_DOMAIN';
    }
    return { email: rawEmail, type };
  }

  match = text.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i);
  if (match && match[1]) {
    return { email: match[1].trim(), type: 'HARD_BOUNCE' };
  }

  match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (match && match[0] && !match[0].includes('googlemail') && !match[0].includes('growthstudio')) {
    return { email: match[0].trim(), type: 'HARD_BOUNCE' };
  }

  return { email: 'unknown_failed_recipient@unknown.com', type: 'HARD_BOUNCE' };
}

function classifyReplyIntent(text: string, subject: string): {
  intent: IngestedReply['intent_classification'];
  sentiment: number;
  proposedAction: string;
} {
  const lower = (text + ' ' + subject).toLowerCase();

  if (
    lower.includes('comodi con il sistema') ||
    lower.includes('abbiamo già') ||
    lower.includes('utilizziamo già') ||
    lower.includes('usiamo già') ||
    lower.includes('ci troviamo bene') ||
    lower.includes('non al momento') ||
    lower.includes('non ci serve al momento')
  ) {
    return {
      intent: 'OBJECTION_STATUS_QUO',
      sentiment: 0.2,
      proposedAction: 'Obiezione status quo (soddisfatti del metodo attuale). Azione: Archivia prospect ed evita ricontatti per non risultare insistenti o pesanti.'
    };
  }

  if (
    lower.includes('interessante') ||
    lower.includes('vorrei saperne di più') ||
    lower.includes('ci possiamo sentire') ||
    lower.includes('sentiamoci') ||
    lower.includes('fissiamo una call') ||
    lower.includes('fissare una demo') ||
    lower.includes('quando possiamo sentirci')
  ) {
    return {
      intent: 'INTERESTED',
      sentiment: 0.9,
      proposedAction: '🎯 Lead caldo interessato! Azione: Invia link Calendly per fissare demo live e crea Opportunità Deal in CRM.'
    };
  }

  if (
    lower.includes('costo') ||
    lower.includes('prezzo') ||
    lower.includes('prezzi') ||
    lower.includes('quanto costa') ||
    lower.includes('tariffe') ||
    lower.includes('informazioni') ||
    lower.includes('maggiori dettagli')
  ) {
    return {
      intent: 'QUESTION',
      sentiment: 0.6,
      proposedAction: 'Richiesta pricing/dettagli. Azione: Invia il listino sintetico e proponi una prova gratuita di 14 giorni.'
    };
  }

  if (
    lower.includes('fuori ufficio') ||
    lower.includes('out of office') ||
    lower.includes('automatic reply') ||
    lower.includes('risposta automatica') ||
    lower.includes('sarò assente')
  ) {
    return {
      intent: 'OUT_OF_OFFICE',
      sentiment: 0.0,
      proposedAction: 'Autoresponder fuori ufficio. Azione: Riprogramma il follow-up al rientro specificato.'
    };
  }

  if (
    lower.includes('non siamo interessati') ||
    lower.includes('non mi interessa') ||
    lower.includes('non ci interessa') ||
    lower.includes('cancellat') ||
    lower.includes('unsubscribe') ||
    lower.includes('rimuov')
  ) {
    return {
      intent: 'NOT_INTERESTED',
      sentiment: -0.5,
      proposedAction: 'Rifiuto esplicito. Azione: Archivia prospect e inserisci in blacklist Do-Not-Contact.'
    };
  }

  return {
    intent: 'OTHER',
    sentiment: 0.1,
    proposedAction: 'Risposta ricevuta. Azione: Valuta la lettura manuale del messaggio per definire la prossima azione.'
  };
}

export async function syncGmailInbox(maxMessages = 40): Promise<{
  syncedReplies: number;
  syncedBounces: number;
  totalInboxMessages: number;
}> {
  initInboxTables();
  const config = getEmailConfig();
  if (!config) {
    throw new Error('Credenziali Gmail non configurate nel file .env (GMAIL_USER / GMAIL_APP_PASSWORD)');
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: config.user,
      pass: config.pass
    },
    logger: false
  });

  await client.connect();

  let syncedReplies = 0;
  let syncedBounces = 0;
  let totalInboxMessages = 0;

  const lock = await client.getMailboxLock('INBOX');
  try {
    const status = await client.status('INBOX', { messages: true });
    totalInboxMessages = status.messages || 0;

    const startSeq = Math.max(1, totalInboxMessages - maxMessages + 1);
    const db = getDb();

    for await (const message of client.fetch(`${startSeq}:*`, {
      envelope: true,
      source: true,
      flags: true,
      internalDate: true,
      bodyStructure: true
    })) {
      const uid = message.uid;
      const parsed: any = message.source ? await simpleParser(message.source) : {};

      const fromText = parsed.from?.text || message.envelope?.from?.[0]?.address || 'Unknown';
      const fromAddress = (message.envelope?.from?.[0]?.address || parsed.from?.value?.[0]?.address || '').toLowerCase();
      const toText = parsed.to?.text || config.user;
      const subject = parsed.subject || message.envelope?.subject || '';
      const text = parsed.text ? parsed.text.trim() : '';
      const receivedAt = message.internalDate ? new Date(message.internalDate).toISOString() : new Date().toISOString();

      const isBounce =
        fromAddress.includes('mailer-daemon') ||
        fromAddress.includes('postmaster') ||
        fromText.toLowerCase().includes('mail delivery') ||
        subject.toLowerCase().includes('delivery status notification') ||
        subject.toLowerCase().includes('undelivered mail') ||
        subject.toLowerCase().includes('failure') ||
        text.toLowerCase().includes('address not found') ||
        text.toLowerCase().includes('indirizzo non trovato') ||
        text.toLowerCase().includes('non è stato recapitato');

      if (isBounce) {
        const { email: failedEmail, type: bounceType } = extractFailedRecipient(text, subject);

        const existing = db.prepare('SELECT id FROM email_bounces WHERE uid = ?').get(uid);
        if (!existing) {
          let prospectId: number | undefined;
          let companyName: string | undefined;

          const matchedProspect = db.prepare(`
            SELECT id, name, mode FROM prospects 
            WHERE LOWER(email) = ?
            LIMIT 1
          `).get(failedEmail.toLowerCase()) as any;

          if (matchedProspect) {
            prospectId = matchedProspect.id;
            companyName = matchedProspect.name;

            try {
              db.prepare(`UPDATE prospects SET pipeline_status = 'BOUNCED' WHERE id = ?`).run(prospectId);
            } catch {}
          }

          db.prepare(`
            INSERT INTO email_bounces (
              uid, failed_recipient, bounce_type, raw_subject, raw_excerpt, detected_at, prospect_id, company_name, cleaned_from_outreach
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            uid,
            failedEmail,
            bounceType,
            subject,
            text.slice(0, 300),
            receivedAt,
            prospectId || null,
            companyName || null
          );

          syncedBounces++;
        }
      } else {
        if (
          fromAddress === config.user.toLowerCase() ||
          fromAddress.includes('google.com') ||
          fromAddress.includes('accounts.google.com') ||
          fromAddress.includes('googlecommunityteam') ||
          fromAddress.includes('no-reply') ||
          fromAddress.includes('noreply') ||
          fromText.toLowerCase().includes('google')
        ) {
          continue;
        }

        const existing = db.prepare('SELECT id FROM inbox_replies WHERE uid = ?').get(uid);
        if (!existing) {
          let prospectId: number | undefined;
          let companyName: string | undefined;
          let productKey: string = 'danceflow';

          const matchedProspect = db.prepare(`
            SELECT id, name, mode FROM prospects 
            WHERE LOWER(email) = ?
            LIMIT 1
          `).get(fromAddress) as any;

          if (matchedProspect) {
            prospectId = matchedProspect.id;
            companyName = matchedProspect.name;
            productKey = matchedProspect.mode || 'danceflow';

            try {
              db.prepare(`UPDATE prospects SET pipeline_status = 'REPLIED' WHERE id = ?`).run(prospectId);
            } catch {}
          } else {
            companyName = fromText.split('<')[0].replace(/"/g, '').trim() || fromAddress;
          }

          const { intent, sentiment, proposedAction } = classifyReplyIntent(text, subject);

          db.prepare(`
            INSERT INTO inbox_replies (
              uid, from_address, from_name, to_address, subject, body_text,
              received_at, intent_classification, sentiment_score, prospect_id,
              company_name, product_key, proposed_action, action_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
          `).run(
            uid,
            fromAddress,
            fromText,
            toText,
            subject,
            text,
            receivedAt,
            intent,
            sentiment,
            prospectId || null,
            companyName,
            productKey,
            proposedAction,
            new Date().toISOString()
          );

          try {
            const eventType = intent === 'INTERESTED' ? 'POSITIVE_REPLY' : 'REPLIED';
            db.prepare(`
              INSERT INTO experiment_events (
                event_type, prospect_id, product_key, timestamp, metadata_json
              ) VALUES (?, ?, ?, ?, ?)
            `).run(
              eventType,
              prospectId || 0,
              productKey,
              receivedAt,
              JSON.stringify({ from: fromAddress, subject, intent })
            );
          } catch {}

          syncedReplies++;
        }
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();

  return {
    syncedReplies,
    syncedBounces,
    totalInboxMessages
  };
}

export function getInboxReplies(limit = 100): IngestedReply[] {
  initInboxTables();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM inbox_replies 
    ORDER BY received_at DESC 
    LIMIT ? 
  `).all(limit) as IngestedReply[];
}

export function getEmailBounces(limit = 100): IngestedBounce[] {
  initInboxTables();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM email_bounces 
    ORDER BY detected_at DESC 
    LIMIT ? 
  `).all(limit) as IngestedBounce[];
}

export function updateReplyActionStatus(replyId: number, status: 'ACTED' | 'DISMISSED'): void {
  const db = getDb();
  db.prepare(`UPDATE inbox_replies SET action_status = ? WHERE id = ?`).run(status, replyId);
}