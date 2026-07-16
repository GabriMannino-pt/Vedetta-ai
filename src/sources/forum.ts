import Parser from 'rss-parser';
import { RawPost } from '../types';
import axios from 'axios';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/rdf+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8'
  }
});

/**
 * Legge i feed RSS dei forum di n8n e Make per estrarre richieste d'aiuto.
 */
export async function fetchForumPosts(): Promise<RawPost[]> {
  const feeds = [
    {
      source: 'n8n_forum' as const,
      url: 'https://community.n8n.io/posts.rss',
      name: 'n8n Community Forum'
    },
    {
      source: 'make_forum' as const,
      url: 'https://community.make.com/posts.rss',
      name: 'Make Community Forum'
    }
  ];

  const rawPosts: RawPost[] = [];

  for (const feed of feeds) {
    try {
      console.log(`[FORUM] 🔌 Connessione a ${feed.name} (${feed.url})...`);
      
      // Discourse richiede spesso User-Agent specifico. Usiamo axios per scaricare l'XML e rss-parser per analizzarlo.
      const response = await axios.get(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, text/xml'
        },
        timeout: 10000
      });

      const feedData = await parser.parseString(response.data);
      const items = feedData.items || [];
      
      console.log(`[FORUM] 🔌 Trovati ${items.length} post nel feed di ${feed.name}.`);

      for (const item of items) {
        if (!item.link || !item.title) continue;

        // Puliamo il testo eliminando tag HTML ed estrando una porzione leggibile
        const cleanBody = cleanHtml(item.content || item.contentSnippet || '');

        rawPosts.push({
          source: feed.source,
          id: item.guid || item.link,
          url: item.link,
          title: item.title,
          body: cleanBody,
          author: item.creator || item.author || 'Anonymous',
          createdAt: item.pubDate ? new Date(item.pubDate) : new Date()
        });
      }
    } catch (err: any) {
      console.error(`[FORUM] ❌ Impossibile leggere il feed di ${feed.name}:`, err.message);
    }
  }

  return rawPosts;
}

/** Rimuove i tag HTML per rendere il testo pulito per Gemini */
function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\S\s]*?)<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
