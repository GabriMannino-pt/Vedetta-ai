import express from 'express';
import basicAuth from 'basic-auth';
import nodemailer from 'nodemailer';
import { initDb, getAllLeads, getLeadsByType, updateLeadStatus, updateLeadEmail, updateLeadNotes, closeDb, getProspectsByMode, getOutreachMessagesByStatus, updateOutreachStatus, insertOrUpdateOutreachMessage } from './storage/db';
import { sendApprovedEmail, getEmailConfig } from './outreach/emailService';
import { runDanceFlowScout } from './scout_danceflow';
import * as path from 'path';

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'vedetta2026';

let isEmergencyKillSwitchActive = false;

// Middleware CORS per consentire connessioni dal frontend Lovable e web app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Root Health Check per Vercel
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Growth Studio — Sales Hub API',
    version: '1.0.0',
    sender: 'growthstudio.ai.sales@gmail.com',
    endpoints: {
      pending_approvals: '/api/outreach/pending',
      sent_messages: '/api/outreach/sent',
      stats: '/api/outreach/stats',
      deals: '/api/deals',
      portfolio: '/api/portfolio'
    }
  });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    service: 'Growth Studio — Sales Hub API',
    version: '1.0.0'
  });
});

// Middleware per Basic Auth (opzionale per chiamate API con header custom o bypass in dev)
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Se la richiesta proviene da browser interno con auth attiva
  const authHeader = req.headers.authorization;
  if (!authHeader && req.path.startsWith('/api/outreach')) {
    // Consenti accesso alle API di outreach per il frontend Lovable
    return next();
  }

  const credentials = basicAuth(req);
  if (!credentials || credentials.name !== 'admin' || credentials.pass !== DASHBOARD_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Vedetta CRM"');
    return res.status(401).send('Accesso non autorizzato. Inserisci le credenziali.');
  }

  next();
};

// ─────────────────────────────────────────────────────────────
// GROWTH STUDIO — SALES COMMAND CENTER OUTREACH APIS
// ─────────────────────────────────────────────────────────────

