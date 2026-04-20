// Interpro Coach / Manager Assistant — Web app
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

// ---------- Age group helpers (youth football season runs 1 Sep → 31 May) ----------
// Stored on the teams table as (age_group: INT 7..18, age_group_season_year: INT).
// The displayed age group auto-bumps on 7 June each year — a week after 31 May so
// coaches aren't caught out mid-transition. computeCurrentSeasonStartYear returns
// the year the CURRENT season started (e.g. 2025 for the 2025-26 season).
function computeCurrentSeasonStartYear(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();   // 0 = Jan, 5 = Jun
  const d = date.getDate();
  // From 7 June onwards we're "in" the upcoming season (starts this September).
  if (m > 5 || (m === 5 && d >= 7)) return y;
  return y - 1;
}
function effectiveAgeGroup(team, date = new Date()) {
  if (!team || team.age_group == null || team.age_group_season_year == null) return null;
  const currentStart = computeCurrentSeasonStartYear(date);
  const bump = Math.max(0, currentStart - team.age_group_season_year);
  return Math.min(18, team.age_group + bump);
}
function ageGroupLabel(team, date = new Date()) {
  const n = effectiveAgeGroup(team, date);
  return (n == null) ? '' : `U${n}s`;
}
// All the options we support in dropdowns. Covers U7 through U18.
const AGE_GROUP_OPTIONS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

// ---------- Training schedule helpers (Slice 8) ----------
// Day-of-week indexing follows JS Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat.
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Parse team.training_schedule (JSONB array) into a sane JS array. Tolerant of
// null / garbage / single-object legacy shapes.
function parseTrainingSchedule(team) {
  if (!team) return [];
  const raw = team.training_schedule;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(s => s && typeof s === 'object' && Number.isInteger(s.day) && s.start && s.end);
}
// Format a "HH:MM" or "HH:MM:SS" time for display (drops seconds, keeps 24h).
function fmtTimeHHMM(t) {
  if (!t) return '';
  const s = String(t);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : s;
}
// Given a schedule slot (day/start/end) and an anchor date, return the Date
// object for the next (or current, if still within end+1h) occurrence.
// "now" param allows testing; defaults to current time.
function computeNextTrainingInstance(slot, now = new Date()) {
  if (!slot || !Number.isInteger(slot.day) || !slot.start || !slot.end) return null;
  const [eh, em] = fmtTimeHHMM(slot.end).split(':').map(Number);
  const [sh, sm] = fmtTimeHHMM(slot.start).split(':').map(Number);
  // Start candidate at today with start time.
  const todayDay = now.getDay();
  // Days until next matching day (0..6). 0 means today.
  let delta = (slot.day - todayDay + 7) % 7;
  let candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta, sh, sm, 0, 0);
  // Cutoff = end time + 1h. If we're past that on today's instance, roll forward 7d.
  const cutoff = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), eh, em, 0, 0);
  cutoff.setHours(cutoff.getHours() + 1);
  if (now >= cutoff) {
    candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 7, sh, sm, 0, 0);
  }
  return candidate;
}
// Pick the soonest upcoming training instance across all slots in the schedule.
// Returns { slot, date } or null.
function nextUpcomingTraining(team, now = new Date()) {
  const slots = parseTrainingSchedule(team);
  if (!slots.length) return null;
  let best = null;
  for (const s of slots) {
    const d = computeNextTrainingInstance(s, now);
    if (!d) continue;
    if (!best || d < best.date) best = { slot: s, date: d };
  }
  return best;
}
// Convert a Date to "YYYY-MM-DD" (local).
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Pretty-print a training session for headers (e.g. "Tuesday 21 Apr · 19:00–20:00").
function fmtTrainingHeader(date, slot) {
  const dayName = DAY_NAMES[date.getDay()];
  const d = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'short' });
  return `${dayName} ${d} ${month} · ${fmtTimeHHMM(slot.start)}–${fmtTimeHHMM(slot.end)}`;
}

// ---------- Player stats aggregation (for the public card page) ----------
// All stats are derived on the fly from lineups — no cached totals column, so
// editing a match's result always reflects accurately the next time someone
// opens a card. "Season" means the season start year (e.g. 2025 = 2025-26).
// Matches count toward stats only once matchHasBeenPlayed(l) is true — draft
// matches in the future don't inflate appearance counts.
function computePlayerStats(playerId, lineups, seasonYear) {
  const stats = { goals: 0, motm: 0, starts: 0, bench: 0, apps: 0, wins: 0, draws: 0, losses: 0 };
  if (!playerId || !Array.isArray(lineups)) return stats;
  for (const l of lineups) {
    if (!l || !l.game_date) continue;
    if (!matchHasBeenPlayed(l)) continue;
    if (seasonYear != null) {
      const d = new Date(l.game_date + 'T12:00:00');
      if (computeCurrentSeasonStartYear(d) !== seasonYear) continue;
    }
    const d = l.data || {};
    const slotIds = d.slots ? Object.values(d.slots).filter(Boolean) : [];
    const subIds = Array.isArray(d.subs) ? d.subs.filter(Boolean) : [];
    const wasStart = slotIds.includes(playerId);
    const wasBench = subIds.includes(playerId);
    if (wasStart) stats.starts++;
    if (wasBench) stats.bench++;
    if (wasStart || wasBench) {
      stats.apps++;
      const us = l.our_score_ft, them = l.opp_score_ft;
      if (us != null && them != null) {
        if (us > them) stats.wins++;
        else if (us < them) stats.losses++;
        else stats.draws++;
      }
    }
    const g = (d.goalscorers || []).find(x => x && x.player_id === playerId);
    if (g) stats.goals += parseInt(g.count, 10) || 0;
    const m = (d.motm || []).find(x => x && x.player_id === playerId);
    if (m) stats.motm++;
  }
  return stats;
}

// Return the set of season start years that have at least one played match
// in the given lineups, sorted newest-first. Used by the season arrows on
// the card.
function availableSeasonsFromLineups(lineups) {
  if (!Array.isArray(lineups)) return [];
  const years = new Set();
  for (const l of lineups) {
    if (!l || !l.game_date) continue;
    if (!matchHasBeenPlayed(l)) continue;
    const d = new Date(l.game_date + 'T12:00:00');
    years.add(computeCurrentSeasonStartYear(d));
  }
  return Array.from(years).sort((a, b) => b - a);
}

// "2025-26" label for a season start year.
function seasonLabelForYear(year) {
  if (year == null) return '';
  const next = (year + 1) % 100;
  return `${year}-${next.toString().padStart(2, '0')}`;
}

// ---------- Player access codes ----------
// Personal code: <firstInitial><lastInitial><4 random digits>, e.g. JE1234
// Family code:   5 random digits, shared by linked siblings
function _initial(s) {
  const ch = (s || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : 'X';
}
function makeAccessCode(name, existingSet) {
  const parts = (name || '').trim().split(/\s+/);
  const a = _initial(parts[0]);
  const b = _initial(parts[1] || parts[0]?.slice(1) || '');
  for (let i = 0; i < 200; i++) {
    const code = a + b + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!existingSet.has(code)) return code;
  }
  return a + b + String(Date.now() % 10000).padStart(4, '0');
}
function makeFamilyCode(existingSet) {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    if (!existingSet.has(code)) return code;
  }
  return String(Date.now() % 100000).padStart(5, '0');
}
// Backfill: any player without an access_code gets one assigned (mutates `players`).
async function ensureAccessCodes(players) {
  const existing = new Set(players.map(p => p.access_code).filter(Boolean));
  const updates = [];
  for (const p of players) {
    if (!p.access_code) {
      const code = makeAccessCode(p.name, existing);
      existing.add(code);
      p.access_code = code;
      updates.push(supabase.from('players').update({ access_code: code }).eq('id', p.id));
    }
  }
  if (updates.length) {
    const results = await Promise.all(updates);
    results.forEach(r => { if (r.error) console.warn('access_code backfill error', r.error); });
  }
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

// ---------- Badges (Slice 9a: manual awards; auto entries stubbed for 9b) ----------
// BADGE_CATALOG is the single source of truth for names, emoji icons, categories,
// descriptions, and flavour (manual vs auto). Both the public FIFA card and the
// Squad → player modal read from this catalog when rendering and when awarding.
// All icons are emoji per Chris's 2026-04-17 call — no SVG / icon font needed.
// Each entry: { name, description, emoji, category, flavour, criteria? }
//   flavour = 'manual' (coach awards it explicitly) | 'auto' (derived — 9b)
//   category = 'attacking' | 'skill' | 'defending' | 'attitude' | 'teamwork'
//              | 'fun' | 'milestone'
// Auto-flavour entries are kept in the catalog so 9b can wire criteria without
// needing a catalog rewrite. They are not shown in the 9a award modal.
const BADGE_CATALOG = {
  // 🔥 Attacking & Scoring
  on_fire:            { name: 'On Fire',          emoji: '🔥', category: 'attacking', flavour: 'auto',   description: 'Scored in 3 matches in a row.' },
  goal_machine:       { name: 'Goal Machine',     emoji: '⚽', category: 'attacking', flavour: 'auto',   description: '5 goals this season.' },
  hat_trick_hero:     { name: 'Hat-Trick Hero',   emoji: '🎩', category: 'attacking', flavour: 'auto',   description: '3+ goals in one match.' },
  brace:              { name: 'Brace',            emoji: '✌️', category: 'attacking', flavour: 'auto',   description: '2 goals in one match.' },
  opening_night:      { name: 'Opening Night',    emoji: '🌟', category: 'attacking', flavour: 'auto',   description: 'First goal of the season.' },
  clinical_finisher:  { name: 'Clinical Finisher',emoji: '🎯', category: 'attacking', flavour: 'manual', description: 'Cool as ice in front of goal — a first-time finisher.' },
  poacher:            { name: 'Poacher',          emoji: '🦊', category: 'attacking', flavour: 'manual', description: 'Always in the right place for rebounds and tap-ins.' },
  long_shot_legend:   { name: 'Long-Shot Legend', emoji: '🚀', category: 'attacking', flavour: 'manual', description: 'Scored a screamer from outside the box.' },
  weaker_foot_hero:   { name: 'Weaker-Foot Hero', emoji: '🦶', category: 'attacking', flavour: 'manual', description: 'Scored with their less-favoured foot.' },
  ice_cold:           { name: 'Ice Cold',         emoji: '🧊', category: 'attacking', flavour: 'manual', description: 'Scored under pressure — a penalty or late equaliser.' },
  solo_star:          { name: 'Solo Star',        emoji: '💫', category: 'attacking', flavour: 'manual', description: 'Beat two or more players before scoring.' },
  top_scorer:         { name: 'Top Scorer',       emoji: '👑', category: 'attacking', flavour: 'auto',   description: 'Top goalscorer this season.' },
  super_sub:          { name: 'Super Sub',        emoji: '🔁', category: 'attacking', flavour: 'auto',   description: 'Came off the bench and scored.' },

  // ⚡ Speed, Skill & Physical
  speedster:          { name: 'Speedster',        emoji: '⚡', category: 'skill',     flavour: 'manual', description: 'Lightning quick — burned the defender.' },
  engine:             { name: 'The Engine',       emoji: '🛞', category: 'skill',     flavour: 'manual', description: 'Ran, and ran, and ran — a box-to-box motor.' },
  dribble_king:       { name: 'Dribble King',     emoji: '🕺', category: 'skill',     flavour: 'manual', description: 'Weaves through challenges with the ball glued to their feet.' },
  two_footed:         { name: 'Two-Footed',       emoji: '🦵', category: 'skill',     flavour: 'manual', description: 'Comfortable on either foot.' },
  balance_master:     { name: 'Balance Master',   emoji: '⚖️', category: 'skill',     flavour: 'manual', description: 'Impossible to knock off the ball.' },
  agility_ace:        { name: 'Agility Ace',      emoji: '🤸', category: 'skill',     flavour: 'manual', description: 'Turned on a sixpence.' },
  shield_wall:        { name: 'Shield Wall',      emoji: '🛡️', category: 'skill',     flavour: 'manual', description: 'Shielded the ball brilliantly under pressure.' },
  wingman:            { name: 'Wingman',          emoji: '🪁', category: 'skill',     flavour: 'manual', description: 'Owned the wing all match.' },
  tireless:           { name: 'Tireless',         emoji: '🫁', category: 'skill',     flavour: 'manual', description: 'Played the full 90 without dropping a yard.' },

  // 🧱 Defending & Goalkeeper
  brick_wall:         { name: 'Brick Wall',       emoji: '🧱', category: 'defending', flavour: 'auto',   description: '3 clean sheets in a row.' },
  iron_defence:       { name: 'Iron Defence',     emoji: '⚔️', category: 'defending', flavour: 'auto',   description: '5 clean sheets this season.' },
  golden_glove:       { name: 'Golden Glove',     emoji: '🧤', category: 'defending', flavour: 'auto',   description: 'Fewest goals conceded this season.' },
  safe_hands:         { name: 'Safe Hands',       emoji: '🙌', category: 'defending', flavour: 'manual', description: 'A save that kept the team in the game.' },
  shot_stopper:       { name: 'Shot-Stopper',     emoji: '🧤', category: 'defending', flavour: 'manual', description: 'Big save at a crucial moment.' },
  sweeper_keeper:     { name: 'Sweeper Keeper',   emoji: '🧹', category: 'defending', flavour: 'manual', description: 'Came out to clean up behind the defence.' },
  last_line_hero:     { name: 'Last-Line Hero',   emoji: '🦸', category: 'defending', flavour: 'manual', description: 'Hero moment when the team needed it most.' },
  tackle_master:      { name: 'Tackle Master',    emoji: '🦿', category: 'defending', flavour: 'manual', description: 'Timing and strength on the tackle.' },
  interceptor:        { name: 'Interceptor',      emoji: '🎣', category: 'defending', flavour: 'manual', description: 'Read the game and nicked the ball before it arrived.' },
  no_nonsense:        { name: 'No-Nonsense',      emoji: '💥', category: 'defending', flavour: 'manual', description: 'Cleared the danger without a second thought.' },
  captain_back_line:  { name: 'Captain of the Back Line', emoji: '🎖️', category: 'defending', flavour: 'manual', description: 'Organised the defence and led from the back.' },
  fearless:           { name: 'Fearless',         emoji: '🦁', category: 'defending', flavour: 'manual', description: 'Put their body on the line.' },
  goal_line_hero:     { name: 'Goal-Line Hero',   emoji: '🚧', category: 'defending', flavour: 'manual', description: 'Heroic goal-line clearance.' },
  last_ditch_hero:    { name: 'Last-Ditch Hero',  emoji: '🎬', category: 'defending', flavour: 'manual', description: 'Last-second challenge that saved the day.' },

  // 🧠 Effort, Attitude & Coach's Choice
  never_give_up:      { name: 'Never Give Up',    emoji: '💪', category: 'attitude',  flavour: 'manual', description: 'Kept running and battling to the final whistle.' },
  training_star:      { name: 'Training Star',    emoji: '🌟', category: 'attitude',  flavour: 'manual', description: 'Standout attitude and effort in training.' },
  coaches_choice:     { name: "Coach's Choice",   emoji: '🏅', category: 'attitude',  flavour: 'manual', description: "Coach's pick of the week." },
  comeback_kid:       { name: 'Comeback Kid',     emoji: '🔄', category: 'attitude',  flavour: 'manual', description: 'Bounced back after a setback.' },
  focus_pro:          { name: 'Focus Pro',        emoji: '🎯', category: 'attitude',  flavour: 'manual', description: 'Locked-in focus all match.' },
  resilience:         { name: 'Resilience',       emoji: '🪨', category: 'attitude',  flavour: 'manual', description: 'Took the knocks and kept going.' },
  calm_head:          { name: 'Calm Head',        emoji: '🧘', category: 'attitude',  flavour: 'manual', description: 'Kept their head when others lost theirs.' },
  growth_mindset:     { name: 'Growth Mindset',   emoji: '🌱', category: 'attitude',  flavour: 'manual', description: 'Took coaching on board and visibly improved.' },
  consistency_king:   { name: 'Consistency King', emoji: '📊', category: 'attitude',  flavour: 'auto',   description: 'Reliable every week — shows up and contributes.' },
  ever_present:       { name: 'Ever-Present',     emoji: '📅', category: 'attitude',  flavour: 'auto',   description: 'Played every match this season.' },
  bounce_back:        { name: 'Bounce Back',      emoji: '🎾', category: 'attitude',  flavour: 'manual', description: 'Best improvement after a tough game.' },
  training_gem:       { name: 'Training-Ground Gem', emoji: '💎', category: 'attitude', flavour: 'manual', description: 'A real gem in training this week.' },

  // 🤝 Teamwork & Sportsmanship
  team_player:        { name: 'Team Player',      emoji: '🤝', category: 'teamwork',  flavour: 'manual', description: 'Put the team first all match.' },
  helper:             { name: 'Helper',           emoji: '🙋', category: 'teamwork',  flavour: 'manual', description: 'Helped a teammate up / out / through it.' },
  fair_play:          { name: 'Fair Play',        emoji: '🕊️', category: 'teamwork',  flavour: 'manual', description: 'Played the game the right way.' },
  leader:             { name: 'Leader',           emoji: '🧭', category: 'teamwork',  flavour: 'manual', description: 'Led by example on and off the pitch.' },
  communicator:       { name: 'Communicator',     emoji: '📣', category: 'teamwork',  flavour: 'manual', description: 'Talked non-stop — organised the team.' },
  unsung_hero:        { name: 'Unsung Hero',      emoji: '🫶', category: 'teamwork',  flavour: 'manual', description: 'Did the dirty work that no-one noticed but everyone benefited from.' },
  high_five_hero:     { name: 'High-Five Hero',   emoji: '🖐️', category: 'teamwork',  flavour: 'manual', description: 'Lifted everyone around them.' },
  respect_badge:      { name: 'Respect',          emoji: '🤲', category: 'teamwork',  flavour: 'manual', description: 'Respectful to teammates, opponents, and officials.' },
  buddy_badge:        { name: 'Buddy Badge',      emoji: '👯', category: 'teamwork',  flavour: 'manual', description: 'A great teammate to a younger or newer player.' },
  handshake_hero:     { name: 'Handshake Hero',   emoji: '🤝', category: 'teamwork',  flavour: 'manual', description: 'First to shake hands, first to say well-played.' },
  squad_boost:        { name: 'Squad Boost',      emoji: '📈', category: 'teamwork',  flavour: 'manual', description: 'Lifted the mood of the whole squad.' },

  // 🎉 Fun & Seasonal
  nutmeg_king:        { name: 'Nutmeg King',      emoji: '🥜', category: 'fun',       flavour: 'manual', description: 'Slipped one through an opponent\'s legs.' },
  celebration_star:   { name: 'Celebration Star', emoji: '🎉', category: 'fun',       flavour: 'manual', description: 'Best celebration of the week.' },
  rainbow_rocket:     { name: 'Rainbow Rocket',   emoji: '🌈', category: 'fun',       flavour: 'manual', description: 'Pulled off a rainbow flick.' },
  thunder_boot:       { name: 'Thunder Boot',     emoji: '⚡', category: 'fun',       flavour: 'manual', description: 'An absolute thunderbolt of a shot.' },
  rain_warrior:       { name: 'Rain Warrior',     emoji: '🌧️', category: 'fun',       flavour: 'manual', description: 'Played brilliantly in terrible weather.' },
  smile_maker:        { name: 'Smile Maker',      emoji: '😄', category: 'fun',       flavour: 'manual', description: 'Made the whole squad smile.' },
  boot_collector:     { name: 'Boot Collector',   emoji: '👟', category: 'fun',       flavour: 'manual', description: 'New boots, new form.' },
  hair_of_match:      { name: 'Hair of the Match',emoji: '💇', category: 'fun',       flavour: 'manual', description: 'Best hair on the pitch today.' },
  golden_boot_mini:   { name: 'Monthly Golden Boot', emoji: '🥾', category: 'fun',    flavour: 'auto',   description: 'Top scorer in the calendar month.' },
  early_bird:         { name: 'Early Bird',       emoji: '🐦', category: 'fun',       flavour: 'manual', description: 'Always first to arrive.' },
  lucky_charm:        { name: 'Lucky Charm',      emoji: '🍀', category: 'fun',       flavour: 'auto',   description: 'Team is unbeaten when this player plays.' },
  birthday_kid:       { name: 'Birthday Kid',     emoji: '🎂', category: 'fun',       flavour: 'manual', description: 'Played a match on their birthday.' },

  // 🏆 Milestones (all auto — 9b)
  debut_match:        { name: 'Debut Match',      emoji: '🎬', category: 'milestone', flavour: 'auto',   description: 'Played their first match for the team.' },
  games_10:           { name: '10 Games',         emoji: '🔟', category: 'milestone', flavour: 'auto',   description: 'Played 10 matches for the team.' },
  games_25:           { name: '25 Games',         emoji: '🎖️', category: 'milestone', flavour: 'auto',   description: 'Played 25 matches for the team.' },
  games_50:           { name: '50 Games',         emoji: '🏅', category: 'milestone', flavour: 'auto',   description: 'Played 50 matches for the team.' },
  games_100:          { name: '100 Games',        emoji: '💯', category: 'milestone', flavour: 'auto',   description: '100 matches! A true club legend.' },
  goals_1:            { name: 'First Goal',       emoji: '🥅', category: 'milestone', flavour: 'auto',   description: 'Scored their first goal for the team.' },
  goals_10:           { name: '10 Goals',         emoji: '⚽', category: 'milestone', flavour: 'auto',   description: '10 career goals.' },
  goals_25:           { name: '25 Goals',         emoji: '🎯', category: 'milestone', flavour: 'auto',   description: '25 career goals.' },
  goals_50:           { name: '50 Goals',         emoji: '👑', category: 'milestone', flavour: 'auto',   description: '50 career goals.' },
  motm_1:             { name: 'First MOTM',       emoji: '🏆', category: 'milestone', flavour: 'auto',   description: 'First Man of the Match award.' },
  motm_5:             { name: '5× MOTM',          emoji: '🌟', category: 'milestone', flavour: 'auto',   description: '5 Man-of-the-Match awards.' },
  motm_10:            { name: '10× MOTM',         emoji: '✨', category: 'milestone', flavour: 'auto',   description: '10 Man-of-the-Match awards.' },
  clean_sheets_1:     { name: 'First Clean Sheet',emoji: '🧼', category: 'milestone', flavour: 'auto',   description: 'First clean sheet for the team.' },
  clean_sheets_5:     { name: '5 Clean Sheets',   emoji: '🧱', category: 'milestone', flavour: 'auto',   description: '5 career clean sheets.' },
  clean_sheets_10:    { name: '10 Clean Sheets',  emoji: '🏛️', category: 'milestone', flavour: 'auto',   description: '10 career clean sheets.' },
  assists_1:          { name: 'First Assist',     emoji: '🎁', category: 'milestone', flavour: 'auto',   description: 'First assist for the team.' },
  assists_10:         { name: '10 Assists',       emoji: '🪄', category: 'milestone', flavour: 'auto',   description: '10 career assists.' },
  assists_25:         { name: '25 Assists',       emoji: '🎩', category: 'milestone', flavour: 'auto',   description: '25 career assists.' },

  // 🥅 Goalkeeper specialists
  penalty_saver:      { name: 'Penalty Saver',    emoji: '🥅', category: 'goalkeeper', flavour: 'manual', description: 'Saved a penalty — pure nerve and timing.' },
  double_save:        { name: 'Double Save',      emoji: '✋', category: 'goalkeeper', flavour: 'manual', description: 'Parried the first shot, got up and saved the rebound.' },
  fingertip_save:     { name: 'Fingertip Save',   emoji: '☝️', category: 'goalkeeper', flavour: 'manual', description: 'Flying save — just got enough on it.' },
  commanding_area:    { name: 'Commanding the Area', emoji: '🧭', category: 'goalkeeper', flavour: 'manual', description: 'Dominated the six-yard box — came and claimed it.' },
  one_v_one_hero:     { name: 'One-v-One Hero',   emoji: '🆚', category: 'goalkeeper', flavour: 'manual', description: 'Won a crucial 1-v-1 with the striker.' },
  at_their_feet:      { name: 'At Their Feet',    emoji: '🦶', category: 'goalkeeper', flavour: 'manual', description: 'Brave save down low — right at the striker\'s boots.' },
  distribution_king:  { name: 'Distribution King',emoji: '📡', category: 'goalkeeper', flavour: 'manual', description: 'Pinpoint kicks and throws started attacks all match.' },
  claim_master:       { name: 'Claim Master',     emoji: '🙌', category: 'goalkeeper', flavour: 'manual', description: 'Plucked crosses out of the air with confidence.' },
  keeper_captain:     { name: 'Keeper Captain',   emoji: '🗣️', category: 'goalkeeper', flavour: 'manual', description: 'Organised the back line from the sticks.' },
  quick_release:      { name: 'Quick Release',    emoji: '⚡', category: 'goalkeeper', flavour: 'manual', description: 'Lightning throw-out launched a counter-attack.' },

  // 🧱 Defender specialists
  aerial_ace:         { name: 'Aerial Ace',       emoji: '🪽', category: 'defender', flavour: 'manual', description: 'Won everything in the air.' },
  header_clearance:   { name: 'Header Clearance', emoji: '💨', category: 'defender', flavour: 'manual', description: 'Towering header to clear the danger.' },
  clean_slide:        { name: 'Clean Slide',      emoji: '🧽', category: 'defender', flavour: 'manual', description: 'Perfect sliding tackle — all ball.' },
  recovery_run:       { name: 'Recovery Run',     emoji: '🏃', category: 'defender', flavour: 'manual', description: 'Chased back from nowhere to stop a breakaway.' },
  marking_master:     { name: 'Marking Master',   emoji: '👁️', category: 'defender', flavour: 'manual', description: 'Stuck to their man all match — never let them out of sight.' },
  block_party:        { name: 'Block Party',      emoji: '🚫', category: 'defender', flavour: 'manual', description: 'Threw themselves in front of shots all game.' },
  position_perfect:   { name: 'Position Perfect', emoji: '📐', category: 'defender', flavour: 'manual', description: 'Always in the right place — the defender\'s art.' },
  long_ball_guru:     { name: 'Long-Ball Guru',   emoji: '🎯', category: 'defender', flavour: 'manual', description: 'Pinged a diagonal that split the opposition.' },
  composed_defender:  { name: 'Composed Defender',emoji: '🧘', category: 'defender', flavour: 'manual', description: 'Played out from the back under pressure.' },
  overlap_run:        { name: 'Overlap Run',      emoji: '↪️', category: 'defender', flavour: 'manual', description: 'Bombed forward to overlap the winger.' },
  wingback_engine:    { name: 'Wing-Back Engine', emoji: '🚂', category: 'defender', flavour: 'manual', description: 'Up and down that flank all match.' },

  // 🎛️ Midfielder specialists
  metronome:          { name: 'Metronome',        emoji: '🎼', category: 'midfielder', flavour: 'manual', description: 'Set the tempo — kept the ball ticking over.' },
  pass_master:        { name: 'Pass Master',      emoji: '🧵', category: 'midfielder', flavour: 'manual', description: 'Barely misplaced a pass all match.' },
  playmaker:          { name: 'Playmaker',        emoji: '🎨', category: 'midfielder', flavour: 'manual', description: 'Pulled the strings — made the team tick.' },
  key_pass:           { name: 'Key Pass',         emoji: '🗝️', category: 'midfielder', flavour: 'manual', description: 'The pass that unlocked the defence.' },
  ball_winner:        { name: 'Ball Winner',      emoji: '🥊', category: 'midfielder', flavour: 'manual', description: 'Every loose ball ended up with them.' },
  box_to_box:         { name: 'Box to Box',       emoji: '📦', category: 'midfielder', flavour: 'manual', description: 'Covered every blade of grass — end to end.' },
  deep_architect:     { name: 'Deep-Lying Architect', emoji: '🏗️', category: 'midfielder', flavour: 'manual', description: 'Ran the game from deep — dictated everything.' },
  number_ten:         { name: 'Number Ten',       emoji: '🔟', category: 'midfielder', flavour: 'manual', description: 'Found pockets of space between the lines.' },
  turnover_ninja:     { name: 'Turnover Ninja',   emoji: '🥷', category: 'midfielder', flavour: 'manual', description: 'Won the ball high up and started the attack.' },
  switch_of_play:     { name: 'Switch of Play',   emoji: '🔀', category: 'midfielder', flavour: 'manual', description: 'Crossfield ball switched the angle of attack.' },
  eye_of_needle:      { name: 'Eye of the Needle',emoji: '🪡', category: 'midfielder', flavour: 'manual', description: 'Threaded a pass that shouldn\'t have been possible.' },

  // 🏹 Forward specialists
  target_man:         { name: 'Target Man',       emoji: '🎯', category: 'forward', flavour: 'manual', description: 'Held the ball up under pressure — gave the team a platform.' },
  first_touch_wizard: { name: 'First-Touch Wizard', emoji: '✨', category: 'forward', flavour: 'manual', description: 'Silky first touch that took the defender out of the game.' },
  chance_creator:     { name: 'Chance Creator',   emoji: '💡', category: 'forward', flavour: 'manual', description: 'Carved out chance after chance for teammates.' },
  volley_virtuoso:    { name: 'Volley Virtuoso',  emoji: '🎻', category: 'forward', flavour: 'manual', description: 'Scored with a clean volley.' },
  header_scorer:      { name: 'Header Scorer',    emoji: '🧠', category: 'forward', flavour: 'manual', description: 'Climbed to head one in.' },
  chip_finish:        { name: 'Chip Finish',      emoji: '🥄', category: 'forward', flavour: 'manual', description: 'Dinked it over the keeper — ice cold.' },
  bicycle_kick:       { name: 'Bicycle Kick',     emoji: '🚴', category: 'forward', flavour: 'manual', description: 'Pulled off a bicycle kick — attempted or scored.' },
  pressing_monster:   { name: 'Pressing Monster', emoji: '👹', category: 'forward', flavour: 'manual', description: 'Harried defenders until they cracked.' },
  link_up_play:       { name: 'Link-Up Play',     emoji: '🔗', category: 'forward', flavour: 'manual', description: 'Brought others into the game with clever lay-offs.' },
  channel_runner:     { name: 'Channel Runner',   emoji: '🏃‍♂️', category: 'forward', flavour: 'manual', description: 'Made clever runs into the channels behind.' },

  // 🔥 Attacking moments (expanded)
  opener:             { name: 'The Opener',       emoji: '🔓', category: 'attacking', flavour: 'manual', description: 'Scored the first goal of the match.' },
  equaliser:          { name: 'Equaliser',        emoji: '⚖️', category: 'attacking', flavour: 'manual', description: 'Scored the goal that levelled it up.' },
  winning_goal:       { name: 'Winning Goal',     emoji: '🏆', category: 'attacking', flavour: 'manual', description: 'Scored the match-winner.' },
  late_winner:        { name: 'Late Winner',      emoji: '⏰', category: 'attacking', flavour: 'manual', description: 'A late goal that sealed the three points.' },
  comeback_scorer:    { name: 'Comeback Scorer',  emoji: '🔁', category: 'attacking', flavour: 'manual', description: 'Scored when the team was behind — sparked a comeback.' },
  derby_goal:         { name: 'Derby Goal',       emoji: '🏟️', category: 'attacking', flavour: 'manual', description: 'Scored in a derby or rivalry match.' },
  first_time_finish:  { name: 'First-Time Finish',emoji: '💥', category: 'attacking', flavour: 'manual', description: 'Hit it first-time and buried it.' },
  assist_match:       { name: 'Assist',           emoji: '🎁', category: 'attacking', flavour: 'manual', description: 'Provided the pass for a goal.' },
  double_assist:      { name: 'Double Assist',    emoji: '🎁🎁', category: 'attacking', flavour: 'manual', description: 'Two assists in one match.' },
  hat_assist:         { name: 'Hat-Trick of Assists', emoji: '🎁🎁🎁', category: 'attacking', flavour: 'manual', description: 'Three assists in a single match.' },
  through_ball:       { name: 'Through-Ball Artist', emoji: '🏹', category: 'attacking', flavour: 'manual', description: 'Defence-splitting through ball.' },
  chance_factory:     { name: 'Chance Factory',   emoji: '🏭', category: 'attacking', flavour: 'manual', description: 'Created 3+ clear chances in one match.' },

  // 🎱 Set pieces & dead balls
  free_kick_ace:      { name: 'Free-Kick Ace',    emoji: '🎯', category: 'setpiece', flavour: 'manual', description: 'Curled a free-kick home or onto target.' },
  corner_king:        { name: 'Corner King',      emoji: '🚩', category: 'setpiece', flavour: 'manual', description: 'Dangerous delivery from every corner.' },
  penalty_taker_ace:  { name: 'Penalty Ace',      emoji: '🎯', category: 'setpiece', flavour: 'manual', description: 'Stepped up and calmly scored a penalty.' },
  dead_ball_master:   { name: 'Dead-Ball Master', emoji: '🎱', category: 'setpiece', flavour: 'manual', description: 'Ran the set-pieces — free kicks, corners, the lot.' },
  cross_master:       { name: 'Cross Master',     emoji: '➕', category: 'setpiece', flavour: 'manual', description: 'Whipped in cross after cross into dangerous areas.' },
  long_throw_weapon:  { name: 'Long-Throw Weapon',emoji: '🏐', category: 'setpiece', flavour: 'manual', description: 'Long throws causing chaos in the box.' },

  // ⚡ Skill tricks (expanded)
  stepover_specialist: { name: 'Stepover Specialist', emoji: '🕺', category: 'skill', flavour: 'manual', description: 'Stepovers sent the defender the wrong way.' },
  scissor_kick:       { name: 'Scissor Kick',     emoji: '✂️', category: 'skill', flavour: 'manual', description: 'Audacious scissor-kick attempt.' },
  elastico:           { name: 'Elastico',         emoji: '🪀', category: 'skill', flavour: 'manual', description: 'Flicked the ball one way and went the other.' },
  cruyff_turn:        { name: 'Cruyff Turn',      emoji: '🌀', category: 'skill', flavour: 'manual', description: 'Classic Cruyff turn to shake the marker.' },
  backheel_hero:      { name: 'Backheel Hero',    emoji: '👠', category: 'skill', flavour: 'manual', description: 'Cheeky backheel that came off.' },
  no_look_pass:       { name: 'No-Look Pass',     emoji: '🙈', category: 'skill', flavour: 'manual', description: 'Disguised pass to set up a teammate.' },

  // 🧠 Attitude (expanded)
  captain_armband:    { name: 'Captain\'s Armband', emoji: '🎽', category: 'attitude', flavour: 'manual', description: 'Wore the armband and led the team.' },
  first_full_game:    { name: 'First Full Game',  emoji: '⏱️', category: 'attitude', flavour: 'manual', description: 'Played their first full 90 minutes.' },
  late_bloomer:       { name: 'Late Bloomer',     emoji: '🌸', category: 'attitude', flavour: 'manual', description: 'Quiet first half, took over the second.' },
  silent_hero:        { name: 'Silent Hero',      emoji: '🤫', category: 'attitude', flavour: 'manual', description: 'No fanfare — just quietly brilliant.' },
  second_chance:      { name: 'Second Chance',    emoji: '🔄', category: 'attitude', flavour: 'manual', description: 'Missed a big chance, then made up for it.' },
  bench_energy:       { name: 'Bench Energy',     emoji: '🔋', category: 'attitude', flavour: 'manual', description: 'Biggest cheerleader on the sidelines.' },

  // 🎉 Fun (expanded — matchday character badges)
  mud_magnet:         { name: 'Mud Magnet',       emoji: '🟫', category: 'fun', flavour: 'manual', description: 'Left the pitch unrecognisable — caked head to toe in mud.' },
  goal_dance:         { name: 'Goal Dance',       emoji: '💃', category: 'fun', flavour: 'manual', description: 'Best celebration dance of the day.' },
  keepy_up_king:      { name: 'Keepy-Up King',    emoji: '🤹', category: 'fun', flavour: 'manual', description: 'Pre-match keepy-up record holder.' },
  warm_up_mvp:        { name: 'Warm-Up MVP',      emoji: '🏃', category: 'fun', flavour: 'manual', description: 'Set the tone in the warm-up — everyone else had to catch up.' },
  post_match_pundit:  { name: 'Post-Match Pundit',emoji: '🎤', category: 'fun', flavour: 'manual', description: 'Best post-match analysis in the huddle.' },
  bag_hero:           { name: 'Bag Hero',         emoji: '🎒', category: 'fun', flavour: 'manual', description: 'Helped pack the kit away without being asked.' },
  snack_hero:         { name: 'Snack Hero',       emoji: '🍎', category: 'fun', flavour: 'manual', description: 'Brought the best half-time snacks.' },
  water_boy:          { name: 'Water Carrier',    emoji: '💧', category: 'fun', flavour: 'manual', description: 'Kept the whole bench hydrated.' },
  cone_carrier:       { name: 'Cone Carrier',     emoji: '🔺', category: 'fun', flavour: 'manual', description: 'First in, last out — helped set up and pack down.' },
  dressing_room_dj:   { name: 'Dressing-Room DJ', emoji: '🎧', category: 'fun', flavour: 'manual', description: 'Brought the tunes — hyped the whole team up.' },
  photo_finish:       { name: 'Photo Finish',     emoji: '📸', category: 'fun', flavour: 'manual', description: 'Star of the match-day team photo.' },
  fresh_haircut:      { name: 'Fresh Haircut',    emoji: '💈', category: 'fun', flavour: 'manual', description: 'Fresh cut, fresh form.' },
  sock_style:         { name: 'Sock Style',       emoji: '🧦', category: 'fun', flavour: 'manual', description: 'Best socks on the pitch.' },
  matchday_mascot:    { name: 'Matchday Mascot',  emoji: '🐾', category: 'fun', flavour: 'manual', description: 'Brought the matchday energy from first whistle.' },
  selfie_star:        { name: 'Selfie Star',      emoji: '🤳', category: 'fun', flavour: 'manual', description: 'Star of the post-match selfie.' },
  tunnel_walk:        { name: 'Tunnel Walk',      emoji: '🚪', category: 'fun', flavour: 'manual', description: 'Walked out looking like a proper pro.' },
  windmill_celly:     { name: 'Windmill Celly',   emoji: '🌪️', category: 'fun', flavour: 'manual', description: 'Spun away celebrating — pure joy.' },
  ref_assistant:      { name: 'Ref\'s Assistant', emoji: '🚩', category: 'fun', flavour: 'manual', description: 'Stepped up to run the line when the ref needed a hand.' },
  full_kit_hero:      { name: 'Full-Kit Hero',    emoji: '🎽', category: 'fun', flavour: 'manual', description: 'Turned up kitted out head to toe.' },
  goal_commentator:   { name: 'Own Commentator',  emoji: '📻', category: 'fun', flavour: 'manual', description: 'Called their own goal as it went in.' },
  mismatched_boots:   { name: 'Mismatched Boots', emoji: '👟', category: 'fun', flavour: 'manual', description: 'Turned up with mismatched boots and still bossed it.' },
  kit_forgetful:      { name: 'Kit Scramble',     emoji: '🎽', category: 'fun', flavour: 'manual', description: 'Forgot something but still made it onto the pitch — barely.' },
  half_time_hero:     { name: 'Half-Time Hero',   emoji: '🍊', category: 'fun', flavour: 'manual', description: 'Came out of the half-time chat a different player.' },
  whistle_speedster:  { name: 'Whistle Sprinter', emoji: '🏁', category: 'fun', flavour: 'manual', description: 'Off like a rocket the second the whistle blew.' },
  thunderclap:        { name: 'Thunder Clap',     emoji: '👏', category: 'fun', flavour: 'manual', description: 'Led the post-match cheer for the team.' },
};

const BADGE_CATEGORY_LABELS = {
  goalkeeper:'🥅 Goalkeeper',
  defender:  '🧱 Defender',
  midfielder:'🎛️ Midfielder',
  forward:   '🏹 Forward',
  attacking: '🔥 Attacking',
  skill:     '⚡ Skill',
  defending: '🛡️ Defending',
  setpiece:  '🎱 Set pieces',
  attitude:  '🧠 Attitude',
  teamwork:  '🤝 Teamwork',
  fun:       '🎉 Fun',
  milestone: '🏆 Milestone',
};

// All-time order for categories in the award modal + card display.
const BADGE_CATEGORY_ORDER = ['goalkeeper','defender','midfielder','forward','attacking','skill','defending','setpiece','attitude','teamwork','fun','milestone'];

// Max badge chips shown inline on the public card before overflow into "See all".
const CARD_BADGES_MAX = 9;

function badgeEntry(key) { return BADGE_CATALOG[key] || null; }
function badgeEmoji(key) { return badgeEntry(key)?.emoji || '🏅'; }
function badgeName(key)  { return badgeEntry(key)?.name  || key; }

// Format an ISO timestamp as "5 Apr 2026" for the badge detail sheet.
function formatBadgeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Module-scope cache of badges per team. We read all team badges at once because
// a player modal may be opened any time, and the public card will want every
// unlocked sibling's badges available without a second round-trip.
// Shape: { [teamId]: Array<{id, player_id, team_id, badge_key, awarded_at, awarded_by, lineup_id, season_start_year, note}> }
let _teamBadges = {};

// Fetch all badges for a team and cache them. Returns the array (possibly empty).
// Swallows errors silently so a badge-table migration lag doesn't break the
// public card or Squad modal — callers fall back to an empty list.
async function fetchTeamBadges(teamId) {
  if (!teamId) return [];
  const { data, error } = await supabase
    .from('player_badges')
    .select('id,player_id,team_id,badge_key,awarded_at,awarded_by,lineup_id,season_start_year,note')
    .eq('team_id', teamId)
    .order('awarded_at', { ascending: false });
  if (error) {
    console.warn('fetchTeamBadges error', error.message || error);
    _teamBadges[teamId] = [];
    return [];
  }
  _teamBadges[teamId] = data || [];
  return _teamBadges[teamId];
}

function getCachedTeamBadges(teamId) {
  return _teamBadges[teamId] || [];
}

// Filter the cache to a single player, newest first. `seasonYear` null = all-time.
function badgesForPlayer(teamId, playerId, seasonYear) {
  const all = getCachedTeamBadges(teamId);
  const filtered = all.filter(b => b.player_id === playerId);
  if (seasonYear == null) return filtered;
  return filtered.filter(b => {
    if (b.season_start_year != null) return b.season_start_year === seasonYear;
    // Older rows without season_start_year — derive from awarded_at as a fallback.
    const d = b.awarded_at ? new Date(b.awarded_at) : null;
    if (!d || isNaN(d.getTime())) return false;
    return computeCurrentSeasonStartYear(d) === seasonYear;
  });
}

// Insert a manual badge. Auto-fills awarded_by + season_start_year. Returns
// the inserted row, or throws on error so callers can surface the message.
async function awardManualBadge({ teamId, playerId, badgeKey, note, lineupId }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const entry = badgeEntry(badgeKey);
  if (!entry) throw new Error('Unknown badge.');
  const row = {
    team_id: teamId,
    player_id: playerId,
    badge_key: badgeKey,
    awarded_by: user.id,
    note: (note && note.trim()) ? note.trim() : null,
    season_start_year: computeCurrentSeasonStartYear(),
  };
  if (lineupId) row.lineup_id = lineupId;
  const { data, error } = await supabase.from('player_badges').insert(row).select().single();
  if (error) throw error;
  // Keep cache in sync so UI redraws without a refetch.
  if (!_teamBadges[teamId]) _teamBadges[teamId] = [];
  _teamBadges[teamId].unshift(data);
  try { await logAudit(teamId, 'player_badge', data.id, 'create', { badge_key: badgeKey, player_id: playerId, note: row.note }); } catch {}
  return data;
}

async function removeBadge(badgeId, teamId) {
  const { error } = await supabase.from('player_badges').delete().eq('id', badgeId);
  if (error) throw error;
  if (_teamBadges[teamId]) {
    _teamBadges[teamId] = _teamBadges[teamId].filter(b => b.id !== badgeId);
  }
  try { await logAudit(teamId, 'player_badge', badgeId, 'delete', {}); } catch {}
}

// ---------- Coach's Focus — match cues (Slice 10 Phase 2) ----------
// The cue catalog is a seeded taxonomy (~86 entries) covering FA Four Corner Model,
// ELM (Effort/Learning/Mistakes), ROOTS (Rules/Opponents/Officials/Teammates/Self),
// Emotional Tank, welfare flags, player roles, and encouragement. It's effectively
// static from the client's perspective — fetched once per session and held in a
// module-scope map keyed by slug. Admin CRUD for the catalog is a later phase.
// Shape per row:
//   { slug, label, emoji, description, framework, corner, sub_concept,
//     visibility, age_band, frequency_cap, default_pairs_with, active, sort_order }
let _cueCatalog = null;        // map of slug -> row, or null if not loaded yet
let _cueCatalogLoading = null; // in-flight promise so parallel callers share one fetch

async function fetchCueCatalog() {
  if (_cueCatalog) return _cueCatalog;
  if (_cueCatalogLoading) return _cueCatalogLoading;
  _cueCatalogLoading = (async () => {
    const { data, error } = await supabase
      .from('cue_catalog')
      .select('slug,label,emoji,description,framework,corner,sub_concept,visibility,age_band,frequency_cap,default_pairs_with,active,sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('slug', { ascending: true });
    if (error) {
      console.warn('fetchCueCatalog error', error.message || error);
      _cueCatalogLoading = null;
      return {};
    }
    const map = {};
    (data || []).forEach(r => { map[r.slug] = r; });
    _cueCatalog = map;
    return map;
  })();
  return _cueCatalogLoading;
}

function getCachedCueCatalog() { return _cueCatalog || {}; }
function cueEntry(slug)  { return (_cueCatalog && _cueCatalog[slug]) || null; }
function cueLabel(slug)  { return cueEntry(slug)?.label || slug; }
function cueEmoji(slug)  { return cueEntry(slug)?.emoji || '🎯'; }

// Match cues cache. Shape: { [lineupId]: Array<row> }.
// Rows include: id, team_id, lineup_id, player_id, cue_slug, custom_note,
// is_primary, visibility, status, outcome_note, sort_order, set_by,
// reviewed_by, created_at, updated_at.
let _matchCues = {};
// In-flight guard so concurrent applyMatchDecorations calls don't each fire a
// fetch for the same lineup. Keyed by lineupId → Promise.
let _matchCuesInflight = {};

async function fetchMatchCues(teamId, lineupId) {
  if (!teamId || !lineupId) return [];
  const { data, error } = await supabase
    .from('match_cues')
    .select('id,team_id,lineup_id,player_id,cue_slug,custom_note,is_primary,visibility,status,outcome_note,sort_order,set_by,reviewed_by,created_at,updated_at')
    .eq('team_id', teamId)
    .eq('lineup_id', lineupId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('fetchMatchCues error', error.message || error);
    _matchCues[lineupId] = [];
    return [];
  }
  _matchCues[lineupId] = data || [];
  return _matchCues[lineupId];
}

function getCachedMatchCues(lineupId) {
  return _matchCues[lineupId] || [];
}

function cuesForPlayer(lineupId, playerId) {
  return getCachedMatchCues(lineupId).filter(c => c.player_id === playerId);
}

// Insert a new match cue. Accepts either cue_slug OR a free-text custom_note
// (both is fine too — a slug-with-a-personalising-note is the sweet spot).
// If is_primary is set and another primary already exists for this player on
// this lineup, the existing one is demoted first (unique partial index on DB
// would otherwise reject the insert).
async function setMatchCue({ teamId, lineupId, playerId, cueSlug, customNote, isPrimary, visibility }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  if (!cueSlug && !(customNote && customNote.trim())) {
    throw new Error('Pick a cue or write a custom note.');
  }
  // Resolve effective visibility — default to catalog's visibility if slug given.
  let effVisibility = visibility;
  if (!effVisibility) {
    const entry = cueSlug ? cueEntry(cueSlug) : null;
    effVisibility = entry?.visibility || 'parent_visible';
  }

  // If primary requested, demote any existing primary for this player on this lineup.
  if (isPrimary) {
    const existingPrimary = cuesForPlayer(lineupId, playerId).find(c => c.is_primary);
    if (existingPrimary) {
      await supabase.from('match_cues').update({ is_primary: false }).eq('id', existingPrimary.id);
      const cache = _matchCues[lineupId] || [];
      const idx = cache.findIndex(c => c.id === existingPrimary.id);
      if (idx >= 0) cache[idx] = { ...cache[idx], is_primary: false };
    }
  }

  // Sort_order: append at the end of this player's existing cues.
  const existingForPlayer = cuesForPlayer(lineupId, playerId);
  const nextSort = existingForPlayer.length
    ? Math.max(...existingForPlayer.map(c => c.sort_order || 0)) + 1
    : 0;

  const row = {
    team_id: teamId,
    lineup_id: lineupId,
    player_id: playerId,
    cue_slug: cueSlug || null,
    custom_note: (customNote && customNote.trim()) ? customNote.trim().slice(0, 200) : null,
    is_primary: !!isPrimary,
    visibility: effVisibility,
    status: 'set',
    sort_order: nextSort,
    set_by: user.id,
  };
  const { data, error } = await supabase.from('match_cues').insert(row).select().single();
  if (error) throw error;
  if (!_matchCues[lineupId]) _matchCues[lineupId] = [];
  _matchCues[lineupId].push(data);
  try { await logAudit(teamId, 'match_cue', data.id, 'create', { player_id: playerId, cue_slug: cueSlug, is_primary: !!isPrimary }); } catch {}
  return data;
}

// Update an existing cue row. Accepts partial patch — any of { cue_slug,
// custom_note, is_primary, visibility, status, outcome_note }.
async function updateMatchCue(cueId, lineupId, patch) {
  if (!cueId) throw new Error('Missing cue id.');
  const cache = _matchCues[lineupId] || [];
  const existing = cache.find(c => c.id === cueId);

  const p = {};
  if ('cue_slug'    in patch) p.cue_slug    = patch.cue_slug || null;
  if ('custom_note' in patch) p.custom_note = (patch.custom_note && patch.custom_note.trim()) ? patch.custom_note.trim().slice(0, 200) : null;
  if ('is_primary'  in patch) p.is_primary  = !!patch.is_primary;
  if ('visibility'  in patch) p.visibility  = patch.visibility;
  if ('status'      in patch) p.status      = patch.status;
  if ('outcome_note' in patch) p.outcome_note = (patch.outcome_note && patch.outcome_note.trim()) ? patch.outcome_note.trim().slice(0, 300) : null;

  // If flipping is_primary true, demote the current primary first.
  if (p.is_primary === true && existing) {
    const currentPrimary = cache.find(c => c.is_primary && c.player_id === existing.player_id && c.id !== cueId);
    if (currentPrimary) {
      await supabase.from('match_cues').update({ is_primary: false }).eq('id', currentPrimary.id);
      const idx = cache.findIndex(c => c.id === currentPrimary.id);
      if (idx >= 0) cache[idx] = { ...cache[idx], is_primary: false };
    }
  }

  const { data, error } = await supabase.from('match_cues').update(p).eq('id', cueId).select().single();
  if (error) throw error;
  const idx = cache.findIndex(c => c.id === cueId);
  if (idx >= 0) cache[idx] = data;
  const teamId = data.team_id;
  try { await logAudit(teamId, 'match_cue', cueId, 'update', p); } catch {}
  return data;
}

async function deleteMatchCue(cueId, lineupId, teamId) {
  if (!cueId) return;
  const { error } = await supabase.from('match_cues').delete().eq('id', cueId);
  if (error) throw error;
  if (_matchCues[lineupId]) {
    _matchCues[lineupId] = _matchCues[lineupId].filter(c => c.id !== cueId);
  }
  try { await logAudit(teamId, 'match_cue', cueId, 'delete', {}); } catch {}
}

// ---------- Router ----------
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('team/')) return { name: 'team', teamId: h.slice(5) };
  if (h.startsWith('view/'))  return { name: 'view',  lineupId: h.slice(5),  mode: 'match' };
  if (h.startsWith('avail/')) return { name: 'view',  lineupId: h.slice(6),  mode: 'avail' };
  if (h.startsWith('card/'))  return { name: 'card',  teamId:   h.slice(5) };
  if (h.startsWith('train/')) return { name: 'train', teamId:   h.slice(6) };
  return { name: 'home' };
}
window.addEventListener('hashchange', render);

function resetHeader() {
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.innerHTML = `<img src="logo.png" alt="Interpro" class="brand-logo" /><h1>Interpro Coach / Manager Assistant</h1>`;
  const tabsEl = document.getElementById('header-tabs');
  if (tabsEl) tabsEl.innerHTML = '';
  const plusEl = document.getElementById('global-plus');
  if (plusEl) plusEl.innerHTML = '';
  // Hide the hamburger + drawer on auth/teams-home/parent-view
  const navToggle = document.getElementById('nav-toggle');
  if (navToggle) { navToggle.hidden = true; navToggle.setAttribute('aria-expanded', 'false'); }
  const drawer = document.getElementById('nav-drawer');
  if (drawer) { drawer.hidden = true; drawer.innerHTML = ''; drawer.classList.remove('open'); }
  const overlay = document.getElementById('nav-drawer-overlay');
  if (overlay) { overlay.hidden = true; overlay.classList.remove('open'); }
  document.body.classList.remove('drawer-open');
  // Clear the desktop sidebar on auth/teams-home/parent-view (it's team-scoped).
  // CSS toggles its visibility to empty, so it won't display until a team dashboard
  // populates it again.
  const sidebar = document.getElementById('desktop-sidebar');
  if (sidebar) { sidebar.innerHTML = ''; }
  document.body.classList.remove('has-desktop-sidebar');
}

async function render() {
  // Clear the body classes that public-facing routes set. If we're still on the
  // relevant route they get re-added below; if we're navigating away this
  // removes the header-hide CSS.
  document.body.classList.remove('public-card-view');
  document.body.classList.remove('parent-view-active');

  // Public parent view — no auth required
  const preRoute = currentRoute();
  if (preRoute.name === 'view') {
    resetHeader();
    userBar.innerHTML = '';
    await renderParentView(preRoute.lineupId, { mode: preRoute.mode });
    return;
  }
  // Public player card — no auth required
  if (preRoute.name === 'card') {
    resetHeader();
    userBar.innerHTML = '';
    await renderPlayerCardPage(preRoute.teamId);
    return;
  }
  // Public training view — no auth required. Permanent rolling link per team
  // that always shows the next upcoming session (flips to next week 1h after end).
  if (preRoute.name === 'train') {
    resetHeader();
    userBar.innerHTML = '';
    await renderTrainingPublicView(preRoute.teamId);
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
  // Prompt to set a display name if the profile row is missing one
  maybePromptDisplayName(session.user).catch(err => console.warn('display-name prompt failed', err));

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
        <strong>Welcome — finish setting up</strong>
      </div>
      <div class="picker-body">
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.9rem">
          Set a password so you can log in from any device, and a display name so other coaches and parents know who you are.
        </p>
        <label>Your name</label>
        <input type="text" id="pw-name" autocomplete="name" placeholder="e.g. Chris Edwards" />
        <label style="margin-top:0.5rem">New password (min 8 characters)</label>
        <input type="password" id="pw-new" autocomplete="new-password" />
        <label style="margin-top:0.5rem">Confirm password</label>
        <input type="password" id="pw-confirm" autocomplete="new-password" />
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
          <button class="btn-secondary" data-action="signout">Sign out</button>
          <button class="primary" id="pw-save">Save & continue</button>
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
    const name = (overlay.querySelector('#pw-name').value || '').trim();
    const pw = overlay.querySelector('#pw-new').value || '';
    const pw2 = overlay.querySelector('#pw-confirm').value || '';
    if (name.length < 2) { msg.textContent = 'Please enter your name.'; msg.className = 'error'; return; }
    if (pw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; msg.className = 'error'; return; }
    if (pw !== pw2) { msg.textContent = 'Passwords do not match.'; msg.className = 'error'; return; }
    msg.textContent = 'Saving…'; msg.className = 'muted';
    const { error } = await supabase.auth.updateUser({
      password: pw,
      data: { password_set: true, full_name: name }
    });
    if (error) { msg.textContent = 'Failed: ' + error.message; msg.className = 'error'; return; }
    // Mirror to profiles row so other coaches see the name immediately
    await supabase.from('profiles').upsert({ id: user.id, email: user.email, full_name: name }, { onConflict: 'id' });
    msg.textContent = '✓ Saved.'; msg.className = 'ok';
    setTimeout(close, 700);
  };
  setTimeout(() => overlay.querySelector('#pw-name')?.focus(), 20);
}

// For users who already have a password but never set a display name
// (e.g. early signups before the name field was required). Blocking modal,
// dismiss only by entering a name or signing out.
async function maybePromptDisplayName(user) {
  if (!user) return;
  // Don't stack with the password modal
  if (document.querySelector('.picker-overlay[data-pw-prompt]')) return;
  if (document.querySelector('.picker-overlay[data-name-prompt]')) return;
  // user_metadata can populate quickly — short-circuit if it already has a name
  const metaName = (user.user_metadata?.full_name || '').trim();
  // Look up the profiles row
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const profName = (prof?.full_name || '').trim();
  if (profName.length >= 2) return; // already set
  // If only metadata has it, mirror it to profiles and we're done
  if (metaName.length >= 2) {
    await supabase.from('profiles').upsert({ id: user.id, email: user.email, full_name: metaName }, { onConflict: 'id' });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.setAttribute('data-name-prompt', '1');
  overlay.innerHTML = `
    <div class="picker-modal">
      <div class="picker-header"><strong>Add your name</strong></div>
      <div class="picker-body">
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.9rem">
          We need a display name so other coaches and parents know who you are. This shows up next to your name in team messages.
        </p>
        <label>Your name</label>
        <input type="text" id="dn-name" autocomplete="name" placeholder="e.g. Chris Edwards" />
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
          <button class="btn-secondary" data-action="signout">Sign out</button>
          <button class="primary" id="dn-save">Save</button>
        </div>
        <div id="dn-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
  const blockKeys = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener('keydown', blockKeys, true);
  const close = () => { document.removeEventListener('keydown', blockKeys, true); overlay.remove(); };

  overlay.querySelector('[data-action=signout]').onclick = async () => { await supabase.auth.signOut(); close(); };
  overlay.querySelector('#dn-save').onclick = async () => {
    const msg = overlay.querySelector('#dn-msg');
    const name = (overlay.querySelector('#dn-name').value || '').trim();
    if (name.length < 2) { msg.textContent = 'Please enter your name.'; msg.className = 'error'; return; }
    msg.textContent = 'Saving…'; msg.className = 'muted';
    const { error: e1 } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (e1) { msg.textContent = 'Failed: ' + e1.message; msg.className = 'error'; return; }
    const { error: e2 } = await supabase.from('profiles').upsert({ id: user.id, email: user.email, full_name: name }, { onConflict: 'id' });
    if (e2) { msg.textContent = 'Failed: ' + e2.message; msg.className = 'error'; return; }
    msg.textContent = '✓ Saved.'; msg.className = 'ok';
    setTimeout(close, 700);
  };
  setTimeout(() => overlay.querySelector('#dn-name')?.focus(), 20);
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
          <label>Your name</label>
          <input type="text" id="full_name" autocomplete="name" placeholder="e.g. Chris Edwards" />
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
      if (!full_name || full_name.length < 2) { errEl.textContent = 'Please enter your name.'; return; }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name } }
      });
      if (error) { errEl.textContent = error.message; return; }
      // Mirror to profiles row so coach lists pick it up immediately
      if (data?.user?.id) {
        await supabase.from('profiles').upsert({ id: data.user.id, email, full_name }, { onConflict: 'id' });
      }
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

// ---------- Global "+" quick-create menu ----------
// Renders a compact "+" button in the header with a popover for:
//   New match · New player · New tactic · New formation
// Gated to coaches/admins (canEdit). Hidden on auth/teams-home via resetHeader().
function renderGlobalPlus(user, teamId, canEdit) {
  // Populate EVERY .global-plus slot on the page. The header has one (#global-plus)
  // for phone, and the desktop sidebar has one (#global-plus-sidebar). Only the visible
  // slot ends up on screen because of responsive CSS (header is hidden ≥900px, sidebar
  // is hidden <900px), but we wire both so whichever is visible works.
  const slots = Array.from(document.querySelectorAll('.global-plus'));
  if (!slots.length) return;

  slots.forEach(slot => {
    if (!canEdit) { slot.innerHTML = ''; return; }
    wireGlobalPlusSlot(slot, user, teamId);
  });
}

// Wires a single .global-plus slot. Uses class selectors (not element IDs) internally
// so multiple slots can coexist on the page without ID collisions.
function wireGlobalPlusSlot(slot, user, teamId) {
  slot.innerHTML = `
    <button class="gp-btn gp-toggle" type="button" aria-haspopup="menu" aria-expanded="false" title="Quick create">
      <span class="gp-plus">+</span>
    </button>
    <div class="gp-menu" role="menu" hidden>
      <button type="button" class="gp-item" data-gp="match">
        <span class="gp-ico">⚽</span>
        <span class="gp-label">
          <strong>New match</strong>
          <em>Blank lineup on the pitch</em>
        </span>
      </button>
      <button type="button" class="gp-item" data-gp="player">
        <span class="gp-ico">👤</span>
        <span class="gp-label">
          <strong>New player</strong>
          <em>Add to your squad</em>
        </span>
      </button>
      <button type="button" class="gp-item" data-gp="play">
        <span class="gp-ico">📋</span>
        <span class="gp-label">
          <strong>New tactic</strong>
          <em>Open Tactics tab</em>
        </span>
      </button>
      <button type="button" class="gp-item" data-gp="formation">
        <span class="gp-ico">✎</span>
        <span class="gp-label">
          <strong>New formation</strong>
          <em>Edit positions on pitch</em>
        </span>
      </button>
    </div>
  `;

  const toggle = slot.querySelector('.gp-toggle');
  const menu = slot.querySelector('.gp-menu');

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
  };
  function onDocClick(e) {
    if (!slot.contains(e.target)) closeMenu();
  }
  function onKey(e) {
    if (e.key === 'Escape') { closeMenu(); toggle.focus(); }
  }

  toggle.onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  };

  slot.querySelectorAll('.gp-item').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const action = btn.dataset.gp;
      closeMenu();
      try { await flushAutosave(); } catch (_) {}
      await handleGlobalPlusAction(action, user, teamId);
    };
  });
}

async function handleGlobalPlusAction(action, user, teamId) {
  if (action === 'match') {
    // Open the guided wizard — it stashes values to _pendingLineupLoad and
    // switches to the Matches tab on Create.
    openMatchWizard(user, teamId);
    return;
  }
  if (action === 'player') {
    activeTab = 'squad';
    openCards.clear();
    await renderTeamDashboard(user, teamId);
    // Focus the add-player name input if it's there
    setTimeout(() => {
      const el = document.getElementById('ap-name');
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        el.focus();
      }
    }, 80);
    return;
  }
  if (action === 'play') {
    // Jump to Tactics → Edit sub-tab with a fresh blank tactic.
    activeTab = 'plays';
    _playsUi.subTab = 'edit';
    _playsUi.selectedId = null;
    openCards.clear();
    await renderTeamDashboard(user, teamId);
    // editor.current is set to newPlayState() inside the 'plays' branch of
    // renderTeamDashboard, so we're already on a blank editor. Focus the name.
    setTimeout(() => {
      const nameEl = document.getElementById('tac-name');
      if (nameEl) nameEl.focus();
    }, 80);
    return;
  }
  if (action === 'formation') {
    activeTab = 'lineups';
    openCards.clear();
    await renderTeamDashboard(user, teamId);
    // Enable position-edit mode so the "Save as new formation" button is visible
    if (editor && editor.mode === 'lineup') {
      _posEditMode = true;
      renderLineupsTab();
      setTimeout(() => {
        const tabEl = document.getElementById('tab-content');
        if (!tabEl || tabEl.querySelector('.gp-hint')) return;
        const hint = document.createElement('div');
        hint.className = 'gp-hint';
        hint.innerHTML = `💡 Drag players to arrange positions, then tap <strong>Save as new formation…</strong>`;
        tabEl.prepend(hint);
        setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 400); }, 5000);
      }, 60);
    }
    return;
  }
}

// ---------- User team list cache ----------
// Populated lazily via getUserTeams(user). Used to decide whether to render the
// "Switch team" shortcut in the sidebar / drawer (hidden for single-team
// non-admin users who'd just bounce straight back anyway) and to drive the
// team-switcher strip at the top of the Admin tab. Invalidated after creating
// or leaving a team.
let _userTeamsCache = null;
let _userTeamsCacheFor = null;
async function getUserTeams(user, { force = false } = {}) {
  if (!user) return [];
  if (!force && _userTeamsCache && _userTeamsCacheFor === user.id) return _userTeamsCache;
  // Optimistic fetch with age_group columns — fall back if DB is older.
  let data, err;
  {
    const r = await supabase
      .from('team_members')
      .select('role, team_id, teams(id, name, age_group, age_group_season_year)')
      .eq('user_id', user.id);
    data = r.data; err = r.error;
    if (err && /age_group/i.test(err.message || '')) {
      const r2 = await supabase
        .from('team_members')
        .select('role, team_id, teams(id, name)')
        .eq('user_id', user.id);
      data = r2.data; err = r2.error;
    }
  }
  if (err) { console.warn('getUserTeams failed', err); return []; }
  _userTeamsCache = (data || []);
  _userTeamsCacheFor = user.id;
  return _userTeamsCache;
}
function invalidateUserTeamsCache() {
  _userTeamsCache = null;
  _userTeamsCacheFor = null;
}
// True if this user should see a "Switch team" shortcut — i.e., they have >1
// team to choose from, OR any admin role (admins often manage several teams
// and benefit from the quick switch even on a single-team account).
function userCanSwitchTeams(memberships) {
  if (!memberships) return false;
  if (memberships.length > 1) return true;
  return memberships.some(m => m.role === 'admin');
}

// ---------- Phone hamburger drawer ----------
// Shows a slide-in drawer on phone containing the team header + vertical tabs.
// Desktop layout is untouched (the hamburger button hides via CSS ≥900px).
function renderNavDrawer(user, teamId, team, role, canEdit, memberships) {
  const toggle = document.getElementById('nav-toggle');
  const drawer = document.getElementById('nav-drawer');
  const overlay = document.getElementById('nav-drawer-overlay');
  if (!toggle || !drawer || !overlay) return;

  // CSS hides the hamburger on desktop (≥900px), so it's safe to unhide here.
  toggle.hidden = false;

  // Header second line: "<display name> · <role label>"
  const rawName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '');
  const displayName = rawName || 'Account';
  // Admin gets the public-facing "Head coach" label (inherits coach); others show the raw role capitalised.
  const roleLabel = role === 'admin'
    ? 'Head coach'
    : (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');

  // Drawer tabs match the mockup: Matches / Squad / Plays / Formations / Help-FAQ / Admin (coach-gated) / Sign out.
  // Matches now opens the unified editor (activeTab='lineups'), landing on the "matches" sub-tab
  // which shows the fixtures-as-cards list. The separate fixtures page is retired.
  const showSwitch = userCanSwitchTeams(memberships);
  const tabs = [
    { id: 'lineups',    label: 'Matches',       icon: '🌐' },
    { id: 'squad',      label: 'Squad details', icon: '👥' },
    { id: 'plays',      label: 'Tactics',       icon: '📋' },
    { id: 'formations', label: 'Formations',    icon: '▦' },
    { id: 'help',       label: 'Help / FAQ',    icon: '❓' },
    ...(canEdit ? [{ id: 'members', label: 'Admin', icon: '⚙' }] : []),
    ...(showSwitch ? [{ id: '__switchteam', label: 'Switch team', icon: '↻' }] : []),
    { id: '__signout',  label: 'Sign out',      icon: '⏻' },
  ];

  const drawerAgLabel = ageGroupLabel(team);
  drawer.innerHTML = `
    <div class="nav-drawer-head">
      <div class="nav-drawer-team">
        <strong>${escapeHtml(team.name)}${drawerAgLabel ? ' <span style="font-weight:400;opacity:0.8;font-size:0.85em"> · ' + drawerAgLabel + '</span>' : ''}</strong>
        <span class="nav-drawer-user">${escapeHtml(displayName)} · ${escapeHtml(roleLabel)}</span>
      </div>
    </div>
    <nav class="nav-drawer-tabs">
      ${tabs.map(t => `
        <button type="button" class="nav-drawer-tab ${activeTab === t.id ? 'active' : ''}" data-nav-tab="${t.id}">
          <span class="ndt-ico" aria-hidden="true">${t.icon}</span>
          <span class="ndt-label">${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `;

  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    document.removeEventListener('keydown', onKey, true);
    // Hide after transition so focus can't land on invisible items
    setTimeout(() => {
      if (!drawer.classList.contains('open')) {
        drawer.hidden = true;
        overlay.hidden = true;
      }
    }, 260);
  };
  const openDrawer = () => {
    drawer.hidden = false;
    overlay.hidden = false;
    // next frame to allow CSS transition
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      overlay.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
      document.addEventListener('keydown', onKey, true);
    });
  };
  function onKey(e) {
    if (e.key === 'Escape') { closeDrawer(); toggle.focus(); }
  }

  // .onclick assignment replaces any prior handler, safe across re-renders
  toggle.onclick = (e) => {
    e.stopPropagation();
    if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
  };
  overlay.onclick = closeDrawer;

  drawer.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.onclick = async () => {
      const next = btn.dataset.navTab;
      closeDrawer();
      if (next === '__signout') {
        try { await flushAutosave(); } catch (_) {}
        await supabase.auth.signOut();
        return;
      }
      if (next === '__switchteam') {
        try { await flushAutosave(); } catch (_) {}
        // force:true so the picker is shown even for single-team users who
        // would otherwise be auto-bounced back into their only team.
        location.hash = '';
        return;
      }
      if (next === activeTab) return;
      try { await flushAutosave(); } catch (_) {}
      activeTab = next;
      openCards.clear();
      renderTeamDashboard(user, teamId);
    };
  });
}

// ---------- Desktop persistent left sidebar ----------
// Shown on ≥900px viewports. Replaces the old horizontal header tabs.
// On phone the sidebar is hidden via CSS; the hamburger drawer handles navigation instead.
function renderDesktopSidebar(user, teamId, team, role, canEdit, memberships) {
  const sidebar = document.getElementById('desktop-sidebar');
  if (!sidebar) return;

  // Build a 2-letter logo mark from the team name. Fallback to "IB".
  const words = (team?.name || '').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2
    ? words[0][0] + words[1][0]
    : (team?.name || 'IB').slice(0, 2)).toUpperCase();

  // Subtitle — age group chip (auto-bumped each June) + role. The raw team.age_group
  // column is an INT; effectiveAgeGroup handles the season-year rollover logic.
  const subParts = [];
  const ag = ageGroupLabel(team);
  if (ag) subParts.push(ag);
  if (team?.season) subParts.push(`${team.season} season`);
  const subtitle = subParts.length ? subParts.join(' · ') : 'Team';

  // User badge: display name + role label (admin → "Head coach" to match the drawer)
  const rawName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '');
  const displayName = rawName || 'Account';
  const avatarChar = (displayName[0] || '?').toUpperCase();
  const roleLabel = role === 'admin'
    ? 'Head coach'
    : (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');

  // Same tab set as the phone drawer (minus Sign out — that has its own button in the user badge).
  // Matches now opens the unified match editor (activeTab='lineups'), landing on the Matches
  // sub-tab which shows the fixtures-as-cards list.
  const showSwitch = userCanSwitchTeams(memberships);
  const tabs = [
    { id: 'lineups',    label: 'Matches',       icon: '🌐' },
    { id: 'squad',      label: 'Squad details', icon: '👥' },
    { id: 'plays',      label: 'Tactics',       icon: '📋' },
    { id: 'formations', label: 'Formations',    icon: '▦' },
    { id: 'help',       label: 'Help / FAQ',    icon: '❓' },
    ...(canEdit ? [{ id: 'members', label: 'Admin', icon: '⚙' }] : []),
    ...(showSwitch ? [{ id: '__switchteam', label: 'Switch team', icon: '↻' }] : []),
  ];

  // Mark the body so CSS can reveal the sidebar + shift main content + hide the
  // old horizontal header. resetHeader() removes this class on auth/teams-home.
  document.body.classList.add('has-desktop-sidebar');

  sidebar.innerHTML = `
    <div class="ds-head">
      <span class="ds-logo" aria-hidden="true">${escapeHtml(initials)}</span>
      <div class="ds-team">
        <div class="ds-team-name">${escapeHtml(team.name)}</div>
        <div class="ds-team-sub">${escapeHtml(subtitle)}</div>
      </div>
      <div id="global-plus-sidebar" class="ds-plus-slot global-plus"></div>
    </div>
    <nav class="ds-tabs" aria-label="Primary">
      ${tabs.map(t => `
        <button type="button" class="ds-tab ${activeTab === t.id ? 'active' : ''}" data-ds-tab="${t.id}">
          <span class="ds-tab-ico" aria-hidden="true">${t.icon}</span>
          <span class="ds-tab-label">${t.label}</span>
        </button>
      `).join('')}
    </nav>
    <div class="ds-user">
      <span class="ds-user-avatar" aria-hidden="true">${escapeHtml(avatarChar)}</span>
      <div class="ds-user-text">
        <div class="ds-user-name">${escapeHtml(displayName)}</div>
        ${roleLabel ? `<div class="ds-user-role">${escapeHtml(roleLabel)}</div>` : ''}
      </div>
      <button type="button" class="ds-user-signout" id="ds-signout" title="Sign out">Sign out</button>
    </div>
  `;

  // Tab click → flush autosave, switch tab, re-render dashboard (same pattern as drawer).
  sidebar.querySelectorAll('[data-ds-tab]').forEach(btn => {
    btn.onclick = async () => {
      const next = btn.dataset.dsTab;
      if (next === '__switchteam') {
        try { await flushAutosave(); } catch (_) {}
        // Pops back to the team picker. renderTeamsHome sees no hash and shows
        // the grid (force:true so a single-team admin can still switch — though
        // single-team non-admins normally wouldn't see this button anyway).
        location.hash = '';
        return;
      }
      if (next === activeTab) return;
      try { await flushAutosave(); } catch (_) {}
      activeTab = next;
      openCards.clear();
      renderTeamDashboard(user, teamId);
    };
  });

  // Sign-out button in the user badge.
  const signoutBtn = sidebar.querySelector('#ds-signout');
  if (signoutBtn) signoutBtn.onclick = async () => {
    try { await flushAutosave(); } catch (_) {}
    await supabase.auth.signOut();
  };
}

// ---------- Teams home ----------
async function renderTeamsHome(user, opts = {}) {
  appEl.innerHTML = `<p class="loading">Loading your teams…</p>`;

  // Fetch memberships with the team row expanded so we can see age_group too.
  // Columns age_group + age_group_season_year may not exist in older databases —
  // we request them optimistically and fall back gracefully if they're missing.
  let memberships;
  let mErr;
  {
    const res = await supabase
      .from('team_members')
      .select('role, team_id, teams(id, name, age_group, age_group_season_year)')
      .eq('user_id', user.id);
    memberships = res.data;
    mErr = res.error;
    // If the age_group columns don't exist yet, retry without them.
    if (mErr && /age_group/i.test(mErr.message || '')) {
      const r2 = await supabase
        .from('team_members')
        .select('role, team_id, teams(id, name)')
        .eq('user_id', user.id);
      memberships = r2.data;
      mErr = r2.error;
    }
  }

  if (mErr) {
    appEl.innerHTML = `<div class="card"><p class="error">Error: ${escapeHtml(mErr.message)}</p></div>`;
    return;
  }

  memberships = memberships || [];

  // Auto-load: if the user has exactly 1 membership AND their role there isn't
  // 'admin', skip the picker and go straight into that team. Admins always see
  // the picker so they can switch easily; multi-team users always see it too.
  // opts.force === true bypasses this (used by the Switch team link so it doesn't
  // bounce straight back to the single team).
  if (!opts.force && memberships.length === 1 && memberships[0].role !== 'admin') {
    location.hash = `#/team/${memberships[0].team_id}`;
    return;
  }

  // Render the persistent desktop sidebar on the picker page too, so the user
  // has a visible sign-out button and the site feels coherent. The sidebar is
  // simpler here (no team-scoped tabs) but mirrors the style of the team pages.
  renderTeamsHomeSidebar(user);

  // Card grid — same visual language as match / tactic cards.
  const teamCardsHtml = memberships.length
    ? memberships.map(m => {
        const t = m.teams || {};
        const ag = ageGroupLabel(t);
        const roleLabel = m.role === 'admin' ? 'Admin'
          : m.role === 'coach' ? 'Coach'
          : m.role === 'parent' ? 'Parent'
          : escapeHtml(m.role);
        const roleClass = m.role === 'admin' ? 'me-match-status-published' : 'me-match-status-availability';
        return `
          <div class="me-match-card th-team-card" data-team="${m.team_id}">
            <div class="mc-date mc-tactic-icon" aria-hidden="true"><span class="mc-tactic-emoji">⚽</span></div>
            <div class="mc-body">
              <div class="me-match-title">${escapeHtml(t.name || '—')}</div>
              <div class="me-match-meta lineup-meta">${ag ? ag + ' · ' : ''}Role: ${roleLabel}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.2rem">
              <div class="me-match-status ${roleClass}">${roleLabel}</div>
            </div>
          </div>
        `;
      }).join('')
    : '';

  // Gate "+ Create new team" on the picker:
  //   • brand-new user (0 teams) — always allow, otherwise they're stuck
  //   • admin in ANY team — allow
  //   • coach / parent with 1+ teams — hide (admins are the only ones who
  //     should be founding new teams; coaches can be invited to new ones)
  const canCreateTeam = memberships.length === 0 ||
    memberships.some(m => m.role === 'admin');
  const createCardHtml = canCreateTeam
    ? `
      <button type="button" class="me-match-card me-match-new th-new-card" id="th-new-team-card">
        <div class="me-match-new-ico" aria-hidden="true">+</div>
        <div class="me-match-new-label">Create new team</div>
      </button>
    `
    : '';

  const emptyStateHtml = memberships.length
    ? canCreateTeam
      ? `<p class="muted" style="margin:0 0 1rem">Pick a team to open, or create a new one.</p>`
      : `<p class="muted" style="margin:0 0 1rem">Pick a team to open. Only admins can create new teams — ask yours to add you to another team.</p>`
    : `<p class="muted" style="margin:0 0 1rem">You're not on any teams yet — create one below to get started.</p>`;

  // No wrapper <h1> here — the app's main header already shows the product
  // title, and the sidebar's "Your teams" head is the section label.
  appEl.innerHTML = `
    <div class="teams-home">
      ${emptyStateHtml}
      <div class="me-matches-grid th-grid">
        ${teamCardsHtml}
        ${createCardHtml}
      </div>
    </div>
  `;

  // Open a team
  appEl.querySelectorAll('.th-team-card').forEach(card => {
    card.onclick = () => { location.hash = `#/team/${card.dataset.team}`; };
  });

  // + Create new team — opens the create modal
  const newCard = document.getElementById('th-new-team-card');
  if (newCard) newCard.onclick = () => openCreateTeamModal(user, async () => {
    // After creating, just refresh this page (new team joins the list, doesn't auto-switch)
    await renderTeamsHome(user, { force: true });
  });
}

// Lightweight desktop sidebar for the team-picker page — re-uses the .desktop-sidebar
// shell (logo head + user badge + sign out) but with no team-scoped tabs. Keeps
// visual continuity with the rest of the app so the picker doesn't feel like a
// separate stuck page.
function renderTeamsHomeSidebar(user) {
  const sidebar = document.getElementById('desktop-sidebar');
  if (!sidebar) return;

  const rawName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '');
  const displayName = rawName || 'Account';
  const avatarChar = (displayName[0] || '?').toUpperCase();

  // Ensure the body class is set so CSS reveals the sidebar at ≥900px.
  document.body.classList.add('has-desktop-sidebar');

  sidebar.innerHTML = `
    <div class="ds-head">
      <span class="ds-logo" aria-hidden="true">⚽</span>
      <div class="ds-team">
        <div class="ds-team-name">Your teams</div>
        <div class="ds-team-sub">Pick a team to open</div>
      </div>
    </div>
    <nav class="ds-tabs" aria-label="Primary" style="flex:1"></nav>
    <div class="ds-user">
      <span class="ds-user-avatar" aria-hidden="true">${escapeHtml(avatarChar)}</span>
      <div class="ds-user-text">
        <div class="ds-user-name">${escapeHtml(displayName)}</div>
      </div>
      <button type="button" class="ds-user-signout" id="th-signout" title="Sign out">Sign out</button>
    </div>
  `;

  const signoutBtn = document.getElementById('th-signout');
  if (signoutBtn) signoutBtn.onclick = async () => {
    try { await supabase.auth.signOut(); } catch (_) {}
  };
}

// Create-team modal — shared between the team-picker page and the Admin tab.
// Collects team name + optional age group, inserts teams row + team_members row
// (creator becomes admin), and invokes onCreated(team) on success.
function openCreateTeamModal(user, onCreated) {
  // Default age group: whatever the user most often coaches (unknown here) —
  // offer a blank "(not set)" option plus U7..U18.
  const currentSeasonYear = computeCurrentSeasonStartYear();
  const ageOpts = AGE_GROUP_OPTIONS.map(n =>
    `<option value="${n}">U${n}s</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:460px;height:auto;max-height:92vh">
      <div class="map-modal-header">
        <strong>Create a new team</strong>
        <button class="btn-secondary" id="ct-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="map-modal-body" style="padding:0.9rem">
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.85rem">You'll be the admin of this team. You can change any of this later from the Admin tab.</p>
        <label class="tac-label">Team name</label>
        <input type="text" id="ct-name" class="tac-input" placeholder="e.g. Interpro Blues" autocomplete="off" />
        <label class="tac-label" style="margin-top:0.7rem">Age group <span class="muted" style="font-weight:400">(optional)</span></label>
        <select id="ct-age" class="tac-input">
          <option value="">— not set —</option>
          ${ageOpts}
        </select>
        <p class="muted" style="font-size:0.72rem;margin:0.25rem 0 0">Age group rolls up by one on 7 June each year (the week after the season ends).</p>
        <div id="ct-msg" class="error" style="min-height:1.1em;font-size:0.85rem;margin-top:0.6rem"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.5rem">
          <button type="button" class="btn-secondary" id="ct-cancel">Cancel</button>
          <button type="button" class="primary" id="ct-save">Create team</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#ct-close').onclick = close;
  overlay.querySelector('#ct-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  setTimeout(() => overlay.querySelector('#ct-name')?.focus(), 20);

  overlay.querySelector('#ct-save').onclick = async () => {
    const msg = overlay.querySelector('#ct-msg');
    const name = (overlay.querySelector('#ct-name').value || '').trim();
    if (!name) { msg.textContent = 'Team name is required.'; return; }
    const ageVal = overlay.querySelector('#ct-age').value;

    // Build insert payload. Optional age fields only included when set.
    const payload = { name, created_by: user.id };
    if (ageVal) {
      payload.age_group = parseInt(ageVal, 10);
      payload.age_group_season_year = currentSeasonYear;
    }

    // Attempt insert. If the age_group columns don't exist yet in Supabase, fall back.
    let team, tErr;
    {
      const res = await supabase.from('teams').insert(payload).select().single();
      team = res.data;
      tErr = res.error;
      if (tErr && /age_group/i.test(tErr.message || '')) {
        const r2 = await supabase.from('teams').insert({ name, created_by: user.id }).select().single();
        team = r2.data; tErr = r2.error;
      }
    }
    if (tErr) { msg.textContent = tErr.message; return; }

    const { error: memErr } = await supabase
      .from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'admin' });
    if (memErr) { msg.textContent = memErr.message; return; }

    // The cache is now stale — the new team needs to show up in the picker +
    // sidebar Switch team list.
    invalidateUserTeamsCache();

    close();
    if (onCreated) await onCreated(team);
  };
}

// ---------- Public player card (#/card/{team_id}) ----------
// FIFA-style season stats card unlocked via a child's access code (or a
// family code, which may match multiple siblings). Unlocked player ids are
// cached in localStorage so the kid/parent doesn't need to re-enter the code
// on repeat visits. Stats are aggregated client-side from lineups the team
// has set to 'availability' or 'published' — anon can read those under the
// existing RLS policy, drafts stay private.
let _cardState = {
  teamId: null,
  team: null,
  players: [],          // unlocked player objects (name, number, position, photo_url)
  lineups: [],          // all team lineups anon can read
  selectedPlayerIdx: 0, // which sibling (for family codes)
  seasonYear: null,     // currently-shown season start year (null = all-time)
  seasonsAvailable: []
};

function _playerCardStorageKey(teamId) {
  return `interpro:card_unlock:${teamId}`;
}
function _loadCardUnlocks(teamId) {
  try {
    const raw = localStorage.getItem(_playerCardStorageKey(teamId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(id => typeof id === 'string') : [];
  } catch (_) { return []; }
}
function _saveCardUnlocks(teamId, ids) {
  try {
    localStorage.setItem(_playerCardStorageKey(teamId), JSON.stringify(ids));
  } catch (_) {}
}
function _clearCardUnlocks(teamId) {
  try { localStorage.removeItem(_playerCardStorageKey(teamId)); } catch (_) {}
}

async function renderPlayerCardPage(teamId) {
  if (!teamId) {
    appEl.innerHTML = `<div class="card"><p class="error">Team id missing from URL.</p></div>`;
    return;
  }
  _cardState.teamId = teamId;
  // Hide the app's main header/sidebar/userbar on this public route so the
  // card is the only thing on-screen — no admin chrome leaking into a page
  // that's meant for a kid to look at.
  document.body.classList.add('public-card-view');
  appEl.innerHTML = `<p class="loading">Loading…</p>`;

  // Fetch team + team's visible lineups (published/availability only, per the RLS policy)
  // + team badges. Run reads in parallel; team fetch falls back to minimal columns
  // if age_group isn't migrated yet. Badge fetch swallows errors silently (table
  // may not be migrated yet).
  const [teamRes, lineupRes] = await Promise.all([
    (async () => {
      let r = await supabase.from('teams').select('id,name,age_group,age_group_season_year,home_ground_name').eq('id', teamId).maybeSingle();
      if (r.error && /age_group/i.test(r.error.message || '')) {
        r = await supabase.from('teams').select('id,name,home_ground_name').eq('id', teamId).maybeSingle();
      }
      return r;
    })(),
    supabase.from('lineups').select('id,team_id,game_date,kickoff_time,opponent,home_away,lineup_status,published,our_score_ft,opp_score_ft,data').eq('team_id', teamId),
    fetchTeamBadges(teamId)
  ]);

  if (teamRes.error || !teamRes.data) {
    appEl.innerHTML = `
      <div class="player-card-wrap">
        <div class="pc-locked card">
          <h2>Card unavailable</h2>
          <p class="muted">This team either doesn't exist or has no published matches yet.</p>
        </div>
      </div>`;
    return;
  }
  _cardState.team = teamRes.data;
  _cardState.lineups = lineupRes.data || [];
  _cardState.seasonsAvailable = availableSeasonsFromLineups(_cardState.lineups);
  // Default to the most recent season that has any played matches, else the
  // current season. Null fallback is fine — the stats aggregator treats null
  // as "all-time".
  _cardState.seasonYear = _cardState.seasonsAvailable[0] ?? computeCurrentSeasonStartYear();

  // Restore any cached unlocks from a previous visit on this device.
  const cachedIds = _loadCardUnlocks(teamId);
  if (cachedIds.length) {
    // Re-hydrate the player rows so we can still show the card after code-free revisit.
    // We can't fetch `players` directly (anon RLS excludes access_code/family_code,
    // but name/number/position/photo are public when the team has a published
    // lineup — same policy that lets the parent view render chips). Hit that path:
    const { data: pubPlayers } = await supabase
      .from('players')
      .select('id,name,number,position,photo_url')
      .eq('team_id', teamId)
      .in('id', cachedIds);
    if (pubPlayers && pubPlayers.length) {
      _cardState.players = pubPlayers;
      _cardState.selectedPlayerIdx = 0;
    }
  }

  renderPlayerCardBody();
}

function renderPlayerCardBody() {
  const { team, players, seasonsAvailable, seasonYear } = _cardState;
  const hasUnlocked = players && players.length > 0;

  if (!hasUnlocked) {
    appEl.innerHTML = `
      <div class="player-card-wrap">
        <div class="pc-locked card">
          <div class="pc-locked-head">
            <img src="logo.png" alt="" class="pc-locked-logo" />
            <div>
              <h2 style="margin:0">${escapeHtml(team.name || 'Team')}${ageGroupLabel(team) ? ' · ' + ageGroupLabel(team) : ''}</h2>
              <p class="muted" style="margin:0.25rem 0 0">Player card</p>
            </div>
          </div>
          <p style="margin:1rem 0 0.5rem">Enter your child's access code to unlock their card.</p>
          <div style="display:flex;gap:0.4rem">
            <input type="text" id="pc-code" placeholder="e.g. JE1234" autocomplete="off"
              style="flex:1;text-transform:uppercase;padding:0.55rem 0.65rem;border:1px solid var(--border);border-radius:6px;font-size:1rem" />
            <button type="button" class="primary" id="pc-unlock">Unlock</button>
          </div>
          <p class="muted" style="font-size:0.75rem;margin:0.45rem 0 0">Family codes work too (5 digits — unlocks all siblings).</p>
          <div id="pc-msg" class="error" style="min-height:1.1em;font-size:0.85rem;margin-top:0.5rem"></div>
        </div>
      </div>
    `;
    const codeEl = document.getElementById('pc-code');
    const unlockBtn = document.getElementById('pc-unlock');
    const msg = document.getElementById('pc-msg');
    setTimeout(() => codeEl?.focus(), 30);
    const doUnlock = async () => {
      msg.textContent = '';
      const code = (codeEl.value || '').trim();
      if (!code) { msg.textContent = 'Enter a code.'; return; }
      const { data, error } = await supabase.rpc('get_player_by_code', { p_team: _cardState.teamId, p_code: code });
      if (error) { msg.textContent = 'Lookup failed: ' + error.message; return; }
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) { msg.textContent = 'No player matched that code.'; return; }
      _cardState.players = list;
      _cardState.selectedPlayerIdx = 0;
      _saveCardUnlocks(_cardState.teamId, list.map(p => p.id));
      renderPlayerCardBody();
    };
    unlockBtn.onclick = doUnlock;
    codeEl.onkeydown = (e) => { if (e.key === 'Enter') doUnlock(); };
    return;
  }

  // Unlocked — render the FIFA-style card for the selected sibling.
  const idx = Math.min(_cardState.selectedPlayerIdx, players.length - 1);
  const p = players[idx];
  const stats = computePlayerStats(p.id, _cardState.lineups, seasonYear);
  const seasonIdx = seasonsAvailable.indexOf(seasonYear);
  const hasPrev = seasonIdx >= 0 && seasonIdx < seasonsAvailable.length - 1;
  const hasNext = seasonIdx > 0;

  // Family-code sibling switcher chips — only shown when >1 sibling unlocked.
  const siblingsHtml = players.length > 1
    ? `<div class="pc-siblings">
         ${players.map((pl, i) => `
           <button type="button" class="pc-sibling ${i === idx ? 'active' : ''}" data-sib-idx="${i}">
             #${pl.number != null ? pl.number : '?'} ${escapeHtml(shortName(pl.name))}
           </button>`).join('')}
       </div>`
    : '';

  const pos = p.position || '—';
  const num = p.number != null ? p.number : '—';
  const photoStyle = p.photo_url
    ? `background-image:url('${escapeHtml(p.photo_url)}');`
    : '';

  const ss = escapeHtml(String(num));
  const seasonText = seasonYear != null
    ? seasonLabelForYear(seasonYear)
    : 'All-time';
  const ageTag = ageGroupLabel(team);

  // Earned badges for this sibling, filtered to the selected season. Falls
  // back to an empty list if the player_badges migration hasn't been run yet.
  // We GROUP by badge_key so multiple awards of the same badge (e.g. Fair Play
  // x2) render as a single stacked chip with a count pill in the corner. The
  // cache is sorted DESC by awarded_at so group.latest is always the newest.
  const allPlayerBadges = badgesForPlayer(team.id, p.id, seasonYear);
  const groupsByKey = new Map();
  for (const b of allPlayerBadges) {
    if (!groupsByKey.has(b.badge_key)) {
      groupsByKey.set(b.badge_key, { key: b.badge_key, items: [b], latest: b });
    } else {
      const g = groupsByKey.get(b.badge_key);
      g.items.push(b);
      // cache is already sorted DESC but be defensive in case of mixed fetches
      if (!g.latest || (b.awarded_at > g.latest.awarded_at)) g.latest = b;
    }
  }
  const badgeGroups = Array.from(groupsByKey.values());
  const groupsToShow = badgeGroups.slice(0, CARD_BADGES_MAX);
  const overflowCount = Math.max(0, badgeGroups.length - CARD_BADGES_MAX);
  const badgesRowHtml = badgeGroups.length === 0
    ? ''
    : `
      <div class="pc-badges-row" aria-label="Earned badges">
        ${groupsToShow.map(g => {
          const e = badgeEntry(g.key);
          const name = e ? e.name : g.key;
          const count = g.items.length;
          const latest = g.latest;
          // Tooltip shows name + optional latest coach note, plus a "×N" hint
          // when the badge has been earned more than once.
          const suffix = count > 1 ? ` (×${count})` : '';
          const tip = latest?.note ? `${name}${suffix} — ${latest.note}` : `${name}${suffix}`;
          const stackClass = count > 1 ? ' has-stack' : '';
          const countPill = count > 1
            ? `<span class="pc-badge-count" aria-label="${count} times">×${count}</span>`
            : '';
          // We pass the LATEST badge's id on data-badge-id so the click still
          // opens a detail sheet; that sheet now renders the full stack list
          // when the group has multiple items.
          return `<button type="button" class="pc-badge-chip${stackClass}" data-badge-id="${escapeHtml(latest.id)}" data-badge-key="${escapeHtml(g.key)}" aria-label="${escapeHtml(name)}${count > 1 ? ' (' + count + ' times)' : ''}" title="${escapeHtml(tip)}"><span class="pc-badge-emoji">${badgeEmoji(g.key)}</span>${countPill}</button>`;
        }).join('')}
        ${overflowCount > 0
          ? `<button type="button" class="pc-badge-more" data-badges-see-all aria-label="See all badges" title="See all ${badgeGroups.length} badges">+${overflowCount}</button>`
          : (badgeGroups.length > 4
              ? `<button type="button" class="pc-badge-more" data-badges-see-all aria-label="See all badges" title="See all badges">All</button>`
              : '')}
      </div>`;

  appEl.innerHTML = `
    <div class="player-card-wrap">
      <div class="pc-topline">
        <img src="logo.png" alt="" class="pc-topline-logo" />
        <div class="pc-topline-txt">
          <div class="pc-topline-team">${escapeHtml(team.name || 'Team')}${ageTag ? ' · ' + ageTag : ''}</div>
          <div class="pc-topline-sub muted">Season stats</div>
        </div>
        <button type="button" class="btn-secondary pc-forget" id="pc-forget" title="Forget this device">Forget</button>
      </div>

      ${siblingsHtml}

      <div class="pc-season-row">
        <button type="button" class="pc-arrow" id="pc-prev-season" ${hasPrev ? '' : 'disabled'} aria-label="Previous season">‹</button>
        <div class="pc-season-label">${seasonText}${ageTag ? ' · ' + ageTag : ''}</div>
        <button type="button" class="pc-arrow" id="pc-next-season" ${hasNext ? '' : 'disabled'} aria-label="Next season">›</button>
      </div>

      <div class="pc-card-shell">
        <div class="pc-card">
          <!-- Background is the GOLD_FIFA_22.png template; everything below is
               absolutely-positioned overlay. -->
          <div class="pc-num-col">
            <div class="pc-num">${ss}</div>
            <div class="pc-pos">${escapeHtml(pos)}</div>
            <div class="pc-crest" aria-hidden="true">
              <img src="logo.png" alt="" />
            </div>
          </div>
          <div class="pc-photo ${p.photo_url ? 'has-photo' : ''}" style="${photoStyle}">
            ${p.photo_url ? '' : '<span class="pc-photo-letter">' + escapeHtml((p.name?.[0] || '?').toUpperCase()) + '</span>'}
          </div>
          <div class="pc-name">${escapeHtml(p.name || '—')}</div>
          <div class="pc-stats-grid">
            <div class="pc-stat"><span class="pc-stat-val">${stats.goals}</span><span class="pc-stat-lbl">Goals</span></div>
            <div class="pc-stat"><span class="pc-stat-val">${stats.motm}</span><span class="pc-stat-lbl">MOTM</span></div>
            <div class="pc-stat"><span class="pc-stat-val">${stats.starts}</span><span class="pc-stat-lbl">Starts</span></div>
            <div class="pc-stat"><span class="pc-stat-val">${stats.bench}</span><span class="pc-stat-lbl">Subs</span></div>
            <div class="pc-stat"><span class="pc-stat-val">${stats.apps}</span><span class="pc-stat-lbl">Apps</span></div>
            <div class="pc-stat"><span class="pc-stat-val">${stats.wins}-${stats.draws}-${stats.losses}</span><span class="pc-stat-lbl">W-D-L</span></div>
          </div>
        </div>
        ${badgesRowHtml}
      </div>

      ${seasonsAvailable.length === 0
        ? '<p class="muted" style="text-align:center;margin-top:0.75rem">No played matches yet this season.</p>'
        : ''}
    </div>
  `;

  // Season arrows
  const prevBtn = document.getElementById('pc-prev-season');
  const nextBtn = document.getElementById('pc-next-season');
  if (prevBtn) prevBtn.onclick = () => {
    const i = _cardState.seasonsAvailable.indexOf(_cardState.seasonYear);
    if (i < _cardState.seasonsAvailable.length - 1) {
      _cardState.seasonYear = _cardState.seasonsAvailable[i + 1];
      renderPlayerCardBody();
    }
  };
  if (nextBtn) nextBtn.onclick = () => {
    const i = _cardState.seasonsAvailable.indexOf(_cardState.seasonYear);
    if (i > 0) {
      _cardState.seasonYear = _cardState.seasonsAvailable[i - 1];
      renderPlayerCardBody();
    }
  };

  // Sibling switcher
  document.querySelectorAll('[data-sib-idx]').forEach(btn => {
    btn.onclick = () => {
      _cardState.selectedPlayerIdx = parseInt(btn.dataset.sibIdx, 10) || 0;
      renderPlayerCardBody();
    };
  });

  // Forget this device
  const forgetBtn = document.getElementById('pc-forget');
  if (forgetBtn) forgetBtn.onclick = () => {
    if (!confirm('Forget the unlocked players on this device? Next time you visit, you\'ll need to enter the access code again.')) return;
    _clearCardUnlocks(_cardState.teamId);
    _cardState.players = [];
    _cardState.selectedPlayerIdx = 0;
    renderPlayerCardBody();
  };

  // Badge chip tap → bottom-sheet detail. "See all" → full grid. Both are
  // read-only views — no admin controls on the public card (parents/kids only).
  // Stacked chips pass the whole group so the sheet can list every award.
  document.querySelectorAll('.pc-badge-chip[data-badge-key]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.badgeKey;
      const group = groupsByKey.get(key);
      if (group) openBadgeDetailSheet(group.latest, group);
    };
  });
  const seeAllBtn = document.querySelector('[data-badges-see-all]');
  if (seeAllBtn) seeAllBtn.onclick = () => openBadgesGridModal(badgeGroups, p);
}

// ---------- Public training view (#/train/{team_id}) ----------
// Permanent rolling parent link. Always shows the next upcoming training
// session (flips to next week 1h after end time). Parents unlock with the
// existing kid / family access code — same mechanism as the availability
// flow, just keyed by team rather than lineup.
async function renderTrainingPublicView(teamId) {
  if (!teamId) {
    appEl.innerHTML = `<div class="card"><p class="error">Team id missing from URL.</p></div>`;
    return;
  }
  document.body.classList.add('parent-view-active');
  appEl.innerHTML = `<p class="loading">Loading training…</p>`;

  // Fetch team (tolerant of training_schedule column not existing yet — returns
  // the minimal shape and we'll show "not set up" below).
  let teamRes = await supabase
    .from('teams')
    .select('id,name,training_schedule,home_ground_name,home_ground_postcode')
    .eq('id', teamId).maybeSingle();
  if (teamRes.error && /training_schedule/i.test(teamRes.error.message || '')) {
    teamRes = await supabase
      .from('teams')
      .select('id,name,home_ground_name,home_ground_postcode')
      .eq('id', teamId).maybeSingle();
  }
  if (teamRes.error || !teamRes.data) {
    appEl.innerHTML = `
      <div class="pv-wrap">
        <div class="pv-card"><h2>Training unavailable</h2>
        <p class="muted">We couldn't find that team.</p></div>
      </div>`;
    return;
  }
  const team = teamRes.data;
  const slots = parseTrainingSchedule(team);

  if (!slots.length) {
    appEl.innerHTML = `
      <div class="pv-wrap">
        <div class="pv-card">
          <h2>${escapeHtml(team.name || 'Team')} — Training</h2>
          <p class="muted">The coach hasn't set up a weekly training schedule yet. Check back soon.</p>
        </div>
      </div>`;
    return;
  }

  // Resolve the next upcoming session locally (slot + date).
  const next = nextUpcomingTraining(team);
  if (!next) {
    appEl.innerHTML = `
      <div class="pv-wrap">
        <div class="pv-card">
          <h2>${escapeHtml(team.name || 'Team')} — Training</h2>
          <p class="muted">No upcoming training session could be resolved from the schedule.</p>
        </div>
      </div>`;
    return;
  }
  const dateStr = toLocalDateStr(next.date);

  // Ensure a concrete training_sessions row exists for that date via the
  // security-definer RPC. Falls back gracefully to a virtual session if the
  // RPC isn't in place yet — in that case attendance can't be saved, but the
  // page still renders usefully for parents.
  let session = null;
  let sessionRpcFailed = false;
  {
    const { data, error } = await supabase.rpc('ensure_training_session', {
      p_team_id: team.id,
      p_date:    dateStr
    });
    if (error) {
      sessionRpcFailed = true;
      console.warn('ensure_training_session failed:', error.message);
    } else if (data) {
      // RPC returns a row (or an array of one row depending on driver).
      session = Array.isArray(data) ? data[0] : data;
    }
  }

  // If the coach has cancelled or rescheduled this week's session, apply
  // overrides from the row (session.status / session.scheduled_start/end /
  // session.location).
  const effectiveSlot = {
    day: next.slot.day,
    start: session?.scheduled_start || next.slot.start,
    end:   session?.scheduled_end   || next.slot.end,
    location: session?.location ?? next.slot.location ?? team.home_ground_name ?? ''
  };
  const cancelled = session && session.status === 'cancelled';

  // Load unlocked player IDs for this team (localStorage). If none, show code entry.
  const unlockedIds = getUnlockedPlayers(team.id);
  let unlockedPlayers = [];
  let existingAttendance = {}; // { player_id: { intent, note } }
  if (unlockedIds.length) {
    const { data: pubPlayers } = await supabase
      .from('players')
      .select('id,name,number,position,photo_url')
      .eq('team_id', team.id)
      .in('id', unlockedIds);
    unlockedPlayers = (pubPlayers || []).sort((a, b) => {
      const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
      if (na !== nb) return na - nb;
      return (a.name || '').localeCompare(b.name || '');
    });
    if (session?.id && unlockedPlayers.length) {
      const { data: att } = await supabase
        .from('training_attendance')
        .select('player_id,intent,note,responded_by')
        .eq('session_id', session.id)
        .in('player_id', unlockedPlayers.map(p => p.id));
      (att || []).forEach(r => { existingAttendance[r.player_id] = r; });
    }
  }

  // Build the page.
  const header = `
    <div class="pv-card">
      <h2 style="margin:0 0 0.25rem">${escapeHtml(team.name || 'Team')} — Training</h2>
      <p class="muted" style="margin:0">${fmtTrainingHeader(next.date, effectiveSlot)}</p>
      ${effectiveSlot.location ? `<p class="muted" style="margin:0.3rem 0 0">📍 ${escapeHtml(effectiveSlot.location)}</p>` : ''}
      ${cancelled ? `<p class="error" style="margin:0.5rem 0 0"><strong>⚠ This session has been cancelled.</strong>${session?.notes ? ' ' + escapeHtml(session.notes) : ''}</p>` : ''}
      ${(session?.status === 'moved' || (session && (session.scheduled_start !== next.slot.start || session.scheduled_end !== next.slot.end))) && !cancelled ? `<p class="muted" style="margin:0.4rem 0 0">ℹ Moved from the usual time — new details above.</p>` : ''}
    </div>`;

  const intentBtn = (pid, value, label, emoji, activeVal) => `
    <button type="button" class="train-intent-btn" data-player="${pid}" data-intent="${value}"
      style="flex:1;padding:0.5rem 0.3rem;border:1px solid ${activeVal === value ? '#2a7' : '#ccc'};background:${activeVal === value ? '#2a7' : '#fff'};color:${activeVal === value ? '#fff' : '#333'};font-size:0.8rem;cursor:pointer;border-radius:6px">
      ${emoji} ${label}
    </button>`;

  const playerRowsHtml = unlockedPlayers.map(p => {
    const cur = existingAttendance[p.id];
    const photoHtml = p.photo_url
      ? `<div class="avail-photo" style="width:36px;height:36px;border-radius:50%;background:#eee center/cover no-repeat url('${escapeHtml(p.photo_url)}');flex-shrink:0"></div>`
      : `<div class="avail-photo" style="width:36px;height:36px;border-radius:50%;background:#e6e6e6;display:flex;align-items:center;justify-content:center;font-weight:600;color:#666;flex-shrink:0">${escapeHtml(String(p.number || ''))}</div>`;
    const lastLine = cur
      ? `<div class="muted" style="font-size:0.7rem;margin-top:0.15rem">Last response: ${cur.intent}${cur.responded_by ? ' — ' + escapeHtml(cur.responded_by) : ''}</div>`
      : `<div class="muted" style="font-size:0.7rem;margin-top:0.15rem">No response yet</div>`;
    return `
      <div class="avail-row" data-train-row="${p.id}" style="padding:0.6rem 0;border-top:1px solid #eee">
        <div style="display:flex;gap:0.6rem;align-items:center">
          ${photoHtml}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</div>
            ${lastLine}
          </div>
        </div>
        <div style="display:flex;gap:0.35rem;margin-top:0.5rem">
          ${intentBtn(p.id, 'available',   'Available',   '✅', cur?.intent)}
          ${intentBtn(p.id, 'maybe',       'Maybe',       '🤔', cur?.intent)}
          ${intentBtn(p.id, 'unavailable', 'Unavailable', '❌', cur?.intent)}
        </div>
        <input type="text" class="train-note" data-train-note="${p.id}" value="${escapeHtml(cur?.note || '')}"
          placeholder="Optional note"
          style="margin-top:0.4rem;width:100%;padding:0.4rem;font-size:0.8rem;border:1px solid #ddd;border-radius:4px" />
      </div>`;
  }).join('');

  const rememberedName = (() => { try { return localStorage.getItem('pv_responder_name') || ''; } catch { return ''; } })();

  const attendanceCard = cancelled ? '' : `
    <div class="pv-card">
      <h3 class="pv-card-title" style="margin-top:0">Let the coach know</h3>
      <p class="muted" style="font-size:0.85rem;margin-top:0">Mark whether your child will be at this training session. You can update this right up to the session.</p>
      ${unlockedPlayers.length ? `
        <label style="font-size:0.75rem;margin-top:0.5rem;display:block">Your name (optional)</label>
        <input type="text" id="train-responder" value="${escapeHtml(rememberedName)}" placeholder="e.g. Sarah (Alex's mum)"
          style="width:100%;padding:0.45rem;font-size:0.9rem;border:1px solid #ddd;border-radius:4px" />
        <div id="train-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.35rem"></div>
        <div id="train-list" style="margin-top:0.5rem">${playerRowsHtml}</div>
        ${sessionRpcFailed ? `<p class="error" style="font-size:0.75rem;margin-top:0.4rem">⚠ Saving attendance isn't available yet — the coach needs to finish the Slice 8 database setup.</p>` : ''}
        <button type="button" id="train-forget" class="btn-secondary" style="font-size:0.75rem;padding:0.3rem 0.55rem;margin-top:0.5rem">Forget this device</button>
      ` : ''}
      <div id="train-code-box" style="margin-top:0.6rem;padding:0.6rem 0.7rem;background:#f5f7fa;border:1px solid #e3e7ee;border-radius:6px">
        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.25rem">${unlockedPlayers.length ? 'Add another child' : 'Enter your child\u2019s code'}</label>
        <p class="muted" style="font-size:0.75rem;margin:0 0 0.4rem">The coach can read your code from the player card. A 5-digit family code unlocks all linked siblings at once.</p>
        <div style="display:flex;gap:0.4rem">
          <input type="text" id="train-code-input" placeholder="e.g. JE1234 or 12345" autocapitalize="characters" autocorrect="off" spellcheck="false"
            style="flex:1;padding:0.5rem;font-size:0.95rem;border:1px solid #ccc;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:uppercase" />
          <button type="button" class="primary" id="train-code-submit" style="padding:0.5rem 0.9rem">Unlock</button>
        </div>
        <div id="train-code-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.3rem"></div>
      </div>
    </div>`;

  appEl.innerHTML = `
    <div class="pv-wrap">
      ${header}
      ${attendanceCard}
    </div>`;

  if (!cancelled) wireTrainingPublicView(team, session, unlockedPlayers, existingAttendance);
}

function wireTrainingPublicView(team, session, unlockedPlayers, existingAttendance) {
  const msgEl = document.getElementById('train-msg');
  const responderEl = document.getElementById('train-responder');
  const flash = (txt, cls = 'muted') => {
    if (!msgEl) return;
    msgEl.textContent = txt; msgEl.className = cls;
    setTimeout(() => { if (msgEl.textContent === txt) { msgEl.textContent = ''; msgEl.className = 'muted'; } }, 2500);
  };

  const codesByPlayer = (() => {
    try { return JSON.parse(localStorage.getItem('pv_codes_' + team.id) || '{}'); } catch { return {}; }
  })();

  const submit = async (playerId, intent) => {
    if (!session?.id) { flash('Training session not ready — please refresh.', 'error'); return; }
    const responderName = (responderEl?.value || '').trim();
    if (responderName) {
      try { localStorage.setItem('pv_responder_name', responderName); } catch {}
    }
    const noteEl = document.querySelector(`[data-train-note="${playerId}"]`);
    const note = (noteEl?.value || '').trim() || null;
    const code = codesByPlayer[playerId];
    if (!code) { flash('No code stored for this player. Re-enter it below.', 'error'); return; }

    const { error } = await supabase.rpc('submit_training_intent', {
      p_session_id: session.id,
      p_player_id:  playerId,
      p_code:       code,
      p_intent:     intent,
      p_note:       note,
      p_name:       responderName || null
    });
    if (error) { flash('Save failed: ' + error.message, 'error'); return; }

    existingAttendance[playerId] = { intent, note, responded_by: responderName || null };
    document.querySelectorAll(`.train-intent-btn[data-player="${playerId}"]`).forEach(btn => {
      const active = btn.dataset.intent === intent;
      btn.style.background = active ? '#2a7' : '#fff';
      btn.style.color = active ? '#fff' : '#333';
      btn.style.borderColor = active ? '#2a7' : '#ccc';
    });
    const row = document.querySelector(`[data-train-row="${playerId}"]`);
    const line = row?.querySelector('.muted');
    if (line) line.textContent = `Last response: ${intent}${responderName ? ' — ' + responderName : ''}`;
    flash('✓ Saved', 'ok');
  };

  document.querySelectorAll('.train-intent-btn').forEach(btn => {
    btn.addEventListener('click', () => submit(btn.dataset.player, btn.dataset.intent));
  });

  document.querySelectorAll('.train-note').forEach(inp => {
    inp.addEventListener('blur', async () => {
      const pid = inp.dataset.trainNote;
      const cur = existingAttendance[pid];
      if (!cur) return;
      const note = (inp.value || '').trim() || null;
      if ((cur.note || null) === note) return;
      const code = codesByPlayer[pid];
      if (!code || !session?.id) return;
      const responderName = (responderEl?.value || '').trim();
      const { error } = await supabase.rpc('submit_training_intent', {
        p_session_id: session.id, p_player_id: pid, p_code: code,
        p_intent: cur.intent, p_note: note, p_name: responderName || cur.responded_by || null
      });
      if (error) { flash('Note save failed: ' + error.message, 'error'); return; }
      cur.note = note;
      flash('✓ Note saved', 'ok');
    });
  });

  // Code-entry: unlock a player (or sibling group) on this device via the
  // existing get_player_by_code RPC (keyed by team, not lineup).
  const codeBtn = document.getElementById('train-code-submit');
  const codeInput = document.getElementById('train-code-input');
  const codeMsg = document.getElementById('train-code-msg');
  const tryUnlock = async () => {
    const raw = (codeInput?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    codeMsg.textContent = 'Checking…'; codeMsg.className = 'muted';
    const { data, error } = await supabase.rpc('get_player_by_code', {
      p_team: team.id,
      p_code: raw
    });
    if (error) { codeMsg.textContent = 'Check failed: ' + error.message; codeMsg.className = 'error'; return; }
    const arr = Array.isArray(data) ? data : (data ? [data] : []);
    if (!arr.length) { codeMsg.textContent = 'Code not recognised. Ask your coach.'; codeMsg.className = 'error'; return; }
    const matchedIds = arr.map(p => p.id);
    const matchedNames = arr.map(p => p.name);

    const currentUnlocked = new Set(getUnlockedPlayers(team.id));
    matchedIds.forEach(id => currentUnlocked.add(id));
    setUnlockedPlayers(team.id, [...currentUnlocked]);

    const codes = (() => { try { return JSON.parse(localStorage.getItem('pv_codes_' + team.id) || '{}'); } catch { return {}; } })();
    matchedIds.forEach(id => { codes[id] = raw; });
    try { localStorage.setItem('pv_codes_' + team.id, JSON.stringify(codes)); } catch {}

    codeMsg.textContent = `✓ Unlocked ${matchedNames.join(', ') || matchedIds.length + ' player(s)'}`; codeMsg.className = 'ok';
    setTimeout(() => location.reload(), 600);
  };
  if (codeBtn) codeBtn.addEventListener('click', tryUnlock);
  if (codeInput) codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });

  // Forget this device
  const forgetBtn = document.getElementById('train-forget');
  if (forgetBtn) {
    forgetBtn.addEventListener('click', () => {
      if (!confirm('Forget all unlocked players on this device? You will need to re-enter the code(s) next time.')) return;
      clearUnlockedPlayers(team.id);
      try { localStorage.removeItem('pv_codes_' + team.id); } catch {}
      try { localStorage.removeItem('pv_responder_name'); } catch {}
      location.reload();
    });
  }
}

// ---------- Badge view modals (public card — read-only) ----------
// Bottom-sheet detail for a single earned badge. Shows emoji + name + description
// + optional coach note (public per Chris's 2026-04-17 call) + awarded date.
// When `group` has more than one item, renders a stacked list — one row per
// award with its own date + note.
function openBadgeDetailSheet(badge, group) {
  const entry = badgeEntry(badge.badge_key);
  const name = entry?.name || badge.badge_key;
  const desc = entry?.description || '';
  const emoji = entry?.emoji || '🏅';
  const items = (group && Array.isArray(group.items) && group.items.length > 0) ? group.items : [badge];
  const count = items.length;

  // Stacked list (count > 1): one row per award with date + note. Ordered
  // newest-first, matching the cache's DESC sort.
  const stackRowsHtml = count > 1
    ? `<div class="pc-badge-stack-list">
         ${items.map((b, i) => `
           <div class="pc-badge-stack-row">
             <div class="pc-badge-stack-row-head">
               <span class="pc-badge-stack-idx">#${count - i}</span>
               <span class="muted" style="font-size:0.78rem">${escapeHtml(formatBadgeDate(b.awarded_at))}</span>
             </div>
             ${b.note ? `<div class="pc-badge-note" style="margin-top:0.35rem"><span class="pc-badge-note-label">Coach's note</span><p style="margin:0.1rem 0 0">${escapeHtml(b.note)}</p></div>` : ''}
           </div>
         `).join('')}
       </div>`
    : '';

  const headerDate = count > 1
    ? `Earned ${count} times`
    : escapeHtml(formatBadgeDate(badge.awarded_at));

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay pc-badge-sheet-overlay';
  overlay.innerHTML = `
    <div class="picker-modal pc-badge-sheet" role="dialog" aria-label="${escapeHtml(name)}">
      <div class="pc-badge-sheet-head">
        <div class="pc-badge-sheet-emoji" aria-hidden="true">${emoji}</div>
        <div class="pc-badge-sheet-title">
          <h3 style="margin:0 0 0.15rem">${escapeHtml(name)}${count > 1 ? ` <span class="pc-badge-sheet-count">×${count}</span>` : ''}</h3>
          <div class="muted" style="font-size:0.78rem">${headerDate}</div>
        </div>
        <button class="btn-secondary" data-close type="button" aria-label="Close">✕</button>
      </div>
      <div class="pc-badge-sheet-body">
        ${desc ? `<p style="margin:0.4rem 0 0.5rem">${escapeHtml(desc)}</p>` : ''}
        ${count === 1 && badge.note ? `<div class="pc-badge-note"><span class="pc-badge-note-label">Coach's note</span><p style="margin:0.1rem 0 0">${escapeHtml(badge.note)}</p></div>` : ''}
        ${stackRowsHtml}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// Full-grid modal of every badge this player has earned in the current season
// scope. Tapping a chip opens the detail sheet. `groups` is an array of
// `{ key, items, latest }` — the same shape used by the card chips — so that
// duplicate awards collapse into a single cell with a "×N" count pill.
// (Backward-compat: if called with flat `{ id, badge_key, ... }` rows it wraps
//  each into a pseudo-group of one.)
function openBadgesGridModal(groupsOrBadges, player) {
  const groups = (groupsOrBadges || []).map(x => {
    if (x && Array.isArray(x.items)) return x; // already a group
    return { key: x.badge_key, items: [x], latest: x };
  });
  const groupsByKey = new Map(groups.map(g => [g.key, g]));

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay pc-badge-grid-overlay';
  overlay.innerHTML = `
    <div class="picker-modal pc-badge-grid-modal" role="dialog" aria-label="All badges">
      <div class="picker-header">
        <strong>${escapeHtml(shortName(player?.name || ''))}'s badges</strong>
        <button class="btn-secondary" data-close type="button">✕</button>
      </div>
      <div class="picker-body" style="padding:0.6rem 0.8rem 1rem">
        ${groups.length === 0
          ? '<p class="muted">No badges yet.</p>'
          : `<div class="pc-badge-grid">
               ${groups.map(g => {
                 const e = badgeEntry(g.key);
                 const nm = e ? e.name : g.key;
                 const count = g.items.length;
                 const stackClass = count > 1 ? ' has-stack' : '';
                 const countPill = count > 1
                   ? `<span class="pc-badge-count" aria-label="${count} times">×${count}</span>`
                   : '';
                 return `<button type="button" class="pc-badge-grid-cell${stackClass}" data-badge-key="${escapeHtml(g.key)}" aria-label="${escapeHtml(nm)}${count > 1 ? ' (' + count + ' times)' : ''}">
                           <span class="pc-badge-grid-emoji">${badgeEmoji(g.key)}</span>
                           ${countPill}
                           <span class="pc-badge-grid-name">${escapeHtml(nm)}</span>
                         </button>`;
               }).join('')}
             </div>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-badge-key]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.badgeKey;
      const group = groupsByKey.get(key);
      if (group) openBadgeDetailSheet(group.latest, group);
    };
  });
}

// ---------- Badge award modal (coach-facing) ----------
// Searchable picker of manual-flavour badges, grouped by category. Tap a badge
// to select it, (optional) type a public-visible note, then Save to insert.
// Calls `onAwarded(newBadge)` once the row is persisted — the caller rerenders
// and optionally opens the WhatsApp share confirm prompt.
// lineupId (optional) attaches the award to a specific match — used by the
// post-match result wizard so 9b auto-derivations and UI filters can link
// awards to lineups.
function openAwardBadgeModal({ team, player, onAwarded, lineupId }) {
  const existing = document.querySelector('.badge-award-overlay');
  if (existing) existing.remove();

  // 9a shows MANUAL badges only. Auto badges appear in 9b once criteria run.
  // Group by category in the fixed order so the modal scrolls consistently.
  const manualByCat = {};
  for (const key of Object.keys(BADGE_CATALOG)) {
    const e = BADGE_CATALOG[key];
    if (e.flavour !== 'manual') continue;
    (manualByCat[e.category] = manualByCat[e.category] || []).push({ key, ...e });
  }

  let selectedKey = null;
  let searchText = '';

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay badge-award-overlay';
  overlay.innerHTML = `
    <div class="picker-modal badge-award-modal" role="dialog" aria-label="Award a badge">
      <div class="picker-header">
        <strong>Award a badge — ${escapeHtml(shortName(player.name || ''))}</strong>
        <button class="btn-secondary" data-close type="button">✕</button>
      </div>
      <div class="picker-body" style="padding:0.6rem 0.8rem 0.8rem">
        <input type="text" id="ba-search" placeholder="Search badges…" autocomplete="off"
          style="width:100%;padding:0.5rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-size:0.9rem" />
        <div id="ba-list" class="ba-list" style="margin-top:0.5rem;max-height:50vh;overflow-y:auto"></div>
        <div id="ba-selected-wrap" style="margin-top:0.6rem" hidden>
          <div id="ba-selected-head" style="font-size:0.85rem;margin-bottom:0.3rem"></div>
          <label style="font-size:0.78rem;color:#555">Why? (optional — shown on the public card)</label>
          <input type="text" id="ba-note" maxlength="140" placeholder="e.g. Screamer from 30 yards"
            style="width:100%;padding:0.45rem 0.55rem;border:1px solid var(--border);border-radius:6px;font-size:0.88rem" />
        </div>
        <div id="ba-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em;font-size:0.8rem"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem">
          <button class="btn-secondary" data-close type="button">Cancel</button>
          <button class="primary" id="ba-save" disabled>Award badge</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('#ba-list');
  const searchEl = overlay.querySelector('#ba-search');
  const selectedWrap = overlay.querySelector('#ba-selected-wrap');
  const selectedHead = overlay.querySelector('#ba-selected-head');
  const noteEl = overlay.querySelector('#ba-note');
  const saveBtn = overlay.querySelector('#ba-save');
  const msg = overlay.querySelector('#ba-msg');

  const renderList = () => {
    const q = searchText.trim().toLowerCase();
    const groupsHtml = BADGE_CATEGORY_ORDER
      .map(cat => {
        const items = (manualByCat[cat] || []).filter(b =>
          !q || b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
        );
        if (!items.length) return '';
        return `
          <div class="ba-group">
            <div class="ba-group-title">${BADGE_CATEGORY_LABELS[cat] || cat}</div>
            <div class="ba-group-body">
              ${items.map(b => `
                <button type="button" class="ba-item ${selectedKey === b.key ? 'selected' : ''}" data-badge-key="${escapeHtml(b.key)}">
                  <span class="ba-item-emoji">${b.emoji}</span>
                  <span class="ba-item-txt">
                    <span class="ba-item-name">${escapeHtml(b.name)}</span>
                    <span class="ba-item-desc muted">${escapeHtml(b.description)}</span>
                  </span>
                </button>
              `).join('')}
            </div>
          </div>`;
      })
      .join('');
    listEl.innerHTML = groupsHtml || '<p class="muted">No badges match that search.</p>';
    listEl.querySelectorAll('[data-badge-key]').forEach(btn => {
      btn.onclick = () => {
        selectedKey = btn.dataset.badgeKey;
        const e = badgeEntry(selectedKey);
        selectedHead.innerHTML = `Selected: <strong>${e.emoji} ${escapeHtml(e.name)}</strong> <span class="muted">— ${escapeHtml(e.description)}</span>`;
        selectedWrap.hidden = false;
        saveBtn.disabled = false;
        renderList();
      };
    });
  };

  renderList();
  setTimeout(() => searchEl.focus(), 30);

  searchEl.addEventListener('input', () => { searchText = searchEl.value; renderList(); });

  overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  saveBtn.onclick = async () => {
    if (!selectedKey) return;
    msg.textContent = 'Saving…'; msg.className = 'muted';
    saveBtn.disabled = true;
    try {
      const newBadge = await awardManualBadge({
        teamId: team.id,
        playerId: player.id,
        badgeKey: selectedKey,
        note: noteEl.value,
        lineupId: lineupId || null,
      });
      overlay.remove();
      if (onAwarded) onAwarded(newBadge);
    } catch (e) {
      msg.textContent = 'Save failed: ' + (e.message || e);
      msg.className = 'error';
      saveBtn.disabled = false;
    }
  };
}

// ---------- Post-award share confirm (WhatsApp) ----------
// Opens after a coach awards a new badge. Lets them send the "just earned X"
// message straight to the team chat with the card link + access code pre-filled.
// Declining just closes the dialog — the badge is already saved.
function openBadgeShareConfirm(team, player, badge) {
  const entry = badgeEntry(badge.badge_key);
  const emoji = entry?.emoji || '🏅';
  const name  = entry?.name  || badge.badge_key;

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay badge-share-confirm-overlay';
  overlay.innerHTML = `
    <div class="picker-modal" role="dialog" aria-label="Share new badge">
      <div class="picker-header">
        <strong>🎉 ${escapeHtml(shortName(player.name || ''))} earned ${emoji} ${escapeHtml(name)}</strong>
      </div>
      <div class="picker-body" style="padding:0.8rem">
        <p style="margin:0 0 0.75rem">Share this with the parents' WhatsApp?</p>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end">
          <button class="btn-secondary" data-close type="button">Not now</button>
          <button class="primary" id="bsc-share" type="button">💬 Share to WhatsApp</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#bsc-share').onclick = () => {
    const base = location.origin + location.pathname;
    const cardUrl = `${base}#/card/${team.id}`;
    const code = player.family_code || player.access_code || '—';
    const lines = [
      `🎉 ${shortName(player.name)} just earned a badge: ${emoji} ${name}!`,
      badge.note ? `"${badge.note}"` : '',
      '',
      `See the full card: ${cardUrl}`,
      `Access code: ${code}`,
    ].filter(Boolean);
    const text = lines.join('\n');
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener');
    close();
  };
}

// ---------- Parent / public view ----------
let _parentViewPoll = null;
let _parentViewLastHash = null;
// Registered once at module load so each renderParentView() call doesn't leak another listener.
// Holds the current lineup being shown so the handler can redraw on resize.
let _parentViewResizeLineup = null;
let _parentViewResizeShowPitch = false;
window.addEventListener('resize', () => {
  if (currentRoute().name === 'view' && _parentViewResizeShowPitch && _parentViewResizeLineup) {
    try { renderFixturePitch(_parentViewResizeLineup); } catch (e) { /* ignore */ }
  }
});
// Coach-side poll for live availability updates while the lineup editor is open on a
// match in availability/published status. Cleared whenever a different lineup loads,
// status drops to draft, or the user leaves the lineup editor entirely.
let _coachAvailabilityPoll = null;
let _coachAvailabilityPollLineupId = null;

async function renderParentView(lineupId, opts = {}) {
  // Hide the app's main header/sidebar/drawer on this public route so the
  // match-details page is the only thing on-screen — no admin chrome
  // leaking into a page meant for a parent. Same pattern as the public
  // player-card route. `render()` removes the class when navigating away.
  document.body.classList.add('parent-view-active');
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

  // Fetch team + players + custom formations (RLS allows read when team has a published lineup).
  // Explicit column list — never expose access_code / family_code to anon clients.
  // Also fetch team badges so applyMatchDecorations can overlay match-specific
  // awards on each chip — RLS allows anon SELECT via team_has_published_lineup.
  // Match cues + cue catalog populate caches so highlightMyChildrenOnPitch can
  // render each unlocked child's parent-visible focus cues in the Your Squad
  // card — anon SELECT on match_cues is gated to visibility='parent_visible'
  // by RLS, so coach-only cues never reach parent clients.
  const [teamRes, playersRes, formationsRes] = await Promise.all([
    supabase.from('teams').select('*').eq('id', lineup.team_id).maybeSingle(),
    supabase.from('players').select('id,team_id,name,number,position,photo_url').eq('team_id', lineup.team_id),
    supabase.from('formations').select('*').eq('team_id', lineup.team_id),
    fetchTeamBadges(lineup.team_id).catch(() => []),
    fetchMatchCues(lineup.team_id, lineup.id).catch(() => []),
    fetchCueCatalog().catch(() => ({}))
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
    pl: players.map(p => [p.id, p.name, p.number, p.position, p.photo_url]).sort()
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
  const viewMode = opts.mode === 'avail' ? 'avail' : 'match';
  // Show availability form only on the 'avail' route, and only when the lineup is collecting availability or already published
  const showAvailability = viewMode === 'avail' && (status === 'availability' || status === 'published');
  // Show pitch only on the 'match' route, and only when published
  const showPitch = viewMode === 'match' && status === 'published';
  // On the match page, if this device hasn't unlocked any children yet, show a code-entry box
  // so the parent can reveal the "your child is at X" banner here (mirrors the avail page).
  const pvUnlockedIdsForCode = showPitch ? (getUnlockedPlayers(lineup.team_id) || []) : [];
  const pvShowMatchCodeBox = showPitch && pvUnlockedIdsForCode.length === 0;

  // Fetch current availability responses (anon-readable) so we can prefill
  let availability = [];
  if (showAvailability) {
    const { data: avail } = await supabase
      .from('player_availability')
      .select('*')
      .eq('lineup_id', lineupId);
    availability = avail || [];
  }
  const availByPlayer = Object.fromEntries(availability.map(a => [a.player_id, a]));

  // Side column holds all the info/context panels: Match details, Your Squad
  // banner, Coach notes, Availability form and the match-code unlock box.
  // The main column holds ONLY the pitch. This groups all text/info
  // together so on desktop the pitch can breathe in its own column
  // without the info feeling disconnected from the match details card.
  // #pv-child-notice is injected into by highlightMyChildrenOnPitch after
  // the DOM renders — it just needs to exist somewhere on the page.
  const sideBlock = `
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
      ${lineup.game_date ? `<button id="pv-add-cal" class="btn-secondary" style="margin-top:0.6rem;width:100%;font-weight:500">📅 Add to calendar</button>` : ''}
    </div>

    ${showPitch ? `<div id="pv-child-notice"></div>` : ''}

    ${notes ? `
      <div class="pv-card">
        <h3 class="pv-card-title">Coach notes</h3>
        <p class="pv-notes">${escapeHtml(notes)}</p>
      </div>
    ` : ''}

    ${showAvailability ? renderAvailabilityFormHtml(lineup, players, availByPlayer) : ''}

    ${viewMode === 'avail' && status === 'draft' ? `
      <div class="pv-card"><p class="muted" style="margin:0">Availability isn't open yet — your coach will let you know when it is.</p></div>
    ` : ''}

    ${pvShowMatchCodeBox ? `
    <div class="pv-card" id="mv-code-card">
      <h3 class="pv-card-title">Is your child in the squad?</h3>
      <p class="muted" style="font-size:0.85rem;margin-top:0">Enter your child's access code to see which position they're playing today.</p>
      <div style="margin-top:0.4rem;display:flex;gap:0.4rem">
        <input type="text" id="mv-code-input" placeholder="e.g. JE1234 or 12345" autocapitalize="characters" autocorrect="off" spellcheck="false"
          style="flex:1;padding:0.5rem;font-size:0.95rem;border:1px solid #ccc;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:uppercase" />
        <button type="button" class="primary" id="mv-code-submit" style="padding:0.5rem 0.9rem">Unlock</button>
      </div>
      <div id="mv-code-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.3rem"></div>
    </div>` : ''}
  `;

  const mainBlock = `
    ${showPitch ? `
    <div class="pv-card">
      <h3 class="pv-card-title">Lineup</h3>
      <div class="card pitch-card" style="padding:0;border:none;box-shadow:none;margin:0;max-width:100%;width:100%;box-sizing:border-box">
        <div class="pitch" id="fix-pitch">
          <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
          <div class="slots-layer" id="fix-slots-layer"></div>
          <canvas class="tactics-canvas" id="fix-tactics"></canvas>
          <div class="ball-el" id="fix-ball" style="display:none"></div>
        </div>
        <div class="subs-bar">
          <div class="subs-label" id="fix-subs-label">SUBSTITUTES (0/${MAX_SUBS})</div>
          <div class="subs-row" id="fix-subs-row"></div>
        </div>
      </div>
      ${chipLegendHtml()}
    </div>` : ''}
  `;

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

      <div class="pv-body">
        <div class="pv-side">${sideBlock}</div>
        <div class="pv-main">${mainBlock}</div>
      </div>

      <div class="pv-footer">
        <button id="pv-refresh" class="btn-secondary" style="font-size:0.8rem">↻ Refresh</button>
        <div class="muted" style="margin-top:0.5rem;font-size:0.7rem">Auto-updates every 6s · Last loaded ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  `;

  if (showAvailability) {
    wireAvailabilityForm(lineup, players, availByPlayer);
  }
  if (showPitch) {
    renderFixturePitch(lineup);
    highlightMyChildrenOnPitch(lineup, players);
  }
  if (pvShowMatchCodeBox) {
    wireMatchPageUnlock(lineup, players);
  }

  document.getElementById('pv-refresh')?.addEventListener('click', () => {
    _parentViewLastHash = null;
    renderParentView(lineupId, { mode: viewMode });
  });

  document.getElementById('pv-add-cal')?.addEventListener('click', () => {
    // Build a minimal "current" shape from the parent-view lineup record for the ICS helper.
    downloadLineupIcs({
      game_date: lineup.game_date,
      kickoff_time: lineup.kickoff_time,
      arrival_time: lineup.arrival_time,
      opponent: lineup.opponent,
      home_away: lineup.home_away,
      location_name: venue.name,
      location_postcode: venue.postcode,
      location_lat: venue.lat,
      location_lng: venue.lng,
      notes: lineup.notes
    }, { name: teamName }, lineup.id);
  });

  // Re-draw on resize so tactics canvas stays crisp.
  // The listener is registered once at module init; here we just update what it should redraw.
  _parentViewResizeLineup = lineup;
  _parentViewResizeShowPitch = !!showPitch;

  // Start polling (only on first / non-poll render)
  if (!opts.fromPoll && !_parentViewPoll) {
    _parentViewPoll = setInterval(() => {
      if (currentRoute().name !== 'view') {
        clearInterval(_parentViewPoll); _parentViewPoll = null; return;
      }
      renderParentView(lineupId, { fromPoll: true, mode: viewMode }).catch(e => console.warn('poll failed', e));
    }, 6000);
  }
}

// ---------- Parent availability form ----------
// ---------- Parent device unlocks (per team, in localStorage) ----------
function _unlockKey(teamId) { return `pv_unlocked_${teamId}`; }
function getUnlockedPlayers(teamId) {
  try {
    const raw = localStorage.getItem(_unlockKey(teamId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function setUnlockedPlayers(teamId, ids) {
  try { localStorage.setItem(_unlockKey(teamId), JSON.stringify(ids)); } catch {}
}
function clearUnlockedPlayers(teamId) {
  try { localStorage.removeItem(_unlockKey(teamId)); } catch {}
}

function renderAvailabilityFormHtml(lineup, players, availByPlayer) {
  const sorted = [...players].sort((a, b) => {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });
  const rememberedName = (() => {
    try { return localStorage.getItem('pv_responder_name') || ''; } catch { return ''; }
  })();
  const unlockedIds = getUnlockedPlayers(lineup.team_id);
  const unlockedSet = new Set(unlockedIds);
  const unlockedPlayers = sorted.filter(p => unlockedSet.has(p.id));
  const statusBtn = (pid, value, label, emoji) => {
    const cur = availByPlayer[pid];
    const active = cur && cur.status === value;
    return `<button type="button" class="avail-btn" data-player="${pid}" data-status="${value}"
      style="flex:1;padding:0.5rem 0.3rem;border:1px solid ${active ? '#2a7' : '#ccc'};background:${active ? '#2a7' : '#fff'};color:${active ? '#fff' : '#333'};font-size:0.8rem;cursor:pointer;border-radius:6px">
      ${emoji} ${label}
    </button>`;
  };
  const rows = unlockedPlayers.map(p => {
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

  const codeBoxHtml = `
    <div id="avail-code-box" style="margin-top:0.6rem;padding:0.6rem 0.7rem;background:#f5f7fa;border:1px solid #e3e7ee;border-radius:6px">
      <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.25rem">${unlockedPlayers.length ? 'Add another child' : 'Enter your child\u2019s code'}</label>
      <p class="muted" style="font-size:0.75rem;margin:0 0 0.4rem">The coach can read your code from the player card. A 5-digit family code unlocks all linked siblings at once.</p>
      <div style="display:flex;gap:0.4rem">
        <input type="text" id="avail-code-input" placeholder="e.g. JE1234 or 12345" autocapitalize="characters" autocorrect="off" spellcheck="false"
          style="flex:1;padding:0.5rem;font-size:0.95rem;border:1px solid #ccc;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:uppercase" />
        <button type="button" class="primary" id="avail-code-submit" style="padding:0.5rem 0.9rem">Unlock</button>
      </div>
      <div id="avail-code-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.3rem"></div>
    </div>`;

  const forgetBtnHtml = unlockedPlayers.length
    ? `<button type="button" id="avail-forget" class="btn-secondary" style="font-size:0.75rem;padding:0.3rem 0.55rem;margin-top:0.5rem">Forget this device</button>`
    : '';

  return `
    <div class="pv-card">
      <h3 class="pv-card-title">Availability check</h3>
      <p class="muted" style="font-size:0.85rem;margin-top:0">Please mark availability for your player(s) for this match. The coach will use these responses to pick the squad.</p>
      ${unlockedPlayers.length ? `
        <label style="font-size:0.75rem;margin-top:0.5rem;display:block">Your name (optional)</label>
        <input type="text" id="avail-responder" value="${escapeHtml(rememberedName)}" placeholder="e.g. Sarah (Alex's mum)"
          style="width:100%;padding:0.45rem;font-size:0.9rem;border:1px solid #ddd;border-radius:4px" />
        <div id="avail-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.35rem"></div>
        <div id="avail-list" style="margin-top:0.5rem">${rows}</div>
        ${forgetBtnHtml}
      ` : ''}
      ${codeBoxHtml}
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

  // Pick a code that this player accepts (we stored the code on initial unlock).
  // We reuse the most recent code the parent typed; falls back to scanning all stored codes.
  const codesByPlayer = (() => {
    try { return JSON.parse(localStorage.getItem('pv_codes_' + lineup.team_id) || '{}'); } catch { return {}; }
  })();

  const submit = async (playerId, status) => {
    const responderName = (responderEl?.value || '').trim();
    if (responderName) {
      try { localStorage.setItem('pv_responder_name', responderName); } catch {}
    }
    const noteEl = document.querySelector(`[data-player-note="${playerId}"]`);
    const note = (noteEl?.value || '').trim() || null;
    const code = codesByPlayer[playerId];
    if (!code) { flash('No code stored for this player. Re-enter it below.', 'error'); return; }

    const { error } = await supabase.rpc('submit_player_availability', {
      p_lineup_id: lineup.id,
      p_player_id: playerId,
      p_code:      code,
      p_status:    status,
      p_note:      note,
      p_name:      responderName || null
    });
    if (error) { flash('Save failed: ' + error.message, 'error'); return; }

    availByPlayer[playerId] = {
      lineup_id: lineup.id, player_id: playerId, status, note,
      responded_by: responderName || null, responded_at: new Date().toISOString()
    };
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

  // Save note on blur if a status exists — re-submits via RPC with current status.
  document.querySelectorAll('.avail-note').forEach(inp => {
    inp.addEventListener('blur', async () => {
      const pid = inp.dataset.playerNote;
      const cur = availByPlayer[pid];
      if (!cur) return;
      const note = (inp.value || '').trim() || null;
      if ((cur.note || null) === note) return;
      const code = codesByPlayer[pid];
      if (!code) return;
      const responderName = (responderEl?.value || '').trim();
      const { error } = await supabase.rpc('submit_player_availability', {
        p_lineup_id: lineup.id, p_player_id: pid, p_code: code,
        p_status: cur.status, p_note: note, p_name: responderName || cur.responded_by || null
      });
      if (error) { flash('Note save failed: ' + error.message, 'error'); return; }
      cur.note = note;
      flash('✓ Note saved', 'ok');
    });
  });

  // Code-entry: unlock a player (or sibling group) on this device
  const codeBtn = document.getElementById('avail-code-submit');
  const codeInput = document.getElementById('avail-code-input');
  const codeMsg = document.getElementById('avail-code-msg');
  const tryUnlock = async () => {
    const raw = (codeInput?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    codeMsg.textContent = 'Checking…'; codeMsg.className = 'muted';
    const { data, error } = await supabase.rpc('validate_player_code', {
      p_lineup_id: lineup.id,
      p_code:      raw
    });
    if (error) { codeMsg.textContent = 'Check failed: ' + error.message; codeMsg.className = 'error'; return; }
    const matchedIds = (data || []).map(r => r.player_id || r); // RPC returns rows with player_id
    if (!matchedIds.length) { codeMsg.textContent = 'Code not recognised. Ask your coach.'; codeMsg.className = 'error'; return; }
    const matchedNames = players.filter(p => matchedIds.includes(p.id)).map(p => p.name);

    const currentUnlocked = new Set(getUnlockedPlayers(lineup.team_id));
    matchedIds.forEach(id => currentUnlocked.add(id));
    setUnlockedPlayers(lineup.team_id, [...currentUnlocked]);

    const codes = (() => { try { return JSON.parse(localStorage.getItem('pv_codes_' + lineup.team_id) || '{}'); } catch { return {}; } })();
    matchedIds.forEach(id => { codes[id] = raw; });
    try { localStorage.setItem('pv_codes_' + lineup.team_id, JSON.stringify(codes)); } catch {}

    codeMsg.textContent = `✓ Unlocked ${matchedNames.join(', ') || matchedIds.length + ' player(s)'}`; codeMsg.className = 'ok';
    setTimeout(() => location.reload(), 600);
  };
  if (codeBtn) codeBtn.addEventListener('click', tryUnlock);
  if (codeInput) codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });

  // Forget this device
  const forgetBtn = document.getElementById('avail-forget');
  if (forgetBtn) {
    forgetBtn.addEventListener('click', () => {
      if (!confirm('Forget all unlocked players on this device? You will need to re-enter the code(s) next time.')) return;
      clearUnlockedPlayers(lineup.team_id);
      try { localStorage.removeItem('pv_codes_' + lineup.team_id); } catch {}
      try { localStorage.removeItem('pv_responder_name'); } catch {}
      location.reload();
    });
  }
}

// ---------- Match-page parent unlock (same cookie as avail page) ----------
// If a parent opens a match link directly and hasn't unlocked on this device yet,
// we show a small code-entry card (mv-code-*). On successful unlock we reload
// the page so the full "your child is at X" banner renders via highlightMyChildrenOnPitch.
function wireMatchPageUnlock(lineup, players) {
  const btn = document.getElementById('mv-code-submit');
  const input = document.getElementById('mv-code-input');
  const msg = document.getElementById('mv-code-msg');
  if (!btn || !input || !msg) return;
  const tryUnlock = async () => {
    const raw = (input.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    msg.textContent = 'Checking…'; msg.className = 'muted';
    const { data, error } = await supabase.rpc('validate_player_code', {
      p_lineup_id: lineup.id,
      p_code:      raw
    });
    if (error) { msg.textContent = 'Check failed: ' + error.message; msg.className = 'error'; return; }
    const matchedIds = (data || []).map(r => r.player_id || r);
    if (!matchedIds.length) { msg.textContent = 'Code not recognised. Ask your coach.'; msg.className = 'error'; return; }
    const matchedNames = players.filter(p => matchedIds.includes(p.id)).map(p => p.name);

    // Persist to the same cookie/localStorage the avail page uses
    const currentUnlocked = new Set(getUnlockedPlayers(lineup.team_id));
    matchedIds.forEach(id => currentUnlocked.add(id));
    setUnlockedPlayers(lineup.team_id, [...currentUnlocked]);

    // Remember the code per player so future availability submissions still work
    const codes = (() => { try { return JSON.parse(localStorage.getItem('pv_codes_' + lineup.team_id) || '{}'); } catch { return {}; } })();
    matchedIds.forEach(id => { codes[id] = raw; });
    try { localStorage.setItem('pv_codes_' + lineup.team_id, JSON.stringify(codes)); } catch {}

    msg.textContent = `✓ Unlocked ${matchedNames.join(', ') || matchedIds.length + ' player(s)'}`; msg.className = 'ok';
    setTimeout(() => location.reload(), 600);
  };
  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });
}

// ---------- Coach availability responses panel (button + modal) ----------
async function renderCoachAvailabilityPanel(opts = {}) {
  const containerId = opts.containerId || 'availability-panel';
  const lineupId = opts.lineupId || editor?.current?.id;
  const panelEl = document.getElementById(containerId);
  if (!panelEl || !lineupId) return;
  // Fetch just for the tally so the button shows a meaningful summary.
  const { data: avail, error } = await supabase
    .from('player_availability')
    .select('player_id,status')
    .eq('lineup_id', lineupId);
  if (error) { panelEl.innerHTML = `<div class="error" style="font-size:0.75rem">${escapeHtml(error.message)}</div>`; return; }
  const byPlayer = Object.fromEntries((avail || []).map(a => [a.player_id, a]));
  const players = (editor.players || []);
  const tally = { available: 0, maybe: 0, unavailable: 0, none: 0 };
  players.forEach(p => {
    const s = byPlayer[p.id]?.status;
    if (s === 'available' || s === 'maybe' || s === 'unavailable') tally[s]++;
    else tally.none++;
  });
  panelEl.innerHTML = `
    <button type="button" class="btn-full" id="${containerId}-open" style="text-align:left;padding:0.5rem 0.6rem;font-size:0.85rem;margin-bottom:0">
      📋 Availability responses — ✅ ${tally.available} · 🤔 ${tally.maybe} · ❌ ${tally.unavailable} · — ${tally.none}
    </button>`;
  panelEl.querySelector(`#${containerId}-open`).onclick = () => openAvailabilityModal(lineupId);
}

async function openAvailabilityModal(lineupId) {
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:520px;height:auto;max-height:90vh">
      <div class="map-modal-header">
        <strong>Availability responses</strong>
        <button class="btn-secondary" id="avm-close" type="button">✕</button>
      </div>
      <div class="map-modal-body" style="padding:0.8rem;overflow-y:auto" id="avm-body">
        <div class="muted" style="padding:0.5rem">Loading…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#avm-close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const bodyEl = overlay.querySelector('#avm-body');
  const { data: avail, error } = await supabase
    .from('player_availability')
    .select('*')
    .eq('lineup_id', lineupId);
  if (error) { bodyEl.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; return; }
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
    const photo = p.photo_url
      ? `<div style="width:32px;height:32px;border-radius:50%;background:#eee center/cover no-repeat url('${escapeHtml(p.photo_url)}');flex-shrink:0"></div>`
      : `<div style="width:32px;height:32px;border-radius:50%;background:#e6e6e6;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;color:#666;flex-shrink:0">${escapeHtml(String(p.number || ''))}</div>`;
    const badge = !r
      ? `<span style="color:#888">— no reply</span>`
      : r.status === 'available'   ? `<span style="color:#2a7;font-weight:600">✅ Available</span>`
      : r.status === 'maybe'       ? `<span style="color:#b88800;font-weight:600">🤔 Maybe</span>`
      : r.status === 'unavailable' ? `<span style="color:#c33;font-weight:600">❌ Unavailable</span>`
      : escapeHtml(r.status);
    const meta = r
      ? `<div class="muted" style="font-size:0.72rem;margin-top:0.15rem">${r.responded_by ? escapeHtml(r.responded_by) : 'anon'}${r.note ? ' · ' + escapeHtml(r.note) : ''}${r.responded_at ? ' · ' + new Date(r.responded_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}</div>`
      : '';
    return `<div style="display:flex;gap:0.6rem;align-items:center;padding:0.5rem 0;border-top:1px solid #f0f0f0">
      ${photo}
      <div style="flex:1;min-width:0">
        <div style="font-size:0.9rem"><strong>#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</strong> — ${badge}</div>
        ${meta}
      </div>
    </div>`;
  }).join('');
  bodyEl.innerHTML = `
    <div style="padding:0.5rem 0.2rem 0.75rem;border-bottom:1px solid #eee;font-size:0.85rem">
      <strong>Tally:</strong> ✅ ${tally.available} available · 🤔 ${tally.maybe} maybe · ❌ ${tally.unavailable} unavailable · — ${tally.none} no reply
    </div>
    ${rowHtml || '<div class="muted" style="padding:0.75rem">No players in squad.</div>'}
  `;
}

// ---------- Team dashboard ----------
// Default to Matches (the lineups tab) when opening a team — coach's most-used view.
let activeTab = 'lineups';
let _pendingLineupLoad = null; // play payload to apply next time the Lineups tab renders
let _pendingLineupIdToOpen = null; // wizard-saved lineup id; Lineups tab should load it fully
let currentFilter = 'All';
// Squad details page sub-tab — 'teaminfo' (team info + home ground) or
// 'squad' (players). Preserved across re-renders so the coach doesn't
// get bounced back to Team info when they change a filter.
let _squadSubTab = 'squad';
const expandedPlayers = new Set(); // player ids with expanded detail panel

// In-memory editor state for lineups tab
let editor = null; // { team, canEdit, players, lineups, current: { id?, name, opponent, game_date, formation, slots, subs } }

// Auto-save state for published lineups
let _autosaveTimer = null;
let _autosaveInFlight = false;
let _autosavePendingAfter = false; // set when edits arrive during an in-flight save
let _lastSavedHash = null;
function _lineupContentHash(c) {
  if (!c) return null;
  return JSON.stringify({
    slots: c.slots, subs: c.subs, formation: c.formation,
    lbl: c.lbl, pos: c.pos,
    arrows: c.arrows, zoneLines: c.zoneLines,
    ballVisible: c.ballVisible, ballPos: c.ballPos,
    opponent: c.opponent, game_date: c.game_date,
    match_type: c.match_type, home_away: c.home_away,
    kickoff_time: c.kickoff_time, arrival_time: c.arrival_time, notes: c.notes,
    location_name: c.location_name, location_postcode: c.location_postcode,
    location_lat: c.location_lat, location_lng: c.location_lng,
    // include result fields so autosave fires when coach enters a score / scorers / motm
    our_score_ht: c.our_score_ht, opp_score_ht: c.opp_score_ht,
    our_score_ft: c.our_score_ft, opp_score_ft: c.opp_score_ft,
    goalscorers: c.goalscorers,
    motm: c.motm
  });
}
function scheduleAutosaveIfPublished() {
  // Autosave any saved lineup (draft / availability / published) once it has an id.
  // New unsaved lineups still need the explicit "Save lineup" button to insert the row.
  if (!editor?.current?.id) return;
  const h = _lineupContentHash(editor.current);
  if (h === _lastSavedHash) return;
  // If a save is currently in flight, mark that another round is needed and bail.
  // After the in-flight save completes we'll re-check and schedule again.
  if (_autosaveInFlight) { _autosavePendingAfter = true; return; }
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(async () => {
    _autosaveTimer = null;
    _autosaveInFlight = true;
    try {
      await saveLineupWithMsg(null);
      _lastSavedHash = _lineupContentHash(editor.current);
    } catch (e) { console.error('autosave failed', e); }
    _autosaveInFlight = false;
    // If edits arrived while we were saving, run another pass so nothing is dropped.
    if (_autosavePendingAfter) {
      _autosavePendingAfter = false;
      scheduleAutosaveIfPublished();
    }
  }, 800);
}

// Flush any pending autosave immediately — call before navigation / tab-switch
// so in-flight edits (esp. subs added just before switching tabs) don't get dropped.
async function flushAutosave() {
  if (_autosaveTimer) { clearTimeout(_autosaveTimer); _autosaveTimer = null; }
  if (!editor?.current?.id) return;
  const h = _lineupContentHash(editor.current);
  if (h === _lastSavedHash) return;
  _autosaveInFlight = true;
  try {
    await saveLineupWithMsg(null);
    _lastSavedHash = _lineupContentHash(editor.current);
  } catch (e) { console.error('flushAutosave failed', e); }
  _autosaveInFlight = false;
}

async function renderTeamDashboard(user, teamId) {
  appEl.innerHTML = `<p class="loading">Loading team…</p>`;

  const [teamRes, memberRes, playersRes, lineupsRes, playsRes, formationsRes] = await Promise.all([
    supabase.from('teams').select('*').eq('id', teamId).single(),
    supabase.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle(),
    supabase.from('players').select('*').eq('team_id', teamId).order('number', { ascending: true, nullsFirst: false }).order('name'),
    supabase.from('lineups').select('*').eq('team_id', teamId).order('game_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    supabase.from('plays').select('*').eq('team_id', teamId).order('created_at', { ascending: false }),
    supabase.from('formations').select('*').eq('team_id', teamId).order('created_at', { ascending: true }),
    // Badge fetch — swallows errors internally; cache populated for synchronous
    // reads in renderSquadTab's player modal. Safe when the migration is pending.
    fetchTeamBadges(teamId),
    // Cue catalog — once per session. Swallows errors (Focus panel just shows empty picker).
    fetchCueCatalog().catch(() => ({}))
  ]);

  if (teamRes.error || !teamRes.data) {
    appEl.innerHTML = `<div class="card"><p class="error">Team not found or you don't have access.</p><button class="primary" onclick="location.hash=''">Back</button></div>`;
    return;
  }
  const team = teamRes.data;
  const role = memberRes.data?.role || 'viewer';
  const canEdit = role === 'admin' || role === 'coach';
  const players = playersRes.data || [];
  // Backfill any players missing an access_code (one-shot per session).
  if (canEdit) { try { await ensureAccessCodes(players); } catch (e) { console.warn('ensureAccessCodes failed', e); } }
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
      <button class="h-tab ${activeTab === 'squad' ? 'active' : ''}" data-tab="squad">Squad details</button>
      <button class="h-tab ${activeTab === 'lineups' ? 'active' : ''}" data-tab="lineups">Matches</button>
      <button class="h-tab ${activeTab === 'plays' ? 'active' : ''}" data-tab="plays">Tactics</button>
      ${canEdit ? `<button class="h-tab ${activeTab === 'members' ? 'active' : ''}" data-tab="members">Members</button>` : ''}
      <button class="h-tab ${activeTab === 'help' ? 'active' : ''}" data-tab="help">Help</button>
    `;
    tabsEl.querySelectorAll('.h-tab[data-tab]').forEach(b => {
      b.onclick = async () => {
        // Flush any pending lineup autosave before leaving the tab so sub/slot edits
        // made in the debounce window aren't dropped.
        try { await flushAutosave(); } catch (_) {}
        activeTab = b.dataset.tab;
        // Reset card open/closed state so every tab visit starts clean
        openCards.clear();
        renderTeamDashboard(user, teamId);
      };
    });
  }

  // Pull the user's team list once and pass it into both the sidebar and the
  // drawer so they can render the "Switch team" shortcut consistently.
  const memberships = await getUserTeams(user);

  // Desktop persistent left sidebar (CSS hides it on phone). Render BEFORE
  // renderGlobalPlus so the sidebar's #global-plus-sidebar slot exists in time.
  renderDesktopSidebar(user, teamId, team, role, canEdit, memberships);

  // Global "+" quick-create menu — coaches/admins only. Populates every .global-plus slot
  // on the page (header slot for phone, sidebar slot for desktop).
  renderGlobalPlus(user, teamId, canEdit);

  // Phone hamburger drawer — mirrors the horizontal tabs
  renderNavDrawer(user, teamId, team, role, canEdit, memberships);

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
    if (_pendingLineupIdToOpen) {
      // Wizard just inserted a lineup — find it in the fresh fetch and load it fully
      // so the coach lands inside the saved match (not on the Matches card list).
      const idToOpen = _pendingLineupIdToOpen;
      _pendingLineupIdToOpen = null;
      const l = lineups.find(x => x.id === idToOpen);
      if (l) {
        current = {
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
          lbl: Array.isArray(l.data?.lbl) ? [...l.data.lbl] : undefined,
          pos: Array.isArray(l.data?.pos) ? l.data.pos.map(p => Array.isArray(p) ? [...p] : p) : undefined,
          arrows: (l.data?.arrows || []).map(a => ({ ...a })),
          zoneLines: [...(l.data?.zoneLines || [null, null])],
          ballVisible: !!l.data?.ballVisible,
          ballPos: { ...(l.data?.ballPos || { x: 50, y: 50 }) },
          published: !!l.published,
          lineup_status: l.lineup_status || (l.published ? 'published' : 'draft'),
          location_name: l.location_name || '',
          location_postcode: l.location_postcode || '',
          location_lat: l.location_lat ?? null,
          location_lng: l.location_lng ?? null,
          our_score_ht: l.our_score_ht ?? null,
          opp_score_ht: l.opp_score_ht ?? null,
          our_score_ft: l.our_score_ft ?? null,
          opp_score_ft: l.opp_score_ft ?? null,
          goalscorers: Array.isArray(l.data?.goalscorers) ? l.data.goalscorers.map(g => ({ ...g })) : [],
          motm: Array.isArray(l.data?.motm) ? l.data.motm.map(m => ({ ...m })) : []
        };
        _lastSavedHash = _lineupContentHash(current);
        _lineupPhoneTab = 'squad';
      } else {
        current = base;
        _lineupPhoneTab = 'matches';
      }
    } else if (_pendingLineupLoad) {
      current = { ...base, ..._pendingLineupLoad, id: null };
      // If play provided custom pos/lbl, stash onto current
      if (_pendingLineupLoad.pos) current.pos = _pendingLineupLoad.pos.map(p => [...p]);
      if (_pendingLineupLoad.lbl) current.lbl = [..._pendingLineupLoad.lbl];
      // Wizard/+ menu provided a lineup to land on — skip the Matches list and go straight to Squad.
      _lineupPhoneTab = 'squad';
    } else {
      // No pending lineup — pick the "nearest" eligible match so the coach lands
      // straight inside it. Eligibility (per 2026-04-17 spec):
      //   • Any future match is eligible.
      //   • A past match is eligible only if ≤24h has elapsed since its kickoff
      //     time (so the coach stays parked on the match they just played and
      //     can enter the result). After 24h, we roll forward to the next upcoming.
      // Of the eligible set, pick the one with the smallest |dist-from-now|.
      const chosenId = _findDefaultLineupId(lineups);
      const chosen = chosenId ? lineups.find(x => x.id === chosenId) : null;
      if (chosen) {
        current = {
          id: chosen.id,
          name: chosen.name || '',
          opponent: chosen.opponent || '',
          game_date: chosen.game_date || '',
          match_type: chosen.match_type || 'league',
          home_away: chosen.home_away || 'home',
          kickoff_time: chosen.kickoff_time || '',
          arrival_time: chosen.arrival_time || '',
          notes: chosen.notes || '',
          formation: chosen.data?.formation || '4-3-3',
          slots: { ...(chosen.data?.slots || {}) },
          subs: [...(chosen.data?.subs || [])],
          lbl: Array.isArray(chosen.data?.lbl) ? [...chosen.data.lbl] : undefined,
          pos: Array.isArray(chosen.data?.pos) ? chosen.data.pos.map(p => Array.isArray(p) ? [...p] : p) : undefined,
          arrows: (chosen.data?.arrows || []).map(a => ({ ...a })),
          zoneLines: [...(chosen.data?.zoneLines || [null, null])],
          ballVisible: !!chosen.data?.ballVisible,
          ballPos: { ...(chosen.data?.ballPos || { x: 50, y: 50 }) },
          published: !!chosen.published,
          lineup_status: chosen.lineup_status || (chosen.published ? 'published' : 'draft'),
          location_name: chosen.location_name || '',
          location_postcode: chosen.location_postcode || '',
          location_lat: chosen.location_lat ?? null,
          location_lng: chosen.location_lng ?? null,
          our_score_ht: chosen.our_score_ht ?? null,
          opp_score_ht: chosen.opp_score_ht ?? null,
          our_score_ft: chosen.our_score_ft ?? null,
          opp_score_ft: chosen.opp_score_ft ?? null,
          goalscorers: Array.isArray(chosen.data?.goalscorers) ? chosen.data.goalscorers.map(g => ({ ...g })) : [],
          motm: Array.isArray(chosen.data?.motm) ? chosen.data.motm.map(m => ({ ...m })) : []
        };
        _lastSavedHash = _lineupContentHash(current);
        _lineupPhoneTab = 'squad';
      } else {
        current = base;
        // Nothing eligible (no upcoming, no past within 24h) → show the card list.
        _lineupPhoneTab = 'matches';
      }
    }
    _pendingLineupLoad = null;
    editor = {
      mode: 'lineup',
      team, canEdit, players, lineups, plays, customFormations,
      currentUser: user,
      currentUserId: user.id,
      currentUserRole: role,
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
  } else if (activeTab === 'formations') {
    editor = {
      mode: 'formation',
      team, canEdit, players, lineups, plays, customFormations,
      currentUser: user,
      currentUserId: user.id,
      currentUserRole: role,
      current: newFormationState()
    };
    renderFormationsTab();
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
      <h4>What happens after I sign in?</h4>
      <p>Coach with exactly one team → you're dropped straight into it, no picker. Anyone else (admins, or users on multiple teams) sees the <strong>Your teams</strong> card grid.</p>
      <h4>Switching between teams</h4>
      <p>Three ways: the <strong>↻ Switch team</strong> shortcut in the sidebar/drawer (only shown when it'd be useful), the team-switcher strip at the top of the <strong>Admin</strong> tab, or <strong>← Your teams</strong> in the header.</p>
      <h4>Age group</h4>
      <p>Each team has an age group (U7 → U18). Set it on <strong>Squad details → Team info</strong>. It auto-bumps by one on <strong>7 June</strong> every year — a week after the season ends — so you don't have to remember.</p>
      <h4>Who can see my team?</h4>
      <p>Only people you invite. Exceptions: <strong>published lineups</strong> (parent view) and <strong>player stats cards</strong>, both of which can be shared by public link + access code.</p>
    `
  },
  {
    id: 'create-team', title: 'Creating a team', adminOnly: true,
    body: `
      <p>From the <strong>Your teams</strong> picker, or inside a team on the <strong>Admin</strong> tab. Only admins can create new teams — coaches can't (ask your admin to add you to the new team). A create modal asks for the name + age group.</p>
    `
  },
  {
    id: 'squad', title: 'Squad details — team settings & players', adminOnly: false,
    body: `
      <h4>Adding a player <em>(coach/admin only)</em></h4>
      <p>Open <strong>Squad</strong> and click <strong>+ Add player</strong>. Fill in name, shirt number, preferred positions and notes. Save.</p>
      <h4>What does the position field do?</h4>
      <p>Preferred positions colour-code players on the lineup picker. They're suggestions, not restrictions.</p>
      <h4>How the Squad tab is organised</h4>
      <p>When the <strong>All</strong> filter is active, players are grouped into <strong>Goalkeepers</strong>, <strong>Defenders</strong>, <strong>Midfielders</strong>, <strong>Forwards</strong> and <strong>Unassigned</strong>. Pick a group from the filter to see just that group. Each card shows the player's shirt number as a small blue badge in the top-left corner, so it stays visible even when a photo is set.</p>
      <h4>Editing or removing a player <em>(coach/admin only)</em></h4>
      <p>Tap a player's card to open the <strong>Edit player</strong> modal. All fields (photo, name, number, position, parent contacts) save on change. Use <strong>Remove player</strong> at the bottom to delete. Removing a player won't break old lineups — they'll just appear as empty slots.</p>
      <h4>Adding a player photo <em>(coach/admin only)</em></h4>
      <p>Open the player modal and click <strong>Upload photo</strong>. A cropper opens <em>on top of</em> the player modal — drag and zoom to frame the face inside the square, then save. The image is compressed to a 512×512 JPEG and shows up everywhere that player appears: squad list, pitch chip, subs row, parent view chips, fixtures preview. Use <strong>Replace</strong> or <strong>Remove</strong> to change it.</p>
      <h4>What's the Access codes box for? <em>(coach/admin only)</em></h4>
      <p>Each player has an auto-generated <strong>personal code</strong> (e.g. <code>JE1234</code> — first initials + 4 digits) and optionally a 5-digit <strong>family code</strong> shared with linked siblings. Parents enter one of these codes once on the availability link to unlock that player on their device. WhatsApp the code(s) to the parents — they only need to enter one once. See "Publishing & sharing with parents" for the parent flow.</p>
      <h4>Linking siblings <em>(coach/admin only)</em></h4>
      <p>In the Access codes box, click <strong>🔗 Link sibling…</strong>. Tick the brothers/sisters in the squad and save. The app generates (or reuses) a shared 5-digit family code so a parent enters one code and unlocks both children at once. Click <strong>Unlink</strong> to remove a player from the family group; if only one player is left, the family code is dissolved automatically.</p>
      <h4>Parent contact fields <em>(coach/admin only)</em></h4>
      <p>Parent name + phone are stored on each card so you can chase someone quickly. Future versions will use them for SMS notifications and invites.</p>
      <h4>Setting the home ground <em>(coach/admin only)</em></h4>
      <p>At the top of the Squad tab, the <strong>Home ground</strong> card lets you set venue name + postcode and fine-tune the map pin. This auto-fills for every Home game.</p>
      <h4>Why fine-tune the map?</h4>
      <p>UK postcodes can cover a large area. Drag the pin to the exact spot of the pitch entrance/car park so parents can find you.</p>
    `
  },
  {
    id: 'dashboard', title: 'Dashboard layout & the + button', adminOnly: false,
    body: `
      <h4>Desktop, tablet, phone</h4>
      <p>On <strong>desktop (≥900px)</strong> tabs live in a left sidebar: Matches, Squad, Tactics, Formations, Help and (coach/admin only) Admin. Your user badge + Log out sit at the bottom. On <strong>phone</strong> the same tabs are in a ☰ drawer. On <strong>tablet</strong> they sit in a horizontal strip along the top.</p>
      <h4>The orange <strong>+</strong> quick-create menu <em>(coach/admin only)</em></h4>
      <p>The orange + button (sidebar on desktop, header on phone) is the primary entry point for anything new. It opens a small menu with <strong>+ New match</strong> (opens the wizard), <strong>+ New player</strong>, <strong>+ New tactic</strong> and <strong>+ New formation</strong>. You don't need to be on the matching tab first.</p>
    `
  },
  {
    id: 'wizard', title: 'Match creation wizard', adminOnly: true,
    body: `
      <h4>Starting a new match</h4>
      <p>Tap the orange <strong>+</strong> button and pick <strong>+ New match</strong>. A step-by-step popup walks you through the essentials. The step count depends on whether it's a Home or Away match.</p>
      <h4>Home (4 steps)</h4>
      <ol>
        <li><strong>Who &amp; when</strong> — opponent, match type, Home/Away toggle, date, kick-off, arrival.</li>
        <li><strong>Formation</strong> — pick a preset or a saved custom formation.</li>
        <li><strong>Location</strong> — read-only confirmation of your Squad-tab home ground.</li>
        <li><strong>Summary</strong> — review and click Create.</li>
      </ol>
      <h4>Away (5 steps)</h4>
      <p>Same as Home except step 3 becomes <strong>Venue</strong> (name + postcode with 🔍 lookup) and step 4 becomes <strong>Fine-tune on map</strong> (drag the pin to the exact spot). Summary is step 5.</p>
      <h4>After Create</h4>
      <p>The lineup is saved as a Draft and the match editor opens on it. A follow-up prompt asks <strong>"Share to WhatsApp now?"</strong> — Yes flips the status to Availability and opens WhatsApp with a pre-filled message; Not now just keeps editing.</p>
    `
  },
  {
    id: 'lineups', title: 'Match editor (Matches)', adminOnly: true,
    body: `
      <h4>What match do I land on?</h4>
      <p>Opening <strong>Matches</strong> auto-selects the closest match — the next upcoming fixture, or the most recently played match if kick-off was within the last 24 hours (so you stay on a just-played match long enough to enter the result). After 24h, it rolls forward automatically.</p>
      <h4>The sub-tabs</h4>
      <p>Below the match header, a strip of sub-tabs switches what you see:</p>
      <ul>
        <li><strong>Matches</strong> — card list split into Upcoming / Past. Cards flip from Upcoming to Past the moment kick-off passes.</li>
        <li><strong>Squad</strong> — the <strong>Available players</strong> palette to drag onto the pitch.</li>
        <li><strong>Subs</strong> — the substitutes row (max 5).</li>
        <li><strong>Formation</strong> — preset/custom formations. Read-only (pick one to apply). Edit or save formations on the <strong>Formations</strong> top-level tab.</li>
        <li><strong>Info</strong> — match summary, map/directions, share button, Add to calendar, result chip.</li>
      </ul>
      <h4>Card outline colours</h4>
      <ul>
        <li><strong>Orange</strong> — the match you're currently in.</li>
        <li><strong>Green</strong> — played match with a result entered. Done.</li>
        <li><strong>Red + "⚠ Needs score" chip</strong> — played match with no result yet.</li>
        <li><strong>Neutral</strong> — future match.</li>
      </ul>
      <h4>Starting a new match</h4>
      <p>Global <strong>+</strong> → <strong>+ New match</strong>, or the <strong>+ New</strong> button in the desktop editor header (next to Share). Both open the same wizard.</p>
      <h4>The status pill and the Status change modal</h4>
      <p>The pill in the match header shows the current state — <strong>Draft</strong>, <strong>Availability</strong> or <strong>Published</strong>. On phones it sits in a dedicated row above the sub-tabs. Tap it to open the <strong>Status change</strong> modal, which has one card per state with a description. Picking Availability auto-opens the share prompt.</p>
      <h4>Setting match details</h4>
      <p>Click the blue <strong>✎ Edit match</strong> button (Info sub-tab or match header). The popup has Opponent, Match type (Friendly/League/Cup), Home/Away, Game date, Kick off, Team arrival, Notes, and Venue. For Home games the venue auto-fills from your Squad-tab home ground; for Away games you can set venue + fine-tune the map.</p>
      <h4>Adding players to the pitch</h4>
      <p>Drag a player from <strong>Available players</strong> onto a position slot. Drag one onto another to swap. Drag back to the list to remove.</p>
      <h4>Changing formation</h4>
      <p>Open the <strong>Formation</strong> sub-tab and pick a preset (4-3-3, 4-4-2, etc.) or a custom one. Some custom formations show a <strong>👥N</strong> badge — that formation was saved with N pre-placed players. Clicking it on an empty pitch loads them in; on a pitch that already has players you're asked before replacing.</p>
      <h4>Custom formations — where are they edited?</h4>
      <p>On the <strong>Formations</strong> top-level tab. The match editor's Formation sub-tab is a pure picker — no Edit / Save buttons. This keeps formation templates separate from individual match lineups.</p>
      <h4>Subs</h4>
      <p>Drag players to the <strong>Substitutes</strong> strip on the Subs sub-tab (max 5).</p>
      <h4>Tactics (arrows, ball, zones)</h4>
      <p>Press/Defensive lines (toggle and drag), arrows (click-drag, click to bend), and a movable ball. Use Clear to reset. Note: these draw on the lineup for this match. To build a reusable set-piece template, use the <strong>Tactics</strong> tab.</p>
      <h4>Saving</h4>
      <p>Wizard-created lineups <strong>autosave continuously</strong> — every pitch change, tactics tweak and result edit persists within about a second. Dragging a player now does a <em>targeted</em> refresh (only pitch + palette), so whatever sub-tab you were looking at on the right stays put — no more jarring re-align.</p>
      <h4>Loading or deleting saved lineups</h4>
      <p>Tap any match card on the <strong>Matches</strong> sub-tab to load. Hover/tap a card and click <strong>×</strong> to delete.</p>
      <h4>Add to calendar</h4>
      <p>On the <strong>Info</strong> sub-tab click <strong>📅 Add to calendar</strong>. A chooser offers <strong>Google Calendar</strong> (pre-filled event page in a new tab), <strong>Apple Calendar</strong> (native Add-to-Calendar prompt on iOS/macOS) or <strong>Outlook / Download .ics</strong> (for any other calendar app).</p>
      <h4>Recording the result — the 5-step wizard</h4>
      <p>Once kick-off has passed, a big amber <strong>⚽ Enter result</strong> button appears above the sub-tabs. Tap it to open a 5-step wizard:</p>
      <ol>
        <li><strong>Half-time score</strong> — Us and Opponent. Leave blank if you didn't track HT.</li>
        <li><strong>Full-time score</strong> — same layout, with a "HT was X-Y" hint if you entered HT.</li>
        <li><strong>Goalscorers</strong> — tap <strong>+ Add goalscorer</strong>, pick a player, they're added with count 1. Tap again to add more or re-pick the same player to increment. Live total-vs-FT check warns if numbers don't match.</li>
        <li><strong>Man of the Match</strong> — tap <strong>+ Add Man of the Match</strong>, pick a player, optionally write a "Why?" reason. Joint MOTM supported — already-selected players are disabled in the picker.</li>
        <li><strong>Badges (optional)</strong> — every matchday player has a <strong>+ Award badge</strong> button. Tap to open the badge picker (same as the Squad tab) and give recognition — scored a screamer, great attitude, clean sheet moment. Skip this step entirely by tapping <strong>Save &amp; skip badges</strong> on step 4. Badges awarded here are tied to this match (so they're filterable later) and save immediately.</li>
      </ol>
      <p>Tap ✓ Save result on step 5 (or Save &amp; skip badges on step 4) — the score / scorers / MOTM persist in one go. After saving, the big button collapses into a small green <strong>✎ Edit</strong> pill on the result card — tap that to re-open the wizard. The original Result section inside ✎ Edit match still exists as a single-screen fallback.</p>
      <h4>What do the icons on player chips mean?</h4>
      <p>Four corners carry different signals:</p>
      <ul>
        <li><strong>Bottom-right dot</strong> — availability (green Available, red Unavailable, amber Maybe, no dot = no response)</li>
        <li><strong>Top-left gold ★</strong> — Man of the Match for this game</li>
        <li><strong>Top-right white circle with a number</strong> — goals scored in this game</li>
        <li><strong>Bottom-left emoji row</strong> — badges awarded in this game (only; their permanent collection lives on the player card)</li>
      </ul>
      <p>The same icons show on the parent view pitch once the lineup is published.</p>
    `
  },
  {
    id: 'publish', title: 'Publishing & sharing with parents', adminOnly: true,
    body: `
      <h4>The three visibility states</h4>
      <p>Every lineup is in one of three states, changed by tapping the status pill to open the <strong>Status change</strong> modal:</p>
      <ul>
        <li><strong>Draft</strong> — only coaches can see it. The share link doesn't work.</li>
        <li><strong>Availability</strong> — parents can open the share link to see match details and mark each of their children as Available, Maybe or Unavailable. The lineup itself is hidden.</li>
        <li><strong>Published</strong> — parents see the full pitch plus match details. Availability responses still flow in.</li>
      </ul>
      <h4>Collecting availability from parents</h4>
      <p>Once the lineup has a game date, tap the status pill → <strong>Availability</strong>. The Share modal opens automatically — tap <strong>Share to WhatsApp</strong> or <strong>🔗 Copy availability link for parents</strong>. Paste into team WhatsApp along with each child's access code (parents only need it once per device — it's remembered after that).</p>
      <h4>Where do parents get their access code?</h4>
      <p>From you. Open the <strong>Squad</strong> tab, expand the player's card, and look in the <strong>Access codes</strong> box. Copy the personal code (e.g. <code>JE1234</code>) or family code (5 digits if siblings are linked) and send it via WhatsApp.</p>
      <h4>Publishing the lineup</h4>
      <p>Once you've picked the squad, tap the status pill and pick <strong>Published</strong>. The same link now shows the pitch — no need to re-share.</p>
      <h4>Taking a lineup offline</h4>
      <p>Switch the state back to <strong>Draft</strong>. The share link stops working immediately. Availability responses are preserved.</p>
      <h4>Where do I see the responses?</h4>
      <p>In the Match editor's Info card you'll see an <strong>Availability responses</strong> panel with a tally and a per-player breakdown. It refreshes every ~5 seconds while the editor is open. Pitch chips get coloured dots in the corner too.</p>
      <h4>Do I need to re-share if I change something?</h4>
      <p>No. The link always points to the latest version. Parent views poll every ~6 seconds (or tap <strong>↻ Refresh</strong>).</p>
      <h4>What parents see</h4>
      <p>Team vs opponent, date/kick-off/arrival, venue + map + what3words, coach notes, an availability form for the children they've unlocked, and (in Published mode) the full pitch with players, subs, MOTM and goal overlays. They don't see drafts, other lineups or admin data.</p>
    `
  },
  {
    id: 'stats-card', title: 'Player stats card (FIFA-style)', adminOnly: true,
    body: `
      <h4>What is it?</h4>
      <p>A FIFA Ultimate Team-style card at <code>/#/card/{team_id}</code> showing a player's season stats — Goals, MOTM, Starts, Subs, Apps, and W-D-L. One public URL per team; each player unlocks their own card using their personal access code (or family code for siblings). Season selector via ← / → arrows.</p>
      <h4>Sharing the link</h4>
      <p>Two ways:</p>
      <ul>
        <li><strong>Per player</strong> — Squad tab → open a player's modal → tap <strong>🎴 Share stats card (WhatsApp)</strong>. Pre-fills a message with the kid's first name, the card URL, and their access code.</li>
        <li><strong>Team-wide</strong> — Admin tab → <strong>Share the team's stats-card link</strong> card at the top → Copy or Open. Paste into the team WhatsApp along with each child's code.</li>
      </ul>
      <h4>What do the stats mean?</h4>
      <p>All derived live from the match data — <strong>Goals</strong> from the goalscorers list, <strong>MOTM</strong> from the MOTM picker, <strong>Starts</strong> = matches started in the XI, <strong>Subs</strong> = matches on the bench (may or may not have come on), <strong>Apps</strong> = Starts + Subs, <strong>W-D-L</strong> = the team's record in matches the player featured in. Editing a match result updates everyone's cards automatically.</p>
      <h4>Does it show older seasons?</h4>
      <p>Yes — the arrows above the card cycle through every season with played matches. Seasons run 1 September → 7 June.</p>
      <h4>Forgetting a device</h4>
      <p>If the device is being handed off, the <strong>Forget</strong> button clears the saved unlocks. Next visit they'll need to enter the access code again.</p>
    `
  },
  {
    id: 'badges', title: 'Badges & achievements', adminOnly: false,
    body: `
      <h4>What are badges?</h4>
      <p>FIFA Ultimate Team-style achievements that appear on a player's public stats card. Each one has an emoji icon, a name and a short description — kids collect them across the season.</p>
      <h4>Who awards them?</h4>
      <p>Coaches and admins. Open the <strong>Squad</strong> tab → tap a player's card → the <strong>🏅 Badges</strong> section shows everything they've already earned, plus a <strong>+ Award badge…</strong> button. Pick one from the grouped list (Attacking, Skill, Defending, Attitude, Teamwork, Fun, Milestone), type an optional "why?" note, and save. The note is <strong>shown on the public card</strong>, so parents/kids see exactly why a badge was awarded.</p>
      <h4>Manual vs. auto badges</h4>
      <p>Right now all badges are awarded manually. In a future update, some will be <strong>auto-derived</strong> from match data — Hat-Trick Hero, Top Scorer, Ever-Present, milestones like 10 games / 25 goals, and so on. The catalog already lists them; coaches simply won't see the auto ones in the Award menu until that rollout.</p>
      <h4>Where do badges show up?</h4>
      <p>On the <strong>public stats card</strong>: a row of up to 9 icons sits beneath the stats grid, with an "All" button for overflow. Tapping any badge opens a detail sheet with its name, description, date awarded and the coach's note.</p>
      <h4>Removing a badge</h4>
      <p>In the player modal, each earned-badge chip has a small ✕ — tap it to remove. (Coach/admin only.) There's no "edit" — to refresh a badge's date, remove it and re-award.</p>
      <h4>Sharing a just-earned badge</h4>
      <p>Straight after awarding, a popup offers <strong>💬 Share to WhatsApp</strong> — it pre-fills a message with the new badge name, your note, the card link and the player's access code. Great for the team group chat.</p>
    `
  },
  {
    id: 'focus', title: "Coach's Focus (pre-match cues)", adminOnly: false,
    body: `
      <h4>What is Coach's Focus?</h4>
      <p>A <strong>pre-match</strong> companion to badges. Where badges celebrate what a kid did <em>after</em> the game, Coach's Focus is <strong>the one thing you want them to focus on going in</strong> — a technical, physical, psychological, social or welfare cue. Set before kick-off, the parent sees it on their child's match page, and after the game you can revisit how it went. Capped at <strong>3 cues per player per match</strong>, one of which is the <strong>primary</strong> ("the one thing") so kids aren't overloaded.</p>

      <h4>The frameworks it's built on</h4>
      <p>The catalog of ~86 cues is grounded in the coaching models we lean on for youth development:</p>
      <ul>
        <li><strong>The FA Four Corner Model</strong> — England FA's player-development framework. Every cue is tagged to one of <strong>Technical · Physical · Psychological · Social</strong>, so you're balancing the corners across the squad rather than always hammering technical.</li>
        <li><strong>ELM (Effort · Learning · Mistakes)</strong> — Positive Coaching Alliance's mental-game model. Praises effort and learning over outcome, so kids stay brave and take risks.</li>
        <li><strong>ROOTS (Rules · Opponents · Officials · Teammates · Self)</strong> — PCA's sportsmanship and character framework: shaking the ref's hand, picking a teammate up after a mistake, respecting the rules.</li>
        <li><strong>Emotional Tank</strong> — Jim Thompson's metaphor: kids play well when their tank is full. Cues focus on filling teammates' tanks through encouragement, celebration and picking each other up.</li>
        <li><strong>Welfare</strong> — coach-only flags for wellbeing (tired today, came in upset, minding an injury). <strong>Never visible to parents</strong> by design.</li>
        <li><strong>Role / position</strong> — position-specific coaching points (e.g. "Stay wide" for a winger, "Communicate with your back four" for a keeper).</li>
        <li><strong>Encouragement</strong> — general confidence boosters for kids who need a lift.</li>
      </ul>

      <h4>Where do I set a focus?</h4>
      <p>Open a match → <strong>🎯 Focus</strong> sub-tab (between Formation and Info). The default is <strong>Focus mode</strong> — a tap-to-select flow made for phones: tap a player on the pitch, only that player's row appears, add up to 3 cues, tap the next player. Flip to <strong>📋 Full picked squad</strong> if you'd rather see everyone at once.</p>

      <h4>Primary cue ("the one thing")</h4>
      <p>One of each player's cues can be marked <strong>primary</strong> — it gets a gold ★ and represents the single most important message for that kid this match. The first cue you add is auto-primary; set a new one as primary and the old one quietly demotes (so there's always zero or one primary, never two).</p>

      <h4>Pitch markers — who's still waiting for a focus?</h4>
      <p>Every filled pitch / subs chip shows a small <strong>🎯 pill in the bottom-right corner</strong> when that player has ≥1 cue set. Gold when a primary is set, purple otherwise. A quick glance at the pitch tells you who still needs one.</p>

      <h4>What parents see</h4>
      <p>On the parent's match page, the yellow <strong>Your squad</strong> card gains a <strong>"🎯 Coach's focus for this match"</strong> block per unlocked child. Primary cue is gold with a ★, others are purple. Your personal note shows in italics underneath; if you skipped the note, the catalog's default description shows so parents still get context.</p>

      <h4>Coach-only welfare cues</h4>
      <p>Picking a <strong>Welfare</strong> cue auto-ticks the <strong>🔒 Coach-only</strong> checkbox — it's hidden from parents both at the database layer (RLS) and on the client. It still counts toward the chip pill so you see it on the pitch.</p>

      <h4>Why cap at 3?</h4>
      <p>Youth-coaching best practice: a kid playing a 30–40 minute half can't act on five things. One clear primary + two optional fallbacks is enough to steer the match without overwhelming.</p>

      <h4>Edit or remove</h4>
      <p>Tap a chip to re-open the editor (change cue / note / primary flag / visibility). Tap the small <strong>✕</strong> to remove after a confirm. Everything saves immediately.</p>

      <h4>Carryover between matches</h4>
      <p>Each cue is tied to one match + player, so nothing carries over. Kids start each match with a clean Focus panel. A post-match "how did the focus go?" step is planned as a later phase.</p>

      <h4>Focus vs. badges</h4>
      <p>Different time horizons, different purposes. <strong>Badges</strong> are celebratory, awarded after the fact, visible forever on the player's stats card. <strong>Focus</strong> is directional, set before the match, visible for that one match, and meant to steer behaviour in the moment.</p>
    `
  },
  {
    id: 'formations', title: 'Formations tab', adminOnly: true,
    body: `
      <h4>What's the Formations tab for?</h4>
      <p>The dedicated page for creating, editing and saving <strong>formation templates</strong> — the pitch shapes you pick inside a match. Same layout as the match editor (pitch left, sub-tabs right), trimmed to two sub-tabs:</p>
      <ul>
        <li><strong>Formation</strong> — list of presets + your custom formations. Always-visible buttons: <strong>✎ Edit formation</strong> (enters drag-handle edit mode), <strong>💾 Save formation</strong>, <strong>➕ Save as new formation…</strong>.</li>
        <li><strong>Squad</strong> — player palette so you can drag players onto positions and preview / optionally save them with the formation.</li>
      </ul>
      <h4>Editing a formation</h4>
      <p>Pick one from the list, tap <strong>✎ Edit formation</strong>. Drag the position handles to move players. Double-click a position label (GK, CB, ST, etc.) for a dropdown of common roles — or type a custom label up to 4 characters. Tap <strong>✓ Done editing</strong>, then save. Presets (4-3-3 etc.) can't be overwritten — Save on one falls back to Save as new.</p>
      <h4>Saving players with a formation</h4>
      <p>When you tap Save formation or Save as new, if there are players on the pitch you get a prompt: <strong>OK</strong> saves the player placements with the formation; <strong>Cancel</strong> saves shape only. Formations that include players get a <strong>👥N</strong> badge on their button.</p>
      <h4>What does 👥N do in a match?</h4>
      <p>Clicking a formation with stored players, on an empty pitch, loads them in automatically. On a pitch that already has players you're asked first — OK replaces, Cancel keeps your current players and only changes formation shape.</p>
      <h4>Deleting a custom formation</h4>
      <p>On the Formations page, tap the <strong>×</strong> on the right side of the formation button. Presets have no ×.</p>
    `
  },
  {
    id: 'plays', title: 'Tactics tab', adminOnly: true,
    body: `
      <h4>What's a tactic?</h4>
      <p>A reusable set-piece or pattern template: a formation, optional players, arrows for player movement, a ball start position, and press/defensive zone lines. Each tactic is labelled <strong>In possession</strong> or <strong>Out of possession</strong>. Use them for corners, free kicks, high-press triggers, build-up patterns.</p>
      <h4>The Tactics page layout</h4>
      <p>Same pitch + sub-tabs skeleton as the match editor. Four sub-tabs:</p>
      <ul>
        <li><strong>Tactics</strong> — card grid of saved tactics (name, formation, In/Out chip). Filter (All / In / Out) + <strong>+ New tactic</strong> button.</li>
        <li><strong>Squad</strong> — player palette for dragging onto the pitch.</li>
        <li><strong>Moves</strong> — pitch-layout and drawing tools: <strong>✎ Edit positions</strong> (nudge dots for this tactic), <strong>Move / Click / Drag</strong> arrow modes, <strong>⚽ Ball</strong> toggle, press/def zone sliders, Clear arrows / Clear all.</li>
        <li><strong>Tactic details</strong> — Name, In/Out possession radio, Description, formation picker, Save / Save as new / Delete.</li>
      </ul>
      <h4>Creating a tactic</h4>
      <p>Tap <strong>+ New tactic</strong> (or the global <strong>+</strong> → <strong>+ New tactic</strong>). You land on Tactic details with a blank editor, name field focused. Fill in name + possession + pick a formation, add players via Squad, draw arrows / zones / ball on Moves, tap <strong>💾 Save tactic</strong>.</p>
      <h4>Editing a tactic</h4>
      <p>Click any card → the tactic loads into the editor and flips to Tactic details. Make changes → <strong>💾 Save</strong> writes back in place, or <strong>➕ Save as new…</strong> duplicates under a fresh name.</p>
      <h4>Editing positions for one tactic only</h4>
      <p>Open <strong>Moves</strong>, tap <strong>✎ Edit positions</strong>, drag handles, <strong>✓ Done editing</strong>. Those positions ride with the tactic only — the underlying formation template isn't changed.</p>
      <h4>Saving a tactic from inside a match</h4>
      <p>In the match editor's Formation sub-tab, tap <strong>★ Save as tactic…</strong>. A modal asks for name, In/Out radio, and description. Saves the current pitch as a new tactic.</p>
      <h4>Who can delete a tactic?</h4>
      <p>The tactic's creator, and any admin. The Delete button is hidden when you don't have permission.</p>
    `
  },
  {
    id: 'fixtures', title: 'Fixtures tab (tablet only)', adminOnly: false,
    body: `
      <h4>What happened to Fixtures?</h4>
      <p>It's been largely folded into the <strong>Matches</strong> sub-tab of the match editor on desktop and phone. The card list, the share button, the availability responses panel and the pitch preview all live there now. The dedicated Fixtures tab only surfaces on tablet-width screens (641–899px) as a legacy view.</p>
      <h4>On tablet — what does Fixtures still do?</h4>
      <p>Collapsible <strong>Calendar</strong> and <strong>Matches</strong> cards at the top; below, the selected game's headline (date, opponent, venue, map links), the parent share button, the availability responses panel, and the pitch. As a coach you always see the pitch here; a grey banner shows the current visibility state. Tick <strong>Show draft lineups</strong> at the bottom of Matches to include drafts.</p>
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
      <p>No. The share link is public. To <strong>mark availability</strong> for your child you enter the player's access code once — see below.</p>
      <h4>What's the access code box?</h4>
      <p>An unlock prompt above the availability buttons. The first time you open the link you'll see only the match details and an empty code box. Type your child's personal code (<code>JE1234</code> style) or family code (5 digits), tap <strong>Unlock</strong>, and that player's row appears with the ✅ / 🤔 / ❌ buttons. The unlock is remembered on that device so you only do it once.</p>
      <h4>What does "Add another child" do?</h4>
      <p>After you've unlocked one player, the same code box label changes to <strong>Add another child</strong>. Paste a second code to add a sibling that wasn't linked, or a different family's child.</p>
      <h4>What does "Forget this device" do?</h4>
      <p>Wipes everything the parent view remembers on that device — unlocked players, codes, and saved name. Useful for shared phones. You'll need the access code(s) again next time.</p>
      <h4>How often does it refresh?</h4>
      <p>Automatically every 6 seconds. There's also a <strong>↻ Refresh</strong> button at the bottom.</p>
      <h4>What's the ///what3words link?</h4>
      <p>A three-word address pinpoints a 3m × 3m square. Tap it on a phone for precise directions.</p>
      <h4>Are the access codes secret?</h4>
      <p>They're treated as private but they're not high-security secrets — they're WhatsApp-trust friction designed to stop accidental cross-clicks. The full lineup, when published, is still visible to anyone with the link.</p>
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
      <p>Open the lineup and check the visibility state at the bottom of <strong>✎ Edit match</strong>. <strong>Draft</strong> breaks the link entirely; <strong>Availability</strong> hides the pitch but lets parents mark availability; <strong>Show lineup</strong> shows everything.</p>
      <h4>A parent says they entered the code but nothing happened <em>(coaches)</em></h4>
      <p>Double-check the code on the player's card. Codes are case-insensitive and ignore spaces. Personal codes are 2 letters + 4 digits (<code>JE1234</code>); family codes are exactly 5 digits.</p>
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
        <li><strong>Monday</strong> — Tap the orange <strong>+</strong> → <strong>New match</strong>. The wizard walks you through opponent, date, kick-off, arrival, venue, formation. Click Create. Match opens as Draft.</li>
        <li><strong>Tuesday</strong> — Tap the status pill → <strong>Availability</strong>. The Share modal opens — send the link + each child's access code via WhatsApp (grab codes from the Squad tab). Or say <strong>Yes, share</strong> to the post-wizard prompt.</li>
        <li><strong>Wed/Thu</strong> — Watch the <strong>Availability responses</strong> panel fill in (coloured dots appear on pitch chips). Tweak the lineup. Add tactics arrows.</li>
        <li><strong>Friday</strong> — Tap the status pill → <strong>Published</strong>. Same parent link now shows the pitch — no need to re-share.</li>
        <li><strong>Match day</strong> — If anyone drops out, edit the lineup; parent view picks up changes within ~6s.</li>
        <li><strong>Post-match</strong> — Open Matches (the app auto-lands on today's just-played match while within 24h of KO). Tap the amber <strong>⚽ Enter result</strong> button above the sub-tabs → step through the 5-step wizard (HT → FT → Goalscorers → MOTM → Badges [optional]) → Save. The match card flips green with an <strong>FT 3-2 W</strong>-style chip. If you skip it, the card shows red with <strong>⚠ Needs score</strong> until you do.</li>
      </ol>
    `
  },
  {
    id: 'roadmap', title: 'Roadmap (coming soon)', adminOnly: true,
    body: `
      <ul>
        <li><strong>Badges & achievements</strong> — FIFA-style collectible badges per player. Some auto-awarded (Hat Trick Hero, On Fire, 10 games, Ever-Present, Supersub…) and some coach-awarded (Coach's Choice, Training Star, Fair Play, Nutmeg King, Celebration Star…). Shown under the stats on the player card and in the Squad tab. Full brief in the handoff.</li>
        <li>Email notifications when lineups are published or updated</li>
        <li>Audit log UI to see who changed what</li>
        <li>Team-wide public page so parents can bookmark one URL for the season</li>
        <li>A holistic look-and-feel polish pass</li>
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

  // Team info card — age group editing. Shows the effective age group (auto-
  // bumped each year on 7 June) and lets admins/coaches update the stored
  // age group + season year for the team.
  const currentEffectiveAge = effectiveAgeGroup(team);
  const storedSeasonYear = team.age_group_season_year ?? computeCurrentSeasonStartYear();
  const storedAgeRaw = team.age_group ?? null;
  const teamInfoCard = canEdit ? `
    <div class="card">
      <h3 style="margin-top:0">Team info</h3>
      <label>Team name</label>
      <input type="text" id="ti-name" value="${escapeHtml(team.name || '')}" placeholder="Team name" />
      <label style="margin-top:0.5rem">Age group</label>
      <select id="ti-age" style="width:100%">
        <option value="">— not set —</option>
        ${AGE_GROUP_OPTIONS.map(n =>
          `<option value="${n}" ${currentEffectiveAge === n ? 'selected' : ''}>U${n}s</option>`
        ).join('')}
      </select>
      <p class="muted" style="font-size:0.72rem;margin:0.3rem 0 0">
        ${currentEffectiveAge != null
          ? `Currently showing as <strong>U${currentEffectiveAge}s</strong>. Rolls up automatically on 7 June each year (the week after the season ends).`
          : `Optional. Once set, the displayed age group rolls up on 7 June each year.`}
      </p>
      <div id="ti-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.3rem"></div>
      <button class="primary" id="ti-save" style="margin-top:0.4rem">Save team info</button>
    </div>
  ` : '';

  // Training schedule card — recurring weekly template. JSONB list so teams
  // with two training nights (Tue+Thu) work out of the box. Each row:
  // { day: 0-6, start: "HH:MM", end: "HH:MM", location: string }.
  const trainingSlots = parseTrainingSchedule(team);
  const trainingRowHtml = (slot, idx) => `
    <div class="training-slot-row" data-ts-row="${idx}" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:0.35rem;align-items:end;margin-bottom:0.4rem">
      <div>
        <label style="font-size:0.7rem">Day</label>
        <select data-ts-day style="width:100%">
          ${DAY_NAMES.map((name, d) => `<option value="${d}" ${slot.day === d ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem">Start</label>
        <input type="time" data-ts-start value="${fmtTimeHHMM(slot.start || '19:00')}" style="width:100%" />
      </div>
      <div>
        <label style="font-size:0.7rem">End</label>
        <input type="time" data-ts-end value="${fmtTimeHHMM(slot.end || '20:00')}" style="width:100%" />
      </div>
      <button type="button" class="btn-secondary" data-ts-remove title="Remove this session" style="padding:0.4rem 0.6rem">✕</button>
      <div style="grid-column:1 / -1">
        <label style="font-size:0.7rem">Location (optional)</label>
        <input type="text" data-ts-loc value="${escapeHtml(slot.location || '')}" placeholder="e.g. Main pitch" style="width:100%" />
      </div>
    </div>`;
  // Summary block — shows what's currently saved, so the card doesn't look
  // identical before and after save. Sorted by day-of-week.
  const sortedSavedSlots = [...trainingSlots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const savedSummaryHtml = sortedSavedSlots.length
    ? `
      <div style="background:#f5f7fa;border:1px solid #e3e7ee;border-radius:6px;padding:0.6rem 0.7rem;margin-bottom:0.6rem">
        <div style="font-size:0.72rem;font-weight:600;color:#556;margin-bottom:0.3rem">Currently saved</div>
        <ul style="margin:0;padding-left:1.1rem;font-size:0.85rem">
          ${sortedSavedSlots.map(s => `
            <li><strong>${DAY_NAMES[s.day]}</strong> · ${fmtTimeHHMM(s.start)}–${fmtTimeHHMM(s.end)}${s.location ? ' · ' + escapeHtml(s.location) : ''}</li>
          `).join('')}
        </ul>
      </div>`
    : `
      <div class="muted" style="font-size:0.75rem;margin-bottom:0.5rem">No sessions saved yet.</div>`;

  // Shareable parent link — shown only once a schedule is saved, since the
  // link is useless without one (the public page just says "no schedule yet").
  const base = location.origin + location.pathname;
  const trainingUrl = `${base}#/train/${team.id}`;
  const trainingLinkHtml = sortedSavedSlots.length ? `
    <div style="margin-top:0.6rem;padding:0.6rem 0.7rem;background:#fff;border:1px dashed #aac;border-radius:6px">
      <div style="font-size:0.72rem;font-weight:600;color:#556;margin-bottom:0.3rem">Parent training link</div>
      <p class="muted" style="font-size:0.72rem;margin:0 0 0.3rem">Permanent — always shows the next upcoming session. Share once, pin it, never think about it again.</p>
      <div style="display:flex;gap:0.35rem;align-items:stretch">
        <input type="text" readonly id="ts-link-url" value="${escapeHtml(trainingUrl)}"
          style="flex:1;padding:0.4rem 0.5rem;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.8rem;border:1px solid #ccc;border-radius:4px;background:#fafafa" />
        <button type="button" class="btn-secondary" id="ts-link-copy" style="padding:0.4rem 0.6rem;font-size:0.78rem">📋 Copy</button>
        <a href="${escapeHtml(trainingUrl)}" target="_blank" rel="noopener" class="btn-secondary" style="padding:0.4rem 0.6rem;font-size:0.78rem;text-decoration:none">↗ Open</a>
      </div>
      <button type="button" class="btn-secondary" id="ts-link-whatsapp" style="margin-top:0.35rem;padding:0.4rem 0.6rem;font-size:0.78rem">💬 Share on WhatsApp</button>
      <div id="ts-link-msg" class="muted" style="font-size:0.72rem;min-height:1em;margin-top:0.3rem"></div>
    </div>` : '';

  const trainingScheduleCard = canEdit ? `
    <div class="card">
      <h3 style="margin-top:0">Training schedule</h3>
      <p class="muted" style="font-size:0.72rem;margin:0 0 0.5rem">
        Recurring weekly sessions. Add one row per training night — the parent training link and coach attendance tracker use this to generate each week's session automatically.
      </p>
      ${savedSummaryHtml}
      <!-- Attendance pills for the next upcoming training session (decorated after mount) -->
      ${sortedSavedSlots.length ? `<div id="ts-next-attendance" style="margin-top:0.3rem"></div>` : ''}
      ${trainingLinkHtml}
      <details style="margin-top:0.6rem">
        <summary style="cursor:pointer;font-size:0.82rem;color:#356">${sortedSavedSlots.length ? '✎ Edit schedule' : '+ Set up schedule'}</summary>
        <div style="padding-top:0.5rem">
          <div id="ts-rows">
            ${trainingSlots.length ? trainingSlots.map(trainingRowHtml).join('') : ''}
          </div>
          <button type="button" class="btn-secondary" id="ts-add" style="margin-top:0.2rem">+ Add session</button>
          <div id="ts-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.4rem"></div>
          <button class="primary" id="ts-save" style="margin-top:0.3rem">Save training schedule</button>
        </div>
      </details>
    </div>
  ` : '';

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
    const numBadge = `<div class="sc-num-badge" style="position:absolute;top:-4px;left:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#1e3a8a;color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);z-index:2">${p.number ?? '–'}</div>`;
    return `
    <div class="sc-card" data-player="${p.id}">
      <button class="sc-header" data-open-modal type="button">
        <div style="position:relative;flex-shrink:0">
          ${numBadge}
          <div class="sc-chip ${p.photo_url ? 'has-photo' : ''}" ${p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
            ${p.photo_url ? '' : `<div class="sc-chip-initials" style="color:#fff;font-weight:600;font-size:1rem">${escapeHtml((shortName(p.name)[0] || '?').toUpperCase())}</div>`}
          </div>
        </div>
        <div class="sc-chip-info">
          <div class="sc-chip-name">${escapeHtml(shortName(p.name))}</div>
          <div class="sc-chip-pos">${p.position || '—'}</div>
        </div>
        <div class="sc-chevron">✎</div>
      </button>
    </div>
  `;
  };

  // Build the grid — when filter is "All", split into position groups with headings
  let grid;
  if (!visible.length) {
    grid = `<p class="muted" style="text-align:center;padding:2rem">No players in this group.</p>`;
  } else if (currentFilter === 'All') {
    const groupOrder = ['Goalkeepers','Defenders','Midfielders','Forwards','Unassigned'];
    const byGroup = {};
    visible.forEach(p => {
      const g = groupForPos(p.position || '');
      (byGroup[g] = byGroup[g] || []).push(p);
    });
    grid = groupOrder
      .filter(g => byGroup[g] && byGroup[g].length)
      .map(g => `
        <h4 style="margin:1rem 0 0.5rem;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:#555">${g} <span class="muted" style="font-weight:normal">(${byGroup[g].length})</span></h4>
        <div class="sc-grid">${byGroup[g].map(cardHtml).join('')}</div>
      `).join('');
  } else {
    grid = `<div class="sc-grid">${visible.map(cardHtml).join('')}</div>`;
  }

  // Sub-tab strip — Team info (team info + home ground) vs Squad (player grid).
  // _squadSubTab persists across re-renders (e.g. when the filter changes) so
  // the coach doesn't get bounced back to Team info each time.
  const subTab = _squadSubTab || 'squad';

  tabEl.innerHTML = `
    <div class="squad-details-layout" data-squad-tab="${subTab}">
      <nav class="lineup-phone-tabs sd-subtabs" role="tablist" aria-label="Squad details sections">
        <button class="lineup-phone-tab ${subTab === 'teaminfo' ? 'active' : ''}" role="tab" aria-selected="${subTab === 'teaminfo' ? 'true' : 'false'}" data-squad-subtab="teaminfo">Team info</button>
        <button class="lineup-phone-tab ${subTab === 'squad' ? 'active' : ''}"    role="tab" aria-selected="${subTab === 'squad' ? 'true' : 'false'}"    data-squad-subtab="squad">Squad</button>
        <button class="lineup-phone-tab ${subTab === 'training' ? 'active' : ''}" role="tab" aria-selected="${subTab === 'training' ? 'true' : 'false'}" data-squad-subtab="training">Training</button>
      </nav>

      <div data-squad-group="teaminfo" class="sd-panel">
        <div class="squad-layout">
          <div class="squad-main">
            ${teamInfoCard}
            ${homeGroundCard}
            ${trainingScheduleCard}
          </div>
        </div>
      </div>

      <div data-squad-group="squad" class="sd-panel">
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
      </div>

      <div data-squad-group="training" class="sd-panel">
        <div class="squad-layout">
          <div class="squad-main">
            <div id="training-tracker-root"><p class="loading">Loading training…</p></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Sub-tab switcher. Persists the choice on _squadSubTab.
  const layoutEl = tabEl.querySelector('.squad-details-layout');
  tabEl.querySelectorAll('[data-squad-subtab]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.squadSubtab;
      if (!key) return;
      _squadSubTab = key;
      if (layoutEl) layoutEl.setAttribute('data-squad-tab', key);
      tabEl.querySelectorAll('[data-squad-subtab]').forEach(b => {
        const on = b.dataset.squadSubtab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (key === 'training') renderTrainingTracker(team, canEdit, players);
    };
  });
  if (subTab === 'training') renderTrainingTracker(team, canEdit, players);

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

      const existingCodes = new Set(players.map(p => p.access_code).filter(Boolean));
      let access_code = makeAccessCode(name, existingCodes);
      let inserted, error;
      // Retry once on rare unique-violation race
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await supabase
          .from('players').insert({ team_id: team.id, name, number, access_code }).select().single();
        if (!r.error) { inserted = r.data; error = null; break; }
        if (r.error.code === '23505') {
          existingCodes.add(access_code);
          access_code = makeAccessCode(name, existingCodes);
          continue;
        }
        error = r.error; break;
      }
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

    // Save team info (name + age group). Updating age_group also stamps
    // age_group_season_year = current season start year, so the auto-bump
    // logic starts from the moment the coach set it.
    const tiSaveBtn = document.getElementById('ti-save');
    if (tiSaveBtn) tiSaveBtn.onclick = async () => {
      const msg = document.getElementById('ti-msg');
      const name = (document.getElementById('ti-name').value || '').trim();
      const ageVal = document.getElementById('ti-age').value;
      if (!name) { msg.textContent = 'Team name is required.'; msg.className = 'error'; return; }
      const payload = { name };
      if (ageVal) {
        payload.age_group = parseInt(ageVal, 10);
        payload.age_group_season_year = computeCurrentSeasonStartYear();
      } else {
        payload.age_group = null;
        payload.age_group_season_year = null;
      }
      // Optimistic with fallback if age columns don't exist yet.
      let data, error;
      {
        const r = await supabase.from('teams').update(payload).eq('id', team.id).select().single();
        data = r.data; error = r.error;
        if (error && /age_group/i.test(error.message || '')) {
          const r2 = await supabase.from('teams').update({ name }).eq('id', team.id).select().single();
          data = r2.data; error = r2.error;
          if (!error) msg.textContent = '⚠ Team name saved. Age group needs a database migration — ask the developer.';
        }
      }
      if (error) { msg.textContent = 'Save failed: ' + error.message; msg.className = 'error'; return; }
      Object.assign(team, data);
      invalidateUserTeamsCache();
      if (!msg.textContent.startsWith('⚠')) { msg.textContent = '✓ Saved'; msg.className = 'ok'; }
      setTimeout(() => renderSquadTab(team, canEdit, players), 700);
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

    // ----- Training schedule editor (Slice 8) -----
    // Add/remove rows are pure DOM (no save until "Save training schedule").
    const tsRows = document.getElementById('ts-rows');
    const tsAddBtn = document.getElementById('ts-add');
    const tsSaveBtn = document.getElementById('ts-save');
    const tsMsg = document.getElementById('ts-msg');
    const buildEmptyRowHtml = (idx) => `
      <div class="training-slot-row" data-ts-row="${idx}" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:0.35rem;align-items:end;margin-bottom:0.4rem">
        <div>
          <label style="font-size:0.7rem">Day</label>
          <select data-ts-day style="width:100%">
            ${DAY_NAMES.map((name, d) => `<option value="${d}" ${d === 2 ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:0.7rem">Start</label>
          <input type="time" data-ts-start value="19:00" style="width:100%" />
        </div>
        <div>
          <label style="font-size:0.7rem">End</label>
          <input type="time" data-ts-end value="20:00" style="width:100%" />
        </div>
        <button type="button" class="btn-secondary" data-ts-remove title="Remove this session" style="padding:0.4rem 0.6rem">✕</button>
        <div style="grid-column:1 / -1">
          <label style="font-size:0.7rem">Location (optional)</label>
          <input type="text" data-ts-loc value="" placeholder="e.g. Main pitch" style="width:100%" />
        </div>
      </div>`;
    if (tsRows) {
      tsRows.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-ts-remove]');
        if (removeBtn) {
          const row = removeBtn.closest('.training-slot-row');
          if (row) row.remove();
          if (tsMsg) { tsMsg.textContent = ''; tsMsg.className = 'muted'; tsMsg.style.fontSize = '0.75rem'; }
        }
      });
    }
    if (tsAddBtn) tsAddBtn.onclick = () => {
      const idx = tsRows.querySelectorAll('.training-slot-row').length;
      tsRows.insertAdjacentHTML('beforeend', buildEmptyRowHtml(idx));
    };
    if (tsSaveBtn) tsSaveBtn.onclick = async () => {
      if (!tsMsg) return;
      tsMsg.className = 'muted'; tsMsg.style.fontSize = '0.75rem';
      const rows = Array.from(tsRows.querySelectorAll('.training-slot-row'));
      const slots = [];
      for (const r of rows) {
        const day = parseInt(r.querySelector('[data-ts-day]').value, 10);
        const start = (r.querySelector('[data-ts-start]').value || '').trim();
        const end = (r.querySelector('[data-ts-end]').value || '').trim();
        const location = (r.querySelector('[data-ts-loc]').value || '').trim();
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          tsMsg.textContent = 'Pick a valid day for every session.'; tsMsg.className = 'error'; return;
        }
        if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
          tsMsg.textContent = 'Start and end times are required for every session.'; tsMsg.className = 'error'; return;
        }
        if (start >= end) {
          tsMsg.textContent = `${DAY_NAMES[day]} session: end time must be after start time.`; tsMsg.className = 'error'; return;
        }
        slots.push({ day, start, end, location });
      }
      const payload = { training_schedule: slots.length ? slots : null };
      const { data, error } = await supabase.from('teams').update(payload).eq('id', team.id).select().single();
      if (error) {
        if (/training_schedule/i.test(error.message || '')) {
          tsMsg.textContent = 'Save failed — the training_schedule column is missing. Run the Slice 8 migration first.';
        } else {
          tsMsg.textContent = 'Save failed: ' + error.message;
        }
        tsMsg.className = 'error'; return;
      }
      Object.assign(team, data);
      tsMsg.textContent = '✓ Saved'; tsMsg.className = 'ok';
      setTimeout(() => renderSquadTab(team, canEdit, players), 700);
    };

    // Parent training link — copy + WhatsApp share handlers.
    const tsLinkCopy = document.getElementById('ts-link-copy');
    const tsLinkWA = document.getElementById('ts-link-whatsapp');
    const tsLinkUrl = document.getElementById('ts-link-url');
    const tsLinkMsg = document.getElementById('ts-link-msg');
    const flashLink = (txt, cls = 'ok') => {
      if (!tsLinkMsg) return;
      tsLinkMsg.textContent = txt; tsLinkMsg.className = cls;
      setTimeout(() => { if (tsLinkMsg.textContent === txt) { tsLinkMsg.textContent = ''; tsLinkMsg.className = 'muted'; } }, 2000);
    };
    if (tsLinkCopy && tsLinkUrl) tsLinkCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(tsLinkUrl.value);
        flashLink('✓ Copied to clipboard');
      } catch {
        // Fallback for browsers without the async clipboard API
        tsLinkUrl.select(); tsLinkUrl.setSelectionRange(0, 99999);
        try { document.execCommand('copy'); flashLink('✓ Copied'); }
        catch { flashLink('Copy failed — select the URL manually.', 'error'); }
      }
    };
    if (tsLinkWA && tsLinkUrl) tsLinkWA.onclick = () => {
      const teamName = team.name || 'the team';
      const msg = `${teamName} — training attendance link (always shows the next session):\n\n${tsLinkUrl.value}\n\nEnter your child's parent code on first use.`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank', 'noopener');
    };

    // Attendance counts for the next training session — glance summary on the
    // schedule card, so the coach doesn't have to open the Training subtab.
    (async () => {
      const box = document.getElementById('ts-next-attendance');
      if (!box) return;
      const nextTr = nextUpcomingTraining(team);
      if (!nextTr) return;
      const dateStr = toLocalDateStr(nextTr.date);
      let counts = { available: 0, maybe: 0, unavailable: 0 };
      try {
        const sRes = await supabase
          .from('training_sessions')
          .select('id')
          .eq('team_id', team.id)
          .eq('scheduled_date', dateStr)
          .limit(1);
        const sessionId = sRes.data && sRes.data[0] ? sRes.data[0].id : null;
        if (sessionId) {
          const aRes = await supabase
            .from('training_attendance')
            .select('intent')
            .eq('session_id', sessionId);
          (aRes.data || []).forEach(a => {
            if (a.intent === 'available') counts.available++;
            else if (a.intent === 'maybe') counts.maybe++;
            else if (a.intent === 'unavailable') counts.unavailable++;
          });
        }
      } catch (_) { /* no-op — just show zeroed pills */ }
      const dayName = DAY_NAMES[nextTr.slot.day];
      const timeStr = fmtTimeHHMM(nextTr.slot.start);
      box.innerHTML = `
        <div style="font-size:0.72rem;color:#556;margin-bottom:0.2rem">
          Next session: <strong>${dayName} ${timeStr}</strong> — attendance so far
        </div>
        ${availPillsHtml(counts, players.length)}`;
    })();
  }

  // Build the details form HTML for a player (used by modal)
  const detailsHtml = (p) => `
    <label>Photo</label>
    <div class="photo-row">
      <div class="photo-preview ${p.photo_url ? 'has-photo' : ''}" ${p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
        ${p.photo_url ? '' : '<span>No photo</span>'}
      </div>
      <div class="photo-actions" style="flex:1;min-width:0">
        <!-- Share block: access code + stats-card link + Copy / Open / WhatsApp, right next to the photo -->
        <div class="pm-share-inline" style="background:#f5f7fa;border:1px solid #e3e7ee;border-radius:6px;padding:0.4rem 0.5rem">
          <div style="display:flex;align-items:center;gap:0.35rem;margin-bottom:0.3rem">
            <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:#666">Code</span>
            <strong style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.95rem" data-pm-code-val>${escapeHtml(p.access_code || '—')}</strong>
            <button type="button" class="btn-secondary" data-pm-copy-code title="Copy code" style="font-size:0.7rem;padding:0.15rem 0.4rem;margin-left:auto">📋</button>
          </div>
          <div style="display:flex;gap:0.3rem;flex-wrap:wrap">
            <button type="button" class="btn-secondary" data-pm-copy-link style="font-size:0.72rem;padding:0.3rem 0.5rem">📋 Link</button>
            <button type="button" class="btn-secondary" data-pm-open-link style="font-size:0.72rem;padding:0.3rem 0.5rem">🔗 Open</button>
            <button type="button" class="btn-secondary" data-pm-whatsapp style="font-size:0.72rem;padding:0.3rem 0.5rem">💬 WhatsApp</button>
          </div>
          <div class="muted" data-pm-share-msg style="font-size:0.68rem;min-height:1em;margin-top:0.2rem"></div>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-file id="photo-file-${p.id}" style="display:none" ${canEdit ? '' : 'disabled'} />
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.4rem">
          <button type="button" class="btn-secondary" data-photo-pick style="font-size:0.75rem;padding:0.3rem 0.5rem">${p.photo_url ? 'Replace' : 'Upload'} photo</button>
          ${p.photo_url ? `<button type="button" class="btn-secondary" data-photo-remove style="font-size:0.75rem;padding:0.3rem 0.5rem">Remove</button>` : ''}
        </div>
        <div class="muted photo-msg" data-photo-msg style="font-size:0.7rem;min-height:1em;margin-top:0.15rem"></div>
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
    <div class="codes-box" style="margin-top:0.6rem;padding:0.5rem 0.6rem;background:#f5f7fa;border:1px solid #e3e7ee;border-radius:6px">
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-bottom:0.25rem">Access codes</div>
      <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.95rem">
        <div>Personal: <strong>${escapeHtml(p.access_code || '—')}</strong></div>
        ${p.family_code
          ? `<div style="margin-top:0.15rem">Family: <strong>${escapeHtml(p.family_code)}</strong> ${(() => {
              const sibs = (players || []).filter(q => q.id !== p.id && q.family_code === p.family_code);
              return sibs.length ? `<span class="muted" style="font-family:system-ui;font-size:0.75rem">— shared with ${sibs.map(s => escapeHtml(shortName(s.name))).join(', ')}</span>` : '';
            })()}</div>`
          : ''}
      </div>
      ${canEdit ? `
        <div style="display:flex;gap:0.35rem;margin-top:0.5rem;flex-wrap:wrap">
          <button type="button" class="btn-secondary" data-link-sibling style="font-size:0.8rem;padding:0.35rem 0.6rem">${p.family_code ? 'Manage siblings…' : '🔗 Link sibling…'}</button>
          ${p.family_code ? `<button type="button" class="btn-secondary" data-unlink-sibling style="font-size:0.8rem;padding:0.35rem 0.6rem">Unlink</button>` : ''}
          <button type="button" class="btn-secondary" data-share-card-whatsapp style="font-size:0.8rem;padding:0.35rem 0.6rem">🎴 Share stats card (WhatsApp)</button>
        </div>
      ` : ''}
      <div class="muted" style="font-size:0.7rem;margin-top:0.4rem">Parents enter one of these codes once on the availability link to mark this player, or on the stats-card link to unlock the season-stats card.</div>
    </div>
    ${badgesSectionHtml(p)}
    ${canEdit ? `<button class="del-btn" data-remove style="margin-top:0.6rem">Remove player</button>` : ''}
  `;

  // Badges section inside the player modal. Shows earned badges (all-time) with
  // an X to remove when canEdit, plus an "Award badge" button that opens the
  // picker modal. The section is rendered even for non-editors (read-only).
  const badgesSectionHtml = (p) => {
    const earned = badgesForPlayer(team.id, p.id, null); // all-time
    const chipsHtml = earned.length === 0
      ? `<p class="muted" style="margin:0.25rem 0 0;font-size:0.8rem">No badges yet.</p>`
      : `<div class="pb-chip-row">
           ${earned.map(b => {
             const e = badgeEntry(b.badge_key);
             const nm = e ? e.name : b.badge_key;
             return `<span class="pb-chip" title="${escapeHtml(nm)}${b.note ? ' — ' + escapeHtml(b.note) : ''}">
                       <span class="pb-chip-emoji">${badgeEmoji(b.badge_key)}</span>
                       <span class="pb-chip-name">${escapeHtml(nm)}</span>
                       ${canEdit ? `<button type="button" class="pb-chip-x" data-badge-remove="${escapeHtml(b.id)}" aria-label="Remove ${escapeHtml(nm)}">✕</button>` : ''}
                     </span>`;
           }).join('')}
         </div>`;
    return `
      <div class="pb-section" style="margin-top:0.8rem;padding:0.6rem;background:#fff;border:1px solid #e3e7ee;border-radius:6px">
        <div style="display:flex;align-items:center;gap:0.4rem;justify-content:space-between">
          <strong style="font-size:0.85rem">🏅 Badges</strong>
          ${canEdit ? `<button type="button" class="btn-secondary" data-award-badge style="font-size:0.78rem;padding:0.3rem 0.55rem">+ Award badge…</button>` : ''}
        </div>
        ${chipsHtml}
      </div>
    `;
  };

  const openPlayerModal = (pid) => {
    const p = players.find(x => x.id === pid);
    if (!p) return;
    const existing = document.querySelector('.player-edit-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'map-modal-overlay player-edit-overlay';
    overlay.innerHTML = `
      <div class="map-modal" style="max-width:480px;width:92vw;max-height:90vh;display:flex;flex-direction:column">
        <div class="map-modal-header">
          <strong>${escapeHtml(p.name || 'Player')} ${p.number != null ? `· #${p.number}` : ''}</strong>
          <button class="btn-secondary" id="pe-close" type="button">✕</button>
        </div>
        <div class="map-modal-body" style="padding:1rem;overflow-y:auto;flex:1">
          ${detailsHtml(p)}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#pe-close').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    wirePlayerDetails(overlay, pid, close);
  };

  // Wire handlers inside a scoped root (modal or card)
  const wirePlayerDetails = (root, pid, onChange) => {
    root.querySelectorAll('[data-field]').forEach(input => {
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
        if (field === 'number' || field === 'position' || field === 'name') {
          players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
          renderSquadTab(team, canEdit, players);
        }
      });
    });
    const removeBtn = root.querySelector('[data-remove]');
    if (removeBtn) removeBtn.onclick = async () => {
      const player = players.find(p => p.id === pid);
      if (!confirm(`Remove ${player?.name || 'this player'}?`)) return;
      const { error } = await supabase.from('players').delete().eq('id', pid);
      if (error) { alert('Remove failed: ' + error.message); return; }
      await logAudit(team.id, 'player', pid, 'delete', { name: player?.name });
      const idx = players.findIndex(p => p.id === pid);
      if (idx >= 0) players.splice(idx, 1);
      if (onChange) onChange();
      renderSquadTab(team, canEdit, players);
    };
    const linkBtn = root.querySelector('[data-link-sibling]');
    if (linkBtn) linkBtn.onclick = () => openLinkSiblingModal(team, players, pid, () => { if (onChange) onChange(); renderSquadTab(team, canEdit, players); });
    // 🎴 Share stats card — opens WhatsApp with a pre-filled message containing
    // the player's short name, the public card URL, and their access code (or
    // family code if linked). Parents/kids open the link, enter the code once,
    // and see the FIFA-style season stats card.
    const shareCardBtn = root.querySelector('[data-share-card-whatsapp]');
    if (shareCardBtn) shareCardBtn.onclick = () => {
      const player = players.find(q => q.id === pid);
      if (!player) return;
      const base = location.origin + location.pathname;
      const cardUrl = `${base}#/card/${team.id}`;
      const code = player.family_code || player.access_code || '—';
      const lines = [
        `Hi — here's ${shortName(player.name)}'s stats card for ${team.name}${ageGroupLabel(team) ? ' (' + ageGroupLabel(team) + ')' : ''}:`,
        '',
        cardUrl,
        '',
        `Access code: ${code}`,
        '',
        'Save the link — it updates automatically every game.'
      ];
      const text = lines.join('\n');
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank', 'noopener');
    };

    // Inline share block (right of photo) — code + link + WhatsApp quick buttons.
    // Uses the same stats-card URL + code as the detailed share button above.
    const pmShareMsg = root.querySelector('[data-pm-share-msg]');
    const flashShareMsg = (txt) => {
      if (!pmShareMsg) return;
      pmShareMsg.textContent = txt;
      setTimeout(() => { if (pmShareMsg.textContent === txt) pmShareMsg.textContent = ''; }, 2000);
    };
    const playerCardUrl = () => `${location.origin + location.pathname}#/card/${team.id}`;
    const playerCode = () => {
      const pl = players.find(q => q.id === pid);
      return pl ? (pl.family_code || pl.access_code || '') : '';
    };
    const copyToClipboard = async (txt) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        return true;
      } catch (_) { return false; }
    };
    const copyCodeBtn = root.querySelector('[data-pm-copy-code]');
    if (copyCodeBtn) copyCodeBtn.onclick = async () => {
      const code = playerCode();
      if (!code) { flashShareMsg('No code yet.'); return; }
      const ok = await copyToClipboard(code);
      flashShareMsg(ok ? `Copied ${code}` : 'Copy failed');
    };
    const copyLinkBtn = root.querySelector('[data-pm-copy-link]');
    if (copyLinkBtn) copyLinkBtn.onclick = async () => {
      const ok = await copyToClipboard(playerCardUrl());
      flashShareMsg(ok ? 'Link copied' : 'Copy failed');
    };
    const openLinkBtn = root.querySelector('[data-pm-open-link]');
    if (openLinkBtn) openLinkBtn.onclick = () => {
      window.open(playerCardUrl(), '_blank', 'noopener');
    };
    const pmWhatsAppBtn = root.querySelector('[data-pm-whatsapp]');
    if (pmWhatsAppBtn) pmWhatsAppBtn.onclick = () => {
      const player = players.find(q => q.id === pid);
      if (!player) return;
      const cardUrl = playerCardUrl();
      const code = player.family_code || player.access_code || '—';
      const lines = [
        `Hi — here's ${shortName(player.name)}'s stats card for ${team.name}${ageGroupLabel(team) ? ' (' + ageGroupLabel(team) + ')' : ''}:`,
        '',
        cardUrl,
        '',
        `Access code: ${code}`,
        '',
        'Save the link — it updates automatically every game.'
      ];
      const waUrl = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
      window.open(waUrl, '_blank', 'noopener');
    };
    const unlinkBtn = root.querySelector('[data-unlink-sibling]');
    if (unlinkBtn) unlinkBtn.onclick = async () => {
      const player = players.find(p => p.id === pid);
      if (!player?.family_code) return;
      if (!confirm(`Remove ${player.name} from the family group? Other siblings keep the shared code.`)) return;
      const { error } = await supabase.from('players').update({ family_code: null }).eq('id', pid);
      if (error) { alert('Unlink failed: ' + error.message); return; }
      const remaining = players.filter(q => q.id !== pid && q.family_code === player.family_code);
      if (remaining.length === 1) {
        await supabase.from('players').update({ family_code: null }).eq('id', remaining[0].id);
        remaining[0].family_code = null;
      }
      player.family_code = null;
      await logAudit(team.id, 'player', pid, 'update', { field: 'family_code', to: null });
      if (onChange) onChange();
      renderSquadTab(team, canEdit, players);
    };
    const photoPickBtn = root.querySelector('[data-photo-pick]');
    const photoFileInput = root.querySelector('[data-photo-file]');
    const photoRemoveBtn = root.querySelector('[data-photo-remove]');
    const photoMsg = root.querySelector('[data-photo-msg]');
    if (photoPickBtn && photoFileInput) {
      photoPickBtn.onclick = () => photoFileInput.click();
      photoFileInput.onchange = async () => {
        const file = photoFileInput.files && photoFileInput.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          if (photoMsg) { photoMsg.textContent = 'File too large (max 10MB)'; photoMsg.className = 'muted photo-msg error'; }
          photoFileInput.value = ''; return;
        }
        const cropped = await openPhotoCropper(file);
        photoFileInput.value = '';
        if (!cropped) { if (photoMsg) { photoMsg.textContent = ''; photoMsg.className = 'muted photo-msg'; } return; }
        if (photoMsg) { photoMsg.textContent = 'Uploading…'; photoMsg.className = 'muted photo-msg'; }
        photoPickBtn.disabled = true;
        try {
          const updated = await uploadPlayerPhoto(pid, cropped);
          const player = players.find(p => p.id === pid);
          if (player) player.photo_url = updated.photo_url;
          await logAudit(team.id, 'player', pid, 'update', { field: 'photo_url', to: updated.photo_url });
          if (onChange) onChange();
          renderSquadTab(team, canEdit, players);
        } catch (err) {
          if (photoMsg) { photoMsg.textContent = 'Upload failed: ' + (err.message || err); photoMsg.className = 'muted photo-msg error'; }
          photoPickBtn.disabled = false;
          photoFileInput.value = '';
        }
      };
    }
    if (photoRemoveBtn) photoRemoveBtn.onclick = async () => {
      const player = players.find(p => p.id === pid);
      if (!confirm(`Remove photo for ${player?.name || 'this player'}?`)) return;
      if (photoMsg) { photoMsg.textContent = 'Removing…'; photoMsg.className = 'muted photo-msg'; }
      photoRemoveBtn.disabled = true;
      try {
        await removePlayerPhoto(pid, player?.photo_url);
        if (player) player.photo_url = null;
        await logAudit(team.id, 'player', pid, 'update', { field: 'photo_url', to: null });
        if (onChange) onChange();
        renderSquadTab(team, canEdit, players);
      } catch (err) {
        if (photoMsg) { photoMsg.textContent = 'Remove failed: ' + (err.message || err); photoMsg.className = 'muted photo-msg error'; }
        photoRemoveBtn.disabled = false;
      }
    };

    // ---------- Badges (Slice 9a) — award + remove inside player modal ----------
    // Re-render only the .pb-section element so we don't lose the scroll position
    // in the modal or rebuild the whole Squad tab for a badge change. Wires the
    // fresh Award + remove buttons after every re-render.
    const rerenderBadges = () => {
      const section = root.querySelector('.pb-section');
      const player = players.find(x => x.id === pid);
      if (!section || !player) return;
      // badgesSectionHtml returns a div wrapper — strip it and inject the inner HTML.
      const tmp = document.createElement('div');
      tmp.innerHTML = badgesSectionHtml(player);
      const fresh = tmp.firstElementChild;
      if (fresh) section.replaceWith(fresh);
      wireBadgeHandlers();
    };

    const wireBadgeHandlers = () => {
      const awardBtn = root.querySelector('[data-award-badge]');
      if (awardBtn) awardBtn.onclick = () => {
        const player = players.find(x => x.id === pid);
        if (!player) return;
        openAwardBadgeModal({
          team, player,
          onAwarded: async (newBadge) => {
            rerenderBadges();
            // Optional share-to-WhatsApp prompt immediately after awarding so
            // the coach can pass the news straight to the parent group chat.
            openBadgeShareConfirm(team, player, newBadge);
          }
        });
      };
      root.querySelectorAll('[data-badge-remove]').forEach(btn => {
        btn.onclick = async () => {
          const badgeId = btn.dataset.badgeRemove;
          const b = getCachedTeamBadges(team.id).find(x => x.id === badgeId);
          const label = b ? (badgeEntry(b.badge_key)?.name || b.badge_key) : 'this badge';
          if (!confirm(`Remove ${label}?`)) return;
          try {
            await removeBadge(badgeId, team.id);
          } catch (e) {
            alert('Remove failed: ' + (e.message || e));
            return;
          }
          rerenderBadges();
        };
      });
    };
    wireBadgeHandlers();
  };

  tabEl.querySelectorAll('.sc-card').forEach(cardEl => {
    const pid = cardEl.dataset.player;
    const openBtn = cardEl.querySelector('[data-open-modal]');
    if (openBtn) openBtn.onclick = () => openPlayerModal(pid);
  });
}

// ---------- Training tracker (coach-side, Squad tab > Training subtab) ----------
// Shows the next upcoming session with per-player intent + attended toggle,
// plus a history list of past sessions, plus override controls
// (cancel / move venue / time) for a single week.
async function renderTrainingTracker(team, canEdit, players) {
  const root = document.getElementById('training-tracker-root');
  if (!root) return;
  root.innerHTML = `<p class="loading">Loading training…</p>`;

  const slots = parseTrainingSchedule(team);
  if (!slots.length) {
    root.innerHTML = `
      <div class="card">
        <h3 style="margin-top:0">Training</h3>
        <p class="muted">No weekly training schedule set yet. Add one on the Team info tab to start tracking attendance.</p>
      </div>`;
    return;
  }

  // Resolve next upcoming session from the schedule + materialise the row.
  const next = nextUpcomingTraining(team);
  if (!next) { root.innerHTML = `<div class="card"><p class="muted">Could not resolve the next training session.</p></div>`; return; }
  const dateStr = toLocalDateStr(next.date);

  let session = null;
  let migrationMissing = false;
  {
    const { data, error } = await supabase.rpc('ensure_training_session', {
      p_team_id: team.id, p_date: dateStr
    });
    if (error) {
      migrationMissing = /ensure_training_session|training_sessions/i.test(error.message || '');
      console.warn('ensure_training_session failed:', error.message);
    } else if (data) {
      session = Array.isArray(data) ? data[0] : data;
    }
  }

  if (migrationMissing) {
    root.innerHTML = `
      <div class="card">
        <h3 style="margin-top:0">Training</h3>
        <p class="error">The Slice 8 database migration hasn't been applied yet — training attendance can't be tracked until it is. Ask the developer.</p>
      </div>`;
    return;
  }

  // Fetch existing attendance for this session + history of past sessions.
  let attendance = [];
  let pastSessions = [];
  if (session?.id) {
    const { data: att } = await supabase
      .from('training_attendance')
      .select('player_id,intent,attended,note,responded_by,updated_at')
      .eq('session_id', session.id);
    attendance = att || [];
  }
  {
    const { data: past } = await supabase
      .from('training_sessions')
      .select('id,scheduled_date,scheduled_start,scheduled_end,location,status,notes')
      .eq('team_id', team.id)
      .lt('scheduled_date', dateStr)
      .order('scheduled_date', { ascending: false })
      .limit(12);
    pastSessions = past || [];
  }

  const effectiveSlot = {
    day: next.slot.day,
    start: session?.scheduled_start || next.slot.start,
    end:   session?.scheduled_end   || next.slot.end,
    location: session?.location ?? next.slot.location ?? team.home_ground_name ?? ''
  };
  const cancelled = session?.status === 'cancelled';
  const moved = !cancelled && session && (session.scheduled_start !== next.slot.start || session.scheduled_end !== next.slot.end || (session.location ?? '') !== (next.slot.location ?? ''));

  const byPlayer = Object.fromEntries(attendance.map(a => [a.player_id, a]));
  const sortedPlayers = [...players].sort((a, b) => {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });

  const chipPhoto = (p) => p.photo_url
    ? `<div style="width:30px;height:30px;border-radius:50%;background:#eee center/cover no-repeat url('${escapeHtml(p.photo_url)}');flex-shrink:0"></div>`
    : `<div style="width:30px;height:30px;border-radius:50%;background:#e6e6e6;display:flex;align-items:center;justify-content:center;font-weight:600;color:#666;font-size:0.75rem;flex-shrink:0">${escapeHtml(String(p.number || ''))}</div>`;

  const rowHtml = (p) => {
    const a = byPlayer[p.id];
    const intent = a?.intent;
    const intentPill = intent === 'available' ? `<span class="pill" style="background:#d4edda;color:#155724">✅ Available</span>`
      : intent === 'maybe' ? `<span class="pill" style="background:#fff3cd;color:#856404">🤔 Maybe</span>`
      : intent === 'unavailable' ? `<span class="pill" style="background:#f8d7da;color:#721c24">❌ Unavailable</span>`
      : `<span class="muted" style="font-size:0.75rem">No response</span>`;
    const responder = a?.responded_by ? `<span class="muted" style="font-size:0.7rem">· ${escapeHtml(a.responded_by)}</span>` : '';
    const note = a?.note ? `<div class="muted" style="font-size:0.7rem;margin-top:0.15rem">${escapeHtml(a.note)}</div>` : '';
    const att = a?.attended;
    const attendedBtn = `<button type="button" class="btn-secondary tt-att-btn" data-player="${p.id}" data-val="true" style="padding:0.25rem 0.55rem;font-size:0.72rem;background:${att === true ? '#2a7' : '#fff'};color:${att === true ? '#fff' : '#333'};border:1px solid ${att === true ? '#2a7' : '#ccc'}">✓ Attended</button>`;
    const noShowBtn = `<button type="button" class="btn-secondary tt-att-btn" data-player="${p.id}" data-val="false" style="padding:0.25rem 0.55rem;font-size:0.72rem;background:${att === false ? '#c33' : '#fff'};color:${att === false ? '#fff' : '#333'};border:1px solid ${att === false ? '#c33' : '#ccc'}">✕ No show</button>`;
    const clearBtn = (att === true || att === false) ? `<button type="button" class="btn-secondary tt-att-btn" data-player="${p.id}" data-val="null" style="padding:0.25rem 0.55rem;font-size:0.72rem">Clear</button>` : '';
    return `
      <div class="tt-row" data-tt-row="${p.id}" style="display:flex;gap:0.6rem;align-items:center;padding:0.45rem 0;border-top:1px solid #eee">
        ${chipPhoto(p)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.88rem">#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</div>
          <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap">${intentPill}${responder}</div>
          ${note}
        </div>
        <div style="display:flex;gap:0.3rem;flex-wrap:wrap;justify-content:flex-end">${attendedBtn}${noShowBtn}${clearBtn}</div>
      </div>`;
  };

  const counts = {
    available: attendance.filter(a => a.intent === 'available').length,
    maybe: attendance.filter(a => a.intent === 'maybe').length,
    unavailable: attendance.filter(a => a.intent === 'unavailable').length,
    attended: attendance.filter(a => a.attended === true).length,
    noshow: attendance.filter(a => a.attended === false).length,
  };

  const base = location.origin + location.pathname;
  const trainingUrl = `${base}#/train/${team.id}`;

  const overrideControlsHtml = canEdit && !cancelled ? `
    <details style="margin-top:0.5rem">
      <summary style="cursor:pointer;font-size:0.82rem;color:#356">⚙ Override this session (cancel / move)</summary>
      <div style="padding:0.5rem;border:1px solid #eee;border-radius:4px;margin-top:0.35rem">
        <label style="font-size:0.72rem">Start</label>
        <input type="time" id="tt-ov-start" value="${fmtTimeHHMM(effectiveSlot.start)}" style="width:100%;margin-bottom:0.3rem" />
        <label style="font-size:0.72rem">End</label>
        <input type="time" id="tt-ov-end" value="${fmtTimeHHMM(effectiveSlot.end)}" style="width:100%;margin-bottom:0.3rem" />
        <label style="font-size:0.72rem">Location</label>
        <input type="text" id="tt-ov-loc" value="${escapeHtml(effectiveSlot.location || '')}" placeholder="e.g. Indoor hall (weather)" style="width:100%;margin-bottom:0.3rem" />
        <label style="font-size:0.72rem">Note (shown to parents)</label>
        <input type="text" id="tt-ov-note" value="${escapeHtml(session?.notes || '')}" placeholder="Optional" style="width:100%;margin-bottom:0.4rem" />
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="primary" id="tt-ov-save" type="button">💾 Save changes</button>
          <button class="btn-secondary" id="tt-ov-cancel-session" type="button" style="color:#c33">🚫 Cancel this session</button>
          ${moved ? `<button class="btn-secondary" id="tt-ov-reset" type="button">↺ Back to recurring</button>` : ''}
        </div>
        <div id="tt-ov-msg" class="muted" style="font-size:0.72rem;min-height:1em;margin-top:0.35rem"></div>
      </div>
    </details>` : '';

  const cancelledHtml = cancelled && canEdit ? `
    <div style="padding:0.6rem;border:1px solid #f8d7da;background:#fef1f2;border-radius:4px;margin-top:0.5rem">
      <p style="margin:0 0 0.4rem;color:#721c24"><strong>This session is cancelled.</strong>${session?.notes ? ' ' + escapeHtml(session.notes) : ''}</p>
      <button class="btn-secondary" id="tt-uncancel" type="button">↺ Un-cancel this session</button>
    </div>` : '';

  const pastRows = pastSessions.map(s => {
    const d = new Date(s.scheduled_date + 'T00:00:00');
    const label = `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
    const statusChip = s.status === 'cancelled' ? `<span class="pill" style="background:#f8d7da;color:#721c24">Cancelled</span>` : '';
    return `
      <button type="button" class="tt-past-row" data-session="${s.id}" style="display:flex;width:100%;gap:0.5rem;align-items:center;padding:0.45rem 0.2rem;border:none;border-top:1px solid #eee;background:transparent;text-align:left;cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.85rem">${label}</div>
          <div class="muted" style="font-size:0.72rem">${fmtTimeHHMM(s.scheduled_start)}–${fmtTimeHHMM(s.scheduled_end)}${s.location ? ' · ' + escapeHtml(s.location) : ''}</div>
        </div>
        ${statusChip}
        <span style="color:#888;font-size:0.8rem">›</span>
      </button>`;
  }).join('');

  root.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        Next training
        ${cancelled ? `<span class="pill" style="background:#f8d7da;color:#721c24">Cancelled</span>` : ''}
        ${moved ? `<span class="pill" style="background:#fff3cd;color:#856404">Overridden</span>` : ''}
      </h3>
      <p class="muted" style="margin:0">${fmtTrainingHeader(next.date, effectiveSlot)}</p>
      ${effectiveSlot.location ? `<p class="muted" style="margin:0.25rem 0 0">📍 ${escapeHtml(effectiveSlot.location)}</p>` : ''}
      <p class="muted" style="font-size:0.75rem;margin-top:0.5rem">Parent link: <a href="${trainingUrl}" target="_blank" rel="noopener">${trainingUrl}</a></p>
      ${cancelledHtml}
      ${overrideControlsHtml}
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem;font-size:0.78rem">
        <span>✅ ${counts.available} available</span>
        <span>🤔 ${counts.maybe} maybe</span>
        <span>❌ ${counts.unavailable} unavailable</span>
        <span style="margin-left:auto">Attended: ${counts.attended} · No-show: ${counts.noshow}</span>
      </div>
      <div id="tt-list" style="margin-top:0.5rem">${sortedPlayers.map(rowHtml).join('')}</div>
      <div id="tt-msg" class="muted" style="font-size:0.72rem;min-height:1em;margin-top:0.3rem"></div>
    </div>
    ${pastSessions.length ? `
      <div class="card">
        <h3 style="margin-top:0">Recent sessions</h3>
        <div>${pastRows}</div>
      </div>` : ''}
  `;

  // --- Wire attendance toggles ---
  const msgEl = document.getElementById('tt-msg');
  const flash = (txt, cls = 'muted') => {
    if (!msgEl) return;
    msgEl.textContent = txt; msgEl.className = cls;
    setTimeout(() => { if (msgEl.textContent === txt) { msgEl.textContent = ''; msgEl.className = 'muted'; } }, 2200);
  };

  root.querySelectorAll('.tt-att-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!session?.id) return;
      const pid = btn.dataset.player;
      const val = btn.dataset.val;
      const attended = val === 'true' ? true : (val === 'false' ? false : null);
      const existing = byPlayer[pid];
      // Upsert: need a row with (session_id, player_id). Keep intent if present.
      const row = {
        session_id: session.id,
        player_id: pid,
        attended,
        intent: existing?.intent || null,
        note: existing?.note || null,
        responded_by: existing?.responded_by || null,
      };
      const { error } = await supabase.from('training_attendance')
        .upsert(row, { onConflict: 'session_id,player_id' });
      if (error) { flash('Save failed: ' + error.message, 'error'); return; }
      byPlayer[pid] = { ...row };
      flash('✓ Saved', 'ok');
      renderTrainingTracker(team, canEdit, players);
    };
  });

  // --- Wire override controls ---
  const ovSave = document.getElementById('tt-ov-save');
  const ovCancel = document.getElementById('tt-ov-cancel-session');
  const ovReset = document.getElementById('tt-ov-reset');
  const ovMsg = document.getElementById('tt-ov-msg');
  const saveOverride = async (patch) => {
    if (!session?.id) return;
    const { error } = await supabase.from('training_sessions')
      .update(patch).eq('id', session.id);
    if (error) {
      if (ovMsg) { ovMsg.textContent = 'Save failed: ' + error.message; ovMsg.className = 'error'; }
      return false;
    }
    return true;
  };
  if (ovSave) ovSave.onclick = async () => {
    const start = document.getElementById('tt-ov-start').value;
    const end = document.getElementById('tt-ov-end').value;
    const loc = document.getElementById('tt-ov-loc').value.trim();
    const note = document.getElementById('tt-ov-note').value.trim();
    if (!start || !end || start >= end) {
      ovMsg.textContent = 'End time must be after start.'; ovMsg.className = 'error'; return;
    }
    // "moved" if it differs from the recurring template, else "scheduled" (reset).
    const tpl = next.slot;
    const differs = (start !== tpl.start) || (end !== tpl.end) || (loc !== (tpl.location || ''));
    const ok = await saveOverride({
      scheduled_start: start,
      scheduled_end: end,
      location: loc || null,
      status: differs ? 'moved' : 'scheduled',
      notes: note || null
    });
    if (ok) renderTrainingTracker(team, canEdit, players);
  };
  if (ovCancel) ovCancel.onclick = async () => {
    if (!confirm('Cancel this training session? Parents viewing the training link will see a cancellation notice.')) return;
    const note = document.getElementById('tt-ov-note')?.value.trim() || null;
    const ok = await saveOverride({ status: 'cancelled', notes: note });
    if (ok) renderTrainingTracker(team, canEdit, players);
  };
  if (ovReset) ovReset.onclick = async () => {
    const ok = await saveOverride({
      scheduled_start: next.slot.start,
      scheduled_end: next.slot.end,
      location: next.slot.location || null,
      status: 'scheduled',
      notes: null
    });
    if (ok) renderTrainingTracker(team, canEdit, players);
  };
  const uncancelBtn = document.getElementById('tt-uncancel');
  if (uncancelBtn) uncancelBtn.onclick = async () => {
    const ok = await saveOverride({ status: 'scheduled', notes: null });
    if (ok) renderTrainingTracker(team, canEdit, players);
  };

  // --- Past session drill-down ---
  root.querySelectorAll('.tt-past-row').forEach(btn => {
    btn.onclick = () => openPastTrainingModal(btn.dataset.session, team, players);
  });
}

// Modal showing attendance for a past training session (read + edit attended flag).
async function openPastTrainingModal(sessionId, team, players) {
  const { data: s } = await supabase
    .from('training_sessions')
    .select('id,scheduled_date,scheduled_start,scheduled_end,location,status,notes')
    .eq('id', sessionId).maybeSingle();
  if (!s) return;
  const { data: att } = await supabase
    .from('training_attendance')
    .select('player_id,intent,attended,note,responded_by')
    .eq('session_id', sessionId);
  const byPlayer = Object.fromEntries((att || []).map(a => [a.player_id, a]));
  const sortedPlayers = [...players].sort((a, b) => {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return (a.name || '').localeCompare(b.name || '');
  });
  const d = new Date(s.scheduled_date + 'T00:00:00');
  const header = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' })} · ${fmtTimeHHMM(s.scheduled_start)}–${fmtTimeHHMM(s.scheduled_end)}`;

  const rowHtml = (p) => {
    const a = byPlayer[p.id];
    const intent = a?.intent ? `<span class="muted" style="font-size:0.72rem">Intent: ${a.intent}</span>` : `<span class="muted" style="font-size:0.72rem">No response</span>`;
    const att = a?.attended;
    return `
      <div style="display:flex;gap:0.5rem;align-items:center;padding:0.4rem 0;border-top:1px solid #eee">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.85rem">#${escapeHtml(String(p.number || '?'))} ${escapeHtml(p.name || '')}</div>
          ${intent}
        </div>
        <div style="display:flex;gap:0.3rem">
          <button type="button" class="btn-secondary pt-att" data-player="${p.id}" data-val="true" style="padding:0.2rem 0.45rem;font-size:0.7rem;background:${att === true ? '#2a7' : '#fff'};color:${att === true ? '#fff' : '#333'}">✓</button>
          <button type="button" class="btn-secondary pt-att" data-player="${p.id}" data-val="false" style="padding:0.2rem 0.45rem;font-size:0.7rem;background:${att === false ? '#c33' : '#fff'};color:${att === false ? '#fff' : '#333'}">✕</button>
        </div>
      </div>`;
  };

  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:520px;width:94vw;max-height:90vh;overflow:auto">
      <div class="map-modal-header">
        <strong>${header}</strong>
        <button class="btn-secondary" id="pt-close" type="button">✕</button>
      </div>
      <div class="map-modal-body" style="padding:0.8rem">
        ${s.location ? `<p class="muted" style="margin:0 0 0.3rem">📍 ${escapeHtml(s.location)}</p>` : ''}
        ${s.status === 'cancelled' ? `<p class="error">Cancelled${s.notes ? ' — ' + escapeHtml(s.notes) : ''}</p>` : ''}
        <div id="pt-msg" class="muted" style="font-size:0.72rem;min-height:1em"></div>
        <div>${sortedPlayers.map(rowHtml).join('')}</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pt-close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const msgEl = overlay.querySelector('#pt-msg');
  overlay.querySelectorAll('.pt-att').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.player;
      const val = btn.dataset.val;
      const attended = val === 'true';
      const existing = byPlayer[pid];
      const row = {
        session_id: s.id,
        player_id: pid,
        attended: existing?.attended === attended ? null : attended,
        intent: existing?.intent || null,
        note: existing?.note || null,
        responded_by: existing?.responded_by || null,
      };
      const { error } = await supabase.from('training_attendance')
        .upsert(row, { onConflict: 'session_id,player_id' });
      if (error) { msgEl.textContent = 'Save failed: ' + error.message; msgEl.className = 'error'; return; }
      byPlayer[pid] = { ...row };
      msgEl.textContent = '✓ Saved'; msgEl.className = 'ok';
      // Update button styles in place
      overlay.querySelectorAll(`.pt-att[data-player="${pid}"]`).forEach(b => {
        const isTrue = b.dataset.val === 'true';
        const isCurrent = row.attended === true && isTrue || row.attended === false && !isTrue;
        b.style.background = isCurrent ? (isTrue ? '#2a7' : '#c33') : '#fff';
        b.style.color = isCurrent ? '#fff' : '#333';
      });
    };
  });
}

// ---------- Lineups tab ----------
// When the Lineups tab opens with no pending lineup to load, auto-pick the match
// the coach most likely wants to see: the closest upcoming match, OR the most
// recent past match whose kickoff was within the last 24 hours (so the coach
// stays parked on a just-played match long enough to enter the result).
// Returns the lineup id or null if nothing is eligible.
function _findDefaultLineupId(lineups) {
  if (!Array.isArray(lineups) || lineups.length === 0) return null;
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  let best = null;
  let bestAbs = Infinity;
  for (const l of lineups) {
    if (!l || !l.game_date) continue;
    const hasKo = typeof l.kickoff_time === 'string' && /^\d{1,2}:\d{2}/.test(l.kickoff_time);
    const ko = hasKo ? l.kickoff_time : '12:00';
    const [hh, mm] = ko.split(':').map(Number);
    const d = new Date(l.game_date + 'T00:00:00'); // local midnight of game_date
    d.setHours(hh || 0, mm || 0, 0, 0);
    const dist = d.getTime() - now; // >0 future, <0 past
    const abs = Math.abs(dist);
    // Past matches are only eligible within 24h of KO (so the "stay for 24h" rule holds).
    if (dist < 0 && abs > DAY_MS) continue;
    if (abs < bestAbs) { best = l; bestAbs = abs; }
  }
  return best ? best.id : null;
}

// Has the match's kick-off (or end of day, if no time set) already passed?
// Used to decide whether to show the post-match Result form on the Match details modal.
function matchHasBeenPlayed(current) {
  if (!current?.game_date) return false;
  const today = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  if (current.game_date < todayStr) return true;
  if (current.game_date > todayStr) return false;
  // Same day — if we have a kickoff time, treat the match as "playable to score"
  // from kickoff onwards. If no time set, fall back to "after midday".
  const ko = current.kickoff_time || '12:00';
  const [hh, mm] = ko.split(':').map(Number);
  const koDate = new Date();
  koDate.setHours(hh || 0, mm || 0, 0, 0);
  return new Date() >= koDate;
}

// Result helper: is at least one score field populated?
function matchHasResult(current) {
  return current && (
    current.our_score_ht != null || current.opp_score_ht != null ||
    current.our_score_ft != null || current.opp_score_ft != null ||
    (Array.isArray(current.goalscorers) && current.goalscorers.length > 0) ||
    (Array.isArray(current.motm) && current.motm.length > 0)
  );
}

// Builds a compact "FT 3-2 W" / "HT 1-0" badge for a lineup row. Returns
// { text, outcome, color } where outcome is 'W' | 'D' | 'L' | null and color
// is the chip background. Returns null when there's no score to show yet.
// Accepts a lineup row from the DB OR a `current` editor state.
function matchResultBadge(l) {
  if (!l) return null;
  const us = l.our_score_ft, them = l.opp_score_ft;
  if (us != null && them != null) {
    let outcome = 'D', color = '#888';
    if (us > them) { outcome = 'W'; color = '#2a7'; }
    else if (us < them) { outcome = 'L'; color = '#c33'; }
    return { text: `FT ${us}-${them} ${outcome}`, outcome, color };
  }
  // No FT yet — fall back to half-time if entered
  const usHt = l.our_score_ht, themHt = l.opp_score_ht;
  if (usHt != null && themHt != null) {
    return { text: `HT ${usHt}-${themHt}`, outcome: null, color: '#b88800' };
  }
  return null;
}

// Compact result card for the coach editor — sits above the Availability bar
// on any match that has a result recorded. Shows the coloured FT/HT chip,
// a secondary HT line if both are set, scorer list, and MOTM list (with reasons
// in muted italic). Empty string when there's nothing to show so the caller
// can just interpolate it unconditionally.
function compactMatchResultCardHtml(current) {
  if (!current) return '';
  const badge = matchResultBadge(current);
  const hasMotm = Array.isArray(current.motm) && current.motm.length > 0;
  const hasScorers = Array.isArray(current.goalscorers) && current.goalscorers.some(g => (parseInt(g?.count, 10) || 0) > 0);
  if (!badge && !hasMotm && !hasScorers) return '';

  const color = badge ? badge.color : '#888';
  const playersById = Object.fromEntries((editor?.players || []).map(p => [p.id, p]));

  const scorerLine = (current.goalscorers || [])
    .map(g => {
      const p = playersById[g.player_id];
      if (!p) return null;
      const c = parseInt(g.count, 10) || 0;
      if (c <= 0) return null;
      return escapeHtml(p.name || '—') + (c > 1 ? ` (${c})` : '');
    })
    .filter(Boolean)
    .join(', ');

  const motmLine = (current.motm || [])
    .map(m => {
      const p = playersById[m.player_id];
      if (!p) return null;
      const reason = (m.reason || '').trim();
      return escapeHtml(p.name || '—') + (reason ? ` <span style="font-style:italic;color:#666">— ${escapeHtml(reason)}</span>` : '');
    })
    .filter(Boolean)
    .join(', ');

  // Secondary HT line only when FT is the primary chip (i.e. we have both).
  const ftSet = current.our_score_ft != null && current.opp_score_ft != null;
  const htSet = current.our_score_ht != null && current.opp_score_ht != null;
  const showHtDetail = ftSet && htSet;

  // Inline "Edit" pencil button — only rendered for editors. Shares the
  // #me-enter-result id with the full-width amber button (only one or the
  // other is on-screen at a time) so the existing wire-up just works.
  const canEditResult = !!(editor?.canEdit) && !!current.id;
  const editBtnHtml = canEditResult
    ? `<button type="button" id="me-enter-result" aria-label="Edit result" title="Edit result"
         style="box-sizing:border-box;flex:0 0 auto;padding:0.3rem 0.55rem;background:#2a7;color:#fff;border:none;border-radius:4px;font-size:0.75rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:0.3rem;line-height:1">
         <span aria-hidden="true">✎</span><span>Edit</span>
       </button>`
    : '';

  return `
    <div class="me-result-card" style="background:#fafafa;border:1px solid #e5e5e5;border-left:4px solid ${color};border-radius:6px;padding:0.5rem 0.65rem;margin-bottom:0.4rem">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        ${badge ? `<span style="background:${color};color:#fff;font-weight:700;font-size:0.78rem;padding:0.15rem 0.5rem;border-radius:3px;letter-spacing:0.02em">${escapeHtml(badge.text)}</span>` : ''}
        ${showHtDetail ? `<span class="muted" style="font-size:0.72rem">HT ${current.our_score_ht}-${current.opp_score_ht}</span>` : ''}
        <span style="flex:1 1 auto"></span>
        ${editBtnHtml}
      </div>
      ${scorerLine ? `<div style="font-size:0.78rem;margin-top:0.3rem;color:#333">⚽ ${scorerLine}</div>` : ''}
      ${motmLine ? `<div style="font-size:0.78rem;margin-top:0.15rem;color:#333">🏆 ${motmLine}</div>` : ''}
    </div>
  `;
}

// Companion card that sits directly below the scoreline card and lists every
// badge awarded during THIS specific match (strict `lineup_id === current.id`
// filter — cumulative season awards don't leak in). Renders nothing when no
// match-linked badges exist. `teamId` is read from the badge cache so it works
// in both the coach editor (pass `editor.team?.id`) and the parent view (pass
// `lineup.team_id`). Lightweight styling mirrors the result card (fafafa bg,
// gold left-border hint) so the two feel paired.
function matchAwardsCardHtml(current, teamId) {
  if (!current || !current.id || !teamId) return '';
  const all = getCachedTeamBadges(teamId);
  const matchBadges = all.filter(b => b && b.lineup_id === current.id);
  if (matchBadges.length === 0) return '';

  const playersById = Object.fromEntries((editor?.players || []).map(p => [p.id, p]));

  // Group rows by player so one coach-facing card can surface multiple badges
  // for the same kid neatly. Within a player's row, keep awarded_at DESC
  // (cache is already sorted, but be defensive).
  const byPlayer = new Map();
  for (const b of matchBadges) {
    if (!byPlayer.has(b.player_id)) byPlayer.set(b.player_id, []);
    byPlayer.get(b.player_id).push(b);
  }

  // Render one inline "awardee unit" per player: name + their badge chips. Units
  // flow horizontally and wrap naturally so 3–4 short ones fit on a single line.
  // Separator dots between units so it reads as a comma-style list, not a column.
  const unitsHtml = Array.from(byPlayer.entries()).map(([pid, items]) => {
    const p = playersById[pid];
    const name = p ? shortName(p.name || '') : '—';
    const chipsHtml = items.map(b => {
      const e = badgeEntry(b.badge_key);
      const nm = e ? e.name : b.badge_key;
      const tip = b.note ? `${nm} — ${b.note}` : nm;
      return `<span class="maw-chip" title="${escapeHtml(tip)}">
                <span class="maw-chip-emoji">${badgeEmoji(b.badge_key)}</span>
                <span class="maw-chip-name">${escapeHtml(nm)}</span>
              </span>`;
    }).join('');
    return `<span class="maw-unit">
              <span class="maw-player">${escapeHtml(name)}</span>
              <span class="maw-chips">${chipsHtml}</span>
            </span>`;
  }).join('<span class="maw-sep" aria-hidden="true">·</span>');

  // Notes still collected separately so the coach's "why?" narrative is readable
  // without hover — one italic line per badge that has a note, grouped by player.
  const notesHtml = Array.from(byPlayer.entries()).flatMap(([pid, items]) => {
    const p = playersById[pid];
    const name = p ? shortName(p.name || '') : '—';
    return items
      .filter(b => (b.note || '').trim())
      .map(b => {
        const e = badgeEntry(b.badge_key);
        const nm = e ? e.name : b.badge_key;
        return `<div class="maw-note muted">${escapeHtml(name)} · ${escapeHtml(nm)} — ${escapeHtml(b.note)}</div>`;
      });
  }).join('');

  return `
    <div class="match-awards-card" style="background:#fafafa;border:1px solid #e5e5e5;border-left:4px solid #d6a82b;border-radius:6px;padding:0.5rem 0.65rem;margin-bottom:0.4rem">
      <div style="font-size:0.72rem;font-weight:700;color:#8a6a00;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem">🏅 Awards given this match</div>
      <div class="maw-flow">${unitsHtml}</div>
      ${notesHtml}
    </div>
  `;
}

// ---------- Coach's Focus panel (Slice 10 Phase 2) ----------
// The panel shows one row per player (picked or roster-wide — the coach toggles).
// Each row lists the cues that have been set for this match (primary star + emoji
// + short label) plus an "Add focus" button when there's room (cap = 3 per player).
// Tapping a chip opens openFocusEditor in edit mode; the X removes the cue.
// Designed to be re-rendered cheaply — pure-string output from cache reads.
const FOCUS_MAX_PER_PLAYER = 3;

// List-mode state — 'focus' (default) is a tap-to-focus flow where the coach
// taps one player on the pitch at a time and only that player's row shows in
// the panel; 'picked' shows the full picked-squad list (starters + subs).
// Persisted across re-renders within a session so the coach's choice survives
// tab switches and lineup reloads. Default flipped to 'focus' 2026-04-18 per
// Chris — the tap-to-select flow scales better on a phone with 15+ players.
let _focusListMode = 'focus';

// In 'focus' mode this tracks which player the coach has tapped on the pitch.
// Cleared whenever the lineup changes so the prompt shows first on a new match.
let _focusSelectedPlayerId = null;
// Remember which lineup the current selection belongs to, so we can auto-clear
// _focusSelectedPlayerId when the coach switches matches (many call sites
// reassign editor.current; hooking them all is noisier than this tripwire).
let _focusSelectedLineupId = null;

function _focusModeActive() {
  return _focusListMode === 'focus' && _lineupPhoneTab === 'focus';
}

// Called from the pitch/subs click handlers when in focus mode. Selects the
// player (so the Focus panel shows their row) and paints a highlight ring on
// their chip.
function _focusSelectPlayer(playerId) {
  if (!playerId) return;
  _focusSelectedPlayerId = playerId;
  _focusSelectedLineupId = editor?.current?.id || null;
  _paintFocusSelectionRing();
  _rerenderFocusPanel();
}

// Paint a dashed purple ring on whichever pitch/subs chip matches the current
// _focusSelectedPlayerId, and clear it from all others. Lightweight — reads
// nothing from the DOM beyond the chip elements themselves.
function _paintFocusSelectionRing() {
  const selected = _focusSelectedPlayerId;
  document.querySelectorAll('.chip[data-player-id]').forEach(chip => {
    const match = selected && chip.dataset.playerId === selected;
    chip.classList.toggle('focus-target-selected', !!match);
  });
}

function _focusChipHtml(cue, playerName) {
  // Cue label = catalog entry label, or the first chunk of the custom note.
  const entry = cue.cue_slug ? cueEntry(cue.cue_slug) : null;
  const emoji = entry ? entry.emoji : '📝';
  const label = entry ? entry.label
                      : (cue.custom_note || '').split('\n')[0].slice(0, 24) || 'Custom';
  const tip = cue.custom_note
    ? `${label} — ${cue.custom_note}`
    : (entry?.description || label);
  const tipWithPlayer = playerName ? `${playerName}: ${tip}` : tip;
  const star = cue.is_primary ? '<span class="focus-chip-star" title="Primary focus" aria-label="primary">★</span>' : '';
  const visDot = cue.visibility === 'coach_only'
    ? '<span class="focus-chip-vis focus-chip-vis-coach" title="Coach only">🔒</span>'
    : '';
  return `
    <span class="focus-cue-chip ${cue.is_primary ? 'is-primary' : ''}" data-cue-id="${cue.id}" title="${escapeHtml(tipWithPlayer)}">
      ${star}
      <span class="focus-chip-emoji" aria-hidden="true">${emoji}</span>
      <span class="focus-chip-label">${escapeHtml(label)}</span>
      ${visDot}
      <button class="focus-chip-x" data-cue-del="${cue.id}" aria-label="Remove focus" title="Remove">✕</button>
    </span>
  `;
}

function _focusPlayerRowHtml(player, cues, opts = {}) {
  const name = shortName(player.name || '') || '—';
  const chipsHtml = cues.length
    ? cues.map(c => _focusChipHtml(c, name)).join('')
    : '<span class="focus-empty muted">No focus yet.</span>';
  const canAdd = cues.length < FOCUS_MAX_PER_PLAYER;
  const atCap = cues.length >= FOCUS_MAX_PER_PLAYER;
  const addBtn = canAdd
    ? `<button class="focus-add-btn" data-focus-add="${player.id}">+ Add focus</button>`
    : `<span class="muted focus-cap-note">Max ${FOCUS_MAX_PER_PLAYER} reached</span>`;

  // Count pill — shows how many cues are set vs the cap. Neutral at 0, gold as
  // it fills, solid-gold at the cap so the coach can scan-check the list.
  const countClass = cues.length === 0
    ? 'focus-count-empty'
    : atCap
      ? 'focus-count-full'
      : 'focus-count-partial';
  const countPill = `<span class="focus-count-pill ${countClass}" title="${cues.length} of ${FOCUS_MAX_PER_PLAYER} focus cues set">${cues.length}/${FOCUS_MAX_PER_PLAYER}</span>`;

  // In "all players" mode, subtly dim rows for players who aren't in the
  // current picked squad so the coach can spot them — they can still add a
  // focus (the cue saves against the lineup regardless of selection).
  const notPickedClass = opts.notPicked ? 'focus-row-not-picked' : '';
  const notPickedTag = opts.notPicked ? '<span class="focus-not-picked-tag muted" title="Not in the picked squad for this match">not picked</span>' : '';

  return `
    <div class="focus-player-row ${atCap ? 'at-cap' : ''} ${notPickedClass}" data-focus-player-row="${player.id}">
      <div class="focus-row-head">
        <span class="focus-row-name">${escapeHtml(name)}</span>
        ${notPickedTag}
        ${countPill}
        ${addBtn}
      </div>
      <div class="focus-row-chips">${chipsHtml}</div>
    </div>
  `;
}

function renderFocusPanelHtml(current, teamId, players) {
  if (!current?.id || !teamId) {
    return `<p class="muted me-hint">Save the match first, then pick your squad — you'll be able to set a Focus for each player.</p>`;
  }

  // Lineup changed since we last recorded a focus selection — clear it so the
  // tap-prompt shows fresh and we don't carry a stale highlight into a
  // different match.
  if (_focusSelectedLineupId && _focusSelectedLineupId !== current.id) {
    _focusSelectedPlayerId = null;
    _focusSelectedLineupId = null;
  }

  // Kick off a cache populate if we haven't fetched yet for this lineup. The
  // fetcher sets _matchCues[lineupId] itself; when it resolves we re-render the
  // one panel body so the coach doesn't see an empty state forever. We also
  // populate the catalog in case renderTeamDashboard's parallel fetch lost the
  // race (network hiccup, subsequent navigation, etc.).
  if (!_matchCues[current.id]) {
    fetchMatchCues(teamId, current.id)
      .then(() => {
        // Only refresh the focus panel if the editor is still on this lineup.
        if (editor?.current?.id === current.id) _rerenderFocusPanel();
      })
      .catch(() => {});
  }
  if (!_cueCatalog && !_cueCatalogLoading) {
    fetchCueCatalog().then(() => {
      if (editor?.current?.id === current.id) _rerenderFocusPanel();
    }).catch(() => {});
  }

  // Build the pick list: pitch starters (from slots) + subs — in formation /
  // slot order, subs afterwards. De-dupe by player id.
  const pickedIds = [];
  const pickedSet = new Set();
  const slotKeys = Object.keys(current.slots || {}).sort();
  slotKeys.forEach(k => {
    const pid = current.slots[k];
    if (pid && !pickedSet.has(pid)) { pickedIds.push(pid); pickedSet.add(pid); }
  });
  (current.subs || []).forEach(pid => {
    if (pid && !pickedSet.has(pid)) { pickedIds.push(pid); pickedSet.add(pid); }
  });

  // Segmented toggle — full picked-squad list vs tap-to-focus single-player.
  // Focus-mode count shows the number of players that currently have ≥1 cue,
  // so the coach gets a sense of progress regardless of which tab they're on.
  const pickedCount = pickedIds.length;
  const cueRowsAll = getCachedMatchCues(current.id);
  const playersWithCueCount = new Set(cueRowsAll.map(c => c.player_id)).size;
  const toggleHtml = `
    <div class="focus-mode-toggle" role="tablist" aria-label="Focus list mode">
      <button type="button"
              class="focus-mode-btn ${_focusListMode === 'picked' ? 'active' : ''}"
              role="tab"
              aria-selected="${_focusListMode === 'picked' ? 'true' : 'false'}"
              data-focus-mode="picked">📋 Full picked squad <span class="focus-mode-count">${pickedCount}</span></button>
      <button type="button"
              class="focus-mode-btn ${_focusListMode === 'focus' ? 'active' : ''}"
              role="tab"
              aria-selected="${_focusListMode === 'focus' ? 'true' : 'false'}"
              data-focus-mode="focus">🎯 Focus mode <span class="focus-mode-count">${playersWithCueCount}</span></button>
    </div>
  `;

  // Cues keyed by player id (for lookup regardless of mode).
  const cueRows = cueRowsAll;
  const cuesByPlayer = new Map();
  cueRows.forEach(c => {
    if (!cuesByPlayer.has(c.player_id)) cuesByPlayer.set(c.player_id, []);
    cuesByPlayer.get(c.player_id).push(c);
  });
  // Cache is already ordered primary-first by fetcher; safe to use directly.

  const playersById = Object.fromEntries((players || []).map(p => [p.id, p]));

  // ---- Focus mode (tap-to-select) ----
  // Paint just the single selected player's row + a list of "quick-switch"
  // chips at the top showing players who already have cues set (so the coach
  // can hop back to one without tapping the pitch again).
  if (_focusListMode === 'focus') {
    // Validate the selected id is still a roster member — guards against lineup
    // switches / player removals mid-session.
    if (_focusSelectedPlayerId && !playersById[_focusSelectedPlayerId]) {
      _focusSelectedPlayerId = null;
    }

    // Quick-switch strip: players who already have ≥1 cue.
    const quickSwitchPlayers = [...cuesByPlayer.keys()]
      .map(pid => playersById[pid])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const quickSwitchHtml = quickSwitchPlayers.length
      ? `
        <div class="focus-quick-switch">
          <div class="focus-quick-switch-label muted">Already set:</div>
          <div class="focus-quick-switch-chips">
            ${quickSwitchPlayers.map(p => {
              const count = (cuesByPlayer.get(p.id) || []).length;
              const isSel = p.id === _focusSelectedPlayerId;
              return `<button type="button"
                class="focus-quick-chip ${isSel ? 'active' : ''}"
                data-focus-quick-pick="${p.id}"
                title="${escapeHtml(p.name || '')} — ${count} cue${count === 1 ? '' : 's'}">
                <span class="focus-quick-name">${escapeHtml(shortName(p.name || ''))}</span>
                <span class="focus-quick-count">${count}/${FOCUS_MAX_PER_PLAYER}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
      `
      : '';

    let selectedRowHtml = '';
    if (_focusSelectedPlayerId) {
      const p = playersById[_focusSelectedPlayerId];
      if (p) {
        selectedRowHtml = _focusPlayerRowHtml(p, cuesByPlayer.get(p.id) || [], { notPicked: !pickedSet.has(p.id) });
      }
    }

    const selectionArea = _focusSelectedPlayerId && selectedRowHtml
      ? `<div class="focus-rows focus-rows-single">${selectedRowHtml}</div>`
      : `<div class="focus-tap-prompt">
          <div class="focus-tap-prompt-icon" aria-hidden="true">👆</div>
          <div class="focus-tap-prompt-head">Tap a player on the pitch</div>
          <p class="muted focus-tap-prompt-body">Pick a kid by tapping their chip on the pitch (or in the subs strip), then set up to ${FOCUS_MAX_PER_PLAYER} focus cues for them. Tap the next player when you're done.</p>
         </div>`;

    return `
      <div class="focus-panel focus-mode-active">
        <div class="focus-intro">
          <div class="focus-intro-head">🎯 Coach's Focus — tap mode</div>
          <p class="muted focus-intro-body">One thing you want each player to focus on. Max ${FOCUS_MAX_PER_PLAYER} per child. Parent-visible cues appear on the child's match page; coach-only stay here.</p>
          <div class="focus-stats muted">${playersWithCueCount}/${pickedCount} picked players with a cue · ${cueRows.length} cue${cueRows.length === 1 ? '' : 's'} set in total</div>
        </div>
        ${toggleHtml}
        ${quickSwitchHtml}
        ${selectionArea}
      </div>
    `;
  }

  // ---- Picked squad mode (full list, default) ----
  let emptyHint = '';
  if (pickedIds.length === 0) {
    emptyHint = `<p class="muted me-hint" style="padding:0.5rem 0">No squad picked yet — drop players onto the pitch (or subs) in the Squad tab, or switch to <strong>🎯 Focus mode</strong> above and tap any player on the pitch.</p>`;
  }
  const renderList = pickedIds.map(pid => playersById[pid]).filter(Boolean);
  const rowsHtml = renderList
    .map(p => _focusPlayerRowHtml(p, cuesByPlayer.get(p.id) || []))
    .join('');

  const totalSet = cueRows.length;
  const playersWithCueInList = renderList.reduce((n, p) => n + ((cuesByPlayer.get(p.id) || []).length > 0 ? 1 : 0), 0);

  return `
    <div class="focus-panel">
      <div class="focus-intro">
        <div class="focus-intro-head">🎯 Coach's Focus</div>
        <p class="muted focus-intro-body">One thing you want each player to focus on. Keep it small — one starred primary cue per player is the sweet spot (max ${FOCUS_MAX_PER_PLAYER} per child). Parent-visible cues appear on the child's match page; coach-only stay here.</p>
        <div class="focus-stats muted">${playersWithCueInList}/${renderList.length} picked players with a cue · ${totalSet} cue${totalSet === 1 ? '' : 's'} set in total</div>
      </div>
      ${toggleHtml}
      ${emptyHint}
      <div class="focus-rows">${rowsHtml}</div>
    </div>
  `;
}

// Re-render just the Focus panel body in-place so background fetches don't
// snap the whole editor. Safe to call from anywhere — bails if the panel isn't
// mounted (e.g. coach switched sub-tabs mid-fetch).
function _rerenderFocusPanel() {
  const tabEl = document.getElementById('tab-content');
  if (!tabEl) return;
  const body = tabEl.querySelector('[data-phone-group="focus"]');
  if (!body) return;
  const current = editor?.current;
  const team = editor?.team;
  const players = editor?.players || [];
  if (!current || !team) return;
  body.innerHTML = renderFocusPanelHtml(current, team.id, players);
  _wireFocusPanel();
  // Refresh pitch + subs focus markers too — keeps chip-side "🎯 N" pills in
  // sync when cues are added, edited or removed from the Focus panel.
  _repaintFocusPitchMarkers();
}

// Re-run match decorations on the pitch + subs strip so the chip-side
// Coach's Focus marker (🎯 count pill) updates after a cue CRUD operation.
// Leans on applyMatchDecorations (which reads getCachedMatchCues internally)
// so this is a single lightweight sweep — no extra DB round-trip.
function _repaintFocusPitchMarkers() {
  const current = editor?.current;
  if (!current?.id) return;
  const teamId = editor?.team?.id;
  const slotsLayer = document.getElementById('slots-layer');
  const subsRow    = document.getElementById('subs-row');
  if (slotsLayer) applyMatchDecorations(slotsLayer, current.motm, current.goalscorers, teamId, current.id);
  if (subsRow)    applyMatchDecorations(subsRow,    current.motm, current.goalscorers, teamId, current.id);
  // Preserve the focus-mode selection ring — applyMatchDecorations doesn't
  // touch class lists but a fresh re-render would have. Idempotent.
  _paintFocusSelectionRing();
}

// Wire the Focus panel click handlers: add-cue button opens openFocusEditor
// in "add" mode, chip click opens it in "edit" mode, X button removes the cue
// after a confirm. Idempotent — safe to re-run after each re-render.
function _wireFocusPanel() {
  const tabEl = document.getElementById('tab-content');
  if (!tabEl) return;
  const body = tabEl.querySelector('[data-phone-group="focus"]');
  if (!body) return;

  const current = editor?.current;
  const team = editor?.team;
  if (!current?.id || !team?.id) return;

  // List-mode toggle — flip between the full picked-squad list and the
  // tap-to-select Focus mode. When the coach switches INTO focus mode we
  // (re)paint the selection ring so any previously-selected player still
  // shows highlighted on the pitch.
  body.querySelectorAll('[data-focus-mode]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const mode = btn.dataset.focusMode;
      if (mode !== 'picked' && mode !== 'focus') return;
      if (_focusListMode === mode) return;
      _focusListMode = mode;
      _rerenderFocusPanel();
      // Focus mode drives a chip-side ring; clear it when leaving so stale
      // highlights don't linger if the coach flips back to the full list.
      if (mode === 'focus') _paintFocusSelectionRing();
      else {
        document.querySelectorAll('.chip.focus-target-selected')
          .forEach(c => c.classList.remove('focus-target-selected'));
      }
    };
  });

  // Quick-switch chips — shortcut to re-select a player who already has cues
  // without hunting them down on the pitch again.
  body.querySelectorAll('[data-focus-quick-pick]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const pid = btn.dataset.focusQuickPick;
      if (pid) _focusSelectPlayer(pid);
    };
  });

  // Add button
  body.querySelectorAll('[data-focus-add]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const playerId = btn.dataset.focusAdd;
      openFocusEditor({ teamId: team.id, lineupId: current.id, playerId });
    };
  });

  // Chip click (edit) — ignore clicks on the X button
  body.querySelectorAll('.focus-cue-chip[data-cue-id]').forEach(chip => {
    chip.onclick = (ev) => {
      if (ev.target.closest('[data-cue-del]')) return;
      ev.stopPropagation();
      const cueId = chip.dataset.cueId;
      const row = getCachedMatchCues(current.id).find(c => c.id === cueId);
      if (!row) return;
      openFocusEditor({ teamId: team.id, lineupId: current.id, playerId: row.player_id, cueId });
    };
  });

  // Remove X
  body.querySelectorAll('[data-cue-del]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const cueId = btn.dataset.cueDel;
      if (!confirm('Remove this focus?')) return;
      try {
        await deleteMatchCue(cueId, current.id, team.id);
        _rerenderFocusPanel();
      } catch (e) {
        alert('Remove failed: ' + (e.message || e));
      }
    };
  });
}

// ---------- Coach's Focus editor modal (add / edit a match cue) ----------
// Called with { teamId, lineupId, playerId, cueId? }. If cueId is provided,
// we're editing an existing row — its fields populate the form. Otherwise we're
// adding a new cue for that player on that lineup.
// Layout: framework-grouped cue picker (search + categories), custom-note field
// (140 chars), is_primary toggle, visibility toggle (parent_visible | coach_only).
// Save calls setMatchCue or updateMatchCue; on success we close + re-render the panel.
function openFocusEditor({ teamId, lineupId, playerId, cueId }) {
  const existing = document.querySelector('.focus-editor-overlay');
  if (existing) existing.remove();

  const players = editor?.players || [];
  const player = players.find(p => p.id === playerId);
  const playerName = player ? shortName(player.name || '') : '—';
  const isEdit = !!cueId;
  const row = isEdit ? getCachedMatchCues(lineupId).find(c => c.id === cueId) : null;

  // Current form state
  let selectedSlug  = row?.cue_slug || null;
  let customNote    = row?.custom_note || '';
  let isPrimary     = row?.is_primary ?? false;
  let visibility    = row?.visibility || 'parent_visible';
  let searchText    = '';

  // If the catalog didn't load (offline), still let the coach save a custom note.
  const catalog = getCachedCueCatalog();
  // Auto-default the new cue to primary if the player has none yet and this is
  // an add flow — primary is the star cue, and the first cue on a player should
  // almost always be primary unless the coach explicitly unchecks.
  if (!isEdit) {
    const existingForPlayer = cuesForPlayer(lineupId, playerId);
    if (existingForPlayer.length === 0) isPrimary = true;
  }

  // Framework-group order — mirrors the catalog's conceptual grouping so the
  // picker reads "Four Corner Model" → ELM → ROOTS → Tank → Welfare → Role →
  // Encouragement.
  const FRAMEWORK_GROUPS = [
    { key: 'FA',            label: '🧭 FA Four Corner Model', hint: 'Technical · Physical · Psychological · Social' },
    { key: 'ELM',           label: '💪 ELM — Effort · Learning · Mistakes',  hint: 'Positive Coaching Alliance' },
    { key: 'ROOTS',         label: '🌳 ROOTS — Rules · Opponents · Officials · Teammates · Self', hint: 'Sportsmanship' },
    { key: 'TANK',          label: '❤️ Emotional Tank', hint: 'Fill teammates\u2019 tanks with encouragement' },
    { key: 'WELFARE',       label: '🛟 Welfare', hint: 'Coach-only flags (wellbeing, injury watch)' },
    { key: 'ROLE',          label: '🧩 Role / position', hint: 'Position-specific coaching points' },
    { key: 'ENCOURAGEMENT', label: '✨ Encouragement', hint: 'General confidence boosters' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay focus-editor-overlay';
  overlay.innerHTML = `
    <div class="picker-modal focus-editor-modal" role="dialog" aria-label="Coach's Focus for ${escapeHtml(playerName)}">
      <div class="picker-header">
        <strong>🎯 ${isEdit ? 'Edit' : 'Set'} Focus — ${escapeHtml(playerName)}</strong>
        <button class="btn-secondary" data-close type="button">✕</button>
      </div>
      <div class="picker-body" style="padding:0.6rem 0.8rem 0.8rem">
        <div id="fe-selected-head" class="fe-selected-head muted" style="font-size:0.85rem;min-height:1.2em;margin-bottom:0.35rem"></div>

        <input type="text" id="fe-search" placeholder="Search cues…" autocomplete="off"
          style="width:100%;padding:0.5rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:0.45rem" />

        <div id="fe-list" class="fe-list" style="max-height:40vh;overflow-y:auto;border:1px solid var(--border);border-radius:6px"></div>

        <label style="display:block;margin-top:0.6rem;font-size:0.78rem;color:#555">Personalise (optional — up to 140 chars)</label>
        <textarea id="fe-note" rows="2" maxlength="140" placeholder="e.g. Try a switch-of-play when their left-back pushes up"
          style="width:100%;padding:0.45rem 0.55rem;border:1px solid var(--border);border-radius:6px;font-size:0.88rem;resize:vertical;font-family:inherit">${escapeHtml(customNote)}</textarea>
        <div id="fe-note-count" class="muted" style="font-size:0.72rem;text-align:right;margin-top:-0.1rem">${customNote.length}/140</div>

        <div class="fe-toggles" style="display:flex;flex-wrap:wrap;gap:0.7rem;margin-top:0.4rem;align-items:center">
          <label style="display:flex;gap:0.3rem;align-items:center;font-size:0.85rem;cursor:pointer">
            <input type="checkbox" id="fe-primary" ${isPrimary ? 'checked' : ''} />
            <span>★ Primary (the one thing)</span>
          </label>
          <label style="display:flex;gap:0.3rem;align-items:center;font-size:0.85rem;cursor:pointer">
            <input type="checkbox" id="fe-coach-only" ${visibility === 'coach_only' ? 'checked' : ''} />
            <span>🔒 Coach-only (hide from parents)</span>
          </label>
        </div>

        <div id="fe-msg" class="muted" style="margin-top:0.5rem;min-height:1.1em;font-size:0.8rem"></div>
        <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:0.6rem;align-items:center;flex-wrap:wrap">
          <div>
            ${isEdit ? `<button class="btn-secondary" id="fe-delete" type="button" style="color:#b00;border-color:#f3c9c9">Remove focus</button>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem">
            <button class="btn-secondary" data-close type="button">Cancel</button>
            <button class="primary" id="fe-save">${isEdit ? 'Save changes' : 'Save focus'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl        = overlay.querySelector('#fe-list');
  const searchEl      = overlay.querySelector('#fe-search');
  const noteEl        = overlay.querySelector('#fe-note');
  const noteCountEl   = overlay.querySelector('#fe-note-count');
  const primaryEl     = overlay.querySelector('#fe-primary');
  const coachOnlyEl   = overlay.querySelector('#fe-coach-only');
  const selectedHead  = overlay.querySelector('#fe-selected-head');
  const msg           = overlay.querySelector('#fe-msg');
  const saveBtn       = overlay.querySelector('#fe-save');
  const deleteBtn     = overlay.querySelector('#fe-delete');

  const renderSelectedHead = () => {
    if (selectedSlug) {
      const e = cueEntry(selectedSlug);
      if (e) {
        selectedHead.innerHTML = `Selected: <strong>${e.emoji} ${escapeHtml(e.label)}</strong> <span class="muted">— ${escapeHtml(e.description || '')}</span>`;
      } else {
        selectedHead.innerHTML = `<em class="muted">Selected a cue (loading…)</em>`;
      }
    } else if (customNote && customNote.trim()) {
      selectedHead.innerHTML = `<em>Using your custom note only</em>`;
    } else {
      selectedHead.innerHTML = `<span class="muted">Pick a cue or write a custom note.</span>`;
    }
  };

  const renderList = () => {
    const q = searchText.trim().toLowerCase();
    const allCues = Object.values(catalog);
    if (!allCues.length) {
      listEl.innerHTML = `<p class="muted" style="padding:0.6rem">Cue catalog not loaded yet — you can still save a custom note above.</p>`;
      return;
    }
    const groupsHtml = FRAMEWORK_GROUPS.map(g => {
      const items = allCues
        .filter(c => c.framework === g.key)
        .filter(c => !q || (c.label || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (!items.length) return '';
      return `
        <div class="fe-group">
          <div class="fe-group-head">
            <span class="fe-group-label">${g.label}</span>
            <span class="fe-group-hint muted">${g.hint}</span>
          </div>
          <div class="fe-group-body">
            ${items.map(c => {
              const isSel = c.slug === selectedSlug;
              const coachOnly = c.visibility === 'coach_only';
              return `
                <button type="button" class="fe-item ${isSel ? 'selected' : ''} ${coachOnly ? 'coach-only' : ''}" data-cue-slug="${escapeHtml(c.slug)}">
                  <span class="fe-item-emoji" aria-hidden="true">${c.emoji || '🎯'}</span>
                  <span class="fe-item-txt">
                    <span class="fe-item-name">${escapeHtml(c.label || c.slug)}${coachOnly ? ' <span class="fe-item-lock" title="Coach-only">🔒</span>' : ''}</span>
                    <span class="fe-item-desc muted">${escapeHtml(c.description || '')}</span>
                  </span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
    listEl.innerHTML = groupsHtml || '<p class="muted" style="padding:0.6rem">No cues match that search.</p>';
    listEl.querySelectorAll('[data-cue-slug]').forEach(btn => {
      btn.onclick = () => {
        selectedSlug = btn.dataset.cueSlug;
        const ent = cueEntry(selectedSlug);
        // If a coach-only cue is picked and the coach hasn't explicitly set a
        // visibility, auto-mirror it so we don't accidentally leak a welfare
        // cue to the parent page.
        if (ent?.visibility === 'coach_only' && visibility !== 'coach_only') {
          visibility = 'coach_only';
          coachOnlyEl.checked = true;
        }
        renderSelectedHead();
        renderList();
      };
    });
  };

  renderSelectedHead();
  renderList();
  setTimeout(() => searchEl.focus(), 30);

  searchEl.addEventListener('input', () => { searchText = searchEl.value; renderList(); });
  noteEl.addEventListener('input', () => {
    customNote = noteEl.value;
    noteCountEl.textContent = `${customNote.length}/140`;
    renderSelectedHead();
  });
  primaryEl.addEventListener('change', () => { isPrimary = !!primaryEl.checked; });
  coachOnlyEl.addEventListener('change', () => { visibility = coachOnlyEl.checked ? 'coach_only' : 'parent_visible'; });

  overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm('Remove this focus?')) return;
      msg.textContent = 'Removing…'; msg.className = 'muted';
      try {
        await deleteMatchCue(cueId, lineupId, teamId);
        overlay.remove();
        _rerenderFocusPanel();
      } catch (e) {
        msg.textContent = 'Remove failed: ' + (e.message || e);
        msg.className = 'error';
      }
    };
  }

  saveBtn.onclick = async () => {
    if (!selectedSlug && !customNote.trim()) {
      msg.textContent = 'Pick a cue or write a custom note first.';
      msg.className = 'error';
      return;
    }
    msg.textContent = 'Saving…'; msg.className = 'muted';
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        await updateMatchCue(cueId, lineupId, {
          cue_slug: selectedSlug,
          custom_note: customNote,
          is_primary: isPrimary,
          visibility,
        });
      } else {
        // Enforce the per-player cap client-side for a nicer error than the DB
        // would give us (there's no hard DB cap; Phase 2 convention is 3).
        const existingForPlayer = cuesForPlayer(lineupId, playerId);
        if (existingForPlayer.length >= FOCUS_MAX_PER_PLAYER) {
          throw new Error(`Max ${FOCUS_MAX_PER_PLAYER} focus cues per player.`);
        }
        await setMatchCue({
          teamId, lineupId, playerId,
          cueSlug: selectedSlug,
          customNote,
          isPrimary,
          visibility,
        });
      }
      overlay.remove();
      _rerenderFocusPanel();
    } catch (e) {
      msg.textContent = 'Save failed: ' + (e.message || e);
      msg.className = 'error';
      saveBtn.disabled = false;
    }
  };
}

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
    location_lng: null,
    // post-match result (only filled in after the game is played)
    our_score_ht: null,     // half-time goals for us
    opp_score_ht: null,     // half-time goals against
    our_score_ft: null,     // full-time goals for us
    opp_score_ft: null,     // full-time goals against
    goalscorers: [],        // [{ player_id, count }] — only our scorers, opposition is just a total
    motm: []                // [{ player_id, reason }] — multiple allowed; reason optional
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
      // _hasPlayers is a quick flag for UI — true if this formation was saved
      // with pre-placed players. Count is the number of filled slots.
      const playersMap = d.players && typeof d.players === 'object' ? d.players : null;
      const playerCount = playersMap
        ? Object.values(playersMap).filter(Boolean).length
        : 0;
      out[cf.name] = {
        pos: d.pos.map(p => [...p]),
        lbl: [...d.lbl],
        _customId: cf.id,
        _hasPlayers: playerCount > 0,
        _playerCount: playerCount
      };
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

// ---------- Calendar (.ics) export ----------
// Generate a UK-time ICS file the parent (or coach) can save into Apple/Google/Outlook calendars.
// Falls back gracefully when fields are missing.
function _icsEscape(s) {
  return String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
}
function _icsDtLocal(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD ; timeStr: HH:MM (or '')
  const d = (dateStr || '').replace(/-/g, '');
  const t = (timeStr || '00:00').replace(':', '') + '00';
  return `${d}T${t}`;
}
function _icsAddMinutes(dateStr, timeStr, mins) {
  const [Y,M,D] = (dateStr || '').split('-').map(Number);
  const [h,m]   = ((timeStr || '00:00').split(':')).map(Number);
  const dt = new Date(Date.UTC(Y, (M||1)-1, D||1, h||0, m||0));
  dt.setUTCMinutes(dt.getUTCMinutes() + mins);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}
function _buildCalendarPayload(lineupOrCurrent, team, lineupId) {
  const c = lineupOrCurrent;
  if (!c.game_date) return null;
  const v = effectiveVenue(c, team);
  const opponent = (c.opponent || '').trim() || 'match';
  const ko = c.kickoff_time || '';
  const arr = c.arrival_time || '';
  const dtStart = ko ? _icsDtLocal(c.game_date, ko) : _icsDtLocal(c.game_date, '10:00');
  const dtEnd   = _icsAddMinutes(c.game_date, ko || '10:00', 90);
  const stamp = (() => { const d=new Date(); const p=n=>String(n).padStart(2,'0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`; })();
  const teamName = (team?.name || 'Team');
  const haLbl = c.home_away === 'away' ? 'Away' : 'Home';
  const locParts = [v.name, v.postcode].filter(Boolean).join(', ');
  const desc = [
    `${teamName} ${haLbl} vs ${opponent}`,
    arr ? `Arrival: ${arr}` : '',
    ko ? `Kick off: ${ko}` : '',
    locParts ? `Venue: ${locParts}` : '',
    (c.notes || '').trim() ? `Notes: ${c.notes.trim()}` : ''
  ].filter(Boolean).join('\n');
  const summary = `${teamName} vs ${opponent} (${haLbl})`;
  const uid = `lineup-${lineupId || c.id || Date.now()}@interpro`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Interpro//Lineups//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/London:${dtStart}`,
    `DTEND;TZID=Europe/London:${dtEnd}`,
    `SUMMARY:${_icsEscape(summary)}`,
    `LOCATION:${_icsEscape(locParts)}`,
    `DESCRIPTION:${_icsEscape(desc)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return { ics, summary, desc, locParts, dtStart, dtEnd, teamName, opponent, gameDate: c.game_date };
}

// Convert YYYYMMDDTHHMMSS (London local) → UTC YYYYMMDDTHHMMSSZ for Google Calendar URL
function _londonLocalToUtcStamp(local) {
  // local: '20260419T100000'
  const Y = +local.slice(0,4), M = +local.slice(4,6), D = +local.slice(6,8);
  const h = +local.slice(9,11), m = +local.slice(11,13);
  // Determine BST offset: UK BST runs last Sun March → last Sun October
  const lastSun = (y, mo) => { const d = new Date(Date.UTC(y, mo, 0)); return d.getUTCDate() - d.getUTCDay(); };
  const bstStart = Date.UTC(Y, 2, lastSun(Y, 3), 1); // last Sun March 01:00 UTC
  const bstEnd   = Date.UTC(Y, 9, lastSun(Y,10), 1); // last Sun October 01:00 UTC
  const localAsUtc = Date.UTC(Y, M-1, D, h, m);
  const offsetHours = (localAsUtc >= bstStart && localAsUtc < bstEnd) ? 1 : 0;
  const dt = new Date(localAsUtc - offsetHours * 3600 * 1000);
  const p = n => String(n).padStart(2,'0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth()+1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`;
}

function _googleCalendarUrl(payload) {
  const s = _londonLocalToUtcStamp(payload.dtStart);
  const e = _londonLocalToUtcStamp(payload.dtEnd);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: payload.summary,
    dates: `${s}/${e}`,
    details: payload.desc,
    location: payload.locParts || '',
    ctz: 'Europe/London'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function _downloadIcs(payload) {
  const blob = new Blob([payload.ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${payload.teamName.replace(/[^\w-]+/g,'_')}-vs-${payload.opponent.replace(/[^\w-]+/g,'_')}-${payload.gameDate}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// iOS / Safari: opening the ics inline triggers the native "Add to Calendar" prompt
function _openIcsInline(payload) {
  const blob = new Blob([payload.ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  // Use location assignment (best for iOS Safari → Calendar.app hand-off)
  window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadLineupIcs(lineupOrCurrent, team, lineupId) {
  const payload = _buildCalendarPayload(lineupOrCurrent, team, lineupId);
  if (!payload) { alert('No game date set — open Edit match and add one first.'); return; }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);

  // Show chooser modal — "just works" on every platform with one tap
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:360px;width:92vw">
      <div class="map-modal-header">
        <strong>Add to calendar</strong>
        <button class="btn-secondary" id="cal-close" type="button">✕</button>
      </div>
      <div class="map-modal-body" style="padding:1rem;display:flex;flex-direction:column;gap:0.5rem">
        <button class="primary btn-full" id="cal-google" type="button">📆 Google Calendar</button>
        <button class="btn-full" id="cal-apple" type="button">🍎 Apple Calendar${isIOS ? ' (default on this device)' : ''}</button>
        <button class="btn-full" id="cal-outlook" type="button">📧 Outlook / Download .ics</button>
        <p class="muted" style="font-size:0.75rem;margin:0.5rem 0 0">
          ${isIOS ? 'On iPhone/iPad, Apple Calendar will open with the event ready to save.'
                  : isAndroid ? 'On Android, Google Calendar opens the event — tap Save.'
                  : 'On a PC, pick your preferred calendar. Outlook/Apple users get a .ics file that opens in the default calendar app.'}
        </p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#cal-close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#cal-google').onclick = () => {
    window.open(_googleCalendarUrl(payload), '_blank', 'noopener');
    close();
  };
  overlay.querySelector('#cal-apple').onclick = () => {
    close();
    _openIcsInline(payload);
  };
  overlay.querySelector('#cal-outlook').onclick = () => {
    _downloadIcs(payload);
    close();
  };
}

// ---------- WhatsApp message builder ----------
// Produces the canned "new match added" message Chris pastes into the team chat.
// Pulls coach names from profiles for the "message X or Y" sign-off.
async function buildWhatsAppMessage(current, team) {
  const opp = (current.opponent || 'TBC').trim();
  const haLbl = current.home_away === 'away' ? 'Away' : 'Home';
  const teamName = team?.name || 'Team';
  const dateStr = current.game_date ? formatDate(current.game_date) : 'TBC';
  const ko = current.kickoff_time || 'TBC';
  const arr = current.arrival_time || 'TBC';
  const v = effectiveVenue(current, team);
  const venueLine = (v.name || v.postcode)
    ? `${v.name || ''}${v.name && v.postcode ? ' · ' : ''}${v.postcode || ''}`
    : 'TBC';
  // Map URL: prefer lat/lng, fall back to postcode, then venue name
  let mapsUrl = '';
  if (v.lat != null && v.lng != null) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  } else if (v.postcode) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.postcode)}`;
  } else if (v.name) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name)}`;
  }

  const base = location.origin + location.pathname;
  const availUrl = `${base}#/avail/${current.id}`;
  const matchUrl = `${base}#/view/${current.id}`;
  // Training link is appended only when the team has a recurring schedule set
  // (Slice 8). The URL is permanent per team — rolls forward automatically —
  // so pinning this message in WhatsApp covers both match + training.
  const hasTrainingSchedule = parseTrainingSchedule(team).length > 0;
  const trainingUrl = hasTrainingSchedule && team?.id ? `${base}#/train/${team.id}` : '';

  // Look up coach + admin names from profiles
  let coachNames = [];
  if (team?.id) {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', team.id)
      .in('role', ['admin', 'coach']);
    const ids = (members || []).map(m => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      coachNames = (profs || [])
        .map(p => {
          const full = (p.full_name || '').trim();
          if (!full) return ''; // skip coaches without a display name — never expose email
          if (full.includes('@')) return ''; // full_name is an email address — skip, don't leak it
          const first = full.split(/\s+/)[0];
          if (!first || first.includes('@')) return '';
          return first; // first name only
        })
        .filter(Boolean);
    }
  }
  const coachList = coachNames.length
    ? coachNames.join(' or ')
    : 'your coach';

  return [
    'Hey all,',
    '',
    `New match added — ${teamName} vs ${opp} (${haLbl})`,
    `Date: ${dateStr}`,
    `Arrive: ${arr} for warm-ups & team talk`,
    `Kick off: ${ko}`,
    `Venue: ${venueLine}`,
    mapsUrl ? `Map: ${mapsUrl}` : null,
    '',
    trainingUrl
      ? 'Links — availability, match info, and training attendance:'
      : 'Two links — let us know if your child can make it, and the other is the general match info:',
    '',
    'Availability:',
    availUrl,
    '',
    'Match info:',
    matchUrl,
    trainingUrl ? '' : null,
    trainingUrl ? 'Training (rolling link — always shows the next session):' : null,
    trainingUrl || null,
    '',
    `The Availability link asks for your child's parent code the first time you open it on a device (only once — your phone remembers). If you don't have it or have lost it, message ${coachList}.`,
    '',
    'Cheers!'
  ].filter(l => l !== null).join('\n');
}

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
  // Result line — shown when a score OR a MOTM has been entered. Lists scorers
  // and MOTM names underneath if any.
  const resBadge = matchResultBadge(current);
  const hasMotm = Array.isArray(current.motm) && current.motm.length > 0;
  let resultLine = '';
  if (resBadge || hasMotm) {
    const playersById = Object.fromEntries((editor?.players || []).map(p => [p.id, p]));
    const scorerLine = (current.goalscorers || [])
      .map(g => {
        const p = playersById[g.player_id];
        if (!p) return null;
        const c = parseInt(g.count, 10) || 0;
        if (c <= 0) return null;
        return escapeHtml(p.name || '—') + (c > 1 ? ` (${c})` : '');
      })
      .filter(Boolean)
      .join(', ');
    const motmLine = (current.motm || [])
      .map(m => {
        const p = playersById[m.player_id];
        if (!p) return null;
        const reason = (m.reason || '').trim();
        return escapeHtml(p.name || '—') + (reason ? ` <span class="muted" style="font-style:italic">— ${escapeHtml(reason)}</span>` : '');
      })
      .filter(Boolean)
      .join(', ');
    resultLine = `
      ${resBadge ? `
        <div style="margin-top:0.4rem;padding:0.35rem 0.5rem;background:${resBadge.color};color:#fff;border-radius:4px;font-size:0.85rem;font-weight:700;text-align:center">
          ${escapeHtml(resBadge.text)}
        </div>
      ` : ''}
      ${scorerLine ? `<div class="muted" style="font-size:0.75rem;margin-top:0.25rem">⚽ ${scorerLine}</div>` : ''}
      ${motmLine ? `<div class="muted" style="font-size:0.75rem;margin-top:0.15rem">🏆 ${motmLine}</div>` : ''}
    `;
  }
  const draftDisabled = status === 'draft';
  const availStyle = draftDisabled
    ? 'margin-top:0.35rem;opacity:0.5;cursor:not-allowed;background:#f0f0f0;color:#888'
    : 'margin-top:0.35rem;background:#fff;color:var(--text);border:1px solid var(--border);font-weight:500';
  const lineupStyle = draftDisabled
    ? 'margin-top:0.35rem;opacity:0.5;cursor:not-allowed;background:#f0f0f0;color:#888'
    : 'margin-top:0.35rem;background:var(--blue-2);color:#fff;border:none;font-weight:600';
  return `
    <div style="display:flex;flex-direction:column;gap:0.15rem">
      <div style="font-weight:600">${oppStr}</div>
      <div class="muted" style="font-size:0.8rem">${tLbl} · ${haLbl} · ${escapeHtml(dateStr)}</div>
      ${venueLine}
      ${pubLine}
      ${resultLine}
    </div>
    ${(current.kickoff_time || current.arrival_time) ? `
      <div class="muted" style="font-size:0.8rem;margin-top:0.25rem">
        ${current.arrival_time ? '🚌 ' + escapeHtml(current.arrival_time) : ''}${current.arrival_time && current.kickoff_time ? ' · ' : ''}${current.kickoff_time ? '⚽ KO ' + escapeHtml(current.kickoff_time) : ''}
      </div>` : ''}
    ${canEdit ? `<button class="primary btn-full" id="open-match-details" style="margin-top:0.5rem">✎ Edit match</button>` : ''}
    ${current.id ? `<button class="primary btn-full" id="open-share-modal" style="margin-top:0.35rem;background:var(--blue-2);color:#fff;border:none;font-weight:600">📤 Share match</button>` : ''}
    ${current.id && draftDisabled ? `<div class="muted" style="font-size:0.7rem;margin-top:0.25rem">⚠ Draft — share links won't work for parents until you switch state in <em>Edit match</em>.</div>` : ''}
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

    ${matchResultSectionHtml(current, canEdit)}

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

// Renders the post-match Result section inside the Match details modal.
// Hidden until the match has been played (kick-off has passed) — but if the
// coach has already entered a score, we always render it so they can edit.
//
// Goalscorer picker uses the matchday squad (lineup slots + subs). If the
// match is still in availability/draft (no squad picked yet) we fall back to
// the whole team squad so the coach isn't blocked from recording who scored.
function matchResultSectionHtml(current, canEdit) {
  if (!current?.id) return ''; // can't record a result on an unsaved lineup
  const played = matchHasBeenPlayed(current);
  const hasResult = matchHasResult(current);
  if (!played && !hasResult) return '';

  // Build candidate scorer list per the rule above.
  const players = (editor?.players || []);
  const slotIds = current.slots ? Object.values(current.slots).filter(Boolean) : [];
  const subIds = Array.isArray(current.subs) ? current.subs.filter(Boolean) : [];
  const matchdayIds = new Set([...slotIds, ...subIds]);
  const useMatchday = matchdayIds.size > 0;
  const candidatePlayers = useMatchday
    ? players.filter(p => matchdayIds.has(p.id))
    : players;
  // Sort by number then name for a stable list.
  candidatePlayers.sort((a, b) => {
    const an = (a.number == null) ? 99 : a.number;
    const bn = (b.number == null) ? 99 : b.number;
    if (an !== bn) return an - bn;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Map of player_id -> count for quick lookup.
  const scorerMap = {};
  (current.goalscorers || []).forEach(g => {
    if (g && g.player_id) scorerMap[g.player_id] = parseInt(g.count, 10) || 0;
  });
  // Map of player_id -> reason for MOTM lookup. Existence in the map = is MOTM.
  const motmMap = {};
  (current.motm || []).forEach(m => {
    if (m && m.player_id) motmMap[m.player_id] = m.reason || '';
  });

  const num = (v) => (v === '' || v == null) ? '' : String(v);
  const dis = canEdit ? '' : 'disabled';

  // Goal-tally sanity check — sum of our scorers vs full-time goals for us
  let scorerTotal = 0;
  Object.values(scorerMap).forEach(c => { scorerTotal += c; });
  const ftUs = current.our_score_ft;
  const tallyMismatch = (ftUs != null && ftUs !== '' && scorerTotal !== parseInt(ftUs, 10));

  const playerRowsHtml = candidatePlayers.map(p => {
    const count = scorerMap[p.id] || 0;
    const numBadge = (p.number != null) ? `<span style="display:inline-block;min-width:1.4em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.7rem;padding:0.05em 0.3em;border-radius:3px;margin-right:0.4em">${p.number}</span>` : '';
    return `
      <div class="md-scorer-row" data-player-id="${escapeHtml(p.id)}" style="display:flex;align-items:center;gap:0.4rem;padding:0.25rem 0;border-top:1px solid #eee">
        <div style="flex:1;font-size:0.85rem">${numBadge}${escapeHtml(p.name || '—')}</div>
        <button type="button" class="md-scorer-minus" ${dis} aria-label="Decrease goals" style="width:1.7em;height:1.7em;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer">−</button>
        <input type="number" class="md-scorer-count" value="${count}" min="0" step="1" ${dis}
          style="width:3em;text-align:center;padding:0.2em;font-size:0.85rem" />
        <button type="button" class="md-scorer-plus" ${dis} aria-label="Increase goals" style="width:1.7em;height:1.7em;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer">+</button>
      </div>`;
  }).join('');

  const scorerSourceLine = useMatchday
    ? `<div class="muted" style="font-size:0.7rem;margin-bottom:0.25rem">Showing matchday squad (${candidatePlayers.length} players). Add a sub on the Subs tab if a scorer is missing.</div>`
    : `<div class="muted" style="font-size:0.7rem;margin-bottom:0.25rem">No matchday squad picked yet — showing whole squad.</div>`;

  return `
    <div style="margin-top:1rem;padding-top:0.75rem;border-top:2px solid #1e3a8a">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem">
        <strong style="font-size:0.95rem">⚽ Result</strong>
        ${!played ? '<span class="muted" style="font-size:0.7rem">(KO not yet — entering early)</span>' : ''}
      </div>

      <div class="sc-row-2" style="gap:0.5rem">
        <div>
          <label style="font-size:0.75rem">Half-time — Us</label>
          <input type="number" id="l-ht-us" value="${escapeHtml(num(current.our_score_ht))}" min="0" step="1" placeholder="—" ${dis} />
        </div>
        <div>
          <label style="font-size:0.75rem">Half-time — ${escapeHtml(current.opponent || 'Them')}</label>
          <input type="number" id="l-ht-opp" value="${escapeHtml(num(current.opp_score_ht))}" min="0" step="1" placeholder="—" ${dis} />
        </div>
      </div>

      <div class="sc-row-2" style="gap:0.5rem;margin-top:0.4rem">
        <div>
          <label style="font-size:0.75rem">Full-time — Us</label>
          <input type="number" id="l-ft-us" value="${escapeHtml(num(current.our_score_ft))}" min="0" step="1" placeholder="—" ${dis} />
        </div>
        <div>
          <label style="font-size:0.75rem">Full-time — ${escapeHtml(current.opponent || 'Them')}</label>
          <input type="number" id="l-ft-opp" value="${escapeHtml(num(current.opp_score_ft))}" min="0" step="1" placeholder="—" ${dis} />
        </div>
      </div>

      <div style="margin-top:0.6rem">
        <div style="display:flex;align-items:baseline;justify-content:space-between">
          <strong style="font-size:0.85rem">Our goalscorers</strong>
          <span class="muted" style="font-size:0.7rem">Total: <strong${tallyMismatch ? ' style="color:#c33"' : ''}>${scorerTotal}</strong>${ftUs != null && ftUs !== '' ? ` / ${ftUs}` : ''}</span>
        </div>
        ${scorerSourceLine}
        ${candidatePlayers.length === 0
          ? `<div class="muted" style="font-size:0.8rem;font-style:italic;padding:0.4rem 0">No players in the squad yet.</div>`
          : `<div id="md-scorers-list">${playerRowsHtml}</div>`}
        ${tallyMismatch ? `<div class="muted" style="font-size:0.7rem;color:#c33;margin-top:0.25rem">⚠ Scorer total (${scorerTotal}) doesn't match full-time goals (${ftUs}).</div>` : ''}
      </div>

      ${candidatePlayers.length > 0 ? `
        <div style="margin-top:0.75rem">
          <div style="display:flex;align-items:baseline;justify-content:space-between">
            <strong style="font-size:0.85rem">🏆 Man of the Match</strong>
            <span class="muted" style="font-size:0.7rem">${Object.keys(motmMap).length} selected</span>
          </div>
          <div class="muted" style="font-size:0.7rem;margin-bottom:0.25rem">Tap the star to nominate. You can pick more than one. Reason is optional.</div>
          <div id="md-motm-list">
            ${candidatePlayers.map(p => {
              const isMotm = Object.prototype.hasOwnProperty.call(motmMap, p.id);
              const reason = motmMap[p.id] || '';
              const numBadge = (p.number != null) ? `<span style="display:inline-block;min-width:1.4em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.7rem;padding:0.05em 0.3em;border-radius:3px;margin-right:0.4em">${p.number}</span>` : '';
              return `
                <div class="md-motm-row" data-player-id="${escapeHtml(p.id)}" style="padding:0.25rem 0;border-top:1px solid #eee">
                  <div style="display:flex;align-items:center;gap:0.4rem">
                    <button type="button" class="md-motm-toggle" ${dis} aria-pressed="${isMotm}" aria-label="Toggle Man of the Match" title="Toggle Man of the Match"
                      style="width:1.9em;height:1.9em;border:1px solid ${isMotm ? '#b88800' : '#ccc'};background:${isMotm ? '#fff7d6' : '#fff'};color:${isMotm ? '#b88800' : '#999'};font-size:1.1em;line-height:1;cursor:pointer;border-radius:4px">${isMotm ? '★' : '☆'}</button>
                    <div style="flex:1;font-size:0.85rem">${numBadge}${escapeHtml(p.name || '—')}</div>
                  </div>
                  ${isMotm ? `
                    <input type="text" class="md-motm-reason" value="${escapeHtml(reason)}" placeholder="Why? (optional)" maxlength="200" ${dis}
                      style="width:100%;margin-top:0.25rem;padding:0.3em 0.4em;font-size:0.8rem;border:1px solid #ddd;border-radius:3px" />
                  ` : ''}
                </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// 5-step post-match result wizard (added 2026-04-17; badges step 2026-04-17 rev).
// Primary entry point for entering/updating a match result once KO has passed.
// Steps: 1) Half-time · 2) Full-time · 3) Goalscorers · 4) Man of the Match ·
//        5) Badges (optional — skip or award per-player, writes to player_badges
//                   with lineup_id set so awards are tied to the match).
// Goalscorers and MOTM use an add-one-at-a-time flow: a list of added entries +
// "+ Add…" button that reveals an in-panel player picker. Local wizard state is
// only committed to editor.current on Save (autosave then persists). Badge
// awards persist immediately on pick (consistent with Squad tab) — the wizard
// is just a discovery shortcut, and the badge is already public the moment a
// coach confirms it in the picker.
function openResultWizard() {
  const { current, canEdit } = editor;
  if (!current || !current.id) {
    alert('Save the match details first before entering a result.');
    return;
  }
  if (!canEdit) return;

  // Clone current state so the wizard is cancelable.
  const state = {
    step: 1,
    ht_us:  current.our_score_ht,
    ht_opp: current.opp_score_ht,
    ft_us:  current.our_score_ft,
    ft_opp: current.opp_score_ft,
    scorers: (Array.isArray(current.goalscorers) ? current.goalscorers : [])
      .map(g => ({ player_id: g.player_id, count: parseInt(g.count, 10) || 0 }))
      .filter(g => g.player_id && g.count > 0),
    motm: (Array.isArray(current.motm) ? current.motm : [])
      .map(m => ({ player_id: m.player_id, reason: (m.reason || '').toString() }))
      .filter(m => m.player_id),
    pickMode: null,  // 'scorer' | 'motm' | null — within-step picker toggle
  };

  // Candidate players for pickers: matchday squad (slots ∪ subs) if any, else full squad.
  const allPlayers = editor.players || [];
  const slotIds = current.slots ? Object.values(current.slots).filter(Boolean) : [];
  const subIds = Array.isArray(current.subs) ? current.subs.filter(Boolean) : [];
  const matchdayIds = new Set([...slotIds, ...subIds]);
  const useMatchday = matchdayIds.size > 0;
  const candidates = (useMatchday ? allPlayers.filter(p => matchdayIds.has(p.id)) : allPlayers)
    .slice()
    .sort((a, b) => {
      const an = a.number == null ? 99 : a.number;
      const bn = b.number == null ? 99 : b.number;
      if (an !== bn) return an - bn;
      return (a.name || '').localeCompare(b.name || '');
    });
  const playersById = Object.fromEntries(allPlayers.map(p => [p.id, p]));

  // Modal shell
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:500px;height:auto;max-height:92vh;display:flex;flex-direction:column">
      <div class="map-modal-header">
        <strong id="rw-title">Enter result</strong>
        <button class="btn-secondary" id="rw-close" type="button" aria-label="Close">✕</button>
      </div>
      <div id="rw-steps" style="display:flex;gap:0.25rem;padding:0.5rem 0.9rem 0.25rem">
        ${[1,2,3,4,5].map(n => `<div class="rw-step-chip" data-rw-chip="${n}" style="flex:1;height:4px;border-radius:2px;background:#e5e5e5"></div>`).join('')}
      </div>
      <div class="map-modal-body" id="rw-body" style="padding:0.9rem;overflow-y:auto;flex:1"></div>
      <div id="rw-footer" style="padding:0.6rem 0.9rem;border-top:1px solid #eee;display:flex;gap:0.5rem;justify-content:space-between;align-items:center"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#rw-close').onclick = () => {
    if (state.pickMode) { state.pickMode = null; render(); return; }
    close();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (state.pickMode) { state.pickMode = null; render(); return; }
      close();
    }
  });

  const oppName = escapeHtml(current.opponent || 'Opponent');
  const intOrNull = v => {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // ---- Per-step body renderers ----

  const htmlStepHt = () => `
    <p class="muted" style="margin:0 0 0.6rem;font-size:0.82rem">Enter the half-time score. Leave blank if you didn't track HT.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin:0">
        <span style="font-size:0.8rem;font-weight:600">Us</span>
        <input type="number" id="rw-ht-us" value="${state.ht_us == null ? '' : state.ht_us}" min="0" step="1" placeholder="—" inputmode="numeric"
               style="font-size:1.4rem;text-align:center;padding:0.5rem;border:1px solid #ccc;border-radius:6px" />
      </label>
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin:0">
        <span style="font-size:0.8rem;font-weight:600">${oppName}</span>
        <input type="number" id="rw-ht-opp" value="${state.ht_opp == null ? '' : state.ht_opp}" min="0" step="1" placeholder="—" inputmode="numeric"
               style="font-size:1.4rem;text-align:center;padding:0.5rem;border:1px solid #ccc;border-radius:6px" />
      </label>
    </div>
  `;

  const htmlStepFt = () => `
    <p class="muted" style="margin:0 0 0.6rem;font-size:0.82rem">Enter the full-time score.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin:0">
        <span style="font-size:0.8rem;font-weight:600">Us</span>
        <input type="number" id="rw-ft-us" value="${state.ft_us == null ? '' : state.ft_us}" min="0" step="1" placeholder="—" inputmode="numeric"
               style="font-size:1.4rem;text-align:center;padding:0.5rem;border:1px solid #ccc;border-radius:6px" />
      </label>
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin:0">
        <span style="font-size:0.8rem;font-weight:600">${oppName}</span>
        <input type="number" id="rw-ft-opp" value="${state.ft_opp == null ? '' : state.ft_opp}" min="0" step="1" placeholder="—" inputmode="numeric"
               style="font-size:1.4rem;text-align:center;padding:0.5rem;border:1px solid #ccc;border-radius:6px" />
      </label>
    </div>
    ${state.ht_us != null && state.ht_opp != null
      ? `<div class="muted" style="margin-top:0.6rem;font-size:0.78rem">HT was ${state.ht_us}-${state.ht_opp}.</div>`
      : ''}
  `;

  const _pickerHtml = (mode) => {
    // Filter out players already selected (MOTM only — scorers can be tapped again to +1).
    const rows = candidates.map(p => {
      const alreadyMotm = mode === 'motm' && state.motm.some(m => m.player_id === p.id);
      const numBadge = (p.number != null)
        ? `<span style="display:inline-block;min-width:1.7em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.72rem;padding:0.1em 0.35em;border-radius:3px;margin-right:0.55em;font-weight:600">${p.number}</span>`
        : '<span style="display:inline-block;min-width:1.7em;margin-right:0.55em"></span>';
      return `
        <button type="button" class="rw-pick-row" data-rw-pick-id="${escapeHtml(p.id)}" ${alreadyMotm ? 'disabled' : ''}
          style="display:flex;width:100%;align-items:center;padding:0.6rem 0.7rem;border:1px solid #e5e5e5;background:${alreadyMotm ? '#f5f5f5' : '#fff'};color:${alreadyMotm ? '#999' : '#111'};border-radius:6px;margin-bottom:0.3rem;cursor:${alreadyMotm ? 'default' : 'pointer'};text-align:left">
          ${numBadge}
          <span style="flex:1;font-size:0.95rem">${escapeHtml(p.name || '—')}</span>
          ${alreadyMotm ? '<span style="font-size:0.75rem;color:#888">already MOTM</span>' : '<span style="font-size:1.1rem;color:#2a7">+</span>'}
        </button>
      `;
    }).join('');
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <strong style="font-size:0.95rem">${mode === 'scorer' ? 'Add goalscorer' : 'Add Man of the Match'}</strong>
        <button type="button" class="btn-secondary" id="rw-pick-cancel" style="font-size:0.8rem">← Back</button>
      </div>
      <p class="muted" style="margin:0 0 0.5rem;font-size:0.78rem">${useMatchday ? `Tap a player from the matchday squad (${candidates.length}).` : 'No matchday squad yet — showing full squad.'}</p>
      <div>${rows || '<p class="muted">No players available.</p>'}</div>
    `;
  };

  const htmlStepGoals = () => {
    if (state.pickMode === 'scorer') return _pickerHtml('scorer');
    const total = state.scorers.reduce((s, g) => s + (g.count || 0), 0);
    const ftUs = state.ft_us;
    const mismatch = (ftUs != null && total !== ftUs);
    const rows = state.scorers.length === 0
      ? '<p class="muted" style="font-size:0.85rem;padding:0.75rem 0;text-align:center">No goalscorers added yet.</p>'
      : state.scorers.map((g, idx) => {
          const p = playersById[g.player_id];
          if (!p) return '';
          const numBadge = (p.number != null)
            ? `<span style="display:inline-block;min-width:1.7em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.72rem;padding:0.1em 0.35em;border-radius:3px;margin-right:0.55em;font-weight:600">${p.number}</span>`
            : '';
          return `
            <div class="rw-scorer-row" data-rw-idx="${idx}" style="display:flex;align-items:center;gap:0.4rem;padding:0.5rem 0.6rem;border:1px solid #e5e5e5;border-radius:6px;margin-bottom:0.35rem;background:#fff">
              ${numBadge}
              <span style="flex:1;font-size:0.9rem">${escapeHtml(p.name || '—')}</span>
              <button type="button" class="rw-sc-minus" aria-label="Decrease" style="width:2em;height:2em;border:1px solid #ccc;background:#fff;border-radius:4px;font-size:1rem;cursor:pointer">−</button>
              <strong style="min-width:1.4em;text-align:center;font-size:1rem">${g.count}</strong>
              <button type="button" class="rw-sc-plus" aria-label="Increase" style="width:2em;height:2em;border:1px solid #ccc;background:#fff;border-radius:4px;font-size:1rem;cursor:pointer">+</button>
              <button type="button" class="rw-sc-del" aria-label="Remove" style="width:2em;height:2em;border:1px solid #eee;background:#fff;color:#c33;border-radius:4px;font-size:0.9rem;cursor:pointer;margin-left:0.2rem">✕</button>
            </div>
          `;
        }).join('');
    return `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.4rem">
        <strong style="font-size:0.95rem">⚽ Our goalscorers</strong>
        <span class="muted" style="font-size:0.78rem">Total: <strong${mismatch ? ' style="color:#c33"' : ''}>${total}</strong>${ftUs != null ? ` / ${ftUs}` : ''}</span>
      </div>
      ${rows}
      ${mismatch ? `<div class="muted" style="font-size:0.72rem;color:#c33;margin:0.25rem 0 0.5rem">⚠ Scorer total (${total}) doesn't match full-time goals (${ftUs}).</div>` : ''}
      <button type="button" id="rw-add-scorer" class="primary" style="width:100%;margin-top:0.5rem">+ Add goalscorer</button>
    `;
  };

  const htmlStepMotm = () => {
    if (state.pickMode === 'motm') return _pickerHtml('motm');
    const rows = state.motm.length === 0
      ? '<p class="muted" style="font-size:0.85rem;padding:0.75rem 0;text-align:center">No Man of the Match yet.</p>'
      : state.motm.map((m, idx) => {
          const p = playersById[m.player_id];
          if (!p) return '';
          const numBadge = (p.number != null)
            ? `<span style="display:inline-block;min-width:1.7em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.72rem;padding:0.1em 0.35em;border-radius:3px;margin-right:0.55em;font-weight:600">${p.number}</span>`
            : '';
          return `
            <div class="rw-motm-row" data-rw-idx="${idx}" style="padding:0.55rem 0.6rem;border:1px solid #e5e5e5;border-radius:6px;margin-bottom:0.35rem;background:#fff">
              <div style="display:flex;align-items:center;gap:0.4rem">
                <span style="color:#b88800;font-size:1.1rem">★</span>
                ${numBadge}
                <span style="flex:1;font-size:0.9rem;font-weight:600">${escapeHtml(p.name || '—')}</span>
                <button type="button" class="rw-motm-del" aria-label="Remove" style="width:2em;height:2em;border:1px solid #eee;background:#fff;color:#c33;border-radius:4px;font-size:0.9rem;cursor:pointer">✕</button>
              </div>
              <input type="text" class="rw-motm-reason" value="${escapeHtml(m.reason || '')}" placeholder="Why? (optional)" maxlength="200"
                style="width:100%;margin-top:0.35rem;padding:0.4rem 0.5rem;font-size:0.85rem;border:1px solid #ddd;border-radius:4px" />
            </div>
          `;
        }).join('');
    return `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.4rem">
        <strong style="font-size:0.95rem">🏆 Man of the Match</strong>
        <span class="muted" style="font-size:0.78rem">${state.motm.length} selected</span>
      </div>
      <p class="muted" style="margin:0 0 0.35rem;font-size:0.78rem">Pick one or more. Reason is optional.</p>
      ${rows}
      <button type="button" id="rw-add-motm" class="primary" style="width:100%;margin-top:0.5rem">+ Add Man of the Match</button>
    `;
  };

  // Step 5 — optional badges. Lists every matchday candidate with any badges
  // they've already earned for THIS match (filtered by lineup_id). Each row
  // has a "+ Award badge" button that opens the same picker as the Squad tab
  // with lineup_id pre-filled. Awards persist immediately; this step is pure
  // UI convenience and can be skipped entirely — nothing requires the coach
  // to touch it.
  const htmlStepBadges = () => {
    const lineupId = current.id;
    const teamId = editor.team?.id;
    const allBadges = teamId ? getCachedTeamBadges(teamId) : [];
    const thisMatchBadges = allBadges.filter(b => b.lineup_id === lineupId);
    const byPlayer = {};
    for (const b of thisMatchBadges) {
      (byPlayer[b.player_id] = byPlayer[b.player_id] || []).push(b);
    }

    const rows = candidates.map(p => {
      const numBadge = (p.number != null)
        ? `<span style="display:inline-block;min-width:1.7em;text-align:center;background:#1e3a8a;color:#fff;font-size:0.72rem;padding:0.1em 0.35em;border-radius:3px;margin-right:0.55em;font-weight:600">${p.number}</span>`
        : '<span style="display:inline-block;min-width:1.7em;margin-right:0.55em"></span>';
      const mine = byPlayer[p.id] || [];
      const chipsHtml = mine.length === 0
        ? '<span class="muted" style="font-size:0.72rem">— no badges yet</span>'
        : mine.map(b => {
            const e = badgeEntry(b.badge_key);
            const nm = e ? e.name : b.badge_key;
            return `<span class="rw-bg-chip" data-rw-bg-id="${escapeHtml(b.id)}" title="${escapeHtml(nm)}${b.note ? ' — ' + escapeHtml(b.note) : ''}"
                      style="display:inline-flex;align-items:center;gap:0.2rem;background:#fff8e1;border:1px solid #d6a82b;border-radius:999px;padding:0.1rem 0.45rem;font-size:0.72rem;margin-right:0.25rem;margin-bottom:0.2rem">
                      <span>${badgeEmoji(b.badge_key)}</span>
                      <span>${escapeHtml(nm)}</span>
                      <button type="button" class="rw-bg-chip-x" aria-label="Remove badge"
                        style="background:transparent;border:0;color:#8a6b00;cursor:pointer;font-size:0.85rem;padding:0 0 0 0.2rem">✕</button>
                    </span>`;
          }).join('');
      return `
        <div class="rw-badge-row" data-rw-player-id="${escapeHtml(p.id)}" style="padding:0.55rem 0.6rem;border:1px solid #e5e5e5;border-radius:6px;margin-bottom:0.4rem;background:#fff">
          <div style="display:flex;align-items:center;gap:0.4rem">
            ${numBadge}
            <span style="flex:1;font-size:0.9rem;font-weight:600">${escapeHtml(p.name || '—')}</span>
            <button type="button" class="rw-bg-add btn-secondary" data-rw-award-pid="${escapeHtml(p.id)}"
              style="font-size:0.78rem;padding:0.3rem 0.55rem">+ Award badge</button>
          </div>
          <div style="margin-top:0.35rem">${chipsHtml}</div>
        </div>
      `;
    }).join('');

    return `
      <p class="muted" style="margin:0 0 0.5rem;font-size:0.82rem">Optional — give recognition to any standout players. Skip this step if you'd rather not. Badges appear immediately on the public card and are tagged to this match.</p>
      ${rows || '<p class="muted">No matchday squad.</p>'}
    `;
  };

  // ---- Main render + wire ----

  const render = () => {
    const titleEl = overlay.querySelector('#rw-title');
    const body    = overlay.querySelector('#rw-body');
    const footer  = overlay.querySelector('#rw-footer');

    // Title + step chips
    const stepLbls = ['Half-time score', 'Full-time score', 'Goalscorers', 'Man of the Match', 'Badges (optional)'];
    titleEl.innerHTML = `Result — <span class="muted" style="font-weight:400;font-size:0.85rem">Step ${state.step} of 5: ${escapeHtml(stepLbls[state.step - 1])}</span>`;
    overlay.querySelectorAll('[data-rw-chip]').forEach(c => {
      const n = parseInt(c.getAttribute('data-rw-chip'), 10);
      c.style.background = n <= state.step ? '#1e3a8a' : '#e5e5e5';
    });

    // Body
    if (state.step === 1) body.innerHTML = htmlStepHt();
    else if (state.step === 2) body.innerHTML = htmlStepFt();
    else if (state.step === 3) body.innerHTML = htmlStepGoals();
    else if (state.step === 4) body.innerHTML = htmlStepMotm();
    else if (state.step === 5) body.innerHTML = htmlStepBadges();

    // Footer — hide Back/Next while a picker is open (the picker has its own Back).
    // Step 4 shows both "Skip badges & save" (skips step 5) and "Next → Badges".
    // Step 5 shows "✓ Save result" — any badges awarded are already persisted.
    if (state.pickMode) {
      footer.innerHTML = '';
    } else {
      const backBtn = state.step > 1
        ? '<button type="button" class="btn-secondary" id="rw-back">← Back</button>'
        : '<span></span>';
      let rightBtn;
      if (state.step < 4) {
        rightBtn = '<button type="button" class="primary" id="rw-next">Next →</button>';
      } else if (state.step === 4) {
        rightBtn = `
          <button type="button" class="btn-secondary" id="rw-save-skip">Save & skip badges</button>
          <button type="button" class="primary" id="rw-next">Next → Badges</button>
        `;
      } else {
        rightBtn = '<button type="button" class="primary" id="rw-save">✓ Save result</button>';
      }
      footer.innerHTML = `
        <div>${backBtn}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="btn-secondary" id="rw-cancel">Cancel</button>
          ${rightBtn}
        </div>
      `;
    }

    wire();
  };

  const wire = () => {
    // Step 1 inputs
    const htUs  = overlay.querySelector('#rw-ht-us');
    const htOpp = overlay.querySelector('#rw-ht-opp');
    if (htUs)  htUs.oninput  = e => { state.ht_us  = intOrNull(e.target.value); };
    if (htOpp) htOpp.oninput = e => { state.ht_opp = intOrNull(e.target.value); };

    // Step 2 inputs
    const ftUs  = overlay.querySelector('#rw-ft-us');
    const ftOpp = overlay.querySelector('#rw-ft-opp');
    if (ftUs)  ftUs.oninput  = e => { state.ft_us  = intOrNull(e.target.value); };
    if (ftOpp) ftOpp.oninput = e => { state.ft_opp = intOrNull(e.target.value); };

    // Step 3 — goalscorer list controls
    overlay.querySelectorAll('.rw-scorer-row').forEach(row => {
      const idx = parseInt(row.dataset.rwIdx, 10);
      const minus = row.querySelector('.rw-sc-minus');
      const plus  = row.querySelector('.rw-sc-plus');
      const del   = row.querySelector('.rw-sc-del');
      if (plus)  plus.onclick  = () => { state.scorers[idx].count++; render(); };
      if (minus) minus.onclick = () => {
        state.scorers[idx].count = Math.max(0, state.scorers[idx].count - 1);
        if (state.scorers[idx].count === 0) state.scorers.splice(idx, 1);
        render();
      };
      if (del)   del.onclick   = () => { state.scorers.splice(idx, 1); render(); };
    });
    const addSc = overlay.querySelector('#rw-add-scorer');
    if (addSc) addSc.onclick = () => { state.pickMode = 'scorer'; render(); };

    // Step 4 — MOTM list controls
    overlay.querySelectorAll('.rw-motm-row').forEach(row => {
      const idx = parseInt(row.dataset.rwIdx, 10);
      const del = row.querySelector('.rw-motm-del');
      const rea = row.querySelector('.rw-motm-reason');
      if (del) del.onclick = () => { state.motm.splice(idx, 1); render(); };
      if (rea) rea.oninput = e => { state.motm[idx].reason = e.target.value; };
    });
    const addMotm = overlay.querySelector('#rw-add-motm');
    if (addMotm) addMotm.onclick = () => { state.pickMode = 'motm'; render(); };

    // Picker rows
    overlay.querySelectorAll('.rw-pick-row').forEach(btn => {
      if (btn.disabled) return;
      btn.onclick = () => {
        const pid = btn.dataset.rwPickId;
        if (state.pickMode === 'scorer') {
          const existing = state.scorers.find(g => g.player_id === pid);
          if (existing) existing.count++;
          else state.scorers.push({ player_id: pid, count: 1 });
        } else if (state.pickMode === 'motm') {
          if (!state.motm.some(m => m.player_id === pid)) {
            state.motm.push({ player_id: pid, reason: '' });
          }
        }
        state.pickMode = null;
        render();
      };
    });
    const pickCancel = overlay.querySelector('#rw-pick-cancel');
    if (pickCancel) pickCancel.onclick = () => { state.pickMode = null; render(); };

    // Step 5 — badges (per-player award + remove)
    overlay.querySelectorAll('[data-rw-award-pid]').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.dataset.rwAwardPid;
        const player = (editor.players || []).find(p => p.id === pid);
        if (!player) return;
        openAwardBadgeModal({
          team: editor.team,
          player,
          lineupId: editor.current?.id || null,
          onAwarded: () => {
            // Cache already updated by awardManualBadge; just re-render step 5.
            render();
          }
        });
      };
    });
    overlay.querySelectorAll('.rw-bg-chip-x').forEach(xBtn => {
      xBtn.onclick = async (ev) => {
        ev.stopPropagation();
        const chip = xBtn.closest('[data-rw-bg-id]');
        if (!chip) return;
        const badgeId = chip.dataset.rwBgId;
        if (!confirm('Remove this badge?')) return;
        try {
          await removeBadge(badgeId, editor.team?.id);
        } catch (e) {
          alert('Remove failed: ' + (e.message || e));
          return;
        }
        render();
      };
    });

    // Footer
    const backBtn = overlay.querySelector('#rw-back');
    const nextBtn = overlay.querySelector('#rw-next');
    const saveBtn = overlay.querySelector('#rw-save');
    const saveSkipBtn = overlay.querySelector('#rw-save-skip');
    const cancelBtn = overlay.querySelector('#rw-cancel');
    if (backBtn) backBtn.onclick = () => { state.step = Math.max(1, state.step - 1); render(); };
    if (nextBtn) nextBtn.onclick = () => { state.step = Math.min(5, state.step + 1); render(); };
    if (cancelBtn) cancelBtn.onclick = close;

    const doSave = () => {
      // Commit state → editor.current. Autosave hash covers these fields so this
      // will persist on the 800ms schedule. We also trigger immediately.
      // Note: badges are already persisted by the time we get here — they write
      // straight to player_badges on pick, same as the Squad-tab flow.
      editor.current.our_score_ht = state.ht_us;
      editor.current.opp_score_ht = state.ht_opp;
      editor.current.our_score_ft = state.ft_us;
      editor.current.opp_score_ft = state.ft_opp;
      editor.current.goalscorers = state.scorers.filter(g => g.player_id && g.count > 0)
        .map(g => ({ player_id: g.player_id, count: g.count }));
      editor.current.motm = state.motm.filter(m => m.player_id)
        .map(m => ({ player_id: m.player_id, reason: (m.reason || '').trim() }));
      close();
      try { if (typeof scheduleAutosaveIfPublished === 'function') scheduleAutosaveIfPublished(); } catch (_) {}
      renderLineupsTab();
      // After rerender, scroll back to the top of the panel/tab content so the
      // sub-tab strip is visible on phone (otherwise the result card + any
      // availability bar can push it below the fold, making it look like the
      // tabs have disappeared).
      try {
        const tc = document.getElementById('tab-content');
        if (tc && typeof tc.scrollTo === 'function') tc.scrollTo({ top: 0, behavior: 'auto' });
        else if (tc) tc.scrollTop = 0;
        if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, behavior: 'auto' });
      } catch (_) {}
    };
    if (saveBtn) saveBtn.onclick = doSave;
    if (saveSkipBtn) saveSkipBtn.onclick = doSave;
  };

  render();
  // Autofocus first input for keyboard users
  setTimeout(() => {
    const first = overlay.querySelector('#rw-ht-us, #rw-ft-us');
    if (first && first.focus) first.focus();
  }, 20);
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

  // ----- Post-match Result inputs -----
  // Wired only when the game has actually been played (the section is rendered
  // by matchResultSectionHtml). Inputs autosave via the standard hash mechanism,
  // so we don't need an explicit Save click here — typing is enough once the
  // lineup has an id. We re-render the body when goals change so the totals
  // and the tally-mismatch warning update live.
  const intOrNull = (v) => {
    const s = String(v || '').trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  };
  const htUsEl  = overlay.querySelector('#l-ht-us');
  const htOppEl = overlay.querySelector('#l-ht-opp');
  const ftUsEl  = overlay.querySelector('#l-ft-us');
  const ftOppEl = overlay.querySelector('#l-ft-opp');
  if (htUsEl)  htUsEl.oninput  = e => { editor.current.our_score_ht = intOrNull(e.target.value); };
  if (htOppEl) htOppEl.oninput = e => { editor.current.opp_score_ht = intOrNull(e.target.value); };
  // FT us drives the tally-vs-scorers warning. Don't rerender on every keystroke
  // (it would steal focus from the number input mid-typing) — refresh on blur.
  if (ftUsEl) {
    ftUsEl.oninput = e => { editor.current.our_score_ft = intOrNull(e.target.value); };
    ftUsEl.onblur  = () => rerenderBody();
  }
  if (ftOppEl) ftOppEl.oninput = e => { editor.current.opp_score_ft = intOrNull(e.target.value); };

  overlay.querySelectorAll('.md-scorer-row').forEach(row => {
    const pid = row.dataset.playerId;
    // Update editor state without rerendering — used while typing into the number
    // input so the field doesn't lose focus mid-keystroke.
    const writeOnly = (n) => {
      const safe = Math.max(0, parseInt(n, 10) || 0);
      editor.current.goalscorers = (editor.current.goalscorers || []).filter(g => g.player_id !== pid);
      if (safe > 0) editor.current.goalscorers.push({ player_id: pid, count: safe });
    };
    const setCount = (n) => { writeOnly(n); rerenderBody(); };
    const countEl = row.querySelector('.md-scorer-count');
    const minusEl = row.querySelector('.md-scorer-minus');
    const plusEl  = row.querySelector('.md-scorer-plus');
    if (countEl) {
      countEl.oninput = e => writeOnly(e.target.value);
      countEl.onblur  = () => rerenderBody();
    }
    if (minusEl) minusEl.onclick = () => setCount((parseInt(countEl?.value, 10) || 0) - 1);
    if (plusEl)  plusEl.onclick  = () => setCount((parseInt(countEl?.value, 10) || 0) + 1);
  });

  // ----- MOTM (Man of the Match) toggles + reason inputs -----
  // Toggling the star adds/removes the player from `editor.current.motm` and
  // rerenders so the reason input appears/disappears. Typing in the reason
  // input updates state without rerendering (would steal focus).
  overlay.querySelectorAll('.md-motm-row').forEach(row => {
    const pid = row.dataset.playerId;
    const findIdx = () => (editor.current.motm || []).findIndex(m => m.player_id === pid);
    const toggleBtn = row.querySelector('.md-motm-toggle');
    const reasonEl  = row.querySelector('.md-motm-reason');

    if (toggleBtn) toggleBtn.onclick = () => {
      editor.current.motm = editor.current.motm || [];
      const idx = findIdx();
      if (idx >= 0) {
        editor.current.motm.splice(idx, 1);
      } else {
        editor.current.motm.push({ player_id: pid, reason: '' });
      }
      rerenderBody();
    };

    if (reasonEl) {
      reasonEl.oninput = e => {
        editor.current.motm = editor.current.motm || [];
        const idx = findIdx();
        if (idx >= 0) editor.current.motm[idx].reason = e.target.value;
      };
    }
  });

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

// Active sub-tab inside the match editor (works on both phone and desktop post-redesign).
// Survives re-renders so the coach doesn't get bounced back to Squad.
// Active sub-tab in the panel next to the pitch. Matches is a sub-tab showing
// the fixtures-as-cards list. Availability is a permanent bar above the strip.
let _lineupPhoneTab = 'matches';
const _LINEUP_PHONE_TABS = [
  { key: 'matches',   label: 'Matches',      icon: '' },
  { key: 'squad',     label: 'Squad',        icon: '' },
  { key: 'subs',      label: 'Subs',         icon: '' },
  { key: 'formation', label: 'Formation',    icon: '' },
  { key: 'focus',     label: '🎯 Focus',     icon: '' },
  { key: 'info',      label: 'Info',         icon: '' },
];

// Formations top-level page sub-tab state. Only two sub-tabs: Formation (list +
// edit/save) and Squad (palette for drag-preview).
let _formationPhoneTab = 'formation';

// Shape of editor.current when editing/previewing a formation on the top-level
// Formations page. Intentionally slim — formations don't own match metadata.
function newFormationState() {
  return {
    id: null,
    formation: '4-3-3',
    slots: {},
    subs: [],            // always empty — Formations page has no subs row
    arrows: [],
    zoneLines: [null, null],
    ballVisible: false,
    ballPos: { x: 50, y: 50 }
  };
}

// Render the Formations top-level page (2026-04-17 rebuild). Same pitch-left +
// sub-tabs-right skeleton as the match editor, trimmed down to Formation +
// Squad. Shares the edit-positions + save / save-as-new handlers with the
// match editor (they've been made mode-aware via _rerenderEditor).
function renderFormationsTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, players, customFormations, current } = editor;

  const FORMS = allFormations(customFormations);
  const formationBtns = Object.keys(FORMS).map(f => {
    const info = FORMS[f];
    const cid = info._customId;
    // Players-stored indicator: 👥N badge when this custom formation has
    // pre-placed players saved with it. Only shown on the Formations page
    // (this function) — the match editor doesn't actually load stored
    // players, so an indicator there would be misleading.
    const playersBadge = info._hasPlayers
      ? `<span class="f-players-badge" title="${info._playerCount} player${info._playerCount === 1 ? '' : 's'} pre-placed">👥${info._playerCount}</span>`
      : '';
    return `<button class="f-btn ${current.formation === f ? 'active' : ''}${cid ? ' f-btn-custom' : ''}${info._hasPlayers ? ' f-btn-has-players' : ''}" data-formation="${f}"><span class="f-label">${escapeHtml(f)}</span>${playersBadge}${cid && canEdit ? `<span class="f-del" data-del-formation="${cid}" title="Delete">✕</span>` : ''}</button>`;
  }).join('');

  // Palette: players not already in a slot on the pitch.
  const usedIds = new Set([...Object.values(current.slots || {})].filter(Boolean));
  const availablePlayers = (players || []).filter(p => !usedIds.has(p.id));
  const paletteHtml = availablePlayers.length
    ? availablePlayers.map(p => chipHtml(p, 'palette')).join('')
    : `<p class="muted" style="padding:0.5rem">All players on the pitch.</p>`;

  // Formation panel body — formation list + edit/save controls.
  // Save / Save-as-new are visible at ALL times (not just in edit mode) so the
  // coach can persist player placements on a formation without needing to enter
  // position-editing first. The ✎ Edit formation / ✓ Done pair only exists to
  // enter/leave the drag-handle position-editing mode; saves work in either.
  const formationPanelHtml = `
    <div class="f-btns f-btns-col">${formationBtns}</div>
    ${canEdit ? `
      <div style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.35rem">
        ${_posEditMode
          ? `<button class="primary btn-full" id="pos-edit-done">✓ Done editing</button>
             <button class="btn-full" id="pos-edit-cancel">✕ Cancel edits</button>
             <p class="muted" style="font-size:0.72rem;margin:0.2rem 0 0.35rem">Drag handles to reposition. Double-click a label to rename.</p>`
          : `<button class="btn-full" id="pos-edit-toggle">✎ Edit formation</button>`
        }
        <button class="btn-full" id="pos-edit-save">💾 Save formation</button>
        <button class="btn-full" id="pos-edit-save-new" style="margin-bottom:0">➕ Save as new formation…</button>
      </div>
    ` : ''}
  `;

  const squadPanelHtml = `
    <p class="muted me-hint">Drag players onto the pitch to preview this formation with your squad. On save you'll be asked whether to keep the placements.</p>
    <div class="palette" id="palette">${paletteHtml}</div>
    ${canEdit ? `<button type="button" class="btn-full me-btn-clear-pitch" id="clear-pitch-squad">Clear pitch</button>` : ''}
  `;

  // Sub-tab strip — just two tabs here.
  const subTabsHtml = `
    <nav class="lineup-phone-tabs me-subtabs" role="tablist" aria-label="Formations sections">
      <button class="lineup-phone-tab ${_formationPhoneTab === 'formation' ? 'active' : ''}" role="tab" aria-selected="${_formationPhoneTab === 'formation' ? 'true' : 'false'}" data-ptab="formation">Formation</button>
      <button class="lineup-phone-tab ${_formationPhoneTab === 'squad' ? 'active' : ''}"     role="tab" aria-selected="${_formationPhoneTab === 'squad' ? 'true' : 'false'}"     data-ptab="squad">Squad</button>
    </nav>
  `;

  tabEl.innerHTML = `
    <div class="match-editor lineup-layout formations-layout" data-phone-tab="${_formationPhoneTab}">
      <div class="me-body">
        <div class="me-pitch-col">
          <div class="card pitch-card">
            <div class="pitch" id="pitch">
              <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
              <div class="slots-layer" id="slots-layer"></div>
            </div>
          </div>
        </div>
        <div class="me-panel-col">
          ${subTabsHtml}
          <div class="me-panel card">
            <div data-phone-group="formation" class="me-panel-body">${formationPanelHtml}</div>
            <div data-phone-group="squad" class="me-panel-body">${squadPanelHtml}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Paint the pitch and wire up events.
  renderPitch();
  wireFormationsEvents();
  // Position editing needs special wiring (drag handles, label double-click)
  if (canEdit && _posEditMode) wirePositionEditing();
  // Drag-and-drop uses a capture-phase listener that's wired once globally;
  // calling wireDragAndDrop ensures it's live if this is the first editor
  // surface the user has opened this session.
  if (typeof wireDragAndDrop === 'function') wireDragAndDrop();
}

// Wire events for the Formations top-level page. Formation-button clicks and
// the pos-edit-* handlers are already wired inside wireLineupEvents, but we
// don't call that function here (it would try to wire match-specific things
// that don't exist on this page). Instead we re-bind the slice that the
// Formations page renders: formation buttons, delete-formation X's,
// pos-edit-* buttons, clear-pitch button, and the sub-tab switcher.
function wireFormationsEvents() {
  const tabEl = document.getElementById('tab-content');
  const { canEdit } = editor;

  // Sub-tab switcher (Formation ↔ Squad)
  const layoutEl = tabEl.querySelector('.lineup-layout');
  tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.ptab;
      if (!key) return;
      _formationPhoneTab = key;
      if (layoutEl) layoutEl.setAttribute('data-phone-tab', key);
      tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(b => {
        const on = b.dataset.ptab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    };
  });

  // Formation buttons — reuse the same data-formation logic as the match editor
  tabEl.querySelectorAll('[data-formation]').forEach(b => {
    b.onclick = () => {
      if (!canEdit) return;
      const picked = b.dataset.formation;
      editor.current.formation = picked;
      delete editor.current.pos;
      delete editor.current.lbl;
      _posEditMode = false;
      // Pull stored player placements if this formation was saved with them
      const custom = (editor.customFormations || []).find(c => c.name === picked);
      editor.current.slots = custom?.data?.players ? { ...custom.data.players } : {};
      _rerenderEditor();
    };
  });

  // Custom-formation delete X on a formation button
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
      await logAudit(editor.team.id, 'formation', id, 'delete', {});
      if (!getFormation(editor.current.formation)) editor.current.formation = '4-3-3';
      _rerenderEditor();
    };
  });

  // Edit formation / Save / Save-as-new / Cancel / Done — shared extracted
  // handlers that also drive the match editor's (now-removed) sub-tab.
  wirePosEditingHandlers();

  // Collapsibles reused elsewhere — harmless no-op if no <details> cards exist.
  if (typeof wireCollapsibles === 'function') wireCollapsibles(tabEl);

  // Clear pitch button (Squad sub-tab) — wipe slots without re-rendering whole tab
  const clearBtn = document.getElementById('clear-pitch-squad');
  if (clearBtn) clearBtn.onclick = () => {
    editor.current.slots = {};
    refreshAfterChipMove();
  };
}

function renderLineupsTab() {
  const tabEl = document.getElementById('tab-content');
  const { team, canEdit, players, lineups, plays, customFormations, current } = editor;

  const FORMS = allFormations(customFormations);
  const formationBtns = Object.keys(FORMS).map(f => {
    const info = FORMS[f];
    const cid = info._customId;
    // 👥N badge signals the formation has pre-placed players you can load into
    // the match with one click. Uses the same shape as the Formations page.
    const playersBadge = info._hasPlayers
      ? `<span class="f-players-badge" title="${info._playerCount} player${info._playerCount === 1 ? '' : 's'} pre-placed — click formation to load them">👥${info._playerCount}</span>`
      : '';
    return `<button class="f-btn ${current.formation === f ? 'active' : ''}${cid ? ' f-btn-custom' : ''}${info._hasPlayers ? ' f-btn-has-players' : ''}" data-formation="${f}"><span class="f-label">${escapeHtml(f)}</span>${playersBadge}${cid && canEdit ? `<span class="f-del" data-del-formation="${cid}" title="Delete">✕</span>` : ''}</button>`;
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
    <button class="btn-full" id="save-as-play" style="margin-bottom:0">★ Save as tactic…</button>
  `) : '';

  // Availability state for this match.
  const curStatusForAvail = current?.lineup_status || (current?.published ? 'published' : 'draft');
  const availableOnThisMatch = !!current?.id && (curStatusForAvail === 'availability' || curStatusForAvail === 'published');
  const availCount = current?.id ? Object.keys(editor.availability || {}).length : 0;

  // Sub-tab strip — Squad / Subs / Formation / Info. Availability is no longer a
  // sub-tab; it sits permanently above this strip when a match is open.
  const subTabsHtml = `
    <nav class="lineup-phone-tabs me-subtabs" role="tablist" aria-label="Match editor sections">
      ${_LINEUP_PHONE_TABS.map(t => {
        const label = escapeHtml(t.label);
        return `
          <button class="lineup-phone-tab ${_lineupPhoneTab === t.key ? 'active' : ''}"
                  role="tab"
                  aria-selected="${_lineupPhoneTab === t.key ? 'true' : 'false'}"
                  data-ptab="${t.key}">${label}</button>
        `;
      }).join('')}
    </nav>
  `;

  // Summary card data
  const _stat = current?.lineup_status || (current?.published ? 'published' : 'draft');
  const statusLabel = _stat === 'published' ? 'Published' : _stat === 'availability' ? 'Availability' : 'Draft';
  const v = effectiveVenue(current || {}, team);
  const venueLine = [v.name, v.postcode].filter(Boolean).join(', ');
  const haLbl = current?.home_away === 'away' ? 'Away' : 'Home';
  const dateStr = current?.game_date ? formatDate(current.game_date) : '';
  const summaryOpp = current?.opponent ? `vs ${current.opponent}` : 'New match';
  const summaryMetaParts = [dateStr, haLbl, venueLine].filter(Boolean);
  const koStat   = current?.kickoff_time ? escapeHtml(current.kickoff_time) : '—';
  const arrStat  = current?.arrival_time ? escapeHtml(current.arrival_time) : '—';
  const formStat = current?.formation    ? escapeHtml(current.formation)    : '—';
  const subtitleParts = [dateStr, current?.kickoff_time ? 'KO ' + escapeHtml(current.kickoff_time) : ''].filter(Boolean);

  // ---- Matches sub-tab: fixtures list as cards, upcoming first, past second ----
  // Build once per render. Cards get availability pills decorated after mount.
  // Split rule (updated 2026-04-17): a match moves to Past the moment kickoff
  // has passed — not at midnight. So a 7pm kickoff earlier today is "past" by
  // 8pm, and the coach sees it in the Past section where they're prompted to
  // enter the score. matchHasBeenPlayed() has the same KO-vs-now logic as the
  // Enter-result button so the two features agree.
  const _upcoming = [];
  const _past = [];
  lineups.forEach(l => {
    if (matchHasBeenPlayed(l)) _past.push(l);
    else _upcoming.push(l);
  });
  // Upcoming: soonest first (undated go last). Past: most recent first.
  _upcoming.sort((a, b) => {
    if (!a.game_date && !b.game_date) return 0;
    if (!a.game_date) return 1;
    if (!b.game_date) return -1;
    return a.game_date.localeCompare(b.game_date);
  });
  _past.sort((a, b) => (b.game_date || '').localeCompare(a.game_date || ''));

  const _matchCardHtml = (l) => {
    const haLbl = l.home_away === 'away' ? 'Away' : 'Home';
    const title = l.opponent ? 'vs ' + escapeHtml(l.opponent) : '—';
    const metaParts = [
      haLbl,
      l.kickoff_time ? 'KO ' + escapeHtml(l.kickoff_time) : '',
      l.data?.formation ? l.data.formation : '',
    ].filter(Boolean);
    const st = l.lineup_status || (l.published ? 'published' : 'draft');
    const stLbl = st === 'published' ? 'Published' : st === 'availability' ? 'Availability' : 'Draft';

    // Date block: SAT / 18 / APR — or blank if no date.
    let dateBlock = '<div class="mc-date mc-date-none">—</div>';
    if (l.game_date) {
      const d = new Date(l.game_date + 'T12:00:00'); // avoid TZ shift
      const dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      dateBlock = `<div class="mc-date">
        <span class="mc-day">${dayNames[d.getDay()]}</span>
        <span class="mc-num">${d.getDate()}</span>
        <span class="mc-mon">${monthNames[d.getMonth()]}</span>
      </div>`;
    }

    // Result state drives card colour + right-hand chip (added 2026-04-17):
    //   • played + score recorded → green outline, coloured FT/HT chip (existing)
    //   • played + no score yet   → red outline + "⚠ Needs score" chip
    //   • not yet played          → neutral outline, no chip
    const resBadge = matchResultBadge(l);
    const played   = matchHasBeenPlayed(l);
    const hasResult = matchHasResult(l);
    const needsScore = played && !hasResult;
    const doneScored = played && hasResult;
    const stateClass = doneScored ? 'done' : needsScore ? 'needs-score' : '';

    let rightChipHtml = '';
    if (resBadge) {
      rightChipHtml = `<div class="me-match-result" style="font-weight:700;font-size:0.78rem;color:#fff;background:${resBadge.color};padding:0.15rem 0.4rem;border-radius:3px;margin-bottom:0.2rem;text-align:center;letter-spacing:0.02em">${escapeHtml(resBadge.text)}</div>`;
    } else if (needsScore) {
      rightChipHtml = `<div class="me-match-needs-score" style="font-weight:700;font-size:0.72rem;color:#fff;background:#c33;padding:0.15rem 0.45rem;border-radius:3px;margin-bottom:0.2rem;text-align:center;letter-spacing:0.02em;white-space:nowrap">⚠ Needs score</div>`;
    }

    return `
      <div class="me-match-card ${current?.id === l.id ? 'active' : ''} ${stateClass}" data-me-lineup="${l.id}">
        ${dateBlock}
        <div class="mc-body">
          <div class="me-match-title">${title}</div>
          <div class="me-match-meta lineup-meta">${metaParts.join(' · ')}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.2rem">
          ${rightChipHtml}
          <div class="me-match-status me-match-status-${st}">${stLbl}</div>
        </div>
        ${canEdit ? `<button class="me-match-del" data-del-lineup="${l.id}" title="Delete">✕</button>` : ''}
      </div>
    `;
  };

  // Dashed "+ New match" card removed 2026-04-17 — the global + (sidebar / phone header)
  // is the single entry point for creating a match. Top-right "+ New" in the editor
  // header also now opens the wizard.

  const matchesPanelHtml = `
    <div class="me-matches">
      <div class="me-matches-group">
        <div class="me-matches-heading">Upcoming</div>
        <div class="me-matches-grid">
          ${_upcoming.length ? _upcoming.map(_matchCardHtml).join('') : `<p class="muted" style="padding:0.25rem">No upcoming matches — tap the orange <strong>+</strong> to add one.</p>`}
        </div>
      </div>
      ${_past.length ? `
        <div class="me-matches-group">
          <div class="me-matches-heading">Past</div>
          <div class="me-matches-grid">
            ${_past.map(_matchCardHtml).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Sub-tab panel bodies
  const squadPanelHtml = `
    <p class="muted me-hint">Tap an empty slot on the pitch, then tap a player here to assign. Dot colour = availability.</p>
    <div class="palette" id="palette">${paletteHtml}</div>
    ${canEdit ? `<button type="button" class="btn-full me-btn-clear-pitch" id="clear-pitch-squad">Clear pitch</button>` : ''}
  `;

  const subsPanelHtml = `
    <div class="subs-label">SUBSTITUTES (${current.subs.filter(Boolean).length}/${MAX_SUBS})</div>
    <div class="subs-row" id="subs-row"></div>
    ${canEdit ? `<p class="muted me-hint" style="margin-top:0.5rem">Tap an empty sub slot to add a player, or tap a sub's chip to remove.</p>` : ''}
  `;

  // Match editor Formation sub-tab is read-only (2026-04-17 restructure) — just
  // a formation picker. Edit / save / save-as-new now live on the top-level
  // Formations page. The in-match tactics card (Tactics / Ball / Zones) is
  // still here since those live with the match, not the formation template.
  const formationPanelHtml = `
    <div class="f-btns f-btns-col">${formationBtns}</div>
    ${canEdit ? `
      <p class="muted" style="font-size:0.72rem;margin:0.6rem 0 0">Pick a formation. To edit or save a new one, use the <strong>Formations</strong> tab.</p>
    ` : ''}
    ${tacticsCardHtml}
  `;

  // Availability bar — always visible above the editor sub-tabs when a match is open.
  // Render the tally button synchronously using the in-memory cache (editor.availability)
  // so there's no layout shift when the async DB fetch in renderCoachAvailabilityPanel
  // returns. The async call replaces the same-sized button with fresh numbers — no
  // empty-div-grows-into-button flicker (was a jarring ~30px height jump before).
  // Stale cache is handled: if _availabilityFor doesn't match the current lineup id,
  // we treat the cache as empty so we don't briefly show last match's numbers.
  const _availTallyBtnHtml = () => {
    const cacheHitsThisLineup = editor && editor._availabilityFor === current?.id;
    const byPlayer = cacheHitsThisLineup ? (editor.availability || {}) : {};
    const plist = editor?.players || [];
    const tally = { available: 0, maybe: 0, unavailable: 0, none: 0 };
    plist.forEach(p => {
      const s = byPlayer[p.id];
      if (s === 'available' || s === 'maybe' || s === 'unavailable') tally[s]++;
      else tally.none++;
    });
    return `<button type="button" class="btn-full" id="availability-panel-open" style="text-align:left;padding:0.5rem 0.6rem;font-size:0.85rem;margin-bottom:0">
      📋 Availability responses — ✅ ${tally.available} · 🤔 ${tally.maybe} · ❌ ${tally.unavailable} · — ${tally.none}
    </button>`;
  };
  const availBarHtml = current?.id
    ? (availableOnThisMatch
        ? `<div class="me-avail-bar" id="availability-panel">${_availTallyBtnHtml()}</div>`
        : `<div class="me-avail-bar"><p class="muted" style="font-size:0.85rem;margin:0">No availability responses yet — open availability from <em>Edit match</em> (Info tab).</p></div>`)
    : '';

  // Phone-only status row. Desktop shows the status pill in `.me-header` (hidden on phone),
  // so this row gives coaches access to the same status-change modal on mobile widths.
  // CSS (.me-phone-status-row) hides this on ≥900px and shows it below that.
  const phoneStatusRowHtml = (canEdit && current?.id)
    ? `
      <div class="me-phone-status-row">
        <span class="me-phone-status-label">Status</span>
        <button type="button" class="me-status-pill me-status-pill-${_stat} js-open-status">${statusLabel} ▾</button>
      </div>
    `
    : '';

  // "Enter result" button — visible only once kickoff has passed.
  // Two flavours:
  //   • No result yet (amber) — full-width prominent call-to-action, pushing
  //     the coach to record the score asap.
  //   • Result already recorded (green, compact) — a small inline "Edit"
  //     button docked to the top-right of the compact result card so the
  //     big button doesn't keep eating vertical space after the entry is done.
  // The compact version is rendered INSIDE compactMatchResultCardHtml below;
  // here we only render the big amber version when there's no result yet.
  const showEnterResultFull = canEdit && current?.id && matchHasBeenPlayed(current) && !matchHasResult(current);
  const enterResultBtnHtml = showEnterResultFull
    ? `
      <button type="button" class="me-enter-result-btn" id="me-enter-result"
        style="box-sizing:border-box;width:100%;margin:0.4rem 0;padding:0.7rem 0.9rem;background:#b88800;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:0.92rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.45rem;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <span aria-hidden="true">⚽</span>
        <span>Enter result</span>
      </button>
    `
    : '';

  // Info panel: just the match-summary card (Arrange / Share buttons + save-msg).
  const infoPanelHtml = `
    <div class="me-info-block">
      ${matchSummaryHtml(current, team, canEdit)}
    </div>
  `;

  // Focus panel: one row per picked player (pitch starters + subs), each with a
  // compact list of match cues (primary star first) + an "Add focus" button.
  // The panel is driven entirely off the in-memory caches — _matchCues and
  // _cueCatalog — and kicks off a re-fetch in a sibling effect (further down)
  // when the cache is missing for this lineup.
  const focusPanelHtml = canEdit && current?.id
    ? renderFocusPanelHtml(current, team?.id, players)
    : (!canEdit
        ? `<p class="muted me-hint">Focus notes are coach-only here — parents will see any parent-visible cues on the shared match page.</p>`
        : `<p class="muted me-hint">Save the match first, then pick your squad — you'll be able to set a Focus for each player.</p>`);

  tabEl.innerHTML = `
    <div class="match-editor lineup-layout" data-phone-tab="${_lineupPhoneTab}">
      <!-- Match header: title + stats + actions. Desktop only (hidden on phone). -->
      <header class="me-header">
        <div class="me-header-left">
          <div class="me-summary-opp">${escapeHtml(summaryOpp)}</div>
          <div class="me-summary-meta muted">${summaryMetaParts.length ? escapeHtml(summaryMetaParts.join(' · ')) : '<em>No match details yet</em>'}</div>
        </div>
        <div class="me-header-stats">
          <div class="me-stat"><div class="me-stat-label">KICK OFF</div><div class="me-stat-val">${koStat}</div></div>
          <div class="me-stat"><div class="me-stat-label">ARRIVAL</div><div class="me-stat-val">${arrStat}</div></div>
          <div class="me-stat"><div class="me-stat-label">FORMATION</div><div class="me-stat-val">${formStat}</div></div>
          <div class="me-stat me-stat-status">
            <div class="me-stat-label">STATUS</div>
            ${canEdit && current?.id
              ? `<button type="button" class="me-status-pill me-status-pill-${_stat} js-open-status" id="me-open-status">${statusLabel} ▾</button>`
              : `<div class="me-stat-val">${statusLabel}</div>`}
          </div>
        </div>
        <div class="me-header-actions">
          <button type="button" class="me-btn me-btn-share" id="me-btn-share">Share</button>
          ${canEdit ? `<button type="button" class="me-btn me-btn-new" id="me-btn-new">+ New</button>` : ''}
        </div>
      </header>

      <!-- Editor body: pitch left + panel right on desktop; on mobile the
           top-strip (result card / availability / status / Enter result) sits
           ABOVE the pitch, then pitch, then sub-tabs. CSS grid on desktop
           makes the pitch span two rows so the right column can split in two.
           On mobile it's a flex column in source order. -->
      <div class="me-body match-editor-body">
        <div class="me-top-strip">
          <!-- Result summary (only on played matches with a score/scorers/MOTM recorded) -->
          ${compactMatchResultCardHtml(current)}
          <!-- Badges awarded during this match (only shows when ≥1 match-linked badge exists) -->
          ${matchAwardsCardHtml(current, editor.team?.id)}
          <!-- Availability — permanently visible when a match is open -->
          ${availBarHtml}
          <!-- Phone-only status row (hidden on desktop where the header shows status) -->
          ${phoneStatusRowHtml}
          <!-- Enter/edit result — only once KO has passed -->
          ${enterResultBtnHtml}
        </div>

        <div class="me-pitch-col">
          <div class="card pitch-card">
            <div class="pitch" id="pitch">
              <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
              <div class="slots-layer" id="slots-layer"></div>
              <canvas class="tactics-canvas" id="tactics-canvas"></canvas>
              <div class="ball-el" id="ball-el"></div>
            </div>
          </div>
        </div>

        <div class="me-sub-strip">
          ${subTabsHtml}
          <div class="me-panel card">
            <!-- Matches sub-tab: fixtures as cards, in the panel next to the pitch -->
            <div data-phone-group="matches" class="me-panel-body me-panel-body-matches">${matchesPanelHtml}</div>
            <div data-phone-group="squad" class="me-panel-body">${squadPanelHtml}</div>
            <div data-phone-group="subs" class="me-panel-body">${subsPanelHtml}</div>
            <div data-phone-group="formation" class="me-panel-body">${formationPanelHtml}</div>
            <div data-phone-group="focus" class="me-panel-body">${focusPanelHtml}</div>
            <div data-phone-group="info" class="me-panel-body">${infoPanelHtml}</div>
          </div>
        </div>
      </div>

      ${current?.id ? `
        <!-- Floating Share pill (phone only). Visible once a lineup is saved. -->
        <button type="button" class="share-fab" id="me-share-fab" aria-label="Share match">
          <span class="share-fab-ic" aria-hidden="true">🔗</span>
          <span class="share-fab-label">Share</span>
        </button>
      ` : ''}
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

  // Coach-facing availability responses panel + chip decorations (when in availability/published mode)
  const curStatus = current?.lineup_status || (current?.published ? 'published' : 'draft');
  if (current?.id && (curStatus === 'availability' || curStatus === 'published')) {
    renderCoachAvailabilityPanel();
    // Paint from the in-memory cache immediately so dots don't flicker while we re-fetch.
    applyAvailabilityDecorations();
    // Then refresh from DB and re-apply (will only be visible diff if anything changed).
    ensureAvailabilityForLineup(current.id).then(() => applyAvailabilityDecorations());
    startCoachAvailabilityPoll(current.id);
  } else {
    editor.availability = {};
    applyAvailabilityDecorations(); // clears any stale rings
    stopCoachAvailabilityPoll();
  }

  // Decorate the match cards in the Matches sub-tab with availability response pills
  const pillIds = lineups
    .filter(l => {
      const st = l.lineup_status || (l.published ? 'published' : 'draft');
      return st === 'availability' || st === 'published';
    })
    .map(l => l.id);
  decorateCardsWithAvailabilityCounts(
    '#tab-content .me-match-card[data-me-lineup]',
    'meLineup',
    pillIds,
    players.length
  );
}

// Fetch availability for a lineup. Always re-fetches (the previous lineupId-keyed cache
// silently returned stale data: once cached, parent submissions never showed up on the
// coach's chips until they navigated away and back). The fetch is small (player_id + status)
// so the round-trip cost is negligible vs. correctness.
async function ensureAvailabilityForLineup(lineupId) {
  if (!lineupId) { editor.availability = {}; return; }
  editor._availabilityFor = lineupId;
  const { data, error } = await supabase
    .from('player_availability')
    .select('player_id,status')
    .eq('lineup_id', lineupId);
  if (error) { console.warn('availability fetch failed', error); editor.availability = {}; return; }
  editor.availability = Object.fromEntries((data || []).map(a => [a.player_id, a.status]));
}

// Apply/refresh availability dots on every chip in the current tab.
// Green = available, amber = maybe, red = unavailable. Dots are small and sit in the
// bottom-right corner so they don't obscure the player's name/number/photo.
// Kept on [data-player-id] chips only (chipHtml output) — Squad tab chips use
// data-player and are intentionally left clean (no match context to show).
function applyAvailabilityDecorations() {
  const map = editor?.availability || {};
  document.querySelectorAll('[data-player-id]').forEach(chip => {
    const pid = chip.dataset.playerId;
    const s = map[pid];
    // Clear previous decoration (supports rollback from older ring/badge style too)
    chip.style.boxShadow = '';
    chip.style.outline = '';
    const oldBadge = chip.querySelector('.avail-badge');
    if (oldBadge) oldBadge.remove();
    const oldDot = chip.querySelector('.avail-dot');
    if (oldDot) oldDot.remove();
    if (!s) return;
    // Bright green is chosen deliberately — dark green disappears against the pitch.
    const colour = s === 'available' ? '#22c55e'
                 : s === 'maybe'     ? '#f9a825'
                 : s === 'unavailable' ? '#e53935'
                 : null;
    if (!colour) return;
    const dot = document.createElement('div');
    dot.className = 'avail-dot';
    dot.style.cssText = `position:absolute;bottom:-5px;right:-5px;width:20px;height:20px;border-radius:50%;background:${colour};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);z-index:3;pointer-events:none`;
    if (getComputedStyle(chip).position === 'static') chip.style.position = 'relative';
    chip.appendChild(dot);
  });
}

// Start a coach-side poll for fresh availability data while a lineup editor is open.
// Re-fetches every 10s, refreshes chip dots and the responses-panel tally button.
// Idempotent: if already polling the same lineup, do nothing. If a different lineup,
// stops the previous poll and starts a new one. Auto-stops if the editor disappears
// or the lineup id changes underfoot.
function startCoachAvailabilityPoll(lineupId) {
  if (!lineupId) { stopCoachAvailabilityPoll(); return; }
  if (_coachAvailabilityPoll && _coachAvailabilityPollLineupId === lineupId) return;
  stopCoachAvailabilityPoll();
  _coachAvailabilityPollLineupId = lineupId;
  _coachAvailabilityPoll = setInterval(async () => {
    // Bail out if the user has navigated away from the lineup editor or switched lineup
    const stillOpen = editor && editor.current && editor.current.id === lineupId;
    if (!stillOpen) { stopCoachAvailabilityPoll(); return; }
    const st = editor.current.lineup_status || (editor.current.published ? 'published' : 'draft');
    if (st !== 'availability' && st !== 'published') { stopCoachAvailabilityPoll(); return; }
    try {
      await ensureAvailabilityForLineup(lineupId);
      applyAvailabilityDecorations();
      // Refresh the tally button text so coaches see new ✅/🤔/❌ counts without reopening the modal
      renderCoachAvailabilityPanel();
    } catch (e) { /* swallow — next tick will retry */ }
  }, 5000);
}
function stopCoachAvailabilityPoll() {
  if (_coachAvailabilityPoll) { clearInterval(_coachAvailabilityPoll); _coachAvailabilityPoll = null; }
  _coachAvailabilityPollLineupId = null;
}

// Decorate match-context chips with MOTM star (top-left), goal-count ball (top-right),
// and a small bottom-left row of any badges earned in THIS match (when teamId + lineupId
// are provided — filter is strict `lineup_id === lineupId` so cumulative awards don't
// appear on every fixture chip).
// Scoped to a root element so it doesn't bleed across tabs (e.g. fixture preview vs editor).
// Idempotent: clears previous .motm-star / .goal-ball / .chip-badges before re-adding so
// calling from renderPitch / renderSubsBar / renderFixturePitch on every render is safe.
// No-op when arrays are empty (i.e. unplayed matches show nothing extra).
function applyMatchDecorations(rootEl, motm, goalscorers, teamId, lineupId) {
  if (!rootEl) return;
  const motmIds = new Set((Array.isArray(motm) ? motm : []).map(m => m && m.player_id).filter(Boolean));
  const goalsBy = {};
  for (const g of (Array.isArray(goalscorers) ? goalscorers : [])) {
    const c = parseInt(g && g.count, 10) || 0;
    if (g && g.player_id && c > 0) goalsBy[g.player_id] = (goalsBy[g.player_id] || 0) + c;
  }

  // Build { playerId: [badge, ...] } from the cache, scoped to THIS lineup only.
  // We keep every award (no de-dup) so Fair Play x2 would render as two emojis —
  // the on-chip space is tight but that's the clearest signal to a parent glancing
  // at the match view. If tighter than ~3 badges, later tweaks can group-count here.
  const badgesByPlayer = {};
  if (teamId && lineupId) {
    const all = getCachedTeamBadges(teamId);
    for (const b of all) {
      if (!b || b.lineup_id !== lineupId) continue;
      (badgesByPlayer[b.player_id] = badgesByPlayer[b.player_id] || []).push(b);
    }
  }

  rootEl.querySelectorAll('[data-player-id]').forEach(chip => {
    chip.querySelectorAll('.motm-star, .goal-ball, .chip-badges').forEach(el => el.remove());
    if (getComputedStyle(chip).position === 'static') chip.style.position = 'relative';
    const pid = chip.dataset.playerId;
    if (motmIds.has(pid)) {
      const star = document.createElement('div');
      star.className = 'motm-star';
      star.title = 'Man of the Match';
      star.textContent = '★';
      // Top-left so we don't collide with availability dot (bottom-right) or goal ball (top-right).
      // Flexbox centering + oversized glyph so the star visually fills the gold disc rather than sitting small in the middle.
      star.style.cssText = 'position:absolute;top:-7px;left:-7px;width:24px;height:24px;border-radius:50%;background:#ffc107;color:#3a2a00;font-size:20px;line-height:1;font-weight:900;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);z-index:4;pointer-events:none;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 0 rgba(255,255,255,0.4)';
      chip.appendChild(star);
    }
    const goals = goalsBy[pid];
    if (goals && goals > 0) {
      const ball = document.createElement('div');
      ball.className = 'goal-ball';
      ball.title = `${goals} goal${goals === 1 ? '' : 's'}`;
      ball.textContent = String(goals);
      // Clean black-and-white disc with the number front-and-centre. Earlier radial-gradient "soccer ball" pattern made the digit unreadable; legibility wins.
      ball.style.cssText = 'position:absolute;top:-7px;right:-7px;min-width:24px;height:24px;padding:0 4px;border-radius:50%;background:#fff;color:#000;font-size:14px;line-height:1;font-weight:900;border:2.5px solid #111;box-shadow:0 1px 4px rgba(0,0,0,0.4);z-index:4;pointer-events:none;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif';
      chip.appendChild(ball);
    }
    // Match-specific badge row (bottom-left corner of chip). Cap at 3 emoji to
    // keep the chip readable; surface a "+N" dot if more were earned this match.
    const chipBadges = badgesByPlayer[pid] || [];
    if (chipBadges.length > 0) {
      const MAX_BADGES = 3;
      const shown = chipBadges.slice(0, MAX_BADGES);
      const overflow = chipBadges.length - shown.length;
      const row = document.createElement('div');
      row.className = 'chip-badges';
      const title = chipBadges.map(b => {
        const e = badgeEntry(b.badge_key);
        const nm = e ? e.name : b.badge_key;
        return b.note ? `${nm} — ${b.note}` : nm;
      }).join('\n');
      row.title = title;
      row.innerHTML = shown.map(b => `<span class="chip-badge-emoji">${badgeEmoji(b.badge_key)}</span>`).join('')
        + (overflow > 0 ? `<span class="chip-badge-more">+${overflow}</span>` : '');
      chip.appendChild(row);
    }
  });

  // Coach's Focus marker — small 🎯 pill in the bottom-right of the chip
  // showing how many focus cues are set for that player on THIS lineup. Only
  // rendered when we have a lineup context (teamId+lineupId), and cue cache
  // has been populated for that lineup. Coach-only semantically, but the row
  // is public-benign (just a target emoji + number) so we don't gate on role.
  if (lineupId) {
    // Lazy-populate the match-cue cache on first paint of this lineup so the
    // focus marker shows up even when the coach never opens the Focus tab.
    // The fetcher de-dupes via _matchCuesInflight; the .then() repaints the
    // pitch so markers appear without a manual re-render.
    if (teamId && !_matchCues[lineupId] && !_matchCuesInflight[lineupId]) {
      _matchCuesInflight[lineupId] = fetchMatchCues(teamId, lineupId)
        .catch(() => [])
        .finally(() => { delete _matchCuesInflight[lineupId]; })
        .then(() => {
          // Only repaint if the editor is still pointed at this lineup.
          if (editor?.current?.id === lineupId) _repaintFocusPitchMarkers();
        });
    }
    const cueRows = getCachedMatchCues(lineupId);
    if (cueRows && cueRows.length) {
      const cueCountByPlayer = {};
      const primaryByPlayer = {};
      for (const c of cueRows) {
        if (!c || !c.player_id) continue;
        cueCountByPlayer[c.player_id] = (cueCountByPlayer[c.player_id] || 0) + 1;
        if (c.is_primary && !primaryByPlayer[c.player_id]) {
          primaryByPlayer[c.player_id] = c;
        }
      }
      rootEl.querySelectorAll('[data-player-id]').forEach(chip => {
        // Clear any existing marker first — idempotent across re-renders.
        chip.querySelectorAll('.chip-focus-marker').forEach(el => el.remove());
        const pid = chip.dataset.playerId;
        const n = cueCountByPlayer[pid] || 0;
        if (n <= 0) return;
        if (getComputedStyle(chip).position === 'static') chip.style.position = 'relative';
        const mark = document.createElement('div');
        // Focus pill sits bottom-left; stack it above the match-badge row if
        // badges were already drawn on this chip. :has() handles this in
        // modern browsers, the class is a fallback for older ones.
        const hasBadges = !!chip.querySelector('.chip-badges');
        mark.className = 'chip-focus-marker'
          + (primaryByPlayer[pid] ? ' has-primary' : '')
          + (hasBadges ? ' stacked-above-badges' : '');
        const primary = primaryByPlayer[pid];
        const primaryLabel = primary
          ? (primary.cue_slug ? cueLabel(primary.cue_slug) : (primary.custom_note || '').split('\n')[0].slice(0, 40))
          : '';
        mark.title = primary
          ? `Focus — ${n} cue${n === 1 ? '' : 's'} (primary: ${primaryLabel})`
          : `Focus — ${n} cue${n === 1 ? '' : 's'}`;
        mark.innerHTML = `<span class="chip-focus-icon" aria-hidden="true">🎯</span><span class="chip-focus-count">${n}</span>`;
        chip.appendChild(mark);
      });
    } else {
      // Cues cache is empty — still clear stale markers in case they were
      // rendered before cues were deleted.
      rootEl.querySelectorAll('.chip-focus-marker').forEach(el => el.remove());
    }
  }
}

// Batch-fetch availability rows for a set of lineup ids and return
// { lineupId: { available, maybe, unavailable } } counts.
async function loadAvailabilityCountsForLineups(lineupIds) {
  const out = {};
  if (!lineupIds || !lineupIds.length) return out;
  for (const id of lineupIds) out[id] = { available: 0, maybe: 0, unavailable: 0 };
  const { data, error } = await supabase
    .from('player_availability')
    .select('lineup_id,status')
    .in('lineup_id', lineupIds);
  if (error) { console.warn('avail counts fetch failed', error); return out; }
  for (const r of data || []) {
    const bucket = out[r.lineup_id];
    if (!bucket) continue;
    if (r.status === 'available') bucket.available++;
    else if (r.status === 'maybe') bucket.maybe++;
    else if (r.status === 'unavailable') bucket.unavailable++;
  }
  return out;
}

// Render a compact row of counters (✓ ? ✗ —) summarising availability responses
// for a given match. rosterSize lets us surface "no response yet" as a 4th number.
function availPillsHtml(counts, rosterSize) {
  const av = counts?.available || 0;
  const mb = counts?.maybe || 0;
  const un = counts?.unavailable || 0;
  const nr = Math.max(0, (rosterSize || 0) - av - mb - un);
  return `<div class="avail-pills" aria-label="Availability responses">
      <span class="ap ap-av" title="Available">${av} <span class="ap-ic">✓</span></span>
      <span class="ap ap-mb" title="Maybe">${mb} <span class="ap-ic">?</span></span>
      <span class="ap ap-un" title="Unavailable">${un} <span class="ap-ic">✗</span></span>
      <span class="ap ap-nr" title="No response">${nr} <span class="ap-ic">—</span></span>
    </div>`;
}

// ---------- Share modal ----------
// One popup, two clearly-labelled sections: Availability link + Match link.
// Keeps every existing action — Copy, WhatsApp (combined message), Add to calendar.
// Locked state if the lineup isn't in the right status to be shared (e.g. draft).
// Post-create prompt shown after the Match Wizard inserts a lineup.
// "Share to WhatsApp now?" — on Yes, flips status to 'availability' so the
// availability link is live for parents, builds the combined WhatsApp message
// (same composer the Share modal uses) and opens wa.me in a new tab.
async function openShareToWhatsAppPrompt(lineupId) {
  if (!lineupId) return;
  const lineup = (editor?.lineups || []).find(l => l.id === lineupId)
    || (editor?.current?.id === lineupId ? editor.current : null);
  if (!lineup) return;
  const team = editor?.team || null;

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.innerHTML = `
    <div class="picker-modal" role="dialog" aria-label="Share match to WhatsApp" style="max-width:440px">
      <div class="picker-header">
        <h3>Share to WhatsApp now?</h3>
        <button type="button" class="picker-close" data-close aria-label="Close">×</button>
      </div>
      <div class="picker-body">
        <p style="margin:0 0 0.6rem;font-size:0.9rem">Send parents the match details + availability link. This will switch the match to <strong>Availability</strong> so the link works right away.</p>
        <p class="muted" style="margin:0 0 0.9rem;font-size:0.8rem">WhatsApp will open in a new tab with the message pre-filled — paste it into your team's group chat.</p>
        <div id="wa-prompt-msg" style="font-size:0.85rem;min-height:0;margin-bottom:0.4rem;color:var(--danger,red)"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="mw-btn" data-close>Not now</button>
          <button type="button" class="mw-btn mw-primary" id="wa-prompt-yes" style="background:#25D366;border-color:#25D366">💬 Yes, share</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target?.hasAttribute?.('data-close')) close();
  });

  overlay.querySelector('#wa-prompt-yes').onclick = async () => {
    const msgEl = overlay.querySelector('#wa-prompt-msg');
    const yesBtn = overlay.querySelector('#wa-prompt-yes');
    yesBtn.disabled = true; yesBtn.textContent = 'Updating…';

    // Flip status to availability if it's still draft so the /avail/ link works for parents.
    const curStatus = lineup.lineup_status || (lineup.published ? 'published' : 'draft');
    if (curStatus !== 'availability' && curStatus !== 'published') {
      const { data: updated, error: updErr } = await supabase.from('lineups')
        .update({ lineup_status: 'availability' })
        .eq('id', lineupId).select().single();
      if (updErr) {
        if (msgEl) msgEl.textContent = 'Failed to set status: ' + updErr.message;
        yesBtn.disabled = false; yesBtn.textContent = '💬 Yes, share';
        return;
      }
      // Mirror into local editor state so the status pill/availability bar reflect the change.
      if (editor?.current?.id === lineupId) {
        editor.current.lineup_status = updated.lineup_status;
        editor.current.published = updated.published;
        editor.current.published_at = updated.published_at;
      }
      const idx = (editor?.lineups || []).findIndex(l => l.id === lineupId);
      if (idx >= 0) editor.lineups[idx] = updated;
      try { await logAudit(editor?.team?.id, 'lineup', lineupId, 'status:availability', { from: curStatus, via: 'wizard-share' }); } catch (_) {}
    }

    // Build + open the WhatsApp message (same composer + open pattern the Share modal uses).
    try {
      const latest = (editor?.lineups || []).find(l => l.id === lineupId) || lineup;
      const text = await buildWhatsAppMessage(latest, team);
      try { await navigator.clipboard.writeText(text); } catch (_) {}
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      const win = window.open(waUrl, '_blank');
      if (!win) location.href = waUrl;
    } catch (e) {
      if (msgEl) msgEl.textContent = 'Could not build WhatsApp message: ' + (e.message || e);
      yesBtn.disabled = false; yesBtn.textContent = '💬 Yes, share';
      return;
    }

    close();
    // Repaint so the status pill + availability bar reflect the new state.
    if (activeTab === 'lineups') renderLineupsTab();
  };
}

/* ── Status-change modal ────────────────────────────────────── */
function openStatusModal() {
  if (!editor?.current?.id) return;
  const cur = editor.current;
  const currentStatus = cur.lineup_status || (cur.published ? 'published' : 'draft');

  const options = [
    {
      key: 'draft',
      label: 'Draft',
      icon: '📝',
      desc: 'Only coaches can see this match. Parents and viewers won\'t see anything — use this while you\'re still planning the lineup.',
    },
    {
      key: 'availability',
      label: 'Availability',
      icon: '📋',
      desc: 'Parents receive a link to confirm whether their child is available. They can\'t see the lineup yet — just the match date and details.',
    },
    {
      key: 'published',
      label: 'Published',
      icon: '📢',
      desc: 'The full lineup is visible to parents — positions, formation and match info. Use this once you\'ve finalised the team.',
    },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay status-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal status-modal" role="dialog" aria-label="Change match status" style="max-width:420px">
      <div class="map-modal-header">
        <h3 style="margin:0">Change match status</h3>
        <button type="button" class="map-modal-close" data-close aria-label="Close">×</button>
      </div>
      <div class="map-modal-body status-modal-body">
        ${options.map(o => `
          <button type="button" class="status-option ${o.key === currentStatus ? 'active' : ''}" data-pick-status="${o.key}">
            <span class="status-option-icon">${o.icon}</span>
            <div class="status-option-text">
              <strong class="status-option-label">${o.label}</strong>
              <span class="status-option-desc">${o.desc}</span>
            </div>
            ${o.key === currentStatus ? '<span class="status-option-check">✓</span>' : ''}
          </button>
        `).join('')}
        <div id="status-modal-msg" style="font-size:0.85rem;min-height:1.2em;margin-top:0.5rem;color:var(--danger,red)"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-close]').onclick = close;

  // Use event delegation so clicks on child elements (icon, text) still trigger
  overlay.addEventListener('click', async (e) => {
    // Close on backdrop click
    if (e.target === overlay) { close(); return; }

    const btn = e.target.closest('[data-pick-status]');
    if (!btn) return;

    const nextStatus = btn.dataset.pickStatus;
    if (nextStatus === currentStatus) { close(); return; }
    if (nextStatus !== 'draft' && !cur.game_date) {
      const msg = overlay.querySelector('#status-modal-msg');
      if (msg) msg.textContent = 'Set a game date before changing status.';
      return;
    }
    // Disable all buttons while saving
    overlay.querySelectorAll('[data-pick-status]').forEach(b => b.disabled = true);
    const { data, error } = await supabase.from('lineups')
      .update({ lineup_status: nextStatus })
      .eq('id', cur.id).select().single();
    if (error) {
      const msg = overlay.querySelector('#status-modal-msg');
      if (msg) msg.textContent = 'Failed: ' + error.message;
      overlay.querySelectorAll('[data-pick-status]').forEach(b => b.disabled = false);
      return;
    }
    editor.current.lineup_status = data.lineup_status;
    editor.current.published = data.published;
    editor.current.published_at = data.published_at;
    const idx = editor.lineups.findIndex(l => l.id === data.id);
    if (idx >= 0) editor.lineups[idx] = data;
    await logAudit(editor.team.id, 'lineup', data.id, 'status:' + nextStatus, { from: currentStatus });
    close();
    renderLineupsTab();

    // After switching to availability, auto-open the share modal
    // so the coach can immediately send the link to parents
    if (nextStatus === 'availability') {
      openShareModal({ lineupId: cur.id });
    }
  });
}

async function openShareModal(opts = {}) {
  let id = opts.lineupId || editor?.current?.id;
  if (!id) {
    // Auto-save before sharing so links exist
    if (!editor?.current) return;
    await saveLineup();
    id = editor.current.id;
    if (!id) return;            // save failed
  }
  const fromList = (editor?.lineups || []).find(l => l.id === id);
  const lineup = fromList || editor?.current || null;
  if (!lineup) return;
  const team = editor?.team;
  const status = lineup.lineup_status || (lineup.published ? 'published' : 'draft');
  const base = location.origin + location.pathname;
  const availUrl = `${base}#/avail/${id}`;
  const matchUrl = `${base}#/view/${id}`;
  const availOpen = true;   // availability link always copyable
  const lineupOpen = status === 'published';
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const statusBadge = (open, kind) => {
    if (!open) return `<span class="share-status locked">○ Locked</span>`;
    if (kind === 'avail' && status === 'availability') return `<span class="share-status ok">◐ Open</span>`;
    return `<span class="share-status ok">● Open</span>`;
  };

  const section = (kind) => {
    const isAvail = kind === 'avail';
    const open = isAvail ? availOpen : lineupOpen;
    const url = isAvail ? availUrl : matchUrl;
    const title = isAvail ? 'Availability link' : 'Match link (lineup + details)';
    const desc = isAvail
      ? "Parents tap this to say whether their child can play."
      : "Parents see the lineup, tactics and match info.";
    const lockedHint = isAvail
      ? 'Switch the match to <em>Availability</em> or <em>Show lineup</em> to open this link for parents.'
      : 'Switch the match to <em>Show lineup</em> (Published) to open this link for parents.';
    return `
      <section class="share-section ${open ? '' : 'share-locked'}">
        <div class="share-sec-head">
          <div class="share-sec-titles">
            <h4 class="share-sec-title">${title}</h4>
            <p class="share-sec-desc muted">${desc}</p>
          </div>
          ${statusBadge(open, kind)}
        </div>
        <div class="share-url" title="${escapeHtml(url)}">${escapeHtml(url)}</div>
        <div class="share-actions">
          <button class="btn-full share-btn share-btn-primary" data-share-copy="${kind}" ${open ? '' : 'disabled'}>📋 Copy link</button>
          ${canWebShare ? `<button class="btn-full share-btn" data-share-native="${kind}" ${open ? '' : 'disabled'}>📲 Share…</button>` : ''}
        </div>
        ${!open ? `<p class="share-hint muted">${lockedHint}</p>` : ''}
      </section>
    `;
  };

  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay share-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal share-modal" role="dialog" aria-label="Share match" style="max-width:540px">
      <div class="map-modal-header">
        <h3 style="margin:0">📤 Share this match</h3>
        <button type="button" class="map-modal-close" data-close aria-label="Close">×</button>
      </div>
      <div class="map-modal-body share-body">
        ${section('avail')}
        ${section('view')}
        <section class="share-section share-combined">
          <h4 class="share-sec-title">Send to the team chat</h4>
          <p class="share-sec-desc muted">Combined message with match details, venue, both links and a reminder about the parent code.</p>
          <div class="share-actions">
            <button class="btn-full share-btn share-wa" data-share-whatsapp ${(availOpen || lineupOpen) ? '' : 'disabled'}>💬 Send via WhatsApp</button>
            ${lineup.game_date ? `<button class="btn-full share-btn" data-share-calendar>📅 Add to calendar</button>` : ''}
          </div>
        </section>
        <div id="share-msg" class="muted" style="font-size:0.8rem;min-height:1em;margin-top:0.5rem"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (opts.opener) { try { opts.opener.focus(); } catch (_) {} }
  };
  function onKey(ev) { if (ev.key === 'Escape') close(); }
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || ev.target?.hasAttribute?.('data-close')) close();
  });
  document.addEventListener('keydown', onKey);

  const showMsg = (text, cls = 'ok') => {
    const el = overlay.querySelector('#share-msg');
    if (!el) return;
    el.textContent = text;
    el.className = cls;
    setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = 'muted'; } }, 3000);
  };

  // Copy-to-clipboard handlers
  overlay.querySelectorAll('[data-share-copy]').forEach(btn => {
    btn.onclick = async () => {
      const which = btn.dataset.shareCopy;
      const url = which === 'avail' ? availUrl : matchUrl;
      const label = which === 'avail' ? 'Availability link' : 'Match link';
      try {
        await navigator.clipboard.writeText(url);
        showMsg(`✓ ${label} copied`);
      } catch (_) {
        window.prompt('Copy this link:', url);
        showMsg('Link ready to copy', 'muted');
      }
    };
  });

  // Native OS share sheet (Android / iOS / desktop on supported browsers)
  overlay.querySelectorAll('[data-share-native]').forEach(btn => {
    btn.onclick = async () => {
      const which = btn.dataset.shareNative;
      const url = which === 'avail' ? availUrl : matchUrl;
      const title = which === 'avail' ? 'Availability link' : 'Match link';
      try {
        await navigator.share({ title, url });
        showMsg('✓ Shared');
      } catch (e) {
        if (e?.name !== 'AbortError') showMsg('Share failed', 'error');
      }
    };
  });

  // Combined WhatsApp message (unchanged behaviour)
  const waBtn = overlay.querySelector('[data-share-whatsapp]');
  if (waBtn) {
    waBtn.onclick = async () => {
      try {
        const text = await buildWhatsAppMessage(lineup, team);
        try { await navigator.clipboard.writeText(text); } catch (_) {}
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        const win = window.open(waUrl, '_blank');
        if (!win) location.href = waUrl;
        showMsg('✓ Opening WhatsApp — message also copied as a backup');
      } catch (e) {
        showMsg('Failed: ' + (e.message || 'could not build message'), 'error');
      }
    };
  }

  // Add-to-calendar .ics download
  const calBtn = overlay.querySelector('[data-share-calendar]');
  if (calBtn) calBtn.onclick = () => downloadLineupIcs(lineup, team, lineup.id);
}

// Lazy post-render enhancement: for each rendered match card matching the selector,
// inject a small pill row showing response counts. Runs asynchronously after the
// main paint so it never blocks the UI, and is a no-op if the DOM has moved on.
async function decorateCardsWithAvailabilityCounts(selector, datasetKey, lineupIds, rosterSize) {
  if (!lineupIds || !lineupIds.length) return;
  const counts = await loadAvailabilityCountsForLineups(lineupIds);
  document.querySelectorAll(selector).forEach(el => {
    const id = el.dataset[datasetKey];
    if (!id || !counts[id]) return;
    if (el.querySelector('.avail-pills')) return;
    const meta = el.querySelector('.lineup-meta');
    const html = availPillsHtml(counts[id], rosterSize);
    if (meta) meta.insertAdjacentHTML('afterend', html);
    else el.insertAdjacentHTML('beforeend', html);
  });
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

// ---------- Match creation wizard ----------
// A guided 3-step modal for setting up a new match: basics, formation, review.
// On Create, stashes values into _pendingLineupLoad and switches to Matches tab,
// so the existing renderLineupsTab pick-up logic applies them to a fresh state.
async function openMatchWizard(user, teamId) {
  // Always fetch fresh custom formations from the DB. Previously we read from
  // editor.customFormations, but that was only populated when certain tabs
  // (Matches/Plays/Members/Fixtures) were the *current* render. Opening the
  // wizard via the desktop sidebar "+" while sat on Squad/Help/Formations/Admin
  // would silently fall back to "[]" — i.e. preset formations only. Fetching
  // here makes the wizard correct regardless of which tab launched it.
  let customFormations = (editor && editor.customFormations) ? editor.customFormations : [];
  try {
    const { data, error } = await supabase
      .from('formations')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (!error && Array.isArray(data)) {
      customFormations = data;
      // Cache back so other code paths see the fresh list too.
      if (editor) editor.customFormations = customFormations;
    }
  } catch (_) { /* fall through with whatever we already had in editor */ }
  const formations = allFormations(customFormations); // name -> {pos, lbl}
  const formationNames = Object.keys(formations);
  const team = editor?.team || null;

  // Default date = today in local YYYY-MM-DD
  const today = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const defaultDate = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const state = {
    opponent: '',
    game_date: defaultDate,
    kickoff_time: '',
    arrival_time: '',
    home_away: 'home',
    match_type: 'league',
    formation: formationNames.includes('4-3-3') ? '4-3-3' : formationNames[0],
    location_name: '',
    location_postcode: '',
    location_lat: null,
    location_lng: null,
    notes: ''
  };
  let step = 1;
  // Home: 1 Who & when · 2 Formation · 3 Location (read-only home ground) · 4 Summary  (4 total)
  // Away: 1 Who & when · 2 Formation · 3 Venue details · 4 Fine-tune map · 5 Summary     (5 total)
  const totalSteps = () => state.home_away === 'home' ? 4 : 5;
  // The summary step is always the last one; its number depends on home/away.
  const summaryStep = () => totalSteps();

  const overlay = document.createElement('div');
  overlay.className = 'mw-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Create a new match');
  document.body.appendChild(overlay);
  document.body.classList.add('mw-open');

  function close() {
    overlay.remove();
    document.body.classList.remove('mw-open');
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function miniPitchSvg(pos, lbl) {
    // Tiny pitch preview with dots
    const dots = pos.map((p, i) => {
      const [x, y] = p;
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#1e3a8a" stroke="#fff" stroke-width="0.6"/>`;
    }).join('');
    return `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="mw-mini-pitch" aria-hidden="true">
        <rect x="0" y="0" width="100" height="100" fill="#2e7d32"/>
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.4"/>
        <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.7)" stroke-width="0.4"/>
        <circle cx="50" cy="50" r="8" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.4"/>
        ${dots}
      </svg>
    `;
  }

  function renderStep1() {
    return `
      <div class="mw-body">
        <h3 class="mw-step-title">Who &amp; when</h3>
        <p class="mw-step-sub">Fill what you know — you can change it later.</p>
        <label class="mw-field">
          <span>Opponent</span>
          <input type="text" id="mw-opponent" value="${escapeHtml(state.opponent)}" placeholder="e.g. Roverton Rangers" autocomplete="off" />
        </label>
        <label class="mw-field">
          <span>Match date</span>
          <input type="date" id="mw-date" value="${escapeHtml(state.game_date)}" />
        </label>
        <div class="mw-row">
          <label class="mw-field">
            <span>Arrival time</span>
            <input type="time" id="mw-arrival" value="${escapeHtml(state.arrival_time)}" />
          </label>
          <label class="mw-field">
            <span>Kick-off</span>
            <input type="time" id="mw-kickoff" value="${escapeHtml(state.kickoff_time)}" />
          </label>
        </div>
        <div class="mw-row">
          <label class="mw-field">
            <span>Home / Away</span>
            <select id="mw-homeaway">
              <option value="home" ${state.home_away === 'home' ? 'selected' : ''}>Home</option>
              <option value="away" ${state.home_away === 'away' ? 'selected' : ''}>Away</option>
            </select>
          </label>
          <label class="mw-field">
            <span>Match type</span>
            <select id="mw-type">
              <option value="league"   ${state.match_type === 'league'   ? 'selected' : ''}>League</option>
              <option value="cup"      ${state.match_type === 'cup'      ? 'selected' : ''}>Cup</option>
              <option value="friendly" ${state.match_type === 'friendly' ? 'selected' : ''}>Friendly</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  function renderStep2() {
    const cards = formationNames.map(name => {
      const f = formations[name];
      const isCustom = !!f._customId;
      const sel = state.formation === name ? ' selected' : '';
      return `
        <button type="button" class="mw-form-card${sel}" data-formation="${escapeHtml(name)}">
          ${miniPitchSvg(f.pos, f.lbl)}
          <div class="mw-form-name">
            ${escapeHtml(name)}
            ${isCustom ? '<span class="mw-badge">custom</span>' : ''}
          </div>
        </button>
      `;
    }).join('');
    return `
      <div class="mw-body">
        <h3 class="mw-step-title">Pick a formation</h3>
        <p class="mw-step-sub">You can switch it any time from the pitch.</p>
        <div class="mw-form-grid">${cards}</div>
      </div>
    `;
  }

  // Step 3 — Location. Home: read-only confirmation of the team's home ground.
  // Away: editable venue name + postcode with lookup.
  function renderStep3Location() {
    if (state.home_away === 'home') {
      const hasHome = !!(team?.home_ground_name || team?.home_ground_postcode);
      const locationLine = hasHome
        ? `<div class="mw-sum-row"><span>Venue</span><strong>${escapeHtml(team.home_ground_name || '')}</strong></div>
           <div class="mw-sum-row"><span>Postcode</span><strong>${escapeHtml(team.home_ground_postcode || '—')}</strong></div>
           ${team.home_ground_lat != null && team.home_ground_lng != null
              ? `<div class="mw-sum-row"><span>Pin</span><strong>${Number(team.home_ground_lat).toFixed(5)}, ${Number(team.home_ground_lng).toFixed(5)}</strong></div>`
              : `<div class="mw-sum-row"><span>Pin</span><em class="muted">not set</em></div>`}`
        : `<div class="mw-sum-row"><em class="muted">No home ground set yet.</em></div>`;
      return `
        <div class="mw-body">
          <h3 class="mw-step-title">Home ground</h3>
          <p class="mw-step-sub">Using the team's home ground. To change it, go to Squad → Home ground.</p>
          <div class="mw-summary">
            ${locationLine}
          </div>
          ${!hasHome ? `<p class="muted" style="margin-top:0.6rem;font-size:0.8rem">You can still create the match — parents will just see "Home" without a venue. Set the home ground later from the Squad tab.</p>` : ''}
        </div>
      `;
    }
    // Away
    const hasPin = state.location_lat != null && state.location_lng != null;
    return `
      <div class="mw-body">
        <h3 class="mw-step-title">Away venue</h3>
        <p class="mw-step-sub">Where is this match being played? You'll fine-tune the pin on the next step.</p>
        <label class="mw-field">
          <span>Venue name</span>
          <input type="text" id="mw-loc-name" value="${escapeHtml(state.location_name)}" placeholder="e.g. Roverton Rec Ground" autocomplete="off" />
        </label>
        <label class="mw-field">
          <span>Postcode</span>
          <div style="display:flex;gap:0.4rem">
            <input type="text" id="mw-loc-postcode" value="${escapeHtml(state.location_postcode)}" placeholder="e.g. SW1A 1AA" style="flex:1;text-transform:uppercase" autocomplete="off" />
            <button type="button" class="mw-btn" id="mw-loc-lookup" style="flex-shrink:0">🔍 Look up</button>
          </div>
        </label>
        <div id="mw-loc-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.25rem">
          ${hasPin ? `✓ ${Number(state.location_lat).toFixed(5)}, ${Number(state.location_lng).toFixed(5)}` : ''}
        </div>
      </div>
    `;
  }

  // Step 4 (Away only) — Fine-tune map. Opens the existing openMapPicker modal.
  function renderStep4FineTune() {
    const hasPin = state.location_lat != null && state.location_lng != null;
    const pinLine = hasPin
      ? `<div class="mw-sum-row"><span>Pin</span><strong>${Number(state.location_lat).toFixed(5)}, ${Number(state.location_lng).toFixed(5)}</strong></div>`
      : `<div class="mw-sum-row"><em class="muted">No pin set yet — UK postcodes can cover a large area, drop a pin so parents can find you.</em></div>`;
    return `
      <div class="mw-body">
        <h3 class="mw-step-title">Fine-tune on map</h3>
        <p class="mw-step-sub">Drag the pin to the exact spot of the pitch entrance / car park.</p>
        <div class="mw-summary">
          ${pinLine}
          ${state.location_name ? `<div class="mw-sum-row"><span>Venue</span><strong>${escapeHtml(state.location_name)}</strong></div>` : ''}
          ${state.location_postcode ? `<div class="mw-sum-row"><span>Postcode</span><strong>${escapeHtml(state.location_postcode)}</strong></div>` : ''}
        </div>
        <button type="button" class="mw-btn" id="mw-open-map" style="margin-top:0.75rem;width:100%">
          🗺️ ${hasPin ? 'Adjust on map' : 'Place pin on map'}
        </button>
        <p class="muted" style="font-size:0.75rem;margin-top:0.5rem">Optional — you can skip this and set it later from the match's Info tab.</p>
      </div>
    `;
  }

  function renderStepSummary() {
    const dateLabel = state.game_date
      ? new Date(state.game_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : '—';
    const kickoffLabel = state.kickoff_time || '—';
    const arrivalLabel = state.arrival_time || '—';
    const haLabel = state.home_away === 'home' ? 'Home' : 'Away';
    // Resolve venue line for the summary
    let venueLine;
    if (state.home_away === 'home') {
      if (team?.home_ground_name || team?.home_ground_postcode) {
        venueLine = [team.home_ground_name, team.home_ground_postcode].filter(Boolean).join(' · ');
      } else {
        venueLine = '<em class="muted">Home (no ground set)</em>';
      }
    } else {
      const parts = [state.location_name, state.location_postcode].filter(Boolean);
      venueLine = parts.length ? parts.join(' · ') : '<em class="muted">(not set)</em>';
    }
    return `
      <div class="mw-body">
        <h3 class="mw-step-title">Ready to create</h3>
        <p class="mw-step-sub">We'll save the match and open it on a blank pitch — you can pick the squad next.</p>
        <div class="mw-summary">
          <div class="mw-sum-row"><span>Opponent</span><strong>${escapeHtml(state.opponent) || '<em class="muted">(not set)</em>'}</strong></div>
          <div class="mw-sum-row"><span>Date</span><strong>${escapeHtml(dateLabel)}</strong></div>
          <div class="mw-sum-row"><span>Arrival</span><strong>${escapeHtml(arrivalLabel)}</strong></div>
          <div class="mw-sum-row"><span>Kick-off</span><strong>${escapeHtml(kickoffLabel)}</strong></div>
          <div class="mw-sum-row"><span>Home / Away</span><strong>${haLabel}</strong></div>
          <div class="mw-sum-row"><span>Venue</span><strong>${venueLine}</strong></div>
          <div class="mw-sum-row"><span>Type</span><strong>${escapeHtml(state.match_type)}</strong></div>
          <div class="mw-sum-row"><span>Formation</span><strong>${escapeHtml(state.formation)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderFooter() {
    const total = totalSteps();
    const dots = Array.from({ length: total }, (_, i) => i + 1)
      .map(n => `<span class="mw-dot${n === step ? ' active' : n < step ? ' done' : ''}"></span>`)
      .join('');
    const isLast = step === summaryStep();
    return `
      <div class="mw-footer">
        <div class="mw-steps-indicator">
          ${dots}
          <span class="mw-step-label">Step ${step} of ${total}</span>
        </div>
        <div class="mw-actions">
          ${step > 1 ? `<button type="button" class="mw-btn" id="mw-back">Back</button>` : `<button type="button" class="mw-btn" id="mw-cancel">Cancel</button>`}
          ${!isLast
            ? `<button type="button" class="mw-btn mw-primary" id="mw-next">Next →</button>`
            : `<button type="button" class="mw-btn mw-primary" id="mw-finish">Create match</button>`}
        </div>
      </div>
    `;
  }

  function renderBodyForStep() {
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3Location();
    if (step === 4 && state.home_away === 'away') return renderStep4FineTune();
    return renderStepSummary(); // step 4 home, step 5 away
  }

  function render() {
    overlay.innerHTML = `
      <div class="mw-card" role="document">
        <div class="mw-head">
          <h2>New match</h2>
          <button type="button" class="mw-close" aria-label="Close">✕</button>
        </div>
        ${renderBodyForStep()}
        ${renderFooter()}
      </div>
    `;
    wire();
  }

  function wire() {
    overlay.querySelector('.mw-close').onclick = close;

    if (step === 1) {
      const op = overlay.querySelector('#mw-opponent');
      const dt = overlay.querySelector('#mw-date');
      const ar = overlay.querySelector('#mw-arrival');
      const ko = overlay.querySelector('#mw-kickoff');
      const ha = overlay.querySelector('#mw-homeaway');
      const tp = overlay.querySelector('#mw-type');
      op.addEventListener('input', () => { state.opponent = op.value; });
      dt.addEventListener('change', () => { state.game_date = dt.value; });
      ar.addEventListener('change', () => { state.arrival_time = ar.value; });
      ko.addEventListener('change', () => { state.kickoff_time = ko.value; });
      ha.addEventListener('change', () => {
        state.home_away = ha.value;
        // Re-render so the step-count/dots update and the user sees the new path.
        render();
      });
      tp.addEventListener('change', () => { state.match_type = tp.value; });
      setTimeout(() => op.focus(), 40);
    } else if (step === 2) {
      overlay.querySelectorAll('.mw-form-card').forEach(btn => {
        btn.onclick = () => {
          state.formation = btn.dataset.formation;
          overlay.querySelectorAll('.mw-form-card').forEach(c => c.classList.remove('selected'));
          btn.classList.add('selected');
        };
      });
    } else if (step === 3 && state.home_away === 'away') {
      // Away venue fields + postcode lookup
      const nameIn = overlay.querySelector('#mw-loc-name');
      const pcIn = overlay.querySelector('#mw-loc-postcode');
      const msg = overlay.querySelector('#mw-loc-msg');
      if (nameIn) nameIn.addEventListener('input', () => { state.location_name = nameIn.value; });
      if (pcIn) pcIn.addEventListener('input', () => { state.location_postcode = pcIn.value.toUpperCase(); });
      const lookupBtn = overlay.querySelector('#mw-loc-lookup');
      if (lookupBtn) {
        lookupBtn.onclick = async () => {
          const pc = (pcIn?.value || '').trim();
          if (!pc) { if (msg) { msg.textContent = 'Enter a postcode first.'; msg.className = 'muted'; } return; }
          if (msg) { msg.textContent = 'Looking up…'; msg.className = 'muted'; }
          try {
            const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
            const j = await res.json();
            if (j?.status !== 200 || !j?.result) {
              if (msg) { msg.textContent = 'Postcode not found.'; msg.className = 'error'; }
              return;
            }
            state.location_postcode = (j.result.postcode || pc).toUpperCase();
            state.location_lat = Number(j.result.latitude);
            state.location_lng = Number(j.result.longitude);
            if (pcIn) pcIn.value = state.location_postcode;
            if (msg) { msg.textContent = `✓ ${state.location_lat.toFixed(5)}, ${state.location_lng.toFixed(5)} — fine-tune on the next step.`; msg.className = 'ok'; }
          } catch (e) {
            if (msg) { msg.textContent = 'Lookup failed — check your connection.'; msg.className = 'error'; }
          }
        };
      }
    } else if (step === 4 && state.home_away === 'away') {
      // Fine-tune map button
      const openMapBtn = overlay.querySelector('#mw-open-map');
      if (openMapBtn) {
        openMapBtn.onclick = async () => {
          const initial = (state.location_lat != null && state.location_lng != null)
            ? { lat: state.location_lat, lng: state.location_lng }
            : null;
          const result = await openMapPicker(initial);
          if (result) {
            state.location_lat = result.lat;
            state.location_lng = result.lng;
            render(); // refresh the pin readout
          }
        };
      }
    }

    const backBtn = overlay.querySelector('#mw-back');
    if (backBtn) backBtn.onclick = () => { step--; render(); };
    const cancelBtn = overlay.querySelector('#mw-cancel');
    if (cancelBtn) cancelBtn.onclick = close;
    const nextBtn = overlay.querySelector('#mw-next');
    if (nextBtn) nextBtn.onclick = () => { step++; render(); };
    const finishBtn = overlay.querySelector('#mw-finish');
    if (finishBtn) finishBtn.onclick = async () => { await finish(); };
  }

  async function finish() {
    // Actually insert the lineup so we have a real id for Availability + WhatsApp links.
    const opp = (state.opponent || '').trim();
    if (!opp) {
      // Jump back to Step 1 so the coach can fix it.
      step = 1;
      render();
      setTimeout(() => {
        const op = overlay.querySelector('#mw-opponent');
        if (op) { op.focus(); op.classList.add('error'); }
      }, 40);
      return;
    }

    const typeLbl = state.match_type === 'friendly' ? 'Friendly' : state.match_type === 'cup' ? 'Cup' : 'League';
    const haLbl = state.home_away === 'away' ? '(A)' : '(H)';
    const name = `${typeLbl} vs ${opp} ${haLbl}`;

    // Resolve venue fields: Home → team home ground (ignore anything in state).
    //                      Away → wizard state.
    let locName, locPost, locLat, locLng;
    if (state.home_away === 'home' && team) {
      locName = team.home_ground_name || '';
      locPost = team.home_ground_postcode || '';
      locLat = team.home_ground_lat ?? null;
      locLng = team.home_ground_lng ?? null;
    } else {
      locName = (state.location_name || '').trim();
      locPost = (state.location_postcode || '').trim().toUpperCase();
      locLat = state.location_lat;
      locLng = state.location_lng;
    }

    // If a custom formation is chosen, persist its pos/lbl so the lineup renders with them.
    const cf = customFormations.find(f => f.name === state.formation);
    const dataPos = (cf && cf.data && Array.isArray(cf.data.pos)) ? cf.data.pos.map(p => [...p]) : null;
    const dataLbl = (cf && cf.data && Array.isArray(cf.data.lbl)) ? [...cf.data.lbl] : null;

    const finishBtn = overlay.querySelector('#mw-finish');
    if (finishBtn) { finishBtn.disabled = true; finishBtn.textContent = 'Creating…'; }

    const payload = {
      team_id: teamId,
      name,
      opponent: opp,
      game_date: state.game_date || null,
      match_type: state.match_type || 'league',
      home_away: state.home_away || 'home',
      kickoff_time: state.kickoff_time || null,
      arrival_time: state.arrival_time || null,
      notes: null,
      lineup_status: 'draft',
      location_name: (locName || '').trim() || null,
      location_postcode: (locPost || '').trim().toUpperCase() || null,
      location_lat: locLat ?? null,
      location_lng: locLng ?? null,
      created_by: user.id,
      data: {
        formation: state.formation,
        slots: {},
        subs: [],
        lbl: dataLbl,
        pos: dataPos,
        arrows: [],
        zoneLines: [null, null],
        ballVisible: false,
        ballPos: { x: 50, y: 50 }
      },
      updated_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase.from('lineups').insert(payload).select().single();
    if (error) {
      if (finishBtn) { finishBtn.disabled = false; finishBtn.textContent = 'Create match'; }
      alert('Failed to create match: ' + error.message);
      return;
    }
    try { await logAudit(teamId, 'lineup', inserted.id, 'create', { name, via: 'wizard' }); } catch (_) {}

    close();
    try { await flushAutosave(); } catch (_) {}

    // Flag the saved lineup so renderTeamDashboard's Lineups branch loads it fully.
    _pendingLineupIdToOpen = inserted.id;
    activeTab = 'lineups';
    openCards.clear();
    await renderTeamDashboard(user, teamId);

    // Post-create: ask whether to share to WhatsApp now.
    openShareToWhatsAppPrompt(inserted.id);
  }

  render();
}

// Photo cropper: shows the picked image in a square frame, lets user drag + zoom,
// returns a Blob (square JPEG, ~512x512) ready to upload.
// Open a modal to link this player to one or more sibling players (shared family_code)
function openLinkSiblingModal(team, players, playerId, onChange) {
  const me = players.find(p => p.id === playerId);
  if (!me) return;

  const candidates = players.filter(p => p.id !== playerId);
  const currentFamily = me.family_code || null;
  // Pre-tick anyone already in the same family
  const initiallyLinked = new Set(
    currentFamily ? candidates.filter(p => p.family_code === currentFamily).map(p => p.id) : []
  );

  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" role="dialog" aria-label="Link siblings" style="max-width:480px">
      <div class="map-modal-header">
        <h3 style="margin:0">Link siblings to ${escapeHtml(me.name || 'player')}</h3>
        <button type="button" class="map-modal-close" data-close>×</button>
      </div>
      <div class="map-modal-body" style="max-height:60vh;overflow:auto;padding:1rem">
        <p class="muted" style="margin-top:0;font-size:0.85rem">
          Tick siblings to share a single family code. A parent who enters the family code unlocks all linked players in one go.
        </p>
        ${currentFamily ? `<p style="font-size:0.85rem">Current family code: <strong>${escapeHtml(currentFamily)}</strong></p>` : ''}
        <div id="sib-list" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.5rem">
          ${candidates.map(p => `
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;border:1px solid #e3e7ee;border-radius:6px;cursor:pointer">
              <input type="checkbox" data-sib="${p.id}" ${initiallyLinked.has(p.id) ? 'checked' : ''} />
              <span style="flex:1">${escapeHtml(p.name || '')}</span>
              <span class="muted" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.8rem">${escapeHtml(p.access_code || '')}${p.family_code ? ' · fam ' + escapeHtml(p.family_code) : ''}</span>
            </label>
          `).join('') || '<p class="muted">No other players in the squad.</p>'}
        </div>
        <div id="sib-msg" class="muted" style="font-size:0.8rem;min-height:1em;margin-top:0.5rem"></div>
      </div>
      <div class="map-modal-footer" style="display:flex;justify-content:flex-end;gap:0.5rem;padding:0.75rem 1rem;border-top:1px solid #eee">
        <button type="button" class="btn-secondary" data-close>Cancel</button>
        <button type="button" class="primary" data-save>Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(el => el.onclick = close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('[data-save]').onclick = async () => {
    const msg = overlay.querySelector('#sib-msg');
    const ticked = Array.from(overlay.querySelectorAll('[data-sib]:checked')).map(el => el.dataset.sib);

    // Decide the family_code to apply
    let famCode = currentFamily;
    if (ticked.length) {
      // Reuse any existing family_code among me + ticked siblings, else generate fresh
      const reused = (() => {
        if (currentFamily) return currentFamily;
        for (const sid of ticked) {
          const sib = players.find(q => q.id === sid);
          if (sib?.family_code) return sib.family_code;
        }
        const existing = new Set(players.map(p => p.family_code).filter(Boolean));
        return makeFamilyCode(existing);
      })();
      famCode = reused;
    } else {
      famCode = null; // no siblings ticked = no family link
    }

    msg.textContent = 'Saving…'; msg.className = 'muted';
    try {
      // Build target id list: me + ticked
      const targetIds = [playerId, ...ticked];
      // Also: players who were previously in this family but are no longer ticked → unlink
      const previouslyLinked = currentFamily
        ? players.filter(p => p.family_code === currentFamily).map(p => p.id)
        : [];
      const toUnlink = previouslyLinked.filter(id => id !== playerId && !ticked.includes(id));

      const ops = [];
      if (famCode === null) {
        // Just unlink me
        ops.push(supabase.from('players').update({ family_code: null }).eq('id', playerId));
      } else {
        ops.push(supabase.from('players').update({ family_code: famCode }).in('id', targetIds));
      }
      if (toUnlink.length) {
        ops.push(supabase.from('players').update({ family_code: null }).in('id', toUnlink));
      }
      const results = await Promise.all(ops);
      const err = results.find(r => r.error);
      if (err) throw err.error;

      // Mutate local state
      players.forEach(p => {
        if (targetIds.includes(p.id)) p.family_code = famCode;
        if (toUnlink.includes(p.id)) p.family_code = null;
      });
      // Cleanup: if only one player still holds famCode, dissolve it
      if (famCode) {
        const stillLinked = players.filter(p => p.family_code === famCode);
        if (stillLinked.length === 1) {
          await supabase.from('players').update({ family_code: null }).eq('id', stillLinked[0].id);
          stillLinked[0].family_code = null;
        }
      }
      await logAudit(team.id, 'player', playerId, 'update', { field: 'family_code', to: famCode, linked: ticked });
      close();
      onChange?.();
    } catch (e) {
      msg.textContent = 'Save failed: ' + (e.message || e); msg.className = 'error';
    }
  };
}

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
  applyMatchDecorations(slotsLayer, current.motm, current.goalscorers, editor.team?.id, current.id);
}

// Kept as fallback helper (not currently called, but left in case)
function pitchSvgHtml() {
  return `<svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>`;
}

// Inner SVG markup (pitch lines) — placed inside the outer <svg> in render
// SVG uses viewBox "0 0 70 100" so it matches the container's 7:10 aspect ratio.
// With matching aspects the SVG renders 1:1 — circles stay round, lines stay square.
// Small click-to-expand legend describing every pill / marker that can appear
// on a pitch chip — coach and parent views share the same chip renderer, so
// one legend covers both. Rendered with native <details>/<summary> so no JS
// listeners are needed; the popover closes when the user clicks anywhere
// outside (handled by a one-liner in the pitch card render paths).
function chipLegendHtml() {
  return `
    <details class="chip-legend">
      <summary class="chip-legend-trigger" aria-label="Show chip marker key">
        <span class="chip-legend-icon">ⓘ</span> What do the chip markers mean?
      </summary>
      <div class="chip-legend-popover" role="dialog" aria-label="Chip marker key">
        <div class="chip-legend-row"><span class="chip-legend-sample cls-focus">🎯 1</span><span class="chip-legend-text"><strong>Coach's Focus</strong> — cues set for the match. Gold tint means the <em>primary</em> cue is locked in.</span></div>
        <div class="chip-legend-row"><span class="chip-legend-sample cls-avail"></span><span class="chip-legend-text"><strong>Availability dot</strong> — green = available, amber = maybe, red = unavailable. Only visible in Availability / Published mode.</span></div>
        <div class="chip-legend-row"><span class="chip-legend-sample cls-motm">★</span><span class="chip-legend-text"><strong>Man of the Match</strong> — awarded post-match in the result wizard.</span></div>
        <div class="chip-legend-row"><span class="chip-legend-sample cls-goal">2</span><span class="chip-legend-text"><strong>Goal count</strong> — how many goals that player scored in this match.</span></div>
        <div class="chip-legend-row"><span class="chip-legend-sample cls-badges">🏅⚡</span><span class="chip-legend-text"><strong>Badge row</strong> — badges earned in this specific match. Hover for names + coach notes.</span></div>
        <div class="chip-legend-row"><span class="chip-legend-sample cls-ring"></span><span class="chip-legend-text"><strong>Gold ring</strong> (parent view) — highlights your child's chip after you unlock with their access code.</span></div>
      </div>
    </details>
  `;
}

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
  // Formations top-level page (re-uses pitch rendering) has no subs row, so
  // renderSubsBar is a safe no-op there. Other callers always have one.
  if (!row) return;
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
  applyMatchDecorations(row, current.motm, current.goalscorers, editor.team?.id, current.id);
}

function wireLineupEvents() {
  const { canEdit, team, lineups } = editor;
  const tabEl = document.getElementById('tab-content');

  // Focus panel click handlers (Add focus · chip edit · X remove).
  // Wired on every renderLineupsTab so newly-inserted rows pick up handlers.
  _wireFocusPanel();

  // Phone-only tab strip: toggle active group without re-rendering the editor
  // (keeps pitch DOM, tactics canvas state and event handlers intact).
  const layoutEl = tabEl.querySelector('.lineup-layout');
  tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.ptab;
      if (!key) return;
      const changed = _lineupPhoneTab !== key;
      _lineupPhoneTab = key;
      if (layoutEl) layoutEl.setAttribute('data-phone-tab', key);
      tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(b => {
        const on = b.dataset.ptab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      // When the Focus tab is activated, regenerate the panel body — otherwise
      // it can show a stale picked-players list (the coach may have just
      // dragged someone onto the pitch in Squad tab without a full re-render).
      if (key === 'focus') _rerenderFocusPanel();
      // On phone, bring the tab strip to the top of the viewport so the active
      // group is immediately visible below — otherwise the pitch can hide the
      // tab's content under the fold on tall phones.
      if (changed && typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 899px)').matches) {
        const tabs = tabEl.querySelector('.lineup-phone-tabs');
        if (tabs) {
          const y = tabs.getBoundingClientRect().top + window.scrollY - 4;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    };
  });

  // Formation buttons. Shared by match editor + Formations top-level page. The
  // Formations page loads the formation's stored player placements (if any)
  // instead of carrying over whatever was on the pitch.
  tabEl.querySelectorAll('[data-formation]').forEach(b => {
    b.onclick = () => {
      if (!canEdit) return;
      const picked = b.dataset.formation;
      editor.current.formation = picked;
      // Changing formation resets any session-custom positions
      delete editor.current.pos;
      delete editor.current.lbl;
      _posEditMode = false;
      // Handle stored players on custom formations.
      const custom = (editor.customFormations || []).find(c => c.name === picked);
      const storedPlayers = custom?.data?.players || null;
      const storedCount = storedPlayers ? Object.values(storedPlayers).filter(Boolean).length : 0;

      if (editor?.mode === 'formation') {
        // Formations page: always swap to the stored arrangement (or empty) —
        // this is where the coach explicitly manages those templates.
        editor.current.slots = storedPlayers ? { ...storedPlayers } : {};
      } else {
        // Match editor: if the formation has stored players, offer to apply
        // them. Only prompt when there's something at risk of being overwritten
        // (current pitch has players). Empty pitch → load stored silently.
        const currentFilled = Object.values(editor.current.slots || {}).filter(Boolean).length;
        const applyStored = storedCount > 0 && (
          currentFilled === 0 ||
          confirm(`"${picked}" has ${storedCount} pre-placed player${storedCount === 1 ? '' : 's'} saved with it. Load them onto the pitch?\n\nOK — replace your current players with the stored ones.\nCancel — keep your current players, just change the formation shape.`)
        );
        if (applyStored) {
          editor.current.slots = { ...storedPlayers };
        } else {
          // Drop any slotted players beyond the new formation's slot count
          const newCount = (getFormation(editor.current.formation)?.pos.length) || 0;
          Object.keys(editor.current.slots).forEach(k => {
            if (parseInt(k) >= newCount) delete editor.current.slots[k];
          });
        }
      }
      _rerenderEditor();
    };
  });

  // Editor top-bar buttons (desktop) and Share FAB (phone)
  const backBtn  = tabEl.querySelector('#me-btn-back');
  const shareBtn = tabEl.querySelector('#me-btn-share');
  const newBtnTop= tabEl.querySelector('#me-btn-new');
  const shareFab = tabEl.querySelector('#me-share-fab');
  if (backBtn) backBtn.onclick = async () => {
    if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
    try { await flushAutosave(); } catch (_) {}
    // Switch to the Matches sub-tab (fixtures list) instead of leaving the editor.
    _lineupPhoneTab = 'matches';
    renderLineupsTab();
  };
  const openShareForCurrent = (opener) => openShareModal({ lineupId: editor?.current?.id, opener });
  if (shareBtn) shareBtn.onclick = () => openShareForCurrent(shareBtn);
  if (shareFab) shareFab.onclick = () => openShareForCurrent(shareFab);
  if (newBtnTop) newBtnTop.onclick = () => {
    // Fixed 2026-04-17 — previously this started a bare blank lineup state which is
    // no longer the right behavior now that match creation is wizard-driven. Matches
    // the sidebar/drawer global + and opens the guided wizard.
    if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
    const uid = editor.currentUserId;
    const teamId = editor.team?.id;
    if (!uid || !teamId) return;
    openMatchWizard({ id: uid }, teamId);
  };

  // Status pill → open status-change modal. Both the desktop header pill and the
  // phone-only status row carry the `.js-open-status` class, so wire them all.
  document.querySelectorAll('.js-open-status').forEach(btn => {
    btn.onclick = () => openStatusModal();
  });

  // Enter/edit result → opens the 4-step result wizard. Button is only rendered
  // when the match has kicked off (matchHasBeenPlayed).
  const enterResultBtn = tabEl.querySelector('#me-enter-result');
  if (enterResultBtn) enterResultBtn.onclick = () => openResultWizard();

  // Availability tally button — wired synchronously so the button works from the
  // instant it renders, even before renderCoachAvailabilityPanel's async DB fetch
  // replaces its innerHTML. renderCoachAvailabilityPanel re-attaches its own
  // handler after replacement, so both paths work.
  const availOpenBtn = tabEl.querySelector('#availability-panel-open');
  if (availOpenBtn && editor?.current?.id) {
    availOpenBtn.onclick = () => openAvailabilityModal(editor.current.id);
  }

  // Open match details modal
  const openMdBtn = document.getElementById('open-match-details');
  if (openMdBtn) openMdBtn.onclick = openMatchDetailsModal;

  // Single Share entry point — opens a modal with Availability + Match sections,
  // combined WhatsApp message, and Add-to-calendar. All previous actions preserved.
  const openShareBtn = document.getElementById('open-share-modal');
  if (openShareBtn) openShareBtn.onclick = () => openShareModal({
    lineupId: editor?.current?.id,
    opener: openShareBtn
  });

  // Buttons
  const newBtn = document.getElementById('new-lineup-btn');
  if (newBtn) newBtn.onclick = () => {
    if (hasUnsaved() && !confirm('Discard current unsaved changes?')) return;
    editor.current = newLineupState(); _lastSavedHash = _lineupContentHash(editor.current);
    renderLineupsTab();
  };

  const clearBtn = document.getElementById('clear-pitch');
  const clearBtn2 = document.getElementById('clear-pitch-squad');
  const doClear = () => {
    editor.current.slots = {};
    editor.current.subs = [];
    renderLineupsTab();
  };
  if (clearBtn) clearBtn.onclick = doClear;
  if (clearBtn2) clearBtn2.onclick = doClear;

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
        lbl: Array.isArray(l.data?.lbl) ? [...l.data.lbl] : undefined,
        pos: Array.isArray(l.data?.pos) ? l.data.pos.map(p => Array.isArray(p) ? [...p] : p) : undefined,
        arrows: (l.data?.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(l.data?.zoneLines || [null, null])],
        ballVisible: !!l.data?.ballVisible,
        ballPos: { ...(l.data?.ballPos || { x: 50, y: 50 }) },
        published: !!l.published,
        lineup_status: l.lineup_status || (l.published ? 'published' : 'draft'),
        location_name: l.location_name || '',
        location_postcode: l.location_postcode || '',
        location_lat: l.location_lat ?? null,
        location_lng: l.location_lng ?? null,
        our_score_ht: l.our_score_ht ?? null,
        opp_score_ht: l.opp_score_ht ?? null,
        our_score_ft: l.our_score_ft ?? null,
        opp_score_ft: l.opp_score_ft ?? null,
        goalscorers: Array.isArray(l.data?.goalscorers) ? l.data.goalscorers.map(g => ({ ...g })) : [],
        motm: Array.isArray(l.data?.motm) ? l.data.motm.map(m => ({ ...m })) : []
      };
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      // Mark this state as already-saved so autosave doesn't fire on first render
      _lastSavedHash = _lineupContentHash(editor.current);
      // Auto-expand Match details when a lineup is selected
      openCards.add('lineup-details');
      renderLineupsTab();
    };
  });

  // Click a match card in the Matches sub-tab → load that lineup + jump to Squad.
  // Shares loader logic with the legacy [data-lineup] handler above but also
  // switches _lineupPhoneTab so the coach lands on the squad picker.
  tabEl.querySelectorAll('[data-me-lineup]').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('[data-del-lineup]')) return;
      const id = el.dataset.meLineup;
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
        lbl: Array.isArray(l.data?.lbl) ? [...l.data.lbl] : undefined,
        pos: Array.isArray(l.data?.pos) ? l.data.pos.map(p => Array.isArray(p) ? [...p] : p) : undefined,
        arrows: (l.data?.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(l.data?.zoneLines || [null, null])],
        ballVisible: !!l.data?.ballVisible,
        ballPos: { ...(l.data?.ballPos || { x: 50, y: 50 }) },
        published: !!l.published,
        lineup_status: l.lineup_status || (l.published ? 'published' : 'draft'),
        location_name: l.location_name || '',
        location_postcode: l.location_postcode || '',
        location_lat: l.location_lat ?? null,
        location_lng: l.location_lng ?? null,
        our_score_ht: l.our_score_ht ?? null,
        opp_score_ht: l.opp_score_ht ?? null,
        our_score_ft: l.our_score_ft ?? null,
        opp_score_ft: l.opp_score_ft ?? null,
        goalscorers: Array.isArray(l.data?.goalscorers) ? l.data.goalscorers.map(g => ({ ...g })) : [],
        motm: Array.isArray(l.data?.motm) ? l.data.motm.map(m => ({ ...m })) : []
      };
      tacticMode = null; clickStart = null; dragCurrent = null; dragActive = false;
      _lastSavedHash = _lineupContentHash(editor.current);
      // Re-render with the selected match on the pitch and Squad sub-tab active.
      _lineupPhoneTab = 'squad';
      renderLineupsTab();
    };
  });

  // (The dashed "+ New match" card used to live here — removed 2026-04-17.
  //  Top-right "+ New" in the editor header + the global + button are now the
  //  only entry points, both wired to openMatchWizard.)

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

  // Save as tactic (formerly "Save as play" — opens the save-as-play modal
  // which now labels itself "Save as tactic" with a possession radio).
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
      _rerenderEditor();
    };
  });

  // Position-editing handlers (Edit formation / Save / Save-as-new / Cancel /
  // Done). Extracted so the Formations top-level page can share them via
  // wireFormationsEvents. Idempotent — safe to call on any page; all
  // lookups null-guard.
  wirePosEditingHandlers();

  if (canEdit && _posEditMode) wirePositionEditing();

  wireCollapsibles(tabEl);

  if (canEdit && !_posEditMode) wireDragAndDrop();
  if (canEdit && !_posEditMode) wireTacticsUI();
  if (canEdit && !_posEditMode) wirePicker();
}

// Shared by wireLineupEvents (harmless — match editor Formation sub-tab no
// longer renders these buttons) and wireFormationsEvents (Formations top-level
// page — this is the real user of it). Uses editor.mode to branch on
// side-effects (autosave only in 'lineup' mode; player-placements prompt only
// in 'formation' mode). Idempotent; all DOM lookups null-guard.
function wirePosEditingHandlers() {
  // Optional prompt: when the coach has players on the pitch on the Formations
  // page, ask whether to remember those placements with the saved formation.
  // Returns the slots object to save, or null to save shape-only.
  const _maybeIncludePlayersInSave = () => {
    if (editor?.mode !== 'formation') return null;
    const slots = editor.current.slots || {};
    const filled = Object.values(slots).filter(Boolean).length;
    if (filled === 0) return null;
    return confirm(`Remember the ${filled} player placement${filled === 1 ? '' : 's'} currently on the pitch with this formation?\n\nOK — save players too (they'll be pre-placed next time you open this formation).\nCancel — save the shape only.`)
      ? { ...slots } : null;
  };

  const posToggle = document.getElementById('pos-edit-toggle');
  if (posToggle) posToggle.onclick = () => {
    const f = getFormation(editor.current.formation);
    if (!f) return;
    if (!Array.isArray(editor.current.pos)) editor.current.pos = f.pos.map(p => [...p]);
    if (!Array.isArray(editor.current.lbl)) editor.current.lbl = [...f.lbl];
    _posEditMode = true;
    _rerenderEditor();
  };

  const posDone = document.getElementById('pos-edit-done');
  if (posDone) posDone.onclick = () => {
    _posEditMode = false;
    _rerenderEditor();
  };

  const posCancel = document.getElementById('pos-edit-cancel');
  if (posCancel) posCancel.onclick = () => {
    delete editor.current.pos;
    delete editor.current.lbl;
    _posEditMode = false;
    _rerenderEditor();
  };

  const posSave = document.getElementById('pos-edit-save');
  if (posSave) posSave.onclick = async () => {
    const baseName = editor.current.formation;
    const currentFormation = getFormation(baseName);
    const existingCustomId = currentFormation && currentFormation._customId;

    let trimmed = baseName;
    if (existingCustomId) {
      if (!confirm(`Overwrite custom formation "${baseName}"?`)) return;
    } else {
      const suggested = baseName + ' (custom)';
      const name = prompt('Preset formations can\'t be overwritten. Save as new custom formation — name:', suggested);
      if (!name) return;
      trimmed = name.trim();
      if (!trimmed) return;
    }

    // Fall back to the formation's own defaults when the coach hasn't entered
    // Edit-formation mode (pos/lbl only exist while _posEditMode was on). This
    // lets Save work purely for player-placement changes too.
    const srcPos = Array.isArray(editor.current.pos) ? editor.current.pos : currentFormation.pos;
    const srcLbl = Array.isArray(editor.current.lbl) ? editor.current.lbl : currentFormation.lbl;
    const payloadData = {
      pos: srcPos.map(p => [...p]),
      lbl: [...srcLbl]
    };
    const includePlayers = _maybeIncludePlayersInSave();
    if (includePlayers) payloadData.players = includePlayers;

    if (existingCustomId) {
      const { data, error } = await supabase.from('formations')
        .update({ data: payloadData, name: trimmed })
        .eq('id', existingCustomId)
        .select().single();
      if (error) { alert('Save failed: ' + error.message); return; }
      editor.customFormations = editor.customFormations || [];
      const idx = editor.customFormations.findIndex(cf => cf.id === existingCustomId);
      if (idx >= 0) editor.customFormations[idx] = data;
      await logAudit(editor.team.id, 'formation', data.id, 'update', { name: trimmed, from: 'edit-positions' });
    } else {
      const payload = { team_id: editor.team.id, name: trimmed, data: payloadData };
      const { data, error } = await supabase.from('formations').insert(payload).select().single();
      if (error) { alert('Save failed: ' + error.message); return; }
      editor.customFormations = editor.customFormations || [];
      editor.customFormations.unshift(data);
      await logAudit(editor.team.id, 'formation', data.id, 'create', { name: trimmed, from: 'edit-positions' });
    }

    editor.current.formation = trimmed;
    delete editor.current.pos;
    delete editor.current.lbl;
    _posEditMode = false;
    if (editor?.mode !== 'formation' && typeof scheduleAutosaveIfPublished === 'function') scheduleAutosaveIfPublished();
    _rerenderEditor();
  };

  const posSaveNew = document.getElementById('pos-edit-save-new');
  if (posSaveNew) posSaveNew.onclick = async () => {
    const baseName = editor.current.formation;
    const suggested = baseName + ' (custom)';
    const name = prompt('Save as new formation — name:', suggested);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const clash = (editor.customFormations || []).find(cf => cf.name === trimmed);
    if (clash && !confirm(`A formation named "${trimmed}" already exists. Overwrite it?`)) return;

    // Same pos/lbl fallback as Save formation — so Save-as-new works when the
    // coach hasn't entered position-edit mode (e.g. just placed players).
    const baseFormation = getFormation(baseName);
    const srcPos = Array.isArray(editor.current.pos) ? editor.current.pos : baseFormation.pos;
    const srcLbl = Array.isArray(editor.current.lbl) ? editor.current.lbl : baseFormation.lbl;
    const payloadData = {
      pos: srcPos.map(p => [...p]),
      lbl: [...srcLbl]
    };
    const includePlayers = _maybeIncludePlayersInSave();
    if (includePlayers) payloadData.players = includePlayers;

    if (clash) {
      const { data, error } = await supabase.from('formations')
        .update({ data: payloadData, name: trimmed })
        .eq('id', clash.id)
        .select().single();
      if (error) { alert('Save failed: ' + error.message); return; }
      const idx = editor.customFormations.findIndex(cf => cf.id === clash.id);
      if (idx >= 0) editor.customFormations[idx] = data;
      await logAudit(editor.team.id, 'formation', data.id, 'update', { name: trimmed, from: 'edit-positions' });
    } else {
      const payload = { team_id: editor.team.id, name: trimmed, data: payloadData };
      const { data, error } = await supabase.from('formations').insert(payload).select().single();
      if (error) { alert('Save failed: ' + error.message); return; }
      editor.customFormations = editor.customFormations || [];
      editor.customFormations.unshift(data);
      await logAudit(editor.team.id, 'formation', data.id, 'create', { name: trimmed, from: 'edit-positions' });
    }

    editor.current.formation = trimmed;
    delete editor.current.pos;
    delete editor.current.lbl;
    _posEditMode = false;
    if (editor?.mode !== 'formation' && typeof scheduleAutosaveIfPublished === 'function') scheduleAutosaveIfPublished();
    _rerenderEditor();
  };
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

  // Double-click a label to change it via dropdown
  pitch.querySelectorAll('[data-pos-label]').forEach(lab => {
    lab.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = parseInt(lab.dataset.posLabel, 10);
      const f = getFormation(editor.current.formation);
      if (!Array.isArray(editor.current.lbl) || (f && editor.current.lbl.length !== f.lbl.length)) {
        editor.current.lbl = f ? [...f.lbl] : [];
      }
      const current = (editor.current.lbl[idx] || '').toUpperCase();
      openPositionLabelPicker(current, (next) => {
        if (next == null) return;
        editor.current.lbl[idx] = next.trim().toUpperCase().slice(0, 4);
        // Trigger autosave if this lineup is already saved
        if (typeof scheduleAutosaveIfPublished === 'function') scheduleAutosaveIfPublished();
        renderLineupsTab();
      });
    });
  });
}

// Modal dropdown for choosing a position label
const POSITION_LABEL_OPTIONS = [
  'GK',
  'RB','RCB','CB','LCB','LB',
  'RWB','LWB',
  'CDM','DM',
  'RM','RCM','CM','LCM','LM',
  'CAM','AM',
  'RW','LW',
  'CF','ST'
];
function openPositionLabelPicker(current, cb) {
  const existing = document.querySelector('.pos-label-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay pos-label-modal-overlay';
  const opts = [...POSITION_LABEL_OPTIONS];
  if (current && !opts.includes(current)) opts.unshift(current);
  overlay.innerHTML = `
    <div class="map-modal" style="max-width:320px">
      <div class="map-modal-header"><strong>Position label</strong>
        <button class="btn-secondary" id="pl-close" type="button">✕</button>
      </div>
      <div class="map-modal-body" style="padding:1rem">
        <label style="display:block;margin-bottom:0.5rem;font-size:0.85rem" class="muted">Pick a label</label>
        <select id="pl-select" style="width:100%;padding:0.5rem;font-size:1rem">
          ${opts.map(o => `<option value="${o}"${o===current?' selected':''}>${o}</option>`).join('')}
        </select>
        <label style="display:block;margin:0.75rem 0 0.25rem;font-size:0.85rem" class="muted">Or type custom (max 4 chars)</label>
        <input id="pl-custom" type="text" maxlength="4" placeholder="e.g. SS" style="width:100%;padding:0.5rem;font-size:1rem;text-transform:uppercase" />
      </div>
      <div class="map-modal-footer">
        <button class="btn-secondary" id="pl-cancel" type="button">Cancel</button>
        <button class="primary" id="pl-save" type="button">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = (val) => { overlay.remove(); cb(val); };
  overlay.querySelector('#pl-close').onclick = () => close(null);
  overlay.querySelector('#pl-cancel').onclick = () => close(null);
  overlay.querySelector('#pl-save').onclick = () => {
    const custom = overlay.querySelector('#pl-custom').value.trim();
    const sel = overlay.querySelector('#pl-select').value;
    close(custom || sel);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
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
  const defaultName = current.name ? `${current.name} (tactic)` : '';

  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.innerHTML = `
    <div class="picker-modal cfb-modal">
      <div class="picker-header">
        <strong>Save as tactic</strong>
        <button class="picker-close" data-action="close">✕</button>
      </div>
      <div class="picker-body">
        <label>Name</label>
        <input type="text" id="sap-name" value="${escapeHtml(defaultName)}" placeholder="e.g. High press from goal kick" />
        <label style="margin-top:0.7rem">Possession</label>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.25rem">
          <label style="display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;font-weight:normal">
            <input type="radio" name="sap-possession" value="in" checked /> In possession
          </label>
          <label style="display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;font-weight:normal">
            <input type="radio" name="sap-possession" value="out" /> Out of possession
          </label>
        </div>
        <label style="margin-top:0.7rem">Description</label>
        <textarea id="sap-description" rows="3" placeholder="Optional notes"></textarea>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
          <button class="btn-secondary" data-action="close">Cancel</button>
          <button class="primary" id="sap-save">Save tactic</button>
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
    const possession = overlay.querySelector('input[name="sap-possession"]:checked')?.value || 'in';
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
    if (saveMsg) { saveMsg.textContent = `✓ Saved tactic "${name}"`; saveMsg.className = 'ok'; setTimeout(() => { if (saveMsg) saveMsg.textContent = ''; }, 2500); }
  };
}

// Tap-to-pick: clicking any slot or sub slot opens a player picker modal.
// Works on both mouse and touch. HTML5 drag still works on desktop.
function wirePicker() {
  const tabEl = document.getElementById('tab-content');

  // Focus-mode intercept: when the coach is on the Focus sub-tab with tap
  // mode active, a tap on a FILLED pitch/subs slot should pick that player
  // into the Focus panel instead of opening the replace-player picker.
  // An empty slot still falls through to the normal picker so the coach can
  // pick a child and immediately set a cue for them in one flow.
  const maybeFocusSelect = (el) => {
    if (!_focusModeActive()) return false;
    const chip = el.querySelector('.chip[data-player-id]');
    const pid = chip?.dataset.playerId;
    if (!pid) return false;
    _focusSelectPlayer(pid);
    return true;
  };

  tabEl.querySelectorAll('[data-slot]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Ignore clicks that originated during a drag
      if (el.classList.contains('drag-over')) return;
      if (maybeFocusSelect(el)) return;
      openPlayerPicker('slot', parseInt(el.dataset.slot, 10));
    });
  });
  tabEl.querySelectorAll('[data-sub]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('drag-over')) return;
      if (maybeFocusSelect(el)) return;
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
    // Targeted refresh so the right-hand panel (Matches/Info/etc.) doesn't flicker.
    refreshAfterChipMove();
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

// Re-render the currently-active editor tab. The position-editing handlers and
// the formation-button click handler are shared between the match editor, the
// Formations top-level page, and the Tactics page; they each set editor.mode
// so this dispatch picks the right renderer.
function _rerenderEditor() {
  if (editor?.mode === 'formation') {
    renderFormationsTab();
  } else if (editor?.mode === 'play') {
    renderPlaysTab();
  } else {
    renderLineupsTab();
  }
}

// Lightweight re-render after a chip move (drop or player-picker remove).
// Previously every drop called renderLineupsTab() which rebuilt the entire tab
// HTML — including the Matches list, Info panel, availability bar, etc. On any
// non-Squad sub-tab that caused a visible "realign then go back" flicker every
// time a player was moved. Now we only update the bits that actually changed:
//   • pitch slots  (renderPitch)
//   • subs row     (renderSubsBar)
//   • subs count label
//   • available-players palette
//   • availability dots + MOTM/goal overlays on the new chip positions
//   • autosave (standard hash-based flow)
// Touches zero DOM outside the match editor's left pitch column + right palette
// inside Squad sub-tab, so whatever tab the coach is currently looking at stays
// exactly where it was. (Added 2026-04-17.)
function refreshAfterChipMove() {
  const { current, players } = editor;
  if (!current) return;

  // Pitch slots
  renderPitch();

  // Subs row chips + label count
  renderSubsBar();
  const subsLabelEl = document.querySelector('.subs-label');
  if (subsLabelEl) {
    const filled = (current.subs || []).filter(Boolean).length;
    subsLabelEl.textContent = `SUBSTITUTES (${filled}/${MAX_SUBS})`;
  }

  // Available-players palette — rebuild its innerHTML in place
  const paletteEl = document.getElementById('palette');
  if (paletteEl) {
    const usedIds = new Set([...Object.values(current.slots || {}), ...(current.subs || [])].filter(Boolean));
    const available = (players || []).filter(p => !usedIds.has(p.id));
    paletteEl.innerHTML = available.length
      ? available.map(p => chipHtml(p, 'palette')).join('')
      : `<p class="muted" style="padding:0.5rem">All players on the pitch or subs.</p>`;
  }

  // Re-apply availability dots + MOTM/goal overlays to any newly-rendered chips
  applyAvailabilityDecorations();
  const slotsLayer = document.getElementById('slots-layer');
  const subsRow = document.getElementById('subs-row');
  if (slotsLayer) applyMatchDecorations(slotsLayer, current.motm, current.goalscorers, editor.team?.id, current.id);
  if (subsRow)   applyMatchDecorations(subsRow,   current.motm, current.goalscorers, editor.team?.id, current.id);

  // Persist
  try { scheduleAutosaveIfPublished(); } catch (_) {}
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
    refreshAfterChipMove();
    return;
  }

  // From sub or palette: if slot occupied, bump occupant back to palette
  removeFromSource(payload);
  current.slots[slotIdx] = payload.playerId;
  refreshAfterChipMove();
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
    refreshAfterChipMove();
    return;
  }

  // From slot or palette — if empty and at cap, refuse
  if (!targetPid && subsFilled >= MAX_SUBS) {
    alert(`Max ${MAX_SUBS} subs.`);
    return;
  }
  removeFromSource(payload);
  current.subs[subIdx] = payload.playerId;
  refreshAfterChipMove();
}

function handleDropToPalette(payload) {
  removeFromSource(payload);
  refreshAfterChipMove();
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

  // Normalise goalscorers: drop 0-count entries, coerce count to int.
  const cleanScorers = Array.isArray(current.goalscorers)
    ? current.goalscorers
        .map(g => ({ player_id: g.player_id, count: parseInt(g.count, 10) || 0 }))
        .filter(g => g.player_id && g.count > 0)
    : [];
  // Normalise motm: trim reason, drop entries without a player_id.
  const cleanMotm = Array.isArray(current.motm)
    ? current.motm
        .map(m => ({ player_id: m.player_id, reason: (m.reason || '').trim() }))
        .filter(m => m.player_id)
    : [];

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
    // Post-match result columns. null until the coach enters a value.
    our_score_ht: (current.our_score_ht === '' || current.our_score_ht == null) ? null : parseInt(current.our_score_ht, 10),
    opp_score_ht: (current.opp_score_ht === '' || current.opp_score_ht == null) ? null : parseInt(current.opp_score_ht, 10),
    our_score_ft: (current.our_score_ft === '' || current.our_score_ft == null) ? null : parseInt(current.our_score_ft, 10),
    opp_score_ft: (current.opp_score_ft === '' || current.opp_score_ft == null) ? null : parseInt(current.opp_score_ft, 10),
    data: {
      formation: current.formation,
      slots: current.slots,
      subs: current.subs,
      lbl: Array.isArray(current.lbl) ? [...current.lbl] : null,
      pos: Array.isArray(current.pos) ? current.pos.map(p => Array.isArray(p) ? [...p] : p) : null,
      arrows: current.arrows,
      zoneLines: current.zoneLines,
      ballVisible: current.ballVisible,
      ballPos: current.ballPos,
      // Goalscorers + MOTM go in JSONB so we don't need extra columns / tables.
      goalscorers: cleanScorers,
      motm: cleanMotm
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

// ---------- Tactics tab (formerly Plays) ----------
// Rebuilt 2026-04-17 as a pitch + sub-tabs layout matching the match editor.
// Four sub-tabs:
//   • Tactics — card grid of saved tactics (name, formation, In/Out chip).
//   • Squad — palette for dragging players onto the pitch.
//   • Moves — arrows / ball / zones drawing tools (room to grow).
//   • Tactic details — name, possession radio, description, formation picker
//     (read-only — no edit/save here; Formations page does that), Edit positions
//     toggle, Save / Save as new / Delete buttons.
// Clicking a tactic card loads it into editor.current and flips to the details
// sub-tab. Save writes back in place; Save as new inserts a fresh row. The
// internal key for the details sub-tab is still 'edit' (data-phone-tab="edit")
// — only the visible label reads "Tactic details".
let _playsUi = { selectedId: null, filter: 'all', subTab: 'tactics' };

function renderPlaysTab() {
  const tabEl = document.getElementById('tab-content');
  const { canEdit, players, plays, customFormations, current } = editor;
  const subTab = _playsUi.subTab || 'tactics';

  // Filter the card list
  const filter = _playsUi.filter || 'all';
  const visible = plays.filter(p => {
    if (filter === 'in') return (p.data?.possession || 'in') === 'in';
    if (filter === 'out') return p.data?.possession === 'out';
    return true;
  });
  // Newest first
  visible.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // --- Tactics sub-tab: card list ---
  const possChip = (p) => p === 'out'
    ? '<div class="me-match-status me-match-status-out">Out of possession</div>'
    : '<div class="me-match-status me-match-status-in">In possession</div>';

  const tacticCardsHtml = visible.length
    ? visible.map(p => {
        const d = p.data || {};
        const possessionVal = d.possession === 'out' ? 'out' : 'in';
        const formLabel = d.formation ? escapeHtml(d.formation) : '—';
        const arrowCount = (d.arrows || []).length;
        const descSnippet = d.description
          ? escapeHtml(d.description.slice(0, 70) + (d.description.length > 70 ? '…' : ''))
          : '';
        const metaParts = [formLabel];
        if (arrowCount) metaParts.push(`${arrowCount} arrow${arrowCount === 1 ? '' : 's'}`);
        if (descSnippet) metaParts.push(descSnippet);
        return `
          <div class="me-match-card ${current?.id === p.id ? 'active' : ''}" data-play="${p.id}">
            <div class="mc-date mc-tactic-icon" aria-hidden="true">
              <span class="mc-tactic-emoji">📋</span>
            </div>
            <div class="mc-body">
              <div class="me-match-title">${escapeHtml(p.name || '—')}</div>
              <div class="me-match-meta lineup-meta">${metaParts.join(' · ')}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.2rem">
              ${possChip(possessionVal)}
            </div>
            ${canEdit ? `<button class="me-match-del" data-del-tactic="${p.id}" title="Delete">✕</button>` : ''}
          </div>
        `;
      }).join('')
    : `<p class="muted" style="padding:0.75rem">No saved tactics${filter !== 'all' ? ' for this filter' : ''}. ${canEdit ? 'Tap <strong>+ New tactic</strong> to build one.' : ''}</p>`;

  const tacticsPanelHtml = `
    <div class="me-matches">
      <div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.6rem;flex-wrap:wrap">
        <select id="plays-filter" style="flex:1;min-width:140px;padding:0.35rem 0.4rem">
          <option value="all" ${filter === 'all' ? 'selected' : ''}>All tactics</option>
          <option value="in"  ${filter === 'in'  ? 'selected' : ''}>In possession</option>
          <option value="out" ${filter === 'out' ? 'selected' : ''}>Out of possession</option>
        </select>
        ${canEdit ? `<button type="button" class="primary" id="tac-new-btn" style="padding:0.4rem 0.75rem;font-size:0.85rem">+ New tactic</button>` : ''}
      </div>
      <div class="me-matches-grid">${tacticCardsHtml}</div>
    </div>
  `;

  // --- Edit tactic sub-tab: inline editor ---

  // Formation picker — READ-ONLY here (can't save/edit formations from Tactics).
  // Distinct data attribute so the match-editor's formation-button handler doesn't fire.
  const FORMS = allFormations(customFormations);
  const tacticFormationBtns = Object.keys(FORMS).map(f => {
    const info = FORMS[f];
    const cid = info._customId;
    return `<button class="f-btn ${current.formation === f ? 'active' : ''}${cid ? ' f-btn-custom' : ''}" data-tactic-formation="${f}"><span class="f-label">${escapeHtml(f)}</span></button>`;
  }).join('');

  // Palette
  const usedIds = new Set([...Object.values(current.slots || {})].filter(Boolean));
  const availablePlayers = (players || []).filter(p => !usedIds.has(p.id));
  const paletteHtml = availablePlayers.length
    ? availablePlayers.map(p => chipHtml(p, 'palette')).join('')
    : `<p class="muted" style="padding:0.5rem">All players on the pitch.</p>`;

  // Moves sub-tab body — the arrows / ball / zones controls used to live
  // inside the Edit tactic panel as a collapsible. Split into their own
  // sub-tab 2026-04-17 because Chris plans to add more drawing features
  // here. Ids (tactic-btn / btn-ball / chk-zone-* / clear-arrows / clear-tactics)
  // match what wireTacticsUI looks for — no wiring changes needed.
  const movesPanelHtml = canEdit ? `
    <p class="muted me-hint">Pitch layout + drawing tools — move position dots, add arrows for player movement, mark where the ball starts, set press/def zone lines.</p>
    <div style="display:flex;flex-direction:column;gap:0.35rem;margin-bottom:0.6rem;padding-bottom:0.6rem;border-bottom:1px solid var(--border)">
      ${_posEditMode
        ? `<button class="primary btn-full" id="pos-edit-done">✓ Done editing positions</button>
           <button class="btn-full" id="pos-edit-cancel" style="margin-bottom:0">✕ Cancel position edits</button>
           <p class="muted" style="font-size:0.72rem;margin:0.2rem 0 0">Drag handles to reposition. Double-click a label to rename. Positions save with this tactic only — the underlying formation isn't changed.</p>`
        : `<button class="btn-full" id="pos-edit-toggle" style="margin-bottom:0">✎ Edit positions</button>
           <p class="muted" style="font-size:0.72rem;margin:0.1rem 0 0">Reposition the dots for this tactic (doesn't change the formation itself).</p>`
      }
    </div>
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
  ` : `<p class="muted" style="padding:0.75rem">Sign in as a coach to edit moves.</p>`;

  const isMine = current.id && current.created_by && editor.currentUserId && current.created_by === editor.currentUserId;
  const isAdmin = editor.currentUserRole === 'admin';
  const canDelete = canEdit && current.id && (isMine || isAdmin);
  const hasLoaded = !!current.id;

  // Squad sub-tab body — palette for dragging players onto pitch, same as the
  // match editor's Squad tab. Ephemeral on Tactics: players on the pitch get
  // saved as part of the tactic's slots, but formations themselves are unaffected.
  const squadPanelHtml = canEdit ? `
    <p class="muted me-hint">Drag players onto pitch positions if you want to pin specific players. Optional.</p>
    <div class="palette" id="palette">${paletteHtml}</div>
    <button type="button" class="btn-full me-btn-clear-pitch" id="clear-pitch-squad">Clear pitch</button>
  ` : `<p class="muted" style="padding:0.75rem">Sign in as a coach to place players.</p>`;

  // Edit tactic sub-tab body — name / possession / description / formation /
  // arrows-ball-zones / save buttons. Squad moved to its own sub-tab.
  const editPanelHtml = canEdit ? `
    <div class="tac-edit-body" style="display:flex;flex-direction:column;gap:0.7rem">
      <div>
        <label class="tac-label">Name</label>
        <input type="text" id="tac-name" class="tac-input" placeholder="e.g. High press from goal kick"
          value="${escapeHtml(current.name || '')}" />
      </div>
      <div>
        <label class="tac-label">Possession</label>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.25rem">
          <label style="display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;margin:0;font-weight:normal">
            <input type="radio" name="tac-possession" value="in" ${(current.possession || 'in') === 'in' ? 'checked' : ''} />
            In possession
          </label>
          <label style="display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;margin:0;font-weight:normal">
            <input type="radio" name="tac-possession" value="out" ${current.possession === 'out' ? 'checked' : ''} />
            Out of possession
          </label>
        </div>
      </div>
      <div>
        <label class="tac-label">Description</label>
        <textarea id="tac-desc" class="tac-input" rows="2" placeholder="Optional notes">${escapeHtml(current.description || '')}</textarea>
      </div>
      <div>
        <label class="tac-label">Formation</label>
        <p class="muted" style="font-size:0.72rem;margin:0 0 0.35rem">Pick a formation to base this tactic on. Editing the underlying formation happens on the <strong>Formations</strong> tab — nudging positions for this one tactic lives in the <strong>Moves</strong> tab.</p>
        <div class="f-btns f-btns-col">${tacticFormationBtns}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.25rem">
        <button class="primary btn-full" id="tac-save">💾 ${hasLoaded ? 'Save' : 'Save tactic'}</button>
        ${hasLoaded ? `<button class="btn-full" id="tac-save-new">➕ Save as new…</button>` : ''}
        ${canDelete ? `<button class="btn-full" id="tac-delete" style="color:#c62828;border-color:#c62828">✕ Delete</button>` : ''}
        <div id="tac-msg" class="muted" style="min-height:1.1em;font-size:0.8rem;margin-top:0.2rem"></div>
      </div>
    </div>
  ` : `<p class="muted" style="padding:0.75rem">Sign in as a coach to edit tactics.</p>`;

  // Sub-tab strip — Tactics / Squad / Moves / Edit tactic
  const subTabsHtml = `
    <nav class="lineup-phone-tabs me-subtabs" role="tablist" aria-label="Tactics page sections">
      <button class="lineup-phone-tab ${subTab === 'tactics' ? 'active' : ''}" role="tab" aria-selected="${subTab === 'tactics' ? 'true' : 'false'}" data-ptab="tactics">Tactics</button>
      <button class="lineup-phone-tab ${subTab === 'squad' ? 'active' : ''}"   role="tab" aria-selected="${subTab === 'squad' ? 'true' : 'false'}"   data-ptab="squad">Squad</button>
      <button class="lineup-phone-tab ${subTab === 'moves' ? 'active' : ''}"   role="tab" aria-selected="${subTab === 'moves' ? 'true' : 'false'}"   data-ptab="moves">Moves</button>
      <button class="lineup-phone-tab ${subTab === 'edit' ? 'active' : ''}"    role="tab" aria-selected="${subTab === 'edit' ? 'true' : 'false'}"    data-ptab="edit">Tactic details</button>
    </nav>
  `;

  // Layout — match-editor skeleton. Includes the full pitch (slots + tactics
  // canvas + ball) so arrows / zones / ball / chip drag all work.
  tabEl.innerHTML = `
    <div class="match-editor lineup-layout tactics-layout" data-phone-tab="${subTab}">
      <div class="me-body">
        <div class="me-pitch-col">
          <div class="card pitch-card">
            <div class="pitch" id="pitch">
              <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
              <div class="slots-layer" id="slots-layer"></div>
              <canvas class="tactics-canvas" id="tactics-canvas"></canvas>
              <div class="ball-el" id="ball-el"></div>
            </div>
          </div>
        </div>
        <div class="me-panel-col">
          ${subTabsHtml}
          <div class="me-panel card">
            <div data-phone-group="tactics" class="me-panel-body me-panel-body-matches">${tacticsPanelHtml}</div>
            <div data-phone-group="squad" class="me-panel-body">${squadPanelHtml}</div>
            <div data-phone-group="moves" class="me-panel-body">${movesPanelHtml}</div>
            <div data-phone-group="edit" class="me-panel-body">${editPanelHtml}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Paint the pitch and set up tactics canvas / ball
  renderPitch();
  initTacticsCanvas();
  initBall();
  sizeTacticsCanvas();
  drawTactics();
  renderBall();
  updateTacticsCanvasClass();

  wireTacticsPageEvents();
  // Shared pos-editing handlers. Only the toggle/done/cancel buttons are
  // rendered on this page (no Save formation / Save-as-new — the tactic's
  // pos/lbl ride along with the main Save tactic button), but the others are
  // all null-guarded so there's no harm in calling the shared wirer.
  wirePosEditingHandlers();
  // Drag handles for position editing (same implementation as match editor +
  // Formations page). Only bound when the coach is in edit mode.
  if (canEdit && _posEditMode) wirePositionEditing();
  if (canEdit && !_posEditMode) wireDragAndDrop();
  if (canEdit && !_posEditMode) wireTacticsUI();
  if (canEdit && !_posEditMode) wirePicker();
  if (typeof wireCollapsibles === 'function') wireCollapsibles(tabEl);
}

function wireTacticsPageEvents() {
  const tabEl = document.getElementById('tab-content');
  const { team, plays, canEdit } = editor;

  // Sub-tab switcher (Tactics ↔ Edit tactic)
  const layoutEl = tabEl.querySelector('.lineup-layout');
  tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.ptab;
      if (!key) return;
      _playsUi.subTab = key;
      if (layoutEl) layoutEl.setAttribute('data-phone-tab', key);
      tabEl.querySelectorAll('.lineup-phone-tab[data-ptab]').forEach(b => {
        const on = b.dataset.ptab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    };
  });

  // Filter
  const filterEl = tabEl.querySelector('#plays-filter');
  if (filterEl) filterEl.onchange = (e) => {
    _playsUi.filter = e.target.value;
    renderPlaysTab();
  };

  // Click a tactic card → load it + switch to Edit sub-tab
  tabEl.querySelectorAll('[data-play]').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('[data-del-tactic]')) return;
      const id = el.dataset.play;
      const p = plays.find(x => x.id === id);
      if (!p) return;
      const d = p.data || {};
      editor.current = {
        id: p.id,
        name: p.name || '',
        description: d.description || '',
        possession: d.possession === 'out' ? 'out' : 'in',
        formation: d.formation || '4-3-3',
        pos: Array.isArray(d.pos) ? d.pos.map(r => [...r]) : null,
        lbl: Array.isArray(d.lbl) ? [...d.lbl] : null,
        slots: (d.slots && typeof d.slots === 'object') ? { ...d.slots } : {},
        subs: Array.isArray(d.subs) ? [...d.subs] : [],
        arrows: (d.arrows || []).map(a => ({ ...a })),
        zoneLines: [...(d.zoneLines || [null, null])],
        ballVisible: !!d.ballVisible,
        ballPos: { ...(d.ballPos || { x: 50, y: 50 }) },
        created_by: p.created_by
      };
      _playsUi.selectedId = p.id;
      _playsUi.subTab = 'edit';
      _rerenderEditor();
    };
  });

  // Delete from the card's X button
  tabEl.querySelectorAll('[data-del-tactic]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const id = btn.dataset.delTactic;
      const p = plays.find(x => x.id === id);
      if (!p) return;
      if (!confirm(`Delete tactic "${p.name}"?`)) return;
      const { error } = await supabase.from('plays').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await logAudit(team.id, 'play', id, 'delete', { name: p.name });
      const idx = plays.findIndex(x => x.id === id);
      if (idx >= 0) plays.splice(idx, 1);
      if (editor.current?.id === id) editor.current = newPlayState();
      _rerenderEditor();
    };
  });

  // + New tactic
  const newBtn = tabEl.querySelector('#tac-new-btn');
  if (newBtn) newBtn.onclick = () => {
    editor.current = newPlayState();
    _playsUi.selectedId = null;
    _playsUi.subTab = 'edit';
    _rerenderEditor();
  };

  // Formation buttons (tactic-scoped via data-tactic-formation so they don't
  // collide with the match-editor's data-formation handler).
  tabEl.querySelectorAll('[data-tactic-formation]').forEach(b => {
    b.onclick = () => {
      if (!canEdit) return;
      editor.current.formation = b.dataset.tacticFormation;
      // Clear any session-custom position/label overrides that were attached
      // to the previous formation — each tactic picks a fresh shape.
      delete editor.current.pos;
      delete editor.current.lbl;
      // Drop any slotted players beyond the new formation's slot count
      const newCount = (getFormation(editor.current.formation)?.pos.length) || 0;
      Object.keys(editor.current.slots).forEach(k => {
        if (parseInt(k) >= newCount) delete editor.current.slots[k];
      });
      _rerenderEditor();
    };
  });

  // Name / description / possession inputs — mutate editor.current directly
  const nameEl = tabEl.querySelector('#tac-name');
  if (nameEl) nameEl.oninput = (e) => { editor.current.name = e.target.value; };
  const descEl = tabEl.querySelector('#tac-desc');
  if (descEl) descEl.oninput = (e) => { editor.current.description = e.target.value; };
  tabEl.querySelectorAll('input[name="tac-possession"]').forEach(r => {
    r.onchange = (e) => { if (e.target.checked) editor.current.possession = e.target.value; };
  });

  // Clear pitch (Edit tab Squad section)
  const clearBtn = tabEl.querySelector('#clear-pitch-squad');
  if (clearBtn) clearBtn.onclick = () => {
    editor.current.slots = {};
    refreshAfterChipMove();
  };

  // Save / Save-as-new / Delete
  const saveBtn = tabEl.querySelector('#tac-save');
  if (saveBtn) saveBtn.onclick = () => saveTactic(false);
  const saveNewBtn = tabEl.querySelector('#tac-save-new');
  if (saveNewBtn) saveNewBtn.onclick = () => saveTactic(true);
  const delBtn = tabEl.querySelector('#tac-delete');
  if (delBtn) delBtn.onclick = async () => {
    const c = editor.current;
    if (!c.id) return;
    if (!confirm(`Delete tactic "${c.name}"?`)) return;
    const { error } = await supabase.from('plays').delete().eq('id', c.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await logAudit(team.id, 'play', c.id, 'delete', { name: c.name });
    const idx = plays.findIndex(x => x.id === c.id);
    if (idx >= 0) plays.splice(idx, 1);
    editor.current = newPlayState();
    _playsUi.selectedId = null;
    _playsUi.subTab = 'tactics';
    _rerenderEditor();
  };
}

// Insert (asNew=true) or update (asNew=false) the currently-loaded tactic.
async function saveTactic(asNew) {
  const { team, plays, current } = editor;
  const msg = document.getElementById('tac-msg');
  const setMsg = (t, cls) => { if (msg) { msg.textContent = t; msg.className = cls; } };
  setMsg('', 'muted');

  let name = (current.name || '').trim();
  if (!name) {
    setMsg('Name is required.', 'error');
    const nameEl = document.getElementById('tac-name');
    if (nameEl) nameEl.focus();
    return;
  }
  if (asNew) {
    const suggested = current.id ? name + ' (copy)' : name;
    const next = prompt('Save as new tactic — name:', suggested);
    if (!next) return;
    name = next.trim();
    if (!name) return;
  }

  const payloadData = {
    formation: current.formation,
    pos: Array.isArray(current.pos) ? current.pos.map(p => [...p]) : null,
    lbl: Array.isArray(current.lbl) ? [...current.lbl] : null,
    slots: { ...(current.slots || {}) },
    subs: [...(current.subs || [])],
    arrows: (current.arrows || []).map(a => ({ ...a })),
    zoneLines: [...(current.zoneLines || [null, null])],
    ballVisible: !!current.ballVisible,
    ballPos: { ...(current.ballPos || { x: 50, y: 50 }) },
    description: current.description || '',
    possession: current.possession || 'in'
  };

  if (current.id && !asNew) {
    const { data, error } = await supabase.from('plays')
      .update({ name, data: payloadData })
      .eq('id', current.id)
      .select().single();
    if (error) { setMsg('Save failed: ' + error.message, 'error'); return; }
    const idx = plays.findIndex(x => x.id === current.id);
    if (idx >= 0) plays[idx] = data;
    editor.current.name = name;
    await logAudit(team.id, 'play', data.id, 'update', { name });
    setMsg(`✓ Saved "${name}"`, 'ok');
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      team_id: team.id,
      name,
      created_by: user?.id || null,
      data: payloadData
    };
    const { data, error } = await supabase.from('plays').insert(payload).select().single();
    if (error) { setMsg('Save failed: ' + error.message, 'error'); return; }
    plays.unshift(data);
    editor.current.id = data.id;
    editor.current.name = name;
    editor.current.created_by = data.created_by;
    _playsUi.selectedId = data.id;
    await logAudit(team.id, 'play', data.id, 'create', { name, from: 'tactics-page' });
    setMsg(`✓ Saved "${name}"`, 'ok');
  }

  setTimeout(() => { if (msg && msg.textContent.startsWith('✓')) msg.textContent = ''; }, 2500);
  _rerenderEditor();
}

// (Old renderPlayPreview + wirePlayEvents removed 2026-04-17 — the Tactics
// page now uses the match-editor pitch + inline editor rather than a
// separate preview-only pv-* pitch.)

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
          <div class="fixtures-headline" style="margin-bottom:0.25rem">
            <div class="muted" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">${prefix} · ${tLbl} · ${haLbl}</div>
            <h2 style="margin:0.15rem 0 0;font-size:1.4rem">${escapeHtml(dateStr)}${opp}</h2>
            ${selected.location_name || selected.location_postcode ? `
              <div class="fix-loc" style="font-size:0.9rem;margin-top:0.25rem">
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
    ${pastHtml ? `<h4 style="margin:1rem 0 0.5rem">Past</h4><div class="lineup-list">${pastHtml}</div>` : ''}
    ${canEdit ? `
      <label style="display:flex;align-items:center;gap:0.35rem;margin-top:0.75rem;font-size:0.8rem;color:#555">
        <input type="checkbox" id="show-drafts" ${_fixturesUi.showDrafts ? 'checked' : ''}> Show draft lineups
      </label>
    ` : ''}
  `;

  const selStatus = selected ? (selected.lineup_status || (selected.published ? 'published' : 'draft')) : 'draft';
  const selShareable = selected && (selStatus === 'availability' || selStatus === 'published');
  const selShareLabel = '📤 Share match';
  // Coach Fixtures tab always shows the pitch; the public parent view gates it separately.
  const showLineup = !!selected;

  tabEl.innerHTML = `
    <div class="fixtures-single">
      <div style="display:flex;flex-direction:column;gap:0.35rem;max-width:560px;margin-bottom:0.5rem">
        ${collapsibleCard('fix-calendar', 'Calendar', calendarBody)}
        ${collapsibleCard('fix-upcoming', 'Matches', upcomingBody)}
      </div>
      ${headline}
      ${selected && canEdit ? `
        <div class="fix-share-wrap" style="max-width:560px;margin:0 0 0.4rem">
          <button class="primary btn-full" id="fix-share-link" style="background:var(--blue-2);color:#fff;border:none;padding:0.65rem 0.8rem;font-weight:600">${selShareLabel}</button>
          <div id="fix-share-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.25rem">${selShareable ? '' : '⚠ Lineup is in Draft — link won\'t work for parents until you switch to Availability or Show lineup.'}</div>
        </div>
      ` : ''}
      ${selected && canEdit && selShareable ? `
        <div id="fix-availability-panel" style="max-width:560px;margin-bottom:0.4rem"></div>
      ` : ''}
      ${selected ? `
        ${selStatus !== 'published' ? `
          <div class="muted fix-status-banner" style="max-width:560px;padding:0.3rem 0.6rem;background:#f7f7f7;border-radius:6px;font-size:0.75rem;margin-bottom:0.35rem">
            ${selStatus === 'availability' ? '◐ Availability mode — parents only see the form, not this pitch.' : '○ Draft — not visible to parents yet.'}
          </div>
        ` : ''}
        <div class="card pitch-card" style="padding:0;border:none;box-shadow:none;margin:0;max-width:100%;width:100%;box-sizing:border-box">
          <div class="pitch" id="fix-pitch">
            <svg class="pitch-lines" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true">${pitchSvgInner()}</svg>
            <div class="slots-layer" id="fix-slots-layer"></div>
            <canvas class="tactics-canvas" id="fix-tactics"></canvas>
            <div class="ball-el" id="fix-ball" style="display:none"></div>
          </div>
          <div class="subs-bar">
            <div class="subs-label" id="fix-subs-label">SUBSTITUTES (0/${MAX_SUBS})</div>
            <div class="subs-row" id="fix-subs-row"></div>
          </div>
        </div>
        ${chipLegendHtml()}
      ` : ''}
    </div>
  `;

  if (selected) renderFixturePitch(selected);
  if (selected && canEdit && selShareable) {
    renderCoachAvailabilityPanel({
      containerId: 'fix-availability-panel',
      lineupId: selected.id,
      cardKey: 'fix-coach-avail'
    });
  }
  // Apply availability rings/badges on the fixture pitch chips too
  if (selected && selShareable) {
    ensureAvailabilityForLineup(selected.id).then(() => applyAvailabilityDecorations());
  } else {
    editor.availability = {};
    applyAvailabilityDecorations();
  }

  // Decorate upcoming + past match cards with response-count pills
  const fixPillIds = [...upcomingList, ...pastList]
    .filter(l => {
      const st = l.lineup_status || (l.published ? 'published' : 'draft');
      return st === 'availability' || st === 'published';
    })
    .map(l => l.id);
  decorateCardsWithAvailabilityCounts(
    '#tab-content .lineup-item[data-fix]',
    'fix',
    fixPillIds,
    players.length
  );

  wireFixtureEvents();
}

// On the parent view, find any unlocked ("my") children in this lineup, highlight their
// chips with a gold ring, and render a friendly notice above the pitch telling the parent
// what position their child is playing. Subs get a softer "can't guarantee equal minutes"
// line so the expectation is clear without sounding brusque.
async function highlightMyChildrenOnPitch(lineup, players) {
  const noticeEl = document.getElementById('pv-child-notice');
  if (!noticeEl) return;
  const unlocked = new Set(getUnlockedPlayers(lineup.team_id) || []);
  if (!unlocked.size) { noticeEl.innerHTML = ''; return; }

  // Look up coach/admin first names so the "not in squad" apology can name them
  let coachNamesForNotice = 'your coach';
  try {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', lineup.team_id)
      .in('role', ['admin', 'coach']);
    const ids = (members || []).map(m => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      const names = (profs || [])
        .map(p => {
          const full = (p.full_name || '').trim();
          if (!full || full.includes('@')) return '';
          const first = full.split(/\s+/)[0];
          return first && !first.includes('@') ? first : '';
        })
        .filter(Boolean);
      if (names.length) coachNamesForNotice = names.join(' or ');
    }
  } catch (e) { /* fall back to "your coach" */ }

  const data = lineup.data || {};
  const slots = data.slots || {};
  const subs = Array.isArray(data.subs) ? data.subs : [];
  const formation = getFormation(data.formation) || FORMATIONS['4-3-3'];
  const lbl = (Array.isArray(data.lbl) && data.lbl.length === formation.lbl.length) ? data.lbl : formation.lbl;
  const pById = id => (players || []).find(p => p.id === id);

  // Build entries for each unlocked child that appears in this lineup
  const entries = [];
  unlocked.forEach(pid => {
    const p = pById(pid);
    if (!p) return;
    // Find slot index
    let slotIdx = null;
    Object.keys(slots).forEach(k => { if (slots[k] === pid) slotIdx = parseInt(k); });
    if (slotIdx !== null) {
      entries.push({ player: p, role: 'slot', position: lbl[slotIdx] || 'the pitch' });
      return;
    }
    if (subs.includes(pid)) {
      entries.push({ player: p, role: 'sub' });
      return;
    }
    entries.push({ player: p, role: 'none' });
  });

  if (!entries.length) { noticeEl.innerHTML = ''; return; }

  // Highlight each child's chip(s) on the pitch and subs bench with a gold ring
  entries.forEach(({ player, role }) => {
    if (role === 'none') return;
    document.querySelectorAll(`.chip[data-player-id="${player.id}"]`).forEach(chip => {
      chip.style.boxShadow = '0 0 0 4px #f4c430, 0 1px 3px rgba(0,0,0,0.4)';
    });
  });

  // Plain-English role descriptions keyed by common position abbreviations
  const POSITION_BLURB = {
    GK: 'goalkeeper — last line of defence, commanding the box',
    SW: 'sweeper — reading the game behind the defence',
    CB: 'centre back — organising the defence and winning aerial duels',
    DEF: 'defender — shielding the goal and winning the ball back',
    LB: 'left back — defending the left flank and pushing forward in attack',
    RB: 'right back — defending the right flank and pushing forward in attack',
    LWB: 'left wing back — up and down the left side all game',
    RWB: 'right wing back — up and down the right side all game',
    DM: 'defensive midfielder — the engine room, breaking up play',
    CM: 'central midfielder — linking defence and attack',
    MID: 'midfielder — linking defence and attack',
    AM: 'attacking midfielder — creating chances between the lines',
    LM: 'left midfielder — driving down the left',
    RM: 'right midfielder — driving down the right',
    LW: 'left winger — taking on defenders and delivering crosses',
    RW: 'right winger — taking on defenders and delivering crosses',
    ST: 'striker — leading the line and finishing chances',
    CF: 'centre forward — leading the line and finishing chances',
    FWD: 'forward — leading the line and finishing chances',
    SS: 'second striker — supporting the forward and causing chaos'
  };

  const arriveStr = lineup.arrival_time || '';
  const koStr = lineup.kickoff_time || '';
  const timeBits = [];
  if (arriveStr) timeBits.push(`arrive <strong>${escapeHtml(arriveStr)}</strong>`);
  if (koStr) timeBits.push(`kick-off <strong>${escapeHtml(koStr)}</strong>`);
  const timeLine = timeBits.length
    ? `<div class="muted" style="margin-top:0.25rem;font-size:0.8rem">Reminder: ${timeBits.join(' · ')}.</div>`
    : '';

  // Build a parent-visible cue chip for the Your Squad card. Read-only
  // rendering — no edit/delete controls. Coach-only cues never reach this
  // client (RLS filters the SELECT on anon users), but we also belt-and-
  // braces filter by visibility here in case a coach is signed in as a
  // team member viewing the public page.
  const focusCuesForParent = (playerId) => {
    const all = cuesForPlayer(lineup.id, playerId) || [];
    return all.filter(c => c.visibility === 'parent_visible');
  };
  const renderParentCueChip = (cue) => {
    const entry = cue.cue_slug ? cueEntry(cue.cue_slug) : null;
    const emoji = entry ? entry.emoji : '📝';
    // Build a "fallback label" from the custom note if the catalog entry is
    // missing (e.g. RLS hasn't returned the catalog yet for anon users, or a
    // coach wrote a custom-note-only cue with no slug). Keep the label tidy:
    // first line, max 40 chars.
    const noteLabelFallback = (cue.custom_note || '').split('\n')[0].slice(0, 40) || 'Focus';
    const label = entry ? entry.label : noteLabelFallback;
    // Show BOTH the catalog description (neutral context explaining the cue)
    // AND the coach's custom note (personalised, italic) whenever both exist.
    // Priority rules:
    //   - Catalog description: always render when available. It's the stock
    //     explanation of what this cue means; parents benefit from context
    //     regardless of whether the coach added a personal note.
    //   - Custom note: render below the description in italic. But if there
    //     was no catalog entry, the note was already used as the label, so
    //     don't repeat it here.
    // Description: prefer the catalog's explicit description, fall back to
    // sub_concept + framework (e.g. "Scanning · Technical corner") so parents
    // still get SOME context even if a seed row shipped without a description.
    // This is belt-and-braces — descriptions should normally be present, but
    // empty-string rows have been observed in seed data.
    const FRAMEWORK_LBL = {
      FA: 'FA Four Corner Model',
      ELM: 'Effort · Learning · Mistakes',
      ROOTS: 'ROOTS',
      TANK: 'Emotional Tank',
      WELFARE: 'Welfare',
      ROLE: 'Role',
      ENCOURAGEMENT: 'Encouragement'
    };
    let desc = '';
    if (entry) {
      if (entry.description && entry.description.trim()) {
        desc = entry.description.trim();
      } else {
        const bits = [];
        if (entry.sub_concept) bits.push(entry.sub_concept);
        if (entry.framework && FRAMEWORK_LBL[entry.framework]) bits.push(FRAMEWORK_LBL[entry.framework]);
        else if (entry.corner) bits.push(`${entry.corner[0].toUpperCase()}${entry.corner.slice(1)} corner`);
        if (bits.length) desc = bits.join(' · ');
      }
    }
    const showNote = cue.custom_note && entry;  // if no entry, note is the label already
    const star = cue.is_primary ? '<span class="pv-focus-star" aria-hidden="true">★</span>' : '';
    return `
      <div class="pv-focus-chip ${cue.is_primary ? 'is-primary' : ''}">
        ${star}
        <span class="pv-focus-emoji" aria-hidden="true">${emoji}</span>
        <div class="pv-focus-text">
          <div class="pv-focus-label">${escapeHtml(label)}</div>
          ${desc ? `<div class="pv-focus-desc">${escapeHtml(desc)}</div>` : ''}
          ${showNote ? `<div class="pv-focus-note">${escapeHtml(cue.custom_note)}</div>` : ''}
        </div>
      </div>`;
  };
  const renderFocusBlock = (player) => {
    const cues = focusCuesForParent(player.id);
    if (!cues.length) return '';
    // Primary first, then the rest — the cached fetcher already orders that
    // way, but re-sort here in case the filter stripped the primary out.
    cues.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    return `
      <div class="pv-focus-block">
        <div class="pv-focus-head">🎯 Coach's focus for this match</div>
        <div class="pv-focus-chips">
          ${cues.map(renderParentCueChip).join('')}
        </div>
      </div>`;
  };

  // Build the notice copy
  const firstName = n => (n || '').split(/\s+/)[0] || 'Your child';
  const lines = entries.map(({ player, role, position }) => {
    const name = escapeHtml(firstName(player.name));
    const focusBlock = role !== 'none' ? renderFocusBlock(player) : '';
    if (role === 'slot') {
      const posKey = (position || '').toUpperCase().replace(/[^A-Z]/g, '');
      const blurb = POSITION_BLURB[posKey] || '';
      const shirt = player.number != null ? ` in shirt <strong>#${player.number}</strong>` : '';
      return `
        <div style="margin:0.25rem 0" class="pv-squad-entry">
          <strong>${name}</strong> is in the starting XI at <strong>${escapeHtml(position)}</strong>${shirt} ⚽
          ${blurb ? `<div class="muted" style="font-size:0.8rem;margin-top:0.15rem">The ${escapeHtml(blurb)}.</div>` : ''}
          <div style="font-size:0.8rem;margin-top:0.15rem">Go get 'em! 💪</div>
          ${focusBlock}
        </div>`;
    }
    if (role === 'sub') {
      return `<div style="margin:0.25rem 0" class="pv-squad-entry"><strong>${name}</strong> is on the bench today and will come on when the coaches make changes. They do their best to rotate minutes across the season, but we can't promise equal playing time every match — thanks for your support 💛${focusBlock}</div>`;
    }
    return `<div style="margin:0.25rem 0" class="pv-squad-entry"><strong>${name}</strong> isn't in the squad for this match — we're really sorry. If you'd like to chat with the coaches about this, please catch <strong>${coachNamesForNotice}</strong> at the next training session. 💙</div>`;
  }).join('');

  noticeEl.innerHTML = `
    <div class="pv-card" style="border-left:4px solid #f4c430;background:#fffbea">
      <div style="font-size:0.75rem;font-weight:700;color:#8a6a00;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem">Your squad</div>
      ${lines}
      ${timeLine}
    </div>`;
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

  // Render slots using the same markup as the Lineups page (.slot / .chip-slot)
  const slotsLayer = document.getElementById('fix-slots-layer');
  if (slotsLayer) {
    slotsLayer.innerHTML = pos.map(([x, y], i) => {
      const pid = slots[i];
      const p = pid ? pById(pid) : null;
      const label = lbl[i] || '';
      const inner = p
        ? `<div class="chip-wrap">
             <div class="chip chip-slot ${p.photo_url ? 'has-photo' : ''}" data-player-id="${p.id}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
               ${p.photo_url ? '' : `<div class="chip-inner">
                 ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                 <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
               </div>`}
             </div>
             ${p.photo_url ? `<div class="chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
           </div>`
        : `<div class="slot-label">${escapeHtml(label)}</div>`;
      return `
        <div class="slot ${p ? 'filled' : ''}" style="left:${x}%; top:${y}%">
          ${inner}
          <div class="slot-pos-lbl">${escapeHtml(label)}</div>
        </div>`;
    }).join('');
    applyMatchDecorations(slotsLayer, d.motm, d.goalscorers, lineup.team_id, lineup.id);
  }

  // Render subs using the same .subs-row / .sub-slot markup — all MAX_SUBS cells (filled + empty)
  const subsRow = document.getElementById('fix-subs-row');
  const subsLabel = document.getElementById('fix-subs-label');
  if (subsRow) {
    const filledCount = subs.filter(Boolean).length;
    const cells = [];
    for (let i = 0; i < MAX_SUBS; i++) {
      const pid = subs[i];
      const p = pid ? pById(pid) : null;
      cells.push(`
        <div class="sub-slot ${p ? 'filled' : ''}" data-sub="${i}">
          ${p
            ? `<div class="chip-wrap">
                 <div class="chip chip-sub ${p.photo_url ? 'has-photo' : ''}" data-player-id="${p.id}"${p.photo_url ? ` style="background-image:url('${escapeHtml(p.photo_url)}')"` : ''}>
                   ${p.photo_url ? '' : `<div class="chip-inner">
                     ${p.number != null ? `<div class="chip-num">${p.number}</div>` : ''}
                     <div class="chip-name">${escapeHtml(shortName(p.name))}</div>
                   </div>`}
                 </div>
                 ${p.photo_url ? `<div class="chip-caption">${p.number != null ? `<span class="cc-num">${p.number}</span> ` : ''}${escapeHtml(shortName(p.name))}</div>` : ''}
               </div>`
            : `<div class="sub-empty">+</div>`}
        </div>`);
    }
    subsRow.innerHTML = cells.join('');
    if (subsLabel) subsLabel.textContent = `SUBSTITUTES (${filledCount}/${MAX_SUBS})`;
    applyMatchDecorations(subsRow, d.motm, d.goalscorers, lineup.team_id, lineup.id);
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
  if (shareBtn) shareBtn.onclick = () => {
    const id = _fixturesUi.selectedLineupId;
    if (!id) return;
    openShareModal({ lineupId: id, opener: shareBtn });
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

  // Admin-only team switcher strip — shows every team the user is a member of
  // (highlighting the current one), plus a + Create new team card. Click any
  // card to switch teams from right here without bouncing to the picker.
  const userTeams = await getUserTeams(currentUser);
  const switcherHtml = isAdmin ? (() => {
    const cardsHtml = userTeams.map(m => {
      const t = m.teams || {};
      const ag = ageGroupLabel(t);
      const active = t.id === team.id;
      const roleLabel = m.role === 'admin' ? 'Admin' : m.role === 'coach' ? 'Coach' : m.role === 'parent' ? 'Parent' : escapeHtml(m.role);
      const roleCls = m.role === 'admin' ? 'me-match-status-published' : 'me-match-status-availability';
      return `
        <div class="me-match-card th-team-card am-team-card ${active ? 'active' : ''}" data-am-team="${t.id}">
          <div class="mc-date mc-tactic-icon" aria-hidden="true"><span class="mc-tactic-emoji">⚽</span></div>
          <div class="mc-body">
            <div class="me-match-title">${escapeHtml(t.name || '—')}${active ? ' <span class="muted" style="font-weight:400;font-size:0.78rem">(current)</span>' : ''}</div>
            <div class="me-match-meta lineup-meta">${ag ? ag + ' · ' : ''}Role: ${roleLabel}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.2rem">
            <div class="me-match-status ${roleCls}">${roleLabel}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="card">
        <h3 style="margin:0 0 0.5rem">Your teams</h3>
        <p class="muted" style="margin:0 0 0.75rem;font-size:0.85rem">Click a team to switch to it, or create a new one.</p>
        <div class="me-matches-grid">
          ${cardsHtml}
          <button type="button" class="me-match-card me-match-new am-new-team">
            <div class="me-match-new-ico" aria-hidden="true">+</div>
            <div class="me-match-new-label">Create new team</div>
          </button>
        </div>
      </div>
    `;
  })() : '';

  // Share the team's public player-card link. The URL is team-wide — parents
  // / kids enter each child's personal access code (or family code) to unlock
  // their specific card. Convenient place for admins to grab + share on the
  // group chat.
  const cardShareHtml = isAdmin ? `
    <div class="card">
      <h3 style="margin:0 0 0.5rem">Share the team's stats-card link</h3>
      <p class="muted" style="margin:0 0 0.6rem;font-size:0.85rem">One public link per team. Each player unlocks their own card with their personal access code (or family code for siblings). Grab codes from the Squad tab.</p>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">
        <input type="text" readonly id="am-card-url" value="${escapeHtml(location.origin + location.pathname + '#/card/' + team.id)}"
          style="flex:1;min-width:200px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-family:ui-monospace,Menlo,Consolas,monospace" />
        <button type="button" class="btn-secondary" id="am-card-copy" style="padding:0.4rem 0.75rem">📋 Copy</button>
        <button type="button" class="btn-secondary" id="am-card-open" style="padding:0.4rem 0.75rem">Open ↗</button>
      </div>
      <div id="am-card-msg" class="muted" style="font-size:0.75rem;min-height:1em;margin-top:0.35rem"></div>
    </div>
  ` : '';

  tabEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;padding:1rem;max-width:900px">
      ${switcherHtml}
      ${cardShareHtml}
      <div class="card">
        <h3 style="margin:0 0 0.5rem">Invite someone <span class="muted" style="font-weight:400;font-size:0.82rem">to ${escapeHtml(team.name)}</span></h3>
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

  // Team switcher cards on the Admin panel — click a team to switch to it.
  if (tabEl) {
    tabEl.querySelectorAll('[data-am-team]').forEach(card => {
      card.onclick = async () => {
        const nextTeam = card.dataset.amTeam;
        if (!nextTeam || nextTeam === team.id) return;
        try { await flushAutosave(); } catch (_) {}
        activeTab = 'members'; // stay on the Admin tab after the switch
        openCards.clear();
        location.hash = `#/team/${nextTeam}`;
      };
    });
    // + Create new team card
    const newTeamBtn = tabEl.querySelector('.am-new-team');
    if (newTeamBtn) newTeamBtn.onclick = () => openCreateTeamModal(currentUser, async () => {
      // Refresh the Admin tab so the new team appears in the strip (doesn't auto-switch).
      renderMembersTab(currentUser);
    });

    // Team-wide stats-card link — copy / open helpers.
    const cardUrlInput = tabEl.querySelector('#am-card-url');
    const cardCopyBtn = tabEl.querySelector('#am-card-copy');
    const cardOpenBtn = tabEl.querySelector('#am-card-open');
    const cardMsg = tabEl.querySelector('#am-card-msg');
    if (cardCopyBtn && cardUrlInput) cardCopyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(cardUrlInput.value);
        if (cardMsg) { cardMsg.textContent = '✓ Link copied — paste into WhatsApp with each child\'s access code.'; cardMsg.className = 'ok'; setTimeout(() => { cardMsg.textContent = ''; cardMsg.className = 'muted'; }, 3500); }
      } catch (_) {
        cardUrlInput.select(); document.execCommand('copy');
        if (cardMsg) { cardMsg.textContent = '✓ Copied'; cardMsg.className = 'ok'; setTimeout(() => { cardMsg.textContent = ''; cardMsg.className = 'muted'; }, 2500); }
      }
    };
    if (cardOpenBtn && cardUrlInput) cardOpenBtn.onclick = () => {
      window.open(cardUrlInput.value, '_blank', 'noopener');
    };
  }

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
