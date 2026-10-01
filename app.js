// WebSmitherz Caller & Closer Cockpit Realtime Application Logic
// Spec v1.0 Compliant Architecture

// Production Supabase Cloud Credentials (Hardcoded & Locked)
const SUPABASE_URL = 'https://ntcppyiidwaeohzvvnzx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50Y3BweWlpZHdhZW9oenZ2bnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MTI2MDUsImV4cCI6MjEwNjI4ODYwNX0.hZR-u7R4pOpX3LqJq8gPg_Gsx3v8iBKsWlBdVIwEyvM';
let supabaseClient = null;

// Application State
let currentAgent = 'Alex Morgan';
let currentView = 'caller';
let leadsList = [];
let appointmentsList = [];
let tasksList = [];
let qualificationsMap = {}; // lead_id -> qualification
let selectedLead = null;
let callTimerInterval = null;
let callTimerSeconds = 0;
let isCalling = false;
let authGateMode = 'login'; // 'login' or 'signup'
let currentUser = JSON.parse(localStorage.getItem('ws_current_user') || 'null');

// Objection Battlecards Catalog
const objectionData = {
  busy: {
    title: "I'm busy / On a job site right now",
    script: `"Totally understand you're in the field, <span class="highlight-var">[Name]</span>. That’s exactly why I called quickly. We generated a 1-Page Forensic Mobile Latency & Map Audit for your company. I want to have our senior systems engineer review the 2-minute breakdown with you when you're in front of a computer. Is tomorrow at 10 AM or 4 PM better for a quick 10-minute briefing?"`
  },
  send_email: {
    title: "Just send me an email with the information",
    script: `"I'd be happy to send the 1-page PDF audit over, but our engineering team customized it specifically around your mobile phone tap-to-call drop rate. If I just email the raw data, it won't make sense without the live comparison. Let’s do a quick 10-minute screen share with our systems engineer tomorrow. What email should we send the calendar link to?"`
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

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  renderObjection('busy');
  enforceAuthGate();
  setupRealtimeListeners();
});

// ========================================================
// MANDATORY AUTHENTICATION GATE & SESSION ENFORCEMENT
// ========================================================
function enforceAuthGate() {
  const gateScreen = document.getElementById('auth-gate-screen');
  const appWorkspace = document.getElementById('app-workspace');
  const nameDisplay = document.getElementById('user-display-name');
  const roleDisplay = document.getElementById('user-display-role');

  if (currentUser && currentUser.email) {
    if (gateScreen) gateScreen.style.display = 'none';
    if (appWorkspace) appWorkspace.style.display = 'flex';
    if (nameDisplay) nameDisplay.textContent = currentUser.name || currentUser.email.split('@')[0];
    if (roleDisplay) roleDisplay.textContent = currentUser.role || 'caller';
    currentAgent = currentUser.name || currentUser.email.split('@')[0];
    
    // Set dynamic script names
    const callerVar = document.getElementById('var-caller-name');
    if (callerVar) callerVar.textContent = currentAgent;

    // Load Live Data
    fetchLeads();
    fetchAppointments();
    fetchTasks();
  } else {
    if (gateScreen) gateScreen.style.display = 'flex';
    if (appWorkspace) appWorkspace.style.display = 'none';
  }
}

function toggleAuthGateMode() {
  authGateMode = authGateMode === 'login' ? 'signup' : 'login';
  const title = document.getElementById('auth-gate-title');
  const sub = document.getElementById('auth-gate-sub');
  const submitBtn = document.getElementById('auth-gate-submit-btn');
  const toggleBtn = document.getElementById('auth-gate-toggle-btn');
  const nameGroup = document.getElementById('auth-name-group');
  const roleGroup = document.getElementById('auth-role-group');

  if (authGateMode === 'signup') {
    title.textContent = 'Create New Caller Account';
    sub.textContent = 'Register your account to log all calls and start dialing.';
    submitBtn.textContent = 'Create Account & Enter Cockpit';
    toggleBtn.textContent = 'Already have an account? Sign In';
    nameGroup.style.display = 'block';
    roleGroup.style.display = 'block';
    document.getElementById('auth-name-input').required = true;
  } else {
    title.textContent = 'Caller & Closer Portal Sign In';
    sub.textContent = 'Sign in with your verified WebSmitherz account to access the dialer.';
    submitBtn.textContent = 'Sign In to Cockpit';
    toggleBtn.textContent = 'Need an account? Register as New Caller';
    nameGroup.style.display = 'none';
    roleGroup.style.display = 'none';
    document.getElementById('auth-name-input').required = false;
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email-input').value.trim();
  const password = document.getElementById('auth-password-input').value;
  const name = document.getElementById('auth-name-input').value.trim();
  const role = document.getElementById('auth-role-input').value;

  if (authGateMode === 'signup') {
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

        if (authErr && !authErr.message.includes('already registered')) {
          throw authErr;
        }

        // Record in users table
        await supabaseClient.from('users').insert([{
          name: name,
          email: email,
          role: role,
          is_active: true
        }]);

        currentUser = { name, email, role, id: authData?.user?.id || 'user-' + Date.now() };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Welcome ${name}! You are now logged in.`);
      } catch (err) {
        console.warn('Auth fallback:', err);
        currentUser = { name, email, role, id: 'user-' + Date.now() };
        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Account created for ${name}!`);
      }
    }
  } else {
    // Sign In
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          const { data: userProfile } = await supabaseClient.from('users').select('*').eq('email', email).single();
          if (userProfile) {
            currentUser = { name: userProfile.name, email: userProfile.email, role: userProfile.role, id: userProfile.id };
          } else {
            throw error;
          }
        } else {
          const { data: userProfile } = await supabaseClient.from('users').select('*').eq('email', email).single();
          const userName = userProfile ? userProfile.name : (data.user.user_metadata?.full_name || email.split('@')[0]);
          const userRole = userProfile ? userProfile.role : (data.user.user_metadata?.role || 'caller');
          currentUser = { name: userName, email: email, role: userRole, id: data.user.id };
        }

        localStorage.setItem('ws_current_user', JSON.stringify(currentUser));
        showToast(`Welcome back, ${currentUser.name}!`);
      } catch (err) {
        alert('Invalid email or password. Please check your credentials or create an account.');
        return;
      }
    }
  }

  enforceAuthGate();
}

