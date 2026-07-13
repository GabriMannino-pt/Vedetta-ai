# 🔭 Vedetta AI

**Sistema di lead scouting automatizzato per servizi di automazione B2B.**

Vedetta monitora quotidianamente Reddit e Upwork per trovare post e job posting dove qualcuno esprime un dolore operativo risolvibile con automazione (n8n, Zapier, integrazioni AI, script custom). Ogni opportunità viene analizzata con Gemini (Google AI) e il sistema genera un report giornaliero via Telegram con le migliori, ognuna corredata da una bozza di risposta pronta.

---

## 🏗️ Architettura

```
Google CSE (Reddit) ──┐
                       ├──▸ Deduplicazione ──▸ Gemini Scoring ──▸ SQLite ──▸ Report ──▸ Telegram
Google CSE (Upwork) ──┘
```

## 📋 Prerequisiti

- **Node.js** >= 18
- **npm** >= 9
- Account Google (per CSE + Gemini) — gratuito
- Bot Telegram (per i report)

---

## 🚀 Setup Rapido

### 1. Clona e installa

```bash
git clone https://github.com/GabriMannino-pt/Vedetta-ai.git
cd Vedetta-ai
npm install
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env
# Apri .env e inserisci le tue credenziali
```

### 3. Build e prima esecuzione

```bash
npm run build
npm start
```

Oppure in un solo comando:

```bash
npm run scout
```

---

## 🔑 Come ottenere le credenziali

### Google Custom Search (per Reddit)

Poiché l'API Reddit richiede approvazione manuale (dal 2025), Vedetta usa Google Custom Search per trovare post Reddit. Gratis fino a 100 query/giorno.

**Passo 1 — API Key Google:**
1. Vai su [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un progetto (o selezionane uno esistente)
3. Vai su **API e servizi → Libreria** e abilita **"Custom Search API"**
4. Vai su **API e servizi → Credenziali** e clicca **"Crea credenziali" → "Chiave API"**
5. Copia la chiave

**Passo 2 — Search Engine ID:**
1. Vai su [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
2. Clicca **"Aggiungi"** per creare un nuovo motore di ricerca
3. In **"Siti da cercare"** inserisci: `reddit.com` e `upwork.com` (uno per riga)
4. Dai un nome (es. "Vedetta")
5. Clicca **"Crea"** e copia il **Search Engine ID** ("cx")

**Passo 3 — Inserisci nel `.env`:**
```
GOOGLE_CSE_API_KEY=la_tua_api_key
GOOGLE_CSE_ID=il_tuo_search_engine_id
```

> **Nota:** Il free tier offre 100 query/giorno (condivise tra Reddit e Upwork), ampiamente sufficienti per Vedetta.

### Google Gemini (gratuito)

1. Vai su [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Clicca **"Create API Key"** — nessuna carta di credito richiesta
3. Inserisci nel `.env`:
   ```
   GEMINI_API_KEY=AIza...
   ```

### Telegram Bot

1. Apri Telegram e cerca **@BotFather**
2. Invia `/newbot` e segui le istruzioni per creare un bot
3. Copia il **token** del bot
4. Invia un qualsiasi messaggio al tuo bot
5. Apri nel browser: `https://api.telegram.org/bot<IL_TUO_TOKEN>/getUpdates`
6. Cerca `"chat":{"id":` nella risposta — quello è il tuo `CHAT_ID`
7. Inserisci nel `.env`:
   ```
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   ```

---

## ⚙️ Configurazione

Modifica `config.json` per personalizzare il comportamento:

| Campo | Descrizione |
|---|---|
| `reddit.searchQueries` | Query di ricerca Google CSE (con `site:reddit.com`) |
| `reddit.resultsPerQuery` | Numero max di risultati per query (max 10) |
| `reddit.maxPostAgeDays` | Età massima dei risultati (giorni) |
| `upwork.keywords` | Keyword di ricerca Upwork via Google CSE |
| `upwork.resultsPerKeyword` | Numero max di risultati per keyword (max 10) |
| `upwork.maxPostAgeDays` | Età massima dei job posting (giorni) |
| `scoring.minIntentScore` | Punteggio minimo per includere nel report (0-10) |
| `scoring.geminiModel` | Modello Gemini da usare (es. `gemini-2.0-flash`) |
| `scoring.delayBetweenCallsMs` | Pausa tra chiamate API Gemini (ms) |
| `report.maxLeadsInReport` | Numero massimo di lead per report |

---

## ⏰ Esecuzione Automatica

Vedetta è progettato come script CLI singolo. Per esecuzione giornaliera automatica:

### Linux/macOS (cron)

```bash
# Apri crontab
crontab -e

# Esegui ogni giorno alle 8:00
0 8 * * * cd /path/to/Vedetta-ai && npm start >> /var/log/vedetta.log 2>&1
```

### Windows (Task Scheduler)

1. Apri **Task Scheduler** (Utilità di pianificazione)
2. Crea un'attività di base
3. Trigger: giornaliero, ora preferita
4. Azione: Avvia programma
   - Programma: `node`
   - Argomenti: `dist/index.js`
   - Directory iniziale: `D:\vedetta` (o dove hai clonato il progetto)

---

## 📊 Database

I lead vengono salvati in un database SQLite locale in `.data/vedetta.db`. Tabella `leads`:

| Colonna | Tipo | Descrizione |
|---|---|---|
| `id` | INTEGER | ID autoincrement |
| `fonte` | TEXT | `reddit` o `upwork` |
| `url` | TEXT (UNIQUE) | URL del post/job (chiave di deduplicazione) |
| `punteggio_intent` | INTEGER | Score 0-10 dall'analisi Claude |
| `settore` | TEXT | Settore identificato |
| `problema` | TEXT | Dolore operativo descritto |
| `bozza_risposta` | TEXT | Risposta pronta da inviare |
| `stato` | TEXT | `nuovo` / `processato` / `contattato` |

Puoi consultare il database direttamente con qualsiasi client SQLite:

```bash
sqlite3 .data/vedetta.db "SELECT url, punteggio_intent, settore FROM leads ORDER BY punteggio_intent DESC"
```

---

## 📄 Licenza

MIT
