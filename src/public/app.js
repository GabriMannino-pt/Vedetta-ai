let allLeads = [];
let currentLead = null;
let currentSourceType = 'inbound';
let currentView = 'overview';
let selectedLeadId = null;

// Inizializza l'applicazione al caricamento
document.addEventListener('DOMContentLoaded', () => {
  refreshLeads();
});

// Cambia la sorgente tra Inbound (Upwork/Reddit/Twitter/Forums) e Outbound (B2B Italia)
function switchSourceType(sourceType) {
  currentSourceType = sourceType;
  
  // Aggiorna la barra dei tab superiori
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`tab-${sourceType}`).classList.add('active');
  
  // Resetta il lead selezionato sul pannello destro
  deselectLead();

  // Ricarica i lead per la nuova sorgente
  refreshLeads();
}

// Cambia la visualizzazione tramite menu laterale (Sidebar)
function switchSidebarView(viewName) {
  currentView = viewName;

  // Aggiorna le classi attive sulla sidebar
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  document.getElementById(`menu-${viewName}`).classList.add('active');

  // Mostra/Nascondi le sezioni della pagina
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`view-${viewName}`).classList.add('active');

  // Aggiorna il titolo della pagina
  const titles = {
    overview: 'Overview',
    leads: 'Qualified Leads Pipeline',
    career: 'Career Intelligence OS',
    settings: 'Settings'
  };
  document.getElementById('page-title').innerText = titles[viewName] || 'Dashboard';

  // Rinfresca i dati
  if (viewName === 'career') {
    loadCareerDashboard();
  } else {
    refreshLeads();
  }
}

// Deseleziona il lead attivo dal pannello destro
function deselectLead() {
  selectedLeadId = null;
  document.getElementById('draft-content-panel').style.display = 'none';
  document.getElementById('draft-placeholder').style.display = 'flex';
}

// Recupera i lead dal server e aggiorna l'interfaccia
async function refreshLeads() {
  try {
    const res = await fetch(`/api/leads?tipo=${currentSourceType}`);
    if (!res.ok) throw new Error('Impossibile recuperare i lead');
    
    allLeads = await res.json();
    
    // Aggiorna statistiche globali per questa sorgente
    updateStatistics();

    // Costruisce i componenti grafici della vista attiva
    if (currentView === 'overview') {
      buildKanbanBoard();
      // Se c'è un lead precedentemente selezionato, lo ri-popoliamo
      if (selectedLeadId) {
        selectLead(selectedLeadId);
      }
    } else if (currentView === 'leads') {
      buildListView();
    }
    
    // Inizializza le icone Lucide dopo aver caricato il DOM dinamico
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('❌ Errore refresh leads:', err.message);
  }
}

// Calcola e aggiorna le statistiche KPI in tempo reale
function updateStatistics() {
  const totalLeads = allLeads.length;
  
  let totalScore = 0;
  let activeDeals = 0;
  
  allLeads.forEach(lead => {
    totalScore += lead.punteggio_intent || 0;
    
    const status = lead.pipeline_status || 'nuovo';
    if (status === 'nuovo' || status === 'contattato' || status === 'in_trattativa' || status === 'preventivo_inviato') {
      activeDeals++;
    }
  });
  
  const avgScore = totalLeads > 0 ? (totalScore / totalLeads).toFixed(1) : '0.0';
  
  document.getElementById('stat-total-leads').innerText = totalLeads.toLocaleString('it-IT');
  document.getElementById('stat-active-deals').innerText = activeDeals.toLocaleString('it-IT');
  document.getElementById('stat-avg-score').innerText = avgScore;
}

// Filtra i lead per Piattaforma/Fonte
function getFilteredLeads(filterSourceVal) {
  if (!filterSourceVal || filterSourceVal === 'all') {
    return allLeads;
  }
  return allLeads.filter(lead => lead.fonte === filterSourceVal);
}

