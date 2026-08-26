import axios from 'axios';
import * as cheerio from 'cheerio';
import { requireEnv, optionalEnv } from '../config';

export interface DiscoveredSchoolRaw {
  domain: string;
  name: string;
  website: string;
  city: string;
  pagesCrawled: {
    url: string;
    pageType: string;
    text: string;
    pdfLinks: { url: string; text: string }[];
  }[];
  emails: string[];
  phones: string[];
  socials: {
    instagram?: string;
    facebook?: string;
  };
  detectedPdfForms: { url: string; text: string }[];
  detectedCompetitors: string[];
  hasManualPaymentKeywords: boolean;
  hasWhatsappBookingKeywords: boolean;
  rawSnippets: string[];
}

const AXIOS_TIMEOUT = 10000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Esegue una query di ricerca su Tavily */
async function searchTavily(query: string, maxResults: number = 10): Promise<any[]> {
  const apiKey = requireEnv('TAVILY_API_KEY');
  try {
    const res = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_raw_content: false,
        max_results: maxResults,
      },
      { timeout: 15000 }
    );
    return res.data?.results || [];
  } catch (err: any) {
    console.error(`[SCOUT-DISCOVERY] ⚠️  Errore Tavily query "${query}":`, err.message);
    return [];
  }
}

/** Estrae il dominio base pulito */
function getDomain(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Pulisce ed estrae email valide escludendo falsi positivi comuni */
function extractEmails(text: string, html: string): string[] {
  const emails = new Set<string>();
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,6})/gi;

  const combined = `${text} ${html}`;
  let match;
  while ((match = emailRegex.exec(combined)) !== null) {
    const email = match[1].toLowerCase();
    // Filtra falsi positivi comuni
    if (
      !email.includes('wixpress') &&
      !email.includes('sentry') &&
      !email.includes('example.com') &&
      !email.includes('domain.com') &&
      !email.includes('schema.org') &&
      !email.includes('wordpress') &&
      !email.includes('.png') &&
      !email.includes('.jpg') &&
      !email.includes('user@') &&
      !email.includes('privacy@')
    ) {
      emails.add(email);
    }
  }
  return Array.from(emails);
}

/** Estrae numeri di telefono italiani */
function extractPhoneNumbers(text: string): string[] {
  const phones = new Set<string>();
  // Match per cellulari italiani (+39 3xx xxx xxxx, 3xx xxx xxxx) o fissi (0xx xxx xxxx)
  const phoneRegex = /(?:(?:\+39|0039)?[\s\.-]?)?(?:(?:3\d{2}[\s\.-]?\d{6,7})|(?:0\d{1,3}[\s\.-]?\d{5,8}))/g;

  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    const clean = match[0].replace(/[\s\.-]/g, '');
    if (clean.length >= 9 && clean.length <= 13) {
      phones.add(match[0].trim());
    }
  }
  return Array.from(phones).slice(0, 3);
}

/** Estrae link Instagram e Facebook */
function extractSocials($: any): { instagram?: string; facebook?: string } {
  let instagram: string | undefined;
  let facebook: string | undefined;

  $('a[href]').each((_: any, el: any) => {
    const href = $(el).attr('href') || '';
    if (href.includes('instagram.com/') && !href.includes('/p/') && !instagram) {
      instagram = href;
    }
    if (href.includes('facebook.com/') && !href.includes('/sharer') && !facebook) {
      facebook = href;
    }
  });

  return { instagram, facebook };
}

/** Identifica link a PDF o moduli di iscrizione */
function extractPdfLinks($: any, baseUrl: string): { url: string; text: string }[] {
  const pdfs: { url: string; text: string }[] = [];
  $('a[href]').each((_: any, el: any) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim() || $(el).attr('title') || '';
    if (href.toLowerCase().endsWith('.pdf') || href.toLowerCase().includes('.pdf?') || /modulo|iscrizion|adesion|regolamento|scarica/i.test(text)) {
      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        pdfs.push({ url: absoluteUrl, text: text || 'Documento / Modulo PDF' });
      } catch {}
    }
  });
  return pdfs;
}

