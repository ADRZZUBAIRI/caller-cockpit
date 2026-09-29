// WebSmitherz Caller & Closer Cockpit Realtime Application Logic

// Default Supabase Demo/Fallback Keys (can be updated via UI modal)
let SUPABASE_URL = localStorage.getItem('ws_supabase_url') || 'https://ntcppyiidwaeohzvvnzx.supabase.co';
let SUPABASE_KEY = localStorage.getItem('ws_supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50Y3BweWlpZHdhZW9oenZ2bnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MTI2MDUsImV4cCI6MjEwNjI4ODYwNX0.hZR-u7R4pOpX3LqJq8gPg_Gsx3v8iBKsWlBdVIwEyvM';
let supabaseClient = null;

// Application State
let currentAgent = localStorage.getItem('ws_active_agent') || 'Asma';
let currentView = 'caller';
let leadsList = [];
let appointmentsList = [];
let selectedLead = null;
let callTimerInterval = null;
let callTimerSeconds = 0;
let isCalling = false;

// Objection Battlecards Catalog
const objectionData = {
  busy: {
    title: "I'm busy / On a job site right now",
    script: `"Totally understand you're in the field, <span class="highlight-var">[Name]</span>. That’s exactly why I called quickly. We generated a 1-Page Forensic Mobile Latency & Map Audit for your company. I want to have our systems engineer, Abdul, review the 2-minute breakdown with you when you're in front of a computer. Is tomorrow at 10 AM or 4 PM better for a quick 10-minute briefing?"`
  },
  send_email: {
    title: "Just send me an email with the information",
    script: `"I'd be happy to send the 1-page PDF audit over, but our engineering team customized it specifically around your mobile phone tap-to-call drop rate. If I just email the raw data, it won't make sense without the live comparison. Let’s do a quick 10-minute screen share with Abdul tomorrow. What email should we send the calendar link to?"`
  },
  have_a_guy: {
    title: "We already have a web guy / marketing agency",
    script: `"Most contractors we work with already have a web designer. The reason they still talk to us is because web designers make sites look pretty on desktop, but they don't optimize mobile load speed on 5G carrier networks. When a homeowner's roof is leaking, if your phone number takes 5 seconds to respond, they call the next guy. We're not asking you to fire your guy; we're just showing you the technical teardown. Fair enough?"`
  },
  cost: {
    title: "How much does this cost? / Is this expensive?",
    script: `"The 1-Page Forensic Audit teardown and the 10-minute briefing with our systems engineer are 100% complimentary. If you decide you want our team to re-engineer your mobile speed and map rankings, we have turnkey setups starting at $500 to $1,500, but let's see if your site actually has the mobile drop bug first. Is tomorrow morning or afternoon better?"`
  },
  not_interested: {
    title: "Not interested / We have enough work",
    script: `"Fair enough, <span class="highlight-var">[Name]</span>. If you're completely booked 6 months out, that's awesome. But if storm season hits or referrals slow down, you don't want to rely on word-of-mouth alone. Can I at least email you the 1-Page Technical Speed Audit so you have it in your back pocket?"`
  }
};

// Initial Demo Seed Data (if Supabase is not connected yet)
const defaultDemoLeads = [
  {
    id: 'demo-1',
    business_name: 'Ogando Roofing & Exteriors',
    contact_name: 'Jenry Ogando',
    phone: '(214) 555-0144',
    email: 'jenrry111@gmail.com',
    website: 'ogandoroofing.com',
    city: 'Dallas',
    state: 'TX',
    status: 'New',
    assigned_caller: 'Asma'
  },
  {
    id: 'demo-2',
    business_name: 'Lone Star Commercial Roofing',
    contact_name: 'Mark Henderson',
    phone: '(817) 555-0823',
    email: 'mark@lonestarproof.com',
    website: 'lonestarproof.com',
    city: 'Fort Worth',
    state: 'TX',
    status: 'New',
    assigned_caller: 'Asma'
  },
  {
    id: 'demo-3',
    business_name: 'Alamo City HVAC & Mechanical',
    contact_name: 'Carlos Mendez',
    phone: '(210) 555-4921',
    email: 'carlos@alamocityhvac.com',
    website: 'alamocityhvac.com',
    city: 'San Antonio',
    state: 'TX',
    status: 'New',
    assigned_caller: 'Asma'
  }
];

let authMode = 'login'; // 'login' or 'signup'
let currentUser = JSON.parse(localStorage.getItem('ws_current_user') || 'null');

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  renderObjection('busy');
  checkUserSession();
  setupRealtimeListeners();
});

