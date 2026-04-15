// Interpro Blues — Web app
// Slices 1 & 2: auth + teams + squad + lineup editor

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wmakberobwgagtawvrsh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtYWtiZXJvYndnYWd0YXd2cnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTQwMzEsImV4cCI6MjA5MTczMDAzMX0.OWfXZjc-9lB-og4_Es9vitg2HYZL47Pp7179l_SHx2Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const appEl = document.getElementById('app');
const userBar = document.getElementById('user-bar');

// ---------- Constants ----------
const POSITION_GROUPS = {
  Goalkeepers: [['GK','Goalkeeper']],
  Defenders: [['RB','Right Back'],['LB','Left Back'],['CB','Centre Back'],['RWB','Right Wing Back'],['LWB','Left Wing Back']],
  Midfielders: [['CDM','Central Defensive Midfielder'],['CM','Central Midfielder'],['CAM','Central Attacking Midfielder'],['RM','Right Midfielder'],['LM','Left Midfielder']],
  Forwards: [['RW','Right Winger'],['LW','Left Winger'],['SS','Second Striker'],['CF','Centre Forward'],['ST','Striker']]
};

// Preset formations — positions are [x%, y%] on the pitch (y=0 is top / attacking end)
const FORMATIONS = {
  '4-3-3':   { pos:[[50,87],[18,70],[36,70],[64,70],[82,70],[28,51],[50,51],[72,51],[18,26],[50,24],[82,26]], lbl:['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'] },
  '4-4-2':   { pos:[[50,87],[18,70],[36,70],[64,70],[82,70],[15,50],[37,50],[63,50],[85,50],[33,24],[67,24]], lbl:['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'] },
  '4-5-1':   { pos:[[50,87],[18,70],[36,70],[64,70],[82,70],[12,50],[30,50],[50,50],[70,50],[88,50],[50,20]], lbl:['GK','LB','CB','CB','RB','LM','CM','CM','CM','RM','ST'] },
  '3-5-2':   { pos:[[50,87],[24,70],[50,70],[76,70],[12,48],[31,48],[50,48],[69,48],[88,48],[33,24],[67,24]], lbl:['GK','CB','CB','CB','LWB','CM','CM','CM','RWB','ST','ST'] },
  '4-2-3-1': { pos:[[50,87],[18,70],[36,70],[64,70],[82,70],[33,57],[67,57],[18,38],[50,38],[82,38],[50,20]], lbl:['GK','LB','CB','CB','RB','CDM','CDM','LAM','CAM','RAM','ST'] },
  '5-3-2':   { pos:[[50,87],[8,68],[26,68],[50,68],[74,68],[92,68],[26,48],[50,48],[74,48],[33,24],[67,24]], lbl:['GK','LB','CB','CB','CB','RB','CM','CM','CM','ST','ST'] }
};
const MAX_SUBS = 5;

// ---------- Helpers ----------
function groupForPos(code) {
  for (const g in POSITION_GROUPS) {
    if (POSITION_GROUPS[g].some(([c]) => c === code)) return g;
  }
  return 'Unassigned';
}

function posOptions(selected) {
  let html = `<option value="">– Position –</option>`;
  for (const g in POSITION_GROUPS) {
    html += `<optgroup label="${g}">`;
    for (const [code, label] of POSITION_GROUPS[g]) {
      html += `<option value="${code}" ${selected === code ? 'selected' : ''}>${code} – ${label}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

function shortName(n) {
  if (!n) return '';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
  const parts = n.trim().split(/\s+/);
  if (parts.length === 1) return cap(parts[0]);
  return cap(parts[0]) + ' ' + parts[parts.length - 1].charAt(0).toUpperCase();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function logAudit(teamId, entityType, entityId, action, changes) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('audit_log').insert({
    team_id: teamId,
    user_id: user.id,
    entity_type: entityType,
    entity_id: entityId,
    action,
    changes
  });
}

// ---------- Router ----------
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('team/')) return { name: 'team', teamId: h.slice(5) };
  return { name: 'home' };
}
window.addEventListener('hashchange', render);

function resetHeader() {
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.innerHTML = `<img src="logo.png" alt="Interpro" class="brand-logo" /><h1>Interpro Blues — Lineups</h1>`;
  const tabsEl = document.getElementById('header-tabs');
  if (tabsEl) tabsEl.innerHTML = '';
}

async function render() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    resetHeader();
    renderAuth();
    userBar.innerHTML = '';
    return;
  }
  renderUserBar(session.user);

  const route = currentRoute();
  if (route.name === 'team') {
    await renderTeamDashboard(session.user, route.teamId);
  } else {
    resetHeader();
    await renderTeamsHome(session.user);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') location.hash = '';
  render();
});

// ---------- Auth ----------
function renderAuth() {
  appEl.innerHTML = `
    <div class="card">
      <h2 id="auth-title">Log in</h2>
      <form id="auth-form">
        <div id="name-field" style="display:none">
          <label>Full name</label>
          <input type="text" id="full_name" />
        </div>
        <label>Email</label>
        <input type="email" id="email" required />
        <label>Password</label>
        <input type="password" id="password" required minlength="6" />
        <div id="auth-error" class="error"></div>
        <div id="auth-ok" class="ok"></div>
        <button class="primary" type="submit" id="auth-submit">Log in</button>
      </form>
      <p class="muted" style="margin-top:1rem">
        <span id="toggle-text">No account yet?</span>
        <button class="link" id="toggle-mode">Sign up</button>
      </p>
    </div>
  `;

  let mode = 'login';
  const title = document.getElementById('auth-title');
  const submit = document.getElementById('auth-submit');
  const toggleText = document.getElementById('toggle-text');
  const toggleBtn = document.getElementById('toggle-mode');
  const nameField = document.getElementById('name-field');
  const errEl = document.getElementById('auth-error');
  const okEl  = document.getElementById('auth-ok');

  toggleBtn.onclick = () => {
    mode = mode === 'login' ? 'signup' : 'login';
    title.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    submit.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    toggleText.textContent = mode === 'login' ? 'No account yet?' : 'Already have an account?';
    toggleBtn.textContent = mode === 'login' ? 'Sign up' : 'Log in';
    nameField.style.display = mode === 'signup' ? 'block' : 'none';
    errEl.textContent = ''; okEl.textContent = '';
  };

  document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    errEl.textContent = ''; okEl.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const full_name = document.getElementById('full_name')?.value.trim();

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name } }
      });
      if (error) { errEl.textContent = error.message; return; }
      okEl.textContent = 'Account created. You can log in now.';
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { errEl.textContent = error.message; return; }
    }
  };
}

function renderUserBar(user) {
  userBar.innerHTML = `
    <span>${escapeHtml(user.email)}</span>
    <button id="logout">Log out</button>
  `;
  document.getElementById('logout').onclick = async () => {
    await supabase.auth.signOut();
  };
}

// ---------- Teams home ----------
async function renderTeamsHome(user) {
  appEl.innerHTML = `<p class="loading">Loading your teams…</p>`;

  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('role, team_id, teams(id, name)')
    .eq('user_id', user.id);

  if (error) {
    appEl.innerHTML = `<div class="card"><p class="error">Error: ${escapeHtml(error.message)}</p></div>`;
    return;
  }

  const teamsHtml = (memberships && memberships.length)
    ? `<ul class="team-list">
        ${memberships.map(m => `
          <li>
            <div>
              <strong>${escapeHtml(m.teams.name)}</strong>
              <div class="muted">Role: ${m.role}</div>
            </div>
            <button class="primary" data-team="${m.team_id}">Open</button>
          </li>
        `).join('')}
      </ul>`
    : `<p class="muted">You're not on any teams yet. Create one below to get started.</p>`;

  appEl.innerHTML = `
    <div class="card">
      <h2>Your teams</h2>
      ${teamsHtml}
    </div>
    <div class="card">
      <h2>Create a new team</h2>
      <p class="muted">You'll be the admin of this team.</p>
      <form id="new-team-form">
        <label>Team name</label>
        <input type="text" id="team-name" placeholder="e.g. Interpro Blues U10" required />
        <div id="team-error" class="error"></div>
        <button class="primary" type="submit">Create team</button>
      </form>
    </div>
  `;

  document.getElementById('new-team-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('team-error');
    errEl.textContent = '';
    const name = document.getElementById('team-name').value.trim();
    if (!name) return;

    const { data: team, error: tErr } = await supabase
      .from('teams').insert({ name, created_by: user.id }).select().single();
    if (tErr) { errEl.textContent = tErr.message; return; }

    const { error: mErr } = await supabase
      .from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'admin' });
    if (mErr) { errEl.textContent = mErr.message; return; }

    location.hash = `#/team/${team.id}`;
  };

  appEl.querySelectorAll('[data-team]').forEach(btn => {
    btn.onclick = () => { location.hash = `#/team/${btn.dataset.team}`; };
  });
}

// ---------- Team dashboard ----------
let activeTab = 'squad';
let currentFilter = 'All';
const expandedPlayers = new Set(); // player ids with expanded detail panel

// In-memory editor state for lineups tab
let editor = null; // { team, canEdit, players, lineups, current: { id?, name, opponent, game_date, formation, slots, subs } }