/** Recupera ed analizza una singola pagina HTML */
async function fetchPage(url: string): Promise<{ text: string; html: string; $: any } | null> {
  try {
    const res = await axios.get(url, {
      timeout: AXIOS_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      maxRedirects: 5,
    });
    if (typeof res.data !== 'string') return null;
    const html = res.data;
    const $ = cheerio.load(html);

    // Rimuovi script, stili, svg, footer boilerplate
    $('script, style, noscript, svg, nav, footer').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    return { text, html, $ };
  } catch (err: any) {
    return null;
  }
}

/** Cerca pagine interne rilevanti (/contatti, /iscrizioni, /corsi, /orari) */
function findSubpageUrls($: any, baseUrl: string): { type: string; url: string }[] {
  const results: { type: string; url: string }[] = [];
  const visited = new Set<string>();

  const keywords: { [key: string]: RegExp } = {
    iscrizioni: /iscrizion|adesion|modul|regolament|quote|tesserament/i,
    contatti: /contatt|dove-siamo|segreteria|info/i,
    corsi: /corsi|discipline|orari|lezioni|danza/i,
  };

  $('a[href]').each((_: any, el: any) => {
    const href = $(el).attr('href');
    const linkText = $(el).text().trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    try {
      const parsed = new URL(href, baseUrl);
      if (parsed.hostname !== new URL(baseUrl).hostname) return; // solo stesso dominio

      const fullUrl = parsed.toString().split('#')[0];
      if (visited.has(fullUrl)) return;

      for (const [type, regex] of Object.entries(keywords)) {
        if (regex.test(fullUrl) || regex.test(linkText)) {
          results.push({ type, url: fullUrl });
          visited.add(fullUrl);
          break;
        }
      }
    } catch {}
  });

  return results.slice(0, 3);
}

