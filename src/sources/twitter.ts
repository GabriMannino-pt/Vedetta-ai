import axios from 'axios';
import { RawPost } from '../types';
import { requireEnv } from '../config';

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Cerca tweet legati ad automazioni e richieste d'aiuto su Twitter/X tramite Tavily.
 * Metodo leggero ed esente da blocchi anti-bot.
 */
export async function fetchTwitterPosts(): Promise<RawPost[]> {
  let apiKey: string;

  try {
    apiKey = requireEnv('TAVILY_API_KEY');
  } catch {
    console.warn('[TWITTER] ⚠️  TAVILY_API_KEY non configurata, skip sorgente Twitter');
    return [];
  }

  const queries = [
    'site:twitter.com "Zapier help" OR "Zapier error"',
    'site:twitter.com "n8n help" OR "n8n error"',
    'site:twitter.com "Make.com help" OR "Make.com error"',
    'site:twitter.com "need API integration" OR "automate workflow"'
  ];

  console.log(`[TWITTER] 🔍 Ricerca su Twitter/X via Tavily API (${queries.length} query)...`);

  const allPosts: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      // Breve attesa tra le query per essere cortesi con l'API
      await sleep(1000);

      const res = await axios.post(TAVILY_API_URL, {
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_domains: ['twitter.com', 'x.com']
      });

      const results = res.data.results || [];

      for (const item of results) {
        const url = item.url;
        if (!url || seenUrls.has(url)) continue;

        seenUrls.add(url);

        // Estrae l'ID del tweet o un autore fittizio dall'URL
        const author = extractTwitterAuthor(url);

        allPosts.push({
          source: 'twitter',
          id: extractTweetId(url) || url,
          url,
          title: item.title || `Tweet da @${author}`,
          body: item.content || '',
          author: `@${author}`,
          createdAt: new Date()
        });
      }
    } catch (err: any) {
      console.error(`[TWITTER] ❌ Errore nella query "${query}":`, err.message);
    }
  }

  console.log(`[TWITTER] ✅ Completata ricerca Twitter: trovati ${allPosts.length} tweet.`);
  return allPosts;
}

/** Estrae lo username dell'autore dall'URL del tweet */
function extractTwitterAuthor(url: string): string {
  try {
    const match = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)/i);
    return match ? match[1] : 'TwitterUser';
  } catch {
    return 'TwitterUser';
  }
}

/** Estrae l'ID del tweet dall'URL */
function extractTweetId(url: string): string | null {
  try {
    const match = url.match(/\/status\/(\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
