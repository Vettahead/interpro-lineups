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
  if (h.startsWith('view/')) return { name: 'view', lineupId: h.slice(5) };
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
  // Public parent view — no auth required
  const preRoute = currentRoute();
  if (preRoute.name === 'view') {
    resetHeader();
    userBar.innerHTML = '';
    await renderParentView(preRoute.lineupId);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    resetHeader();
    renderAuth();
    userBar.innerHTML = '';
    return;
  }
  renderUserBar(session.user);

  // Claim any pending invites for this user's email (team_members + parent_players rows)
  await claimPendingInvites(session.user).catch(err => console.warn('claim invites failed', err));

  // Prompt to set a password if they don't have one yet (common after magic-link invites)
  maybePromptSetPassword(session.user);

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

// Show a "Set a password" modal for users who signed in via magic link and
// have not yet set a password. Once set, user_metadata.password_set = true
// so they don't see the prompt again.
function maybePromptSetPassword(user) {
  if (!user) return;
  if (user.user_metadata?.password_set === true) return;
  // Don't stack multiple modals
  if (document.querySelector('.picker-overlay[data-pw-prompt]')) return;

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.setAttribute('data-pw-prompt', '1');
  overlay.innerHTML = `
    <div class="picker-modal">
      <div class="picker-header">
        <strong>Set your password</strong>
      </div>
      <div class="picker-body">
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.9rem">
          Welcome! Before you continue, set a password so you can log in from any device.
        </p>
        <label>New password (min 8 characters)</label>
        <input type="password" id="pw-new" autocomplete="new-password" />
        <label style="margin-top:0.5rem">Confirm password</label>
        <input type="password" id="pw-confirm" autocomplete="new-password" />
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
          <button class="btn-secondary" data-action="signout">Sign out</button>
          <button class="primary" id="pw-save">Save password & continue</button>
        </div>
        <div id="pw-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Block outside-click and Escape — password is required
  overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
  const blockKeys = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener('keydown', blockKeys, true);

  const close = () => {
    document.removeEventListener('keydown', blockKeys, true);
    overlay.remove();
  };

  overlay.querySelector('[data-action=signout]').onclick = async () => {
    await supabase.auth.signOut();
    close();
  };
  overlay.querySelector('#pw-save').onclick = async () => {
    const msg = overlay.querySelector('#pw-msg');
    const pw = overlay.querySelector('#pw-new').value || '';
    const pw2 = overlay.querySelector('#pw-confirm').value || '';
    if (pw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; msg.className = 'error'; return; }
    if (pw !== pw2) { msg.textContent = 'Passwords do not match.'; msg.className = 'error'; return; }
    msg.textContent = 'Saving…'; msg.className = 'muted';
    const { error } = await supabase.auth.updateUser({
      password: pw,
      data: { password_set: true }
    });
    if (error) { msg.textContent = 'Failed: ' + error.message; msg.className = 'error'; return; }
    msg.textContent = '✓ Password saved.'; msg.className = 'ok';
    setTimeout(close, 700);
  };
  setTimeout(() => overlay.querySelector('#pw-new')?.focus(), 20);
}

// Look up and claim any pending invites for this user's email.
// Creates team_members row + parent_players link (for parent invites), marks invite accepted.
async function claimPendingInvites(user) {
  if (!user?.email) return;
  const email = user.email.trim().toLowerCase();
  const { data: invites, error } = await supabase
    .from('invites')
    .select('*')
    .eq('status', 'pending')
    .ilike('email', email);
  if (error) { console.warn('invite lookup error', error); return; }
  if (!invites || !invites.length) return;

  for (const inv of invites) {
    // Create team_members (ignore conflicts — user may already be a member)
    const tmPayload = { team_id: inv.team_id, user_id: user.id, role: inv.role };
    const tmRes = await supabase.from('team_members').insert(tmPayload);
    // Ignore duplicate key errors
    if (tmRes.error && !String(tmRes.error.message || '').match(/duplicate|unique/i)) {
      console.warn('team_members insert error', tmRes.error);
    }
    // Link parent to player if applicable
    if (inv.role === 'parent' && inv.player_id) {
      const ppRes = await supabase
        .from('parent_players')
        .insert({ parent_id: user.id, player_id: inv.player_id });
      if (ppRes.error && !String(ppRes.error.message || '').match(/duplicate|unique/i)) {
        console.warn('parent_players insert error', ppRes.error);
      }
    }
    // Mark accepted
    await supabase
      .from('invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', inv.id);
  }
}

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

// ---------- Parent / public view ----------
let _parentViewPoll = null;
let _parentViewLastHash = null;

async function renderParentView(lineupId, opts = {}) {
  // Stop any existing poll if we're navigating away or re-rendering fresh
  if (!opts.fromPoll) {
    if (_parentViewPoll) { clearInterval(_parentViewPoll); _parentViewPoll = null; }
    _parentViewLastHash = null;
    appEl.innerHTML = `<p class="loading">Loading lineup…</p>`;
  }
  if (!lineupId) {
    appEl.innerHTML = `<div class="parent-view"><p class="error">No lineup specified.</p></div>`;
    return;
  }

  // Fetch the lineup (must be published — RLS enforces this for anon)
  const { data: lineup, error: lErr } = await supabase
    .from('lineups')
    .select('*')
    .eq('id', lineupId)
    .maybeSingle();

  if (lErr || !lineup) {
    appEl.innerHTML = `
      <div class="parent-view">
        <div class="pv-card">
          <h2>Lineup not available</h2>
          <p class="muted">This lineup may have been unpublished or the link is incorrect.</p>
        </div>
      </div>`;
    return;
  }

  // Fetch team + players + custom formations (RLS allows read when team has a published lineup)
  const [teamRes, playersRes, formationsRes] = await Promise.all([
    supabase.from('teams').select('*').eq('id', lineup.team_id).maybeSingle(),
    supabase.from('players').select('*').eq('team_id', lineup.team_id),
    supabase.from('formations').select('*').eq('team_id', lineup.team_id)
  ]);
  const team = teamRes.data || { name: '' };
  const players = playersRes.data || [];
  const customFormations = formationsRes.data || [];

  // Skip re-render if data is unchanged (poll case)
  const dataHash = JSON.stringify({
    upd: lineup.updated_at, data: lineup.data,
    op: lineup.opponent, gd: lineup.game_date, mt: lineup.match_type, ha: lineup.home_away,
    ko: lineup.kickoff_time, ar: lineup.arrival_time, nt: lineup.notes,
    ln: lineup.location_name, lp: lineup.location_postcode, llat: lineup.location_lat, llng: lineup.location_lng,
    pub: lineup.published, st: lineup.lineup_status,
    tn: team.name, tg: team.home_ground_name, tp: team.home_ground_postcode, tlat: team.home_ground_lat, tlng: team.home_ground_lng,
    pl: players.map(p => [p.id, p.name, p.number]).sort()
  });
  if (opts.fromPoll && dataHash === _parentViewLastHash) return;
  _parentViewLastHash = dataHash;

  // Seed editor so renderFixturePitch (which reads from editor.players + getFormation) works
  editor = { team, canEdit: false, players, lineups: [lineup], current: null, customFormations };

  // Build match-details summary
  const data = lineup.data || {};
  const matchType = lineup.match_type || data.match_type || 'league';
  const homeAway  = lineup.home_away  || data.home_away  || 'home';
  const tLbl  = matchType === 'friendly' ? 'Friendly' : matchType === 'cup' ? 'Cup match' : 'League match';
  const haLbl = homeAway === 'away' ? 'Away' : 'Home';

  // Venue: home games use team.home_ground_*; away uses lineup.location_*
  const venue = homeAway === 'home'
    ? {
        name: team.home_ground_name || '',
        postcode: team.home_ground_postcode || '',
        lat: team.home_ground_lat ?? null,
        lng: team.home_ground_lng ?? null
      }
    : {
        name: lineup.location_name || '',
        postcode: lineup.location_postcode || '',
        lat: lineup.location_lat ?? null,
        lng: lineup.location_lng ?? null
      };

  const gd = lineup.game_date ? new Date(lineup.game_date + 'T00:00:00') : null;
  const dateStr = gd ? gd.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const kickoff = lineup.kickoff_time || data.kickoff_time || '';
  const arrival = lineup.arrival_time || data.arrival_time || '';
  const notes   = lineup.notes        || data.notes        || '';

  const mapHref = (venue.lat != null && venue.lng != null)
    ? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`
    : (venue.postcode ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.postcode)}` : '');
  const w3wHref = (venue.lat != null && venue.lng != null)
    ? `https://what3words.com/${venue.lat},${venue.lng}`
    : '';

  const logoSrc = 'logo.png';
  const teamName = escapeHtml(team.name || '');
  const oppName  = escapeHtml(lineup.opponent || 'TBD');

  const status = lineup.lineup_status || (lineup.published ? 'published' : 'draft');
  const isAvailabilityMode = status === 'availability';

  // Fetch current availability responses (anon-readable) so we can prefill
  let availability = [];
  if (isAvailabilityMode || status === 'published') {
    const { data: avail } = await supabase
      .from('player_availability')
      .select('*')
      .eq('lineup_id', lineupId);
    availability = avail || [];
  }
  const availByPlayer = Object.fromEntries(availability.map(a => [a.player_id, a]));

  appEl.innerHTML = `
    <div class="parent-view">
      <div class="pv-header">
        <img src="${logoSrc}" alt="" class="pv-logo" />
        <div>
          <div class="pv-team">${teamName}</div>
          <div class="pv-vs">${haLbl === 'Home' ? `${teamName} <span class="pv-vs-sep">vs</span> ${oppName}` : `${oppName} <span class="pv-vs-sep">vs</span> ${teamName}`}</div>
          <div class="pv-sub">${tLbl} · ${haLbl}</div>
        </div>
      </div>

      <div class="pv-card">
        <h3 class="pv-card-title">Match details</h3>
        <dl class="pv-details">
          ${dateStr ? `<dt>Date</dt><dd>${escapeHtml(dateStr)}</dd>` : ''}
          ${kickoff ? `<dt>Kick off</dt><dd>${escapeHtml(kickoff)}</dd>` : ''}
          ${arrival ? `<dt>Team arrival</dt><dd>${escapeHtml(arrival)}</dd>` : ''}
          ${(venue.name || venue.postcode) ? `<dt>Venue</dt><dd>${escapeHtml(venue.name || '')}${venue.name && venue.postcode ? ' · ' : ''}${escapeHtml(venue.postcode || '')}</dd>` : ''}
        </dl>
        ${(mapHref || w3wHref) ? `
          <div class="pv-links">
            ${mapHref ? `<a class="pv-link" href="${mapHref}" target="_blank" rel="noopener">🗺️ Open map</a>` : ''}
            ${w3wHref ? `<a class="pv-link" href="${w3wHref}" target="_blank" rel="noopener">///what3words</a>` : ''}
          </div>
        ` : ''}
      </div>

      ${notes ? `
        <div class="pv-card">
          <h3 class="pv-card-title">Coach notes</h3>
          <p class="pv-notes">${escapeHtml(notes)}</p>
        </div>
      ` : ''}

      ${(isAvailabilityMode || status === 'published') ? renderAvailabilityFormHtml(lineup, players, availByPlayer) : ''}

      ${status === 'published' ? `
      <div class="pv-card">
        <h3 class="pv-card-title">Lineup</h3>
        <div class="pv-pitch" id="fix-pitch" style="max-width:560px;margin:0 auto">
          <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
          <canvas class="tactics-canvas" id="fix-tactics"></canvas>
          <div class="pv-slots" id="fix-slots"></div>
          <div class="pv-ball" id="fix-ball" style="display:none"></div>
        </div>
        <div class="pv-subs" id="fix-subs" style="margin-top:0.5rem"></div>
      </div>` : ''}

      <div class="pv-footer">
        <button id="pv-refresh" class="btn-secondary" style="font-size:0.8rem">↻ Refresh</button>
        <div class="muted" style="margin-top:0.5rem;font-size:0.7rem">Auto-updates every 15s · Last loaded ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  `;

  if (isAvailabilityMode || status === 'published') {
    wireAvailabilityForm(lineup, players, availByPlayer);
  }
  if (status === 'published') {
    renderFixturePitch(lineup);
  }

  document.getElementById('pv-refresh')?.addEventListener('click', () => {
    _parentViewLastHash = null;
    renderParentView(lineupId);
  });

  // Re-draw on resize so tactics canvas stays crisp
  window.addEventListener('resize', () => {
    if (currentRoute().name === 'view' && status === 'published') renderFixturePitch(lineup);
  }, { once: false });

  // Start polling (only on first / non-poll render)
  if (!opts.fromPoll && !_parentViewPoll) {
    _parentViewPoll = setInterval(() => {
      if (currentRoute().name !== 'view') {
        clearInterval(_parentViewPoll); _parentViewPoll = null; return;
      }
      renderParentView(lineupId, { fromPoll: true }).catch(e => console.warn('poll failed', e));
    }, 15000);
  }
}

// ---------- Parent availability form ----------
function renderAvailabilityFormHtml(lineup, players, availByPlayer) {
  const sorted = [...players].sort((a, b) => {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });
  const rememberedName = (() => {
    try { return localStorage.getItem('pv_responder_name') || ''; } catch { return ''; }
  })();
  const statusBtn = (pid, value, label, emoji) => {
    const cur = availByPlayer[pid];
    const active = cur && cur.status === value;
    return `<button type="button" class="avail-btn" data-player="${pid}" data-status="${value}"
      style="flex:1;padding:0.5rem 0.3rem;border:1px solid ${active ? '#2a7' : '#ccc'};background:${active ? '#2a7' : '#fff'};color:${active ? '#fff' : '#333'};font-size:0.8rem;cursor:pointer;border-radius:6px">
      ${emoji} ${label}
    </button>`;
  };
  const rows = sorted.map(p => {
    const cur = availByPlayer[p.id];
    const photoHtml = p.photo_url
      ? `<div class="avail-photo" style="width:36px;height:36px;border-radius:50%;background:#eee center/cover no-repeat url('${escapeHtml(p.photo_url)}');flex-shrink:0"></div>`
      : `<div class="avail-photo" style="width:36px;height:36px;border-radius:50%;background:#e6e6e6;display:flex;align-items:center;justify-content:center;font-weight:600;color:#666;flex-shrink:0">${escapeHtml(String(p.number || ''))}</div>`;
    const lastLine = cur
      ? `<div class="muted" style="font-size:0.7rem;margin-top:0.15rem">Last response: ${cur.status}${cur.responded_by ? ' — ' + escapeHtml(cur.responded_by) : ''}</div>`
      : `<div class="muted" style="font-size:0.7rem;margin-top:0.15rem">No response yet</div>`;
    return `
      <div class="avail-row" data-player-row="${p.id}" style="padding:0.6rem 0;border-top:1px solid #eee">
        <div style="display:flex;gap:0.6rem;align-items:center">
          ${photoHtml}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</div>
            ${lastLine}
          </div>
        </div>
        <div style="display:flex;gap:0.35rem;margin-top:0.5rem">
          ${statusBtn(p.id, 'available',   'Available',   '✅')}
          ${statusBtn(p.id, 'maybe',       'Maybe',       '🤔')}
          ${statusBtn(p.id, 'unavailable', 'Unavailable', '❌')}
        </div>
        <input type="text" class="avail-note" data-player-note="${p.id}" value="${escapeHtml(cur?.note || '')}"
          placeholder="Optional note (e.g. away weekend)"
          style="margin-top:0.4rem;width:100%;padding:0.4rem;font-size:0.8rem;border:1px solid #ddd;border-radius:4px" />
      </div>`;
  }).join('');

  return `
    <div class="pv-card">
      <h3 class="pv-card-title">Availability check</h3>
      <p class="muted" style="font-size:0.85rem;margin-top:0">Please mark availability for your player(s) for this match. The coach will use these responses to pick the squad.</p>
      <label style="font-size:0.75rem;margin-top:0.5rem;display:block">Your name (optional)</label>
      <input type="text" id="avail-responder" value="${escapeHtml(rememberedName)}" placeholder="e.g. Sarah (Alex's mum)"
        style="width:100%;padding:0.45rem;font-size:0.9rem;border:1px solid #ddd;border-radius:4px" />
      <div id="avail-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.35rem"></div>
      <div id="avail-list" style="margin-top:0.5rem">${rows}</div>
    </div>`;
}