/** 1. GET /api/outreach/pending — Ottieni tutti i prospect pronti per l'approvazione */
app.get('/api/outreach/pending', async (req, res) => {
  try {
    const { getPendingOutreachList } = require('./storage/cloudStore');
    const pendingList = await getPendingOutreachList();

    res.json({
      count: pendingList.length,
      kill_switch_active: isEmergencyKillSwitchActive,
      sender: getEmailConfig()?.user || 'growthstudio.ai.sales@gmail.com',
      prospects: pendingList
    });
  } catch (err: any) {
    console.error('[API] ❌ Errore pending outreach:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 2. POST /api/outreach/approve/:id — Sequenza Rigorosa di Approvazione & Invio Gmail */
app.post('/api/outreach/approve/:id', async (req, res) => {
  const msgId = parseInt(req.params.id as string, 10);
  const editedContent = req.body.editedContent || req.body.body || req.body.content;
  const editedSubject = req.body.editedSubject || req.body.subject;

  if (isNaN(msgId)) {
    return res.status(400).json({ error: 'ID messaggio non valido' });
  }

  if (isEmergencyKillSwitchActive) {
    return res.status(403).json({ error: 'BLOCCO DI SICUREZZA: Kill Switch globale attivo. Nessun invio consentito.' });
  }

  try {
    const { executeOutreachApproval } = require('./storage/cloudStore');
    const result = await executeOutreachApproval(msgId, editedContent, editedSubject);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      success: true,
      message_id: msgId,
      gmail_message_id: result.messageId,
      sent_at: new Date().toISOString()
    });
  } catch (err: any) {
    console.error(`[API] ❌ Errore approvazione messaggio #${msgId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 3. POST /api/outreach/archive/:id — Scarta o archivia messaggio */
app.post('/api/outreach/archive/:id', (req, res) => {
  const msgId = parseInt(req.params.id as string, 10);
  if (isNaN(msgId)) return res.status(400).json({ error: 'ID non valido' });

  try {
    initDb();
    updateOutreachStatus(msgId, 'ARCHIVED');
    closeDb();
    res.json({ success: true, message: `Messaggio #${msgId} archiviato` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** 4. GET /api/outreach/sent — Lista messaggi inviati */
app.get('/api/outreach/sent', async (req, res) => {
  try {
    const { getSentOutreachList } = require('./storage/cloudStore');
    const result = await getSentOutreachList();
    res.json({ count: result.length, sent: result });
  } catch (err: any) {
    console.error('[API] ❌ Errore sent outreach:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 5. POST /api/outreach/kill-switch — Attiva o disattiva il Kill Switch Globale */
app.post('/api/outreach/kill-switch', (req, res) => {
  const { active } = req.body;
  isEmergencyKillSwitchActive = Boolean(active);
  console.log(`[KILL-SWITCH] 🚨 Stato Kill Switch impostato su: ${isEmergencyKillSwitchActive ? 'ATTIVO (BLOCCO INVIO)' : 'DISATTIVO (OPERATIVO)'}`);
  res.json({ kill_switch_active: isEmergencyKillSwitchActive });
});

/** 6. GET /api/outreach/stats — Statistiche generali per la dashboard */
app.get('/api/outreach/stats', (req, res) => {
  try {
    initDb();
    const pending = getOutreachMessagesByStatus('READY_FOR_APPROVAL').length;
    const sent = getOutreachMessagesByStatus('SENT').length;
    const needsReview = getOutreachMessagesByStatus('NEEDS_REVIEW').length;
    closeDb();
    res.json({
      pending_approvals: pending,
      sent_total: sent,
      needs_review: needsReview,
      estimated_pipeline: '€14.500',
      kill_switch_active: isEmergencyKillSwitchActive
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.2 API: Ottieni il Portfolio e Commercial Score dei progetti
app.get('/api/portfolio', authMiddleware, (req, res) => {
  try {
    initDb();
    const { getAllProjects } = require('./storage/db');
    const projects = getAllProjects();
    closeDb();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.3 API: Ottieni Deals e Pipeline Economica
app.get('/api/deals', authMiddleware, (req, res) => {
  try {
    initDb();
    const { getAllDeals } = require('./storage/db');
    const { calculatePipelineMetrics } = require('./crm/dealEngine');
    const deals = getAllDeals();
    const metrics = calculatePipelineMetrics(deals);
    closeDb();
    res.json({ deals, metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.4 API: Ottieni Daily Action Checklist ("Cosa fare domani mattina")
app.get('/api/daily-actions', authMiddleware, (req, res) => {
  try {
    initDb();
    const { getProspectsByMode } = require('./storage/db');
    const { generateDailyActionPlan } = require('./crm/dealEngine');
    const prospects = getProspectsByMode();
    const tasks = generateDailyActionPlan(prospects);
    closeDb();
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.2 API: Avvia campagna Scout DanceFlow in background
let isScoutRunning = false;
app.post('/api/scout/run', authMiddleware, async (req, res) => {
  if (isScoutRunning) {
    return res.status(409).json({ error: 'Campagna scout già in corso. Attendi il completamento.' });
  }

  const target = parseInt(req.body.target, 10) || 30;
  isScoutRunning = true;
  res.json({ message: `Scout DanceFlow avviato per ${target} prospect.`, status: 'running' });

  try {
    await runDanceFlowScout(target);
  } catch (err: any) {
    console.error('[SERVER] ❌ Errore durante lo scout:', err.message);
  } finally {
    isScoutRunning = false;
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

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`══════════════════════════════════════════════════`);
    console.log(`💻 VEDETTA CRM ONLINE`);
    console.log(`🔌 Porta: ${PORT}`);
    console.log(`🚪 Dashboard url: http://localhost:${PORT}`);
    console.log(`══════════════════════════════════════════════════`);
  });
}

export default app;
