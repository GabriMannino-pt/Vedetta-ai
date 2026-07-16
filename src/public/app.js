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
    settings: 'Settings'
  };
  document.getElementById('page-title').innerText = titles[viewName] || 'Dashboard';

  // Rinfresca i dati
  refreshLeads();
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