function wireAvailabilityForm(lineup, players, availByPlayer) {
  const msgEl = document.getElementById('avail-msg');
  const responderEl = document.getElementById('avail-responder');
  const flash = (txt, cls = 'muted') => {
    if (!msgEl) return;
    msgEl.textContent = txt; msgEl.className = cls;
    setTimeout(() => { if (msgEl.textContent === txt) { msgEl.textContent = ''; msgEl.className = 'muted'; } }, 2500);
  };

  const submit = async (playerId, status) => {
    const responderName = (responderEl?.value || '').trim();
    if (responderName) {
      try { localStorage.setItem('pv_responder_name', responderName); } catch {}
    }
    const noteEl = document.querySelector(`[data-player-note="${playerId}"]`);
    const note = (noteEl?.value || '').trim() || null;
    const payload = {
      lineup_id: lineup.id,
      player_id: playerId,
      status,
      note,
      responded_by: responderName || null,
      responded_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('player_availability')
      .upsert(payload, { onConflict: 'lineup_id,player_id' })
      .select()
      .single();
    if (error) { flash('Save failed: ' + error.message, 'error'); return; }
    availByPlayer[playerId] = data;
    // Visually update the buttons for this row
    document.querySelectorAll(`[data-player="${playerId}"]`).forEach(btn => {
      const active = btn.dataset.status === status;
      btn.style.background = active ? '#2a7' : '#fff';
      btn.style.color = active ? '#fff' : '#333';
      btn.style.borderColor = active ? '#2a7' : '#ccc';
    });
    const row = document.querySelector(`[data-player-row="${playerId}"]`);
    const line = row?.querySelector('.muted');
    if (line) line.textContent = `Last response: ${status}${responderName ? ' — ' + responderName : ''}`;
    flash('✓ Saved', 'ok');
  };

  document.querySelectorAll('.avail-btn').forEach(btn => {
    btn.addEventListener('click', () => submit(btn.dataset.player, btn.dataset.status));
  });

  // Save note on blur if a status exists
  document.querySelectorAll('.avail-note').forEach(inp => {
    inp.addEventListener('blur', async () => {
      const pid = inp.dataset.playerNote;
      const cur = availByPlayer[pid];
      if (!cur) return; // only save notes alongside an existing status
      const note = (inp.value || '').trim() || null;
      if ((cur.note || null) === note) return;
      const { error } = await supabase
        .from('player_availability')
        .update({ note, responded_at: new Date().toISOString() })
        .eq('lineup_id', lineup.id).eq('player_id', pid);
      if (error) { flash('Note save failed: ' + error.message, 'error'); return; }
      cur.note = note;
      flash('✓ Note saved', 'ok');
    });
  });
}

// ---------- Coach availability responses panel ----------
async function renderCoachAvailabilityPanel(opts = {}) {
  const containerId = opts.containerId || 'availability-panel';
  const lineupId = opts.lineupId || editor?.current?.id;
  const cardKey = opts.cardKey || 'coach-avail';
  const panelEl = document.getElementById(containerId);
  if (!panelEl || !lineupId) return;
  const { data: avail, error } = await supabase
    .from('player_availability')
    .select('*')
    .eq('lineup_id', lineupId);
  if (error) { panelEl.innerHTML = `<div class="error" style="font-size:0.75rem">${escapeHtml(error.message)}</div>`; return; }
  const byPlayer = Object.fromEntries((avail || []).map(a => [a.player_id, a]));
  const players = [...(editor.players || [])].sort((a, b) => {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });
  const tally = { available: 0, maybe: 0, unavailable: 0, none: 0 };
  players.forEach(p => {
    const s = byPlayer[p.id]?.status;
    if (s === 'available' || s === 'maybe' || s === 'unavailable') tally[s]++;
    else tally.none++;
  });
  const rowHtml = players.map(p => {
    const r = byPlayer[p.id];
    const badge = !r
      ? `<span style="color:#888">— no reply</span>`
      : r.status === 'available'   ? `<span style="color:#2a7">✅ available</span>`
      : r.status === 'maybe'       ? `<span style="color:#b88800">🤔 maybe</span>`
      : r.status === 'unavailable' ? `<span style="color:#c33">❌ unavailable</span>`
      : escapeHtml(r.status);
    const meta = r
      ? `<span class="muted" style="font-size:0.7rem"> — ${r.responded_by ? escapeHtml(r.responded_by) : 'anon'}${r.note ? ' · ' + escapeHtml(r.note) : ''}</span>`
      : '';
    return `<div style="padding:0.25rem 0;font-size:0.8rem;border-top:1px solid #f0f0f0">
      <strong>#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</strong> — ${badge}${meta}
    </div>`;
  }).join('');
  panelEl.innerHTML = `
    <details class="collapsible-card" ${openCards.has(cardKey) ? 'open' : ''} data-card="${cardKey}">
      <summary style="cursor:pointer;padding:0.4rem 0.5rem;background:#f7f7f7;border-radius:4px;font-size:0.8rem;font-weight:600">
        Availability responses — ✅ ${tally.available} · 🤔 ${tally.maybe} · ❌ ${tally.unavailable} · — ${tally.none}
      </summary>
      <div style="padding:0.4rem 0.2rem">${rowHtml || '<div class="muted" style="font-size:0.8rem;padding:0.4rem 0">No players.</div>'}</div>
    </details>`;
  const det = panelEl.querySelector('details');
  if (det) {
    det.addEventListener('toggle', () => {
      if (det.open) openCards.add(cardKey); else openCards.delete(cardKey);
    });
  }
}

// ---------- Team dashboard ----------
let activeTab = 'squad';
let _pendingLineupLoad = null; // play payload to apply next time the Lineups tab renders
let currentFilter = 'All';
const expandedPlayers = new Set(); // player ids with expanded detail panel

// In-memory editor state for lineups tab
let editor = null; // { team, canEdit, players, lineups, current: { id?, name, opponent, game_date, formation, slots, subs } }

// Auto-save state for published lineups
let _autosaveTimer = null;
let _autosaveInFlight = false;
let _lastSavedHash = null;
function _lineupContentHash(c) {
  if (!c) return null;
  return JSON.stringify({
    slots: c.slots, subs: c.subs, formation: c.formation,
    arrows: c.arrows, zoneLines: c.zoneLines,
    ballVisible: c.ballVisible, ballPos: c.ballPos,
    opponent: c.opponent, game_date: c.game_date,
    match_type: c.match_type, home_away: c.home_away,
    kickoff_time: c.kickoff_time, arrival_time: c.arrival_time, notes: c.notes,
    location_name: c.location_name, location_postcode: c.location_postcode,
    location_lat: c.location_lat, location_lng: c.location_lng
  });
}
function scheduleAutosaveIfPublished() {
  if (_autosaveInFlight) return;
  if (!editor?.current?.id || !editor.current.published) return;
  const h = _lineupContentHash(editor.current);
  if (h === _lastSavedHash) return;
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(async () => {
    _autosaveTimer = null;
    _autosaveInFlight = true;
    try {
      await saveLineupWithMsg(null);
      _lastSavedHash = _lineupContentHash(editor.current);
    } catch (e) { console.error('autosave failed', e); }
    _autosaveInFlight = false;
  }, 800);
}

async function renderTeamDashboard(user, teamId) {
  appEl.innerHTML = `<p class="loading">Loading team…</p>`;

  const [teamRes, memberRes, playersRes, lineupsRes, playsRes, formationsRes] = await Promise.all([
    supabase.from('teams').select('*').eq('id', teamId).single(),
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
      <button class="h-tab ${activeTab === 'fixtures' ? 'active' : ''}" data-tab="fixtures">Fixtures</button>
      <button class="h-tab ${activeTab === 'squad' ? 'active' : ''}" data-tab="squad">Squad</button>
      <button class="h-tab ${activeTab === 'lineups' ? 'active' : ''}" data-tab="lineups">Matches / Lineups</button>
      <button class="h-tab ${activeTab === 'plays' ? 'active' : ''}" data-tab="plays">Plays</button>
      ${canEdit ? `<button class="h-tab ${activeTab === 'members' ? 'active' : ''}" data-tab="members">Members</button>` : ''}
      <button class="h-tab ${activeTab === 'help' ? 'active' : ''}" data-tab="help">Help</button>
    `;
    tabsEl.querySelectorAll('.h-tab[data-tab]').forEach(b => {
      b.onclick = () => {
        activeTab = b.dataset.tab;
        // Reset card open/closed state so every tab visit starts clean
        openCards.clear();
        renderTeamDashboard(user, teamId);
      };
    });
  }

  appEl.innerHTML = `<div id="tab-content"></div>`;

  if (activeTab === 'fixtures') {
    editor = {
      mode: 'fixtures',
      team, canEdit, players, lineups, plays, customFormations,
      currentUserId: user.id,
      currentUserRole: role,
      current: newLineupState()
    };
    renderFixturesTab();
  } else if (activeTab === 'squad') {
    renderSquadTab(team, canEdit, players);
  } else if (activeTab === 'lineups') {
    const base = newLineupState();
    let current;
    if (_pendingLineupLoad) {
      current = { ...base, ..._pendingLineupLoad, id: null };
      // If play provided custom pos/lbl, stash onto current
      if (_pendingLineupLoad.pos) current.pos = _pendingLineupLoad.pos.map(p => [...p]);
      if (_pendingLineupLoad.lbl) current.lbl = [..._pendingLineupLoad.lbl];
    } else {
      current = base;
    }
    _pendingLineupLoad = null;
    editor = {
      mode: 'lineup',
      team, canEdit, players, lineups, plays, customFormations,
      current
    };
    renderLineupsTab();
  } else if (activeTab === 'plays') {
    editor = {
      mode: 'play',
      team, canEdit, players, lineups, plays, customFormations,
      currentUserId: user.id,
      currentUserRole: role,
      current: newPlayState()
    };
    renderPlaysTab();
  } else if (activeTab === 'members' && canEdit) {
    editor = {
      mode: 'members',
      team, canEdit, players, lineups, plays, customFormations,
      currentUserId: user.id,
      currentUserRole: role,
      current: newLineupState()
    };
    renderMembersTab(user);
  } else if (activeTab === 'help') {
    renderHelpTab(canEdit, role);
  }
}

// ---------- Help / FAQ tab ----------
const HELP_SECTIONS = [
  {
    id: 'getting-started', title: 'Getting started', adminOnly: false,
    body: `
      <h4>Signing in for the first time</h4>
      <p>Enter your email and choose <strong>Sign up</strong>, then set a password (min 8 characters). You'll be signed in straight away.</p>
      <h4>I was sent an invite email</h4>
      <p>Click the link, set a password (or sign in), and you'll be added to the team automatically.</p>
      <h4>Why am I being asked to set a password?</h4>
      <p>If you arrived via a magic link or invite, the app prompts you once to set a password so you can log back in from any device.</p>
      <h4>Signing out</h4>
      <p>Click <strong>Log out</strong> in the top-right of the header.</p>
    `
  },
  {
    id: 'teams', title: 'Teams', adminOnly: false,
    body: `
      <h4>Switching between teams</h4>
      <p>Click <strong>← Your teams</strong> in the top-left to go back to the team list.</p>
      <h4>Who can see my team?</h4>
      <p>Only people you invite as members. The exception is <strong>published lineups</strong>, which can be shared with anyone via a public link.</p>
    `
  },
  {
    id: 'create-team', title: 'Creating a team', adminOnly: true,
    body: `
      <p>On the <strong>Your teams</strong> page, scroll to <strong>Create a team</strong>, type a name and click <strong>Create</strong>. You'll become the team's admin automatically.</p>
    `
  },
  {
    id: 'squad', title: 'Squad — players & home ground', adminOnly: false,
    body: `
      <h4>Adding a player <em>(coach/admin only)</em></h4>
      <p>Open <strong>Squad</strong> and click <strong>+ Add player</strong>. Fill in name, shirt number, preferred positions and notes. Save.</p>
      <h4>What does the position field do?</h4>
      <p>Preferred positions colour-code players on the lineup picker. They're suggestions, not restrictions.</p>
      <h4>Editing or removing a player <em>(coach/admin only)</em></h4>
      <p>Click a player to expand their card, then use <strong>Edit</strong> or <strong>Remove</strong>. Removing a player won't break old lineups — they'll just appear as empty slots.</p>
      <h4>Setting the home ground <em>(coach/admin only)</em></h4>
      <p>At the top of the Squad tab, the <strong>Home ground</strong> card lets you set venue name + postcode and fine-tune the map pin. This auto-fills for every Home game.</p>
      <h4>Why fine-tune the map?</h4>
      <p>UK postcodes can cover a large area. Drag the pin to the exact spot of the pitch entrance/car park so parents can find you.</p>
    `
  },
  {
    id: 'lineups', title: 'Lineups', adminOnly: true,
    body: `
      <h4>Creating a lineup</h4>
      <p>Open <strong>Lineups</strong> → <strong>+ New lineup</strong>. Fill in match details and arrange players on the pitch.</p>
      <h4>Setting match details</h4>
      <p>Click the blue <strong>📋 Arrange match</strong> button. The popup has Opponent, Match type (Friendly/League/Cup), Home/Away, Game date, Kick off, Team arrival, Notes, and Venue. For Home games the venue auto-fills from your Squad-tab home ground; for Away games you can set venue + fine-tune the map.</p>
      <h4>Adding players to the pitch</h4>
      <p>Drag a player from <strong>Available players</strong> onto a position slot. Drag one onto another to swap. Drag back to the list to remove.</p>
      <h4>Changing formation</h4>
      <p>Open the <strong>Formation</strong> card and pick a preset (4-3-3, 4-4-2, etc.) or a custom one.</p>
      <h4>Custom formations</h4>
      <p>In the Formation card click <strong>+ Build custom</strong>. Drag dots, label positions, save. Custom formations show alongside presets.</p>
      <h4>Subs</h4>
      <p>Drag players to the <strong>Substitutes</strong> strip below the pitch (max 5).</p>
      <h4>Tactics</h4>
      <p>Press/Defensive lines (toggle and drag), arrows (click-drag, click to bend), and a movable ball. Use Clear to reset.</p>
      <h4>Saving</h4>
      <p>The <strong>Save lineup</strong> button is in the match-details popup. Saved lineups appear on the left.</p>
      <h4>Loading or deleting saved lineups</h4>
      <p>Click any item in <strong>Saved lineups</strong> to load. Hover and click <strong>×</strong> to delete.</p>
    `
  },
  {
    id: 'publish', title: 'Publishing & sharing with parents', adminOnly: true,
    body: `
      <h4>What does Publish do?</h4>
      <p>Publishing makes the lineup visible to anyone with the share link — no login. Drafts stay private.</p>
      <h4>How to publish</h4>
      <p>Open the lineup → <strong>📋 Arrange match</strong> → <strong>Publish lineup</strong>. The card shows a green ● Published indicator.</p>
      <h4>Sending the link</h4>
      <p>After publishing, click <strong>🔗 Copy share link for parents</strong>. Paste into WhatsApp/text.</p>
      <h4>Do I need to re-share if I change something?</h4>
      <p>No. The link always points to the latest version. Changes show up in the parent view within 15 seconds (or instantly via their <strong>↻ Refresh</strong> button).</p>
      <h4>Unpublishing</h4>
      <p>Open the lineup → <strong>📋 Arrange match</strong> → <strong>Unpublish</strong>. The link stops working immediately.</p>
      <h4>What parents see</h4>
      <p>Team vs opponent, date/kick-off/arrival, venue + map + what3words, coach notes, the full pitch with players, and subs. They don't see drafts, other lineups or admin data.</p>
    `
  },
  {
    id: 'plays', title: 'Plays', adminOnly: true,
    body: `
      <h4>What's a play?</h4>
      <p>A reusable formation + tactics template with no players assigned. Useful for set pieces or attacking patterns.</p>
      <h4>Saving a play</h4>
      <p>Set up the formation/tactics on a lineup, then click <strong>Save as play</strong>. Name it.</p>
      <h4>Using a saved play</h4>
      <p>On Lineups, click <strong>Load from play</strong> in the Tactics section. Formation, arrows, zones and ball copy onto your current lineup; placed players stay.</p>
    `
  },
  {
    id: 'fixtures', title: 'Fixtures tab', adminOnly: false,
    body: `
      <h4>What is it?</h4>
      <p>An overview of the season. The next game appears big at the top with the pitch and details. Calendar and Upcoming/Recent are collapsible cards below.</p>
      <h4>Why don't draft lineups show?</h4>
      <p>Fixtures only shows <strong>published</strong> lineups by default. Coaches/admins can tick <strong>Show draft lineups</strong> at the bottom of Upcoming.</p>
      <h4>Jumping to a game</h4>
      <p>Click any highlighted day on the calendar, or any item in Upcoming/Recent.</p>
    `
  },
  {
    id: 'members', title: 'Members & roles', adminOnly: true,
    body: `
      <h4>Roles</h4>
      <ul>
        <li><strong>Admin</strong> — full control: edit team, manage members, delete the team</li>
        <li><strong>Coach</strong> — edit squad, lineups, plays, publish lineups</li>
        <li><strong>Parent</strong> — read-only access for their child's team</li>
        <li><strong>Viewer</strong> — read-only access (rare; assistants)</li>
      </ul>
      <h4>Inviting someone</h4>
      <p>Open <strong>Members</strong> → <strong>+ Invite</strong>. Enter email + role. They get an email; signing up adds them automatically.</p>
      <h4>Email didn't arrive</h4>
      <p>Check spam. If still missing, resend from the Members list.</p>
      <h4>Changing a role</h4>
      <p>Click the role next to a member's name and pick a new one. Admins can change anyone; coaches can manage parents/viewers but not other coaches/admins.</p>
      <h4>Removing a member</h4>
      <p>Click the <strong>×</strong> next to their entry. Their account isn't deleted — just their team membership.</p>
    `
  },
  {
    id: 'parent-view', title: 'Parent view (public link)', adminOnly: false,
    body: `
      <h4>Do I need to download an app?</h4>
      <p>No. The link opens in any browser. It works on phones, tablets and computers.</p>
      <h4>Do I need to log in?</h4>
      <p>No. The share link is public.</p>
      <h4>How often does it refresh?</h4>
      <p>Automatically every 15 seconds. There's also a <strong>↻ Refresh</strong> button at the bottom.</p>
      <h4>What's the ///what3words link?</h4>
      <p>A three-word address pinpoints a 3m × 3m square. Tap it on a phone for precise directions.</p>
    `
  },
  {
    id: 'troubleshooting', title: 'Tips & troubleshooting', adminOnly: false,
    body: `
      <h4>My changes aren't saving <em>(coaches)</em></h4>
      <p>Each lineup needs a name (auto-generated as "vs Opponent") and a date. Check the form for missing required info.</p>
      <h4>I can't see a player I added</h4>
      <p>Make sure you're on the right team — squads are per-team.</p>
      <h4>The pitch looks squashed on my phone</h4>
      <p>Scroll the page or refresh your browser; the pitch should resize to fit.</p>
      <h4>A parent says the share link doesn't work <em>(coaches)</em></h4>
      <p>Check the lineup is still <strong>● Published</strong>. Unpublishing or deleting the lineup breaks the link.</p>
      <h4>Where is my data stored?</h4>
      <p>In a Supabase database in the cloud. Only members of your team can read your private team data.</p>
      <h4>What devices does it work on?</h4>
      <p>Any modern browser — Chrome, Safari, Firefox, Edge — on phones, tablets, laptops or desktops. Add it to your phone home screen for an app-like experience.</p>
    `
  },
  {
    id: 'workflow', title: 'A typical coach week', adminOnly: true,
    body: `
      <ol>
        <li><strong>Monday</strong> — Squad tab, check player availability. Update notes if anyone's injured.</li>
        <li><strong>Tuesday</strong> — Lineups → + New lineup. Fill in opponent/date/KO/arrival, pick formation, drag players in, save (don't publish yet).</li>
        <li><strong>Wed/Thu</strong> — Tweak based on training. Add tactics arrows. Save.</li>
        <li><strong>Friday</strong> — Arrange match → Publish. Copy share link, paste into team WhatsApp.</li>
        <li><strong>Match day</strong> — If anything changes, edit the lineup; the parent link auto-updates.</li>
        <li><strong>Post-match</strong> — Stays in Fixtures as a Recent entry for the season record.</li>
      </ol>
    `
  },
  {
    id: 'roadmap', title: 'Roadmap (coming soon)', adminOnly: true,
    body: `
      <ul>
        <li>Player photos on chips</li>
        <li>Email notifications when lineups are published or updated</li>
        <li>Admin panel for managing all members in one place</li>
        <li>Audit log UI to see who changed what</li>
        <li>Team-wide public page so parents can bookmark one URL for the season</li>
      </ul>
    `
  }
];

let _helpQuery = '';

function renderHelpTab(canEdit, role) {
  const tabEl = document.getElementById('tab-content');
  const isAdmin = canEdit; // admin or coach

  const visible = HELP_SECTIONS.filter(s => isAdmin || !s.adminOnly);
  const q = _helpQuery.trim().toLowerCase();
  const matches = q
    ? visible.filter(s => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    : visible;

  const cards = matches.map(s => `
    <details class="card collapsible help-card" data-card="help-${s.id}">
      <summary class="card-title">
        ${escapeHtml(s.title)}
        ${s.adminOnly ? '<span class="help-badge">admin/coach</span>' : ''}
        <span class="chev">▾</span>
      </summary>
      <div class="card-body help-body">${s.body}</div>
    </details>
  `).join('');

  tabEl.innerHTML = `
    <div class="help-tab">
      <div class="help-header">
        <h2 style="margin:0 0 0.25rem">Help & FAQ</h2>
        <p class="muted" style="margin:0;font-size:0.9rem">
          ${isAdmin
            ? 'You can see everything, including coach/admin sections.'
            : 'Showing parent/viewer help. Coach-only topics are hidden.'}
        </p>
        <input type="search" id="help-search" class="help-search"
               placeholder="Search the help…" value="${escapeHtml(_helpQuery)}" />
      </div>

      ${cards || `<p class="muted" style="padding:1rem 0">No matches. Try a different search.</p>`}

      <p class="muted" style="margin-top:1rem;font-size:0.8rem">
        Can't find an answer? Contact your team admin.
      </p>
    </div>
  `;

  const search = tabEl.querySelector('#help-search');
  if (search) {
    search.addEventListener('input', () => {
      _helpQuery = search.value || '';
      renderHelpTab(canEdit, role);
      // Restore focus + caret
      const s2 = document.getElementById('help-search');
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });
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

  const homeGroundCard = canEdit ? `
    <div class="card">
      <h3 style="margin-top:0">Home ground</h3>
      <label>Ground name</label>
      <input type="text" id="hg-name" value="${escapeHtml(team.home_ground_name || '')}" placeholder="e.g. Interpro Sports Ground" />
      <label>Postcode</label>
      <div style="display:flex;gap:0.35rem">
        <input type="text" id="hg-postcode" value="${escapeHtml(team.home_ground_postcode || '')}" placeholder="e.g. SW1A 1AA" style="flex:1;text-transform:uppercase" />
        <button class="btn-secondary" id="hg-lookup" type="button" style="flex-shrink:0">🔍 Look up</button>
      </div>
      <button class="btn-full" id="hg-finetune" type="button" style="margin-top:0.4rem">🗺️ Fine-tune on map</button>
      <div id="hg-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.25rem">
        ${team.home_ground_lat && team.home_ground_lng ? `✓ ${Number(team.home_ground_lat).toFixed(5)}, ${Number(team.home_ground_lng).toFixed(5)} — <a href="https://www.google.com/maps/search/?api=1&query=${team.home_ground_lat},${team.home_ground_lng}" target="_blank" rel="noopener">Google</a> · <a href="https://what3words.com/${team.home_ground_lat},${team.home_ground_lng}" target="_blank" rel="noopener">what3words</a>` : ''}
      </div>
      <button class="primary" id="hg-save" style="margin-top:0.5rem">Save home ground</button>
    </div>
  ` : '';

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
        <div class="sc-chip ${p.photo_url ? 'has-photo' : ''}" ${p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
          ${p.photo_url ? '' : `<div class="sc-chip-num">${p.number ?? '–'}</div>`}
        </div>
        <div class="sc-chip-info">
          <div class="sc-chip-name">${escapeHtml(shortName(p.name))}</div>
          <div class="sc-chip-pos">${p.position || '—'}</div>
        </div>
        <div class="sc-chevron">${isOpen ? '▾' : '▸'}</div>
      </button>
      ${isOpen ? `
      <div class="sc-details">
        <label>Photo</label>
        <div class="photo-row">
          <div class="photo-preview ${p.photo_url ? 'has-photo' : ''}" ${p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
            ${p.photo_url ? '' : '<span>No photo</span>'}
          </div>
          <div class="photo-actions">
            <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-file id="photo-file-${p.id}" style="display:none" ${canEdit ? '' : 'disabled'} />
            <button type="button" class="btn-secondary" data-photo-pick>${p.photo_url ? 'Replace' : 'Upload'} photo</button>
            ${p.photo_url ? `<button type="button" class="btn-secondary" data-photo-remove>Remove</button>` : ''}
            <div class="muted photo-msg" data-photo-msg style="font-size:0.75rem;min-height:1em;margin-top:0.25rem"></div>
          </div>
        </div>
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
        ${homeGroundCard}
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

    // Home ground lookup
    const hgLookupBtn = document.getElementById('hg-lookup');
    if (hgLookupBtn) hgLookupBtn.onclick = async () => {
      const msg = document.getElementById('hg-msg');
      const pcEl = document.getElementById('hg-postcode');
      const pc = (pcEl.value || '').trim().toUpperCase();
      if (!pc) { msg.textContent = 'Enter a postcode first.'; msg.className = 'error'; return; }
      msg.textContent = 'Looking up…'; msg.className = 'muted';
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
        const body = await res.json();
        if (!res.ok || body.status !== 200 || !body.result) {
          msg.textContent = 'Postcode not found.'; msg.className = 'error'; return;
        }
        team._pending_hg_lat = body.result.latitude;
        team._pending_hg_lng = body.result.longitude;
        pcEl.value = body.result.postcode;
        const place = [body.result.parish, body.result.admin_district].filter(Boolean).join(', ');
        msg.innerHTML = `✓ ${escapeHtml(body.result.postcode)}${place ? ' (' + escapeHtml(place) + ')' : ''} — <a href="https://www.google.com/maps/search/?api=1&query=${body.result.latitude},${body.result.longitude}" target="_blank" rel="noopener">View on map</a>`;
        msg.className = 'ok';
      } catch (err) {
        msg.textContent = 'Lookup failed: ' + err.message; msg.className = 'error';
      }
    };

    // Home ground fine-tune on map
    const hgFineBtn = document.getElementById('hg-finetune');
    if (hgFineBtn) hgFineBtn.onclick = async () => {
      const pcEl = document.getElementById('hg-postcode');
      let startLat = team._pending_hg_lat ?? team.home_ground_lat ?? null;
      let startLng = team._pending_hg_lng ?? team.home_ground_lng ?? null;
      // If we have no coords yet but do have a postcode, try to geocode first
      if ((startLat == null || startLng == null) && pcEl.value.trim()) {
        try {
          const pc = pcEl.value.trim().toUpperCase();
          const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
          const body = await res.json();
          if (res.ok && body.status === 200 && body.result) {
            startLat = body.result.latitude; startLng = body.result.longitude;
          }
        } catch {}
      }
      const result = await openMapPicker({ lat: startLat, lng: startLng });
      if (!result) return;
      team._pending_hg_lat = result.lat;
      team._pending_hg_lng = result.lng;
      const msg = document.getElementById('hg-msg');
      if (msg) msg.innerHTML = `✓ ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} (unsaved — click Save home ground) — <a href="https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lng}" target="_blank" rel="noopener">Google</a> · <a href="https://what3words.com/${result.lat},${result.lng}" target="_blank" rel="noopener">what3words</a>`;
    };

    // Save home ground
    const hgSaveBtn = document.getElementById('hg-save');
    if (hgSaveBtn) hgSaveBtn.onclick = async () => {
      const msg = document.getElementById('hg-msg');
      const name = (document.getElementById('hg-name').value || '').trim();
      const pc   = (document.getElementById('hg-postcode').value || '').trim().toUpperCase();
      // Use freshly looked-up coords if present, else keep existing if postcode unchanged, else null
      let lat = team._pending_hg_lat ?? null;
      let lng = team._pending_hg_lng ?? null;
      if (lat === null && pc === (team.home_ground_postcode || '').toUpperCase()) {
        lat = team.home_ground_lat ?? null; lng = team.home_ground_lng ?? null;
      }
      const { data, error } = await supabase.from('teams').update({
        home_ground_name: name || null,
        home_ground_postcode: pc || null,
        home_ground_lat: lat,
        home_ground_lng: lng
      }).eq('id', team.id).select().single();
      if (error) { msg.textContent = 'Save failed: ' + error.message; msg.className = 'error'; return; }
      Object.assign(team, data);
      delete team._pending_hg_lat; delete team._pending_hg_lng;
      msg.textContent = '✓ Saved'; msg.className = 'ok';
      setTimeout(() => renderSquadTab(team, canEdit, players), 600);
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

    // Photo upload/remove
    const photoPickBtn = cardEl.querySelector('[data-photo-pick]');
    const photoFileInput = cardEl.querySelector('[data-photo-file]');
    const photoRemoveBtn = cardEl.querySelector('[data-photo-remove]');
    const photoMsg = cardEl.querySelector('[data-photo-msg]');
    if (photoPickBtn && photoFileInput) {
      photoPickBtn.onclick = () => photoFileInput.click();
      photoFileInput.onchange = async () => {
        const file = photoFileInput.files && photoFileInput.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          if (photoMsg) { photoMsg.textContent = 'File too large (max 10MB)'; photoMsg.className = 'muted photo-msg error'; }
          photoFileInput.value = '';
          return;
        }
        // Open cropper first
        const cropped = await openPhotoCropper(file);
        photoFileInput.value = '';
        if (!cropped) {
          if (photoMsg) { photoMsg.textContent = ''; photoMsg.className = 'muted photo-msg'; }
          return;
        }
        if (photoMsg) { photoMsg.textContent = 'Uploading…'; photoMsg.className = 'muted photo-msg'; }
        photoPickBtn.disabled = true;
        try {
          const updated = await uploadPlayerPhoto(pid, cropped);
          const player = players.find(p => p.id === pid);
          if (player) player.photo_url = updated.photo_url;
          await logAudit(team.id, 'player', pid, 'update', { field: 'photo_url', to: updated.photo_url });
          renderSquadTab(team, canEdit, players);
        } catch (err) {
          if (photoMsg) { photoMsg.textContent = 'Upload failed: ' + (err.message || err); photoMsg.className = 'muted photo-msg error'; }
          photoPickBtn.disabled = false;
          photoFileInput.value = '';
        }
      };
    }
    if (photoRemoveBtn) {
      photoRemoveBtn.onclick = async () => {
        const player = players.find(p => p.id === pid);
        if (!confirm(`Remove photo for ${player?.name || 'this player'}?`)) return;
        if (photoMsg) { photoMsg.textContent = 'Removing…'; photoMsg.className = 'muted photo-msg'; }
        photoRemoveBtn.disabled = true;
        try {
          await removePlayerPhoto(pid, player?.photo_url);
          if (player) player.photo_url = null;
          await logAudit(team.id, 'player', pid, 'update', { field: 'photo_url', to: null });
          renderSquadTab(team, canEdit, players);
        } catch (err) {
          if (photoMsg) { photoMsg.textContent = 'Remove failed: ' + (err.message || err); photoMsg.className = 'muted photo-msg error'; }
          photoRemoveBtn.disabled = false;
        }
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
    ballPos: { x: 50, y: 50 },
    // match meta
    match_type: 'league',   // 'friendly' | 'league' | 'cup'
    home_away: 'home',      // 'home' | 'away'
    kickoff_time: '',       // 'HH:MM'
    arrival_time: '',       // 'HH:MM'
    notes: '',
    // publish + location
    lineup_status: 'draft', // 'draft' | 'availability' | 'published'
    published: false,       // derived from lineup_status via DB trigger; kept for legacy reads
    location_name: '',
    location_postcode: '',
    location_lat: null,
    location_lng: null
  };
}

function newPlayState() {
  const base = FORMATIONS['4-3-3'];
  return {
    id: null,
    name: '',
    description: '',
    possession: 'in',     // 'in' | 'out'
    formation: '4-3-3',
    pos: base.pos.map(p => [...p]),   // per-play dot positions
    lbl: [...base.lbl],               // per-play labels
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

// Collapsible card wrapper (uses <details> so browser handles state).
// All cards start closed by default; user toggling them persists during session.
function collapsibleCard(id, title, bodyHtml) {
  const open = openCards.has(id);
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

// Open-card state keyed by card-id, persists across renders within the session.
// Cards start closed by default; clicking a card adds it to this set.
const openCards = new Set();

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

// Edit positions mode (session-only custom pos/lbl overrides)
let _posEditMode = false;
let _posDrag = null; // { idx, ox, oy } — offsets captured on pointerdown

// ---------- Match details (summary + modal) ----------
function effectiveVenue(current, team) {
  if (current.home_away === 'home' && team) {
    return {
      name: team.home_ground_name || '',
      postcode: team.home_ground_postcode || '',
      lat: team.home_ground_lat ?? null,
      lng: team.home_ground_lng ?? null
    };
  }
  return {
    name: current.location_name || '',
    postcode: current.location_postcode || '',
    lat: current.location_lat ?? null,
    lng: current.location_lng ?? null
  };
}

function matchSummaryHtml(current, team, canEdit) {
  const tLbl = current.match_type === 'friendly' ? 'Friendly' : current.match_type === 'cup' ? 'Cup' : 'League';
  const haLbl = current.home_away === 'away' ? 'Away' : 'Home';
  const v = effectiveVenue(current, team);
  const dateStr = current.game_date ? formatDate(current.game_date) : '—';
  const oppStr = current.opponent ? escapeHtml(current.opponent) : '<em class="muted">No opponent set</em>';
  const venueLine = (v.name || v.postcode)
    ? `<div class="muted" style="font-size:0.8rem;margin-top:0.25rem">📍 ${escapeHtml(v.name || '')}${v.name && v.postcode ? ' · ' : ''}${escapeHtml(v.postcode || '')}</div>`
    : (current.home_away === 'home'
        ? `<div class="muted" style="font-size:0.8rem;margin-top:0.25rem;color:#b88800">⚠ No home ground set — edit in Squad tab</div>`
        : '');
  const status = current.lineup_status || (current.published ? 'published' : 'draft');
  const pubLine = !current.id ? '' :
      status === 'published'    ? `<div style="margin-top:0.25rem;font-size:0.8rem;color:#2a7">● Published</div>`
    : status === 'availability' ? `<div style="margin-top:0.25rem;font-size:0.8rem;color:#b88800">◐ Collecting availability</div>`
    :                             `<div class="muted" style="margin-top:0.25rem;font-size:0.8rem">○ Draft</div>`;
  const shareLabel = status === 'availability' ? '🔗 Copy availability link for parents' : '🔗 Copy share link for parents';
  return `
    <div style="display:flex;flex-direction:column;gap:0.15rem">
      <div style="font-weight:600">${oppStr}</div>
      <div class="muted" style="font-size:0.8rem">${tLbl} · ${haLbl} · ${escapeHtml(dateStr)}</div>
      ${venueLine}
      ${pubLine}
    </div>
    ${(current.kickoff_time || current.arrival_time) ? `
      <div class="muted" style="font-size:0.8rem;margin-top:0.25rem">
        ${current.arrival_time ? '🚌 ' + escapeHtml(current.arrival_time) : ''}${current.arrival_time && current.kickoff_time ? ' · ' : ''}${current.kickoff_time ? '⚽ KO ' + escapeHtml(current.kickoff_time) : ''}
      </div>` : ''}
    ${canEdit ? `<button class="primary btn-full" id="open-match-details" style="margin-top:0.5rem">📋 Arrange match</button>` : ''}
    ${current.id && (status === 'availability' || status === 'published') ? `<button class="btn-secondary btn-full" id="copy-share-link" style="margin-top:0.35rem">${shareLabel}</button>` : ''}
    ${current.id && (status === 'availability' || status === 'published') ? `<div id="availability-panel" style="margin-top:0.5rem"></div>` : ''}
    <div id="save-msg" class="muted" style="margin-top:0.35rem;min-height:1em;font-size:0.8rem"></div>
  `;
}

function matchDetailsFormHtml(current, team, canEdit) {
  const v = effectiveVenue(current, team);
  const homeLocked = current.home_away === 'home';
  return `
    <label>Opponent</label>
    <input type="text" id="l-opponent" value="${escapeHtml(current.opponent)}" placeholder="e.g. Rivals FC" ${canEdit ? '' : 'disabled'} />
    <div class="sc-row-2" style="margin-top:0.5rem">
      <div>
        <label>Match type</label>
        <select id="l-match-type" ${canEdit ? '' : 'disabled'}>
          <option value="friendly" ${current.match_type === 'friendly' ? 'selected' : ''}>Friendly</option>
          <option value="league"   ${current.match_type === 'league'   ? 'selected' : ''}>League match</option>
          <option value="cup"      ${current.match_type === 'cup'      ? 'selected' : ''}>Cup match</option>
        </select>
      </div>
      <div>
        <label>Home / Away</label>
        <select id="l-home-away" ${canEdit ? '' : 'disabled'}>
          <option value="home" ${current.home_away === 'home' ? 'selected' : ''}>Home</option>
          <option value="away" ${current.home_away === 'away' ? 'selected' : ''}>Away</option>
        </select>
      </div>
    </div>
    <label style="margin-top:0.5rem">Game date</label>
    <input type="date" id="l-date" value="${current.game_date || ''}" ${canEdit ? '' : 'disabled'} />

    <div class="sc-row-2" style="margin-top:0.5rem">
      <div>
        <label>Kick off</label>
        <select id="l-kickoff" ${canEdit ? '' : 'disabled'}>${timeOptions(current.kickoff_time)}</select>
      </div>
      <div>
        <label>Team arrival</label>
        <select id="l-arrival" ${canEdit ? '' : 'disabled'}>${timeOptions(current.arrival_time)}</select>
      </div>
    </div>

    <label style="margin-top:0.5rem">Notes</label>
    <textarea id="l-notes" rows="3" placeholder="e.g. bring training tops, meet at clubhouse" ${canEdit ? '' : 'disabled'}>${escapeHtml(current.notes || '')}</textarea>

    <label style="margin-top:0.5rem">Venue${homeLocked ? ' (from home ground)' : ' (optional)'}</label>
    <input type="text" id="l-venue-name" value="${escapeHtml(v.name)}" placeholder="${homeLocked ? (team?.home_ground_name ? '' : 'Set home ground in Squad tab') : 'e.g. Away ground'}" ${canEdit && !homeLocked ? '' : 'disabled'} />
    <label>Postcode</label>
    <div style="display:flex;gap:0.35rem">
      <input type="text" id="l-venue-postcode" value="${escapeHtml(v.postcode)}" placeholder="e.g. SW1A 1AA" style="flex:1;text-transform:uppercase" ${canEdit && !homeLocked ? '' : 'disabled'} />
      ${canEdit && !homeLocked ? `<button class="btn-secondary" id="l-venue-lookup" type="button" style="flex-shrink:0">🔍 Look up</button>` : ''}
    </div>
    ${canEdit && !homeLocked ? `<button class="btn-full" id="l-venue-finetune" type="button" style="margin-top:0.4rem">🗺️ Fine-tune on map</button>` : ''}
    <div id="l-venue-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.25rem">
      ${v.lat && v.lng ? `✓ ${Number(v.lat).toFixed(5)}, ${Number(v.lng).toFixed(5)} — <a href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}" target="_blank" rel="noopener">Google</a> · <a href="https://what3words.com/${v.lat},${v.lng}" target="_blank" rel="noopener">what3words</a>` : ''}
    </div>

    <div class="lineup-actions" style="margin-top:0.75rem">
      ${canEdit ? `<button class="primary" id="save-lineup">${current.id ? 'Save' : 'Save lineup'}</button>` : ''}
      ${canEdit ? `<button class="btn-secondary" id="clear-pitch">Clear pitch</button>` : ''}
    </div>
    ${canEdit && current.id ? (() => {
      const s = current.lineup_status || (current.published ? 'published' : 'draft');
      const btn = (val, label, hint) => `
        <button type="button" class="lineup-status-btn${s === val ? ' is-active' : ''}" data-status="${val}"
          style="flex:1;padding:0.5rem 0.4rem;border:1px solid #ccc;background:${s === val ? '#2a7' : '#fff'};color:${s === val ? '#fff' : '#333'};font-size:0.8rem;cursor:pointer;border-radius:0">
          <div style="font-weight:600">${label}</div>
          <div style="font-size:0.7rem;opacity:0.8;margin-top:0.1rem">${hint}</div>
        </button>`;
      return `
      <div style="margin-top:0.75rem">
        <div class="muted" style="font-size:0.75rem;margin-bottom:0.25rem">Parent visibility</div>
        <div id="lineup-status-seg" style="display:flex;gap:0;border-radius:6px;overflow:hidden;border:1px solid #ccc">
          ${btn('draft',        'Draft',        'Only coaches')}
          ${btn('availability', 'Availability', 'Ask parents')}
          ${btn('published',    'Show lineup',  'Parents see pitch')}
        </div>
      </div>
      `;
    })() : ''}
    <div id="md-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
  `;
}

function openMatchDetailsModal() {
  const { current, team, canEdit } = editor;
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:520px;height:auto;max-height:90vh">
      <div class="map-modal-header">
        <strong>Match details</strong>
        <button class="btn-secondary" id="md-close" type="button">✕</button>
      </div>
      <div class="map-modal-body" style="padding:0.8rem;overflow-y:auto">
        ${matchDetailsFormHtml(current, team, canEdit)}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); renderLineupsTab(); };
  overlay.querySelector('#md-close').onclick = close;
  // Close on outside click
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  wireMatchDetailsFields(close);
}

function wireMatchDetailsFields(closeModal) {
  const overlay = document.querySelector('.map-modal-overlay');
  if (!overlay) return;
  const bodyEl = overlay.querySelector('.map-modal-body');

  const rerenderBody = () => {
    bodyEl.innerHTML = matchDetailsFormHtml(editor.current, editor.team, editor.canEdit);
    wireMatchDetailsFields(closeModal);
  };

  const oppEl  = overlay.querySelector('#l-opponent');
  const typeEl = overlay.querySelector('#l-match-type');
  const haEl   = overlay.querySelector('#l-home-away');
  const dateEl = overlay.querySelector('#l-date');
  if (oppEl)  oppEl.oninput   = e => { editor.current.opponent = e.target.value; };
  if (dateEl) dateEl.oninput  = e => { editor.current.game_date = e.target.value; };
  if (typeEl) typeEl.onchange = e => { editor.current.match_type = e.target.value; };
  const koEl = overlay.querySelector('#l-kickoff');
  const arEl = overlay.querySelector('#l-arrival');
  const notesEl = overlay.querySelector('#l-notes');
  if (koEl)    koEl.onchange   = e => { editor.current.kickoff_time = e.target.value; };
  if (arEl)    arEl.onchange   = e => { editor.current.arrival_time = e.target.value; };
  if (notesEl) notesEl.oninput = e => { editor.current.notes = e.target.value; };
  if (haEl)   haEl.onchange   = e => {
    editor.current.home_away = e.target.value;
    if (e.target.value === 'home' && editor.team) {
      editor.current.location_name = editor.team.home_ground_name || '';
      editor.current.location_postcode = editor.team.home_ground_postcode || '';
      editor.current.location_lat = editor.team.home_ground_lat ?? null;
      editor.current.location_lng = editor.team.home_ground_lng ?? null;
    }
    rerenderBody();
  };

  const venueNameEl = overlay.querySelector('#l-venue-name');
  const venuePostEl = overlay.querySelector('#l-venue-postcode');
  if (venueNameEl) venueNameEl.oninput = e => { editor.current.location_name = e.target.value; };
  if (venuePostEl) venuePostEl.oninput = e => {
    editor.current.location_postcode = e.target.value;
    editor.current.location_lat = null;
    editor.current.location_lng = null;
  };

  const lookupBtn = overlay.querySelector('#l-venue-lookup');
  if (lookupBtn) lookupBtn.onclick = async () => {
    const msg = overlay.querySelector('#l-venue-msg');
    const pc = (editor.current.location_postcode || '').trim().toUpperCase();
    if (!pc) { msg.textContent = 'Enter a postcode first.'; msg.className = 'error'; return; }
    msg.textContent = 'Looking up…'; msg.className = 'muted';
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      const body = await res.json();
      if (!res.ok || body.status !== 200 || !body.result) {
        msg.textContent = 'Postcode not found.'; msg.className = 'error'; return;
      }
      editor.current.location_lat = body.result.latitude;
      editor.current.location_lng = body.result.longitude;
      editor.current.location_postcode = body.result.postcode;
      if (venuePostEl) venuePostEl.value = body.result.postcode;
      msg.innerHTML = `✓ ${escapeHtml(body.result.postcode)} — <a href="https://www.google.com/maps/search/?api=1&query=${body.result.latitude},${body.result.longitude}" target="_blank" rel="noopener">Google</a> · <a href="https://what3words.com/${body.result.latitude},${body.result.longitude}" target="_blank" rel="noopener">what3words</a>`;
      msg.className = 'ok';
    } catch (err) {
      msg.textContent = 'Lookup failed: ' + err.message; msg.className = 'error';
    }
  };

  const venueFineBtn = overlay.querySelector('#l-venue-finetune');
  if (venueFineBtn) venueFineBtn.onclick = async () => {
    let startLat = editor.current.location_lat;
    let startLng = editor.current.location_lng;
    if ((startLat == null || startLng == null) && (editor.current.location_postcode || '').trim()) {
      try {
        const pc = editor.current.location_postcode.trim().toUpperCase();
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
        const body = await res.json();
        if (res.ok && body.status === 200 && body.result) {
          startLat = body.result.latitude; startLng = body.result.longitude;
        }
      } catch {}
    }
    const result = await openMapPicker({ lat: startLat, lng: startLng });
    if (!result) return;
    editor.current.location_lat = result.lat;
    editor.current.location_lng = result.lng;
    const msg = overlay.querySelector('#l-venue-msg');
    if (msg) msg.innerHTML = `✓ ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} — <a href="https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lng}" target="_blank" rel="noopener">Google</a> · <a href="https://what3words.com/${result.lat},${result.lng}" target="_blank" rel="noopener">what3words</a>`;
  };

  overlay.querySelectorAll('.lineup-status-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!editor.current.id) return;
      const nextStatus = btn.dataset.status;
      const prevStatus = editor.current.lineup_status || (editor.current.published ? 'published' : 'draft');
      if (nextStatus === prevStatus) return;
      if (nextStatus !== 'draft' && !editor.current.game_date) {
        alert('Set a Game date before publishing.'); return;
      }
      const { data, error } = await supabase.from('lineups')
        .update({ lineup_status: nextStatus })
        .eq('id', editor.current.id).select().single();
      if (error) { alert('Status change failed: ' + error.message); return; }
      editor.current.lineup_status = data.lineup_status;
      editor.current.published = data.published;
      editor.current.published_at = data.published_at;
      const idx = editor.lineups.findIndex(l => l.id === data.id);
      if (idx >= 0) editor.lineups[idx] = data;
      await logAudit(editor.team.id, 'lineup', data.id, 'status:' + nextStatus, { from: prevStatus });
      rerenderBody();
      renderLineupsTab();
    };
  });

  const saveBtn = overlay.querySelector('#save-lineup');
  if (saveBtn) saveBtn.onclick = async () => {
    const msgEl = overlay.querySelector('#md-msg');
    await saveLineupWithMsg(msgEl);
    if (!(msgEl && msgEl.className === 'ok')) return;
    // After save: prompt to fine-tune the pitch location on the map.
    // Seed the pin from the effective venue (for Home games this comes from the team's home ground).
    // Fall back to a postcode lookup if we only have a postcode, then UK centre as last resort.
    const cur = editor.current;
    const v = effectiveVenue(cur, editor.team);
    const haveCoords = v.lat != null && v.lng != null;
    const shouldPrompt = cur.home_away === 'away' ? true : !haveCoords;
    if (shouldPrompt) {
      let startLat = v.lat, startLng = v.lng;
      if ((startLat == null || startLng == null) && (v.postcode || '').trim()) {
        try {
          const pc = v.postcode.trim().toUpperCase();
          const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
          const body = await res.json();
          if (res.ok && body.status === 200 && body.result) {
            startLat = body.result.latitude; startLng = body.result.longitude;
          }
        } catch {}
      }
      const result = await openMapPicker({ lat: startLat, lng: startLng });
      if (result) {
        editor.current.location_lat = result.lat;
        editor.current.location_lng = result.lng;
        // Persist the fine-tuned coords (re-save quietly)
        await saveLineupWithMsg(msgEl);
      }
    }
    setTimeout(closeModal, 400);
  };

  const clearBtn = overlay.querySelector('#clear-pitch');
  if (clearBtn) clearBtn.onclick = () => {
    editor.current.slots = {};
    editor.current.subs = [];
    closeModal();
  };
}

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
    ? lineups.map(l => {
        const tLbl = l.match_type === 'friendly' ? 'Friendly' : l.match_type === 'cup' ? 'Cup' : 'League';
        const haLbl = l.home_away === 'away' ? '(A)' : '(H)';
        const title = (l.opponent ? 'vs ' + escapeHtml(l.opponent) : '—') + ' ' + haLbl;
        return `
        <div class="lineup-item ${current.id === l.id ? 'active' : ''}" data-lineup="${l.id}">
          <div class="lineup-name">${title}</div>
          <div class="lineup-meta">
            ${tLbl}${l.game_date ? ' · ' + formatDate(l.game_date) : ''}${l.data?.formation ? ' · ' + l.data.formation : ''}
          </div>
          ${canEdit ? `<button class="lineup-del" data-del-lineup="${l.id}" title="Delete">✕</button>` : ''}
        </div>`;
      }).join('')
    : `<p class="muted" style="padding:0.75rem">No saved lineups yet.</p>`;

  const tacticsCardHtml = canEdit ? collapsibleCard('lineup-tactics', 'Tactics', `
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
  `) : '';

  tabEl.innerHTML = `
    <div class="lineup-layout">
      <aside class="lineup-left">
        ${collapsibleCard('lineup-details', 'Match details', matchSummaryHtml(current, team, canEdit))}

        ${collapsibleCard('lineup-saved', 'Saved lineups', `
          <div class="lineup-list">${lineupsListHtml}</div>
          ${canEdit ? `<button class="btn-full" id="new-lineup-btn" style="margin-top:0.5rem">+ New lineup</button>` : ''}
        `)}
      </aside>

      <div class="lineup-center">
        <div class="card pitch-card">
          <div class="pitch" id="pitch">
            <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
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
        ${tacticsCardHtml}
        ${collapsibleCard('lineup-formation', 'Formation', `
          <div class="f-btns f-btns-col">${formationBtns}</div>
          ${canEdit ? `
            <div style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.35rem">
              ${_posEditMode
                ? `<button class="primary btn-full" id="pos-edit-done">✓ Done</button>
                   <button class="btn-full" id="pos-edit-save">💾 Save as formation…</button>
                   <button class="btn-full" id="pos-edit-cancel" style="margin-bottom:0">✕ Cancel</button>
                   <p class="muted" style="font-size:0.72rem;margin:0.25rem 0 0">Drag handles to reposition. Double-click a label to rename.</p>`
                : `<button class="btn-full" id="pos-edit-toggle" style="margin-bottom:0">✎ Edit positions</button>`
              }
            </div>
          ` : ''}
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

  // Auto-save any changes once a published lineup is open
  scheduleAutosaveIfPublished();

  // Coach-facing availability responses panel (only when in availability/published mode)
  const curStatus = current?.lineup_status || (current?.published ? 'published' : 'draft');
  if (current?.id && (curStatus === 'availability' || curStatus === 'published')) {
    renderCoachAvailabilityPanel();
  }
}

function chipHtml(player, context) {
  const num = player.number ?? '';
  const hasPhoto = !!player.photo_url;
  const photoStyle = hasPhoto ? ` style="background-image:url('${escapeHtml(player.photo_url)}')"` : '';
  return `
    <div class="chip-wrap">
      <div class="chip ${context === 'palette' ? 'chip-palette' : ''} ${hasPhoto ? 'has-photo' : ''}"
           draggable="${editor.canEdit ? 'true' : 'false'}"
           data-player-id="${player.id}"${photoStyle}>
        ${hasPhoto ? '' : `<div class="chip-inner">
          ${num !== '' ? `<div class="chip-num">${num}</div>` : ''}
          <div class="chip-name">${escapeHtml(shortName(player.name))}</div>
        </div>`}
      </div>
      ${hasPhoto ? `<div class="chip-caption">${num !== '' ? `<span class="cc-num">${num}</span> ` : ''}${escapeHtml(shortName(player.name))}</div>` : ''}
    </div>
  `;
}

// ---------- Player photo helper ----------
// Uploads a file to Supabase Storage at `<player_id>/photo-<timestamp>.<ext>`
// then sets players.photo_url to the public URL. RLS gates who can write.
async function uploadPlayerPhoto(playerId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
  const path = `${playerId}/photo-${Date.now()}.${safeExt}`;
  const up = await supabase.storage.from('player-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || ('image/' + safeExt)
  });
  if (up.error) throw up.error;
  const { data: pub } = supabase.storage.from('player-photos').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error('Could not generate public URL');
  const updRes = await supabase.from('players').update({ photo_url: publicUrl }).eq('id', playerId).select().single();
  if (updRes.error) throw updRes.error;
  return updRes.data;
}

// Photo cropper: shows the picked image in a square frame, lets user drag + zoom,
// returns a Blob (square JPEG, ~512x512) ready to upload.
function openPhotoCropper(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const overlay = document.createElement('div');
      overlay.className = 'cropper-overlay';
      overlay.innerHTML = `
        <div class="cropper-modal" role="dialog" aria-label="Crop photo">
          <div class="cropper-header">
            <div class="cropper-title">Position the face</div>
            <button class="cropper-close" type="button" aria-label="Cancel">×</button>
          </div>
          <div class="cropper-stage" data-stage>
            <canvas data-cv width="320" height="320"></canvas>
            <div class="cropper-frame" aria-hidden="true"></div>
          </div>
          <div class="cropper-controls">
            <label class="cropper-zoom">
              <span>Zoom</span>
              <input type="range" min="100" max="400" value="100" data-zoom>
            </label>
            <p class="cropper-hint muted">Drag the photo to move it. Use zoom to scale.</p>
          </div>
          <div class="cropper-actions">
            <button class="btn-secondary" type="button" data-cancel>Cancel</button>
            <button class="btn-primary" type="button" data-save>Use photo</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const SIZE = 320;        // preview canvas size
      const OUT = 512;         // output size
      const cv = overlay.querySelector('[data-cv]');
      const ctx = cv.getContext('2d');
      const zoomEl = overlay.querySelector('[data-zoom]');
      const stage = overlay.querySelector('[data-stage]');

      // Fit image so the SHORTEST side fills the SIZE x SIZE frame at zoom=1.
      const fitScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      let scale = 1;           // multiplier on top of fitScale
      let tx = 0, ty = 0;      // translation in canvas px (centred at 0,0)

      function clamp() {
        const s = fitScale * scale;
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        const maxX = Math.max(0, (w - SIZE) / 2);
        const maxY = Math.max(0, (h - SIZE) / 2);
        if (tx > maxX) tx = maxX; if (tx < -maxX) tx = -maxX;
        if (ty > maxY) ty = maxY; if (ty < -maxY) ty = -maxY;
      }
      function draw() {
        clamp();
        const s = fitScale * scale;
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, (SIZE - w) / 2 + tx, (SIZE - h) / 2 + ty, w, h);
      }
      draw();

      // Drag (mouse + touch)
      let dragging = false; let lastX = 0, lastY = 0;
      const onDown = (e) => {
        dragging = true;
        const pt = e.touches ? e.touches[0] : e;
        lastX = pt.clientX; lastY = pt.clientY;
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const pt = e.touches ? e.touches[0] : e;
        tx += pt.clientX - lastX;
        ty += pt.clientY - lastY;
        lastX = pt.clientX; lastY = pt.clientY;
        draw();
        e.preventDefault();
      };
      const onUp = () => { dragging = false; };
      cv.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      cv.addEventListener('touchstart', onDown, { passive: false });
      cv.addEventListener('touchmove', onMove, { passive: false });
      cv.addEventListener('touchend', onUp);

      zoomEl.oninput = () => {
        const newScale = parseInt(zoomEl.value, 10) / 100;
        // Keep centre stable when zooming
        const ratio = newScale / scale;
        tx *= ratio; ty *= ratio;
        scale = newScale;
        draw();
      };

      const cleanup = (result) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        URL.revokeObjectURL(url);
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector('.cropper-close').onclick = () => cleanup(null);
      overlay.querySelector('[data-cancel]').onclick = () => cleanup(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
      overlay.querySelector('[data-save]').onclick = () => {
        // Render at OUT x OUT
        const out = document.createElement('canvas');
        out.width = OUT; out.height = OUT;
        const octx = out.getContext('2d');
        const s = fitScale * scale * (OUT / SIZE);
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        const otx = tx * (OUT / SIZE);
        const oty = ty * (OUT / SIZE);
        octx.fillStyle = '#000';
        octx.fillRect(0, 0, OUT, OUT);
        octx.drawImage(img, (OUT - w) / 2 + otx, (OUT - h) / 2 + oty, w, h);
        out.toBlob((blob) => {
          if (!blob) { cleanup(null); return; }
          // Attach a name so .upload() picks a sensible content type
          blob.name = 'photo.jpg';
          cleanup(blob);
        }, 'image/jpeg', 0.88);
      };
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function removePlayerPhoto(playerId, currentUrl) {
  // Best-effort: try to delete the old file from storage, then null the column
  if (currentUrl) {
    const m = currentUrl.match(/\/player-photos\/(.+)$/);
    if (m && m[1]) {
      try { await supabase.storage.from('player-photos').remove([decodeURIComponent(m[1])]); } catch {}
    }
  }
  const updRes = await supabase.from('players').update({ photo_url: null }).eq('id', playerId).select().single();
  if (updRes.error) throw updRes.error;
  return updRes.data;
}

function renderPitch() {
  const slotsLayer = document.getElementById('slots-layer');
  if (!slotsLayer) return;
  const { current, players } = editor;
  const formation = getFormation(current.formation);
  if (!formation) { slotsLayer.innerHTML = ''; return; }

  const pById = id => players.find(p => p.id === id);
  // Session-custom overrides (from Edit positions mode or loaded play)
  const pos = (Array.isArray(current.pos) && current.pos.length === formation.pos.length) ? current.pos : formation.pos;
  const lbl = (Array.isArray(current.lbl) && current.lbl.length === formation.lbl.length) ? current.lbl : formation.lbl;

  const editMode = !!_posEditMode;

  const slotsHtml = pos.map(([x, y], i) => {
    const pid = current.slots[i];
    const p = pid ? pById(pid) : null;
    const label = lbl[i] || '';
    const editCls = editMode ? ' slot-pos-edit' : '';
    return `
      <div class="slot ${p ? 'filled' : ''}${editCls}"
           style="left:${x}%; top:${y}%"
           data-slot="${i}">
        ${editMode
          ? `<div class="pos-handle" data-pos-handle="${i}" title="Drag to reposition"></div>
             <div class="pos-edit-label" data-pos-label="${i}">${escapeHtml(label)}</div>`
          : (p
              ? `<div class="chip-wrap">
                  <div class="chip chip-slot ${p.photo_url ? 'has-photo' : ''}" draggable="${editor.canEdit ? 'true' : 'false'}" data-player-id="${p.id}" data-from-slot="${i}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
                    ${p.photo_url ? '' : `<div class="chip-inner">
                      ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                      <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
                    </div>`}
                  </div>
                  ${p.photo_url ? `<div class="chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
                </div>`
              : `<div class="slot-label">${label}</div>`)
        }
        ${!editMode ? `<div class="slot-pos-lbl">${label}</div>` : ''}
      </div>
    `;
  }).join('');

  slotsLayer.innerHTML = slotsHtml;
}

// Kept as fallback helper (not currently called, but left in case)
function pitchSvgHtml() {
  return `<svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>`;
}

// Inner SVG markup (pitch lines) — placed inside the outer <svg> in render
// SVG uses viewBox "0 0 70 100" so it matches the container's 7:10 aspect ratio.
// With matching aspects the SVG renders 1:1 — circles stay round, lines stay square.
function pitchSvgInner() {
  return `
      <!-- perimeter -->
      <rect x="1" y="1" width="68" height="98" fill="none" stroke="white" stroke-width="0.4" opacity="0.7"/>
      <!-- halfway line -->
      <line x1="1" y1="50" x2="69" y2="50" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- centre circle + spot -->
      <circle cx="35" cy="50" r="9" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <circle cx="35" cy="50" r="0.6" fill="white" opacity="0.8"/>
      <!-- top penalty area -->
      <rect x="13" y="1" width="44" height="14" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- top goal area -->
      <rect x="24" y="1" width="22" height="5" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- top penalty spot -->
      <circle cx="35" cy="10" r="0.6" fill="white" opacity="0.8"/>
      <!-- top penalty arc -->
      <path d="M 26 15 A 9 9 0 0 0 44 15" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- bottom penalty area -->
      <rect x="13" y="85" width="44" height="14" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- bottom goal area -->
      <rect x="24" y="94" width="22" height="5" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
      <!-- bottom penalty spot -->
      <circle cx="35" cy="90" r="0.6" fill="white" opacity="0.8"/>
      <!-- bottom penalty arc -->
      <path d="M 26 85 A 9 9 0 0 1 44 85" fill="none" stroke="white" stroke-width="0.35" opacity="0.7"/>
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
          ? `<div class="chip-wrap">
              <div class="chip chip-sub ${p.photo_url ? 'has-photo' : ''}" draggable="${editor.canEdit ? 'true' : 'false'}" data-player-id="${p.id}" data-from-sub="${i}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
                ${p.photo_url ? '' : `<div class="chip-inner">
                  ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                  <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
                </div>`}
              </div>
              ${p.photo_url ? `<div class="chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
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
      // Changing formation resets any session-custom positions
      delete editor.current.pos;
      delete editor.current.lbl;
      _posEditMode = false;
      // Drop any slotted players beyond the new formation's slot count
      const newCount = (getFormation(editor.current.formation)?.pos.length) || 0;
      Object.keys(editor.current.slots).forEach(k => {
        if (parseInt(k) >= newCount) delete editor.current.slots[k];
      });
      renderLineupsTab();
    };
  });

  // Open match details modal
  const openMdBtn = document.getElementById('open-match-details');
  if (openMdBtn) openMdBtn.onclick = openMatchDetailsModal;

  // Copy share link for parents
  const copyShareBtn = document.getElementById('copy-share-link');
  if (copyShareBtn) copyShareBtn.onclick = async () => {
    const id = editor?.current?.id;
    if (!id) return;
    const base = location.origin + location.pathname;
    const shareUrl = `${base}#/view/${id}`;
    const msg = document.getElementById('save-msg');
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (msg) { msg.textContent = '✓ Share link copied'; msg.className = 'ok'; }
    } catch (e) {
      // Fallback: show a prompt so they can copy manually
      window.prompt('Copy this link:', shareUrl);
      if (msg) { msg.textContent = 'Link ready to copy'; msg.className = 'muted'; }
    }
    setTimeout(() => { if (msg && msg.className !== '') { msg.textContent = ''; msg.className = 'muted'; } }, 3000);
  };

  // Buttons
  const newBtn = document.getElementById('new-lineup-btn');
  if (newBtn) newBtn.onclick = () => {
    if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
    editor.current = newLineupState(); _lastSavedHash = _lineupContentHash(editor.current);
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
        match_type: l.match_type || 'league',
        home_away: l.home_away || 'home',
        kickoff_time: l.kickoff_time || '',
        arrival_time: l.arrival_time || '',
        notes: l.notes || '',
        formation: l.data?.formation || '4-3-3',
        slots: { ...(l.data?.slots || {}) },
        subs: [...(l.data?.subs || [])],
        arrows: (l.data?.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(l.data?.zoneLines || [null, null])],
        ballVisible: !!l.data?.ballVisible,
        ballPos: { ...(l.data?.ballPos || { x: 50, y: 50 }) },
        published: !!l.published,
        lineup_status: l.lineup_status || (l.published ? 'published' : 'draft'),
        location_name: l.location_name || '',
        location_postcode: l.location_postcode || '',
        location_lat: l.location_lat ?? null,
        location_lng: l.location_lng ?? null
      };
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      // Mark this state as already-saved so autosave doesn't fire on first render
      _lastSavedHash = _lineupContentHash(editor.current);
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
      if (!confirm(`Delete lineup "${l.opponent || l.name || 'Untitled'}"?`)) return;
      const { error } = await supabase.from('lineups').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await logAudit(team.id, 'lineup', id, 'delete', { name: l.name });
      const idx = lineups.findIndex(x => x.id === id);
      if (idx >= 0) lineups.splice(idx, 1);
      if (editor.current.id === id) editor.current = newLineupState(); _lastSavedHash = _lineupContentHash(editor.current);
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

  // Edit positions toggle
  const posToggle = document.getElementById('pos-edit-toggle');
  if (posToggle) posToggle.onclick = () => {
    const f = getFormation(editor.current.formation);
    if (!f) return;
    if (!Array.isArray(editor.current.pos)) editor.current.pos = f.pos.map(p => [...p]);
    if (!Array.isArray(editor.current.lbl)) editor.current.lbl = [...f.lbl];
    _posEditMode = true;
    renderLineupsTab();
  };

  const posDone = document.getElementById('pos-edit-done');
  if (posDone) posDone.onclick = () => {
    _posEditMode = false;
    renderLineupsTab();
  };

  const posCancel = document.getElementById('pos-edit-cancel');
  if (posCancel) posCancel.onclick = () => {
    // Revert to formation defaults for this session
    delete editor.current.pos;
    delete editor.current.lbl;
    _posEditMode = false;
    renderLineupsTab();
  };

  const posSave = document.getElementById('pos-edit-save');
  if (posSave) posSave.onclick = async () => {
    const baseName = editor.current.formation;
    const suggested = baseName + ' (custom)';
    const name = prompt('Save as custom formation — name:', suggested);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload = {
      team_id: editor.team.id,
      name: trimmed,
      data: {
        pos: editor.current.pos.map(p => [...p]),
        lbl: [...editor.current.lbl]
      }
    };
    const { data, error } = await supabase.from('formations').insert(payload).select().single();
    if (error) { alert('Save failed: ' + error.message); return; }
    editor.customFormations = editor.customFormations || [];
    editor.customFormations.unshift(data);
    await logAudit(editor.team.id, 'formation', data.id, 'create', { name: trimmed, from: 'edit-positions' });
    editor.current.formation = trimmed;
    delete editor.current.pos;
    delete editor.current.lbl;
    _posEditMode = false;
    renderLineupsTab();
  };

  if (canEdit && _posEditMode) wirePositionEditing();

  wireCollapsibles(tabEl);

  if (canEdit && !_posEditMode) wireDragAndDrop();
  if (canEdit && !_posEditMode) wireTacticsUI();
  if (canEdit && !_posEditMode) wirePicker();
}

function wirePositionEditing() {
  const pitch = document.getElementById('pitch');
  if (!pitch) return;

  pitch.querySelectorAll('[data-pos-handle]').forEach(h => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = parseInt(h.dataset.posHandle, 10);
      _posDrag = { idx };
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener('pointermove', (e) => {
      if (!_posDrag || _posDrag.idx !== parseInt(h.dataset.posHandle, 10)) return;
      const rect = pitch.getBoundingClientRect();
      const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
      editor.current.pos[_posDrag.idx] = [x, y];
      const slot = pitch.querySelector(`.slot[data-slot="${_posDrag.idx}"]`);
      if (slot) { slot.style.left = x + '%'; slot.style.top = y + '%'; }
    });
    const finish = (e) => {
      if (!_posDrag) return;
      try { h.releasePointerCapture(e.pointerId); } catch {}
      _posDrag = null;
    };
    h.addEventListener('pointerup', finish);
    h.addEventListener('pointercancel', finish);
  });

  // Double-click a label to rename it
  pitch.querySelectorAll('[data-pos-label]').forEach(lab => {
    lab.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = parseInt(lab.dataset.posLabel, 10);
      const current = editor.current.lbl[idx] || '';
      const next = prompt('Label (e.g. CB, CM, ST):', current);
      if (next === null) return;
      editor.current.lbl[idx] = next.trim().toUpperCase().slice(0, 4);
      renderLineupsTab();
    });
  });
}

// Track <details> open/close into openCards so state survives rerenders
function wireCollapsibles(root) {
  root.querySelectorAll('details.collapsible[data-card]').forEach(d => {
    d.addEventListener('toggle', () => {
      const id = d.dataset.card;
      if (d.open) openCards.add(id);
      else openCards.delete(id);
    });
  });
}

function saveAsPlay() {
  const { team, current } = editor;
  const defaultName = current.name ? `${current.name} (play)` : '';

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.innerHTML = `
    <div class="picker-modal cfb-modal">
      <div class="picker-header">
        <strong>Save as play</strong>
        <button class="picker-close" data-action="close">✕</button>
      </div>
      <div class="picker-body">
        <label>Name</label>
        <input type="text" id="sap-name" value="${escapeHtml(defaultName)}" placeholder="e.g. High press from goal kick" />
        <label style="margin-top:0.5rem">Possession</label>
        <select id="sap-possession">
          <option value="in">In possession</option>
          <option value="out">Out of possession</option>
        </select>
        <label style="margin-top:0.5rem">Description</label>
        <textarea id="sap-description" rows="3" placeholder="Optional notes"></textarea>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
          <button class="btn-secondary" data-action="close">Cancel</button>
          <button class="primary" id="sap-save">Save play</button>
        </div>
        <div id="sap-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-action=close]').forEach(b => b.onclick = close);
  setTimeout(() => overlay.querySelector('#sap-name')?.focus(), 20);

  overlay.querySelector('#sap-save').onclick = async () => {
    const msg = overlay.querySelector('#sap-msg');
    const name = (overlay.querySelector('#sap-name').value || '').trim();
    if (!name) { msg.textContent = 'Name is required.'; msg.className = 'error'; return; }
    const possession = overlay.querySelector('#sap-possession').value;
    const description = overlay.querySelector('#sap-description').value || '';

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      team_id: team.id,
      name,
      created_by: user?.id || null,
      data: {
        formation: current.formation,
        pos: current.pos ? current.pos.map(p => [...p]) : null,
        lbl: current.lbl ? [...current.lbl] : null,
        slots: { ...current.slots },
        subs: [...current.subs],
        arrows: (current.arrows || []).map(a => ({ ...a })),
        zoneLines: [...current.zoneLines],
        ballVisible: !!current.ballVisible,
        ballPos: { ...current.ballPos },
        description,
        possession
      }
    };
    const { data, error } = await supabase.from('plays').insert(payload).select().single();
    if (error) { msg.textContent = 'Save failed: ' + error.message; msg.className = 'error'; return; }
    editor.plays.unshift(data);
    await logAudit(team.id, 'play', data.id, 'create', { name, from: 'lineup' });
    close();
    const saveMsg = document.getElementById('save-msg');
    if (saveMsg) { saveMsg.textContent = `✓ Saved play "${name}"`; saveMsg.className = 'ok'; setTimeout(() => { if (saveMsg) saveMsg.textContent = ''; }, 2500); }
  };
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
                <button class="picker-item ${p.photo_url ? 'has-photo' : ''}" data-pid="${p.id}">
                  ${p.photo_url
                    ? `<span class="picker-photo" style="background-image:url('${escapeHtml(p.photo_url)}')"></span>`
                    : `<span class="picker-num">${p.number ?? '–'}</span>`}
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

// Auto-generate dot positions from rows (back to front, GK at bottom).
// rows = [{ players: N, label: 'DEF' }, ...]  (GK added implicitly at front)
function generateFormationFromRows(rows) {
  const pos = [];
  const lbl = [];
  // GK
  pos.push([50, 87]);
  lbl.push('GK');
  const n = rows.length;
  // Distribute row Y positions from y=70 (nearest GK) up to y=22 (forward line)
  const yStart = 70, yEnd = 22;
  rows.forEach((row, i) => {
    const y = n === 1 ? 50 : yStart - ((yStart - yEnd) * (i / (n - 1)));
    const m = Math.max(1, row.players | 0);
    const margin = 15;
    const usable = 100 - margin * 2;
    for (let k = 0; k < m; k++) {
      const x = m === 1 ? 50 : margin + (usable * (k / (m - 1)));
      pos.push([x, Math.round(y * 10) / 10]);
      lbl.push((row.label || '').toUpperCase().slice(0, 5));
    }
  });
  return { pos, lbl };
}

function openFormationBuilder(onSaved, existing) {
  const { team } = editor;
  const isEdit = !!existing;
  // Default rows: 4 DEF, 3 MID, 3 FWD (back to front)
  const state = isEdit
    ? {
        name: existing.name,
        rows: (existing.data && Array.isArray(existing.data.rows) && existing.data.rows.length)
          ? existing.data.rows.map(r => ({ players: r.players, label: r.label }))
          : [{ players: 4, label: 'DEF' }, { players: 3, label: 'MID' }, { players: 3, label: 'FWD' }]
      }
    : {
        name: 'Custom',
        rows: [
          { players: 4, label: 'DEF' },
          { players: 3, label: 'MID' },
          { players: 3, label: 'FWD' }
        ]
      };

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  function render() {
    const rowsHtml = state.rows.map((r, i) => `
      <tr data-row="${i}">
        <td>
          <button class="cfb-mini" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move back">↑</button>
          <button class="cfb-mini" data-down="${i}" ${i === state.rows.length - 1 ? 'disabled' : ''} title="Move forward">↓</button>
        </td>
        <td><input type="number" min="1" max="6" value="${r.players}" data-players="${i}" class="cfb-num" /></td>
        <td><input type="text" maxlength="5" value="${escapeHtml(r.label)}" data-label="${i}" class="cfb-lbl" /></td>
        <td><button class="cfb-mini cfb-del" data-del="${i}" title="Remove row">✕</button></td>
      </tr>
    `).join('');

    overlay.innerHTML = `
      <div class="picker-modal cfb-modal">
        <div class="picker-header">
          <strong>${isEdit ? 'Edit formation' : 'Custom formation builder'}</strong>
          <button class="picker-close" data-action="close">✕</button>
        </div>
        <div class="picker-body">
          <label>Name</label>
          <input type="text" id="cfb-name" value="${escapeHtml(state.name)}" placeholder="e.g. 4-3-3 high" />
          <p class="muted" style="margin:0.75rem 0 0.35rem;font-size:0.8rem">Rows — back to front, ↑↓ to reorder. GK is added automatically.</p>
          <table class="cfb-table">
            <thead><tr><th></th><th>Players</th><th>Label</th><th></th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <button class="btn-full cfb-add" id="cfb-add-row" style="margin-top:0.5rem">+ Add row</button>
          <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
            <button class="btn-secondary" data-action="close">Cancel</button>
            <button class="primary" id="cfb-save">Save formation</button>
          </div>
          <div id="cfb-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
        </div>
      </div>
    `;

    overlay.querySelectorAll('[data-action=close]').forEach(b => b.onclick = close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#cfb-name').oninput = e => { state.name = e.target.value; };
    overlay.querySelectorAll('[data-players]').forEach(inp => {
      inp.oninput = e => {
        const i = parseInt(inp.dataset.players);
        const n = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
        state.rows[i].players = n;
      };
    });
    overlay.querySelectorAll('[data-label]').forEach(inp => {
      inp.oninput = e => {
        const i = parseInt(inp.dataset.label);
        state.rows[i].label = e.target.value.toUpperCase().slice(0, 5);
      };
    });
    overlay.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.up);
      if (i === 0) return;
      [state.rows[i - 1], state.rows[i]] = [state.rows[i], state.rows[i - 1]];
      render();
    });
    overlay.querySelectorAll('[data-down]').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.down);
      if (i === state.rows.length - 1) return;
      [state.rows[i + 1], state.rows[i]] = [state.rows[i], state.rows[i + 1]];
      render();
    });
    overlay.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.del);
      state.rows.splice(i, 1);
      render();
    });
    overlay.querySelector('#cfb-add-row').onclick = () => {
      state.rows.push({ players: 1, label: 'MID' });
      render();
    };
    overlay.querySelector('#cfb-save').onclick = async () => {
      const msg = overlay.querySelector('#cfb-msg');
      msg.textContent = '';
      const name = (state.name || '').trim();
      if (!name) { msg.textContent = 'Give the formation a name.'; msg.className = 'error'; return; }
      if (FORMATIONS[name]) { msg.textContent = `"${name}" is a preset name. Pick a different name.`; msg.className = 'error'; return; }
      if (editor.customFormations.some(c => c.name === name && (!isEdit || c.id !== existing.id))) {
        msg.textContent = `"${name}" already exists.`; msg.className = 'error'; return;
      }
      if (!state.rows.length) { msg.textContent = 'Add at least one row.'; msg.className = 'error'; return; }
      const total = 1 + state.rows.reduce((s, r) => s + (r.players | 0), 0);
      if (total < 7 || total > 11) {
        msg.textContent = `Total players = ${total}. Should be 7–11 (incl. GK).`; msg.className = 'error'; return;
      }
      const { pos, lbl } = generateFormationFromRows(state.rows);
      const payload = { team_id: team.id, name, data: { pos, lbl, rows: state.rows } };
      let data, error;
      if (isEdit) {
        ({ data, error } = await supabase.from('formations').update(payload).eq('id', existing.id).select().single());
      } else {
        ({ data, error } = await supabase.from('formations').insert(payload).select().single());
      }
      if (error) { msg.textContent = 'Save failed: ' + error.message; msg.className = 'error'; return; }
      if (isEdit) {
        const idx = editor.customFormations.findIndex(c => c.id === existing.id);
        if (idx >= 0) editor.customFormations[idx] = data;
      } else {
        editor.customFormations.push(data);
      }
      await logAudit(team.id, 'formation', data.id, isEdit ? 'update' : 'create', { name });
      close();
      if (onSaved) onSaved(name);
    };
  }
  render();
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
    if (_posEditMode) return; // Edit-positions mode owns all pointer events on the pitch
    if (tacticMode) return;   // Tactics (move/click/drag/ball) own pointer events on the pitch
    if (e.button !== undefined && e.button !== 0) return;
    // Don't start a chip drag if the press landed on the ball, tactics canvas, or a tactic control
    if (e.target.closest?.('#ball-el, .tactics-canvas, [data-tactic-mode], #btn-ball, .zone-row, #tactic-info')) return;
    // Find the chip:
    // 1. Walk up from target (hit .chip, .chip-inner, .chip-num, .chip-name)
    let chip = e.target.closest?.('.chip');
    // 2. If target is the slot/sub container, pick up the chip inside
    if (!chip) {
      const container = e.target.closest?.('[data-slot], [data-sub]');
      if (container) chip = container.querySelector('.chip');
    }
    // (No elementsFromPoint fallback — it reaches through the ball/canvas and grabs chips underneath.)
    if (!chip) return;
    if (!document.getElementById('tab-content')?.contains(chip)) return;
    e.preventDefault();

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
  return Object.keys(c.slots).length > 0 || c.subs.some(Boolean) || c.opponent;
}

async function saveLineup() { return saveLineupWithMsg(document.getElementById('save-msg')); }

async function saveLineupWithMsg(msgEl) {
  const { team, lineups, current } = editor;
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'muted'; }
  const showMsg = (text, cls) => { if (msgEl) { msgEl.textContent = text; msgEl.className = cls; } };
  const opp = (current.opponent || '').trim();
  if (!opp) { showMsg('Opponent is required', 'error'); return; }
  // Auto-derive a name for backward compat / saved list display
  const typeLbl = current.match_type === 'friendly' ? 'Friendly'
                : current.match_type === 'cup' ? 'Cup' : 'League';
  const haLbl = current.home_away === 'away' ? '(A)' : '(H)';
  const name = `${typeLbl} vs ${opp} ${haLbl}`;

  // If Home, always mirror the team's current home ground
  let locName = current.location_name, locPost = current.location_postcode,
      locLat = current.location_lat, locLng = current.location_lng;
  if (current.home_away === 'home' && team) {
    locName = team.home_ground_name || '';
    locPost = team.home_ground_postcode || '';
    locLat = team.home_ground_lat ?? null;
    locLng = team.home_ground_lng ?? null;
  }

  const payload = {
    team_id: team.id,
    name,
    opponent: opp,
    game_date: current.game_date || null,
    match_type: current.match_type || 'league',
    home_away: current.home_away || 'home',
    kickoff_time: current.kickoff_time || null,
    arrival_time: current.arrival_time || null,
    notes: (current.notes || '').trim() || null,
    lineup_status: current.lineup_status || (current.published ? 'published' : 'draft'),
    location_name: (locName || '').trim() || null,
    location_postcode: (locPost || '').trim().toUpperCase() || null,
    location_lat: locLat ?? null,
    location_lng: locLng ?? null,
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
    if (error) { showMsg(error.message, 'error'); return; }
    const idx = lineups.findIndex(l => l.id === current.id);
    if (idx >= 0) lineups[idx] = data;
    await logAudit(team.id, 'lineup', data.id, 'update', { name });
  } else {
    // Insert
    const { data: { user } } = await supabase.auth.getUser();
    payload.created_by = user.id;
    const { data, error } = await supabase.from('lineups').insert(payload).select().single();
    if (error) { showMsg(error.message, 'error'); return; }
    lineups.unshift(data);
    editor.current.id = data.id;
    await logAudit(team.id, 'lineup', data.id, 'create', { name });
  }

  showMsg('✓ Saved', 'ok');
  _lastSavedHash = _lineupContentHash(editor.current);
  setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
  renderLineupsTab();
}

// ---------- Map picker (Leaflet) ----------
// Opens a modal with a draggable marker. Resolves with { lat, lng } or null if cancelled.
function openMapPicker(initial) {
  return new Promise((resolve) => {
    if (typeof L === 'undefined') {
      alert('Map library failed to load. Check your internet connection.');
      resolve(null); return;
    }
    const start = (initial && initial.lat != null && initial.lng != null)
      ? { lat: Number(initial.lat), lng: Number(initial.lng) }
      : { lat: 54.5, lng: -3 }; // UK centre fallback
    const zoom = (initial && initial.lat != null) ? 17 : 6;

    const overlay = document.createElement('div');
    overlay.className = 'map-modal-overlay';
    overlay.innerHTML = `
      <div class="map-modal">
        <div class="map-modal-header">
          <strong>Drag the pin to fine-tune</strong>
          <button class="btn-secondary" id="mp-close" type="button">✕</button>
        </div>
        <div class="map-modal-body">
          <div id="mp-map" style="width:100%;height:100%"></div>
        </div>
        <div class="map-modal-footer">
          <div id="mp-coords" class="muted" style="font-size:0.8rem;flex:1">${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}</div>
          <a id="mp-w3w" href="https://what3words.com/${start.lat},${start.lng}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none">🔤 what3words</a>
          <button class="btn-secondary" id="mp-cancel" type="button">Cancel</button>
          <button class="primary" id="mp-save" type="button">Use this point</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const map = L.map('mp-map').setView([start.lat, start.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);

    let cur = { ...start };
    const coordsEl = overlay.querySelector('#mp-coords');
    const w3wEl = overlay.querySelector('#mp-w3w');
    const updateReadout = () => {
      coordsEl.textContent = `${cur.lat.toFixed(6)}, ${cur.lng.toFixed(6)}`;
      w3wEl.href = `https://what3words.com/${cur.lat},${cur.lng}`;
    };
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      cur = { lat: p.lat, lng: p.lng };
      updateReadout();
    });
    map.on('click', (e) => {
      cur = { lat: e.latlng.lat, lng: e.latlng.lng };
      marker.setLatLng(e.latlng);
      updateReadout();
    });
    // Fix for map rendering inside a just-opened modal
    setTimeout(() => map.invalidateSize(), 50);

    const close = (result) => {
      map.remove();
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('#mp-close').onclick = () => close(null);
    overlay.querySelector('#mp-cancel').onclick = () => close(null);
    overlay.querySelector('#mp-save').onclick = () => close(cur);
  });
}

// 15-min interval time options from 07:00 to 22:00, plus blank and current value if non-standard
function timeOptions(selected) {
  const cur = (selected || '').slice(0,5); // HH:MM
  const opts = ['<option value="">—</option>'];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0,15,30,45]) {
      const v = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      opts.push(`<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`);
    }
  }
  // If saved value falls outside standard options, include it so nothing is lost
  if (cur && !opts.some(o => o.includes(`value="${cur}"`))) {
    opts.push(`<option value="${cur}" selected>${cur}</option>`);
  }
  return opts.join('');
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
// Plays tab is READ-ONLY: list of saved plays, detail view, load-onto-lineup button.
// All editing happens on the Lineup tab — use "★ Save as play…" there to create one.
let _playsUi = { selectedId: null, filter: 'all' };