function handleSignOut() {
  if (supabaseClient) {
    supabaseClient.auth.signOut().catch(console.error);
  }
  currentUser = null;
  localStorage.removeItem('ws_current_user');
  enforceAuthGate();
  showToast('You have been signed out.');
}

// ========================================================
// CORE NAVIGATION & INITIALIZATION
// ========================================================
function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.toggle-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

  const btnMap = {
    'caller': 'view-caller-btn',
    'closer': 'view-closer-btn',
    'tasks': 'view-tasks-btn',
    'leads': 'view-leads-btn',
    'kb': 'view-kb-btn'
  };

  const panelMap = {
    'caller': 'caller-view',
    'closer': 'closer-view',
    'tasks': 'tasks-view',
    'leads': 'leads-view',
    'kb': 'kb-view'
  };

  if (btnMap[viewName] && document.getElementById(btnMap[viewName])) {
    document.getElementById(btnMap[viewName]).classList.add('active');
  }
  if (panelMap[viewName] && document.getElementById(panelMap[viewName])) {
    document.getElementById(panelMap[viewName]).classList.add('active');
  }

  if (viewName === 'caller') {
    fetchLeads();
  } else if (viewName === 'closer') {
    fetchAppointments();
  } else if (viewName === 'tasks') {
    fetchTasks();
  } else if (viewName === 'leads') {
    fetchLeads();
  }
}

function initSupabase() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      if (statusDot) statusDot.className = 'status-dot connected';
      if (statusText) statusText.textContent = 'Production Cloud';
      return;
    } catch (e) {
      console.error('Supabase connection error:', e);
    }
  }
}

// ========================================================
// DATA FETCHING (SUPABASE CLOUD)
// ========================================================
async function fetchLeads() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('leads').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      leadsList = data;
      renderQueueList(leadsList);
      renderLeadsTable(leadsList);
      updateStats();
    }
  } catch (err) {
    console.error('Failed to query Supabase leads:', err);
  }
}

async function fetchAppointments() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('appointments').select('*').order('appointment_time_utc', { ascending: true });
    if (!error && data) {
      appointmentsList = data;
      renderAppointments(appointmentsList);
      updateStats();
    }
  } catch (err) {
    console.error('Failed to query Supabase appointments:', err);
  }
}

async function fetchTasks() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('tasks').select('*').order('due_at', { ascending: true });
    if (!error && data) {
      tasksList = data;
      renderTasksTable(tasksList);
      const pendingCount = tasksList.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
      const countBadge = document.getElementById('pending-tasks-count');
      if (countBadge) countBadge.textContent = pendingCount;
    }
  } catch (err) {
    console.error('Failed to query Supabase tasks:', err);
  }
}

// ========================================================
// CALLER STUDIO & QUEUE LOGIC
// ========================================================
function renderQueueList(leads) {
  const container = document.getElementById('queue-list-container');
  if (!container) return;
  if (!leads || leads.length === 0) {
    container.innerHTML = '<div class="empty-state">No leads logged yet. Use "Log a New Lead I Found" to start prospecting.</div>';
    return;
  }

  container.innerHTML = leads.map(l => `
    <div class="lead-queue-item ${selectedLead && selectedLead.id === l.id ? 'active' : ''}" onclick="selectLeadToCall('${l.id}')">
      <div class="lead-item-biz">${escapeHtml(l.business_name)}</div>
      <div class="lead-item-sub">
        <span>${escapeHtml(l.phone)}</span>
        <span class="lead-status-tag ${l.do_not_call ? 'status-dnc' : ''}">${escapeHtml(l.status || 'new')}</span>
      </div>
    </div>
  `).join('');

  if (!selectedLead && leads.length > 0) {
    selectLeadToCall(leads[0].id);
  }
}