// Costruisce la Kanban Board
function buildKanbanBoard() {
  const columns = ['nuovo', 'contattato', 'in_trattativa', 'preventivo_inviato', 'chiuso_vinto'];
  const platformFilterVal = document.getElementById('platform-select').value;
  const filtered = getFilteredLeads(platformFilterVal);

  // Svuota le colonne e azzera i conteggi
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
    document.getElementById(`count-${col}`).innerText = '0';
  });

  // Raggruppa i lead per colonna
  filtered.forEach(lead => {
    let status = lead.pipeline_status || 'nuovo';
    if (status === 'chiuso_perso') return; // Non mostriamo i persi nel Kanban
    if (!columns.includes(status)) status = 'nuovo';

    const countElem = document.getElementById(`count-${status}`);
    countElem.innerText = parseInt(countElem.innerText, 10) + 1;

    const card = createCardElement(lead);
    document.getElementById(`cards-${status}`).appendChild(card);
  });
}

// Crea l'elemento DOM per la singola card
function createCardElement(lead) {
  const card = document.createElement('div');
  card.className = `lead-card ${selectedLeadId === lead.id ? 'active' : ''}`;
  card.id = `card-lead-${lead.id}`;
  card.draggable = true;
  card.setAttribute('ondragstart', `handleDragStart(event, ${lead.id})`);
  
  // Il click singolo seleziona e popola la colonna destra, il doppio click apre la modale dettagliata
  card.onclick = (e) => {
    e.stopPropagation();
    selectLead(lead.id);
  };
  card.ondblclick = () => openLeadSheet(lead.id);

  // Badge per lo score
  let scoreClass = 'score-low';
  if (lead.punteggio_intent >= 8) scoreClass = 'score-high';
  else if (lead.punteggio_intent >= 5) scoreClass = 'score-mid';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">${escapeHtml(lead.titolo)}</span>
      <span class="score-badge ${scoreClass}">${lead.punteggio_intent}/10</span>
    </div>
    <div class="card-meta">
      <span class="card-sector">${escapeHtml(lead.settore || 'Generico')}</span>
      <span class="card-source">${lead.fonte.replace('_', ' ')}</span>
    </div>
  `;
  return card;
}

// Seleziona un lead e lo mostra nella colonna destra (mockup layout)
function selectLead(id) {
  selectedLeadId = id;
  const lead = allLeads.find(l => l.id === id);
  if (!lead) return;

  currentLead = lead;

  // Evidenzia visivamente la card attiva nel Kanban
  document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active'));
  const cardElement = document.getElementById(`card-lead-${id}`);
  if (cardElement) cardElement.classList.add('active');

  // Popola il pannello "AI Outreach Drafts" di destra
  document.getElementById('draft-placeholder').style.display = 'none';
  document.getElementById('draft-content-panel').style.display = 'flex';

  const recipientName = lead.fonte === 'outbound' ? (lead.author || 'CEO / Titolare') : 'Prospect Inbound';
  document.getElementById('draft-recipient-name').innerText = recipientName;
  
  // Imposta l'oggetto e il corpo email
  document.getElementById('draft-email-subject').value = `Proposta di Automazione Workflow — ${lead.settore || 'B2B'}`;
  document.getElementById('draft-email-body').value = lead.bozza_risposta;

  // Pulisce messaggi di stato email precedenti
  const statusMsg = document.getElementById('draft-send-status');
  statusMsg.className = 'status-msg';
  statusMsg.innerText = '';
}

// Drag and drop handlers
function handleDragStart(event, id) {
  event.dataTransfer.setData('text/plain', id);
}

function allowDrop(event) {
  event.preventDefault();
}

async function handleDrop(event, newStatus) {
  event.preventDefault();
  const id = parseInt(event.dataTransfer.getData('text/plain'), 10);
  if (isNaN(id)) return;

  const lead = allLeads.find(l => l.id === id);
  if (lead) {
    lead.pipeline_status = newStatus;
    buildKanbanBoard();
  }

  try {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status: newStatus })
    });
    if (!res.ok) throw new Error("Errore nell'aggiornamento dello stato");
  } catch (err) {
    console.error('❌ Errore drop:', err.message);
    refreshLeads();
  }
}

// Costruisce la List View (Pipeline Table del Mockup)
function buildListView() {
  const filterSourceVal = document.getElementById('filter-source').value;
  const filterStatusVal = document.getElementById('filter-status').value;
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  const tbody = document.getElementById('list-table-body');
  tbody.innerHTML = '';

  const filtered = allLeads.filter(lead => {
    const status = lead.pipeline_status || 'nuovo';
    const matchesSearch = 
      lead.titolo.toLowerCase().includes(searchQuery) ||
      (lead.settore && lead.settore.toLowerCase().includes(searchQuery)) ||
      lead.testo.toLowerCase().includes(searchQuery);
    
    const matchesStatus = filterStatusVal === 'all' || status === filterStatusVal;
    const matchesSource = filterSourceVal === 'all' || lead.fonte === filterSourceVal;

    return matchesSearch && matchesStatus && matchesSource;
  });

  filtered.forEach(lead => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => selectLeadAndOpenSheet(lead.id);

    // Cerchio di score con gradiente CSS
    let scoreColor = 'green';
    if (lead.punteggio_intent < 5) scoreColor = 'red';
    else if (lead.punteggio_intent < 8) scoreColor = 'orange';

    const dateStr = new Date(lead.data_trovato).toLocaleDateString('it-IT', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Badge di status
    let statusText = (lead.pipeline_status || 'nuovo').replace('_', ' ');
    let statusClass = 'score-mid';
    if (lead.pipeline_status === 'chiuso_vinto') statusClass = 'score-high';
    if (lead.pipeline_status === 'chiuso_perso') statusClass = 'score-low';

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap: 12px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--db-accent-green)"></div>
          <span style="font-weight:600; max-width: 250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;">
            ${escapeHtml(lead.titolo)}
          </span>
        </div>
      </td>
      <td><strong style="text-transform: uppercase;">${lead.fonte.replace('_', ' ')}</strong></td>
      <td>${escapeHtml(lead.settore || 'Generico')}</td>
      <td>
        <div class="score-circle-container ${scoreColor}">
          ${lead.punteggio_intent}
        </div>
      </td>
      <td><span class="score-badge ${statusClass}" style="text-transform: capitalize;">${statusText}</span></td>
      <td>${dateStr}</td>
      <td><button class="btn-table-action" onclick="event.stopPropagation(); openLeadSheet(${lead.id})">Apri</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function selectLeadAndOpenSheet(id) {
  selectLead(id);
  openLeadSheet(id);
}

// Filtra la lista dal campo input
function filterList() {
  buildListView();
}

// Apri la scheda di dettaglio (Sliding Sheet)
function openLeadSheet(id) {
  const lead = allLeads.find(l => l.id === id);
  if (!lead) return;
  
  currentLead = lead;

  // Popola la scheda dettagliata
  document.getElementById('sheet-title').innerText = lead.titolo;
  document.getElementById('info-fonte').innerText = lead.fonte.toUpperCase().replace('_', ' ');
  document.getElementById('info-score').innerText = `${lead.punteggio_intent}/10`;
  document.getElementById('info-settore').innerText = lead.settore || 'Generico';
  document.getElementById('info-budget').innerText = lead.evidenza_budget_dettaglio || 'Nessuno';
  document.getElementById('info-urgenza').innerText = lead.urgenza || 'Media';
  document.getElementById('info-link').href = lead.url;
  
  document.getElementById('info-testo').innerText = lead.testo;
  document.getElementById('info-soluzione').innerText = lead.soluzione_proposta || 'N/A';
  document.getElementById('notes-textarea').value = lead.notes || '';
  
  document.getElementById('sheet-status-select').value = lead.pipeline_status || 'nuovo';
  document.getElementById('client-email-input').value = lead.client_email || '';

  // Popola bozza
  document.getElementById('info-bozza').innerText = lead.bozza_risposta;

  // Mostra overlay
  document.getElementById('lead-sheet-overlay').classList.add('active');
  document.getElementById('lead-sheet').classList.add('active');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Scorciatoia per aprire i dettagli del lead correntemente visualizzato a destra
function openLeadSheetDirect() {
  if (currentLead) {
    openLeadSheet(currentLead.id);
  }
}

// Chiudi la scheda
function closeLeadSheet() {
  document.getElementById('lead-sheet-overlay').classList.remove('active');
  document.getElementById('lead-sheet').classList.remove('active');
  currentLead = null;
  refreshLeads();
}

// Aggiorna lo stato dalla modale dettagliata
async function changeLeadStatusFromSheet() {
  if (!currentLead) return;
  const newStatus = document.getElementById('sheet-status-select').value;
  currentLead.pipeline_status = newStatus;

  try {
    await fetch(`/api/leads/${currentLead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status: newStatus })
    });
  } catch (err) {
    console.error('❌ Errore aggiornamento stato:', err.message);
  }
}