function renderPlaysTab() {
  const tabEl = document.getElementById('tab-content');
  const { canEdit, plays } = editor;

  // Apply filter
  const filter = _playsUi.filter;
  const visible = plays.filter(p => {
    if (filter === 'in') return (p.data?.possession || 'in') === 'in';
    if (filter === 'out') return p.data?.possession === 'out';
    return true;
  });

  // Keep a selection valid
  if (_playsUi.selectedId && !visible.find(p => p.id === _playsUi.selectedId)) {
    _playsUi.selectedId = null;
  }
  if (!_playsUi.selectedId && visible.length) _playsUi.selectedId = visible[0].id;

  const selected = visible.find(p => p.id === _playsUi.selectedId) || null;

  const listHtml = visible.length
    ? visible.map(p => {
        const poss = p.data?.possession === 'out'
          ? '<span class="pill pill-out">Out</span>'
          : '<span class="pill pill-in">In</span>';
        return `
        <div class="lineup-item ${p.id === _playsUi.selectedId ? 'active' : ''}" data-play="${p.id}">
          <div class="lineup-name">${escapeHtml(p.name)} ${poss}</div>
          <div class="lineup-meta">${p.data?.formation ? escapeHtml(p.data.formation) : ''}</div>
        </div>`;
      }).join('')
    : `<p class="muted" style="padding:0.75rem">No saved plays${filter !== 'all' ? ' for that filter' : ''}.</p>`;

  const detailHtml = selected ? (() => {
    const d = selected.data || {};
    const possLabel = d.possession === 'out' ? 'Out of possession' : 'In possession';
    const possPill = d.possession === 'out'
      ? '<span class="pill pill-out">Out</span>'
      : '<span class="pill pill-in">In</span>';
    const isMine = selected.created_by && editor.currentUserId && selected.created_by === editor.currentUserId;
    const isAdmin = editor.currentUserRole === 'admin';
    const canDelete = canEdit && (isMine || isAdmin);
    const creatorLabel = !selected.created_by ? '' : (isMine ? 'by you' : 'by another coach');
    return `
      <h3 style="margin:0 0 0.5rem">${escapeHtml(selected.name)}</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
        ${possPill}
        ${d.formation ? `<span class="pill" style="background:#e6f1fb;color:#185fa5">${escapeHtml(d.formation)}</span>` : ''}
      </div>
      ${d.description ? `<div style="font-size:0.9rem;line-height:1.4;color:var(--text2,#555);margin-bottom:0.75rem;white-space:pre-wrap">${escapeHtml(d.description)}</div>` : '<p class="muted" style="margin:0 0 0.75rem">No description.</p>'}
      <p class="muted" style="font-size:0.8rem;margin:0 0 0.75rem">
        ${possLabel} · ${(d.arrows || []).length} arrow(s) · ${(d.zoneLines || [null,null]).filter(z => z !== null).length} zone line(s)${d.ballVisible ? ' · ball placed' : ''}
        ${creatorLabel ? ' · ' + creatorLabel : ''}
      </p>
      ${canEdit ? `<button class="primary btn-full" id="load-play-btn">▶ Load onto Lineup pitch</button>` : ''}
      ${canDelete ? `<button class="btn-full" id="del-play-btn" style="color:#c62828;border-color:#c62828;margin-bottom:0">✕ Delete</button>` : ''}
      ${canEdit && !canDelete ? `<p class="muted" style="font-size:0.75rem;margin:0.5rem 0 0">Only the creator or an admin can delete this play.</p>` : ''}
    `;
  })() : `<p class="muted" style="padding:0.5rem 0">Select a play on the left.</p>`;

  tabEl.innerHTML = `
    <div class="plays-layout">
      <aside class="plays-side">
        <div class="card">
          <h4 style="margin:0 0 0.5rem">Saved plays</h4>
          <select id="plays-filter" style="width:100%;margin-bottom:0.5rem">
            <option value="all" ${filter === 'all' ? 'selected' : ''}>All plays</option>
            <option value="in" ${filter === 'in' ? 'selected' : ''}>In possession only</option>
            <option value="out" ${filter === 'out' ? 'selected' : ''}>Out of possession only</option>
          </select>
          <div class="lineup-list" style="max-height:60vh;overflow-y:auto">${listHtml}</div>
        </div>
      </aside>
      <section class="plays-main">
        <div class="plays-main-inner">
          <div class="plays-preview">
            <div class="pv-pitch" id="pv-pitch">
              <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
              <canvas class="tactics-canvas" id="pv-tactics"></canvas>
              <div class="pv-slots" id="pv-slots"></div>
              <div class="pv-ball" id="pv-ball" style="display:none"></div>
            </div>
            <div class="pv-subs" id="pv-subs"></div>
          </div>
          <div class="plays-details">
            <div class="card">${detailHtml}</div>
            <p class="muted" style="font-size:0.78rem;margin-top:0.5rem">
              Plays are created on the <strong>Lineup</strong> tab — set up the pitch, then click <strong>★ Save as play…</strong>.
            </p>
          </div>
        </div>
      </section>
    </div>
  `;

  if (selected) renderPlayPreview(selected);
  wirePlayEvents();
}

