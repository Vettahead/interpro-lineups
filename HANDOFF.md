# Interpro Coach / Manager Assistant — Handoff (2026-04-17)

## 🔖 Where we left off on 2026-04-17 (session 7 — read this first)

Huge session. Admin/team UX overhaul, age-group field, **public player card page** (FIFA-style), plus a queue of polish fixes. Roadmap: next up is the **badges & achievements system** (full brief at the bottom).

### Shipped this session (session 7)

1. **Team-picker page rebuilt** (`renderTeamsHome`). Card grid using the same `.me-match-card` skeleton as matches; each card shows team name + role + age group chip. Dashed **+ Create new team** card at the end. Renders the desktop sidebar (via new `renderTeamsHomeSidebar`) with a user badge + Sign out at the bottom — no more "trapped, 2 headers" experience.

2. **Single-team coach auto-load.** On sign-in, if the user has exactly 1 team AND their role there isn't `admin`, we hash-redirect straight into that team. Admins and multi-team users still see the picker. `opts.force` bypasses this so the Switch team button doesn't bounce back. Logic lives at the top of `renderTeamsHome`.

3. **Switch team in sidebar + drawer** (`__switchteam` pseudo-tab). Visible only when the user has >1 team OR is admin anywhere (`userCanSwitchTeams(memberships)`). Clicks clear the hash, returning to the picker.

4. **Admin panel expanded — Option A.** Horizontal card grid at the top showing every team the user is admin of (current team tinted indigo + "(current)" tag), click any to switch. `+ Create new team` dashed card at the end. Below: a **stats-card share** box (copy link / open ↗) only visible to admins, then the existing invite + member management UI.

5. **Age group field on teams + auto-bump.** New columns `teams.age_group` (INT 7..18) + `teams.age_group_season_year` (INT). Helper pair: `computeCurrentSeasonStartYear(date)` returns the current season's start year (flips on 7 June), and `effectiveAgeGroup(team, date)` adds `(currentSeasonStart - storedSeasonStartYear)` to the stored age so the display auto-bumps after the season ends. `ageGroupLabel` returns "U13s" format. Displayed in: team picker cards, sidebar subtitle (desktop), drawer head (phone), Squad details → Team info, team-create modal. All DB reads/writes fall back gracefully to name-only when the columns aren't migrated yet.

6. **Squad page → Squad details** with sub-tabs. Sidebar/drawer label renamed. Two sub-tabs (Team info / Squad) backed by `_squadSubTab` module var + CSS filter rules `.squad-details-layout[data-squad-tab="..."]`. Team info tab holds team-name + age-group dropdown + Home-ground card. Squad tab holds add-player form + filter + player grid. Sub-tab choice persists across re-renders so changing a filter doesn't bounce you back.

7. **Mobile match-editor reorder.** On ≤899px the match editor's body (`.match-editor-body`) goes from grid to flex column with source order: top-strip (result card + availability bar + phone status row + Enter result button) → pitch → sub-tabs. Desktop layout unchanged (new `grid-template-rows: auto 1fr` with pitch spanning both rows in column 1). Mobile padding tightened on all top-strip children. Photo "vanished on mobile" follow-up: added `align-items: stretch` (overriding the desktop `start`) and explicit `width: 100%` on the three direct children so they fill the flex column width.

8. **Team-creation permission model — client + server.** Client-side (`renderTeamsHome`, admin panel): `+ Create new team` only visible when user has zero teams OR admin role in any team. Coaches and parents with 1+ teams see a copy explaining "Only admins can create new teams". Server-side: new RLS policy `teams_insert_admin_or_new` replaces the previous permissive one — `WITH CHECK (created_by = auth.uid() AND (EXISTS admin role somewhere OR NOT EXISTS any team_members row))`. SQL captured in session 7 summary below.

9. **Public player card page** (`#/card/{team_id}`). FIFA Ultimate Team style, using `web/GOLD_FIFA_22.png` as the card background. Unlocked by access code (personal or family) via new SECURITY DEFINER RPC `get_player_by_code(team_id, code)` (returns jsonb array so family codes unlock all siblings at once). LocalStorage persists the unlock keyed by team id; ✕ Forget button clears it. Family codes show a sibling switcher chip row. Season selector via ← / → arrow buttons; defaults to the most recent season with any played matches. Stats aggregated client-side from lineups (matches with `lineup_status IN ('availability','published')` — existing RLS allows anon). Stats: **Goals · MOTM · Starts · Subs · Apps · W-D-L**. W-D-L uses the team's FT result on matches where the player featured. On the card route, body class `.public-card-view` hides the app header / sidebar / drawer so it's a clean public page.

10. **FIFA card styling iterations.** Full `GOLD_FIFA_22.png` swap from CSS-drawn trim. Arial Black stack at weight 900 throughout (no Georgia serif). Shirt number column pushed inward (`left: 16%`) to clear the PNG's top notch. Player photo now a **circle** (`width: 42%; aspect-ratio: 1/1; border-radius: 50%`) with gold medallion ring (outer box-shadow: 3px gold + 1px white lift + drop shadow), positioned at `top: 10%; right: 13%` — guarantees it never protrudes past the notch or the horizontal divider. Name at top 52%, stats grid at 62%→88% with 14% left/right padding for breathing room. 2×3 stat grid, each cell: value (1.55rem) + short label (1.05rem, uppercase).

11. **Stats-card share buttons.** Per-player in Squad tab's player modal → "🎴 Share stats card (WhatsApp)" opens WhatsApp with name + card URL + access code pre-filled. Team-wide in Admin → readonly URL input + 📋 Copy + Open ↗ buttons.

12. **FAQ + in-app Help updates.** FAQ expanded with team-picker changes, Squad details split, age group behaviour, team creation rules, public card page + share flow. HELP_SECTIONS mirror this.

### SQL to run in Supabase (session 7)

```sql
-- (a) Age group columns on teams (if not already done in session 6).
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS age_group INT,
  ADD COLUMN IF NOT EXISTS age_group_season_year INT;
ALTER TABLE teams
  ADD CONSTRAINT teams_age_group_chk
  CHECK (age_group IS NULL OR (age_group BETWEEN 7 AND 18));
-- Backfill Blues team to U13 for 2025-26:
UPDATE teams SET age_group = 13, age_group_season_year = 2025 WHERE age_group IS NULL;

-- (b) Team-creation permission (replaces whatever permissive policy was there).
-- Run first: SELECT policyname FROM pg_policies WHERE tablename='teams' AND cmd='INSERT';
-- Then DROP the matching policy by name, then:
CREATE POLICY "teams_insert_admin_or_new"
  ON teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND role = 'admin')
      OR NOT EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
    )
  );

-- (c) Public player card unlock RPC.
CREATE OR REPLACE FUNCTION public.get_player_by_code(
  p_team uuid,
  p_code text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH norm AS (
    SELECT upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) AS c
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id, 'name', p.name, 'number', p.number,
      'position', p.position, 'photo_url', p.photo_url
    )
    ORDER BY p.number NULLS LAST, p.name
  ), '[]'::jsonb)
  FROM players p, norm
  WHERE p.team_id = p_team
    AND norm.c <> ''
    AND (upper(p.access_code) = norm.c OR p.family_code = norm.c);
$$;
GRANT EXECUTE ON FUNCTION public.get_player_by_code(uuid, text) TO anon, authenticated;
```

All three are **already run** on the Supabase instance — included here for the next machine's record.

### Files touched (session 7)
- `web/app.js` — massive rewrite across `renderTeamsHome` / `renderTeamsHomeSidebar` / `renderDesktopSidebar` / `renderNavDrawer` / `renderMembersTab` / Squad rebuild / card page (`renderPlayerCardPage`, `renderPlayerCardBody`, `_cardState`, `_loadCardUnlocks` / `_saveCardUnlocks` / `_clearCardUnlocks`) / stats helpers (`computePlayerStats`, `availableSeasonsFromLineups`, `seasonLabelForYear`) / age-group helpers (`computeCurrentSeasonStartYear`, `effectiveAgeGroup`, `ageGroupLabel`, `AGE_GROUP_OPTIONS`) / `openCreateTeamModal` / `getUserTeams` cache / `userCanSwitchTeams` / squad sub-tab state (`_squadSubTab`) / mobile body reorder HTML / share-card buttons / `renderUserBar` is unchanged / route `#/card/{team_id}` wired in `currentRoute()` + `render()`.
- `web/styles.css` — team-picker (`.teams-home`, `.th-*`), admin team cards (`.am-*`), public card chrome (`.player-card-wrap`, `.pc-*`), FIFA card using `GOLD_FIFA_22.png` as background, `.public-card-view` chrome hide, Squad details sub-tab filter rules, mobile match-editor flex column override.
- `web/FAQ.md` — new sections for team picker / Squad details / age group / stats card; coach workflow updated.
- `web/HANDOFF.md` — this entry.
- `web/GOLD_FIFA_22.png` — FIFA 22 gold card template added to `web/` (Chris dropped it in).

