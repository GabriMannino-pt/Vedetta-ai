import axios from 'axios';
import { RawPost } from '../types';
import { optionalEnv } from '../config';

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  linkedin_url?: string;
  organization?: {
    name: string;
    primary_phone?: string;
    website?: string;
    primary_domain?: string;
  };
}

/**
 * Cerca CEO e Founder italiani su Apollo.io.
 * Restituisce i lead pronti per lo scoring.
 */
export async function fetchOutboundLeads(limit: number = 10): Promise<RawPost[]> {
  const apolloApiKey = optionalEnv('APOLLO_API_KEY');
  
  if (!apolloApiKey) {
    console.warn('[OUTBOUND] ⚠️  APOLLO_API_KEY non configurata. Salto scouting outbound.');
    return [];
  }

  console.log(`[OUTBOUND] 🔍 Avvio ricerca outbound su Apollo.io...`);

  try {
    // 1. Cerca contatti in Italia con titoli legati a decisori (CEO, Founder, Owner, Titolare)
    const titles = ['ceo', 'founder', 'owner', 'titolare', 'direttore'];
    const params = new URLSearchParams();
    params.append('person_locations[]', 'Italy');
    titles.forEach(title => params.append('person_titles[]', title));
    params.append('per_page', String(limit));

    const searchUrl = `https://api.apollo.io/api/v1/mixed_people/api_search?${params.toString()}`;

    const searchRes = await axios.post(
      searchUrl,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apolloApiKey,
        },
      }
    );

    const people: ApolloPerson[] = searchRes.data?.people || [];
    console.log(`[OUTBOUND] 👤 Trovati ${people.length} profili iniziali su Apollo.io. Procedo ad arricchire i contatti...`);

    const rawPosts: RawPost[] = [];

    // 2. Arricchisce ogni profilo per ottenere l'email aziendale (richiede match)
    for (const person of people) {
      try {
        // Attendi 1 secondo tra le chiamate di match per evitare di colpire rate limit di Apollo
        await sleep(1000);

        const matchRes = await axios.post(
          'https://api.apollo.io/api/v1/people/match',
          {
            first_name: person.first_name,
            last_name: person.last_name,
            organization_name: person.organization?.name,
            linkedin_url: person.linkedin_url,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': apolloApiKey,
            },
          }
        );

        const enrichedPerson = matchRes.data?.person;
        const email = enrichedPerson?.email || null;

        // Se non troviamo una mail valida, saltiamo il lead (non possiamo fare cold outreach senza mail!)
        if (!email) {
          console.log(`[OUTBOUND] ⚠️  Email non trovata per ${person.name} (${person.organization?.name || 'Azienda sconosciuta'}), salto.`);
          continue;
        }

        const companyName = person.organization?.name || 'Azienda';
        const website = person.organization?.website || 'N/A';
        const title = person.title || 'CEO';

        // Creiamo il "RawPost" per lo scoring, indicando i dettagli del decisore e dell'azienda nel body
        rawPosts.push({
          source: 'outbound',
          id: `apollo-${person.id}`,
          url: person.linkedin_url || website,
          title: `Prospect B2B: ${companyName} - ${person.name} (${title})`,
          body: `Dettagli Prospect:
Nome: ${person.name}
Ruolo: ${title}
Azienda: ${companyName}
Sito Web: ${website}
Email: ${email}
Profilo LinkedIn: ${person.linkedin_url || 'N/A'}`,
          author: person.name,
          createdAt: new Date(),
        });

      } catch (err: any) {
        console.error(`[OUTBOUND] ❌ Errore arricchimento per ${person.name}:`, err.message);
      }
    }

    console.log(`[OUTBOUND] ✅ Scouting completato: ${rawPosts.length} lead outbound con email pronti per l'analisi.`);
    return rawPosts;

  } catch (err: any) {
    console.error('[OUTBOUND] ❌ Errore durante lo scouting Apollo.io:', err.message);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