// Switch Top Navigation Views
function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.toggle-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

  if (viewName === 'caller') {
    document.getElementById('view-caller-btn').classList.add('active');
    document.getElementById('caller-view').classList.add('active');
  } else if (viewName === 'closer') {
    document.getElementById('view-closer-btn').classList.add('active');
    document.getElementById('closer-view').classList.add('active');
    fetchAppointments();
  } else if (viewName === 'leads') {
    document.getElementById('view-leads-btn').classList.add('active');
    document.getElementById('leads-view').classList.add('active');
    fetchLeads();
  }
}

// Supabase Initialization & State
function initSupabase() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Cloud Connected';
      fetchLeads();
      fetchAppointments();
      return;
    } catch (e) {
      console.warn('Supabase init failed, falling back to local memory store', e);
    }
  }

  // Standalone / Offline Mode
  statusDot.className = 'status-dot disconnected';
  statusText.textContent = 'Demo Mode (Click to Connect)';
  loadLocalOrSeedLeads();
}

function loadLocalOrSeedLeads() {
  const storedLeads = localStorage.getItem('ws_local_leads');
  leadsList = storedLeads ? JSON.parse(storedLeads) : [...defaultDemoLeads];
  
  const storedAppts = localStorage.getItem('ws_local_appointments');
  appointmentsList = storedAppts ? JSON.parse(storedAppts) : [];

  renderQueueList(leadsList);
  renderLeadsTable(leadsList);
  renderAppointments(appointmentsList);
  updateStats();
}

function saveLocalData() {
  localStorage.setItem('ws_local_leads', JSON.stringify(leadsList));
  localStorage.setItem('ws_local_appointments', JSON.stringify(appointmentsList));
  updateStats();
}

// Fetch Leads (Supabase or Local)
async function fetchLeads() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('leads').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        leadsList = data;
        renderQueueList(leadsList);
        renderLeadsTable(leadsList);
        updateStats();
        return;
      }
    } catch (err) {
      console.error('Failed to query Supabase leads:', err);
    }
  }
  loadLocalOrSeedLeads();
}

// Fetch Appointments
async function fetchAppointments() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('appointments').select('*').order('appointment_time', { ascending: true });
      if (!error && data) {
        appointmentsList = data;
        renderAppointments(appointmentsList);
        return;
      }
    } catch (err) {
      console.error('Failed to query Supabase appointments:', err);
    }
  }
  renderAppointments(appointmentsList);
}

// Render Queue List in Caller View
function renderQueueList(leads) {
  const container = document.getElementById('queue-list-container');
  if (!leads || leads.length === 0) {
    container.innerHTML = '<div class="empty-state">No leads in queue. Click "+ Add Lead" or "Import CSV" to start.</div>';
    return;
  }

  container.innerHTML = leads.map(l => `
    <div class="lead-queue-item ${selectedLead && selectedLead.id === l.id ? 'active' : ''}" onclick="selectLeadToCall('${l.id}')">
      <div class="lead-item-biz">${escapeHtml(l.business_name)}</div>
      <div class="lead-item-sub">
        <span>${escapeHtml(l.phone)}</span>
        <span class="lead-status-tag">${escapeHtml(l.status || 'New')}</span>
      </div>
    </div>
  `).join('');

  if (!selectedLead && leads.length > 0) {
    selectLeadToCall(leads[0].id);
  }
}