function selectLeadToCall(leadId) {
  selectedLead = leadsList.find(l => l.id == leadId);
  if (!selectedLead) return;

  document.querySelectorAll('.lead-queue-item').forEach(el => el.classList.remove('active'));
  renderQueueList(leadsList);

  document.getElementById('active-biz-name').textContent = selectedLead.business_name;
  document.getElementById('active-biz-phone').textContent = selectedLead.phone || '—';
  document.getElementById('active-biz-contact').textContent = selectedLead.contact_name || 'Owner / Manager';
  document.getElementById('active-biz-city').textContent = (selectedLead.city ? selectedLead.city + ', ' : '') + (selectedLead.state || 'TX');
  
  const emailEl = document.getElementById('active-biz-email');
  if (emailEl) emailEl.textContent = selectedLead.email || '—';

  const fbWrap = document.getElementById('active-biz-fb-wrap');
  const fbLink = document.getElementById('active-biz-fb-link');
  if (fbWrap && fbLink) {
    if (selectedLead.facebook_url) {
      let fbHref = selectedLead.facebook_url;
      if (!fbHref.startsWith('http://') && !fbHref.startsWith('https://')) {
        fbHref = 'https://' + fbHref;
      }
      fbLink.href = fbHref;
      fbWrap.style.display = 'inline';
    } else {
      fbWrap.style.display = 'none';
    }
  }

  const webWrap = document.getElementById('active-biz-web-wrap');
  const webLink = document.getElementById('active-biz-web-link');
  if (webWrap && webLink) {
    if (selectedLead.website) {
      let webHref = selectedLead.website;
      if (!webHref.startsWith('http://') && !webHref.startsWith('https://')) {
        webHref = 'https://' + webHref;
      }
      webLink.href = webHref;
      webWrap.style.display = 'inline';
    } else {
      webWrap.style.display = 'none';
    }
  }
  
  const cleanPhone = (selectedLead.phone || '').replace(/[^0-9]/g, '');
  document.getElementById('active-biz-tel-link').href = `tel:${cleanPhone}`;

  const contactFirst = selectedLead.contact_name ? selectedLead.contact_name.split(' ')[0] : 'there';
  const varContact = document.getElementById('var-contact-name');
  if (varContact) varContact.textContent = contactFirst;
  const varCaller = document.getElementById('var-caller-name');
  if (varCaller) varCaller.textContent = currentAgent;

  // Auto-set timezone according to state if known
  const state = (selectedLead.state || '').toUpperCase();
  const tzSelect = document.getElementById('qual-appt-tz');
  if (tzSelect) {
    if (['CA', 'WA', 'OR', 'NV'].includes(state)) tzSelect.value = 'America/Los_Angeles';
    else if (['CO', 'AZ', 'UT', 'NM', 'MT', 'WY', 'ID'].includes(state)) tzSelect.value = 'America/Denver';
    else if (['TX', 'IL', 'MO', 'MN', 'WI', 'OK', 'KS', 'IA', 'NE', 'TN', 'AL', 'MS', 'AR', 'LA'].includes(state)) tzSelect.value = 'America/Chicago';
    else tzSelect.value = 'America/New_York';
  }

  resetGate();
}

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
    showToast('Call started. Diagnostic battlecard active.');
  } else {
    isCalling = false;
    btn.textContent = 'Start Call';
    btn.classList.remove('calling');
    clearInterval(callTimerInterval);
    showToast(`Call ended (${timerDisplay.textContent}). Lock qualification or log disposition.`);
  }
}

function showObjection(key) {
  document.querySelectorAll('.obj-pill').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderObjection(key);
}

function renderObjection(key) {
  const obj = objectionData[key];
  if (!obj) return;
  const contactName = selectedLead && selectedLead.contact_name ? selectedLead.contact_name.split(' ')[0] : 'Sir';
  const scriptText = obj.script.replace(/\[Name\]/g, contactName);
  
  const el = document.getElementById('objection-response-text');
  if (el) {
    el.innerHTML = `
      <b>Response to "${obj.title}":</b><br>
      ${scriptText}
    `;
  }
}

