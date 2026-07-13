import express from 'express';
import basicAuth from 'basic-auth';
import nodemailer from 'nodemailer';
import { initDb, getAllLeads, updateLeadStatus, updateLeadEmail, updateLeadNotes, closeDb } from './storage/db';
import * as path from 'path';

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'vedetta2026';

// Middleware per Basic Auth
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const credentials = basicAuth(req);

  if (!credentials || credentials.name !== 'admin' || credentials.pass !== DASHBOARD_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Vedetta CRM"');
    return res.status(401).send('Accesso non autorizzato. Inserisci le credenziali.');
  }

  next();
};

app.use(express.json());

// 1. API: Ottieni tutti i lead
app.get('/api/leads', authMiddleware, (req, res) => {
  try {
    initDb();
    const leads = getAllLeads();
    closeDb();
    res.json(leads);
  } catch (err: any) {
    console.error('[SERVER] ❌ Errore recupero leads:', err.message);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// 2. API: Aggiorna un lead (stato, email o note)
app.put('/api/leads/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { pipeline_status, client_email, notes } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID non valido' });
  }

  try {
    initDb();
    if (pipeline_status !== undefined) {
      updateLeadStatus(id, pipeline_status);
    }
    if (client_email !== undefined) {
      updateLeadEmail(id, client_email);
    }
    if (notes !== undefined) {
      updateLeadNotes(id, notes);
    }
    closeDb();
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[SERVER] ❌ Errore aggiornamento lead ${id}:`, err.message);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// 3. API: Invia email tramite Gmail SMTP
app.post('/api/email/send', authMiddleware, async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Campi destinazione, oggetto e corpo richiesti' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    return res.status(500).json({ error: 'Credenziali GMAIL_USER o GMAIL_APP_PASSWORD non configurate nel .env' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    await transporter.sendMail({
      from: `"Vedetta AI CRM" <${gmailUser}>`,
      to,
      subject,
      text: body,
    });

    console.log(`[EMAIL] ✉️  Email inviata con successo a: ${to}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[EMAIL] ❌ Errore invio email:', err.message);
    res.status(500).json({ error: `Impossibile inviare l'email: ${err.message}` });
  }
});

// 4. File Statici: Serviamo la Dashboard Web (HTML/JS)
app.use(express.static(path.join(__dirname, '..', 'src', 'public')));

// Fallback per servire l'index.html
app.get('/*splat', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`══════════════════════════════════════════════════`);
  console.log(`💻 VEDETTA CRM ONLINE`);
  console.log(`🔌 Porta: ${PORT}`);
  console.log(`🔒 Login: username 'admin'`);
  console.log(`🚪 Dashboard url: http://localhost:${PORT}`);
  console.log(`══════════════════════════════════════════════════`);
});
