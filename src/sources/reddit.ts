import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv } from '../config';

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Cerca post Reddit tramite Tavily Search API.
 * Usa il free tier di Tavily (1000 ricerche gratis al mese).
 */
export async function fetchRedditPosts(): Promise<RawPost[]> {
  let apiKey: string;

  try {
    apiKey = requireEnv('TAVILY_API_KEY');
  } catch {
    console.warn('[REDDIT] ⚠️  TAVILY_API_KEY non configurata, skip sorgente Reddit');
    return [];
  }

  const queries = appConfig.reddit.searchQueries;
  const resultsPerQuery = appConfig.reddit.resultsPerQuery;
  console.log(`[REDDIT] 🔍 Ricerca su Reddit via Tavily API (${queries.length} query)...`);

  const allPosts: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      const res = await axios.post(TAVILY_API_URL, {
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: Math.min(resultsPerQuery, 10),
        include_domains: ['reddit.com'],
      });

      const results = res.data.results || [];

      for (const item of results) {
        const url = item.url;
        if (!url || seenUrls.has(url)) continue;

        // Filtra solo post Reddit reali (non wiki, help, ecc.)
        if (!isRedditPost(url)) continue;

        seenUrls.add(url);

        const subreddit = extractSubreddit(url);

        allPosts.push({
          source: 'reddit',
          id: extractRedditId(url) || url,
          url,
          title: item.title || '',
          body: item.content || '',
          author: 'via Tavily',
          createdAt: new Date(),
          subreddit,
        });
      }

      console.log(`[REDDIT]   "${query}": ${results.length} risultati`);

      // Piccolo delay per non sovraccaricare
      await sleep(300);
    } catch (err: any) {
      console.error(`[REDDIT] ❌ Errore per query "${query}":`, err.message);
    }
  }

  console.log(`[REDDIT] ✅ Totale post Reddit trovati: ${allPosts.length}`);
  return allPosts;
}

function isRedditPost(url: string): boolean {
  return /reddit\.com\/r\/\w+\/comments\//.test(url);
}

function extractSubreddit(url: string): string | undefined {
  const match = url.match(/reddit\.com\/r\/(\w+)\//);
  return match ? match[1] : undefined;
}

function extractRedditId(url: string): string | undefined {
  const match = url.match(/\/comments\/(\w+)\//);
  return match ? match[1] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