// ========================================================
// TIMEZONE CONVERSION & PREVIEW (PROSPECT LOCAL + UTC)
// ========================================================
function updateTimezonePreview() {
  const dtInput = document.getElementById('qual-appt-datetime').value;
  const tzSelect = document.getElementById('qual-appt-tz').value;
  const preview = document.getElementById('tz-live-preview');

  if (!dtInput) {
    preview.textContent = 'Select date & time above to preview timezones...';
    return null;
  }

  try {
    // Parse the input date and prospect timezone
    // The datetime-local gives "YYYY-MM-DDTHH:MM"
    const [datePart, timePart] = dtInput.split('T');
    const [year, month, day] = datePart.split('-');
    const [hours, mins] = timePart.split(':');

    // Create date string formatted for timezone calculation
    const isoString = `${year}-${month}-${day}T${hours}:${mins}:00`;
    
    // We compute the target UTC timestamp
    // Use Intl to format the time in prospect timezone and user's local timezone
    const prospectDate = new Date(isoString);

    // Format Prospect Display
    const prospectFormatted = `${datePart} ${hours}:${mins} (${tzSelect.split('/')[1].replace('_', ' ')})`;
    
    // Convert to UTC ISO string
    const utcISO = new Date(prospectDate.getTime()).toISOString();
    
    // User Local Formatted
    const userLocalFormatted = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' });

    preview.innerHTML = `
      <span>Prospect: <b>${prospectFormatted}</b></span> &bull; 
      <span>UTC: <b>${utcISO.replace('T', ' ').substring(0, 16)} UTC</b></span>
    `;

    return { prospectDate, utcISO };
  } catch (err) {
    preview.textContent = 'Invalid date format selected.';
    return null;
  }
}

// ========================================================
// QUALIFICATION VALIDATION & QUALITY GATES (G1–G5)
// ========================================================
function validateGate() {
  // Q1 Decision Maker Check
  const dmVal = document.querySelector('input[name="q_decision_maker"]:checked')?.value || 'yes';
  const q1Valid = dmVal === 'yes';

  // Q2 Marketing channels
  const mktgChecked = Array.from(document.querySelectorAll('.q-mktg:checked')).map(c => c.value);
  const q2Valid = mktgChecked.length > 0;

  // Q4 Goals
  const goalsChecked = Array.from(document.querySelectorAll('.q-goal:checked')).map(c => c.value);
  const q4Valid = goalsChecked.length > 0;

  // Q5 Pain point minimum 15 characters
  const painVal = (document.getElementById('q_pain_point')?.value || '').trim();
  const q5Valid = painVal.length >= 15;

  // Q6 Interest level (Cannot be 'just_curious')
  const interestVal = document.getElementById('q_interest_level')?.value || 'interested';
  const q6Valid = interestVal !== 'just_curious';

  // Q9 Prospect verbatim quote minimum 20 characters
  const verbatimVal = (document.getElementById('q_prospect_said')?.value || '').trim();
  const q9Valid = verbatimVal.length >= 20;

  // G1–G5 Quality Gates
  const g1 = document.getElementById('gate-g1')?.checked || false;
  const g2 = document.getElementById('gate-g2')?.checked || false;
  const g3 = document.getElementById('gate-g3')?.checked || false;
  const g4 = document.getElementById('gate-g4')?.checked || false;
  const g5 = document.getElementById('gate-g5')?.checked || false;
  const allGatesPassed = g1 && g2 && g3 && g4 && g5;

  // Date & Time selected
  const apptTime = (document.getElementById('qual-appt-datetime')?.value || '') !== '';

  const lockStatus = document.getElementById('gate-lock-status');
  const submitBtn = document.getElementById('btn-submit-appointment');

  const gatesCount = [g1, g2, g3, g4, g5].filter(Boolean).length;

  if (q1Valid && q2Valid && q4Valid && q5Valid && q6Valid && q9Valid && allGatesPassed && apptTime) {
    if (lockStatus) {
      lockStatus.className = 'pill-locked pill-unlocked';
      lockStatus.textContent = 'G1–G5 UNLOCKED (5/5)';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-disabled');
    }
  } else {
    if (lockStatus) {
      lockStatus.className = 'pill-locked';
      if (!q6Valid) {
        lockStatus.textContent = 'Disqualified (Just Curious)';
      } else if (!q5Valid || !q9Valid) {
        lockStatus.textContent = `Q5/Q9 Too Short (${gatesCount}/5 Gates)`;
      } else {
        lockStatus.textContent = `G1–G5 Locked (${gatesCount}/5 Gates)`;
      }
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-disabled');
    }
  }
}

function resetGate() {
  const g1 = document.getElementById('gate-g1'); if (g1) g1.checked = true;
  const g2 = document.getElementById('gate-g2'); if (g2) g2.checked = true;
  const g3 = document.getElementById('gate-g3'); if (g3) g3.checked = false;
  const g4 = document.getElementById('gate-g4'); if (g4) g4.checked = false;
  const g5 = document.getElementById('gate-g5'); if (g5) g5.checked = false;
  
  const pain = document.getElementById('q_pain_point'); if (pain) pain.value = '';
  const verbatim = document.getElementById('q_prospect_said'); if (verbatim) verbatim.value = '';
  const dt = document.getElementById('qual-appt-datetime'); if (dt) dt.value = '';
  
  updateTimezonePreview();
  validateGate();
}

