import axios from 'axios';
import { requireEnv } from '../config';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Invia un messaggio (o più messaggi se troppo lungo) via Telegram Bot API.
 * Usa parse_mode=Markdown per formattazione ricca.
 */
export async function sendTelegramReport(text: string): Promise<void> {
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN');
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;

  // Split in chunks se il messaggio supera il limite di Telegram
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);

  console.log(`[TELEGRAM] 📤 Invio report (${chunks.length} messaggi)...`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await axios.post(url, {
        chat_id: chatId,
        text: chunks[i],
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });

      if (i < chunks.length - 1) {
        await sleep(500); // Piccola pausa tra messaggi multipli
      }
    } catch (err: any) {
      // Se Markdown causa errori di parsing, riprova senza formattazione
      if (err?.response?.data?.description?.includes('parse')) {
        console.warn('[TELEGRAM] ⚠️  Errore parsing Markdown, invio come testo semplice');
        await axios.post(url, {
          chat_id: chatId,
          text: chunks[i],
          disable_web_page_preview: true,
        });
      } else {
        console.error(`[TELEGRAM] ❌ Errore invio messaggio ${i + 1}:`, err.message);
        throw err;
      }
    }
  }

  console.log('[TELEGRAM] ✅ Report inviato con successo');
}

/**
 * Divide un messaggio lungo in chunks rispettando il limite di caratteri.
 * Cerca di spezzare sulle righe, non a metà parola.
 */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Trova l'ultimo newline prima del limite
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1 || splitAt < maxLen * 0.5) {
      // Se non c'è un buon punto di split, taglia al limite
      splitAt = maxLen;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