// Salva le note del lead
async function saveLeadNotes() {
  if (!currentLead) return;
  const notes = document.getElementById('notes-textarea').value;
  currentLead.notes = notes;

  try {
    await fetch(`/api/leads/${currentLead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
  } catch (err) {
    console.error('❌ Errore salvataggio note:', err.message);
  }
}

// Salva la mail del cliente
async function saveLeadEmail() {
  if (!currentLead) return;
  const email = document.getElementById('client-email-input').value;
  currentLead.client_email = email;

  try {
    await fetch(`/api/leads/${currentLead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_email: email })
    });
  } catch (err) {
    console.error('❌ Errore salvataggio email:', err.message);
  }
}

// Copia la bozza risposta negli appunti
function copyDraftToClipboard() {
  const draftText = document.getElementById('draft-email-body').value;
  navigator.clipboard.writeText(draftText).then(() => {
    alert('Bozza copiata negli appunti con successo!');
  }).catch(err => {
    console.error('❌ Impossibile copiare il testo:', err);
  });
}

// Invia l'email direttamente dal pannello destro (mockup layout)
async function sendDraftEmailDirect() {
  if (!currentLead) return;
  
  const to = currentLead.client_email;
  const subject = document.getElementById('draft-email-subject').value;
  const body = document.getElementById('draft-email-body').value;
  const statusMsg = document.getElementById('draft-send-status');

  if (!to) {
    statusMsg.className = 'status-msg error';
    statusMsg.innerText = 'Email cliente mancante. Clicca su "Modifica Lead" per inserirla.';
    return;
  }

  statusMsg.className = 'status-msg';
  statusMsg.innerText = 'Invio in corso...';

  try {
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore durante l\'invio');

    statusMsg.className = 'status-msg success';
    statusMsg.innerText = '✉️ Email inviata con successo!';
    
    // Sposta in automatico il lead in "Preventivo Inviato"
    const prevStatus = currentLead.pipeline_status || 'nuovo';
    if (prevStatus === 'nuovo' || prevStatus === 'contattato' || prevStatus === 'in_trattativa') {
      currentLead.pipeline_status = 'preventivo_inviato';
      await fetch(`/api/leads/${currentLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_status: 'preventivo_inviato' })
      });
      refreshLeads();
    }
  } catch (err) {
    statusMsg.className = 'status-msg error';
    statusMsg.innerText = `❌ ${err.message}`;
  }
}

// Helper per sanificare l'HTML ed evitare XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────────────────────
// 🦅 CAREER INTELLIGENCE OS JAVASCRIPT LAYER
// ─────────────────────────────────────────────────────────────

async function loadCareerDashboard() {
  try {
    const res = await fetch('/api/career/dashboard');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    const oppEl = document.getElementById('stat-career-opps');
    if (oppEl) oppEl.innerText = data.totalOpportunities || 0;
    const strongEl = document.getElementById('stat-career-strong');
    if (strongEl) strongEl.innerText = data.strongMatchesCount || 0;
    const appsEl = document.getElementById('stat-career-apps');
    if (appsEl) appsEl.innerText = data.applicationsCount || 0;
    
    if (data.metrics) {
      const respEl = document.getElementById('stat-career-response-rate');
      if (respEl) respEl.innerText = (data.metrics.responseRate || 0) + '%';
      const intEl = document.getElementById('stat-career-interview-rate');
      if (intEl) intEl.innerText = (data.metrics.interviewRate || 0) + '%';
      const winEl = document.getElementById('stat-career-win-rate');
      if (winEl) winEl.innerText = (data.metrics.winRate || 0) + '%';
      const revEl = document.getElementById('stat-career-revenue');
      if (revEl) revEl.innerText = '€' + (data.metrics.totalRevenue || 0).toLocaleString();
    }

    // Render Alerts
    renderCareerAlerts(data.alerts || []);

    // Render Funnel
    renderCareerFunnel(data.funnel);

    // Load Actions & Queue
    loadCareerActions();
    loadCareerQueue();

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading career dashboard:', err);
  }
}

function renderCareerAlerts(alerts) {
  const container = document.getElementById('career-alerts-container');
  if (!container) return;
  container.innerHTML = '';

  if (alerts.length === 0) return;

  alerts.slice(0, 3).forEach(a => {
    const isCrit = a.severity === 'CRITICAL';
    const isWarn = a.severity === 'WARNING';
    const bg = isCrit ? 'rgba(255, 69, 58, 0.15)' : (isWarn ? 'rgba(255, 159, 10, 0.15)' : 'rgba(10, 132, 255, 0.15)');
    const border = isCrit ? 'rgba(255, 69, 58, 0.3)' : (isWarn ? 'rgba(255, 159, 10, 0.3)' : 'rgba(10, 132, 255, 0.3)');
    const color = isCrit ? '#ff453a' : (isWarn ? '#ff9f0a' : '#0A84FF');

    const div = document.createElement('div');
    div.style = `padding: 10px 16px; border-radius: 8px; background: ${bg}; border: 1px solid ${border}; display: flex; align-items: center; justify-content: space-between;`;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="color: ${color}; font-weight: 700; font-size: 13px;">[${a.severity}]</span>
        <span style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(a.title)}:</span>
        <span style="font-size: 13px; color: var(--db-gray-text);">${escapeHtml(a.description)}</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderCareerFunnel(funnel) {
  const container = document.getElementById('career-funnel-stages');
  if (!container || !funnel) return;
  container.innerHTML = '';

  const updatedEl = document.getElementById('funnel-updated-time');
  if (updatedEl) {
    updatedEl.innerText = 'Totale Won: ' + funnel.totalWon + ' | Ricavo: €' + funnel.realizedRevenue.toLocaleString();
  }

  funnel.stages.forEach(st => {
    const card = document.createElement('div');
    card.style = 'background: rgba(0,0,0,0.25); border: 1px solid var(--db-card-border); border-radius: 8px; padding: 10px; text-align: center;';
    card.innerHTML = `
      <div style="font-size: 11px; color: var(--db-gray-text); text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(st.label.split(' ')[0])}</div>
      <div style="font-size: 16px; font-weight: 700; color: #fff;">${st.count}</div>
      <div style="font-size: 10px; color: var(--db-accent-green); margin-top: 4px;">${st.stepConversionRate}% step</div>
    `;
    container.appendChild(card);
  });
}

async function loadCareerQueue() {
  try {
    const search = document.getElementById('career-search')?.value || '';
    const rec = document.getElementById('career-filter-rec')?.value || '';
    const status = document.getElementById('career-filter-status')?.value || '';

    let url = `/api/career/opportunities/queue?search=${encodeURIComponent(search)}`;
    if (rec) url += `&recommendation=${encodeURIComponent(rec)}`;
    if (status === 'READY') url += '&applicationStatus=READY';
    else if (status === 'SUBMITTED') url += '&applicationStatus=SUBMITTED';
    else if (status === 'ANALYZED') url += '&analysisStatus=ANALYZED';

    const res = await fetch(url);
    const json = await res.json();
    const tbody = document.getElementById('career-queue-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!json.items || json.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--db-gray-text); padding: 24px;">Nessuna opportunità trovata.</td></tr>';
      return;
    }

    json.items.forEach(item => {
      const tr = document.createElement('tr');
      
      const fitBadge = item.fit_score !== null 
        ? `<span style="padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 12px; background: ${item.fit_score >= 80 ? 'rgba(16,185,129,0.2)' : 'rgba(255,159,10,0.2)'}; color: ${item.fit_score >= 80 ? '#10b981' : '#ff9f0a'};">${item.fit_score}%</span>`
        : '<span style="color: var(--db-gray-text);">-</span>';

      const recColors = {
        STRONG_MATCH: '#10b981',
        GOOD_MATCH: '#34d399',
        POSSIBLE_MATCH: '#ff9f0a',
        LOW_PRIORITY: '#9ca3af'
      };

      const recBadge = item.fit_recommendation 
        ? `<span style="font-size: 11px; font-weight: 600; color: ${recColors[item.fit_recommendation] || '#fff'};">${item.fit_recommendation}</span>`
        : '-';

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(item.title)}</div>
          <div style="font-size: 12px; color: var(--db-gray-text);">${escapeHtml(item.company_name)}</div>
        </td>
        <td>
          <div style="font-size: 12px;">${escapeHtml(item.source)}</div>
          <div style="font-size: 11px; color: var(--db-gray-text);">${escapeHtml(item.remote_type || 'N/A')}</div>
        </td>
        <td>${fitBadge}</td>
        <td><strong style="color: #fff;">${item.application_priority ?? '-'}</strong></td>
        <td>${recBadge} ${item.critical_gap ? '<span style="color: #ff453a; font-size: 10px; font-weight: 700;">[GAP]</span>' : ''}</td>
        <td>
          <span style="font-size: 12px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.06);">${escapeHtml(item.operational_state)}</span>
        </td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="openCareerOpportunityDetail(${item.id})">
            Dettagli
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading career queue:', err);
  }
}

async function openCareerOpportunityDetail(opportunityId) {
  try {
    const res = await fetch(`/api/career/opportunities/${opportunityId}/intelligence`);
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    const sheetBody = document.getElementById('career-sheet-body');
    const titleEl = document.getElementById('career-sheet-title');
    if (titleEl) titleEl.innerText = data.opportunity.title + ' — ' + data.opportunity.company_name;

    const reqsHtml = data.requirements.map(r => `
      <div style="padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 6px; margin-bottom: 4px; display: flex; justify-content: space-between; font-size: 12px;">
        <span><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.priority)})</span>
        <span style="color: var(--db-gray-text);">${escapeHtml(r.category)}</span>
      </div>
    `).join('') || '<div style="color: var(--db-gray-text); font-size: 12px;">Nessun requisito estratto.</div>';

    let appSectionHtml = '<div style="color: var(--db-gray-text); font-size: 13px;">Nessuna candidatura creata per questa opportunità.</div>';
    if (data.application) {
      const prop = data.proposal;
      appSectionHtml = `
        <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--db-card-border); border-radius: 8px; padding: 14px; margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; font-size: 13px;">Stato Candidatura: <strong style="color: var(--db-accent-green);">${escapeHtml(data.application.status)}</strong></span>
            <span style="font-size: 12px; color: var(--db-gray-text);">Canale: ${escapeHtml(data.application.channel)}</span>
          </div>
          ${prop ? `
            <div style="margin-top: 10px;">
              <span style="font-size: 12px; font-weight: 600;">Bozza Proposta (v${prop.proposal_version} - ${escapeHtml(prop.proposal_status)}):</span>
              <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; font-size: 12px; white-space: pre-wrap; margin-top: 4px; max-height: 150px; overflow-y: auto;">${escapeHtml(prop.content)}</div>
            </div>
          ` : ''}
          ${data.outcome ? `
            <div style="margin-top: 10px; font-size: 12px; border-top: 1px solid var(--db-card-border); padding-top: 8px;">
              <span>Ultimo Esito: <strong>${escapeHtml(data.outcome.finalOutcome)}</strong></span> |
              <span>Revenue: <strong>€${(data.outcome.revenue || 0).toLocaleString()}</strong></span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (sheetBody) {
      sheetBody.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Panoramica & Fit</h4>
            <div style="font-size: 13px; margin-bottom: 6px;">Fonte: <strong>${escapeHtml(data.opportunity.source)}</strong> | Remote: <strong>${escapeHtml(data.opportunity.remote_type || 'N/A')}</strong></div>
            <div style="font-size: 13px; margin-bottom: 12px;">Fit Score: <strong style="color: #10b981;">${data.fit.fitScore ?? 'N/A'}%</strong> | Priority: <strong>${data.fit.applicationPriority ?? 'N/A'}</strong></div>
            
            <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Requisiti Rilevati</h4>
            <div style="max-height: 180px; overflow-y: auto;">${reqsHtml}</div>
          </div>

          <div>
            <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Candidatura & Proposta</h4>
            ${appSectionHtml}
          </div>
        </div>
      `;
    }

    document.getElementById('career-sheet-overlay')?.classList.add('active');
    document.getElementById('career-sheet')?.classList.add('active');
  } catch (err) {
    console.error('Error opening opportunity detail:', err);
  }
}