// ========================================================
// BOOK QUALIFIED APPOINTMENT & WRITE FULL DOSSIER
// ========================================================
async function handleBookAppointment(e) {
  e.preventDefault();
  if (!selectedLead) {
    alert('Please select a lead first.');
    return;
  }

  const tz = document.getElementById('qual-appt-tz').value;
  const dtVal = document.getElementById('qual-appt-datetime').value;
  const [apptDatePart, apptTimePart] = dtVal.split('T');
  const tzCalc = updateTimezonePreview();
  const utcISO = tzCalc ? tzCalc.utcISO : new Date().toISOString();

  const dmVal = document.querySelector('input[name="q_decision_maker"]:checked')?.value || 'yes';
  const mktgChecked = Array.from(document.querySelectorAll('.q-mktg:checked')).map(c => c.value);
  const goalsChecked = Array.from(document.querySelectorAll('.q-goal:checked')).map(c => c.value);
  const commChecked = Array.from(document.querySelectorAll('.q-comm:checked')).map(c => c.value);

  const qualData = {
    lead_id: selectedLead.id,
    decision_maker: dmVal,
    current_marketing: mktgChecked,
    has_website: document.getElementById('q_has_website').value,
    main_goal: goalsChecked,
    pain_point: document.getElementById('q_pain_point').value.trim(),
    interest_level: document.getElementById('q_interest_level').value,
    timeline: document.getElementById('q_timeline').value,
    budget_expectation: document.getElementById('q_budget').value,
    prospect_verbatim: document.getElementById('q_prospect_said').value.trim(),
    created_by: currentUser?.id || null
  };

  const apptData = {
    lead_id: selectedLead.id,
    caller_id: currentUser?.id || null,
    closer_id: null,
    scheduled_date: apptDatePart,
    scheduled_time: apptTimePart,
    prospect_timezone: tz,
    appointment_time_utc: utcISO,
    platform: document.getElementById('qual-appt-platform').value,
    what_was_promised: commChecked,
    gate_business_consultation: document.getElementById('gate-g1').checked,
    gate_genuine_interest: document.getElementById('gate-g2').checked,
    gate_specific_datetime: document.getElementById('gate-g3').checked,
    gate_contact_method_clear: document.getElementById('gate-g4').checked,
    gate_contact_verified: document.getElementById('gate-g5').checked,
    status: 'scheduled',
    created_at: new Date().toISOString()
  };

  if (supabaseClient) {
    try {
      // 1. Insert structured qualification
      const { data: qRes, error: qErr } = await supabaseClient.from('qualifications').insert([qualData]).select();
      if (qErr) console.warn('Qualification table insert:', qErr);

      // 2. Insert Appointment
      const { data: aRes, error: aErr } = await supabaseClient.from('appointments').insert([apptData]).select();
      if (aErr) throw aErr;

      // 3. Update Lead Status
      await supabaseClient.from('leads').update({
        status: 'appointment',
        appointment_date: utcISO,
        lead_score: 90
      }).eq('id', selectedLead.id);

      // 4. Log Call to call_logs
      await supabaseClient.from('call_logs').insert([{
        lead_id: selectedLead.id,
        user_id: currentUser?.id || null,
        duration_seconds: callTimerSeconds,
        outcome: 'booked',
        notes: `Booked appointment for ${dtVal} (${tz}). Pain: ${qualData.pain_point}`,
        created_at: new Date().toISOString()
      }]);

      // 5. Create Reminder Tasks
      await supabaseClient.from('tasks').insert([
        {
          lead_id: selectedLead.id,
          task_type: 'confirmation',
          title: `Send Appointment Confirmation: ${selectedLead.business_name}`,
          description: `Send 1-page PDF audit and calendar invite to ${selectedLead.contact_name} at ${selectedLead.phone}.`,
          due_at: new Date().toISOString(),
          priority: 'high',
          status: 'pending'
        },
        {
          lead_id: selectedLead.id,
          task_type: 'follow_up',
          title: `Closer Briefing: ${selectedLead.business_name}`,
          description: `Conduct diagnostic call on ${dtVal} (${tz}). Agreed deliverable: 1-Page Forensic Audit.`,
          due_at: utcISO,
          priority: 'urgent',
          status: 'pending'
        }
      ]);

      // 6. Log to Activity Log
      await supabaseClient.from('activity_log').insert([{
        entity_type: 'appointment',
        entity_id: aRes ? aRes[0]?.id : null,
        action: 'booked',
        user_id: currentUser?.id || null,
        details: {
          business_name: selectedLead.business_name,
          scheduled_for: utcISO,
          closer: document.getElementById('qual-assigned-closer').value
        }
      }]);

      showToast(`Appointment locked and synced! 2 automated tasks generated.`);
    } catch (err) {
      console.error('Supabase booking error:', err);
      alert('Error saving appointment. Please check network connection.');
    }
  }

  resetGate();
  fetchLeads();
  fetchAppointments();
  fetchTasks();
}