// Select a Lead to Call and Populate Script & Qualification Form
function selectLeadToCall(leadId) {
  selectedLead = leadsList.find(l => l.id == leadId);
  if (!selectedLead) return;

  // Highlight active lead in queue
  document.querySelectorAll('.lead-queue-item').forEach(el => el.classList.remove('active'));
  renderQueueList(leadsList);

  // Update Active Banner
  document.getElementById('active-biz-name').textContent = selectedLead.business_name;
  document.getElementById('active-biz-phone').textContent = selectedLead.phone || '—';
  document.getElementById('active-biz-contact').textContent = selectedLead.contact_name || 'Owner / Manager';
  document.getElementById('active-biz-city').textContent = (selectedLead.city ? selectedLead.city + ', ' : '') + (selectedLead.state || 'TX');
  
  const cleanPhone = (selectedLead.phone || '').replace(/[^0-9]/g, '');
  document.getElementById('active-biz-tel-link').href = `tel:${cleanPhone}`;

  // Update Dynamic Script Variables
  document.getElementById('var-contact-name').textContent = selectedLead.contact_name ? selectedLead.contact_name.split(' ')[0] : 'there';
  document.getElementById('var-caller-name').textContent = currentAgent;

  // Pre-fill form fields
  document.getElementById('qual-contact-name').value = selectedLead.contact_name || '';
  document.getElementById('qual-contact-phone').value = selectedLead.phone || '';
  document.getElementById('qual-contact-email').value = selectedLead.email || '';

  // Reset Qualification Gate Checkboxes for new lead
  resetGate();
}

// Filter Queue Search
function filterQueue(query) {
  const q = query.toLowerCase();
  const filtered = leadsList.filter(l => 
    (l.business_name && l.business_name.toLowerCase().includes(q)) ||
    (l.phone && l.phone.includes(q)) ||
    (l.contact_name && l.contact_name.toLowerCase().includes(q))
  );
  renderQueueList(filtered);
}