async function renderTeamDashboard(user, teamId) {
  appEl.innerHTML = `<p class="loading">Loading team…</p>`;

  const [teamRes, memberRes, playersRes, lineupsRes, playsRes, formationsRes] = await Promise.all([
    supabase.from('teams').select('id, name').eq('id', teamId).single(),
    supabase.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle(),
    supabase.from('players').select('*').eq('team_id', teamId).order('number', { ascending: true, nullsFirst: false }).order('name'),
    supabase.from('lineups').select('*').eq('team_id', teamId).order('game_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    supabase.from('plays').select('*').eq('team_id', teamId).order('created_at', { ascending: false }),
    supabase.from('formations').select('*').eq('team_id', teamId).order('created_at', { ascending: true })
  ]);

  if (teamRes.error || !teamRes.data) {
    appEl.innerHTML = `<div class="card"><p class="error">Team not found or you don't have access.</p><button class="primary" onclick="location.hash=''">Back</button></div>`;
    return;
  }
  const team = teamRes.data;
  const role = memberRes.data?.role || 'viewer';
  const canEdit = role === 'admin' || role === 'coach';
  const players = playersRes.data || [];
  const lineups = lineupsRes.data || [];
  const plays = playsRes.data || [];
  const customFormations = formationsRes.data || [];

  // Populate blue header with team info + tabs
  const titleEl = document.getElementById('header-title');
  if (titleEl) {
    titleEl.innerHTML = `
      <img src="logo.png" alt="Interpro" class="brand-logo" />
      <div class="title-stack">
        <a href="#" class="breadcrumb-link" onclick="event.preventDefault();location.hash=''">← Your teams</a>
        <div class="team-line">
          <h1 class="team-name">${escapeHtml(team.name)}</h1>
          <span class="role-chip">${escapeHtml(role)}</span>
        </div>
      </div>
    `;
  }
  const tabsEl = document.getElementById('header-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = `
      <button class="h-tab ${activeTab === 'squad' ? 'active' : ''}" data-tab="squad">Squad</button>
      <button class="h-tab ${activeTab === 'lineups' ? 'active' : ''}" data-tab="lineups">Lineups</button>
      <button class="h-tab ${activeTab === 'plays' ? 'active' : ''}" data-tab="plays">Plays</button>
    `;
    tabsEl.querySelectorAll('.h-tab[data-tab]').forEach(b => {
      b.onclick = () => {
        activeTab = b.dataset.tab;
        renderTeamDashboard(user, teamId);
      };
    });
  }

  appEl.innerHTML = `<div id="tab-content"></div>`;

  if (activeTab === 'squad') {
    renderSquadTab(team, canEdit, players);
  } else if (activeTab === 'lineups') {
    editor = {
      mode: 'lineup',
      team, canEdit, players, lineups, plays, customFormations,
      current: newLineupState()
    };
    renderLineupsTab();
  } else if (activeTab === 'plays') {
    editor = {
      mode: 'play',
      team, canEdit, players, lineups, plays, customFormations,
      current: newPlayState()
    };
    renderPlaysTab();
  }
}

// ---------- Squad tab ----------
function renderSquadTab(team, canEdit, players) {
  const tabEl = document.getElementById('tab-content');

  const filterGroups = ['All','Goalkeepers','Defenders','Midfielders','Forwards','Unassigned'];
  const counts = filterGroups.reduce((acc, g) => { acc[g] = 0; return acc; }, {});
  players.forEach(p => {
    counts.All++;
    counts[groupForPos(p.position || '')]++;
  });

  const visible = currentFilter === 'All'
    ? players
    : players.filter(p => groupForPos(p.position || '') === currentFilter);

  const addForm = canEdit ? `
    <div class="card">
      <h3 style="margin-top:0">Add a player</h3>
      <form id="add-player-form" class="add-row">
        <input type="text" id="ap-name" placeholder="Player name" required />
        <input type="number" id="ap-num" placeholder="#" min="1" max="99" />
        <button class="primary" type="submit">+ Add</button>
      </form>
      <div id="add-error" class="error"></div>
    </div>
  ` : '';

  const filterHtml = `
    <div class="card filter-card">
      <h3 style="margin-top:0">Filter</h3>
      <div class="filter-list">
        ${filterGroups.map(g => `
          <button class="filter-btn ${currentFilter === g ? 'active' : ''}" data-filter="${g}">
            ${g} <span class="count">${counts[g]}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  const cardHtml = (p) => {
    const isOpen = expandedPlayers.has(p.id);
    return `
    <div class="sc-card ${isOpen ? 'open' : ''}" data-player="${p.id}">
      <button class="sc-header" data-toggle type="button">
        <div class="sc-chip">
          <div class="sc-chip-num">${p.number ?? '–'}</div>
        </div>
        <div class="sc-chip-info">
          <div class="sc-chip-name">${escapeHtml(shortName(p.name))}</div>
          <div class="sc-chip-pos">${p.position || '—'}</div>
        </div>
        <div class="sc-chevron">${isOpen ? '▾' : '▸'}</div>
      </button>
      ${isOpen ? `
      <div class="sc-details">
        <label>Name</label>
        <input type="text" class="field" value="${escapeHtml(p.name || '')}" data-field="name" ${canEdit ? '' : 'disabled'} />
        <div class="sc-row-2">
          <div>
            <label>Number</label>
            <input type="number" class="field" min="1" max="99" value="${p.number ?? ''}" data-field="number" ${canEdit ? '' : 'disabled'} />
          </div>
          <div>
            <label>Position</label>
            <select class="field" data-field="position" ${canEdit ? '' : 'disabled'}>${posOptions(p.position || '')}</select>
          </div>
        </div>
        <label>Parent 1 name</label>
        <input type="text" class="field" value="${escapeHtml(p.parent1_name || '')}" data-field="parent1_name" ${canEdit ? '' : 'disabled'} />
        <label>Parent 1 phone</label>
        <input type="tel" class="field" value="${escapeHtml(p.parent1_phone || '')}" data-field="parent1_phone" ${canEdit ? '' : 'disabled'} />
        <label>Parent 2 name</label>
        <input type="text" class="field" value="${escapeHtml(p.parent2_name || '')}" data-field="parent2_name" ${canEdit ? '' : 'disabled'} />
        <label>Parent 2 phone</label>
        <input type="tel" class="field" value="${escapeHtml(p.parent2_phone || '')}" data-field="parent2_phone" ${canEdit ? '' : 'disabled'} />
        ${canEdit ? `<button class="del-btn" data-remove>Remove player</button>` : ''}
      </div>` : ''}
    </div>
  `;
  };

  const grid = visible.length
    ? `<div class="sc-grid">${visible.map(cardHtml).join('')}</div>`
    : `<p class="muted" style="text-align:center;padding:2rem">No players in this group.</p>`;

  tabEl.innerHTML = `
    <div class="squad-layout">
      <div class="squad-main">
        ${addForm}
        <div class="card">
          <h3 style="margin-top:0">Squad ${currentFilter !== 'All' ? '— ' + currentFilter : ''}</h3>
          ${grid}
        </div>
      </div>
      <div class="squad-side">${filterHtml}</div>
    </div>
  `;

  tabEl.querySelectorAll('.filter-btn').forEach(b => {
    b.onclick = () => { currentFilter = b.dataset.filter; renderSquadTab(team, canEdit, players); };
  });

  if (canEdit) {
    document.getElementById('add-player-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('add-error');
      errEl.textContent = '';
      const name = document.getElementById('ap-name').value.trim();
      const numRaw = document.getElementById('ap-num').value;
      const number = numRaw ? parseInt(numRaw, 10) : null;
      if (!name) return;

      const { data: inserted, error } = await supabase
        .from('players').insert({ team_id: team.id, name, number }).select().single();
      if (error) { errEl.textContent = error.message; return; }

      await logAudit(team.id, 'player', inserted.id, 'create', { name, number });
      players.push(inserted);
      players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
      document.getElementById('ap-name').value = '';
      document.getElementById('ap-num').value = '';
      renderSquadTab(team, canEdit, players);
    };
  }

  tabEl.querySelectorAll('.sc-card').forEach(cardEl => {
    const pid = cardEl.dataset.player;
    const toggleBtn = cardEl.querySelector('[data-toggle]');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        if (expandedPlayers.has(pid)) expandedPlayers.delete(pid);
        else expandedPlayers.add(pid);
        renderSquadTab(team, canEdit, players);
      };
    }
    cardEl.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', async () => {
        const field = input.dataset.field;
        let value = input.value;
        if (field === 'number') value = value === '' ? null : parseInt(value, 10);
        const player = players.find(p => p.id === pid);
        const oldValue = player ? player[field] : null;
        if (oldValue === value) return;

        const { error } = await supabase.from('players').update({ [field]: value }).eq('id', pid);
        if (error) { alert('Save failed: ' + error.message); input.value = oldValue ?? ''; return; }

        if (player) player[field] = value;
        await logAudit(team.id, 'player', pid, 'update', { field, from: oldValue, to: value });

        input.classList.add('saved');
        setTimeout(() => input.classList.remove('saved'), 600);

        if (field === 'number' || field === 'position') {
          players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
          renderSquadTab(team, canEdit, players);
        }
      });
    });

    const removeBtn = cardEl.querySelector('[data-remove]');
    if (removeBtn) {
      removeBtn.onclick = async () => {
        const player = players.find(p => p.id === pid);
        if (!confirm(`Remove ${player?.name || 'this player'}?`)) return;
        const { error } = await supabase.from('players').delete().eq('id', pid);
        if (error) { alert('Remove failed: ' + error.message); return; }
        await logAudit(team.id, 'player', pid, 'delete', { name: player?.name });
        const idx = players.findIndex(p => p.id === pid);
        if (idx >= 0) players.splice(idx, 1);
        renderSquadTab(team, canEdit, players);
      };
    }
  });
}

// ---------- Lineups tab ----------
function newLineupState() {
  return {
    id: null,
    name: '',
    opponent: '',
    game_date: '',
    formation: '4-3-3',
    slots: {},   // { slotIndex: playerId }
    subs: [],    // [playerId]
    // tactics
    arrows: [],             // [{x1,y1,x2,y2,cx?,cy?}] in pitch %
    zoneLines: [null, null],// [pressY%, defY%] or null
    ballVisible: false,
    ballPos: { x: 50, y: 50 }
  };
}

function newPlayState() {
  return {
    id: null,
    name: '',
    formation: '4-3-3',
    slots: {},            // always empty for plays (no players)
    subs: [],             // always empty for plays
    arrows: [],
    zoneLines: [null, null],
    ballVisible: false,
    ballPos: { x: 50, y: 50 }
  };
}

// Tactics zones config
const ZONES = [
  { label: 'Press', color: '#ffeb3b', defaultY: 30 },
  { label: 'Def',   color: '#ff7043', defaultY: 65 }
];

// Current formation (preset or custom) for the editor
function getFormation(name) {
  if (FORMATIONS[name]) return FORMATIONS[name];
  const custom = (editor?.customFormations || []).find(c => c.name === name);
  if (custom && custom.data?.pos && custom.data?.lbl) {
    return { pos: custom.data.pos, lbl: custom.data.lbl, _customId: custom.id };
  }
  return null;
}

// Collapsible card wrapper (uses <details> so browser handles state)
function collapsibleCard(id, title, bodyHtml) {
  const open = !collapsedCards.has(id);
  return `
    <details class="card collapsible" data-card="${id}" ${open ? 'open' : ''}>
      <summary class="card-title">${escapeHtml(title)}<span class="chev">▾</span></summary>
      <div class="card-body">${bodyHtml}</div>
    </details>
  `;
}

// Merge preset formations + a team's custom formations (custom wins on name clash)
function allFormations(customFormations) {
  const out = { ...FORMATIONS };
  for (const cf of (customFormations || [])) {
    const d = cf.data || {};
    if (Array.isArray(d.pos) && Array.isArray(d.lbl) && d.pos.length === d.lbl.length) {
      out[cf.name] = { pos: d.pos.map(p => [...p]), lbl: [...d.lbl], _customId: cf.id };
    }
  }
  return out;
}

// Collapsed-card state keyed by tab+card-id, persists across renders
const collapsedCards = new Set();

// Formation-edit transient state
let formationEdit = null; // { baseName, name, pos: [[x,y],...], lbl: [...], editingId: null }
let formationDrag = null; // { idx, ox, oy }

// Transient tactics UI state (not persisted)
let tacticMode = null;          // null | 'click' | 'drag'
let clickStart = null;
let dragActive = false;
let dragCurrent = null;
let movingIdx = null;
let movingEnd = null;
let movingOx = 0;
let movingOy = 0;
let draggingLineIdx = null;
let draggingLineStartY = 0;
let draggingLinePct = 0;

function renderLineupsTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, players, lineups, plays, customFormations, current } = editor;

  const FORMS = allFormations(customFormations);
  const formationBtns = Object.keys(FORMS).map(f => {
    const cid = FORMS[f]._customId;
    return `<button class="f-btn ${current.formation === f ? 'active' : ''}${cid ? ' f-btn-custom' : ''}" data-formation="${f}">${escapeHtml(f)}${cid && canEdit ? `<span class="f-del" data-del-formation="${cid}" title="Delete">✕</span>` : ''}</button>`;
  }).join('');

  // Players used in current lineup
  const usedIds = new Set([...Object.values(current.slots), ...current.subs].filter(Boolean));
  const availablePlayers = players.filter(p => !usedIds.has(p.id));

  const paletteHtml = availablePlayers.length
    ? availablePlayers.map(p => chipHtml(p, 'palette')).join('')
    : `<p class="muted" style="padding:0.5rem">All players on the pitch or subs.</p>`;

  const lineupsListHtml = lineups.length
    ? lineups.map(l => `
        <div class="lineup-item ${current.id === l.id ? 'active' : ''}" data-lineup="${l.id}">
          <div class="lineup-name">${escapeHtml(l.name)}</div>
          <div class="lineup-meta">
            ${l.opponent ? 'vs ' + escapeHtml(l.opponent) : ''}
            ${l.game_date ? ' · ' + formatDate(l.game_date) : ''}
            ${l.data?.formation ? ' · ' + l.data.formation : ''}
          </div>
          ${canEdit ? `<button class="lineup-del" data-del-lineup="${l.id}" title="Delete">✕</button>` : ''}
        </div>
      `).join('')
    : `<p class="muted" style="padding:0.75rem">No saved lineups yet.</p>`;

  tabEl.innerHTML = `
    <div class="lineup-layout">
      <aside class="lineup-left">
        ${canEdit ? collapsibleCard('lineup-tactics', 'Tactics', `
          <div class="tactic-btns">
            <button class="tactic-btn ${tacticMode === 'move' ? 'active' : ''}" data-tactic-mode="move">▶ Move</button>
            <button class="tactic-btn ${tacticMode === 'click' ? 'active' : ''}" data-tactic-mode="click">→ Click</button>
            <button class="tactic-btn ${tacticMode === 'drag' ? 'active' : ''}" data-tactic-mode="drag">↗ Drag</button>
            <button class="tactic-btn ${current.ballVisible ? 'active' : ''}" id="btn-ball">⚽ Ball</button>
          </div>
          <div id="tactic-info" class="tactic-info">Pick a mode to edit tactics.</div>
          <div class="zone-row">
            <label class="zone-label"><span class="zone-swatch" style="border-top:3px dashed #ffeb3b"></span>Press
              <input type="checkbox" id="chk-zone-0" ${current.zoneLines[0] !== null ? 'checked' : ''} />
            </label>
            <input type="range" id="slider-zone-0" min="5" max="92" value="${current.zoneLines[0] ?? ZONES[0].defaultY}" ${current.zoneLines[0] === null ? 'disabled' : ''} />
          </div>
          <div class="zone-row">
            <label class="zone-label"><span class="zone-swatch" style="border-top:3px dashed #ff7043"></span>Def
              <input type="checkbox" id="chk-zone-1" ${current.zoneLines[1] !== null ? 'checked' : ''} />
            </label>
            <input type="range" id="slider-zone-1" min="5" max="92" value="${current.zoneLines[1] ?? ZONES[1].defaultY}" ${current.zoneLines[1] === null ? 'disabled' : ''} />
          </div>
          <button class="btn-full" id="clear-arrows">✕ Clear arrows</button>
          <button class="btn-full" id="clear-tactics">✕ Clear all tactics</button>
          <button class="btn-full" id="load-from-play" ${plays.length ? '' : 'disabled'}>↓ Load from play…</button>
          <button class="btn-full" id="save-as-play" style="margin-bottom:0">★ Save as play…</button>
        `) : ''}

        ${collapsibleCard('lineup-details', 'Lineup details', `
          <label>Name</label>
          <input type="text" id="l-name" value="${escapeHtml(current.name)}" placeholder="e.g. vs Rivals" ${canEdit ? '' : 'disabled'} />
          <label>Opponent</label>
          <input type="text" id="l-opponent" value="${escapeHtml(current.opponent)}" ${canEdit ? '' : 'disabled'} />
          <label>Game date</label>
          <input type="date" id="l-date" value="${current.game_date || ''}" ${canEdit ? '' : 'disabled'} />
          <div class="lineup-actions" style="margin-top:0.5rem">
            ${canEdit ? `<button class="primary" id="save-lineup">${current.id ? 'Save' : 'Save lineup'}</button>` : ''}
            ${canEdit ? `<button class="btn-secondary" id="clear-pitch">Clear pitch</button>` : ''}
          </div>
          <div id="save-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
        `)}

        ${collapsibleCard('lineup-saved', 'Saved lineups', `
          <div class="lineup-list">${lineupsListHtml}</div>
          ${canEdit ? `<button class="btn-full" id="new-lineup-btn" style="margin-top:0.5rem">+ New lineup</button>` : ''}
        `)}
      </aside>

      <div class="lineup-center">
        <div class="card pitch-card">
          <div class="pitch" id="pitch">
            <svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
            <div class="slots-layer" id="slots-layer"></div>
            <canvas class="tactics-canvas" id="tactics-canvas"></canvas>
            <div class="ball-el" id="ball-el"></div>
          </div>
          <div class="subs-bar">
            <div class="subs-label">SUBSTITUTES (${current.subs.filter(Boolean).length}/${MAX_SUBS})</div>
            <div class="subs-row" id="subs-row"></div>
          </div>
        </div>
      </div>

      <aside class="lineup-right">
        ${collapsibleCard('lineup-formation', 'Formation', `
          <div class="f-btns f-btns-col">${formationBtns}</div>
        `)}
        ${collapsibleCard('lineup-players', 'Available players', `
          <div class="palette" id="palette">${paletteHtml}</div>
          ${canEdit ? `<p class="muted" style="font-size:0.75rem;margin-top:0.5rem">Tap a position on the pitch to pick a player, or drag on desktop.</p>` : ''}
        `)}
      </aside>
    </div>
  `;

  renderPitch();
  renderSubsBar();
  wireLineupEvents();
  initTacticsCanvas();
  initBall();
  sizeTacticsCanvas();
  drawTactics();
  renderBall();
  updateTacticsCanvasClass();
}

function chipHtml(player, context) {
  const num = player.number ?? '';
  return `
    <div class="chip ${context === 'palette' ? 'chip-palette' : ''}"
         draggable="${editor.canEdit ? 'true' : 'false'}"
         data-player-id="${player.id}">
      <div class="chip-inner">
        ${num !== '' ? `<div class="chip-num">${num}</div>` : ''}
        <div class="chip-name">${escapeHtml(shortName(player.name))}</div>
      </div>
    </div>
  `;
}

function renderPitch() {
  const slotsLayer = document.getElementById('slots-layer');
  if (!slotsLayer) return;
  const { current, players } = editor;
  const formation = getFormation(current.formation);
  if (!formation) { slotsLayer.innerHTML = ''; return; }

  const pById = id => players.find(p => p.id === id);

  const slotsHtml = formation.pos.map(([x, y], i) => {
    const pid = current.slots[i];
    const p = pid ? pById(pid) : null;
    const label = formation.lbl[i] || '';
    return `
      <div class="slot ${p ? 'filled' : ''}"
           style="left:${x}%; top:${y}%"
           data-slot="${i}">
        ${p
          ? `<div class="chip chip-slot" draggable="${editor.canEdit ? 'true' : 'false'}" data-player-id="${p.id}" data-from-slot="${i}">
              <div class="chip-inner">
                ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
              </div>
            </div>`
          : `<div class="slot-label">${label}</div>`
        }
        <div class="slot-pos-lbl">${label}</div>
      </div>
    `;
  }).join('');

  slotsLayer.innerHTML = slotsHtml;
}

// Kept as fallback helper (not currently called, but left in case)
function pitchSvgHtml() {
  return `<svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>`;
}

// Inner SVG markup (pitch lines) — placed inside the outer <svg> in render
function pitchSvgInner() {
  return `
      <!-- perimeter -->
      <rect x="1" y="1" width="98" height="98" fill="none" stroke="white" stroke-width="0.5" opacity="0.7"/>
      <!-- halfway line -->
      <line x1="1" y1="50" x2="99" y2="50" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- centre circle + spot -->
      <circle cx="50" cy="50" r="9" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <circle cx="50" cy="50" r="0.6" fill="white" opacity="0.8"/>
      <!-- top penalty area -->
      <rect x="18" y="1" width="64" height="16" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- top goal area -->
      <rect x="34" y="1" width="32" height="6" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- top penalty spot -->
      <circle cx="50" cy="11" r="0.6" fill="white" opacity="0.8"/>
      <!-- top penalty arc -->
      <path d="M 41 17 A 9 9 0 0 0 59 17" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- bottom penalty area -->
      <rect x="18" y="83" width="64" height="16" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- bottom goal area -->
      <rect x="34" y="93" width="32" height="6" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- bottom penalty spot -->
      <circle cx="50" cy="89" r="0.6" fill="white" opacity="0.8"/>
      <!-- bottom penalty arc -->
      <path d="M 41 83 A 9 9 0 0 1 59 83" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
  `;
}

function renderSubsBar() {
  const row = document.getElementById('subs-row');
  const { current, players } = editor;
  const pById = id => players.find(p => p.id === id);

  const cells = [];
  for (let i = 0; i < MAX_SUBS; i++) {
    const pid = current.subs[i];
    const p = pid ? pById(pid) : null;
    cells.push(`
      <div class="sub-slot ${p ? 'filled' : ''}" data-sub="${i}">
        ${p
          ? `<div class="chip chip-sub" draggable="${editor.canEdit ? 'true' : 'false'}" data-player-id="${p.id}" data-from-sub="${i}">
              <div class="chip-inner">
                ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
              </div>
            </div>`
          : `<div class="sub-empty">+</div>`
        }
      </div>
    `);
  }
  row.innerHTML = cells.join('');
}

function wireLineupEvents() {
  const { canEdit, team, lineups } = editor;
  const tabEl = document.getElementById('tab-content');

  // Formation buttons
  tabEl.querySelectorAll('[data-formation]').forEach(b => {
    b.onclick = () => {
      if (!canEdit) return;
      editor.current.formation = b.dataset.formation;
      // Drop any slotted players beyond the new formation's slot count
      const newCount = (getFormation(editor.current.formation)?.pos.length) || 0;
      Object.keys(editor.current.slots).forEach(k => {
        if (parseInt(k) >= newCount) delete editor.current.slots[k];
      });
      renderLineupsTab();
    };
  });

  // Meta inputs
  const nameEl = document.getElementById('l-name');
  const oppEl = document.getElementById('l-opponent');
  const dateEl = document.getElementById('l-date');
  if (nameEl) nameEl.oninput = e => { editor.current.name = e.target.value; };
  if (oppEl)  oppEl.oninput  = e => { editor.current.opponent = e.target.value; };
  if (dateEl) dateEl.oninput = e => { editor.current.game_date = e.target.value; };

  // Buttons
  const newBtn = document.getElementById('new-lineup-btn');
  if (newBtn) newBtn.onclick = () => {
    if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
    editor.current = newLineupState();
    renderLineupsTab();
  };

  const clearBtn = document.getElementById('clear-pitch');
  if (clearBtn) clearBtn.onclick = () => {
    editor.current.slots = {};
    editor.current.subs = [];
    renderLineupsTab();
  };

  const saveBtn = document.getElementById('save-lineup');
  if (saveBtn) saveBtn.onclick = saveLineup;

  // Click saved lineup to load
  tabEl.querySelectorAll('[data-lineup]').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('[data-del-lineup]')) return;
      const id = el.dataset.lineup;
      const l = lineups.find(x => x.id === id);
      if (!l) return;
      if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
      editor.current = {
        id: l.id,
        name: l.name || '',
        opponent: l.opponent || '',
        game_date: l.game_date || '',
        formation: l.data?.formation || '4-3-3',
        slots: { ...(l.data?.slots || {}) },
        subs: [...(l.data?.subs || [])],
        arrows: (l.data?.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(l.data?.zoneLines || [null, null])],
        ballVisible: !!l.data?.ballVisible,
        ballPos: { ...(l.data?.ballPos || { x: 50, y: 50 }) }
      };
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      renderLineupsTab();
    };
  });

  // Delete saved lineup
  tabEl.querySelectorAll('[data-del-lineup]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.delLineup;
      const l = lineups.find(x => x.id === id);
      if (!l) return;
      if (!confirm(`Delete lineup "${l.name}"?`)) return;
      const { error } = await supabase.from('lineups').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await logAudit(team.id, 'lineup', id, 'delete', { name: l.name });
      const idx = lineups.findIndex(x => x.id === id);
      if (idx >= 0) lineups.splice(idx, 1);
      if (editor.current.id === id) editor.current = newLineupState();
      renderLineupsTab();
    };
  });

  // Save as play
  const sap = document.getElementById('save-as-play');
  if (sap) sap.onclick = () => saveAsPlay();

  // Custom formation delete
  tabEl.querySelectorAll('[data-del-formation]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const id = btn.dataset.delFormation;
      if (!confirm('Delete this custom formation?')) return;
      const { error } = await supabase.from('formations').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      const cfs = editor.customFormations || [];
      const idx = cfs.findIndex(c => c.id === id);
      if (idx >= 0) cfs.splice(idx, 1);
      await logAudit(team.id, 'formation', id, 'delete', {});
      // If current lineup used it, reset to 4-3-3
      if (!getFormation(editor.current.formation)) editor.current.formation = '4-3-3';
      renderLineupsTab();
    };
  });

  wireCollapsibles(tabEl);

  if (canEdit) wireDragAndDrop();
  if (canEdit) wireTacticsUI();
  if (canEdit) wirePicker();
}

// Track <details> open/close into collapsedCards so state survives rerenders
function wireCollapsibles(root) {
  root.querySelectorAll('details.collapsible[data-card]').forEach(d => {
    d.addEventListener('toggle', () => {
      const id = d.dataset.card;
      if (d.open) collapsedCards.delete(id);
      else collapsedCards.add(id);
    });
  });
}

async function saveAsPlay() {
  const { team, current } = editor;
  const defaultName = current.name ? `${current.name} (play)` : 'Untitled play';
  const name = prompt('Name this play:', defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { alert('Name is required.'); return; }

  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    team_id: team.id,
    name: trimmed,
    created_by: user.id,
    data: {
      formation: current.formation,
      arrows: current.arrows,
      zoneLines: current.zoneLines,
      ballVisible: current.ballVisible,
      ballPos: current.ballPos
    }
  };
  const { data, error } = await supabase.from('plays').insert(payload).select().single();
  if (error) { alert('Save failed: ' + error.message); return; }
  editor.plays.unshift(data);
  await logAudit(team.id, 'play', data.id, 'create', { name: trimmed, from: 'lineup' });
  alert(`✓ Saved play "${trimmed}"`);
}

// Tap-to-pick: clicking any slot or sub slot opens a player picker modal.
// Works on both mouse and touch. HTML5 drag still works on desktop.
function wirePicker() {
  const tabEl = document.getElementById('tab-content');
  tabEl.querySelectorAll('[data-slot]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Ignore clicks that originated during a drag
      if (el.classList.contains('drag-over')) return;
      openPlayerPicker('slot', parseInt(el.dataset.slot, 10));
    });
  });
  tabEl.querySelectorAll('[data-sub]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('drag-over')) return;
      openPlayerPicker('sub', parseInt(el.dataset.sub, 10));
    });
  });
}

function openPlayerPicker(kind, idx) {
  const { current, players } = editor;
  const currentPid = kind === 'slot' ? current.slots[idx] : current.subs[idx];
  const currentPlayer = currentPid ? players.find(p => p.id === currentPid) : null;

  // Subs cap check (when placing into an empty sub slot)
  if (kind === 'sub' && !currentPid) {
    const subsFilled = current.subs.filter(Boolean).length;
    if (subsFilled >= MAX_SUBS) { alert(`Max ${MAX_SUBS} subs.`); return; }
  }

  const usedIds = new Set([...Object.values(current.slots), ...current.subs].filter(Boolean));
  const formation = getFormation(current.formation);
  const posLabel = kind === 'slot' ? (formation?.lbl?.[idx] || '') : '';

  // Available = all players NOT currently on pitch/subs (plus currentPlayer if slot is filled — no, exclude since swap via remove)
  const available = players
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

  const title = kind === 'slot'
    ? `Choose player${posLabel ? ' for ' + posLabel : ''}`
    : `Choose substitute`;

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.innerHTML = `
    <div class="picker-modal">
      <div class="picker-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="picker-close" aria-label="Close">✕</button>
      </div>
      <div class="picker-body">
        ${currentPlayer ? `
          <div class="picker-current">
            Currently: <strong>${escapeHtml(currentPlayer.name)}</strong>
            ${currentPlayer.number != null ? ' · #' + currentPlayer.number : ''}
          </div>
          <button class="picker-remove" data-action="remove">Remove from pitch</button>
        ` : ''}
        ${available.length
          ? `<div class="picker-list">
              ${available.map(p => `
                <button class="picker-item" data-pid="${p.id}">
                  <span class="picker-num">${p.number ?? '–'}</span>
                  <span class="picker-name">${escapeHtml(p.name)}</span>
                  <span class="picker-pos">${p.position || ''}</span>
                </button>
              `).join('')}
            </div>`
          : `<p class="muted" style="padding:1rem;text-align:center">All players are already on the pitch or subs. Remove someone first to swap.</p>`
        }
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.picker-close').onclick = close;

  overlay.querySelectorAll('[data-pid]').forEach(b => {
    b.onclick = () => {
      const pid = b.dataset.pid;
      const payload = { playerId: pid, fromSlot: null, fromSub: null };
      if (kind === 'slot') handleDropToSlot(idx, payload);
      else handleDropToSub(idx, payload);
      close();
    };
  });
  const rm = overlay.querySelector('[data-action=remove]');
  if (rm) rm.onclick = () => {
    if (kind === 'slot') delete current.slots[idx];
    else current.subs[idx] = undefined;
    renderLineupsTab();
    close();
  };
}

function wireTacticsUI() {
  const tabEl = document.getElementById('tab-content');
  tabEl.querySelectorAll('[data-tactic-mode]').forEach(b => {
    b.onclick = () => {
      const next = b.dataset.tacticMode;
      // clicking the active button turns it off
      setTacticMode(tacticMode === next ? null : next);
    };
  });
  const ballBtn = document.getElementById('btn-ball');
  if (ballBtn) ballBtn.onclick = () => toggleBall();
  [0, 1].forEach(i => {
    const chk = document.getElementById('chk-zone-' + i);
    const sl  = document.getElementById('slider-zone-' + i);
    if (chk) chk.onchange = () => toggleZoneLine(i);
    if (sl)  sl.oninput   = (e) => moveZoneLine(i, e.target.value);
  });
  const clA = document.getElementById('clear-arrows');
  if (clA) clA.onclick = () => clearArrows();
  const clT = document.getElementById('clear-tactics');
  if (clT) clT.onclick = () => clearTactics();
  const lfp = document.getElementById('load-from-play');
  if (lfp) lfp.onclick = () => openLoadFromPlay();
}

function openLoadFromPlay() {
  const { plays, current } = editor;
  if (!plays || !plays.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  const items = plays.map(p => `
    <div class="picker-item" data-play-id="${p.id}">
      <div class="picker-num">▶</div>
      <div class="picker-name">${escapeHtml(p.name)}</div>
      <div class="picker-pos">${escapeHtml(p.data?.formation || '')}</div>
    </div>
  `).join('');
  overlay.innerHTML = `
    <div class="picker-modal">
      <div class="picker-header">
        <strong>Load from play</strong>
        <button class="picker-close" data-action="close">✕</button>
      </div>
      <div class="picker-body">
        <p class="muted" style="margin:0 0 0.5rem">This replaces the current formation and tactics. Players on the pitch are kept where they fit.</p>
        <div class="picker-list">${items}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action=close]').onclick = close;
  overlay.querySelectorAll('[data-play-id]').forEach(el => {
    el.onclick = () => {
      const p = plays.find(x => x.id === el.dataset.playId);
      if (!p) return close();
      const d = p.data || {};
      current.formation = d.formation || current.formation;
      current.arrows = (d.arrows || []).map(a => ({ ...a }));
      current.zoneLines = [...(d.zoneLines || [null, null])];
      current.ballVisible = !!d.ballVisible;
      current.ballPos = { ...(d.ballPos || { x: 50, y: 50 }) };
      // Drop any slotted players beyond new formation's slot count
      const newCount = getFormation(current.formation)?.pos.length || 0;
      Object.keys(current.slots).forEach(k => {
        if (parseInt(k) >= newCount) delete current.slots[k];
      });
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      close();
      renderLineupsTab();
    };
  });
}

let _chipDragWired = false;
function wireDragAndDrop() {
  const tabEl = document.getElementById('tab-content');

  // Disable native HTML5 drag on chips
  tabEl.querySelectorAll('.chip').forEach(chip => {
    chip.setAttribute('draggable', 'false');
    chip.ondragstart = e => e.preventDefault();
  });

  // Wire document-level delegation once — persists across rerenders
  if (_chipDragWired) return;
  _chipDragWired = true;

  document.addEventListener('pointerdown', (e) => {
    if (!editor?.canEdit) return;
    if (e.button !== undefined && e.button !== 0) return;
    // Find the chip under the pointer (walk up from target)
    const chip = e.target.closest?.('.chip');
    if (!chip) return;
    // Only chips in the current tab
    if (!document.getElementById('tab-content')?.contains(chip)) return;
    e.preventDefault();
    e.stopPropagation();

    const pid = chip.dataset.playerId;
    const fromSlot = chip.dataset.fromSlot;
    const fromSub  = chip.dataset.fromSub;
    const payload = { playerId: pid, fromSlot: fromSlot ?? null, fromSub: fromSub ?? null };

    const startX = e.clientX, startY = e.clientY;
    const rect = chip.getBoundingClientRect();
    const offX = startX - (rect.left + rect.width / 2);
    const offY = startY - (rect.top + rect.height / 2);

    let ghost = null;
    let lastOver = null;
    let dragging = false;
    const DRAG_THRESHOLD = 4;

    const findTarget = (x, y) => {
      if (ghost) ghost.style.display = 'none';
      const el = document.elementFromPoint(x, y);
      if (ghost) ghost.style.display = '';
      if (!el) return null;
      return el.closest('[data-slot], [data-sub], #palette');
    };

    const startDrag = () => {
      dragging = true;
      chip.classList.add('dragging');
      ghost = chip.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '9999';
      ghost.style.opacity = '0.9';
      ghost.style.transform = 'scale(1.05)';
      ghost.classList.add('chip-ghost');
      document.body.appendChild(ghost);
    };

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        startDrag();
      }
      ghost.style.left = (ev.clientX - offX - rect.width / 2) + 'px';
      ghost.style.top  = (ev.clientY - offY - rect.height / 2) + 'px';

      const target = findTarget(ev.clientX, ev.clientY);
      if (target !== lastOver) {
        if (lastOver) lastOver.classList.remove('drag-over');
        if (target && (target.dataset.slot !== undefined || target.dataset.sub !== undefined)) {
          target.classList.add('drag-over');
        }
        lastOver = target;
      }
    };

    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      chip.classList.remove('dragging');
      if (lastOver) lastOver.classList.remove('drag-over');
      if (ghost) { ghost.remove(); ghost = null; }
      if (!dragging) return;

      const target = findTarget(ev.clientX, ev.clientY);
      if (!target) return;
      if (target.dataset.slot !== undefined) {
        handleDropToSlot(parseInt(target.dataset.slot, 10), payload);
      } else if (target.dataset.sub !== undefined) {
        handleDropToSub(parseInt(target.dataset.sub, 10), payload);
      } else if (target.id === 'palette') {
        handleDropToPalette(payload);
      }
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }, true); // CAPTURE PHASE — runs before any other handler can stopPropagation
}

function removeFromSource(payload) {
  const { current } = editor;
  if (payload.fromSlot !== null && payload.fromSlot !== undefined) {
    delete current.slots[parseInt(payload.fromSlot)];
  } else if (payload.fromSub !== null && payload.fromSub !== undefined) {
    current.subs[parseInt(payload.fromSub)] = undefined;
  }
}

function handleDropToSlot(slotIdx, payload) {
  const { current } = editor;
  const targetPid = current.slots[slotIdx];

  // If dropping from another slot and target occupied → swap
  if (payload.fromSlot !== null && payload.fromSlot !== undefined) {
    const fromIdx = parseInt(payload.fromSlot);
    if (fromIdx === slotIdx) return;
    if (targetPid) {
      current.slots[fromIdx] = targetPid;
    } else {
      delete current.slots[fromIdx];
    }
    current.slots[slotIdx] = payload.playerId;
    renderLineupsTab();
    return;
  }

  // From sub or palette: if slot occupied, bump occupant back to palette
  removeFromSource(payload);
  current.slots[slotIdx] = payload.playerId;
  renderLineupsTab();
}

function handleDropToSub(subIdx, payload) {
  const { current } = editor;
  const subsFilled = current.subs.filter(Boolean).length;
  const targetPid = current.subs[subIdx];

  // Swap with another sub
  if (payload.fromSub !== null && payload.fromSub !== undefined) {
    const fromIdx = parseInt(payload.fromSub);
    if (fromIdx === subIdx) return;
    current.subs[fromIdx] = targetPid;
    current.subs[subIdx] = payload.playerId;
    renderLineupsTab();
    return;
  }

  // From slot or palette — if empty and at cap, refuse
  if (!targetPid && subsFilled >= MAX_SUBS) {
    alert(`Max ${MAX_SUBS} subs.`);
    return;
  }
  removeFromSource(payload);
  current.subs[subIdx] = payload.playerId;
  renderLineupsTab();
}

function handleDropToPalette(payload) {
  removeFromSource(payload);
  renderLineupsTab();
}

function hasUnsaved() {
  // Rough check: any slots or subs populated, or meta fields entered, and no id
  const c = editor.current;
  if (!c) return false;
  if (c.id) return false; // saved lineups may have pending edits but don't prompt aggressively
  return Object.keys(c.slots).length > 0 || c.subs.some(Boolean) || c.name || c.opponent;
}

async function saveLineup() {
  const { team, lineups, current } = editor;
  const msgEl = document.getElementById('save-msg');
  msgEl.textContent = '';
  const name = current.name.trim();
  if (!name) { msgEl.textContent = 'Name is required'; msgEl.className = 'error'; return; }

  const payload = {
    team_id: team.id,
    name,
    opponent: current.opponent.trim() || null,
    game_date: current.game_date || null,
    data: {
      formation: current.formation,
      slots: current.slots,
      subs: current.subs,
      arrows: current.arrows,
      zoneLines: current.zoneLines,
      ballVisible: current.ballVisible,
      ballPos: current.ballPos
    },
    updated_at: new Date().toISOString()
  };

  if (current.id) {
    // Update
    const { data, error } = await supabase.from('lineups').update(payload).eq('id', current.id).select().single();
    if (error) { msgEl.textContent = error.message; msgEl.className = 'error'; return; }
    const idx = lineups.findIndex(l => l.id === current.id);
    if (idx >= 0) lineups[idx] = data;
    await logAudit(team.id, 'lineup', data.id, 'update', { name });
  } else {
    // Insert
    const { data: { user } } = await supabase.auth.getUser();
    payload.created_by = user.id;
    const { data, error } = await supabase.from('lineups').insert(payload).select().single();
    if (error) { msgEl.textContent = error.message; msgEl.className = 'error'; return; }
    lineups.unshift(data);
    editor.current.id = data.id;
    await logAudit(team.id, 'lineup', data.id, 'create', { name });
  }

  msgEl.textContent = '✓ Saved';
  msgEl.className = 'ok';
  setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
  renderLineupsTab();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Tactics ----------
function setTacticMode(m) {
  tacticMode = m;
  clickStart = null;
  dragCurrent = null;
  dragActive = false;
  movingIdx = null;
  const info = document.getElementById('tactic-info');
  if (info) {
    if (m === 'click') info.textContent = 'Click start, click again to place arrow.';
    else if (m === 'drag') info.textContent = 'Drag on pitch to draw arrow.';
    else if (m === 'move') info.textContent = 'Drag endpoints/body to move. Middle dot bends. Red X deletes. Drag zone lines to reposition.';
    else info.textContent = 'Pick a mode to edit tactics. Arrows and zones stay visible here.';
  }
  // update button active states without full rerender
  const tabEl = document.getElementById('tab-content');
  if (tabEl) {
    tabEl.querySelectorAll('[data-tactic-mode]').forEach(b => {
      const val = b.dataset.tacticMode || null;
      b.classList.toggle('active', val === (m || null));
    });
  }
  updateTacticsCanvasClass();
  drawTactics();
}

function updateTacticsCanvasClass() {
  const tc = document.getElementById('tactics-canvas');
  if (!tc) return;
  tc.classList.remove('tactic-active', 'line-drag-active');
  // Canvas captures pointer events only when a tactic mode is active.
  // This keeps player drag-drop working when the user isn't editing tactics.
  if (tacticMode === 'click' || tacticMode === 'drag') tc.classList.add('tactic-active');
  else if (tacticMode === 'move') tc.classList.add('line-drag-active');
}

function sizeTacticsCanvas() {
  const tc = document.getElementById('tactics-canvas');
  if (!tc) return;
  const w = tc.offsetWidth || 400, h = tc.offsetHeight || 300;
  if (tc.width !== w) tc.width = w;
  if (tc.height !== h) tc.height = h;
}

function evtPct(e, tc) {
  const r = tc.getBoundingClientRect();
  const cx = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
  const cy = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
  return {
    x: Math.min(100, Math.max(0, ((cx - r.left) / r.width) * 100)),
    y: Math.min(100, Math.max(0, ((cy - r.top) / r.height) * 100))
  };
}

function arrowDeleteBtnPos(a, w, h) {
  const ax2 = a.x2 / 100 * w, ay2 = a.y2 / 100 * h;
  const hasBend = (typeof a.cx === 'number' && typeof a.cy === 'number');
  const fx = hasBend ? a.cx / 100 * w : a.x1 / 100 * w;
  const fy = hasBend ? a.cy / 100 * h : a.y1 / 100 * h;
  const ang = Math.atan2(ay2 - fy, ax2 - fx);
  return { bx: ax2 + 12 * Math.cos(ang + Math.PI / 2), by: ay2 + 12 * Math.sin(ang + Math.PI / 2) };
}

function hitArrow(p, tc) {
  const arrows = editor.current.arrows;
  const w = tc.offsetWidth, h = tc.offsetHeight, px = p.x / 100 * w, py = p.y / 100 * h;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    const ax1 = a.x1 / 100 * w, ay1 = a.y1 / 100 * h, ax2 = a.x2 / 100 * w, ay2 = a.y2 / 100 * h;
    if (tacticMode === 'move') {
      const { bx, by } = arrowDeleteBtnPos(a, w, h);
      if (Math.hypot(px - bx, py - by) < 9) return { i, end: 'delete' };
    }
    if (Math.hypot(px - ax1, py - ay1) < 14) return { i, end: 'start' };
    if (Math.hypot(px - ax2, py - ay2) < 14) return { i, end: 'end' };
    const hasBend = (typeof a.cx === 'number' && typeof a.cy === 'number');
    const bxp = hasBend ? a.cx : (a.x1 + a.x2) / 2;
    const byp = hasBend ? a.cy : (a.y1 + a.y2) / 2;
    const bx = bxp / 100 * w, by = byp / 100 * h;
    if (Math.hypot(px - bx, py - by) < 12) return { i, end: 'bend' };
    const dx = ax2 - ax1, dy = ay2 - ay1, len = Math.hypot(dx, dy);
    if (len > 0) {
      const t = Math.max(0, Math.min(1, ((px - ax1) * dx + (py - ay1) * dy) / (len * len)));
      if (Math.hypot(px - (ax1 + t * dx), py - (ay1 + t * dy)) < 12) return { i, end: 'body' };
    }
  }
  return null;
}

let _tacticsInited = false;
function initTacticsCanvas() {
  const tc = document.getElementById('tactics-canvas');
  if (!tc || tc.dataset.inited === '1') return;
  tc.dataset.inited = '1';

  const onDown = (e) => {
    const c = editor.current;
    const isRight = e.button === 2;
    e.preventDefault();
    const p = evtPct(e, tc);
    if (isRight) {
      const hit = hitArrow(p, tc);
      if (hit) {
        if (hit.end === 'bend' && typeof c.arrows[hit.i].cx === 'number') {
          delete c.arrows[hit.i].cx; delete c.arrows[hit.i].cy;
        } else {
          c.arrows.splice(hit.i, 1);
        }
        updateTacticsCanvasClass(); drawTactics();
      }
      return;
    }
    if (tacticMode === 'move') {
      const hit = hitArrow(p, tc);
      if (hit && hit.end === 'delete') { c.arrows.splice(hit.i, 1); updateTacticsCanvasClass(); drawTactics(); return; }
      if (hit) { movingIdx = hit.i; movingEnd = hit.end; movingOx = p.x; movingOy = p.y; return; }
      for (let i = 0; i < c.zoneLines.length; i++) {
        if (c.zoneLines[i] !== null && Math.abs(p.y - c.zoneLines[i]) < 5) {
          draggingLineIdx = i; draggingLineStartY = (e.clientY ?? 0); draggingLinePct = c.zoneLines[i]; return;
        }
      }
      return;
    }
    if (tacticMode === 'click') {
      if (!clickStart) { clickStart = p; }
      else {
        if (Math.hypot(p.x - clickStart.x, p.y - clickStart.y) > 2) {
          c.arrows.push({ x1: clickStart.x, y1: clickStart.y, x2: p.x, y2: p.y });
        }
        clickStart = null; updateTacticsCanvasClass();
      }
      drawTactics();
    } else {
      dragActive = true;
      dragCurrent = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }
  };

  const onMove = (e) => {
    const c = editor.current;
    const p = evtPct(e, tc);
    if (movingIdx !== null) {
      const a = c.arrows[movingIdx];
      const dx = p.x - movingOx, dy = p.y - movingOy;
      const cl = v => Math.min(99, Math.max(1, v));
      if (movingEnd === 'start') { a.x1 = cl(a.x1 + dx); a.y1 = cl(a.y1 + dy); }
      else if (movingEnd === 'end') { a.x2 = cl(a.x2 + dx); a.y2 = cl(a.y2 + dy); }
      else if (movingEnd === 'bend') { a.cx = cl(p.x); a.cy = cl(p.y); }
      else {
        a.x1 = cl(a.x1 + dx); a.y1 = cl(a.y1 + dy); a.x2 = cl(a.x2 + dx); a.y2 = cl(a.y2 + dy);
        if (typeof a.cx === 'number') a.cx = cl(a.cx + dx);
        if (typeof a.cy === 'number') a.cy = cl(a.cy + dy);
      }
      movingOx = p.x; movingOy = p.y;
      drawTactics();
      return;
    }
    if (draggingLineIdx !== null) {
      const pitch = document.getElementById('pitch');
      const newY = Math.min(92, Math.max(5, draggingLinePct + (((e.clientY ?? 0) - draggingLineStartY) / pitch.offsetHeight) * 100));
      c.zoneLines[draggingLineIdx] = newY;
      const sl = document.getElementById('slider-zone-' + draggingLineIdx);
      if (sl) sl.value = Math.round(newY);
      drawTactics();
      return;
    }
    if (tacticMode === 'click' && clickStart) { dragCurrent = { ...clickStart, x2: p.x, y2: p.y }; drawTactics(); }
    if (tacticMode === 'drag' && dragActive) { dragCurrent.x2 = p.x; dragCurrent.y2 = p.y; drawTactics(); }
    if (tacticMode === 'move') {
      const hit = hitArrow(p, tc);
      const nearLine = c.zoneLines.some(z => z !== null && Math.abs(p.y - z) < 5);
      tc.style.cursor = hit
        ? (hit.end === 'body' ? 'move' : hit.end === 'bend' ? 'grab' : hit.end === 'delete' ? 'pointer' : 'crosshair')
        : nearLine ? 'ns-resize' : 'default';
    }
  };

  const onUp = (e) => {
    const c = editor.current;
    if (movingIdx !== null) { movingIdx = null; return; }
    if (draggingLineIdx !== null) { draggingLineIdx = null; return; }
    if (tacticMode === 'drag' && dragActive) {
      const p = evtPct(e, tc);
      if (Math.hypot(p.x - dragCurrent.x1, p.y - dragCurrent.y1) > 3) {
        c.arrows.push({ ...dragCurrent, x2: p.x, y2: p.y });
      }
      dragActive = false; dragCurrent = null;
      updateTacticsCanvasClass(); drawTactics();
    }
  };

  tc.addEventListener('pointerdown', onDown);
  tc.addEventListener('pointermove', onMove);
  tc.addEventListener('pointerup', onUp);
  tc.addEventListener('pointercancel', onUp);
  tc.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerup', () => { movingIdx = null; draggingLineIdx = null; });

  window.addEventListener('resize', () => { sizeTacticsCanvas(); drawTactics(); });
}

function drawTactics() {
  const tc = document.getElementById('tactics-canvas');
  if (!tc || !editor) return;
  const c = editor.current;
  sizeTacticsCanvas();
  const w = tc.width, h = tc.height;
  const ctx = tc.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Zone lines
  c.zoneLines.forEach((y, i) => {
    if (y === null) return;
    const z = ZONES[i], py = y / 100 * h;
    ctx.save();
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = z.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = z.color; ctx.globalAlpha = 0.92;
    ctx.fillRect(w - 46, py - 13, 42, 16);
    ctx.fillStyle = '#000'; ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(z.label, w - 25, py - 5);
    ctx.restore();
  });

  const arrow = (x1p, y1p, x2p, y2p, preview, cxp, cyp) => {
    const x1 = x1p / 100 * w, y1 = y1p / 100 * h, x2 = x2p / 100 * w, y2 = y2p / 100 * h;
    const hasBend = (typeof cxp === 'number' && typeof cyp === 'number');
    const cxv = hasBend ? cxp / 100 * w : 0, cyv = hasBend ? cyp / 100 * h : 0;
    const len = Math.hypot(x2 - x1, y2 - y1); if (len < 4) return;
    const ang = hasBend ? Math.atan2(y2 - cyv, x2 - cxv) : Math.atan2(y2 - y1, x2 - x1);
    const hl = Math.min(20, len * 0.38);
    ctx.save();
    ctx.strokeStyle = preview ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,0,0.95)';
    ctx.fillStyle   = preview ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,0,0.95)';
    ctx.lineWidth = preview ? 1.8 : 2.5;
    if (preview) ctx.setLineDash([5, 4]);
    ctx.globalAlpha = preview ? 0.65 : 1;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    if (hasBend) ctx.quadraticCurveTo(cxv, cyv, x2, y2); else ctx.lineTo(x2, y2);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
    ctx.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
    if (tacticMode === 'move' && !preview) {
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(255,220,0,0.9)'; ctx.lineWidth = 1.5;
      [[x1, y1], [x2, y2]].forEach(([hx, hy]) => {
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      let bhx, bhy;
      if (hasBend) { bhx = 0.25 * x1 + 0.5 * cxv + 0.25 * x2; bhy = 0.25 * y1 + 0.5 * cyv + 0.25 * y2; }
      else { bhx = (x1 + x2) / 2; bhy = (y1 + y2) / 2; }
      ctx.globalAlpha = hasBend ? 0.95 : 0.55;
      ctx.fillStyle = hasBend ? 'rgba(255,220,0,0.95)' : '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(bhx, bhy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const fx = hasBend ? cxv : x1, fy = hasBend ? cyv : y1;
      const ang2 = Math.atan2(y2 - fy, x2 - fx);
      const bx = x2 + 12 * Math.cos(ang2 + Math.PI / 2), by = y2 + 12 * Math.sin(ang2 + Math.PI / 2);
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(220,40,40,0.95)';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - 3); ctx.lineTo(bx + 3, by + 3);
      ctx.moveTo(bx + 3, by - 3); ctx.lineTo(bx - 3, by + 3);
      ctx.stroke();
    }
    ctx.restore();
  };
  c.arrows.forEach(a => arrow(a.x1, a.y1, a.x2, a.y2, false, a.cx, a.cy));
  if (tacticMode === 'drag' && dragActive && dragCurrent) arrow(dragCurrent.x1, dragCurrent.y1, dragCurrent.x2, dragCurrent.y2, true);
  if (tacticMode === 'click' && clickStart && dragCurrent) arrow(clickStart.x, clickStart.y, dragCurrent.x2, dragCurrent.y2, true);
  if (clickStart) {
    const cx = clickStart.x / 100 * w, cy = clickStart.y / 100 * h;
    ctx.save(); ctx.strokeStyle = 'rgba(255,220,0,0.9)'; ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function toggleZoneLine(idx) {
  const c = editor.current;
  const sl = document.getElementById('slider-zone-' + idx);
  if (c.zoneLines[idx] !== null) {
    c.zoneLines[idx] = null;
    if (sl) sl.disabled = true;
  } else {
    c.zoneLines[idx] = ZONES[idx].defaultY;
    if (sl) { sl.disabled = false; sl.value = Math.round(ZONES[idx].defaultY); }
  }
  updateTacticsCanvasClass();
  drawTactics();
}
function moveZoneLine(idx, val) {
  const c = editor.current;
  if (c.zoneLines[idx] === null) return;
  c.zoneLines[idx] = parseFloat(val);
  drawTactics();
}
function clearArrows() {
  editor.current.arrows = [];
  clickStart = null; dragCurrent = null; dragActive = false; movingIdx = null;
  updateTacticsCanvasClass(); drawTactics();
}
function clearTactics() {
  const c = editor.current;
  c.arrows = [];
  c.zoneLines = [null, null];
  [0, 1].forEach(i => {
    const chk = document.getElementById('chk-zone-' + i);
    const sl  = document.getElementById('slider-zone-' + i);
    if (chk) chk.checked = false;
    if (sl)  sl.disabled = true;
  });
  setTacticMode(null);
}

// Ball
function toggleBall() {
  const c = editor.current;
  c.ballVisible = !c.ballVisible;
  const btn = document.getElementById('btn-ball');
  if (btn) btn.classList.toggle('active', c.ballVisible);
  renderBall();
}
function renderBall() {
  const el = document.getElementById('ball-el');
  if (!el) return;
  const c = editor.current;
  if (!c.ballVisible) { el.classList.remove('visible'); el.innerHTML = ''; return; }
  el.classList.add('visible');
  el.style.left = c.ballPos.x + '%';
  el.style.top  = c.ballPos.y + '%';
  const size = 48, disp = 16;
  let cnv = el.querySelector('canvas');
  if (!cnv) {
    cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    cnv.style.width = disp + 'px'; cnv.style.height = disp + 'px';
    el.appendChild(cnv);
  }
  drawSoccerBall(cnv.getContext('2d'), size);
}
function pentagonPath(ctx, cx, cy, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + i * (2 * Math.PI / 5);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function drawSoccerBall(ctx, s) {
  const cx = s / 2, cy = s / 2, r = s / 2 - 1.5;
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.035); ctx.strokeStyle = '#111'; ctx.stroke();
  const centerR = r * 0.26;
  pentagonPath(ctx, cx, cy, centerR, -Math.PI / 2);
  ctx.fillStyle = '#111'; ctx.fill();
  const outerDist = r * 0.78, outerR = r * 0.24;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * (2 * Math.PI / 5);
    const ox = cx + outerDist * Math.cos(a), oy = cy + outerDist * Math.sin(a);
    pentagonPath(ctx, ox, oy, outerR, a);
    ctx.fillStyle = '#111'; ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.42, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
}
function initBall() {
  const el = document.getElementById('ball-el');
  const pitch = document.getElementById('pitch');
  if (!el || !pitch || el.dataset.inited === '1') return;
  el.dataset.inited = '1';
  let dr = false, sx = 0, sy = 0, bx = 0, by = 0;
  el.addEventListener('pointerdown', (e) => {
    if (!editor?.canEdit) return;
    e.preventDefault(); e.stopPropagation();
    const c = editor.current;
    dr = true; sx = e.clientX; sy = e.clientY; bx = c.ballPos.x; by = c.ballPos.y;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dr) return;
    const c = editor.current;
    const r = pitch.getBoundingClientRect();
    c.ballPos.x = Math.min(98, Math.max(2, bx + ((e.clientX - sx) / r.width) * 100));
    c.ballPos.y = Math.min(98, Math.max(2, by + ((e.clientY - sy) / r.height) * 100));
    el.style.left = c.ballPos.x + '%';
    el.style.top  = c.ballPos.y + '%';
  });
  const end = () => { dr = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---------- Plays tab ----------
function renderPlaysTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, plays, customFormations, current } = editor;

  const FORMS = allFormations(customFormations);
  const formationBtns = Object.keys(FORMS).map(f => {
    const cid = FORMS[f]._customId;
    return `<button class="f-btn ${current.formation === f ? 'active' : ''}${cid ? ' f-btn-custom' : ''}" data-formation="${f}">${escapeHtml(f)}${cid && canEdit ? `<span class="f-del" data-del-formation="${cid}" title="Delete">✕</span>` : ''}</button>`;
  }).join('');

  const playsListHtml = plays.length
    ? plays.map(p => `
        <div class="lineup-item ${current.id === p.id ? 'active' : ''}" data-play="${p.id}">
          <div class="lineup-name">${escapeHtml(p.name)}</div>
          <div class="lineup-meta">${p.data?.formation ? escapeHtml(p.data.formation) : ''}</div>
          ${canEdit ? `<button class="lineup-del" data-del-play="${p.id}" title="Delete">✕</button>` : ''}
        </div>
      `).join('')
    : `<p class="muted" style="padding:0.75rem">No saved plays yet.</p>`;

  const editing = !!formationEdit;

  tabEl.innerHTML = `
    <div class="lineup-layout">
      <aside class="lineup-left">
        ${canEdit ? collapsibleCard('play-tactics', 'Tactics', `
          <div class="tactic-btns">
            <button class="tactic-btn ${tacticMode === 'move' ? 'active' : ''}" data-tactic-mode="move">▶ Move</button>
            <button class="tactic-btn ${tacticMode === 'click' ? 'active' : ''}" data-tactic-mode="click">→ Click</button>
            <button class="tactic-btn ${tacticMode === 'drag' ? 'active' : ''}" data-tactic-mode="drag">↗ Drag</button>
            <button class="tactic-btn ${current.ballVisible ? 'active' : ''}" id="btn-ball">⚽ Ball</button>
          </div>
          <div id="tactic-info" class="tactic-info">Pick a mode to edit tactics.</div>
          <div class="zone-row">
            <label class="zone-label"><span class="zone-swatch" style="border-top:3px dashed #ffeb3b"></span>Press
              <input type="checkbox" id="chk-zone-0" ${current.zoneLines[0] !== null ? 'checked' : ''} />
            </label>
            <input type="range" id="slider-zone-0" min="5" max="92" value="${current.zoneLines[0] ?? ZONES[0].defaultY}" ${current.zoneLines[0] === null ? 'disabled' : ''} />
          </div>
          <div class="zone-row">
            <label class="zone-label"><span class="zone-swatch" style="border-top:3px dashed #ff7043"></span>Def
              <input type="checkbox" id="chk-zone-1" ${current.zoneLines[1] !== null ? 'checked' : ''} />
            </label>
            <input type="range" id="slider-zone-1" min="5" max="92" value="${current.zoneLines[1] ?? ZONES[1].defaultY}" ${current.zoneLines[1] === null ? 'disabled' : ''} />
          </div>
          <button class="btn-full" id="clear-arrows">✕ Clear arrows</button>
          <button class="btn-full" id="clear-tactics" style="margin-bottom:0">✕ Clear all tactics</button>
        `) : ''}

        ${collapsibleCard('play-details', 'Play details', `
          <label>Name</label>
          <input type="text" id="p-name" value="${escapeHtml(current.name)}" placeholder="e.g. High press from goal kick" ${canEdit ? '' : 'disabled'} />
          <div class="lineup-actions" style="margin-top:0.5rem">
            ${canEdit ? `<button class="primary" id="save-play">${current.id ? 'Save' : 'Save play'}</button>` : ''}
            ${canEdit ? `<button class="btn-secondary" id="new-play-btn">New</button>` : ''}
          </div>
          <div id="save-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
        `)}

        ${collapsibleCard('play-saved', 'Saved plays', `
          <div class="lineup-list">${playsListHtml}</div>
        `)}
      </aside>

      <div class="lineup-center">
        <div class="card pitch-card">
          <div class="pitch ${editing ? 'pitch-editing-formation' : ''}" id="pitch">
            <svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
            <div class="slots-layer" id="slots-layer"></div>
            <canvas class="tactics-canvas" id="tactics-canvas"></canvas>
            <div class="ball-el" id="ball-el"></div>
          </div>
          <p class="muted" style="margin:0.5rem 0 0;font-size:0.8rem;text-align:center">${editing ? 'Editing formation — drag dots, click labels to rename.' : 'Plays are tactical templates — no players. Use them from the Lineup editor via "Load from play".'}</p>
        </div>
      </div>

      <aside class="lineup-right">
        ${collapsibleCard('play-formation', editing ? 'Edit formation' : 'Formation', formationCardHtml(canEdit, formationBtns))}
      </aside>
    </div>
  `;

  if (editing) renderFormationEditor(renderPlaysTab);
  else renderPitch();
  wirePlayEvents();
  initTacticsCanvas();
  initBall();
  sizeTacticsCanvas();
  drawTactics();
  renderBall();
  updateTacticsCanvasClass();
}

// Render slot dots from formationEdit state; attach drag handlers
// Formation card body — reused in Lineups and Plays tabs
function formationCardHtml(canEdit, formationBtns) {
  if (formationEdit) {
    return `
      <p class="muted" style="font-size:0.75rem;margin:0 0 0.5rem">Drag circles to reposition. Click label to rename.</p>
      <input type="text" id="fe-name" value="${escapeHtml(formationEdit.name)}" placeholder="e.g. 4-3-3 custom" />
      <button class="primary btn-full" id="fe-save" style="margin-top:0.5rem">✱ Save as formation</button>
      <button class="btn-full" id="fe-save-as-play" style="margin-top:0.35rem">✚ Save as play</button>
      <button class="btn-full" id="fe-cancel" style="margin-bottom:0;margin-top:0.35rem">Done</button>
    `;
  }
  return `
    <div class="f-btns f-btns-col">${formationBtns}</div>
    ${canEdit ? `<button class="btn-full" id="new-formation-btn" style="margin-top:0.5rem;margin-bottom:0">+ Custom formation</button>` : ''}
  `;
}

// Render formation-edit dots on the pitch (drag to move, click label to rename)
function renderFormationEditor(rerender) {
  const slotsLayer = document.getElementById('slots-layer');
  if (!slotsLayer || !formationEdit) return;
  const { pos, lbl } = formationEdit;
  slotsLayer.innerHTML = pos.map(([x, y], i) => `
    <div class="slot slot-edit" style="left:${x}%; top:${y}%" data-fe-slot="${i}">
      <div class="fe-label" data-fe-label="${i}">${escapeHtml(lbl[i] || '')}</div>
    </div>
  `).join('');

  const pitch = document.getElementById('pitch');

  slotsLayer.querySelectorAll('[data-fe-slot]').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      // If pointer started on the label, let click handler open the rename prompt
      if (e.target.closest('[data-fe-label]')) return;
      e.preventDefault();
      const idx = parseInt(el.dataset.feSlot);
      const rect = pitch.getBoundingClientRect();
      const startX = formationEdit.pos[idx][0];
      const startY = formationEdit.pos[idx][1];
      const origX = e.clientX, origY = e.clientY;
      el.classList.add('dragging');

      const move = (ev) => {
        const dx = (ev.clientX - origX) / rect.width * 100;
        const dy = (ev.clientY - origY) / rect.height * 100;
        const nx = Math.max(2, Math.min(98, startX + dx));
        const ny = Math.max(2, Math.min(98, startY + dy));
        formationEdit.pos[idx] = [nx, ny];
        el.style.left = nx + '%';
        el.style.top = ny + '%';
      };
      const up = () => {
        el.classList.remove('dragging');
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
  });

  slotsLayer.querySelectorAll('[data-fe-label]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.feLabel);
      const next = prompt('Position label:', formationEdit.lbl[idx] || '');
      if (next === null) return;
      formationEdit.lbl[idx] = next.trim().toUpperCase().slice(0, 5);
      if (rerender) rerender();
    });
  });
}

// Wire formation-edit buttons (New / Save / Done / Name input) in either tab
function wireFormationEdit(rerender) {
  const newFormBtn = document.getElementById('new-formation-btn');
  if (newFormBtn) newFormBtn.onclick = () => {
    const base = getFormation(editor.current.formation) || FORMATIONS['4-3-3'];
    formationEdit = {
      name: editor.current.formation + ' custom',
      pos: base.pos.map(p => [...p]),
      lbl: [...base.lbl]
    };
    rerender();
  };
  const feSave = document.getElementById('fe-save');
  if (feSave) feSave.onclick = () => saveCustomFormation(rerender);
  const feSaveAsPlay = document.getElementById('fe-save-as-play');
  if (feSaveAsPlay) feSaveAsPlay.onclick = () => saveFormationEditAsPlay(rerender);
  const feCancel = document.getElementById('fe-cancel');
  if (feCancel) feCancel.onclick = () => { formationEdit = null; rerender(); };
  const feName = document.getElementById('fe-name');
  if (feName) feName.oninput = e => { formationEdit.name = e.target.value; };
}

function wirePlayEvents() {
  const { canEdit, team, plays } = editor;
  const tabEl = document.getElementById('tab-content');

  tabEl.querySelectorAll('[data-formation]').forEach(b => {
    b.onclick = (ev) => {
      if (ev.target.closest('[data-del-formation]')) return;
      if (!canEdit) return;
      editor.current.formation = b.dataset.formation;
      renderPlaysTab();
    };
  });

  // Delete custom formation
  tabEl.querySelectorAll('[data-del-formation]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const id = btn.dataset.delFormation;
      if (!confirm('Delete this custom formation?')) return;
      const { error } = await supabase.from('formations').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      const cfs = editor.customFormations || [];
      const idx = cfs.findIndex(c => c.id === id);
      if (idx >= 0) cfs.splice(idx, 1);
      await logAudit(team.id, 'formation', id, 'delete', {});
      if (!getFormation(editor.current.formation)) editor.current.formation = '4-3-3';
      renderPlaysTab();
    };
  });

  if (canEdit) wireFormationEdit(renderPlaysTab);

  const nameEl = document.getElementById('p-name');
  if (nameEl) nameEl.oninput = e => { editor.current.name = e.target.value; };

  const newBtn = document.getElementById('new-play-btn');
  if (newBtn) newBtn.onclick = () => {
    const c = editor.current;
    const unsaved = !c.id && (c.name || c.arrows.length || c.ballVisible || c.zoneLines.some(z => z !== null));
    if (unsaved && !confirm('Discard current unsaved play?')) return;
    editor.current = newPlayState();
    tacticMode = null;
    renderPlaysTab();
  };

  const saveBtn = document.getElementById('save-play');
  if (saveBtn) saveBtn.onclick = savePlay;

  tabEl.querySelectorAll('[data-play]').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('[data-del-play]')) return;
      const id = el.dataset.play;
      const p = plays.find(x => x.id === id);
      if (!p) return;
      editor.current = {
        id: p.id,
        name: p.name || '',
        formation: p.data?.formation || '4-3-3',
        slots: {},
        subs: [],
        arrows: (p.data?.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(p.data?.zoneLines || [null, null])],
        ballVisible: !!p.data?.ballVisible,
        ballPos: { ...(p.data?.ballPos || { x: 50, y: 50 }) }
      };
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      renderPlaysTab();
    };
  });

  tabEl.querySelectorAll('[data-del-play]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.delPlay;
      const p = plays.find(x => x.id === id);
      if (!p) return;
      if (!confirm(`Delete play "${p.name}"?`)) return;
      const { error } = await supabase.from('plays').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await logAudit(team.id, 'play', id, 'delete', { name: p.name });
      const idx = plays.findIndex(x => x.id === id);
      if (idx >= 0) plays.splice(idx, 1);
      if (editor.current.id === id) editor.current = newPlayState();
      renderPlaysTab();
    };
  });

  wireCollapsibles(tabEl);

  if (canEdit && !formationEdit) wireTacticsUI();
}

async function saveCustomFormation(rerender) {
  const { team, customFormations } = editor;
  const fe = formationEdit;
  if (!fe) return;
  const name = (fe.name || '').trim();
  if (!name) { alert('Give the formation a name.'); return; }
  if (FORMATIONS[name]) { alert(`"${name}" is a preset name. Pick a different name.`); return; }

  const payload = {
    team_id: team.id,
    name,
    data: { pos: fe.pos, lbl: fe.lbl }
  };
  const { data, error } = await supabase.from('formations').insert(payload).select().single();
  if (error) { alert('Save failed: ' + error.message); return; }
  customFormations.push(data);
  await logAudit(team.id, 'formation', data.id, 'create', { name });
  editor.current.formation = name;
  formationEdit = null;
  if (rerender) rerender();
}

async function saveFormationEditAsPlay(rerender) {
  const { team, plays, current } = editor;
  const fe = formationEdit;
  if (!fe) return;
  const name = prompt('Play name:', (fe.name || 'New play').trim() || 'New play');
  if (!name) return;
  const formationName = (fe.name || '').trim() || name;

  // Ensure the formation exists (save inline if new) so the play references something real
  let formationRef = formationName;
  if (!FORMATIONS[formationName] && !editor.customFormations.some(c => c.name === formationName)) {
    const { data, error } = await supabase.from('formations').insert({
      team_id: team.id, name: formationName, data: { pos: fe.pos, lbl: fe.lbl }
    }).select().single();
    if (error) { alert('Save failed: ' + error.message); return; }
    editor.customFormations.push(data);
  }

  const payload = {
    team_id: team.id,
    name,
    formation: formationRef,
    data: {
      formationPos: fe.pos,
      formationLbl: fe.lbl,
      arrows: current?.arrows || [],
      zones: current?.zones || [],
      ball: current?.ballPos || null,
      ballVisible: !!current?.ballVisible
    }
  };
  const { data, error } = await supabase.from('plays').insert(payload).select().single();
  if (error) { alert('Save failed: ' + error.message); return; }
  plays.push(data);
  await logAudit(team.id, 'play', data.id, 'create', { name });
  formationEdit = null;
  alert('Play saved: ' + name);
  if (rerender) rerender();
}

async function savePlay() {
  const { team, plays, current } = editor;
  const msgEl = document.getElementById('save-msg');
  msgEl.textContent = '';
  const name = current.name.trim();
  if (!name) { msgEl.textContent = 'Name is required'; msgEl.className = 'error'; return; }

  const payload = {
    team_id: team.id,
    name,
    data: {
      formation: current.formation,
      arrows: current.arrows,
      zoneLines: current.zoneLines,
      ballVisible: current.ballVisible,
      ballPos: current.ballPos
    },
    updated_at: new Date().toISOString()
  };

  if (current.id) {
    const { data, error } = await supabase.from('plays').update(payload).eq('id', current.id).select().single();
    if (error) { msgEl.textContent = error.message; msgEl.className = 'error'; return; }
    const idx = plays.findIndex(p => p.id === current.id);
    if (idx >= 0) plays[idx] = data;
    await logAudit(team.id, 'play', data.id, 'update', { name });
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    payload.created_by = user.id;
    const { data, error } = await supabase.from('plays').insert(payload).select().single();
    if (error) { msgEl.textContent = error.message; msgEl.className = 'error'; return; }
    plays.unshift(data);
    editor.current.id = data.id;
    await logAudit(team.id, 'play', data.id, 'create', { name });
  }

  msgEl.textContent = '✓ Saved';
  msgEl.className = 'ok';
  setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
  renderPlaysTab();
}

// Kick off
render();
