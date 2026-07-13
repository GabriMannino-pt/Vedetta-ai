import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv } from '../config';

const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';

/**
 * Cerca job posting Upwork tramite Google Custom Search API.
 * Usa lo stesso motore di ricerca di Reddit ma con query site:upwork.com.
 *
 * Questo approccio elimina la necessità di credenziali Upwork OAuth2
 * e funziona con il free tier di Google CSE (100 query/giorno totali
 * condivise con le query Reddit).
 */
export async function fetchUpworkJobs(): Promise<RawPost[]> {
  let apiKey: string;
  let searchEngineId: string;

  try {
    apiKey = requireEnv('GOOGLE_CSE_API_KEY');
    searchEngineId = requireEnv('GOOGLE_CSE_ID');
  } catch {
    console.warn('[UPWORK] ⚠️  GOOGLE_CSE_API_KEY o GOOGLE_CSE_ID non configurati, skip sorgente Upwork');
    return [];
  }

  const keywords = appConfig.upwork.keywords;
  const resultsPerKeyword = appConfig.upwork.resultsPerKeyword;
  console.log(`[UPWORK] 🔍 Ricerca job Upwork via Google CSE (${keywords.length} keyword)...`);

  const allJobs: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of keywords) {
    try {
      const query = `site:upwork.com/freelance-jobs ${keyword}`;
      const dateRestrict = `d${appConfig.upwork.maxPostAgeDays}`;

      const res = await axios.get(GOOGLE_CSE_URL, {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: query,
          num: Math.min(resultsPerKeyword, 10),
          dateRestrict,
        },
      });

      const items = res.data.items || [];

      for (const item of items) {
        const url = item.link;
        if (!url || seenUrls.has(url)) continue;

        // Filtra solo pagine di job posting reali
        if (!isUpworkJob(url)) continue;

        seenUrls.add(url);

        // Estrai eventuale budget dallo snippet
        const budgetStr = extractBudget(item.snippet || '');

        allJobs.push({
          source: 'upwork',
          id: extractJobId(url) || url,
          url,
          title: cleanTitle(item.title || ''),
          body: item.snippet || '',
          author: 'via Google CSE',
          createdAt: new Date(),
          upworkBudget: budgetStr,
        });
      }

      console.log(`[UPWORK]   "${keyword}": ${items.length} risultati`);
      await sleep(300);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        console.warn('[UPWORK] ⚠️  Quota giornaliera Google CSE esaurita, stop ricerche');
        break;
      } else if (status === 403) {
        console.error('[UPWORK] ❌ API key Google non valida');
        return allJobs;
      } else {
        console.error(`[UPWORK] ❌ Errore per keyword "${keyword}":`, err.message);
      }
    }
  }

  console.log(`[UPWORK] ✅ Totale job Upwork trovati: ${allJobs.length}`);
  return allJobs;
}

/** Controlla se l'URL è un job posting Upwork reale */
function isUpworkJob(url: string): boolean {
  return /upwork\.com\/(freelance-jobs|jobs|ab\/jobs)\//.test(url);
}

/** Estrae l'ID del job dall'URL Upwork */
function extractJobId(url: string): string | undefined {
  const match = url.match(/[/~](\w{18,})/);
  return match ? match[1] : undefined;
}

/** Pulisce il titolo rimuovendo suffissi tipici di Upwork */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*Upwork$/i, '')
    .replace(/\s*[-|]\s*Freelance Job$/i, '')
    .trim();
}

/** Tenta di estrarre un budget dallo snippet Google */
function extractBudget(snippet: string): string | undefined {
  const match = snippet.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\/hr)?/);
  return match ? match[0] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