/** Effettua il crawl completo e mirato di una scuola di danza */
export async function crawlSchool(initialUrl: string, initialTitle: string, querySnippet: string): Promise<DiscoveredSchoolRaw | null> {
  const domain = getDomain(initialUrl);
  if (!domain) return null;

  // Normalizza baseUrl
  let baseUrl = initialUrl;
  try {
    const u = new URL(initialUrl);
    baseUrl = `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }

  const mainPage = await fetchPage(baseUrl);
  if (!mainPage) {
    // Prova con l'URL esatto se il baseUrl ha fallito
    const exactPage = await fetchPage(initialUrl);
    if (!exactPage) return null;
  }

  const activePage = mainPage || (await fetchPage(initialUrl))!;
  const $ = activePage.$;
  const allTextSnippets: string[] = [querySnippet, activePage.text.substring(0, 3000)];

  const emails = extractEmails(activePage.text, activePage.html);
  const phones = extractPhoneNumbers(activePage.text);
  const socials = extractSocials($);
  const pdfLinks = extractPdfLinks($, baseUrl);

  const pagesCrawled: DiscoveredSchoolRaw['pagesCrawled'] = [
    {
      url: baseUrl,
      pageType: 'home',
      text: activePage.text.substring(0, 2500),
      pdfLinks,
    },
  ];

  // Cerca ed esplora fino a 2 sotto-pagine chiave
  const subpages = findSubpageUrls($, baseUrl);
  for (const sub of subpages.slice(0, 2)) {
    const subRes = await fetchPage(sub.url);
    if (subRes) {
      allTextSnippets.push(subRes.text.substring(0, 2000));
      const subEmails = extractEmails(subRes.text, subRes.html);
      subEmails.forEach(e => { if (!emails.includes(e)) emails.push(e); });
      const subPhones = extractPhoneNumbers(subRes.text);
      subPhones.forEach(p => { if (!phones.includes(p)) phones.push(p); });
      const subPdfs = extractPdfLinks(subRes.$, sub.url);
      subPdfs.forEach(p => pdfLinks.push(p));

      pagesCrawled.push({
        url: sub.url,
        pageType: sub.type,
        text: subRes.text.substring(0, 2000),
        pdfLinks: subPdfs,
      });
    }
  }

  // Rilevamento software competitor nel testo o HTML
  const combinedHtmlAndText = pagesCrawled.map(p => p.text).join(' ').toLowerCase();
  const detectedCompetitors: string[] = [];
  const competitorsToCheck = ['golee', 'teamup', 'sportrick', 'mindbody', 'bookyway', 'wansport', 'fitmanager', 'blustudio'];
  for (const comp of competitorsToCheck) {
    if (combinedHtmlAndText.includes(comp)) {
      detectedCompetitors.push(comp.charAt(0).toUpperCase() + comp.slice(1));
    }
  }

  // Rilevamento parole chiave di gestione manuale
  const hasManualPayment = /bonifico|iban|contanti|segreteria|ricevuta cartacea|bollettino/i.test(combinedHtmlAndText);
  const hasWhatsappBooking = /whatsapp|scrivici al numero|prenota su whatsapp|messaggio whatsapp/i.test(combinedHtmlAndText);

  // Nome della scuola estratto dal titolo o tag h1
  let schoolName = $('h1').first().text().trim() || $('title').text().split(/[-|–]/)[0].trim() || initialTitle;
  schoolName = schoolName.replace(/\s+/g, ' ').substring(0, 80);

  return {
    domain,
    name: schoolName,
    website: baseUrl,
    city: '', // verrà dedotta/verificata dal testo durante lo scoring
    pagesCrawled,
    emails: emails.slice(0, 3),
    phones: phones.slice(0, 2),
    socials,
    detectedPdfForms: pdfLinks,
    detectedCompetitors,
    hasManualPaymentKeywords: hasManualPayment,
    hasWhatsappBookingKeywords: hasWhatsappBooking,
    rawSnippets: allTextSnippets,
  };
}

/** Esegue la fase di discovery multi-query e restituisce le scuole candidate */
export async function discoverDanceSchools(targetCount: number = 55): Promise<DiscoveredSchoolRaw[]> {
  console.log(`[SCOUT-DISCOVERY] 🔎 Avvio ricerca estesa scuole di danza in tutta Italia su Tavily...`);

  const queries = [
    '"scuola di danza" "modulo di iscrizione" pdf Milano OR Roma OR Torino',
    '"accademia di danza" "regolamento" "iscrizioni" Firenze OR Bologna OR Napoli',
    '"scuola di ballo" "modulo iscrizione" "quote" Brescia OR Bergamo OR Verona',
    '"studio danza" "iscrizione online" OR "modulo pdf" Padova OR Genova OR Bari',
    '"scuola di danza" "scarica modulo iscrizione" ASD',
    '"corsi di danza" "segreteria" "orari lezioni" "contatti" Roma OR Milano',
    '"accademia danza" "quote associative" "bonifico" Palermo OR Catania OR Modena',
    '"scuola di danza classica" "modulo iscrizione" PDF Torino OR Genova',
    '"corsi di ballo caraibico" "salsa" "bachata" "modulo" Roma OR Milano',
    '"scuola danza moderna" "contatti" "iscrizioni" Cagliari OR Sassari OR Reggio Calabria',
    '"accademia di ballo" "orari segreteria" "quote" Verona OR Vicenza OR Treviso',
    '"studio danza" "danza contemporanea" "modulo di adesione" Parma OR Reggio Emilia OR Ferrara',
    '"scuola di danza" "modulo iscrizione 2025" OR "modulo iscrizione 2026" PDF',
    '"associazione sportiva dilettantistica danza" "quote associative" "iban" Rimini OR Ravenna'
  ];

  const candidateUrls = new Map<string, { title: string; snippet: string }>();

  for (const q of queries) {
    console.log(`[SCOUT-DISCOVERY] 📡 Ricerca: ${q}`);
    const results = await searchTavily(q, 10);
    for (const r of results) {
      const domain = getDomain(r.url);
      if (!domain) continue;

      // Filtra directory generiche o giganti
      if (
        domain.includes('facebook.com') ||
        domain.includes('instagram.com') ||
        domain.includes('youtube.com') ||
        domain.includes('paginegialle.it') ||
        domain.includes('tripadvisor.it') ||
        domain.includes('wikipedia.org') ||
        domain.includes('subito.it') ||
        domain.includes('danzasi.it') ||
        domain.includes('danzaedanza.com') ||
        domain.includes('amazon.it') ||
        domain.includes('unicatt.it') ||
        domain.includes('lumsa.it') ||
        domain.includes('uniroma1.it') ||
        domain.includes('unimi.it') ||
        domain.includes('istruzione.it')
      ) {
        continue;
      }

      if (!candidateUrls.has(domain)) {
        candidateUrls.set(domain, { title: r.title, snippet: r.content || '' });
      }
    }
  }

  console.log(`[SCOUT-DISCOVERY] 🌐 Identificati ${candidateUrls.size} domini unici di scuole di danza. Avvio crawl approfondito...`);

  const crawledSchools: DiscoveredSchoolRaw[] = [];
  let count = 0;

  for (const [domain, meta] of candidateUrls.entries()) {
    if (crawledSchools.length >= targetCount) break;
    count++;
    const targetUrl = `https://${domain}`;
    console.log(`[SCOUT-CRAWL] 🕷️  (${count}/${candidateUrls.size}) Crawl: ${targetUrl}`);

    try {
      const school = await crawlSchool(targetUrl, meta.title, meta.snippet);
      if (school && school.pagesCrawled.length > 0 && school.pagesCrawled[0].text.length > 100) {
        crawledSchools.push(school);
        console.log(`[SCOUT-CRAWL]    ✅ Dati estratti per "${school.name}" | Email: ${school.emails[0] || 'N/A'} | Tel: ${school.phones[0] || 'N/A'} | PDF: ${school.detectedPdfForms.length}`);
      } else {
        console.log(`[SCOUT-CRAWL]    ⏩ Skip: contenuto insufficiente o non raggiungibile.`);
      }
    } catch (err: any) {
      console.warn(`[SCOUT-CRAWL]    ⚠️  Errore crawl per ${targetUrl}:`, err.message);
    }

    // Piccolo delay di rispetto
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`[SCOUT-DISCOVERY] 🏁 Crawl completato: ${crawledSchools.length} scuole pronte per la validazione rigorosa.`);
  return crawledSchools;
}

