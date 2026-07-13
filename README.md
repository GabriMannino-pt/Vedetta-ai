# 🔭 Vedetta AI

**Sistema di lead scouting automatizzato per servizi di automazione B2B.**

Vedetta monitora quotidianamente Reddit e Upwork per trovare post e job posting dove qualcuno esprime un dolore operativo risolvibile con automazione (n8n, Zapier, integrazioni AI, script custom). Ogni opportunità viene analizzata con Gemini (Google AI) e il sistema genera un report giornaliero via Telegram con le migliori, ognuna corredata da una bozza di risposta pronta.

---

## 🏗️ Architettura

```
Tavily API (Reddit Search) ──┐
                              ├──▸ Deduplicazione ──▸ Gemini Scoring ──▸ SQLite ──▸ Report ──▸ Telegram
Tavily API (Upwork Search) ──┘
```

## 📋 Prerequisiti

- **Node.js** >= 18
- **npm** >= 9
- Account Tavily (gratuito) — per le ricerche
- Account Google Gemini (gratuito) — per l'analisi
- Bot Telegram (gratuito) — per i report

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

### Tavily Search API (gratuito)

Poiché le API di Reddit e Upwork richiedono approvazioni complesse o sono a pagamento, Vedetta usa **Tavily** per cercare su entrambi i siti in modo stabile e gratuito.

1. Vai su [tavily.com](https://tavily.com) e registrati (nessuna carta richiesta)
2. Copia la API key dalla dashboard
3. Inserisci nel `.env`:
   ```
   TAVILY_API_KEY=tvly-...
   ```

> **Nota:** Il piano gratuito offre 1.000 ricerche al mese. Vedetta consuma circa 16 ricerche per ogni run (480/mese), rientrando perfettamente nel piano gratuito.

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
| `reddit.searchQueries` | Query di ricerca per Reddit via Tavily |
| `reddit.resultsPerQuery` | Numero max di risultati per query (max 10) |
| `reddit.maxPostAgeDays` | Età massima dei risultati (giorni) |
| `upwork.keywords` | Keyword di ricerca Upwork via Tavily |
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
| `punteggio_intent` | INTEGER | Score 0-10 dall'analisi Gemini |
| `settore` | TEXT | Settore identificato |
| `problema` | TEXT | Dolore operativo descritto |
| `bozza_risposta` | TEXT | Risposta pronta da inviare |
| `stato` | TEXT | `nuovo` / `processato` / `contattato` |

Puoi consultare il database direttamente con qualsiasi client SQLite:

```bash
sqlite3 .data/vedetta.db "SELECT url, punteggio_intent, settore FROM leads ORDER BY punteggio_intent DESC"
```

---

## ☁️ Deployment su AWS EC2 (Guida Dettagliata)

Per far girare Vedetta in automatico ogni mattina alle 8:00 senza tenere acceso il tuo computer, puoi caricarlo su un'istanza AWS EC2 (anche nel piano gratuito `t2.micro`).

### 1. Connettiti alla tua macchina AWS via SSH
Usa il tuo terminale per connetterti all'istanza EC2:
```bash
ssh -i "il-tuo-key-pair.pem" ubuntu@il-tuo-ip-pubblico-aws
```

### 2. Prepara l'ambiente sulla macchina Linux
Assicurati che Node.js e Git siano installati sulla macchina AWS (ad es. per Ubuntu):
```bash
# Aggiorna il sistema
sudo apt update && sudo apt upgrade -y

# Installa Node.js (versione 18 o superiore)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifica l'installazione
node -v
npm -v
```

### 3. Clona il repository e configura l'applicazione
```bash
# Clona il codice da GitHub
git clone https://github.com/GabriMannino-pt/Vedetta-ai.git
cd Vedetta-ai

# Installa le dipendenze e builda il progetto
npm install
npm run build

# Crea il file di configurazione .env
nano .env
```
Nel file `.env` che si apre, incolla le tue chiavi e salva (`Ctrl+O`, poi invio, poi `Ctrl+X` per uscire):
```env
TAVILY_API_KEY=tvly-dev-...
GEMINI_API_KEY=AQ.Ab8RN6I...
TELEGRAM_BOT_TOKEN=8906495...
TELEGRAM_CHAT_ID=102057450
```

### 4. Configura il Cron di Linux per l'esecuzione alle 8:00
Apri l'editor dei cron jobs del sistema:
```bash
crontab -e
```
Scegli l'editor che preferisci (ad esempio `nano` premendo `1` e poi Invio), vai in fondo al file e aggiungi la riga seguente (sostituendo `/home/ubuntu/Vedetta-ai` con il percorso corretto se diverso):
```cron
0 8 * * * cd /home/ubuntu/Vedetta-ai && /usr/bin/npm start >> /home/ubuntu/Vedetta-ai/vedetta.log 2>&1
```
*Nota: Questa istruzione dice a Linux di entrare nella cartella di Vedetta ogni giorno alle 08:00, avviare il processo di scouting e salvare eventuali log ed errori nel file `vedetta.log`.*

---

## 📄 Licenza

MIT