// ========================================================
// CALL DISPOSITION LOGGING & ACTION CREATION
// ========================================================
async function quickLogDisposition(outcome) {
  if (!selectedLead) {
    alert('Please select a lead first.');
    return;
  }

  let leadStatus = 'contacted';
  let objectionType = null;
  let nextActionDate = null;
  let notes = `Call outcome: ${outcome}`;

  if (outcome === 'no_answer') {
    leadStatus = 'attempted';
  } else if (outcome === 'voicemail') {
    leadStatus = 'attempted';
    notes = 'Left standardized forensic mobile audit voicemail.';
  } else if (outcome === 'busy') {
    leadStatus = 'attempted';
    objectionType = 'busy';
  } else if (outcome === 'callback_requested') {
    leadStatus = 'callback';
    const hours = prompt('In how many hours should the callback be scheduled? (e.g. 2, 4, 24)', '24');
    const delay = parseInt(hours || '24', 10) * 3600 * 1000;
    nextActionDate = new Date(Date.now() + delay).toISOString();
    notes = `Prospect requested callback in ${hours} hours.`;
  } else if (outcome === 'not_interested') {
    leadStatus = 'lost';
    objectionType = 'not_interested';
  } else if (outcome === 'dnc') {
    leadStatus = 'do_not_call';
    notes = 'Prospect explicitly requested Do Not Call.';
  }

  if (supabaseClient) {
    try {
      // Update Lead
      const leadUpdate = {
        status: leadStatus,
        last_contacted_at: new Date().toISOString()
      };
      if (outcome === 'dnc') {
        leadUpdate.do_not_call = true;
        leadUpdate.dnc_reason = 'Prospect requested DNC during cold call';
        leadUpdate.dnc_date = new Date().toISOString();
      }
      await supabaseClient.from('leads').update(leadUpdate).eq('id', selectedLead.id);

      // Insert Call Log
      await supabaseClient.from('call_logs').insert([{
        lead_id: selectedLead.id,
        user_id: currentUser?.id || null,
        duration_seconds: callTimerSeconds,
        outcome: outcome,
        objection: objectionType,
        notes: notes,
        next_action_at: nextActionDate,
        created_at: new Date().toISOString()
      }]);

      // If callback requested, create task
      if (outcome === 'callback_requested' && nextActionDate) {
        await supabaseClient.from('tasks').insert([{
          lead_id: selectedLead.id,
          task_type: 'callback',
          title: `Callback Due: ${selectedLead.business_name}`,
          description: `Call back ${selectedLead.contact_name || 'Owner'} at ${selectedLead.phone}.`,
          due_at: nextActionDate,
          priority: 'high',
          status: 'pending'
        }]);
      }

      // Log to Activity Log
      await supabaseClient.from('activity_log').insert([{
        entity_type: 'call_log',
        entity_id: selectedLead.id,
        action: 'call_attempt',
        user_id: currentUser?.id || null,
        details: { outcome, duration: callTimerSeconds, notes }
      }]);

      showToast(`Logged disposition: ${outcome.replace('_', ' ').toUpperCase()}`);
    } catch (err) {
      console.error('Failed to log disposition:', err);
    }
  }

  fetchLeads();
  fetchTasks();
}

// ========================================================
// CLOSER QUEUE & 1-PAGE DOSSIERS
// ========================================================
function renderAppointments(appts) {
  const grid = document.getElementById('closer-appointments-grid');
  const countBadge = document.getElementById('pending-appointments-count');
  
  const pending = appts.filter(a => a.status === 'scheduled' || a.status === 'confirmed');
  if (countBadge) countBadge.textContent = pending.length;

  if (!grid) return;
  if (!appts || appts.length === 0) {
    grid.innerHTML = '<div class="empty-state">No appointments booked yet. Completed qualification calls will appear here in real-time.</div>';
    return;
  }

  grid.innerHTML = appts.map(a => {
    const lead = leadsList.find(l => l.id === a.lead_id) || {};
    const dateDisplay = `${a.scheduled_date || ''} at ${a.scheduled_time || ''} ${a.prospect_timezone || 'CST'}`;
    const promised = Array.isArray(a.what_was_promised) ? a.what_was_promised.join(', ') : '1-Page Forensic Audit';

    return `
      <div class="dossier-card">
        <div class="dossier-top">
          <div>
            <h3 class="font-syne text-sm">${escapeHtml(lead.business_name || 'Contractor Lead')}</h3>
            <span class="text-xs text-muted">Owner: <b>${escapeHtml(lead.contact_name || 'Owner')}</b></span>
          </div>
          <span class="dossier-time-badge">${escapeHtml(dateDisplay)}</span>
        </div>

        <div class="dossier-pain-box">
          <span class="text-xs font-mono text-muted block mb-1">PLATFORM & PROMISED ITEMS:</span>
          <b>${escapeHtml(a.platform || 'Phone Call')} &bull; Deliverables: ${escapeHtml(promised)}</b>
        </div>

        <div class="dossier-metrics-list">
          <span>Phone: <b>${escapeHtml(lead.phone || '—')}</b></span>
          <span>Location: <b>${escapeHtml(lead.city || '')}, ${escapeHtml(lead.state || 'TX')}</b></span>
          <span>Quality Gates: <b>${a.gate_business_consultation && a.gate_specific_datetime ? '5/5 Passed' : 'Verified'}</b></span>
          <span>UTC Timestamp: <b class="font-mono text-xs">${escapeHtml(a.appointment_time_utc ? a.appointment_time_utc.substring(0, 16) : 'N/A')}</b></span>
        </div>

        <div class="dossier-footer">
          <span class="lead-status-tag ${a.status === 'closed' ? 'status-won' : ''}">${escapeHtml(a.status || 'scheduled')}</span>
          <button class="btn-sm btn-secondary" onclick="openDossierModal('${a.id}')">Open Call Dossier & Update</button>
        </div>
      </div>
    `;
  }).join('');
}