### Sanity-check script (session 7)
1. **Team picker:** sign out and back in as Chris → picker shows Blues card with "U13s · Admin" + dashed create card. Sidebar on desktop shows logo head + user badge + Sign out.
2. **Auto-load:** if a coach-only account with 1 team signs in, they should skip the picker and land directly on that team.
3. **Switch team:** admin with 1 team — Switch team shortcut visible in sidebar. Tap → back at picker. Pick Blues → back in.
4. **Age group:** Squad details → Team info → change U13 to U14 → save → header subtitle reflects. On 7 June 2026 the displayed group auto-bumps to U14 even if age_group is still 13 stored.
5. **Team-creation gate:** sign in as a non-admin coach with 1 team → picker doesn't show the + Create new team card. Open a SQL console, attempt an INSERT into teams as them → rejected.
6. **Match editor on phone:** open a match → availability bar / status / Enter result sit ABOVE the pitch, pitch, then sub-tabs below. No jank, pitch shows.
7. **Public card:** open `/#/card/{team_id}` on your phone → cream background, no app header. Enter JE1234 → card renders with the GOLD_FIFA_22.png background, circular photo in upper-right, number + Interpro crest in upper-left column, name on the divider, 6 stats at the bottom. Left/right arrows cycle seasons.
8. **Share flow:** Squad → open Orin's modal → tap 🎴 Share stats card → WhatsApp draft opens with the URL + OE's access code. Paste-able.
9. **Admin team-wide share:** Admin tab → Share the team's stats-card link card → 📋 Copy works, Open ↗ opens a new tab.

### Start-here on the new machine (session 7)
Push `web/app.js`, `web/styles.css`, `web/FAQ.md`, `web/HANDOFF.md`, `web/GOLD_FIFA_22.png`. The 3 blocks of SQL above have already been run on Supabase — no migration pending.

**Next up** — **Badges & achievements system (Slice 9).** Full brief immediately below.

---

## 🔖 NEXT UP: Slice 9 — Badges & achievements

Chris wants a FIFA Ultimate Team-style badge layer over the player stats so kids can collect achievements across the season — some auto-awarded from match data, some coach-awarded for effort / attitude / fun. Brief captured 2026-04-17.

### Two flavours

- **Auto badges** — derived on the fly from lineup data. No storage, always stays accurate when a match's result is edited. Criteria run against the player's stats helpers. Examples: Goal Machine, Hat Trick Hero, On Fire, Debut, 10 games, Ever-Present, Supersub.
- **Manual badges** — coach picks for things data can't see. Examples: Coach's Choice, Training Star, Fair Play, Nutmeg King, Best Celebration, Leader, Buddy Badge.

### Schema (manual)

```sql
CREATE TABLE player_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lineup_id uuid REFERENCES lineups(id) ON DELETE SET NULL,
  season_start_year int,
  note text
);
CREATE INDEX player_badges_player_idx ON player_badges(player_id);
CREATE INDEX player_badges_team_idx   ON player_badges(team_id);
-- RLS: anon read when team has published lineups; coaches/admins insert/delete
-- on their team; no one updates (re-award to refresh).
```

### Central catalog (client)

One `BADGE_CATALOG` object in `app.js` keyed by slug. Each entry: `{ name, description, emoji/icon, category, flavour: 'auto'|'manual', criteria?: fn }`. Categories: `attacking` · `skill` · `defending` · `attitude` · `teamwork` · `fun` · `milestone`. Both the card (public) and the Squad badge-award modal read from this single source.

### Full starter catalog (auto = derivable from existing data NOW, unless otherwise noted)

**🔥 Attacking & Scoring**
- `on_fire` — Scored in 3 matches in a row (auto)
- `goal_machine` — 5 goals this season (auto)
- `hat_trick_hero` — 3+ goals in one match (auto)
- `brace` — 2 goals in one match (auto)
- `opening_night` — First goal of the season (auto)
- `clinical_finisher` — 3 goals from first-time shots (manual — no shot-type data)
- `poacher` — Scores from rebounds / tap-ins (manual)
- `long_shot_legend` — Goal from outside the box (manual)
- `weaker_foot_hero` — Goal with weaker foot (manual)
- `first_blood` — Scores match's opening goal (NEEDS goal-order data — manual for now)
- `ice_cold` — Scores under pressure (pen / late equaliser) (manual)
- `playmaker` — 3 assists in 3 matches (NEEDS assists data — Phase 9c)
- `assist_king` — 5 assists total (same)
- `solo_star` — Beats 2+ players before scoring (manual)
- `top_scorer` — Season top scorer (auto, season end)
- `winning_goal` — Scored the match-winning goal (NEEDS goal-order — manual)

**⚡ Speed, Skill & Physical**
- `speedster` / `lightning_bolt` / `engine` / `dribble_king` / `two_footed` / `balance_master` / `agility_ace` / `shield_wall` — all manual (no GPS / event tracking)
- `wingman` — consistent performer on the wing (manual)
- `tireless` — played 90+ mins multiple matches (manual)

**🧱 Defending & Goalkeeper**
- `brick_wall` — 3 clean sheets in a row (auto, GK or defender — needs derived "clean sheet" = played + opp_score_ft == 0)
- `iron_defence` — 5+ clean sheets in a season (auto)
- `golden_glove` — fewest goals conceded (auto, season end, GK only)
- `safe_hands` / `shot_stopper` / `sweeper_keeper` / `last_line_hero` / `tackle_master` / `interceptor` / `no_nonsense` / `captain_of_the_back_line` / `fearless` — all manual
- `goal_line_hero` / `last_ditch_hero` — manual

**🧠 Effort, Attitude & Coach's Choice**
- `never_give_up` / `training_star` / `coaches_choice` / `comeback_kid` / `focus_pro` / `resilience` / `calm_head` / `growth_mindset` — all manual
- `consistency_king` — reliable every week (auto: plays in ≥ 90% of matches, scores in ≥ 30%, etc. — defined numerically)
- `ever_present` — played every match of the season (auto)
- `bounce_back` — best improvement after a bad game (manual)
- `training_ground_gem` — manual

**🤝 Teamwork & Sportsmanship**
- All manual: `team_player` / `helper` / `fair_play` / `leader` / `communicator` / `unsung_hero` / `high_five_hero` / `respect_badge` / `buddy_badge` / `handshake_hero` / `squad_boost`

**🎉 Fun & Seasonal**
- `nutmeg_king` / `celebration_star` / `rainbow_rocket` / `thunder_boot` / `rain_warrior` / `smile_maker` / `boot_collector` / `hair_of_the_match` — manual
- `golden_boot_mini` — monthly top scorer (auto — bucket by calendar month)
- `super_sub` — scored after coming off the bench in same match (auto — player in `subs` but has a goalscorer entry)
- `early_bird` — always on time (manual)
- `lucky_charm` — team unbeaten when this player plays (auto)
- `birthday_boy` / `birthday_girl` — match on their birthday (NEEDS player DOB — manual for now)
- `debut_day` — first match for the team (auto — earliest-dated appearance)

**🏆 Milestones** (all auto)
- `debut_match` — played first match (same as `debut_day`; canonical)
- `games_10` / `games_25` / `games_50` / `games_100`
- `goals_1` / `goals_10` / `goals_25` / `goals_50`
- `motm_1` / `motm_5` / `motm_10`
- `clean_sheets_1` / `clean_sheets_5` / `clean_sheets_10` (GK/def)

### UI surfaces