// Call Timer Logic
function toggleCallTimer() {
  const btn = document.getElementById('call-timer-btn');
  const timerDisplay = document.getElementById('call-timer');

  if (!isCalling) {
    isCalling = true;
    btn.textContent = 'End Call';
    btn.classList.add('calling');
    callTimerSeconds = 0;
    callTimerInterval = setInterval(() => {
      callTimerSeconds++;
      const mins = String(Math.floor(callTimerSeconds / 60)).padStart(2, '0');
      const secs = String(callTimerSeconds % 60).padStart(2, '0');
      timerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
    showToast('Call started. Qualification battlecard active.');
  } else {
    isCalling = false;
    btn.textContent = 'Start Call';
    btn.classList.remove('calling');
    clearInterval(callTimerInterval);
    showToast(`Call ended (${timerDisplay.textContent}). Please log disposition or book appointment.`);
  }
}

// Objection Click Handler
function showObjection(key) {
  document.querySelectorAll('.obj-pill').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderObjection(key);
}

function renderObjection(key) {
  const obj = objectionData[key];
  if (!obj) return;
  const contactName = selectedLead && selectedLead.contact_name ? selectedLead.contact_name.split(' ')[0] : 'Sir';
  const scriptText = obj.script.replace(/\[Name\]/g, contactName);
  
  document.getElementById('objection-response-text').innerHTML = `
    <b>Response to "${obj.title}":</b><br>
    ${scriptText}
  `;
}

// Gate Validation (Unlocks Book Appointment button only when all 4 pass)
function validateGate() {
  const g1 = document.getElementById('gate-decision-maker').checked && document.getElementById('qual-contact-name').value.trim().length > 1;
  const g2 = document.getElementById('gate-bottleneck').checked && document.getElementById('qual-bottleneck-select').value !== '';
  const g3 = document.getElementById('gate-capacity').checked && document.getElementById('qual-capacity-select').value !== '';
  const g4 = document.getElementById('gate-deliverable').checked && document.getElementById('qual-contact-email').value.includes('@');
  const apptTime = document.getElementById('qual-appt-datetime').value !== '';

  const passedCount = [g1, g2, g3, g4].filter(Boolean).length;
  const lockStatus = document.getElementById('gate-lock-status');
  const submitBtn = document.getElementById('btn-submit-appointment');

  if (passedCount === 4 && apptTime) {
    lockStatus.className = 'pill-locked pill-unlocked';
    lockStatus.textContent = 'UNLOCKED (4/4 Verified)';
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-disabled');
  } else {
    lockStatus.className = 'pill-locked';
    lockStatus.textContent = `Locked (${passedCount}/4 Verified)`;
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-disabled');
  }
}

function resetGate() {
  document.getElementById('gate-decision-maker').checked = false;
  document.getElementById('gate-bottleneck').checked = false;
  document.getElementById('gate-capacity').checked = false;
  document.getElementById('gate-deliverable').checked = false;
  document.getElementById('qual-bottleneck-select').value = '';
  document.getElementById('qual-capacity-select').value = '';
  document.getElementById('qual-appt-datetime').value = '';
  document.getElementById('qual-call-notes').value = '';
  validateGate();
}

// Book Appointment with 4-Point Dossier
async function handleBookAppointment(e) {
  e.preventDefault();
  if (!selectedLead) {
    alert('Please select a lead first.');
    return;
  }

  const apptData = {
    id: 'appt-' + Date.now(),
    lead_id: selectedLead.id,
    business_name: selectedLead.business_name,
    contact_name: document.getElementById('qual-contact-name').value.trim(),
    phone: document.getElementById('qual-contact-phone').value.trim(),
    email: document.getElementById('qual-contact-email').value.trim(),
    website: selectedLead.website || '',
    decision_maker_confirmed: document.getElementById('gate-decision-maker').checked,
    lead_generation_bottleneck: document.getElementById('qual-bottleneck-select').value,
    monthly_job_capacity: document.getElementById('qual-capacity-select').value,
    agreed_deliverable: '1-Page Forensic Mobile Latency & Map Audit',
    appointment_time: document.getElementById('qual-appt-datetime').value,
    timezone: document.getElementById('qual-appt-tz').value,
    assigned_closer: document.getElementById('qual-assigned-closer').value,
    booked_by_caller: currentAgent,
    call_recording_or_notes: document.getElementById('qual-call-notes').value.trim(),
    status: 'Scheduled',
    created_at: new Date().toISOString()
  };

  // 1. Save to Supabase or Local State
  if (supabaseClient) {
    try {
      const { error: apptErr } = await supabaseClient.from('appointments').insert([apptData]);
      if (apptErr) throw apptErr;

      await supabaseClient.from('leads').update({ status: 'Appointment Booked' }).eq('id', selectedLead.id);
      showToast('Appointment synchronized to Supabase Cloud in real-time!');
    } catch (err) {
      console.error('Supabase write error:', err);
      appointmentsList.unshift(apptData);
      selectedLead.status = 'Appointment Booked';
      saveLocalData();
    }
  } else {
    appointmentsList.unshift(apptData);
    selectedLead.status = 'Appointment Booked';
    saveLocalData();
  }

  showToast(`Appointment locked for ${apptData.assigned_closer}! Dossier generated.`);
  resetGate();
  fetchLeads();
  fetchAppointments();
}

// Quick Disposition for non-bookings
async function quickLogDisposition(disposition) {
  if (!selectedLead) {
    alert('Please select a lead first.');
    return;
  }

  if (supabaseClient) {
    try {
      await supabaseClient.from('leads').update({ status: disposition }).eq('id', selectedLead.id);
      await supabaseClient.from('call_logs').insert([{
        lead_id: selectedLead.id,
        caller_name: currentAgent,
        call_duration_seconds: callTimerSeconds,
        disposition: disposition,
        created_at: new Date().toISOString()
      }]);
    } catch (err) {
      console.error(err);
    }
  }

  selectedLead.status = disposition;
  saveLocalData();
  showToast(`Logged disposition: ${disposition}`);
  fetchLeads();
}

// Render Closer Dossiers Grid
function renderAppointments(appts) {
  const grid = document.getElementById('closer-appointments-grid');
  const countBadge = document.getElementById('pending-appointments-count');
  
  const pending = appts.filter(a => a.status === 'Scheduled' || a.status === 'Confirmed');
  countBadge.textContent = pending.length;

  if (!appts || appts.length === 0) {
    grid.innerHTML = '<div class="empty-state">No appointments booked yet. Completed qualification calls will appear here.</div>';
    return;
  }

  grid.innerHTML = appts.map(a => {
    const apptDate = new Date(a.appointment_time).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });

    return `
      <div class="dossier-card">
        <div class="dossier-top">
          <div>
            <h3 class="font-syne text-sm">${escapeHtml(a.business_name)}</h3>
            <span class="text-xs text-muted">Owner: <b>${escapeHtml(a.contact_name)}</b></span>
          </div>
          <span class="dossier-time-badge">${apptDate} ${escapeHtml(a.timezone || 'EST')}</span>
        </div>

        <div class="dossier-pain-box">
          <span class="text-xs font-mono text-muted block mb-1">AUDITED BOTTLENECK ADMITTED:</span>
          <b>${escapeHtml(a.lead_generation_bottleneck)}</b>
        </div>

        <div class="dossier-metrics-list">
          <span>Phone: <b>${escapeHtml(a.phone)}</b></span>
          <span>Email: <b>${escapeHtml(a.email)}</b></span>
          <span>Capacity Target: <b>${escapeHtml(a.monthly_job_capacity || 'N/A')}</b></span>
          <span>Booked By: <b>${escapeHtml(a.booked_by_caller)}</b> &rarr; Assigned to: <b>${escapeHtml(a.assigned_closer)}</b></span>
          ${a.call_recording_or_notes ? `<span class="mt-1 text-xs">Notes: <i>${escapeHtml(a.call_recording_or_notes)}</i></span>` : ''}
        </div>

        <div class="dossier-footer">
          <span class="lead-status-tag">${escapeHtml(a.status)}</span>
          <button class="btn-sm btn-secondary" onclick="openDossierModal('${a.id}')">Open Call Dossier & Update</button>
        </div>
      </div>
    `;
  }).join('');
}