function closeCareerSheet() {
  document.getElementById('career-sheet-overlay')?.classList.remove('active');
  document.getElementById('career-sheet')?.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────
// ⚡ CAREER ACTIONS & HUMAN APPROVAL HANDLERS
// ─────────────────────────────────────────────────────────────

async function loadCareerActions() {
  try {
    const res = await fetch('/api/career/actions');
    const json = await res.json();
    const container = document.getElementById('career-actions-container');
    if (!container) return;
    container.innerHTML = '';

    if (!json.success || !json.data || json.data.length === 0) {
      container.innerHTML = '<div style="color: var(--db-gray-text); font-size: 13px; padding: 12px; text-align: center;">Nessuna azione operativa in attesa.</div>';
      return;
    }

    const activeActions = json.data.filter(a => ['SUGGESTED', 'PENDING_APPROVAL', 'APPROVED'].includes(a.status));
    if (activeActions.length === 0) {
      container.innerHTML = '<div style="color: var(--db-gray-text); font-size: 13px; padding: 12px; text-align: center;">Tutte le azioni operative sono state completate o archiviate.</div>';
      return;
    }

    activeActions.slice(0, 5).forEach(act => {
      const isCritical = act.priority === 'CRITICAL';
      const isPending = act.status === 'PENDING_APPROVAL';
      const isApproved = act.status === 'APPROVED';

      const card = document.createElement('div');
      card.style = 'background: rgba(0,0,0,0.3); border: 1px solid var(--db-card-border); border-radius: 8px; padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;';
      
      card.innerHTML = `
        <div style="flex: 1; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${isCritical ? 'rgba(255,69,58,0.2)' : 'rgba(255,159,10,0.2)'}; color: ${isCritical ? '#ff453a' : '#ff9f0a'};">${act.priority}</span>
            <span style="font-weight: 600; font-size: 13px; color: #fff;">${escapeHtml(act.actionType)}</span>
            <span style="font-size: 11px; color: var(--db-gray-text);">[${escapeHtml(act.status)}]</span>
          </div>
          <div style="font-size: 12px; color: var(--db-gray-text); margin-bottom: 4px;">${escapeHtml(act.reason)}</div>
          ${act.scheduledFor ? `<div style="font-size: 11px; color: var(--db-accent-green);"><i data-lucide="clock" style="width: 12px; height: 12px; display: inline;"></i> Schedulato per: ${new Date(act.scheduledFor).toLocaleDateString()}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${isPending ? `
            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px; background: #10b981;" onclick="handleApproveAction(${act.id})">
              Approva
            </button>
            <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; color: #ff453a;" onclick="handleRejectAction(${act.id})">
              Rifiuta
            </button>
          ` : ''}
          ${isApproved ? `
            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="handleExecuteAction(${act.id})">
              Esegui (Handoff)
            </button>
          ` : ''}
          ${act.opportunityId ? `
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="openCareerOpportunityDetail(${act.opportunityId})">
              Dettaglio
            </button>
          ` : ''}
        </div>
      `;
      container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading career actions:', err);
  }
}

async function handleApproveAction(actionId) {
  try {
    const res = await fetch(\`/api/career/actions/\${actionId}/approve\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'USER', notes: 'Approvato manualmente dalla dashboard' })
    });
    const json = await res.json();
    if (json.success) {
      loadCareerActions();
      loadCareerDashboard();
    }
  } catch (err) {
    alert('Errore durante l\\'approvazione dell\\'azione: ' + err.message);
  }
}

async function handleRejectAction(actionId) {
  const reason = prompt('Motivo del rifiuto:');
  if (reason === null) return;

  try {
    const res = await fetch(\`/api/career/actions/\${actionId}/reject\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'USER', reason: reason || 'Rifiutato dall\\'utente' })
    });
    const json = await res.json();
    if (json.success) {
      loadCareerActions();
      loadCareerDashboard();
    }
  } catch (err) {
    alert('Errore durante il rifiuto dell\\'azione: ' + err.message);
  }
}

async function handleExecuteAction(actionId) {
  try {
    const res = await fetch(\`/api/career/actions/\${actionId}/execute\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'USER' })
    });
    const json = await res.json();
    if (json.success) {
      if (json.mode === 'HUMAN_HANDOFF') {
        alert('✅ Pacchetto preparato per l\\'invio manuale:\\n\\n' + (json.payload?.instructions || json.message));
      } else {
        alert('✅ Azione eseguita con successo!');
      }
      loadCareerActions();
      loadCareerDashboard();
    } else {
      alert('❌ Errore esecuzione: ' + json.error);
    }
  } catch (err) {
    alert('Errore esecuzione: ' + err.message);
  }
}