1. **Public card** — new row of up to 6 earned badge icons under the stats grid. Tap icon → bottom sheet with name + description + date awarded (or "auto" for derived). "See all" expands a scrollable modal grid. Season selector applies (badges earned in that season only, with an "all-time" toggle).
2. **Squad tab player modal** — new "Badges" card: earned badges at top (icons + names) + an "Award badge…" button that opens a searchable modal of manual badges grouped by category. Admin/coach can also remove a manual badge from the list.
3. **Result wizard** — extend to 5 steps: HT · FT · Goalscorers · MOTM · **Badges**. Step 5 auto-detects badges earned this match (Hat Trick Hero, Supersub, etc.) + shows quick-pick chips for common manual ones (Coach's Choice, Fair Play, Never Give Up). Tap to award, they land in `player_badges` with `lineup_id` set.
4. **Admin / season summary** (Slice 10?) — badge leaderboard per team.

### Rollout phases

- **9a — Manual badges only** (2-3 hours). SQL + catalog + award modal + display on card + squad modal + share-to-WhatsApp with new badge. Ship fast so kids get the experience immediately.
- **9b — Auto-derived badges** (pure computation, ~2 hours). Milestones + match-pattern detection layered in.
- **9c — Assists tracking.** Add step 3.5 to result wizard: "Assists" picker same pattern as Goalscorers. Unlocks Playmaker + Assist King.
- **9d — Freshness signals.** "NEW!" chip on just-earned badges (within N days). Push-style "You earned [Badge Name]!" banner when a kid opens their card and has a new one.
- **9e — Seasonal resets + awards.** End-of-season badges auto-finalise (Golden Boot, Golden Glove, Top Scorer, Player of the Season — the last one is coach-voted).

### Decisions needed from Chris before building 9a

- Icon set — emoji (🔥⚡🧱🧠🤝🎉🏆) vs custom SVG set vs a royalty-free icon font (e.g., Font Awesome).
- Maximum badges shown on card at once (I'd say 6 with overflow).
- Should manual badges have an optional "reason" note visible on the card, or is it admin-only?

---

## 🔖 Where we left off on 2026-04-17 (session 6 — read this first)

Big session. Matches list hygiene, Plays retired as a concept and rebuilt as **Tactics** with a full inline editor, Formations got its own top-level page, and a player-placements-with-formation feature shipped with a visual indicator. FAQ + in-app Help brought fully in sync.

### Shipped this session (session 6)

1. **Matches list — played games move to Past + colour-coded outlines.** Split now uses `matchHasBeenPlayed(l)` instead of `game_date < today`, so a match dated today flips to Past the moment its kickoff time passes (`renderLineupsTab`, the `_upcoming` / `_past` fork). Card outlines and badges:
   - Green outline: played + result recorded
   - Red outline + "⚠ Needs score" chip: played + no result yet
   - Neutral / orange (active) otherwise
   Chips/colour rules are both in `_matchCardHtml` (`app.js`) and CSS (`.me-match-card.done` / `.needs-score` in `styles.css`).

2. **Plays → Tactics rename (sidebar + drawer + tablet strip + global +).** Internal route key still `plays` / table still `plays` — only visible labels + Help copy changed. Data-model rename is a future chore if wanted.

3. **Match editor Formation sub-tab → read-only.** Removed ✎ Edit positions / 💾 Save formation / ➕ Save as new / ✕ Cancel buttons from `formationPanelHtml` inside `renderLineupsTab`. Kept the tactics collapsible card (arrows/ball/zones) there because those belong with the match, not the formation template. Short note added: "Pick a formation. To edit or save a new one, use the Formations tab."

4. **Formations top-level page rebuilt from a bare placeholder into a full editor.** New `renderFormationsTab()` + `wireFormationsEvents()` (just above `renderLineupsTab`). Same pitch-left + sub-tabs-right skeleton as the match editor, trimmed to two sub-tabs:
   - **Formation** — formation list, always-visible `✎ Edit formation` / `💾 Save formation` / `➕ Save as new formation…` buttons.
   - **Squad** — player palette.
   Extracted the old inline pos-edit handlers into a shared `wirePosEditingHandlers()` (sits just above `wirePositionEditing`) so the same toggle/done/cancel/save/save-as-new logic backs both pages via `_rerenderEditor()` mode dispatch. Save handlers fall back to the current formation's `pos`/`lbl` when not in edit-positions mode, so you can drop players + hit Save without needing to enter Edit mode first. New `newFormationState()` for `editor.current` when `editor.mode === 'formation'`. `renderSubsBar` null-guards missing `#subs-row` (no subs on Formations page).

5. **Players-with-formation feature.** On Save formation / Save as new on the Formations page, if there are any players on the pitch the coach gets a prompt: "Remember the N player placements on the pitch with this formation? OK — save players too, Cancel — shape only." Accepted placements are stored as `formations.data.players = { slotIdx: playerId }`. `allFormations()` now exposes `_hasPlayers` + `_playerCount` so callers can paint a visual indicator. New CSS class `.f-players-badge` renders a small `👥N` indigo pill on the formation button; `.f-btn-has-players` tints the button's left border indigo.

6. **Players-with-formation works on the match editor too.** The formation-click handler in `wireLineupEvents` now checks for stored players when the coach picks a formation:
   - Empty pitch → load them silently.
   - Pitch has players → confirm prompt before replacing (OK replaces, Cancel keeps current players + shape-only).
   Badge shown in both places (Formations page + match editor's Formation sub-tab).

7. **Formation buttons switched from floats to flex.** `.f-btns-col .f-btn` now `display: flex; gap: 0.55rem`; formation name wrapped in `<span class="f-label">` (flex 1, ellipsis); badge + delete X sit at the right. Fixes the issue where `float:right` on the badge was competing with `float:right` on the delete button, putting the badge next to the name instead of on the right.

8. **Tactics top-level page rebuilt from 2-column sidebar-and-preview into pitch + 4-sub-tab editor.** New `renderPlaysTab()` (~200 lines) + `wireTacticsPageEvents()` + `saveTactic(asNew)` replace the old `renderPlayPreview` / `wirePlayEvents` / `pv-*` preview pitch scaffolding (all removed). Four sub-tabs:
   - **Tactics** — card grid, filter (All / In / Out), + New tactic button. Cards show name, formation, In/Out chip. Click → load into editor + jump to Tactic details.
   - **Squad** — palette.
   - **Moves** — the draw/layout tools: ✎ Edit positions at top (with its own separator), Move/Click/Drag/⚽ Ball, press/def sliders, Clear arrows / Clear all.
   - **Tactic details** (internal key `edit`) — Name, In/Out possession radio, Description, formation picker, Save / Save as new / Delete, status msg.
   Styling: new CSS classes `.me-match-status-in`, `.me-match-status-out`, `.mc-tactic-icon` (blue square with 📋), `.tac-label`, `.tac-input` plus data-phone-tab filter rules for `tactics`, `moves`, `edit`. `_playsUi` gained `subTab`. `_rerenderEditor()` extended to dispatch `'play'` → `renderPlaysTab()`. Global `+` → New tactic now lands directly on Tactic details with the name field focused.

9. **Save-as-play modal → Save-as-tactic with a possession radio.** Swapped the possession `<select>` for a radio pair. Button labels say "Save tactic". No data-model change (already stores `data.possession`).

10. **Drag/drop jank fix — `refreshAfterChipMove()`.** Every pitch drop used to trigger a full `renderLineupsTab()` which rebuilt the entire Matches/Info/Formation/Subs/etc. DOM; the right-hand panel visibly re-aligned on every drop. Now a targeted refresh: `renderPitch()`, `renderSubsBar()`, subs-count label update, `#palette` innerHTML rebuild, re-apply availability + MOTM/goal decorations, `scheduleAutosaveIfPublished()`. All 4 drop-related renderLineupsTab calls (handleDropToSlot, handleDropToSub, handleDropToPalette, player-picker remove) routed through the new helper. Zero touched DOM outside the pitch column + palette.

11. **Auto-load closest match + 24h post-KO grace.** Opening the Matches tab no longer lands on a blank "+ New" state — it auto-selects the closest match via new helper `_findDefaultLineupId(lineups)`. Future matches are always eligible; past matches are eligible only if kickoff was ≤24h ago. Pick is by smallest `|dist-from-now|`. The hydration branch in `renderTeamDashboard` now expands `chosen` into a full `editor.current` and lands on the Squad sub-tab.

12. **Enter result button + 4-step result wizard.** New `openResultWizard()` just above `openMatchDetailsModal`. Steps: HT → FT → Goalscorers (add-one-at-a-time, matchday squad picker, live mismatch warning) → MOTM (add-one-at-a-time, optional Why? reason per row, joint-MOTM supported, already-selected disabled in picker). Wizard uses local state, commits to `editor.current` only on Save, then `scheduleAutosaveIfPublished`. Button: `#me-enter-result`, rendered above the sub-tab strip only when `matchHasBeenPlayed(current)`; collapses into a small green `✎ Edit` pill inside the compact result card once a result exists. Inline Result section inside `✎ Edit match` left in place as a fallback.

13. **Availability bar flicker fix.** Bar used to render as an empty `<div id="availability-panel">` with `renderCoachAvailabilityPanel()` filling it ~100–500ms later via a Supabase fetch → visible layout shift. Now rendered synchronously from the in-memory `editor.availability` cache inside `renderLineupsTab` via `_availTallyBtnHtml()`. Async DB fetch still happens and replaces the same-sized button with fresh counts — no height change. Stale-cache handling: if `editor._availabilityFor !== current.id`, treat cache as empty so we don't briefly show the previous match's numbers. Click handler wired synchronously in `wireLineupEvents` so the button is active from frame one.

14. **Wizard-save sub-tabs scroll-into-view.** After the result wizard saves, tab-content + window scroll to top so the sub-tab strip is immediately visible (was being pushed below the fold on phone by the newly-appearing result card).

15. **Label margin fix on HT/FT wizard inputs.** Global `.map-modal-body label { margin-top: 0.5rem; }` was adding vertical offset to the second `<label>` in the grid (the `:first-child` override exempted the first). Second input sat lower than the first. Fixed by adding `margin:0` inline to the step-1/step-2 grid labels.

16. **CSS overflow fix on Enter-result button.** Added `box-sizing: border-box` so the `width:100%` + padding combination no longer pushes content past its column edge.

17. **FAQ + in-app Help (HELP_SECTIONS) fully refreshed** to cover all the above: new Formations help entry, rewritten Tactics entry, rewritten Match-editor entry (auto-load, card outlines, result wizard, formation read-only pointer), workflow step 6 now describes the wizard path, roadmap gained the parent season page.

### SQL to run in Supabase before deploy
**None.** All new features ride on existing columns:
- `formations.data.players` is a new key in the existing JSONB — no column change.
- Tactics / possession already stored in `plays.data.possession`.
- Result fields (`our_score_ht/opp_score_ht/our_score_ft/opp_score_ft` + `data.goalscorers` + `data.motm`) all landed in session 3.

### Files touched (session 6)
- `web/app.js` — drag-drop refactor + result wizard + auto-load helper + sidebar rename + match editor Formation read-only + new `renderFormationsTab` / `wireFormationsEvents` / `wirePosEditingHandlers` / `newFormationState` / `_findDefaultLineupId` / `openResultWizard` / `saveTactic` / `_rerenderEditor` + rewrite of `renderPlaysTab` + save-as-tactic radio + Upcoming/Past split + card colour classes + availability flicker fix + players-with-formation logic + `allFormations` `_hasPlayers` + flex-layout formation buttons with `f-label` span + HELP_SECTIONS refresh.
- `web/styles.css` — `.me-match-card.done` / `.needs-score` + Tactics sub-tab filter rules + `.me-match-status-in` / `-out` + `.mc-tactic-icon` / `.mc-tactic-emoji` + `.tac-label` / `.tac-input` + `.f-players-badge` / `.f-btn-has-players` + flex layout on `.f-btns-col .f-btn` + `.f-label` ellipsis rule.
- `web/FAQ.md` — dashboard sidebar list, +menu item names, match-editor sub-tab descriptions, new "What match do I land on?" / "Card outline colours" / "Matches list + green/red" paragraphs, Result section rewritten around wizard, Plays section replaced with new Formations + Tactics sections, coach workflow step 6 rewritten, roadmap expanded.
- `web/HANDOFF.md` — this entry.

### Sanity-check script (session 6)
1. **Auto-load + 24h grace**: navigate to Matches → lands inside the closest match, not on the card list. Change a match's game_date to yesterday with KO <24h ago → next visit still lands on it. Move it to 2 days ago → next visit skips it and picks the next upcoming. Card outline on a match that's been played is green (if result entered) or red with ⚠ Needs score (if not).
2. **Enter result wizard**: on a match with KO passed, amber `⚽ Enter result` above sub-tabs. Tap → step through HT 1-0 / FT 3-2 / goalscorers (tap + Add goalscorer twice on same player to get count 2 + another) / MOTM with optional reason. Save → modal closes, page scrolls to top, match card outline flips green with `FT 3-2 W` chip, result card appears with compact `✎ Edit` pill. Tap that to re-open wizard with values preserved.
3. **Drag-drop no-jank**: on Matches sub-tab, drag a player onto the pitch. The Matches card list on the right should NOT re-render or shift — pitch + palette update only. Same on Info / Formation sub-tabs.
4. **Availability bar no-flicker**: open a published / availability lineup → bar shows the tally button immediately (no empty-div growing into a button after a delay). Tap it → Availability responses modal opens.
5. **Formations page**: open Formations → pitch + Formation/Squad sub-tabs visible. Pick 4-3-3 → drag 6 players from Squad tab onto pitch → Save formation → OK to the "remember players?" prompt → formation list shows `👥6` next to 4-3-3's entry (or the custom one you were on). Click another formation then click back → pitch auto-populates with the 6 players.
6. **👥N in the match editor**: open a match, Formation sub-tab, click the formation that has the 👥N badge → if pitch was empty, players load silently; if pitch had players, prompted first.
7. **Tactics page**: Tactics sidebar tab → 4 sub-tabs visible (Tactics / Squad / Moves / Tactic details). + New tactic → lands on Tactic details with name focused. Fill in name, pick In possession, pick 4-3-3, swap to Squad → drag 11 players on → swap to Moves → click ✎ Edit positions → drag a CB forward → ✓ Done editing. Click a drag mode → draw an arrow → add the ball. Swap to Tactic details → Save tactic. Tactic appears as a card on the Tactics sub-tab with `In` chip. Click card → loads everything back. ✕ Delete → card disappears.
8. **Save as tactic from a match**: Matches → open any match → Formation sub-tab → ★ Save as tactic… → modal with name + possession radio + description. Save → new tactic appears on the Tactics page's card list.
9. **Tabs disappearing after wizard save**: on phone, save the result wizard → tabs should be visible at the top straight away, not below the fold.

### Start-here on the new machine (session 6)
Push `web/app.js` + `web/styles.css` + `web/FAQ.md` + `web/HANDOFF.md`. No migration.

**Next up:** Admin panel is still the biggest remaining Slice 5 piece. Then email notifications on publish, then audit-log UI, then the holistic design pass. Parent season page (Slice 6) remains the next big feature once Slice 5's functional items are closed.

---

## 🔖 Where we left off on 2026-04-17 (session 5)

Matches sub-tab / match-editor UX tightened up, and the post-match result entry was pulled out into a dedicated wizard.

### Shipped this session (session 5)

1. **Removed the dashed "+ New match" card** from the Matches sub-tab (was the last remaining card in the Upcoming grid, redundant with the global +). Empty-upcoming fallback now reads "No upcoming matches — tap the orange + to add one." See `app.js` around where `_newMatchCard` used to live (search for the removal comment dated 2026-04-17) and the corresponding handler cleanup in `wireLineupEvents`.
2. **Fixed the top-right "+ New" button** in `.me-header`. Previously it just blanked `editor.current` via `newLineupState()` (a relic from before the wizard existed). Now it mirrors the global + and calls `openMatchWizard({ id: uid }, teamId)`. `hasUnsaved()` guard retained.
3. **Auto-load of the closest match** when opening Lineups with no pending lineup. New helper `_findDefaultLineupId(lineups)` (placed just above `matchHasBeenPlayed`) picks the match with the smallest |distance-from-now|, with a hard filter: past matches are only eligible if kickoff was within the last 24 hours (so the coach stays parked on a just-played match). KO time falls back to 12:00 if missing. After 24h, rolls forward to the next upcoming automatically. The `else` branch in the Lineups section of `renderTeamDashboard` then hydrates `editor.current` from the chosen lineup and lands on the Squad sub-tab (same shape as the wizard-load branch). Falls back to the Matches card list when nothing is eligible.
4. **New "Enter / Edit result" button** above the sub-tab strip (`.me-enter-result-btn` / `#me-enter-result`). Rendered only when `canEdit && current?.id && matchHasBeenPlayed(current)`. Label flips to "Edit result" once `matchHasResult(current)` is true, and the button colour goes green (`#2a7`) vs amber (`#b88800`) to telegraph state. Wired in `wireLineupEvents` near the status-pill wiring.
5. **4-step result wizard** (`openResultWizard()` — placed just above `openMatchDetailsModal`):
   - Step chips at top (1→4) fill with brand blue as the coach advances.
   - **Step 1** Half-time score — big Us / Opp number inputs.
   - **Step 2** Full-time score — same layout, with a "HT was X-Y" hint if HT was entered.
   - **Step 3** Goalscorers — list of added entries with +/− count and ✕ remove; "+ Add goalscorer" toggles an in-panel picker over the matchday squad (slots ∪ subs, falling back to full squad if empty). Tapping a player appends them with count=1 or increments if already added. Live FT-tally mismatch warning underneath.
   - **Step 4** Man of the Match — list of added MOTMs (★ badge, optional reason input per row), "+ Add Man of the Match" opens the same picker style but disables already-selected players.
   - Wizard uses **local state**; Save commits `our_score_ht/opp_score_ht/our_score_ft/opp_score_ft/goalscorers/motm` to `editor.current` and triggers `scheduleAutosaveIfPublished()` so persistence is handled by the existing hash-based autosave. Cancel / ✕ / outside-click all bail without writing.
   - The old inline Result section inside `matchDetailsFormHtml` / `matchResultSectionHtml` is **still there and still works** — it just isn't the primary path anymore. Safe to keep as a fallback; it also keeps the ✎ Edit match modal feature-complete.

### SQL to run in Supabase before deploy
None. Pure client-side. All fields already exist (`our_score_ht/opp_score_ht/our_score_ft/opp_score_ft` + `data.goalscorers` + `data.motm`).

### Files touched (session 5)
- `web/app.js` — dashed-card removal + handler cleanup, `me-btn-new` rewire, `_findDefaultLineupId` helper + auto-load `else` branch rewrite, `openResultWizard` function, `enterResultBtnHtml` injection, `#me-enter-result` wiring
- `web/HANDOFF.md` — this entry + Slice 6 roadmap update (parent season page brief moved below)

### Sanity-check script (session 5)
1. **Dashed card gone:** open Lineups → Matches sub-tab → Upcoming section should have no dashed "+ New match" card. Only real matches show. If empty, you see the muted "No upcoming matches" line.
2. **Top-right + New:** desktop ≥900px, inside a match → tap **+ New** in the header (next to Share) → the Match creation wizard opens. Previously this just blanked the editor.
3. **Auto-load closest:** navigate away (e.g. Squad tab) and back to Matches → you should land *inside* the closest upcoming match, not on the card list. Change a match's game_date to yesterday with KO < 24h ago → on next tab-revisit you should still land on it. Move the game_date to 2 days ago → next tab-revisit skips it and picks the next upcoming.
4. **Enter result button:** for a match with KO still in the future → no button visible. For a match with KO passed → amber "⚽ Enter result" button sits above the Matches/Squad/Subs/Formation/Info strip. Tap → wizard opens. After saving a result, reload → button is green "⚽ Edit result".
5. **Wizard flow:** enter HT 1-0 → Next → FT 3-2 → Next → **+ Add goalscorer** → picker lists matchday squad → tap Smith → Smith appears with count 1 → **+ Add goalscorer** → tap Smith again → count becomes 2 → **+ Add goalscorer** → tap Jones → Jones with count 1. Total shows 3, FT says 3, no warning. If mismatch, red warning appears. → Next → **+ Add Man of the Match** → tap Smith → ★ row with optional reason input → tap Save → modal closes, Info card and match-card chip update, pitch ★/⚽ overlays update after render.
6. **Cancel path:** open wizard, change things, Cancel or ✕ → nothing persists.

### Start-here on the new machine (session 5)
Push `web/app.js` + `web/HANDOFF.md`. No migration.

**Next up:** Admin panel is still the biggest remaining Slice 5 piece. Visual/design pass is queued. Slice 6 parent season page (brief captured below) is the next big-idea piece once Slice 5 is finished.

---

## 🔖 New TODO requested 2026-04-17 — Parent season page (gated by player access code)

Chris wants a **parent-facing season page** that a parent opens with their child's **access code** (the existing `players.access_code`, or the shared `players.family_code` for siblings) and sees that player's season at a glance — not a single lineup.

**What it should show, per player unlocked:**
- List of all played matches (date, opponent, home/away, HT & FT score, W/D/L badge).
- Which of those matches the player featured in (slot or sub).
- Per-match: did this player score? how many? were they MOTM? (reason if given).
- Season totals for this player: appearances, goals, MOTM count — same numbers the Slice 6 season tally was going to surface, but scoped to the family.
- Upcoming matches (availability + published) where the player is in the squad — with kickoff / arrival / venue summary so parents can see it in one place instead of hunting through individual share links.

**Auth model (reuse what exists):**
- Gate on `players.access_code` / `players.family_code` exactly like the availability flow does. Unlock persists in `localStorage` per-team.
- Anon RPC pattern: new `validate_player_code_for_season(team, code)` returning matching `player_id`s, plus a read RPC that returns the filtered history for those IDs. Keep direct anon SELECTs off the lineups/players tables beyond what's already exposed — codes must not leak in the payload.
- URL: probably `#/season/{team_id}` with the code-entry box, mirroring the availability unlock. (Or `#/player/{family_code}` — decide when we start.)

**Data is already there:**
- `lineups.our_score_ht/opp_score_ht/our_score_ft/opp_score_ft` for scores
- `lineups.data.goalscorers = [{player_id, count}]`
- `lineups.data.motm = [{player_id, reason}]`
- Slots + subs already store player assignments, so "appearances" = count of lineups where this player is in `slots` ∪ `subs`.
- Everything above is per-lineup; aggregation is pure SQL / client-side reduce.

**Why this is worth doing:**
- It's the real shape of the Slice 6 "team-wide public page" idea combined with the "per-player season tally" idea — a single parent-facing URL, gated safely, that becomes the thing parents actually bookmark.
- Zero new capture work (results, MOTM, goalscorers all landed in the 2026-04-16 session 3 work) — this is pure read-side.

**Where it sits in the plan:** slots naturally at the top of **Slice 6**. Do *not* squeeze this into Slice 5 ahead of the admin panel / email / audit UI items — those are the blockers for Slice 5 being "done". Add to Slice 6 roadmap below.

---

# Interpro Coach / Manager Assistant — Handoff (2026-04-16, session 4)

## 🔖 Where we left off on 2026-04-16 (session 4 — read this first)

Two tranches this session: a deep-dive on the availability/pitch "not updating" report, and a full FAQ audit + rewrite.

### Shipped this session (session 4)

1. **Availability + pitch sync deep-dive — four fixes.**
   - **Dot flicker fix** in `renderLineupsTab` (end of function, ~line 3833): decorations now paint synchronously from the in-memory `editor.availability` cache *before* the DB re-fetch kicks off, so chips don't lose their dots mid-request. Followed by the async DB fetch which reapplies after the round-trip.
   - **Autosave race fix** in `scheduleAutosaveIfPublished` (line 1510): new module var `_autosavePendingAfter` (declared alongside `_autosaveTimer` / `_autosaveInFlight` / `_lastSavedHash` around line 1488). If a save is in flight when a new edit arrives, the flag is set instead of the save being silently dropped; after the in-flight save completes we check the flag and schedule another pass. Symptom was: pitch changes not reaching parent view when they landed on top of an in-flight save (esp. rapid drag sequences).
   - **Resize-listener leak fix** in parent view: `renderParentView` was registering a new `window.addEventListener('resize', ...)` on *every* 6-second poll tick, so listeners stacked indefinitely. Now the listener is registered **once** at module load (~line 876, just after the `_parentViewPoll` / `_parentViewLastHash` declarations) and reads from two shared module vars `_parentViewResizeLineup` / `_parentViewResizeShowPitch` which each `renderParentView` call updates.
   - **Coach availability poll: 10s → 5s** in `startCoachAvailabilityPoll` (final `setInterval` arg, around line 3945). Parent view poll stays at 6s.

2. **Full FAQ audit + rewrite.**
   - Audited `app.js` against `FAQ.md` and the in-app `HELP_SECTIONS` — found 11 major undocumented features (most importantly the Match creation wizard) and 3 stale statements (parent poll "15s", "segmented control" for status, Fixtures tab framed as live when it's tablet-only legacy).
   - **FAQ.md** rewritten (~30% diff): new top-level sections for "The team dashboard — layout" (covers sidebar / drawer / + button) and "Match creation wizard" (Home 4 steps / Away 5 steps / post-create WhatsApp prompt). Lineups section reworked to introduce the match-editor sub-tabs (Matches / Squad / Subs / Formation / Info), the status pill + Status change modal, autosave, Add to calendar chooser, and pitch chip overlays (top-left ★ / top-right goal ball / bottom-right availability dot). Parent-view poll corrected 15s → 6s; coach poll mentioned at ~5s. Fixtures tab section rewritten to note it's tablet-only legacy. Roadmap picked up the season-tally item.
   - **In-app `HELP_SECTIONS`** (lines 1752-2000 in app.js) synced: new `dashboard` and `wizard` sections, lineups section rewritten with sub-tabs + status modal + Add to calendar + new chip icons, publish section fixed for modal + "Published" terminology + ~5s/~6s intervals, fixtures collapsed to the legacy note, parent-view refresh set to 6s, workflow steps rewritten around the wizard + status pill flow, roadmap updated.
   - Deliberately left out: internal plumbing (RPCs, autosave timings, hashing). Kept language coach-facing.

### SQL to run in Supabase before deploy
None this session — pure client-side changes.

### Files touched (session 4)
- `web/app.js` — dot-flicker fix + autosave race + resize-listener fix + poll interval + HELP_SECTIONS rewrites
- `web/FAQ.md` — full audit rewrite
- `web/HANDOFF.md` — this entry

### Sanity-check script (session 4)
1. **Availability + pitch sync:**
   - Open a published lineup as coach on desktop. Drag a player from Squad onto a pitch slot. Within ~1s the lineup should be saved. Open the parent share link in a private window — within 6s the parent view should show the new player in position.
   - Open a shared lineup in Availability on a phone as a "parent" (use a valid access code). Mark ✅. Switch back to the coach desktop — within ~5s the availability responses panel ticks up and the chip gets a green dot, no flicker.
   - Drag 5 players onto the pitch in rapid succession — all 5 should end up persisted (previously an autosave mid-drag could drop subsequent edits).
2. **FAQ / Help:**
   - Open the Help tab as a coach. Expected new sections visible: **Dashboard layout & the + button** and **Match creation wizard**. Lineups section should mention sub-tabs (Matches/Squad/Subs/Formation/Info), the **Status change** modal, the **📅 Add to calendar** chooser, and the new chip icons (bottom-right dot, top-left ★, top-right goal ball).
   - FAQ section on the parent view says "Every 6 seconds automatically".
   - "Segmented control" terminology is gone from both FAQ.md and HELP_SECTIONS.
3. **Still working as before:** wizard custom formations, post-match result entry, WhatsApp share prompt, Add to calendar chooser, position label dropdown picker, player photo cropper, sibling linking.

### Start-here on the new machine (session 4)
No migrations. Push `web/app.js`, `web/FAQ.md`, and `web/HANDOFF.md` to GitHub; Vercel auto-deploys.

**Next up (unchanged from session 3 tail):** Admin panel is the biggest remaining Slice 5 piece. The holistic visual / design pass is also queued. Per-player season tally (Slice 6) has per-match data ready whenever you want to aggregate.

---

# Interpro Coach / Manager Assistant — Handoff (2026-04-16, session 3)

## 🔖 Where we left off on 2026-04-16 (session 3)

Two small fixes shipped this session — wizard custom-formations and post-match result entry.

### Shipped this session
1. **Wizard now shows custom formations regardless of which tab launched it.** `openMatchWizard` is now `async` and fetches `formations` for the team from Supabase before rendering Step 2, then caches the list back onto `editor.customFormations`. Previously it relied on whatever was on `editor` at the moment, which was empty/stale when the wizard was opened from the desktop sidebar "+" while sat on Squad/Help/Formations/Admin tabs (those tabs don't reassign `editor` with `customFormations`). Phone happened to work because users typically launched the wizard from the Matches sub-tab "+ New match" card, where `editor.customFormations` was always populated.
2. **Post-match Result entry on a played match.** New columns on `lineups`: `our_score_ht`, `opp_score_ht`, `our_score_ft`, `opp_score_ft`. Goalscorers and MOTM live in the existing `data` JSONB as `data.goalscorers = [{player_id, count}]` and `data.motm = [{player_id, reason}]`. The `✎ Edit match` modal grows a new **⚽ Result** section once `matchHasBeenPlayed(current)` is true (i.e. game_date < today, or game_date == today AND now ≥ kickoff_time, fallback midday if no KO time). Inputs are: HT us/them · FT us/them · per-player goal counter (+/− buttons + number input) · MOTM star toggle per player with optional inline "Why?" reason field (multiple MOTMs allowed). Both pickers use the matchday squad (slots ∪ subs); fall back to whole squad if the squad hasn't been picked yet (e.g. status is still draft/availability). Live tally vs FT us shows a red warning if they don't match. Autosaves via the standard hash mechanism — no extra Save button.
3. **Result chip on match cards + summary.** New helper `matchResultBadge(l)` returns `{ text, outcome, color }`. `_matchCardHtml` in the Matches sub-tab now renders a coloured chip (green W / red L / grey D / amber HT-only) above the status pill on cards with a result. `matchSummaryHtml` (Info sub-tab) shows the same chip + a comma-separated scorer line underneath ("⚽ Smith, Jones (2)") + a "🏆 Name — reason" MOTM line.
4. **Pitch chip overlays for MOTM + goals.** New decorator `applyMatchDecorations(rootEl, motm, goalscorers)` (next to `applyAvailabilityDecorations`) overlays a gold ★ on the top-left of any MOTM player's chip and a small white-ball-with-count on the top-right of any goalscorer's chip. Idempotent (clears previous decorations on every call), scoped to a root element so the live editor and fixture preview don't fight. Wired into `renderPitch`, `renderSubsBar` (using `editor.current.{motm,goalscorers}`), and `renderFixturePitch` (using `lineup.data.{motm,goalscorers}`). Corner usage: top-left = MOTM star, top-right = goal ball, bottom-right = availability dot. No-op when arrays are empty so unplayed matches show nothing extra.

### SQL to run in Supabase before deploy
Pasted in chat at the end of the session — no `.sql` file. Reproduced here for reference:

```sql
ALTER TABLE lineups
  ADD COLUMN IF NOT EXISTS our_score_ht INT,
  ADD COLUMN IF NOT EXISTS opp_score_ht INT,
  ADD COLUMN IF NOT EXISTS our_score_ft INT,
  ADD COLUMN IF NOT EXISTS opp_score_ft INT;
```

No RLS changes needed — these columns inherit the existing `lineups` policies.

### Files touched
- `web/app.js` — `openMatchWizard` (async + fetch), `newLineupState` (6 new fields incl. `motm`), `_lineupContentHash` (6 new fields), 3 lineup-load points, `saveLineupWithMsg` (4 columns + JSONB scorers + JSONB motm), new `matchHasBeenPlayed`/`matchHasResult`/`matchResultBadge`/`matchResultSectionHtml`, wiring inside `wireMatchDetailsFields` (scores + scorers + MOTM), chip injection into `_matchCardHtml` + `matchSummaryHtml`, `HELP_SECTIONS` lineups entry.
- `web/FAQ.md` — new "How do I record the result after the game?" Q under Lineups tab (covers MOTM too).

### Sanity-check script
1. Wizard formation list: open Squad tab → desktop sidebar "+" → New match → step 2 should now list any custom formations alongside presets. Same from Help/Admin/Formations tabs.
2. Result entry: open a past match (or change game_date to yesterday) → Edit match → scroll to ⚽ Result → enter HT 1-0, FT 3-2 → goalscorers list should show the matchday squad → tap + on two players → close modal → match card shows green "FT 3-2 W" chip → Info card shows the chip + scorer names underneath.
3. Tally warning: enter FT us = 3, but only assign 2 goals to scorers → red warning appears. Add the third goal → warning clears.
4. Goalscorer fallback: open a draft/availability match where no slots/subs are filled → result section shows "No matchday squad picked yet — showing whole squad" and the picker lists every squad player.
5. MOTM: in the Result section, tap ☆ next to a player → it fills to ★, an inline "Why? (optional)" text input appears, "1 selected" counter updates → tap another player's star → "2 selected" → close modal → Info card shows a 🏆 line with both names (and reasons in italic for the ones that have one). Reopen → both still selected with reasons preserved.

---

# Interpro Coach / Manager Assistant — Handoff (2026-04-16, session 2 — late)

## 🔖 Where we left off on 2026-04-16 (read this first)

Second session today. Focus: fix Match creation wizard (missing location step, no actual DB save) and patch two mobile/UX gaps from earlier today's redesign. All changes in `web/app.js`, `web/styles.css`, `web/FAQ.md`. **No migration.**

### Shipped this session
1. **Match wizard — Location + fine-tune steps, real DB save, WhatsApp prompt.**
   - Variable step count now: **Home = 4** (Who & when · Formation · Location [read-only home ground pulled from `team.home_ground_*`] · Summary). **Away = 5** (+ Venue fields with 🔍 postcodes.io lookup · Fine-tune on map [reuses existing `openMapPicker`]).
   - Step indicator + "Step X of Y" label recompute when Home/Away is toggled on Step 1.
   - `finish()` no longer stashes a partial `_pendingLineupLoad` — it now **inserts the lineup row directly** (`lineup_status='draft'`, audit logged), sets a new module-level flag `_pendingLineupIdToOpen`, and a new loader branch at the top of `renderTeamDashboard`'s Lineups tab picks it up and loads the saved record fully into `editor.current`.
   - After create, new helper **`openShareToWhatsAppPrompt()`** (placed just above `openStatusModal`) asks "Share to WhatsApp now?" — Yes flips status to `availability`, reuses `buildWhatsAppMessage` + `wa.me/?text=...` flow. Not now just closes.
   - Wizard opponent-required validation on finish(): jumps back to Step 1 + focuses the input instead of silently failing.
2. **Phone-only status row** above the match-editor sub-tab strip. Desktop already had the status pill in `.me-header`; on phone it was invisible (header hidden at ≤899px). New `.me-phone-status-row` in `styles.css` (hidden on desktop, `display:flex` inside the existing `@media (max-width:899px)` block). Both pills share `.js-open-status`; wiring swapped from `getElementById('me-open-status')` to `querySelectorAll('.js-open-status')` so either opens the status-change modal.
3. **Button rename `📋 Arrange match` → `✎ Edit match`** — applied everywhere it appeared: the button in `matchSummaryHtml`, the avail-bar placeholder hint, the `<em>Arrange match</em>` warning in `matchDetailsFormHtml`, the "no game date" alert before `.ics` build, and 4 sections of `FAQ.md` + the in-app `HELP_SECTIONS` (both updated). Grep for "Arrange match" returns zero in app code and FAQ.

### Shell redesign context (delta from prior HANDOFF — worth noting)
The UX redesign shipped earlier today isn't all captured in the evening section above. When you re-read the code, expect to find:
- **Desktop (≥900px):** persistent left sidebar `#desktop-sidebar` (240px, `#0f2248`). Body gets `.has-desktop-sidebar`; the old horizontal `<header>` is killed via CSS. Tabs: Matches · Squad · Plays · Formations · Help · Admin (coach-only). User badge + Sign out bottom.
- **Phone (≤640px):** hamburger + `.nav-drawer` slide-in mirrors the sidebar tabs. Horizontal `.header-tabs` hidden.
- **Tablet (641–899px):** legacy `.header-tabs` row is the only place the **Fixtures** tab still surfaces. Sidebar/drawer don't list it. `renderFixturesTab` + `activeTab === 'fixtures'` branch still exist in `renderTeamDashboard` — **candidate for removal** when you're ready to fully retire the Fixtures page (Matches sub-tab now covers it with the card list).
- **Match editor restructure:** `.lineup-layout.match-editor` is a vertical stack now, not a 3-column grid. Desktop-only `.me-header` (title + KICK OFF/ARRIVAL/FORMATION/STATUS stats + Share/+ New buttons). Permanent availability bar above a horizontal sub-tab strip (`.lineup-phone-tabs`) shown at **all** widths — Matches / Squad / Subs / Formation / Info. CSS filters via `[data-phone-group]`/`[data-phone-tab]`. Two-column body on desktop (pitch left, panel right), stacked on phone. Phone-only `.share-fab` bottom-right.
- **Matches sub-tab:** fixtures-as-cards (`.me-match-card`) with SAT/18/APR date block, grouped Upcoming / Past, hover-reveal delete X, dashed "+ New match" card.
- **Global "+" quick-create** (`.gp-btn` orange circle) — header on phone, sidebar head on desktop. Same popover menu populates every `.global-plus` slot.
- **Status modal** replaced the old segmented control — `.status-option` cards opened via pill click. Switching to Availability auto-opens the Share modal.

### Start-here on the new machine
Nothing broken, nothing in-flight. **Next up** unchanged — Slice 5 remainder below (Admin panel is still the biggest piece; visual/design pass is also ready to start).

Files to push tonight: `web/app.js`, `web/styles.css`, `web/FAQ.md`.

### Sanity-check script (if you want to verify)
1. **Wizard Home flow:** + menu → New match → step 3 shows your home ground read-only → Summary → Create → match opens with status=Draft → post-create modal appears.
2. **Wizard Away flow:** New match → flip to Away on step 1 → step 3 fill venue + postcode → 🔍 Look up seeds the pin → Next → step 4 "Adjust on map" opens Leaflet → drag pin → Use this point → step 4 refreshes with new coords → Summary → Create.
3. **WhatsApp prompt:** post-create modal → Yes, share → status pill flips to Availability (amber) → WhatsApp opens in a new tab with pre-filled message → pill shows "Availability ▾".
4. **Phone status row:** narrow browser below 900px → open any match → status row visible above the Matches/Squad/Subs/Formation/Info strip → tap the pill → modal opens.
5. **Rename:** Info sub-tab shows "✎ Edit match" button, no "Arrange match" anywhere. Help/FAQ tab's "Creating a lineup" section now says "Edit match".

---

# Interpro Coach / Manager Assistant — Handoff (2026-04-16, evening)

## Where we left off on 2026-04-16 — evening (read second)

Tonight's session focused on UX polish across the Lineups, Squad and Fixtures tabs. All changes are in `web/app.js`, `web/styles.css`, `web/FAQ.md`. **Nothing needs a migration.**

### Shipped tonight
1. **Position-label persistence (Lineups)** — renaming a position label (e.g. CB → SS) now persists.
   - `lbl` + `pos` added to `_lineupContentHash`, save payload, and load handler (in `web/app.js`).
   - Double-click a label on the pitch now opens a **dropdown picker** (GK, RB, CB, CDM, CM, CAM, RW, LW, ST etc.) with a custom-text fallback.
   - Autosave fires on label change, so no manual save needed once the lineup has an id.
2. **Save formation buttons (Edit positions mode)** — two distinct actions now:
   - **💾 Save formation** — overwrites the current custom formation in place (confirm). Presets refuse overwrite.
   - **➕ Save as new formation…** — name prompt, detects clashes, offers overwrite-or-rename.
3. **Squad page redesign** —
   - Shirt number moved to a **blue badge outside** the photo chip (visible even with a photo).
   - Card click opens a **modal** (`.player-edit-overlay`) with the full edit form instead of expanding inline.
   - Players are **grouped by position** (Goalkeepers / Defenders / Midfielders / Forwards / Unassigned) when the "All" filter is active.
   - Grid is now **4 across on desktop, 2 on mobile** (`.sc-grid` in `styles.css`).
   - Photo cropper z-index bumped to 10001 so it opens above the player modal (was appearing behind it).
4. **Add to calendar** — `downloadLineupIcs()` now opens a **chooser modal**:
   - Google Calendar (URL template, BST-aware UTC conversion via `_londonLocalToUtcStamp`)
   - Apple Calendar (`_openIcsInline` → `window.location = blob URL`, triggers native Add-to-Calendar on iOS/macOS)
   - Outlook / Download `.ics` (classic download fallback)
5. **FAQ + in-app Help** updated to describe: modal-based squad editing, number-badge, position grouping, dropdown label picker, two save-formation buttons.

### Start-here on the new machine
Nothing broken, nothing in-flight. Pick the next item from **Next up (Slice 5 remainder)** below. Most natural resume points:
- **Admin panel** is still the biggest remaining Slice 5 piece.
- Or start the **holistic visual / design pass** now that the functional Slice 5 work is essentially done.

If you want to sanity-check tonight's work first, do this on the live site:
1. Lineups → load a lineup → double-click a position label → pick a new role → refresh → label should persist.
2. Squad tab → numbers visible over photos? → tap a card → modal opens? → upload photo → cropper on top?
3. Fixtures → Add to calendar → chooser appears with 3 buttons.

---

# Interpro Coach / Manager Assistant — Handoff (2026-04-15, Slice 5 part 2)

Use this doc to pick up the project on another machine. The whole project lives in GitHub at **Vettahead/interpro-lineups** — that's the source of truth, not your local folder.

---

## Step 1 — On THIS machine before you leave

1. Make sure the latest `web/app.js`, `web/styles.css`, and `web/FAQ.md` are pushed to GitHub via the GitHub web UI (the way you normally do it).
2. Check Vercel auto-deployed and the live site works (parent share link + photo upload).
3. Done — nothing else to bring with you. The home machine just needs the GitHub repo.

## Step 2 — On the home machine

1. Install Cowork (or open Claude Code) and point it at a fresh local clone of `Vettahead/interpro-lineups`.
   - If you don't want to run anything locally you can edit straight on github.com — Cowork can read/write files in any folder you select.
2. Open this `HANDOFF.md` so I have the context.
3. Paste the prompt in **Step 3** below into the chat.

## Step 3 — Prompt to paste at the start of the next session

> I'm Chris, continuing work on the Interpro Blues lineup web app (Supabase + Vercel PWA, repo Vettahead/interpro-lineups). The whole codebase is in `web/` — single-file `web/app.js` (~4000 lines), `web/styles.css`, `web/index.html`, plus `web/FAQ.md`. I deploy by editing files on GitHub web UI; Vercel auto-deploys.
>
> Read `HANDOFF.md` in the project root for current status. Then we'll pick up from the "Next up" section.

---

## What's done in Slice 5

- ✅ **Publish lineups** — coach toggles published; share link works.
- ✅ **Parent view** — `#/view/{lineup-id}` public link, no login. Polls every 15s + manual Refresh button. Pulls custom formations from the `formations` table. RLS uses `team_has_published_lineup(uuid)` SECURITY DEFINER helper to break recursion.
- ✅ **Pitch SVG circles** — all containers `aspect-ratio: 7/10`, SVG `viewBox="0 0 70 100"`. Circles are now round.
- ✅ **In-app FAQ / Help tab** — admin-only sections hidden from parents/viewers. Search box + sectioned cards. Source content is also in `web/FAQ.md`.
- ✅ **Player photos** — full pipeline:
  - `players.photo_url` column + `player-photos` Supabase Storage bucket (public read).
  - `can_manage_player_photo()` SECURITY DEFINER + storage RLS so only coaches/admins of the team OR a parent linked via `parent_players` can write.
  - Upload UI in Squad tab edit form, with a **cropper modal** (drag + zoom, square 512×512 JPEG output).
  - Photos render on: Squad list rows, Pitch slot chips, Subs row, Available players palette, Player picker modal, **Parent view chips**.
  - When a chip has a photo, the number + name sit OUTSIDE the chip in a small caption below.

---

## Next up (Slice 5 remainder)

✅ **Player access codes (Slice 5 — gated availability)** — shipped 2026-04-15 (later session).
- `players.access_code` (auto-generated `<initials>+4 digits`, unique per team) and `players.family_code` (5 digits, shared by linked siblings).
- Shown on the player card in Squad. New "Link siblings…" modal sets a shared family code.
- Parent view at `#/view/{id}` gates the availability form behind a code-entry box. Unlock persists in `localStorage` (per-team) plus a "Forget this device" button. Multiple kids = enter additional codes via the same box.
- Two anon RPCs handle everything: `validate_player_code(lineup, code)` returns matching player IDs; `submit_player_availability(...)` validates the code again before writing. Direct anon writes on `player_availability` are revoked — only coaches and the RPC can write.
- Anon SELECT on `players` is narrowed in the client to specific columns (no `select('*')` from anon path) so codes don't leak in the API response.

✅ **Player availability** — shipped 2026-04-15.
- Added `lineup_status` column on `lineups` (`draft` | `availability` | `published`) with a before-insert/update trigger that keeps the legacy `published` boolean + `published_at` in sync.
- New `player_availability` table, anon-writable under the `lineup_is_parent_visible()` helper (trust-the-link model, no per-player token).
- Editor: segmented 3-state control inside **📋 Arrange match** replaces the single Publish toggle.
- Parent view at `#/view/{id}` branches on `lineup_status`: `availability` renders a per-player form (✅/🤔/❌ + optional note + optional "Your name"), `published` shows the pitch as before, `draft` shows "Lineup not available".
- Coach sees an "Availability responses" panel with tally inline in the Match details card whenever status is `availability` or `published`.
- FAQ updated.

✅ **Invites** — shipped. Members tab supports send/revoke/role-pick, parent→player linking via `parent_players`, audit-logged, magic-link email via Supabase OTP. `claimPendingInvites()` runs on sign-in.

Remaining in Slice 5, in order:

1. **Admin panel** — admin-only view: all users, assign to teams, change roles, remove users. (No `renderAdminTab` exists yet.)

2. **Email notifications on publish** — currently only the invite magic-link email goes out. Need Resend (or Supabase function) hook on lineup publish + availability requests.

3. **Audit log UI** — `audit_log` rows are being written by `logAudit()` (see app.js:70) but there's no viewer. Surface for admins.

4. **Branding / visual polish** — folded into a wider design pass to happen *after* the functional items above. The app is currently utilitarian; do typography, colour, spacing, components, pitch aesthetic in one coordinated pass rather than piecemeal. `logo.png` and `favicon.png` already in `web/` but need final design + sizing.

Optional / nice-to-have observed during photo work:
- Hide the position label below a slot when the player has a photo (caption already shows name); only show position when slot is empty.
- A "team-wide" public page so parents can bookmark one URL for the whole season instead of per-lineup links.

---

## Future slices (rough roadmap, not locked in)

**Slice 6 — Season & history**
- **Parent season page gated by player access code (requested 2026-04-17).** Single bookmarkable URL per team. Parent enters their child's `access_code` (or `family_code` for siblings) — page then shows that player's season: played matches with scores / W-D-L, whether the player featured, goals + MOTM, season totals, upcoming matches they're squadded for. Reuses the existing access-code unlock + localStorage pattern from availability. All source data already captured (scores, `goalscorers`, `motm`, slots/subs) — this is read-side only. Likely the anchor feature of Slice 6; see top of this handoff for fuller brief.
- League table / results tracker (W-D-L, GF-GA).
- Player stats over time (appearances, minutes, goals, assists) — feeds the parent season page.
- Season export (PDF or CSV).

**Slice 7 — Match day live**
- Live in-match controls: start/stop clock, log goals/subs/cards as they happen.
- Real-time player swaps on the pitch during a game.
- Parents see live score on the same parent link.
- Optional post-match summary auto-generated.

**Slice 8 — Training & attendance**
- Schedule training sessions alongside fixtures.
- Attendance register.
- Reuse the player-availability flow (Slice 5) for training too.

**Slice 9 — Comms & polish**
- In-app announcements / pinned notes per team.
- Push notifications (PWA) for publish + reminders.
- Photo gallery per match.
- Dark mode.
- Proper offline support so parents can open the link with no signal.

**Slice 10 — Multi-team / club-level**
- Club account that owns multiple teams (e.g. U10, U11, U12).
- Cross-team admin.
- Shared player pool for cup squads.

---

## Architecture cheat sheet

- **Frontend:** vanilla ES modules, single `web/app.js`, hash routing (`#/team/{id}`, `#/view/{id}`).
- **Backend:** Supabase (Postgres + Auth + RLS + Storage). Anon key in client.
- **Deploy:** Vercel auto-deploy on push to `main`.
- **RLS pattern:** any cross-table policy that references another table needs a `SECURITY DEFINER` helper to avoid infinite recursion. See `team_has_published_lineup()` and `can_manage_player_photo()` for examples.
- **SQL:** never written to a `.sql` file — always pasted in chat for Chris to run in the Supabase SQL editor.
- **Pitch sizing:** every pitch container is `aspect-ratio: 7/10`; SVG uses `viewBox="0 0 70 100"`. If you ever change one, change them all.
- **Backups:** `web-backup-slice4-20260415-1228/` is the last clean Slice 4 snapshot, kept in the project root.
