import axios from 'axios';
import { RawPost } from '../types';
import { appConfig, requireEnv, optionalEnv } from '../config';

const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Ottiene un access token Reddit via OAuth2 (client_credentials o password grant).
 * Se username e password sono configurati, usa il password grant per accesso completo;
 * altrimenti usa client_credentials per accesso read-only.
 */
async function getRedditToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = requireEnv('REDDIT_CLIENT_ID');
  const clientSecret = requireEnv('REDDIT_CLIENT_SECRET');
  const username = optionalEnv('REDDIT_USERNAME');
  const password = optionalEnv('REDDIT_PASSWORD');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let body: string;
  if (username && password) {
    body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  } else {
    body = 'grant_type=client_credentials';
  }

  const res = await axios.post(REDDIT_TOKEN_URL, body, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Vedetta/1.0.0',
    },
  });

  cachedToken = res.data.access_token;
  // Token Reddit durano ~2 ore, rinnova con 5 minuti di margine
  tokenExpiresAt = Date.now() + (res.data.expires_in - 300) * 1000;
  return cachedToken!;
}

/**
 * Fetch dei post recenti da un singolo subreddit.
 * Filtra quelli più vecchi di maxPostAgeDays.
 */
async function fetchSubreddit(subreddit: string): Promise<RawPost[]> {
  const token = await getRedditToken();
  const limit = appConfig.reddit.postsPerSubreddit;
  const maxAgeMs = appConfig.reddit.maxPostAgeDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  try {
    const res = await axios.get(`${REDDIT_API_BASE}/r/${subreddit}/new.json`, {
      params: { limit, raw_json: 1 },
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Vedetta/1.0.0',
      },
    });

    // Rispetta i rate limit di Reddit
    const remaining = res.headers['x-ratelimit-remaining'];
    const resetSeconds = res.headers['x-ratelimit-reset'];
    if (remaining !== undefined && Number(remaining) < 5) {
      const waitMs = (Number(resetSeconds) + 1) * 1000;
      console.warn(`[REDDIT] ⚠️  Rate limit basso (${remaining} rimanenti), attendo ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }

    const posts: RawPost[] = [];
    for (const child of res.data.data.children) {
      const d = child.data;
      const createdMs = d.created_utc * 1000;

      if (createdMs < cutoff) continue;

      posts.push({
        source: 'reddit',
        id: d.id,
        url: `https://www.reddit.com${d.permalink}`,
        title: d.title || '',
        body: d.selftext || '',
        author: d.author || '[deleted]',
        createdAt: new Date(createdMs),
        subreddit: d.subreddit,
      });
    }

    return posts;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429) {
      console.warn(`[REDDIT] ⚠️  Rate limited su r/${subreddit}, skip`);
    } else if (status === 403) {
      console.warn(`[REDDIT] ⚠️  r/${subreddit} non accessibile (403), skip`);
    } else {
      console.error(`[REDDIT] ❌ Errore fetching r/${subreddit}:`, err.message);
    }
    return [];
  }
}

/**
 * Fetch di tutti i post recenti dai subreddit configurati.
 * Se un subreddit fallisce, continua con gli altri.
 */
export async function fetchRedditPosts(): Promise<RawPost[]> {
  const subreddits = appConfig.reddit.subreddits;
  console.log(`[REDDIT] 🔍 Scanning ${subreddits.length} subreddit...`);

  const allPosts: RawPost[] = [];

  for (const sub of subreddits) {
    const posts = await fetchSubreddit(sub);
    console.log(`[REDDIT]   r/${sub}: ${posts.length} post recenti`);
    allPosts.push(...posts);

    // Piccola pausa tra subreddit per non sovraccaricare l'API
    await sleep(500);
  }

  console.log(`[REDDIT] ✅ Totale post raccolti: ${allPosts.length}`);
  return allPosts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
