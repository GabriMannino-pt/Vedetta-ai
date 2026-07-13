let allLeads = [];
let currentLead = null;

// Inizializza l'applicazione al caricamento
document.addEventListener('DOMContentLoaded', () => {
  refreshLeads();
});

// Cambia visualizzazione tra Kanban e Lista
function switchView(viewName) {
  document.querySelectorAll('.dashboard-view').forEach(view => {
    view.classList.remove('active');
  });
  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.getElementById(`view-${viewName}`).classList.add('active');
  // Trova il pulsante corrispondente e lo evidenzia
  const activeBtn = Array.from(document.querySelectorAll('.segment-btn'))
    .find(btn => btn.innerText.toLowerCase().includes(viewName === 'kanban' ? 'kanban' : 'tutti'));
  if (activeBtn) activeBtn.classList.add('active');
}

// Recupera i lead dal server e aggiorna l'interfaccia
async function refreshLeads() {
  try {
    const res = await fetch('/api/leads');
    if (!res.ok) throw new Error('Impossibile recuperare i lead');
    
    allLeads = await res.json();
    
    buildKanbanBoard();
    buildListView();
    
    // Inizializza le icone Lucide dopo aver caricato il DOM dinamico
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('❌ Errore refresh leads:', err.message);
  }
}

// Costruisce la Kanban Board
function buildKanbanBoard() {
  const columns = ['nuovo', 'contattato', 'in_trattativa', 'preventivo_inviato', 'chiuso_vinto'];
  
  // Svuota le colonne e azzera i conteggi
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
    document.getElementById(`count-${col}`).innerText = '0';
  });

  // Raggruppa i lead per colonna
  allLeads.forEach(lead => {
    // Gestione stati di fallback
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
  card.className = 'lead-card';
  card.draggable = true;
  card.setAttribute('ondragstart', `handleDragStart(event, ${lead.id})`);
  card.onclick = () => openLeadSheet(lead.id);

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
      <span class="card-source">${lead.fonte.toUpperCase()}</span>
    </div>
  `;
  return card;
}

// Funzioni Drag and Drop
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

  // Ottimizzazione ottimistica dell'interfaccia
  const lead = allLeads.find(l => l.id === id);
  if (lead) {
    lead.pipeline_status = newStatus;
    buildKanbanBoard();
  }

  // Aggiorna lo stato sul server
  try {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status: newStatus })
    });
    if (!res.ok) throw new Error("Errore nell'aggiornamento dello stato");
  } catch (err) {
    console.error('❌ Errore drop:', err.message);
    refreshLeads(); // Ricarica in caso di errore per ripristinare lo stato reale
  }
}

// Costruisce la List View
function buildListView() {
  const tbody = document.getElementById('list-table-body');
  tbody.innerHTML = '';
  filterList();
}

// Filtra la lista dei lead
function filterList() {
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  const statusFilter = document.getElementById('filter-status').value;
  const tbody = document.getElementById('list-table-body');
  tbody.innerHTML = '';

  const filtered = allLeads.filter(lead => {
    const status = lead.pipeline_status || 'nuovo';
    const matchesSearch = 
      lead.titolo.toLowerCase().includes(searchQuery) ||
      (lead.settore && lead.settore.toLowerCase().includes(searchQuery)) ||
      lead.testo.toLowerCase().includes(searchQuery);
    
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  filtered.forEach(lead => {
    const tr = document.createElement('tr');
    
    let scoreClass = 'score-low';
    if (lead.punteggio_intent >= 8) scoreClass = 'score-high';
    else if (lead.punteggio_intent >= 5) scoreClass = 'score-mid';

    const dateStr = new Date(lead.data_trovato).toLocaleDateString('it-IT');

    tr.innerHTML = `
      <td><span class="score-badge ${scoreClass}">${lead.punteggio_intent}/10</span></td>
      <td style="font-weight:600; max-width: 300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(lead.titolo)}</td>
      <td>${escapeHtml(lead.settore || 'Generico')}</td>
      <td><strong>${lead.fonte.toUpperCase()}</strong></td>
      <td>${dateStr}</td>
      <td><span style="text-transform: capitalize;">${(lead.pipeline_status || 'nuovo').replace('_', ' ')}</span></td>
      <td><button class="btn-table-action" onclick="openLeadSheet(${lead.id})">Apri</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Apri la scheda del Lead
function openLeadSheet(id) {
  const lead = allLeads.find(l => l.id === id);
  if (!lead) return;
  
  currentLead = lead;

  // Popola i dati nella scheda
  document.getElementById('sheet-title').innerText = lead.titolo;
  document.getElementById('info-fonte').innerText = lead.fonte.toUpperCase();
  document.getElementById('info-score').innerText = `${lead.punteggio_intent}/10`;
  document.getElementById('info-settore').innerText = lead.settore || 'Generico';
  document.getElementById('info-budget').innerText = lead.evidenza_budget_dettaglio || 'Nessun budget esplicito';
  document.getElementById('info-urgenza').innerText = lead.urgenza || 'Media';
  document.getElementById('info-link').href = lead.url;
  
  document.getElementById('info-testo').innerText = lead.testo;
  document.getElementById('info-soluzione').innerText = lead.soluzione_proposta || 'Nessuna soluzione generata.';
  document.getElementById('notes-textarea').value = lead.notes || '';
  
  document.getElementById('sheet-status-select').value = lead.pipeline_status || 'nuovo';
  document.getElementById('client-email-input').value = lead.client_email || '';

  // Popola la bozza risposta
  document.getElementById('info-bozza').innerText = lead.bozza_risposta;

  // Popola la sezione email
  document.getElementById('email-to').value = lead.client_email || '';
  
  // Popola il corpo email con la bozza
  document.getElementById('email-body').value = `Ciao,\n\n${lead.bozza_risposta}\n\nCordiali saluti,\n[Il tuo nome]`;
  
  // Resetta i messaggi di stato email
  const statusMsg = document.getElementById('email-status');
  statusMsg.className = 'status-msg';
  statusMsg.innerText = '';

  // Mostra la scheda
  document.getElementById('lead-sheet-overlay').classList.add('active');
  document.getElementById('lead-sheet').classList.add('active');

  // Aggiorna le icone Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Chiudi la scheda del Lead
function closeLeadSheet() {
  document.getElementById('lead-sheet-overlay').classList.remove('active');
  document.getElementById('lead-sheet').classList.remove('active');
  currentLead = null;
  refreshLeads();
}

// Modifica lo stato del lead dalla scheda dettagliata
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
  document.getElementById('email-to').value = email;

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
  const draftText = document.getElementById('info-bozza').innerText;
  navigator.clipboard.writeText(draftText).then(() => {
    alert('Bozza risposta copiata negli appunti!');
  }).catch(err => {
    console.error('❌ Impossibile copiare il testo:', err);
  });
}

// Invia l'email tramite Gmail SMTP
async function sendGmailEmail() {
  const to = document.getElementById('email-to').value;
  const subject = document.getElementById('email-subject').value;
  const body = document.getElementById('email-body').value;
  const statusMsg = document.getElementById('email-status');

  if (!to) {
    statusMsg.className = 'status-msg error';
    statusMsg.innerText = 'Inserisci prima l\'email del cliente nel campo sopra.';
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
    
    // Sposta in automatico il lead in "Preventivo Inviato" se era in uno stato precedente
    const statusSelect = document.getElementById('sheet-status-select');
    if (statusSelect.value === 'nuovo' || statusSelect.value === 'contattato' || statusSelect.value === 'in_trattativa') {
      statusSelect.value = 'preventivo_inviato';
      changeLeadStatusFromSheet();
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