// Open Closer Dossier & Update Status
function openDossierModal(apptId) {
  const a = appointmentsList.find(item => item.id == apptId);
  if (!a) return;

  const content = document.getElementById('dossier-content');
  content.innerHTML = `
    <div class="dossier-modal-inner">
      <div class="lead-meta-row mb-3">
        <span>Business: <b>${escapeHtml(a.business_name)}</b></span>
        <span>Decision Maker: <b>${escapeHtml(a.contact_name)}</b></span>
        <span>Phone: <b>${escapeHtml(a.phone)}</b></span>
      </div>

      <div class="p-3 bg-obsidian rounded border border-subtle mb-3">
        <h4 class="text-xs text-accent font-mono mb-1">1-PAGE FORENSIC CLOSING ANGLE:</h4>
        <p class="text-sm">"Hi ${escapeHtml(a.contact_name.split(' ')[0])}, this is ${escapeHtml(a.assigned_closer)} from WebSmitherz. Asma scheduled this briefing with you because you mentioned ${escapeHtml(a.lead_generation_bottleneck.toLowerCase())}. I have your mobile site latency and local map audit pulled up right now..."</p>
      </div>

      <div class="form-group mb-3">
        <label>Update Appointment Outcome:</label>
        <select id="closer-outcome-status" class="w-full">
          <option value="Scheduled" ${a.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="Showed / Pitched" ${a.status === 'Showed / Pitched' ? 'selected' : ''}>Showed / Pitched</option>
          <option value="Won / Closed" ${a.status === 'Won / Closed' ? 'selected' : ''}>Won / Closed</option>
          <option value="Rescheduled" ${a.status === 'Rescheduled' ? 'selected' : ''}>Rescheduled</option>
          <option value="No Show / Voicemail" ${a.status === 'No Show / Voicemail' ? 'selected' : ''}>No Show / Voicemail</option>
          <option value="Call Dropped / Hung Up" ${a.status === 'Call Dropped / Hung Up' ? 'selected' : ''}>Call Dropped / Hung Up</option>
          <option value="Lost / Disqualified" ${a.status === 'Lost / Disqualified' ? 'selected' : ''}>Lost / Disqualified</option>
        </select>
      </div>

      <div class="form-group mb-4">
        <label>Closer Debrief Notes:</label>
        <textarea id="closer-notes-input" rows="3" class="w-full" placeholder="Enter post-call notes, proposal value, objections raised...">${escapeHtml(a.closer_notes || '')}</textarea>
      </div>

      <div class="modal-footer">
        <button class="btn-ghost" onclick="closeDossierModal()">Close</button>
        <button class="btn-primary" onclick="saveCloserOutcome('${a.id}')">Save & Update Status</button>
      </div>
    </div>
  `;

  document.getElementById('dossier-modal').classList.add('active');
}

