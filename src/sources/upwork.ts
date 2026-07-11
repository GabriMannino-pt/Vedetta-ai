import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv } from '../config';

const UPWORK_API_BASE = 'https://www.upwork.com/api/profiles/v2/search/jobs.json';

/**
 * Fetch dei job posting da Upwork per le keyword configurate.
 *
 * ⚠️ L'API Upwork richiede una app registrata con OAuth2.
 * Qui usiamo un access token pre-ottenuto (configurato in .env).
 * Per il primo setup, seguire il flusso OAuth2 documentato nel README.
 *
 * Se l'API Upwork non è configurata o fallisce, il sistema continua
 * senza questa fonte — non è bloccante.
 */
export async function fetchUpworkJobs(): Promise<RawPost[]> {
  let accessToken: string;
  try {
    accessToken = requireEnv('UPWORK_ACCESS_TOKEN');
  } catch {
    console.warn('[UPWORK] ⚠️  UPWORK_ACCESS_TOKEN non configurato, skip sorgente Upwork');
    return [];
  }

  const keywords = appConfig.upwork.keywords;
  const maxResults = appConfig.upwork.maxResults;
  console.log(`[UPWORK] 🔍 Ricerca job per ${keywords.length} keyword...`);

  const allJobs: RawPost[] = [];
  const seenIds = new Set<string>();

  for (const keyword of keywords) {
    try {
      const res = await axios.get(UPWORK_API_BASE, {
        params: {
          q: keyword,
          paging: `0;${Math.min(maxResults, 20)}`,
          sort: 'recency',
          days_posted: appConfig.reddit.maxPostAgeDays,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Vedetta/1.0.0',
        },
      });

      const jobs = res.data?.jobs?.job || res.data?.jobs || [];
      if (!Array.isArray(jobs)) {
        console.warn(`[UPWORK] ⚠️  Risposta inattesa per keyword "${keyword}"`);
        continue;
      }

      for (const job of jobs) {
        const jobId = job.id || job.ciphertext || job.recno?.toString();
        if (!jobId || seenIds.has(jobId)) continue;
        seenIds.add(jobId);

        const url = job.id
          ? `https://www.upwork.com/jobs/${job.id}`
          : `https://www.upwork.com/jobs/~${job.ciphertext || jobId}`;

        const budgetStr = job.budget
          ? `$${job.budget.amount || job.budget}`
          : job.type === 'Hourly'
            ? `$${job.client_hourly_rate || '?'}/hr`
            : undefined;

        allJobs.push({
          source: 'upwork',
          id: jobId,
          url,
          title: job.title || 'Untitled',
          body: job.snippet || job.description || '',
          author: job.client?.company_name || job.client?.country || 'Unknown',
          createdAt: new Date(job.date_created || Date.now()),
          upworkBudget: budgetStr,
        });
      }

      console.log(`[UPWORK]   "${keyword}": ${jobs.length} risultati`);
      await sleep(1000);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        console.error('[UPWORK] ❌ Token non valido o scaduto. Rigenera il token OAuth2.');
        return allJobs; // Interrompi, token non valido
      }
      console.error(`[UPWORK] ❌ Errore per keyword "${keyword}":`, err.message);
    }
  }

  console.log(`[UPWORK] ✅ Totale job raccolti: ${allJobs.length}`);
  return allJobs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
