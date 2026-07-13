/**
 * Rate limiter centralizzato per le query Google Custom Search API.
 * Garantisce che il sistema non superi MAI il limite giornaliero gratuito.
 *
 * Limite free tier Google CSE: 100 query/giorno.
 * Limite impostato qui: 80 query/giorno (margine di sicurezza del 20%).
 */

const MAX_DAILY_QUERIES = 80;
let queriesUsed = 0;

/** Controlla se possiamo fare un'altra query */
export function canQuery(): boolean {
  return queriesUsed < MAX_DAILY_QUERIES;
}

/** Registra una query usata */
export function trackQuery(): void {
  queriesUsed++;
}

/** Quante query rimangono */
export function queriesRemaining(): number {
  return MAX_DAILY_QUERIES - queriesUsed;
}

/** Quante query sono state usate */
export function queriesUsedCount(): number {
  return queriesUsed;
}

/** Reset contatore (per testing) */
export function resetQueryCount(): void {
  queriesUsed = 0;
}