async function saveCloserOutcome(apptId) {
  const newStatus = document.getElementById('closer-outcome-status').value;
  const notes = document.getElementById('closer-notes-input').value.trim();

  const a = appointmentsList.find(item => item.id == apptId);
  if (a) {
    a.status = newStatus;
    a.closer_notes = notes;
  }

  if (supabaseClient) {
    try {
      await supabaseClient.from('appointments').update({
        status: newStatus,
        closer_notes: notes,
        updated_at: new Date().toISOString()
      }).eq('id', apptId);
    } catch (err) {
      console.error(err);
    }
  }

  saveLocalData();
  closeDossierModal();
  renderAppointments(appointmentsList);
  showToast('Closer outcome updated.');
}

// Render Leads Table
function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-body');
  if (!leads || leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6">No leads found. Click "+ Add Single Lead" or "Import CSV".</td></tr>';
    return;
  }

  tbody.innerHTML = leads.map(l => `
    <tr>
      <td><b>${escapeHtml(l.business_name)}</b></td>
      <td>${escapeHtml(l.contact_name || '—')}</td>
      <td><a href="tel:${escapeHtml(l.phone)}" class="text-accent">${escapeHtml(l.phone)}</a></td>
      <td>${escapeHtml((l.city ? l.city + ', ' : '') + (l.state || ''))}</td>
      <td><span class="lead-status-tag">${escapeHtml(l.status || 'New')}</span></td>
      <td>${escapeHtml(l.assigned_caller || 'Asma')}</td>
      <td>
        <button class="btn-sm btn-ghost" onclick="switchView('caller'); selectLeadToCall('${l.id}')">Call in Studio</button>
      </td>
    </tr>
  `).join('');
}

// CSV Lead Import
function openCsvImportModal() { document.getElementById('csv-modal').classList.add('active'); }
function closeCsvModal() { document.getElementById('csv-modal').classList.remove('active'); }

function processCsvUpload() {
  const fileInput = document.getElementById('csv-file-input');
  if (!fileInput.files.length) {
    alert('Please select a CSV file first.');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const rows = text.split(/\r?\n/).filter(r => r.trim().length > 0);
    if (rows.length <= 1) {
      alert('CSV file is empty or has no data rows.');
      return;
    }

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const newLeads = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length >= 2) {
        newLeads.push({
          id: 'lead-csv-' + Date.now() + '-' + i,
          business_name: cols[0] || 'Unknown Contractor',
          phone: cols[1] || '',
          contact_name: cols[2] || '',
          website: cols[3] || '',
          city: cols[4] || '',
          state: cols[5] || 'TX',
          status: 'New',
          assigned_caller: currentAgent,
          created_at: new Date().toISOString()
        });
      }
    }

    if (supabaseClient && newLeads.length > 0) {
      try {
        const cleanPayload = newLeads.map(({ id, ...rest }) => rest);
        await supabaseClient.from('leads').insert(cleanPayload);
        showToast(`Successfully uploaded ${newLeads.length} leads to Supabase!`);
      } catch (err) {
        console.error('CSV cloud insert error:', err);
      }
    }

    leadsList = [...newLeads, ...leadsList];
    saveLocalData();
    closeCsvModal();
    fetchLeads();
    showToast(`Imported ${newLeads.length} leads into calling pipeline.`);
  };
  reader.readAsText(file);
}