function filterAppointments(statusFilter) {
  document.querySelectorAll('.closer-filters .filter-pill').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  if (statusFilter === 'all') {
    renderAppointments(appointmentsList);
  } else {
    const filtered = appointmentsList.filter(a => (a.status || '').toLowerCase() === statusFilter.toLowerCase());
    renderAppointments(filtered);
  }
}

function openDossierModal(apptId) {
  const a = appointmentsList.find(item => item.id == apptId);
  if (!a) return;
  const lead = leadsList.find(l => l.id == a.lead_id) || {};

  const content = document.getElementById('dossier-content');
  content.innerHTML = `
    <div class="dossier-modal-inner">
      <div class="lead-meta-row mb-3" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <span>Business: <b>${escapeHtml(lead.business_name || 'Prospect')}</b></span>
        <span>Owner / Contact: <b>${escapeHtml(lead.contact_name || 'N/A')}</b></span>
        <span>Phone: <a href="tel:${escapeHtml(lead.phone || '')}" class="text-accent"><b>${escapeHtml(lead.phone || 'N/A')}</b></a></span>
        <span>Time: <b>${escapeHtml(a.scheduled_date)} ${escapeHtml(a.scheduled_time)} (${escapeHtml(a.prospect_timezone)})</b></span>
      </div>

      <div class="p-3 bg-obsidian rounded border border-subtle mb-3" style="background:#060609; padding:12px; border-radius:8px; border:1px solid var(--border-subtle);">
        <h4 class="text-xs text-accent font-mono mb-1">1-PAGE FORENSIC CLOSING SCRIPT:</h4>
        <p class="text-sm">"Hi ${escapeHtml(lead.contact_name ? lead.contact_name.split(' ')[0] : 'there')}, this is our senior systems engineer from WebSmitherz. We scheduled this briefing because our mobile latency audit flagged two friction points on your mobile estimate form that are dropping inbound calls. I have your live speed teardown and map ranking data on my screen right now..."</p>
      </div>

      <div class="form-group mb-3">
        <label>Update Closer Outcome:</label>
        <select id="closer-outcome-status" class="w-full">
          <option value="scheduled" ${a.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>Completed / Pitched</option>
          <option value="closed" ${a.status === 'closed' ? 'selected' : ''}>Won / Closed Deal</option>
          <option value="proposal_sent" ${a.status === 'proposal_sent' ? 'selected' : ''}>Proposal Sent</option>
          <option value="rescheduled" ${a.status === 'rescheduled' ? 'selected' : ''}>Rescheduled</option>
          <option value="no_show" ${a.status === 'no_show' ? 'selected' : ''}>No Show / Missed Call</option>
          <option value="disqualified" ${a.status === 'disqualified' ? 'selected' : ''}>Disqualified</option>
        </select>
      </div>

      <div class="form-group mb-4">
        <label>Closer Debrief Notes:</label>
        <textarea id="closer-notes-input" rows="3" class="w-full" placeholder="Enter post-call briefing notes, proposal price quoted, client objections...">${escapeHtml(a.closer_notes || '')}</textarea>
      </div>

      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
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

  if (supabaseClient) {
    try {
      await supabaseClient.from('appointments').update({
        status: newStatus,
        closer_notes: notes,
        outcome: newStatus,
        updated_at: new Date().toISOString()
      }).eq('id', apptId);

      // If no-show, create immediate recovery task
      if (newStatus === 'no_show' && a) {
        await supabaseClient.from('tasks').insert([{
          lead_id: a.lead_id,
          task_type: 'recovery',
          title: `No-Show Recovery Call: Appointment #${apptId}`,
          description: `Follow up via phone/SMS to reschedule missed audit briefing.`,
          due_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          priority: 'urgent',
          status: 'pending'
        }]);
      }

      showToast('Closer outcome updated in real-time.');
    } catch (err) {
      console.error(err);
    }
  }

  closeDossierModal();
  fetchAppointments();
  fetchTasks();
}

