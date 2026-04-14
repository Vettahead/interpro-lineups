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

async function render() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    renderAuth();
    userBar.innerHTML = '';
    return;
  }
  renderUserBar(session.user);

  const route = currentRoute();
  if (route.name === 'team') {
    await renderTeamDashboard(session.user, route.teamId);
  } else {
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

// In-memory editor state for lineups tab
let editor = null; // { team, canEdit, players, lineups, current: { id?, name, opponent, game_date, formation, slots, subs } }

async function renderTeamDashboard(user, teamId) {
  appEl.innerHTML = `<p class="loading">Loading team…</p>`;

  const [teamRes, memberRes, playersRes, lineupsRes] = await Promise.all([
    supabase.from('teams').select('id, name').eq('id', teamId).single(),
    supabase.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle(),
    supabase.from('players').select('*').eq('team_id', teamId).order('number', { ascending: true, nullsFirst: false }).order('name'),
    supabase.from('lineups').select('*').eq('team_id', teamId).order('game_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
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

  appEl.innerHTML = `
    <div class="breadcrumb"><a href="#" onclick="event.preventDefault();location.hash=''">← Your teams</a></div>
    <div class="card">
      <div class="team-header">
        <div>
          <h2 style="margin:0">${escapeHtml(team.name)}</h2>
          <div class="muted">Role: ${role}</div>
        </div>
      </div>
      <div class="tabs-row">
        <button class="tab-btn ${activeTab === 'squad' ? 'active' : ''}" data-tab="squad">Squad</button>
        <button class="tab-btn ${activeTab === 'lineups' ? 'active' : ''}" data-tab="lineups">Lineups</button>
        <button class="tab-btn" disabled title="Coming soon">Plays</button>
      </div>
    </div>
    <div id="tab-content"></div>
  `;

  appEl.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
    b.onclick = () => {
      activeTab = b.dataset.tab;
      renderTeamDashboard(user, teamId);
    };
  });

  if (activeTab === 'squad') {
    renderSquadTab(team, canEdit, players);
  } else if (activeTab === 'lineups') {
    editor = {
      team, canEdit, players, lineups,
      current: newLineupState()
    };
    renderLineupsTab();
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

  const cardHtml = (p) => `
    <div class="sc-card" data-player="${p.id}">
      <div class="sc-top">
        <div class="num-badge">${p.number ?? '–'}</div>
        <input class="name-input" value="${escapeHtml(p.name || '')}" data-field="name" ${canEdit ? '' : 'disabled'} />
      </div>
      <label>Number</label>
      <input type="number" class="field" min="1" max="99" value="${p.number ?? ''}" data-field="number" ${canEdit ? '' : 'disabled'} />
      <label>Position</label>
      <select class="field" data-field="position" ${canEdit ? '' : 'disabled'}>${posOptions(p.position || '')}</select>
      <label>Parent 1 name</label>
      <input type="text" class="field" value="${escapeHtml(p.parent1_name || '')}" data-field="parent1_name" ${canEdit ? '' : 'disabled'} />
      <label>Parent 1 phone</label>
      <input type="tel" class="field" value="${escapeHtml(p.parent1_phone || '')}" data-field="parent1_phone" ${canEdit ? '' : 'disabled'} />
      <label>Parent 2 name</label>
      <input type="text" class="field" value="${escapeHtml(p.parent2_name || '')}" data-field="parent2_name" ${canEdit ? '' : 'disabled'} />
      <label>Parent 2 phone</label>
      <input type="tel" class="field" value="${escapeHtml(p.parent2_phone || '')}" data-field="parent2_phone" ${canEdit ? '' : 'disabled'} />
      ${canEdit ? `<button class="del-btn" data-remove>Remove player</button>` : ''}
    </div>
  `;

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
    subs: []     // [playerId]
  };
}

function renderLineupsTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, players, lineups, current } = editor;

  const formationBtns = Object.keys(FORMATIONS).map(f =>
    `<button class="f-btn ${current.formation === f ? 'active' : ''}" data-formation="${f}">${f}</button>`
  ).join('');

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
      <aside class="lineup-side">
        <div class="card">
          <h3 style="margin-top:0">Saved lineups</h3>
          <div class="lineup-list">${lineupsListHtml}</div>
          ${canEdit ? `<button class="btn-full" id="new-lineup-btn" style="margin-top:0.75rem">+ New lineup</button>` : ''}
        </div>
      </aside>

      <div class="lineup-main">
        <div class="card">
          <div class="lineup-meta-form">
            <div>
              <label>Lineup name</label>
              <input type="text" id="l-name" value="${escapeHtml(current.name)}" placeholder="e.g. vs Rivals" ${canEdit ? '' : 'disabled'} />
            </div>
            <div>
              <label>Opponent</label>
              <input type="text" id="l-opponent" value="${escapeHtml(current.opponent)}" ${canEdit ? '' : 'disabled'} />
            </div>
            <div>
              <label>Game date</label>
              <input type="date" id="l-date" value="${current.game_date || ''}" ${canEdit ? '' : 'disabled'} />
            </div>
          </div>
          <div class="formation-row">
            <label style="width:auto;margin-right:0.5rem">Formation:</label>
            <div class="f-btns">${formationBtns}</div>
          </div>
          <div class="lineup-actions">
            ${canEdit ? `<button class="primary" id="save-lineup">${current.id ? 'Save changes' : 'Save lineup'}</button>` : ''}
            ${canEdit ? `<button class="btn-secondary" id="clear-pitch">Clear pitch</button>` : ''}
            <div id="save-msg" class="muted" style="margin-left:auto"></div>
          </div>
        </div>

        <div class="card pitch-card">
          <div class="pitch" id="pitch"></div>
          <div class="subs-bar">
            <div class="subs-label">SUBSTITUTES (${current.subs.filter(Boolean).length}/${MAX_SUBS})</div>
            <div class="subs-row" id="subs-row"></div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">Available players</h3>
          <div class="palette" id="palette">${paletteHtml}</div>
          ${canEdit ? `<p class="muted" style="font-size:0.8rem;margin-top:0.5rem">Drag a player onto a pitch position or the subs bar. Drag here to remove from lineup.</p>` : ''}
        </div>
      </div>
    </div>
  `;

  renderPitch();
  renderSubsBar();
  wireLineupEvents();
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
  const pitch = document.getElementById('pitch');
  const { current, players } = editor;
  const formation = FORMATIONS[current.formation];
  if (!formation) { pitch.innerHTML = ''; return; }

  const pById = id => players.find(p => p.id === id);

  pitch.innerHTML = formation.pos.map(([x, y], i) => {
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
      const newCount = FORMATIONS[editor.current.formation].pos.length;
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
        subs: [...(l.data?.subs || [])]
      };
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

  if (canEdit) wireDragAndDrop();
}

function wireDragAndDrop() {
  const tabEl = document.getElementById('tab-content');

  // Make all chips draggable
  tabEl.querySelectorAll('.chip[draggable="true"]').forEach(chip => {
    chip.addEventListener('dragstart', (e) => {
      const pid = chip.dataset.playerId;
      const fromSlot = chip.dataset.fromSlot;
      const fromSub  = chip.dataset.fromSub;
      const payload = { playerId: pid, fromSlot: fromSlot ?? null, fromSub: fromSub ?? null };
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });

  // Drop targets: slots, sub-slots, palette
  const makeDropTarget = (el, handler) => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      handler(payload);
    });
  };

  tabEl.querySelectorAll('[data-slot]').forEach(slotEl => {
    const idx = parseInt(slotEl.dataset.slot, 10);
    makeDropTarget(slotEl, (payload) => handleDropToSlot(idx, payload));
  });
  tabEl.querySelectorAll('[data-sub]').forEach(subEl => {
    const idx = parseInt(subEl.dataset.sub, 10);
    makeDropTarget(subEl, (payload) => handleDropToSub(idx, payload));
  });
  const palette = document.getElementById('palette');
  if (palette) makeDropTarget(palette, (payload) => handleDropToPalette(payload));
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
      subs: current.subs
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

// Kick off
render();