// Add Single Lead Modal
function openAddLeadModal() { document.getElementById('add-lead-modal').classList.add('active'); }
function closeAddLeadModal() { document.getElementById('add-lead-modal').classList.remove('active'); }

async function handleCreateLead(e) {
  e.preventDefault();
  const newLead = {
    id: 'lead-' + Date.now(),
    business_name: document.getElementById('new-lead-biz').value.trim(),
    contact_name: document.getElementById('new-lead-contact').value.trim(),
    phone: document.getElementById('new-lead-phone').value.trim(),
    website: document.getElementById('new-lead-web').value.trim(),
    city: document.getElementById('new-lead-city').value.trim(),
    state: document.getElementById('new-lead-state').value.trim() || 'TX',
    status: 'New',
    assigned_caller: currentAgent,
    created_at: new Date().toISOString()
  };

  if (supabaseClient) {
    try {
      const { id, ...clean } = newLead;
      await supabaseClient.from('leads').insert([clean]);
    } catch (err) {
      console.error(err);
    }
  }

  leadsList.unshift(newLead);
  saveLocalData();
  closeAddLeadModal();
  fetchLeads();
  selectLeadToCall(newLead.id);
  showToast('Lead added to calling queue.');
}

// Config Modal for Supabase Keys
function openConfigModal() {
  document.getElementById('cfg-supabase-url').value = SUPABASE_URL;
  document.getElementById('cfg-supabase-key').value = SUPABASE_KEY;
  document.getElementById('config-modal').classList.add('active');
}
function closeConfigModal() { document.getElementById('config-modal').classList.remove('active'); }
function closeDossierModal() { document.getElementById('dossier-modal').classList.remove('active'); }

function saveSupabaseConfig(e) {
  e.preventDefault();
  SUPABASE_URL = document.getElementById('cfg-supabase-url').value.trim();
  SUPABASE_KEY = document.getElementById('cfg-supabase-key').value.trim();
  localStorage.setItem('ws_supabase_url', SUPABASE_URL);
  localStorage.setItem('ws_supabase_key', SUPABASE_KEY);
  closeConfigModal();
  initSupabase();
  showToast('Supabase connection settings saved!');
}

function changeActiveAgent(agentName) {
  currentAgent = agentName;
  localStorage.setItem('ws_active_agent', agentName);
  document.getElementById('var-caller-name').textContent = agentName;
  showToast(`Active agent switched to ${agentName}`);
}