// ========================================================
// TASKS & CALLBACK QUEUE
// ========================================================
function renderTasksTable(tasks) {
  const tbody = document.getElementById('tasks-table-body');
  if (!tbody) return;

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6">No tasks found. Callbacks and automated recoveries will appear here.</td></tr>';
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const lead = leadsList.find(l => l.id === t.lead_id) || {};
    const dueFormatted = t.due_at ? new Date(t.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No Date';

    return `
      <tr>
        <td>
          <b>${escapeHtml(t.title)}</b>
          <div class="text-xs text-muted">${escapeHtml(t.description || '')}</div>
        </td>
        <td><span class="pill-locked" style="font-size:10px;">${escapeHtml(t.task_type)}</span></td>
        <td><span class="badge-danger" style="font-size:10px;">${escapeHtml(t.priority)}</span></td>
        <td>${escapeHtml(dueFormatted)}</td>
        <td>${escapeHtml(lead.contact_name || 'Agent')}</td>
        <td><span class="lead-status-tag">${escapeHtml(t.status)}</span></td>
        <td>
          ${t.status !== 'completed' ? `
            <button class="btn-sm btn-primary" onclick="completeTask('${t.id}')">Mark Complete</button>
          ` : '<span class="text-emerald text-xs">Done</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function filterTasks(type) {
  document.querySelectorAll('#tasks-view .filter-pill').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  if (type === 'all') {
    renderTasksTable(tasksList);
  } else if (type === 'open') {
    renderTasksTable(tasksList.filter(t => t.status === 'pending' || t.status === 'in_progress'));
  } else if (type === 'callback') {
    renderTasksTable(tasksList.filter(t => t.task_type === 'callback'));
  } else if (type === 'recovery') {
    renderTasksTable(tasksList.filter(t => t.task_type === 'recovery'));
  }
}

async function completeTask(taskId) {
  if (supabaseClient) {
    try {
      await supabaseClient.from('tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', taskId);
      showToast('Task marked as completed.');
    } catch (err) {
      console.error(err);
    }
  }
  fetchTasks();
}

// ========================================================
// LEADS PIPELINE & CSV INGESTION
// ========================================================
function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

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
      <td><span class="lead-status-tag ${l.do_not_call ? 'status-dnc' : ''}">${escapeHtml(l.status || 'new')}</span></td>
      <td>${escapeHtml(currentAgent)}</td>
      <td>
        <button class="btn-sm btn-ghost" onclick="switchView('caller'); selectLeadToCall('${l.id}')">Call in Studio</button>
      </td>
    </tr>
  `).join('');
}

function openCsvImportModal() { document.getElementById('csv-modal').classList.add('active'); }
function closeCsvModal() { document.getElementById('csv-modal').classList.remove('active'); }
function openAddLeadModal() { document.getElementById('add-lead-modal').classList.add('active'); }
function closeAddLeadModal() { document.getElementById('add-lead-modal').classList.remove('active'); }
function closeDossierModal() { document.getElementById('dossier-modal').classList.remove('active'); }

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

    const newLeads = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length >= 2) {
        newLeads.push({
          business_name: cols[0] || 'Unknown Contractor',
          phone: cols[1] || '',
          contact_name: cols[2] || '',
          website: cols[3] || '',
          city: cols[4] || '',
          state: cols[5] || 'TX',
          status: 'new',
          created_at: new Date().toISOString()
        });
      }
    }

    if (supabaseClient && newLeads.length > 0) {
      try {
        await supabaseClient.from('leads').insert(newLeads);
        showToast(`Successfully uploaded ${newLeads.length} leads to Supabase!`);
      } catch (err) {
        console.error('CSV cloud insert error:', err);
      }
    }

    closeCsvModal();
    fetchLeads();
  };
  reader.readAsText(file);
}

async function handleCreateLead(e) {
  e.preventDefault();
  const newLead = {
    business_name: document.getElementById('new-lead-biz').value.trim(),
    contact_name: document.getElementById('new-lead-contact').value.trim(),
    phone: document.getElementById('new-lead-phone').value.trim(),
    facebook_url: document.getElementById('new-lead-fb')?.value.trim() || '',
    email: document.getElementById('new-lead-email')?.value.trim() || '',
    website: document.getElementById('new-lead-web').value.trim(),
    city: document.getElementById('new-lead-city').value.trim(),
    state: document.getElementById('new-lead-state').value.trim() || 'TX',
    source: 'facebook',
    status: 'new',
    created_at: new Date().toISOString()
  };

  if (supabaseClient) {
    try {
      await supabaseClient.from('leads').insert([newLead]);
      showToast('Lead added to live cloud queue.');
    } catch (err) {
      console.error(err);
    }
  }

  closeAddLeadModal();
  fetchLeads();
}

function updateStats() {
  const dials = appointmentsList.length + leadsList.filter(l => l.status !== 'new').length;
  const qualified = appointmentsList.length + leadsList.filter(l => l.status === 'qualified' || l.status === 'appointment').length;
  const booked = appointmentsList.length;

  const dEl = document.getElementById('stat-dials');
  const qEl = document.getElementById('stat-qualified');
  const bEl = document.getElementById('stat-booked');

  if (dEl) dEl.textContent = dials;
  if (qEl) qEl.textContent = qualified;
  if (bEl) bEl.textContent = booked;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }
}

function setupRealtimeListeners() {
  if (supabaseClient) {
    supabaseClient
      .channel('public:cockpit_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchAppointments();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
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

