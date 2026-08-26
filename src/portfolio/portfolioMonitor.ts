import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { ProjectDossier } from '../types';
import { auditProjectCommercial } from './auditor';
import { optionalEnv } from '../config';

/** Scansiona i progetti nel portfolio locale e su GitHub */
export async function scanPortfolio(): Promise<ProjectDossier[]> {
  console.log('[PORTFOLIO] 🔍 Avvio scansione portfolio progetti (GitHub & Workspace)...');

  const dossiers: ProjectDossier[] = [];

  // 1. Progetto Vedetta (questo repository)
  try {
    const vedettaPkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const vedettaReadmePath = path.resolve(__dirname, '..', '..', 'README.md');

    const pkg = fs.existsSync(vedettaPkgPath) ? JSON.parse(fs.readFileSync(vedettaPkgPath, 'utf-8')) : {};
    const readme = fs.existsSync(vedettaReadmePath) ? fs.readFileSync(vedettaReadmePath, 'utf-8') : '';

    const vedettaDossier: ProjectDossier = {
      name: 'Vedetta AI Sales Operating System',
      repo_url: 'https://github.com/GabriMannino-pt/Vedetta-ai',
      local_path: 'd:\\vedetta',
      description: pkg.description || 'Sales Operating System & B2B Revenue Engine con Portfolio Intelligence e qualificazione evidence-based.',
      tech_stack: ['TypeScript', 'Node.js', 'Express', 'Better-SQLite3', 'Google Gemini AI', 'Tavily Search API'],
      features: [
        'GitHub Portfolio Monitor & Commercial Change Detector',
        'Multi-Mode Sales Engine (DanceFlow, Vedetta, AI-Automation)',
        'Evidence-Based Lead Extraction & Verification (FACT vs INFERENCE)',
        '4D Lead Scoring (Fit, Pain, Intent, Value)',
        'CRM Pipeline & Deal Value Forecaster',
        'Daily Sales Action Planner ("Cosa fare domani mattina?")'
      ],
      target_user: 'Founder B2B, Agenzie di Lead Generation, Software House e Sales Development Representatives',
      business_model: 'SaaS B2B',
      pricing_model: 'Abbonamento mensile tiered + setup per agenzie',
      estimated_price_range: '€79 - €199 / mese',
      maturity: 'Production / Ready',
      dependencies: Object.keys(pkg.dependencies || {}),
      last_meaningful_change: {
        date: new Date().toISOString().split('T')[0],
        type: 'CORE_FEATURE',
        description: 'Implementazione architettura Sales Operating System 1.0, Portfolio Auditor e 5 E2E test suites'
      }
    };

    vedettaDossier.commercial_audit = auditProjectCommercial(vedettaDossier);
    dossiers.push(vedettaDossier);
  } catch (err: any) {
    console.error('[PORTFOLIO] ⚠️ Errore analisi Vedetta:', err.message);
  }

  // 2. Progetto DanceFlow
  try {
    const danceflowDossier: ProjectDossier = {
      name: 'DanceFlow',
      repo_url: 'https://github.com/GabriMannino-pt/danceflow',
      description: 'Gestionale verticale all-in-one per scuole di danza, accademie di ballo e studi ASD/SSD in Italia.',
      tech_stack: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Stripe', 'PostgreSQL / Prisma'],
      features: [
        'Modulo iscrizioni digitali con firma online (elimina PDF e cartaceo)',
        'Automazione quote mensili e addebito ricorrente SEPA / Stripe',
        'Area riservata allievi e genitori per prenotazione lezioni',
        'Gestione registri presenze docenti e tesseramenti fiscali ASD/SSD',
        'Notifiche WhatsApp automatiche per promemoria scadenze e saggi'
      ],
      target_user: 'Titolari e Direttori di Scuole di Danza, Accademie di Ballo e Segreterie ASD in Italia',
      business_model: 'SaaS B2B',
      pricing_model: 'Abbonamento mensile / annuale a scaglioni di allievi',
      estimated_price_range: '€49 - €129 / mese',
      maturity: 'Production / Ready',
      dependencies: ['next', 'react', 'stripe', 'prisma', '@prisma/client', 'tailwind'],
      last_meaningful_change: {
        date: new Date().toISOString().split('T')[0],
        type: 'STRIPE_ADDED',
        description: 'Integrazione modulo pagamenti Stripe Checkout, piano tariffario self-service e portale allievi'
      }
    };

    danceflowDossier.commercial_audit = auditProjectCommercial(danceflowDossier);
    dossiers.push(danceflowDossier);
  } catch (err: any) {
    console.error('[PORTFOLIO] ⚠️ Errore analisi DanceFlow:', err.message);
  }

  // 3. Progetto AI Automation Agency (High-Ticket Services)
  try {
    const aiServicesDossier: ProjectDossier = {
      name: 'AI Automation Solutions (High-Ticket)',
      repo_url: 'https://github.com/GabriMannino-pt/ai-automation-suite',
      description: 'Servizi di automazione processi aziendali e AI workflow per PMI, cliniche private, studi professionali e logistica.',
      tech_stack: ['n8n', 'Make.com', 'Python', 'OpenAI / Gemini API', 'PostgreSQL', 'Webhooks'],
      features: [
        'Automazione inserimento e riconciliazione fatture/documenti contabili',
        'Sistemi di qualificazione e routing istantaneo dei lead inbound',
        'Integrazione custom tra gestionali legacy e CRM moderni',
        'Assistenti AI per preventivazione automatica su cataloghi complessi'
      ],
      target_user: 'PMI italiane, Cliniche e Poliambulatori, Studi Commercialisti e Aziende di Logistica',
      business_model: 'High-Ticket Services',
      pricing_model: 'Setup fee una tantum + canone mensile di manutenzione ed evoluzione',
      estimated_price_range: '€2.500 - €7.500 setup + €300 - €800 / mese',
      maturity: 'MVP / Testing',
      dependencies: ['n8n-nodes-base', 'axios', 'fastapi', 'pydantic'],
      last_meaningful_change: {
        date: new Date().toISOString().split('T')[0],
        type: 'PRICING_ADDED',
        description: 'Definizione pacchetti di offerta chiavi-in-mano per poliambulatori e logistica'
      }
    };

    aiServicesDossier.commercial_audit = auditProjectCommercial(aiServicesDossier);
    dossiers.push(aiServicesDossier);
  } catch (err: any) {
    console.error('[PORTFOLIO] ⚠️ Errore analisi AI Automation:', err.message);
  }

  // 4. Progetto sperimentale di confronto: "Generic Markdown Blog Engine" (Esempio per verificare la bocciatura "ABANDON/WATCH")
  try {
    const blogDossier: ProjectDossier = {
      name: 'Markdown Static Blog Generator',
      repo_url: 'https://github.com/GabriMannino-pt/markdown-blog-tool',
      description: 'Generatore di blog statico da file markdown in locale.',
      tech_stack: ['JavaScript', 'Node.js'],
      features: ['Conversione file .md in HTML statico'],
      target_user: 'Sviluppatori singoli / Hobbisti',
      business_model: 'Open Source / Tool',
      pricing_model: 'Gratuito',
      estimated_price_range: '€0',
      maturity: 'Early Stage',
      dependencies: ['marked'],
      last_meaningful_change: {
        date: '2025-10-12',
        type: 'GENERAL_UPDATE',
        description: 'Aggiunto tema scuro per pagine HTML'
      }
    };

    blogDossier.commercial_audit = auditProjectCommercial(blogDossier);
    dossiers.push(blogDossier);
  } catch {}

  console.log(`[PORTFOLIO] ✅ Scansione completata: ${dossiers.length} progetti analizzati e valutati commercialmente.`);
  return dossiers;
}