function updateStats() {
  const callsToday = appointmentsList.length + leadsList.filter(l => l.status !== 'New').length;
  const qualified = appointmentsList.length + leadsList.filter(l => l.status === 'Qualified').length;
  const booked = appointmentsList.length;

  document.getElementById('stat-dials').textContent = callsToday;
  document.getElementById('stat-qualified').textContent = qualified;
  document.getElementById('stat-booked').textContent = booked;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function setupRealtimeListeners() {
  if (supabaseClient) {
    supabaseClient
      .channel('public:appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchAppointments();
      })
      .subscribe();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================================
// CALLER & TEAM AUTHENTICATION MODULE
// ========================================================
function checkUserSession() {
  const loggedOutBox = document.getElementById('auth-logged-out-box');
  const loggedInBox = document.getElementById('auth-logged-in-box');
  const nameDisplay = document.getElementById('user-display-name');
  const roleDisplay = document.getElementById('user-display-role');

  if (currentUser && currentUser.email) {
    loggedOutBox.style.display = 'none';
    loggedInBox.style.display = 'flex';
    nameDisplay.textContent = currentUser.name || currentUser.email.split('@')[0];
    roleDisplay.textContent = currentUser.role || 'caller';
    currentAgent = currentUser.name || currentUser.email.split('@')[0];
    document.getElementById('var-caller-name').textContent = currentAgent;
  } else {
    loggedOutBox.style.display = 'flex';
    loggedInBox.style.display = 'none';
    currentAgent = 'Asma';
    document.getElementById('var-caller-name').textContent = 'Asma';
  }
}

function openAuthModal(mode) {
  authMode = mode || 'login';
  const modal = document.getElementById('auth-modal');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleBtn = document.getElementById('auth-toggle-mode-btn');
  const nameField = document.getElementById('auth-name-field');
  const roleField = document.getElementById('auth-role-field');

  if (authMode === 'signup') {
    title.textContent = 'Create Caller Account';
    sub.textContent = 'Register your account to log calls and track your appointment stats.';
    submitBtn.textContent = 'Register & Start Calling';
    toggleBtn.textContent = 'Already have an account? Sign In';
    nameField.style.display = 'block';
    roleField.style.display = 'block';
    document.getElementById('auth-name').required = true;
  } else {
    title.textContent = 'Caller Portal Sign In';
    sub.textContent = 'Sign in to log all your calls, claims, and appointments in real-time.';
    submitBtn.textContent = 'Sign In to Cockpit';
    toggleBtn.textContent = "Don't have an account? Create one";
    nameField.style.display = 'none';
    roleField.style.display = 'none';
    document.getElementById('auth-name').required = false;
  }

  modal.classList.add('active');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
}

function toggleAuthMode() {
  openAuthModal(authMode === 'login' ? 'signup' : 'login');
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const role = document.getElementById('auth-role').value;

  if (authMode === 'signup') {
    if (!name) {
      alert('Please enter your full name.');
      return;
    }

    if (supabaseClient) {
      try {
        const { data: authData, error: authErr } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name, role: role } }
        });

        if (authErr) throw authErr;

        // Save in team_members table
        await supabaseClient.from('team_members').insert([{
          name: name,
          email: email,
          role: role,
          is_active: true
        }]);

        currentUser = { name, email, role, id: authData.user ? authData.user.id : 'user-' + Date.now() };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Welcome ${name}! Account created and connected.`);
      } catch (err) {
        console.warn('Supabase Auth warning:', err);
        // Fallback local team account creation
        currentUser = { name, email, role, id: 'user-' + Date.now() };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Account created for ${name}!`);
      }
    } else {
      currentUser = { name, email, role, id: 'user-' + Date.now() };
      localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
      showToast(`Account created for ${name}!`);
    }
  } else {
    // Sign In
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) throw error;

        // Fetch team profile
        const { data: teamProfile } = await supabaseClient.from('team_members').select('*').eq('email', email).single();
        const userName = teamProfile ? teamProfile.name : (data.user.user_metadata?.full_name || email.split('@')[0]);
        const userRole = teamProfile ? teamProfile.role : (data.user.user_metadata?.role || 'caller');

        currentUser = { name: userName, email: email, role: userRole, id: data.user.id };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Welcome back, ${userName}!`);
      } catch (err) {
        console.warn('Sign in fallback:', err);
        const nameGuess = email.split('@')[0];
        currentUser = { name: nameGuess.charAt(0).toUpperCase() + nameGuess.slice(1), email: email, role: 'caller', id: 'user-' + Date.now() };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Signed in as ${currentUser.name}!`);
      }
    } else {
      const nameGuess = email.split('@')[0];
      currentUser = { name: nameGuess.charAt(0).toUpperCase() + nameGuess.slice(1), email: email, role: 'caller', id: 'user-' + Date.now() };
      localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
      showToast(`Signed in as ${currentUser.name}!`);
    }
  }

  closeAuthModal();
  checkUserSession();
}

function handleSignOut() {
  if (supabaseClient) {
    supabaseClient.auth.signOut().catch(console.error);
  }
  currentUser = null;
  localStorage.removeItem('ws_current_user');
  checkUserSession();
  showToast('You have been signed out.');
}
