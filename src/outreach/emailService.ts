import * as nodemailer from 'nodemailer';
import { optionalEnv } from '../config';
import { OutreachMessage, ProspectLead } from '../types';
import { updateOutreachStatus } from '../storage/db';

export interface EmailSenderConfig {
  user: string;
  pass: string;
  fromName: string;
}

/** Recupera le credenziali Gmail di Growth Studio dalle variabili d'ambiente */
export function getEmailConfig(): EmailSenderConfig | null {
  const user = optionalEnv('GMAIL_USER') || 'growthstudio.ai.sales@gmail.com';
  const pass = optionalEnv('GMAIL_APP_PASSWORD');
  const fromName = optionalEnv('GMAIL_FROM_NAME') || 'Growth Studio — Sales';

  if (!pass) {
    return null;
  }

  return { user, pass, fromName };
}

/** Crea il transporter Nodemailer configurato per Gmail */
export function createGmailTransporter(config: EmailSenderConfig) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

/**
 * Esegue l'invio di una singola email solo ed esclusivamente se lo stato è APPROVED
 */
export async function sendApprovedEmail(
  message: OutreachMessage,
  prospect: ProspectLead
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (message.status !== 'APPROVED') {
    return {
      success: false,
      error: `BLOCCO DI SICUREZZA: Impossibile inviare il messaggio #${message.id}. Lo stato attuale è "${message.status}" (è richiesta l'approvazione umana preventiva "APPROVED").`
    };
  }

  const recipientEmail = prospect.email;
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return {
      success: false,
      error: `Indirizzo email del destinatario non valido o assente per ${prospect.name}.`
    };
  }

  const config = getEmailConfig();
  if (!config) {
    return {
      success: false,
      error: `Credenziali Gmail mancanti. Configura GMAIL_APP_PASSWORD nel file .env per growthstudio.ai.sales@gmail.com.`
    };
  }

  try {
    const transporter = createGmailTransporter(config);

    const mailOptions = {
      from: `"${config.fromName}" <${config.user}>`,
      to: recipientEmail,
      subject: message.subject || `Iscrizioni e corsi per ${prospect.name}`,
      text: message.content,
      headers: {
        'X-Vedetta-Prospect-ID': String(prospect.id || ''),
        'X-Vedetta-Stage': message.stage || 'FIRST_CONTACT',
      }
    };

    const info = await transporter.sendMail(mailOptions);
    const sentAt = new Date().toISOString();

    // Aggiorna stato nel database a SENT
    if (message.id) {
      updateOutreachStatus(message.id, 'SENT', message.approved_at || sentAt);
    }

    console.log(`[EMAIL] ✉️  Inviata con successo a ${recipientEmail} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (err: any) {
    console.error(`[EMAIL] ❌ Errore durante l'invio a ${recipientEmail}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}