/** Esegue la fase di discovery multi-query per una qualsiasi modalità configurata */
export async function discoverProspectsByMode(mode: string = 'danceflow', targetCount: number = 35): Promise<DiscoveredSchoolRaw[]> {
  if (mode === 'danceflow') {
    return discoverDanceSchools(targetCount);
  }

  console.log(`[SCOUT-DISCOVERY] 🔎 Avvio discovery per modalità "${mode}"...`);

  let queries: string[] = [];
  if (mode === 'vedetta') {
    queries = [
      '"agenzia lead generation b2b" "outbound" Milano OR Roma',
      '"agenzia marketing b2b" "generazione lead" "contatti" Torino OR Bologna',
      '"consulente vendite b2b" "sales pipeline" "acquisizione clienti" Milano',
      '"software house b2b" "soluzioni software" "contatti commerciali" Padova OR Verona',
      '"agenzia outbound" "email marketing b2b" "fissare appuntamenti" Roma',
      '"sviluppo commerciale b2b" "lead qualificati" agenzia Brescia OR Bergamo',
      '"agenzia di prospezione commerciale" "lead qualificati" "contatti"',
      '"agenzia telemarketing b2b" OR "cold email" agenzia Milano'
    ];
  } else if (mode === 'ai-automation') {
    queries = [
      '"poliambulatorio" OR "clinica privata" "prenotazione visite" "contatti" Milano OR Roma',
      '"agenzia immobiliare" "gestione annunci" "richiesta valutazione" Torino OR Bologna',
      '"azienda logistica" "spedizioni" "richiesta preventivo" Brescia OR Bergamo',
      '"studio commercialisti associati" "servizi alle imprese" "contatti" Verona OR Padova',
      '"azienda fornitura b2b" "catalogo" "richiesta offerta" Milano OR Vicenza',
      '"studio consulenza lavoro" "gestione buste paga" "contatti" Bologna OR Modena',
      '"azienda trasporti" "preventivo spedizione" "contatti" Reggio Emilia OR Parma',
      '"clinica diagnostica" "prenota online" OR "richiesta appuntamento" Firenze OR Napoli'
    ];
  } else {
    queries = [`"${mode}" "contatti" "richiesta informazioni" Milano OR Roma`];
  }

  const candidateUrls = new Map<string, { title: string; snippet: string }>();

  for (const q of queries) {
    console.log(`[SCOUT-DISCOVERY] 📡 Ricerca (${mode}): ${q}`);
    const results = await searchTavily(q, 10);
    for (const r of results) {
      const domain = getDomain(r.url);
      if (!domain) continue;

      if (
        domain.includes('facebook.com') ||
        domain.includes('instagram.com') ||
        domain.includes('youtube.com') ||
        domain.includes('paginegialle.it') ||
        domain.includes('tripadvisor.it') ||
        domain.includes('wikipedia.org') ||
        domain.includes('subito.it') ||
        domain.includes('amazon.it') ||
        domain.includes('unicatt.it') ||
        domain.includes('lumsa.it') ||
        domain.includes('uniroma1.it') ||
        domain.includes('unimi.it') ||
        domain.includes('istruzione.it') ||
        domain.includes('paginebianche.it') ||
        domain.includes('atoka.io') ||
        domain.includes('agenziaentrate.gov.it')
      ) {
        continue;
      }

      if (!candidateUrls.has(domain)) {
        candidateUrls.set(domain, { title: r.title, snippet: r.content || '' });
      }
    }
  }

  console.log(`[SCOUT-DISCOVERY] 🌐 Identificati ${candidateUrls.size} domini per "${mode}". Avvio crawl...`);

  const crawledTargets: DiscoveredSchoolRaw[] = [];
  let count = 0;

  for (const [domain, meta] of candidateUrls.entries()) {
    if (crawledTargets.length >= targetCount) break;
    count++;
    const targetUrl = `https://${domain}`;
    console.log(`[SCOUT-CRAWL] 🕷️  (${count}/${candidateUrls.size}) Crawl: ${targetUrl}`);

    try {
      const school = await crawlSchool(targetUrl, meta.title, meta.snippet);
      if (school && school.pagesCrawled.length > 0 && school.pagesCrawled[0].text.length > 100) {
        crawledTargets.push(school);
        console.log(`[SCOUT-CRAWL]    ✅ Dati estratti per "${school.name.slice(0, 40)}" | Email: ${school.emails[0] || 'N/A'} | Tel: ${school.phones[0] || 'N/A'}`);
      } else {
        console.log(`[SCOUT-CRAWL]    ⏩ Skip: contenuto insufficiente o non raggiungibile.`);
      }
    } catch (err: any) {
      console.warn(`[SCOUT-CRAWL]    ⚠️  Errore crawl per ${targetUrl}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`[SCOUT-DISCOVERY] 🏁 Crawl completato: ${crawledTargets.length} prospect estratti per "${mode}".`);
  return crawledTargets;
}

