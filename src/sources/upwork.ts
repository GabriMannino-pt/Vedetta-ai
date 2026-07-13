import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv } from '../config';

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Cerca job posting Upwork tramite Tavily Search API.
 * Filtra la ricerca includendo solo il dominio upwork.com.
 */
export async function fetchUpworkJobs(): Promise<RawPost[]> {
  let apiKey: string;

  try {
    apiKey = requireEnv('TAVILY_API_KEY');
  } catch {
    console.warn('[UPWORK] ⚠️  TAVILY_API_KEY non configurata, skip sorgente Upwork');
    return [];
  }

  const keywords = appConfig.upwork.keywords;
  const resultsPerKeyword = appConfig.upwork.resultsPerKeyword;
  console.log(`[UPWORK] 🔍 Ricerca job Upwork via Tavily API (${keywords.length} keyword)...`);

  const allJobs: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of keywords) {
    try {
      const res = await axios.post(TAVILY_API_URL, {
        api_key: apiKey,
        query: keyword,
        search_depth: 'basic',
        max_results: Math.min(resultsPerKeyword, 10),
        include_domains: ['upwork.com'],
      });

      const results = res.data.results || [];

      for (const item of results) {
        const url = item.url;
        if (!url || seenUrls.has(url)) continue;

        // Filtra solo pagine di job posting reali
        if (!isUpworkJob(url)) continue;

        seenUrls.add(url);

        // Estrai eventuale budget dallo snippet
        const budgetStr = extractBudget(item.content || '');

        allJobs.push({
          source: 'upwork',
          id: extractJobId(url) || url,
          url,
          title: cleanTitle(item.title || ''),
          body: item.content || '',
          author: 'via Tavily',
          createdAt: new Date(),
          upworkBudget: budgetStr,
        });
      }

      console.log(`[UPWORK]   "${keyword}": ${results.length} risultati`);
      await sleep(300);
    } catch (err: any) {
      console.error(`[UPWORK] ❌ Errore per keyword "${keyword}":`, err.message);
    }
  }

  console.log(`[UPWORK] ✅ Totale job Upwork trovati: ${allJobs.length}`);
  return allJobs;
}

function isUpworkJob(url: string): boolean {
  return /upwork\.com\/(freelance-jobs|jobs|ab\/jobs)\//.test(url);
}

function extractJobId(url: string): string | undefined {
  const match = url.match(/[/~](\w{18,})/);
  return match ? match[1] : undefined;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*Upwork$/i, '')
    .replace(/\s*[-|]\s*Freelance Job$/i, '')
    .trim();
}

function extractBudget(snippet: string): string | undefined {
  const match = snippet.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\/hr)?/);
  return match ? match[0] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