// Render a saved play into the Plays-tab preview pitch (read-only).
function renderPlayPreview(play) {
  const d = play.data || {};
  const formation = getFormation(d.formation) || FORMATIONS['4-3-3'];
  const pos = (Array.isArray(d.pos) && d.pos.length === formation.pos.length) ? d.pos : formation.pos;
  const lbl = (Array.isArray(d.lbl) && d.lbl.length === formation.lbl.length) ? d.lbl : formation.lbl;
  const slots = d.slots || {};
  const subs = Array.isArray(d.subs) ? d.subs : [];
  const players = editor.players || [];
  const pById = id => players.find(p => p.id === id);

  const slotsLayer = document.getElementById('pv-slots');
  if (slotsLayer) {
    slotsLayer.innerHTML = pos.map(([x, y], i) => {
      const pid = slots[i];
      const p = pid ? pById(pid) : null;
      const label = lbl[i] || '';
      const chipInner = p
        ? `<div class="pv-chip-wrap">
             <div class="pv-chip ${p.photo_url ? 'has-photo' : ''}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
               ${p.photo_url ? '' : `${p.number != null ? `<div class="pv-chip-num">${p.number}</div>` : ''}<div class="pv-chip-name">${escapeHtml(shortName(p.name))}</div>`}
             </div>
             ${p.photo_url ? `<div class="pv-chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
           </div>`
        : `<div class="pv-chip pv-empty">${escapeHtml(label)}</div>`;
      return `
        <div class="pv-slot" style="left:${x}%; top:${y}%">
          ${chipInner}
          <div class="pv-pos-lbl">${escapeHtml(label)}</div>
        </div>
      `;
    }).join('');
  }

  // Subs bar
  const subsBar = document.getElementById('pv-subs');
  if (subsBar) {
    const items = subs.filter(Boolean).map(pid => {
      const p = pById(pid);
      if (!p) return '';
      return `<div class="pv-sub">${p.number != null ? p.number + ' · ' : ''}${escapeHtml(shortName(p.name))}</div>`;
    }).join('');
    subsBar.innerHTML = items ? `<div class="muted" style="font-size:0.75rem;margin-right:0.35rem">Subs:</div>${items}` : '';
  }

  // Ball
  const ball = document.getElementById('pv-ball');
  if (ball) {
    if (d.ballVisible && d.ballPos) {
      ball.style.display = '';
      ball.style.left = (d.ballPos.x ?? 50) + '%';
      ball.style.top = (d.ballPos.y ?? 50) + '%';
    } else {
      ball.style.display = 'none';
    }
  }

  // Arrows + zone lines on preview canvas
  const tc = document.getElementById('pv-tactics');
  if (tc) {
    const host = document.getElementById('pv-pitch');
    // Size canvas to host
    const rect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    tc.width = Math.max(1, Math.round(rect.width * dpr));
    tc.height = Math.max(1, Math.round(rect.height * dpr));
    tc.style.width = rect.width + 'px';
    tc.style.height = rect.height + 'px';
    const ctx = tc.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Zone lines
    (d.zoneLines || [null, null]).forEach((y, i) => {
      if (y === null || y === undefined) return;
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

    // Arrows
    (d.arrows || []).forEach(a => {
      const x1 = a.x1 / 100 * w, y1 = a.y1 / 100 * h;
      const x2 = a.x2 / 100 * w, y2 = a.y2 / 100 * h;
      const hasBend = (typeof a.cx === 'number' && typeof a.cy === 'number');
      const cxv = hasBend ? a.cx / 100 * w : 0;
      const cyv = hasBend ? a.cy / 100 * h : 0;
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 4) return;
      const ang = hasBend ? Math.atan2(y2 - cyv, x2 - cxv) : Math.atan2(y2 - y1, x2 - x1);
      const hl = Math.min(20, len * 0.38);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,0,0.95)';
      ctx.fillStyle = 'rgba(255,220,0,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      if (hasBend) ctx.quadraticCurveTo(cxv, cyv, x2, y2); else ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
      ctx.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
}

function wirePlayEvents() {
  const { team, plays } = editor;
  const tabEl = document.getElementById('tab-content');

  // Filter dropdown
  const filterEl = tabEl.querySelector('#plays-filter');
  if (filterEl) filterEl.onchange = (e) => {
    _playsUi.filter = e.target.value;
    _playsUi.selectedId = null;
    renderPlaysTab();
  };

  // Select a play from the list
  tabEl.querySelectorAll('[data-play]').forEach(el => {
    el.onclick = () => {
      _playsUi.selectedId = el.dataset.play;
      renderPlaysTab();
    };
  });

  // Load selected play onto the Lineup tab's pitch
  const loadBtn = tabEl.querySelector('#load-play-btn');
  if (loadBtn) loadBtn.onclick = () => {
    const p = plays.find(x => x.id === _playsUi.selectedId);
    if (!p) return;
    const d = p.data || {};
    const formation = d.formation || '4-3-3';
    _pendingLineupLoad = {
      name: p.name || '',
      formation,
      slots: (d.slots && typeof d.slots === 'object') ? { ...d.slots } : {},
      subs: Array.isArray(d.subs) ? [...d.subs] : [],
      arrows: (d.arrows || []).map(a => ({ ...a })),
      zoneLines: [...(d.zoneLines || [null, null])],
      ballVisible: !!d.ballVisible,
      ballPos: { ...(d.ballPos || { x: 50, y: 50 }) },
      pos: Array.isArray(d.pos) ? d.pos.map(r => [...r]) : null,
      lbl: Array.isArray(d.lbl) ? [...d.lbl] : null
    };
    tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
    // Switch tab by simulating a click on the Lineups tab header
    const lineupsTabBtn = document.querySelector('.h-tab[data-tab="lineups"]');
    if (lineupsTabBtn) lineupsTabBtn.click();
  };

  // Delete selected play
  const delBtn = tabEl.querySelector('#del-play-btn');
  if (delBtn) delBtn.onclick = async () => {
    const p = plays.find(x => x.id === _playsUi.selectedId);
    if (!p) return;
    if (!confirm(`Delete play "${p.name}"?`)) return;
    const { error } = await supabase.from('plays').delete().eq('id', p.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await logAudit(team.id, 'play', p.id, 'delete', { name: p.name });
    const idx = plays.findIndex(x => x.id === p.id);
    if (idx >= 0) plays.splice(idx, 1);
    _playsUi.selectedId = null;
    renderPlaysTab();
  };
}

// ---------- Fixtures tab (Slice 5 — Step 3: Publish + calendar + next game) ----------
let _fixturesUi = { selectedLineupId: null, calMonth: null, calYear: null, showDrafts: false };

function renderFixturesTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, players, lineups } = editor;

  // Published lineups are visible to everyone; coaches can flip a toggle to also see drafts.
  const list = lineups.filter(l => {
    if (!l.game_date) return false;
    const parentVisible = !!l.published || l.lineup_status === 'availability';
    return canEdit && _fixturesUi.showDrafts ? true : parentVisible;
  });
  list.sort((a, b) => (a.game_date || '').localeCompare(b.game_date || ''));

  const todayISO = new Date().toISOString().slice(0, 10);
  let selected = list.find(l => l.id === _fixturesUi.selectedLineupId);
  if (!selected) {
    // Default to next upcoming, else most recent past
    selected = list.find(l => (l.game_date || '') >= todayISO) || list[list.length - 1] || null;
    _fixturesUi.selectedLineupId = selected ? selected.id : null;
  }

  // Default calendar month = selected game's month, or today's
  const refDate = selected?.game_date ? new Date(selected.game_date + 'T00:00:00') : new Date();
  if (_fixturesUi.calMonth === null) { _fixturesUi.calMonth = refDate.getMonth(); _fixturesUi.calYear = refDate.getFullYear(); }

  const gameDates = new Set(list.map(l => l.game_date));

  // Build month grid (Mon-first)
  const y = _fixturesUi.calYear, m = _fixturesUi.calMonth;
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6; // Mon=0..Sun=6
  const monthName = first.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-cell cal-empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasGame = gameDates.has(iso);
    const isSelected = selected && selected.game_date === iso;
    const isToday = iso === todayISO;
    cells.push(`
      <button class="cal-cell${hasGame ? ' cal-game' : ''}${isSelected ? ' cal-sel' : ''}${isToday ? ' cal-today' : ''}"
              ${hasGame ? `data-game-date="${iso}"` : ''}
              ${!hasGame ? 'disabled' : ''}>
        <div class="cal-day-num">${d}</div>
        ${hasGame ? `<div class="cal-dot"></div>` : ''}
      </button>
    `);
  }

  const headline = selected
    ? (() => {
        const gd = selected.game_date ? new Date(selected.game_date + 'T00:00:00') : null;
        const dateStr = gd ? gd.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const upcoming = gd && gd >= new Date(todayISO);
        const prefix = upcoming ? 'Next game' : 'Last game';
        const opp = selected.opponent ? ` vs ${escapeHtml(selected.opponent)}` : '';
        const tLbl = selected.match_type === 'friendly' ? 'Friendly' : selected.match_type === 'cup' ? 'Cup' : 'League';
        const haLbl = selected.home_away === 'away' ? 'Away' : 'Home';
        return `
          <div style="margin-bottom:0.5rem">
            <div class="muted" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">${prefix} · ${tLbl} · ${haLbl}</div>
            <h2 style="margin:0.15rem 0 0;font-size:1.4rem">${escapeHtml(dateStr)}${opp}</h2>
            ${selected.location_name || selected.location_postcode ? `
              <div style="font-size:0.9rem;margin-top:0.25rem">
                📍 ${escapeHtml(selected.location_name || '')}${selected.location_name && selected.location_postcode ? ' · ' : ''}${escapeHtml(selected.location_postcode || '')}
                ${selected.location_lat && selected.location_lng
                  ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${selected.location_lat},${selected.location_lng}" target="_blank" rel="noopener">Map</a>`
                  : (selected.location_postcode ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.location_postcode)}" target="_blank" rel="noopener">Map</a>` : '')
                }
              </div>` : ''}
          </div>
        `;
      })()
    : `<div class="muted" style="padding:1rem 0">No published games yet.${canEdit ? ' Publish a lineup from the Lineups tab to show it here.' : ''}</div>`;

  const upcomingList = list.filter(l => (l.game_date || '') >= todayISO).slice(0, 10);
  const pastList = list.filter(l => (l.game_date || '') < todayISO).slice(-5).reverse();

  const upcomingHtml = upcomingList.length
    ? upcomingList.map(l => `
        <div class="lineup-item ${selected && l.id === selected.id ? 'active' : ''}" data-fix="${l.id}">
          <div class="lineup-name">${escapeHtml(l.opponent || '—')} ${l.home_away === 'away' ? '(A)' : '(H)'}</div>
          <div class="lineup-meta">${formatDate(l.game_date)}${l.location_postcode ? ' · ' + escapeHtml(l.location_postcode) : ''}${canEdit && !l.published ? (l.lineup_status === 'availability' ? ' · <em>availability</em>' : ' · <em>draft</em>') : ''}</div>
        </div>
      `).join('')
    : `<p class="muted" style="padding:0.5rem 0;font-size:0.85rem">No upcoming games.</p>`;

  const pastHtml = pastList.length
    ? pastList.map(l => `
        <div class="lineup-item ${selected && l.id === selected.id ? 'active' : ''}" data-fix="${l.id}" style="opacity:0.75">
          <div class="lineup-name">${escapeHtml(l.opponent || '—')} ${l.home_away === 'away' ? '(A)' : '(H)'}</div>
          <div class="lineup-meta">${formatDate(l.game_date)}</div>
        </div>
      `).join('')
    : '';

  const calendarBody = `
    <div class="cal-header">
      <button class="cal-nav" id="cal-prev" aria-label="Previous month">‹</button>
      <div class="cal-title">${escapeHtml(monthName)}</div>
      <button class="cal-nav" id="cal-next" aria-label="Next month">›</button>
    </div>
    <div class="cal-dow">
      ${['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => `<div>${d}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells.join('')}</div>
  `;

  const upcomingBody = `
    <h4 style="margin:0 0 0.5rem">Upcoming</h4>
    <div class="lineup-list">${upcomingHtml}</div>
    ${pastHtml ? `<h4 style="margin:1rem 0 0.5rem">Recent</h4><div class="lineup-list">${pastHtml}</div>` : ''}
    ${canEdit ? `
      <label style="display:flex;align-items:center;gap:0.35rem;margin-top:0.75rem;font-size:0.8rem;color:#555">
        <input type="checkbox" id="show-drafts" ${_fixturesUi.showDrafts ? 'checked' : ''}> Show draft lineups
      </label>
    ` : ''}
  `;

  const selStatus = selected ? (selected.lineup_status || (selected.published ? 'published' : 'draft')) : 'draft';
  const selShareable = selected && (selStatus === 'availability' || selStatus === 'published');
  const selShareLabel = selStatus === 'availability' ? '🔗 Copy availability link for parents' : '🔗 Copy share link for parents';
  const showLineup = selStatus === 'published'; // hide pitch for availability/draft (in fixtures)

  tabEl.innerHTML = `
    <div class="fixtures-single">
      <div style="display:flex;flex-direction:column;gap:0.5rem;max-width:560px;margin-bottom:1rem">
        ${collapsibleCard('fix-calendar', 'Calendar', calendarBody)}
        ${collapsibleCard('fix-upcoming', 'Upcoming / Recent', upcomingBody)}
      </div>
      ${headline}
      ${selected && canEdit && selShareable ? `
        <div style="max-width:560px;margin:0 0 0.75rem">
          <button class="btn-secondary btn-full" id="fix-share-link">${selShareLabel}</button>
          <div id="fix-share-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.25rem"></div>
        </div>
      ` : ''}
      ${selected && canEdit && selShareable ? `
        <div id="fix-availability-panel" style="max-width:560px;margin-bottom:0.75rem"></div>
      ` : ''}
      ${selected && showLineup ? `
        <div class="pv-pitch" id="fix-pitch" style="max-width:560px">
          <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
          <canvas class="tactics-canvas" id="fix-tactics"></canvas>
          <div class="pv-slots" id="fix-slots"></div>
          <div class="pv-ball" id="fix-ball" style="display:none"></div>
        </div>
        <div class="pv-subs" id="fix-subs"></div>
      ` : (selected && !showLineup ? `
        <div class="muted" style="max-width:560px;padding:0.75rem;background:#f7f7f7;border-radius:6px;font-size:0.85rem">
          Lineup not yet published for this game. ${selStatus === 'availability' ? 'Collecting availability responses.' : ''}
        </div>
      ` : '')}
    </div>
  `;

  if (selected && showLineup) renderFixturePitch(selected);
  if (selected && canEdit && selShareable) {
    renderCoachAvailabilityPanel({
      containerId: 'fix-availability-panel',
      lineupId: selected.id,
      cardKey: 'fix-coach-avail'
    });
  }
  wireFixtureEvents();
}

function renderFixturePitch(lineup) {
  // Adapt the existing play-preview renderer for a lineup (stored slightly differently:
  // players are in lineup.data.slots, formation in lineup.data.formation, etc.)
  const play = {
    id: lineup.id,
    name: lineup.name,
    data: lineup.data || {}
  };
  // Replace the pv-* element ids with fix-* ones by temporarily swapping:
  // Easiest: inline a near-copy of renderPlayPreview adapted to the fix-* ids.
  const d = play.data;
  const formation = getFormation(d.formation) || FORMATIONS['4-3-3'];
  const pos = (Array.isArray(d.pos) && d.pos.length === formation.pos.length) ? d.pos : formation.pos;
  const lbl = (Array.isArray(d.lbl) && d.lbl.length === formation.lbl.length) ? d.lbl : formation.lbl;
  const slots = d.slots || {};
  const subs = Array.isArray(d.subs) ? d.subs : [];
  const players = editor.players || [];
  const pById = id => players.find(p => p.id === id);

  const slotsLayer = document.getElementById('fix-slots');
  if (slotsLayer) {
    slotsLayer.innerHTML = pos.map(([x, y], i) => {
      const pid = slots[i];
      const p = pid ? pById(pid) : null;
      const label = lbl[i] || '';
      const chipInner = p
        ? `<div class="pv-chip-wrap">
             <div class="pv-chip ${p.photo_url ? 'has-photo' : ''}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
               ${p.photo_url ? '' : `${p.number != null ? `<div class="pv-chip-num">${p.number}</div>` : ''}<div class="pv-chip-name">${escapeHtml(shortName(p.name))}</div>`}
             </div>
             ${p.photo_url ? `<div class="pv-chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
           </div>`
        : `<div class="pv-chip pv-empty">${escapeHtml(label)}</div>`;
      return `
        <div class="pv-slot" style="left:${x}%; top:${y}%">
          ${chipInner}
          <div class="pv-pos-lbl">${escapeHtml(label)}</div>
        </div>
      `;
    }).join('');
  }

  const subsBar = document.getElementById('fix-subs');
  if (subsBar) {
    const items = subs.filter(Boolean).map(pid => {
      const p = pById(pid);
      if (!p) return '';
      return `<div class="pv-sub">${p.number != null ? p.number + ' · ' : ''}${escapeHtml(shortName(p.name))}</div>`;
    }).join('');
    subsBar.innerHTML = items ? `<div class="muted" style="font-size:0.75rem;margin-right:0.35rem">Subs:</div>${items}` : '';
  }

  const ball = document.getElementById('fix-ball');
  if (ball) {
    if (d.ballVisible && d.ballPos) {
      ball.style.display = '';
      ball.style.left = (d.ballPos.x ?? 50) + '%';
      ball.style.top = (d.ballPos.y ?? 50) + '%';
    } else {
      ball.style.display = 'none';
    }
  }

  const tc = document.getElementById('fix-tactics');
  if (tc) {
    const host = document.getElementById('fix-pitch');
    const rect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    tc.width = Math.max(1, Math.round(rect.width * dpr));
    tc.height = Math.max(1, Math.round(rect.height * dpr));
    tc.style.width = rect.width + 'px';
    tc.style.height = rect.height + 'px';
    const ctx = tc.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    (d.zoneLines || [null, null]).forEach((yv, i) => {
      if (yv === null || yv === undefined) return;
      const z = ZONES[i], py = yv / 100 * h;
      ctx.save();
      ctx.setLineDash([10, 7]);
      ctx.strokeStyle = z.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.restore();
    });

    (d.arrows || []).forEach(a => {
      const x1 = a.x1 / 100 * w, y1 = a.y1 / 100 * h;
      const x2 = a.x2 / 100 * w, y2 = a.y2 / 100 * h;
      const hasBend = typeof a.cx === 'number' && typeof a.cy === 'number';
      const cxv = hasBend ? a.cx / 100 * w : 0;
      const cyv = hasBend ? a.cy / 100 * h : 0;
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 4) return;
      const ang = hasBend ? Math.atan2(y2 - cyv, x2 - cxv) : Math.atan2(y2 - y1, x2 - x1);
      const hl = Math.min(20, len * 0.38);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,0,0.95)';
      ctx.fillStyle = 'rgba(255,220,0,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      if (hasBend) ctx.quadraticCurveTo(cxv, cyv, x2, y2); else ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
      ctx.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
}

