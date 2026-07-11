import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv } from '../config';

const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';

/**
 * Cerca post Reddit tramite Google Custom Search API.
 *
 * Vantaggi rispetto all'API Reddit diretta:
 * - Nessuna approvazione necessaria
 * - Gratis fino a 100 query/giorno
 * - Filtra automaticamente per rilevanza (ranking Google)
 *
 * Limitazioni:
 * - Non cattura post recentissimi (< qualche ora dall'indicizzazione)
 * - Limite 100 query/giorno nel free tier
 */
export async function fetchRedditPosts(): Promise<RawPost[]> {
  let apiKey: string;
  let searchEngineId: string;

  try {
    apiKey = requireEnv('GOOGLE_CSE_API_KEY');
    searchEngineId = requireEnv('GOOGLE_CSE_ID');
  } catch {
    console.warn('[REDDIT] ⚠️  GOOGLE_CSE_API_KEY o GOOGLE_CSE_ID non configurati, skip sorgente Reddit');
    return [];
  }

  const queries = appConfig.reddit.searchQueries;
  const resultsPerQuery = appConfig.reddit.resultsPerQuery;
  console.log(`[REDDIT] 🔍 Ricerca su Reddit via Google CSE (${queries.length} query)...`);

  const allPosts: RawPost[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      // dateRestrict limita ai risultati degli ultimi N giorni
      const dateRestrict = `d${appConfig.reddit.maxPostAgeDays}`;

      const res = await axios.get(GOOGLE_CSE_URL, {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: query,
          num: Math.min(resultsPerQuery, 10), // Google CSE max 10 per richiesta
          dateRestrict,
        },
      });

      const items = res.data.items || [];

      for (const item of items) {
        const url = item.link;
        if (!url || seenUrls.has(url)) continue;

        // Filtra solo post Reddit (non pagine di subreddit, wiki, ecc.)
        if (!isRedditPost(url)) continue;

        seenUrls.add(url);

        const subreddit = extractSubreddit(url);

        allPosts.push({
          source: 'reddit',
          id: extractRedditId(url) || url,
          url,
          title: item.title || '',
          body: item.snippet || '',
          author: 'via Google CSE',
          createdAt: new Date(), // Google CSE non fornisce data esatta del post
          subreddit,
        });
      }

      console.log(`[REDDIT]   "${query}": ${items.length} risultati`);

      // Pausa tra query per rispettare rate limit
      await sleep(300);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        console.warn('[REDDIT] ⚠️  Quota giornaliera Google CSE esaurita (100/giorno), stop ricerche');
        break;
      } else if (status === 403) {
        console.error('[REDDIT] ❌ API key Google non valida o CSE non configurato');
        return allPosts;
      } else {
        console.error(`[REDDIT] ❌ Errore per query "${query}":`, err.message);
      }
    }
  }

  console.log(`[REDDIT] ✅ Totale post Reddit trovati: ${allPosts.length}`);
  return allPosts;
}

/** Controlla se l'URL è un post Reddit (non una pagina di subreddit o wiki) */
function isRedditPost(url: string): boolean {
  return /reddit\.com\/r\/\w+\/comments\//.test(url);
}

/** Estrae il nome del subreddit dall'URL */
function extractSubreddit(url: string): string | undefined {
  const match = url.match(/reddit\.com\/r\/(\w+)\//);
  return match ? match[1] : undefined;
}

/** Estrae l'ID del post Reddit dall'URL */
function extractRedditId(url: string): string | undefined {
  const match = url.match(/\/comments\/(\w+)\//);
  return match ? match[1] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
