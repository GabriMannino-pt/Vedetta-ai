# 🔭 Vedetta AI

**Sistema di lead scouting automatizzato per servizi di automazione B2B.**

Vedetta monitora quotidianamente Reddit e Upwork per trovare post e job posting dove qualcuno esprime un dolore operativo risolvibile con automazione (n8n, Zapier, integrazioni AI, script custom). Ogni opportunità viene analizzata con Claude (Anthropic) e il sistema genera un report giornaliero via Telegram con le migliori, ognuna corredata da una bozza di risposta pronta.

---

## 🏗️ Architettura

```
Reddit API ──┐
              ├──▸ Deduplicazione ──▸ Claude Scoring ──▸ SQLite ──▸ Report ──▸ Telegram
Upwork API ──┘
```

## 📋 Prerequisiti

- **Node.js** >= 18
- **npm** >= 9
- Account e API key per: Reddit, Upwork (opzionale), Anthropic, Telegram

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

### Reddit API

1. Vai su [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Clicca **"create another app..."**
3. Scegli tipo **"script"**
4. Nome: `Vedetta` (o quello che vuoi)
5. Redirect URI: `http://localhost:8080` (non verrà usato)
6. Copia **client ID** (sotto il nome dell'app) e **client secret**
7. Inserisci nel `.env`:
   ```
   REDDIT_CLIENT_ID=il_tuo_client_id
   REDDIT_CLIENT_SECRET=il_tuo_client_secret
   REDDIT_USERNAME=il_tuo_username_reddit
   REDDIT_PASSWORD=la_tua_password_reddit
   ```

> **Nota:** Username e password sono opzionali. Senza di essi il sistema usa `client_credentials` grant (accesso read-only limitato). Con il password grant hai accesso più ampio.

### Upwork API

1. Vai su [upwork.com/developer/keys/apply](https://www.upwork.com/developer/keys/apply)
2. Registra una nuova app con accesso "Read" ai job
3. Completa il flusso OAuth2 per ottenere un access token
4. Inserisci nel `.env`:
   ```
   UPWORK_ACCESS_TOKEN=il_tuo_access_token
   ```

> **Nota:** L'API Upwork è opzionale. Se non configurata, Vedetta funziona comunque solo con Reddit.

### Anthropic (Claude)

1. Vai su [console.anthropic.com](https://console.anthropic.com/)
2. Crea un account e genera una API key
3. Inserisci nel `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
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
| `reddit.subreddits` | Lista dei subreddit da monitorare |
| `reddit.maxPostAgeDays` | Età massima dei post da considerare (giorni) |
| `reddit.postsPerSubreddit` | Numero max di post per subreddit |
| `upwork.keywords` | Keyword di ricerca su Upwork |
| `scoring.minIntentScore` | Punteggio minimo per includere nel report (0-10) |
| `scoring.claudeModel` | Modello Claude da usare |
| `scoring.delayBetweenCallsMs` | Pausa tra chiamate API Claude (ms) |
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