function wireFixtureEvents() {
  const tabEl = document.getElementById('tab-content');

  tabEl.querySelector('#cal-prev')?.addEventListener('click', () => {
    _fixturesUi.calMonth -= 1;
    if (_fixturesUi.calMonth < 0) { _fixturesUi.calMonth = 11; _fixturesUi.calYear -= 1; }
    renderFixturesTab();
  });
  tabEl.querySelector('#cal-next')?.addEventListener('click', () => {
    _fixturesUi.calMonth += 1;
    if (_fixturesUi.calMonth > 11) { _fixturesUi.calMonth = 0; _fixturesUi.calYear += 1; }
    renderFixturesTab();
  });

  tabEl.querySelectorAll('[data-game-date]').forEach(btn => {
    btn.onclick = () => {
      const iso = btn.dataset.gameDate;
      const match = editor.lineups.find(l => l.game_date === iso && (l.published || l.lineup_status === 'availability' || _fixturesUi.showDrafts));
      if (match) { _fixturesUi.selectedLineupId = match.id; renderFixturesTab(); }
    };
  });

  tabEl.querySelectorAll('[data-fix]').forEach(el => {
    el.onclick = () => {
      _fixturesUi.selectedLineupId = el.dataset.fix;
      renderFixturesTab();
    };
  });

  const draftsEl = tabEl.querySelector('#show-drafts');
  if (draftsEl) draftsEl.onchange = () => {
    _fixturesUi.showDrafts = draftsEl.checked;
    _fixturesUi.selectedLineupId = null;
    renderFixturesTab();
  };

  const shareBtn = tabEl.querySelector('#fix-share-link');
  if (shareBtn) shareBtn.onclick = async () => {
    const id = _fixturesUi.selectedLineupId;
    if (!id) return;
    const base = location.origin + location.pathname;
    const shareUrl = `${base}#/view/${id}`;
    const msg = tabEl.querySelector('#fix-share-msg');
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (msg) { msg.textContent = '✓ Link copied to clipboard'; msg.className = 'ok'; }
    } catch {
      window.prompt('Copy this link:', shareUrl);
      if (msg) { msg.textContent = 'Link ready to copy'; msg.className = 'muted'; }
    }
    setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = 'muted'; } }, 3000);
  };
}

