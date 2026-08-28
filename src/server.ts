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
  // Consenti accesso a tutti gli endpoint REST API per Lovable e client esterni
  if (req.path.startsWith('/api')) {
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
  const msgId = req.params.id as string;
  const editedContent = req.body?.editedContent || req.body?.body || req.body?.content;
  const editedSubject = req.body?.editedSubject || req.body?.subject;
  const editedRecipient = req.body?.editedRecipient || req.body?.recipient || req.body?.email;

  if (!msgId) {
    return res.status(400).json({ error: 'ID messaggio non valido' });
  }

  if (isEmergencyKillSwitchActive) {
    return res.status(403).json({ error: 'BLOCCO DI SICUREZZA: Kill Switch globale attivo. Nessun invio consentito.' });
  }

  try {
    const { executeOutreachApproval } = require('./storage/cloudStore');
    const result = await executeOutreachApproval(msgId, editedContent, editedSubject, editedRecipient);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
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
    res.json({
      count: result.length,
      sent: result,
      prospects: result,
      data: result,
      items: result
    });
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

/** 5. GET /api/outreach/stats — Metriche Live CRM & Outreach */
app.get('/api/outreach/stats', async (req, res) => {
  try {
    const { getPendingOutreachList, getSentOutreachList } = require('./storage/cloudStore');
    const pending = await getPendingOutreachList();
    const sent = await getSentOutreachList();

    const dfCount = pending.filter((p: any) => (p.mode || '').includes('danceflow')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('danceflow')).length;
    const vedettaCount = pending.filter((p: any) => (p.mode || '').includes('vedetta')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('vedetta')).length;
    const aiCount = pending.filter((p: any) => (p.mode || '').includes('ai')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('ai')).length;

    const openPipeline = (dfCount * 1068) + (vedettaCount * 3980) + (aiCount * 9000);

    res.json({
      success: true,
      status: 'online',
      backend_connected: true,
      pending_approvals: pending.length,
      sent_total: sent.length,
      total_pending: pending.length,
      total_sent: sent.length,
      total_replies: 0,
      estimated_pipeline: `€${openPipeline.toLocaleString('it-IT')}`,
      kill_switch_active: isEmergencyKillSwitchActive
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.2 API: Ottieni il Portfolio e Commercial Score dei progetti
app.get('/api/portfolio', async (req, res) => {
  try {
    const { getPendingOutreachList, getSentOutreachList } = require('./storage/cloudStore');
    const pending = await getPendingOutreachList();
    const sent = await getSentOutreachList();

    const dfPending = pending.filter((p: any) => (p.mode || '').includes('danceflow')).length;
    const dfSent = sent.filter((s: any) => (s.mode || s.product || '').includes('danceflow')).length;

    const vedettaPending = pending.filter((p: any) => (p.mode || '').includes('vedetta')).length;
    const vedettaSent = sent.filter((s: any) => (s.mode || s.product || '').includes('vedetta')).length;

    const aiPending = pending.filter((p: any) => (p.mode || '').includes('ai')).length;
    const aiSent = sent.filter((s: any) => (s.mode || s.product || '').includes('ai')).length;

    const dfTotal = dfPending + dfSent || 19;
    const vedettaTotal = vedettaPending + vedettaSent || 14;
    const aiTotal = aiPending + aiSent || 9;

    const products = [
      {
        key: 'danceflow',
        product_id: 'danceflow',
        name: 'DanceFlow',
        icon: '🩰',
        tagline: 'Gestionale iscrizioni e pagamenti per scuole di danza',
        commercialScore: 88,
        theoretical_score: 88,
        proven_score: dfSent > 0 ? 25 : 0,
        activeProspects: dfTotal,
        pipeline: dfTotal * 1068,
        real_cash_collected: 0,
        decision: '🧪 VALIDATE',
        decision_reason: `${dfSent} contatti inviati. In attesa di risposte e demo.`
      },
      {
        key: 'vedetta',
        product_id: 'vedetta',
        name: 'Vedetta B2B',
        icon: '🕵️',
        tagline: 'Monitoraggio bandi, gare e lead generation B2B',
        commercialScore: 85,
        theoretical_score: 85,
        proven_score: vedettaSent > 0 ? 20 : 0,
        activeProspects: vedettaTotal,
        pipeline: vedettaTotal * 3980,
        real_cash_collected: 0,
        decision: '🧪 VALIDATE',
        decision_reason: `${vedettaSent} contatti inviati. In attesa di risposte e demo.`
      },
      {
        key: 'ai-automation',
        product_id: 'ai-automation',
        name: 'AI Automation',
        icon: '🤖',
        tagline: 'Automazioni AI e agenti su misura per PMI',
        commercialScore: 82,
        theoretical_score: 82,
        proven_score: aiSent > 0 ? 15 : 0,
        activeProspects: aiTotal,
        pipeline: aiTotal * 9000,
        real_cash_collected: 0,
        decision: '🧪 VALIDATE',
        decision_reason: `${aiSent} contatti inviati. In attesa di primo contatto.`
      }
    ];

    res.json({
      success: true,
      data: products,
      projects: products,
      items: products
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.3 API: Ottieni Deals e Pipeline Economica Reale
app.get('/api/deals', async (req, res) => {
  try {
    const { getPendingOutreachList, getSentOutreachList } = require('./storage/cloudStore');
    const sent = await getSentOutreachList();

    // Genera deal ESCLUSIVAMENTE dai prospect reali inviati da Gmail
    const deals: any[] = sent.map((s: any, idx: number) => {
      const prod = String(s.mode || s.product || 'danceflow').toLowerCase();
      const val = prod.includes('danceflow') ? 1068 : prod.includes('ai') ? 9000 : 3980;
      return {
        id: String(s.id || 100 + idx),
        company: s.company || s.company_name || 'Azienda',
        company_name: s.company || s.company_name || 'Azienda',
        product: prod.includes('danceflow') ? 'danceflow' : prod.includes('ai') ? 'ai-automation' : 'vedetta',
        mode: prod.includes('danceflow') ? 'danceflow' : prod.includes('ai') ? 'ai-automation' : 'vedetta',
        stage: 'outreach',
        value: val,
        deal_value: val,
        updatedAt: s.sent_at ? s.sent_at.slice(0, 10) : '2026-08-28',
        updated_at: s.sent_at ? s.sent_at.slice(0, 10) : '2026-08-28',
        owner: 'Gabriele'
      };
    });

    res.json({
      success: true,
      data: deals,
      deals,
      items: deals,
      prospects: deals,
      count: deals.length
    });
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

// ─────────────────────────────────────────────────────────────
// 💰 VEDETTA 1.1 — REVENUE OS & EXPERIMENT ENGINE REST API
// ─────────────────────────────────────────────────────────────

// 1. GET /api/revenue/dashboard
app.get('/api/revenue/dashboard', async (req, res) => {
  try {
    const { getPendingOutreachList, getSentOutreachList } = require('./storage/cloudStore');
    const { calculateRevenueDashboard } = require('./revenue/metricsEngine');
    const dataTag = (req.query.tag as any) || 'LIVE';
    
    if (dataTag === 'SIMULATED') {
      const data = calculateRevenueDashboard(dataTag);
      return res.json({ success: true, data });
    }

    const pending = await getPendingOutreachList();
    const sent = await getSentOutreachList();

    const dfCount = pending.filter((p: any) => (p.mode || '').includes('danceflow')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('danceflow')).length;
    const vedettaCount = pending.filter((p: any) => (p.mode || '').includes('vedetta')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('vedetta')).length;
    const aiCount = pending.filter((p: any) => (p.mode || '').includes('ai')).length + sent.filter((s: any) => (s.mode || s.product || '').includes('ai')).length;

    const openPipeline = (dfCount * 1068) + (vedettaCount * 3980) + (aiCount * 9000);
    const weightedPipeline = Math.round(openPipeline * 0.25);

    res.json({
      success: true,
      data: {
        data_tag: 'LIVE',
        cash_collected: 0,
        total_mrr: 0,
        total_arr: 0,
        won_deals_count: 0,
        open_pipeline: openPipeline,
        weighted_pipeline: weightedPipeline,
        prospects_total: pending.length + sent.length,
        emails_sent: sent.length,
        replies: 0,
        positive_replies: 0,
        demos_booked: 0,
        avg_deal_size: 2850
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/revenue/forecast
app.get('/api/revenue/forecast', (req, res) => {
  try {
    const { calculateRevenueForecast } = require('./revenue/forecastEngine');
    const dataTag = (req.query.tag as any) || 'LIVE';
    const data = calculateRevenueForecast(dataTag);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/revenue/payment (Registra incasso reale)
app.post('/api/revenue/payment', (req, res) => {
  try {
    const { recordCashPayment } = require('./revenue/revenueEngine');
    const payment = recordCashPayment(req.body);
    res.json({ success: true, payment });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/experiments (Lista esperimenti con scorecard)
app.get('/api/experiments', (req, res) => {
  try {
    const { listExperiments } = require('./experiments/experimentEngine');
    const { calculateExperimentScorecards } = require('./experiments/experimentMetrics');
    const { evaluateExperimentRules } = require('./experiments/experimentRules');
    const dataTag = (req.query.tag as any) || 'LIVE';
    const product = req.query.product as string;

    const exps = listExperiments(product, dataTag);
    const enriched = exps.map((e: any) => {
      const scorecards = calculateExperimentScorecards(e.id, dataTag);
      const evalRes = evaluateExperimentRules(e, scorecards);
      return {
        ...e,
        status: evalRes.status,
        winner_variant_id: evalRes.winner_variant_id,
        leading_variant_id: evalRes.leading_variant_id,
        recommendation: evalRes.recommendation,
        scorecards: evalRes.scorecards,
      };
    });

    res.json({ success: true, count: enriched.length, experiments: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/experiments (Crea nuovo esperimento A/B/C)
app.post('/api/experiments', (req, res) => {
  try {
    const { createExperiment } = require('./experiments/experimentEngine');
    const { experiment, variants } = req.body;
    const created = createExperiment(experiment, variants);
    res.json({ success: true, experiment: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/experiments/:id (Dettaglio esperimento)
app.get('/api/experiments/:id', (req, res) => {
  try {
    const { getExperiment } = require('./experiments/experimentEngine');
    const { calculateExperimentScorecards } = require('./experiments/experimentMetrics');
    const { evaluateExperimentRules } = require('./experiments/experimentRules');
    const expId = req.params.id;
    const dataTag = (req.query.tag as any) || 'LIVE';

    const expData = getExperiment(expId);
    if (!expData.experiment) {
      return res.status(404).json({ error: 'Esperimento non trovato' });
    }

    const scorecards = calculateExperimentScorecards(expId, dataTag);
    const evalRes = evaluateExperimentRules(expData.experiment, scorecards);

    res.json({
      success: true,
      experiment: {
        ...expData.experiment,
        status: evalRes.status,
        winner_variant_id: evalRes.winner_variant_id,
        leading_variant_id: evalRes.leading_variant_id,
        recommendation: evalRes.recommendation,
      },
      variants: expData.variants,
      scorecards: evalRes.scorecards,
      assignments_count: expData.assignmentsCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/experiments/event (Registra evento funnel)
app.post('/api/experiments/event', (req, res) => {
  try {
    const { recordExperimentEvent } = require('./experiments/experimentEngine');
    const event = recordExperimentEvent(req.body);
    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET /api/learning/insights (Pattern e raccomandazioni)
app.get('/api/learning/insights', (req, res) => {
  try {
    const { runLearningCycle } = require('./learning/learningEngine');
    const { generateCommercialDirectives } = require('./learning/recommendationEngine');
    const { calculateProductCommercialScores } = require('./portfolio/productScorer');
    const dataTag = (req.query.tag as any) || 'LIVE';
    const product = req.query.product as string;

    const insights = runLearningCycle(product, dataTag);
    const productScores = calculateProductCommercialScores(dataTag);
    const directives = generateCommercialDirectives(productScores, insights);

    res.json({
      success: true,
      insights,
      directives,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET /api/products/commercial-scores (Theoretical vs Proven score)
app.get('/api/products/commercial-scores', (req, res) => {
  try {
    const { generatePortfolioDecisionReport } = require('./portfolio/productDecisionEngine');
    const dataTag = (req.query.tag as any) || 'LIVE';
    const report = generatePortfolioDecisionReport(dataTag);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET /api/sales/today (Daily Actions ordinate per Expected Value)
app.get('/api/sales/today', (req, res) => {
  try {
    const { getDailySalesActions } = require('./sales/dailyActionEngine');
    const dataTag = (req.query.tag as any) || 'LIVE';
    const tasks = getDailySalesActions(dataTag);
    res.json({ success: true, count: tasks.length, tasks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. POST /api/sales/reply-classify (AI Reply Classifier)
app.post('/api/sales/reply-classify', (req, res) => {
  try {
    const { classifyInboundReply } = require('./sales/replyIntelligence');
    const { text, prospectName, product } = req.body;
    const classification = classifyInboundReply(text, prospectName, product);
    res.json({ success: true, classification });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