// ---------- Members tab (Slice 5 — Step 1: Invites) ----------
let _membersUi = { invites: [], members: [], loading: true };

async function renderMembersTab(currentUser) {
  const tabEl = document.getElementById('tab-content');
  const { team, players } = editor;
  const isAdmin = editor.currentUserRole === 'admin' || currentUser.id && (await getMyRole(team.id, currentUser.id)) === 'admin';

  tabEl.innerHTML = `<div style="padding:1rem"><p class="loading">Loading members…</p></div>`;

  // Load invites + members for this team
  const [invRes, memRes] = await Promise.all([
    supabase.from('invites').select('*').eq('team_id', team.id).order('created_at', { ascending: false }),
    supabase.from('team_members').select('user_id, role, created_at').eq('team_id', team.id).order('created_at')
  ]);
  _membersUi.invites = invRes.data || [];
  _membersUi.members = memRes.data || [];
  _membersUi.loading = false;

  // Look up profile info for each member
  const memberIds = _membersUi.members.map(m => m.user_id);
  let profilesById = {};
  if (memberIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', memberIds);
    (profs || []).forEach(p => { profilesById[p.id] = p; });
  }

  // Look up parent_players for parent members so we can show which player they're linked to
  const parentLinks = {};
  const parentIds = _membersUi.members.filter(m => m.role === 'parent').map(m => m.user_id);
  if (parentIds.length) {
    const { data: links } = await supabase
      .from('parent_players')
      .select('parent_id, player_id')
      .in('parent_id', parentIds);
    (links || []).forEach(l => {
      if (!parentLinks[l.parent_id]) parentLinks[l.parent_id] = [];
      parentLinks[l.parent_id].push(l.player_id);
    });
  }

  const pending = _membersUi.invites.filter(i => i.status === 'pending');
  const accepted = _membersUi.invites.filter(i => i.status !== 'pending');

  const playerOpts = players
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.number != null ? ' (#' + p.number + ')' : ''}</option>`)
    .join('');

  const pendingHtml = pending.length
    ? pending.map(i => {
        const player = i.player_id ? players.find(p => p.id === i.player_id) : null;
        return `
          <div class="lineup-item">
            <div class="lineup-name">${escapeHtml(i.email)}</div>
            <div class="lineup-meta">
              ${escapeHtml(i.role)}
              ${player ? ' · linked to ' + escapeHtml(player.name) : ''}
              · sent ${formatDate(i.created_at)}
            </div>
            <button class="lineup-del" data-revoke-invite="${i.id}" title="Revoke">✕</button>
          </div>
        `;
      }).join('')
    : `<p class="muted" style="padding:0.5rem 0">No pending invites.</p>`;

  const acceptedHtml = accepted.length
    ? accepted.slice(0, 10).map(i => `
        <div class="lineup-item" style="opacity:0.7">
          <div class="lineup-name">${escapeHtml(i.email)}</div>
          <div class="lineup-meta">${escapeHtml(i.role)} · ${escapeHtml(i.status)}${i.accepted_at ? ' · ' + formatDate(i.accepted_at) : ''}</div>
        </div>
      `).join('')
    : '';

  const memberCount = _membersUi.members.length;

  tabEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;padding:1rem;max-width:900px">
      <div class="card">
        <h3 style="margin:0 0 0.5rem">Invite someone</h3>
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.85rem">They'll get an email with a magic link. When they sign in, they're automatically added to this team.</p>
        <label>Email</label>
        <input type="email" id="inv-email" placeholder="name@example.com" autocomplete="off" />
        <label style="margin-top:0.5rem">Role</label>
        <select id="inv-role">
          <option value="coach">Coach (can edit lineups & plays)</option>
          <option value="parent">Parent (read-only, linked to a player)</option>
        </select>
        <div id="inv-player-wrap" style="display:none;margin-top:0.5rem">
          <label>Link to player</label>
          <select id="inv-player">
            <option value="">— choose a player —</option>
            ${playerOpts}
          </select>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
          <button class="primary" id="inv-send">Send invite</button>
        </div>
        <div id="inv-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 0.5rem">Pending invites (${pending.length})</h3>
        <div class="lineup-list">${pendingHtml}</div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 0.5rem">Current members (${memberCount})</h3>
        ${isAdmin ? '' : '<p class="muted" style="font-size:0.8rem;margin:0 0 0.5rem">Only admins can change roles or remove members.</p>'}
        <div class="lineup-list">
          ${_membersUi.members.map(m => {
            const prof = profilesById[m.user_id] || {};
            const isSelf = m.user_id === currentUser.id;
            const linkedPlayerIds = parentLinks[m.user_id] || [];
            const linkedNames = linkedPlayerIds
              .map(pid => players.find(p => p.id === pid)?.name)
              .filter(Boolean).join(', ');
            const roleSelect = isAdmin && !isSelf
              ? `<select class="m-role" data-uid="${m.user_id}" style="width:auto;display:inline-block;margin:0 0.5rem">
                   <option value="admin"${m.role==='admin'?' selected':''}>admin</option>
                   <option value="coach"${m.role==='coach'?' selected':''}>coach</option>
                   <option value="parent"${m.role==='parent'?' selected':''}>parent</option>
                   <option value="viewer"${m.role==='viewer'?' selected':''}>viewer</option>
                 </select>`
              : `<span class="pill" style="background:#e6f1fb;color:#185fa5;margin:0 0.5rem">${escapeHtml(m.role)}</span>`;
            const removeBtn = isAdmin && !isSelf
              ? `<button class="lineup-del" data-remove-uid="${m.user_id}" title="Remove from team">✕</button>`
              : '';
            return `
              <div class="lineup-item" style="padding-right:2.5rem">
                <div class="lineup-name">
                  ${escapeHtml(prof.full_name || prof.email || '(no profile)')}
                  ${isSelf ? ' <span class="muted" style="font-size:0.75rem">(you)</span>' : ''}
                </div>
                <div class="lineup-meta" style="display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem">
                  ${roleSelect}
                  ${prof.email && prof.email !== prof.full_name ? '· ' + escapeHtml(prof.email) : ''}
                  ${linkedNames ? ' · linked to ' + escapeHtml(linkedNames) : ''}
                </div>
                ${removeBtn}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      ${acceptedHtml ? `<div class="card">
        <h3 style="margin:0 0 0.5rem">Recent accepted / revoked</h3>
        <div class="lineup-list">${acceptedHtml}</div>
      </div>` : ''}
    </div>
  `;

  wireMembersEvents(currentUser);
}

function wireMembersEvents(currentUser) {
  const { team } = editor;
  const tabEl = document.getElementById('tab-content');

  // Show / hide player picker based on role
  const roleEl = tabEl.querySelector('#inv-role');
  const playerWrap = tabEl.querySelector('#inv-player-wrap');
  const toggleWrap = () => { playerWrap.style.display = roleEl.value === 'parent' ? '' : 'none'; };
  if (roleEl) roleEl.onchange = toggleWrap;
  toggleWrap();

  // Send invite
  const sendBtn = tabEl.querySelector('#inv-send');
  if (sendBtn) sendBtn.onclick = async () => {
    const msg = tabEl.querySelector('#inv-msg');
    const email = (tabEl.querySelector('#inv-email').value || '').trim().toLowerCase();
    const role = tabEl.querySelector('#inv-role').value;
    const playerId = role === 'parent' ? (tabEl.querySelector('#inv-player').value || '') : '';

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      msg.textContent = 'Valid email required.'; msg.className = 'error'; return;
    }
    if (role === 'parent' && !playerId) {
      msg.textContent = 'Pick a player to link this parent to.'; msg.className = 'error'; return;
    }

    sendBtn.disabled = true;
    msg.textContent = 'Sending…'; msg.className = 'muted';

    const payload = {
      team_id: team.id,
      email,
      role,
      player_id: playerId || null,
      invited_by: currentUser.id,
      status: 'pending'
    };
    const { data: inviteRow, error: insErr } = await supabase
      .from('invites')
      .insert(payload)
      .select()
      .single();
    if (insErr) {
      sendBtn.disabled = false;
      msg.textContent = 'Save failed: ' + insErr.message; msg.className = 'error'; return;
    }

    // Send magic link (also creates the user if new)
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (otpErr) {
      sendBtn.disabled = false;
      msg.textContent = 'Email send failed: ' + otpErr.message + ' (invite saved — you can resend later).';
      msg.className = 'error';
      return;
    }

    await logAudit(team.id, 'invite', inviteRow.id, 'create', { email, role, player_id: playerId || null });
    msg.textContent = `✓ Invite sent to ${email}.`; msg.className = 'ok';

    // Reset form, refresh list
    tabEl.querySelector('#inv-email').value = '';
    tabEl.querySelector('#inv-role').value = 'coach';
    const playerEl = tabEl.querySelector('#inv-player');
    if (playerEl) playerEl.value = '';
    renderMembersTab(currentUser);
  };

  // Revoke pending invite
  tabEl.querySelectorAll('[data-revoke-invite]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.revokeInvite;
      if (!confirm('Revoke this invite?')) return;
      const { error } = await supabase
        .from('invites')
        .update({ status: 'revoked' })
        .eq('id', id);
      if (error) { alert('Revoke failed: ' + error.message); return; }
      await logAudit(team.id, 'invite', id, 'revoke', {});
      renderMembersTab(currentUser);
    };
  });

  // Change a member's role (admin only — RLS will block non-admins)
  tabEl.querySelectorAll('.m-role').forEach(sel => {
    sel.onchange = async () => {
      const uid = sel.dataset.uid;
      const newRole = sel.value;
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('team_id', team.id)
        .eq('user_id', uid);
      if (error) { alert('Role change failed: ' + error.message); renderMembersTab(currentUser); return; }
      await logAudit(team.id, 'member', uid, 'role_change', { new_role: newRole });
      renderMembersTab(currentUser);
    };
  });

  // Remove a member (admin only)
  tabEl.querySelectorAll('[data-remove-uid]').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.removeUid;
      if (!confirm('Remove this member from the team? Their account will not be deleted, but they will lose access to this team.')) return;
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('user_id', uid);
      if (error) { alert('Remove failed: ' + error.message); return; }
      await logAudit(team.id, 'member', uid, 'remove', {});
      renderMembersTab(currentUser);
    };
  });
}

// Look up the current user's role on a given team (used to gate admin UI)
async function getMyRole(teamId, userId) {
  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role || null;
}

// Kick off
render();
