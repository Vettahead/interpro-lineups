# Interpro Coach / Manager Assistant — Handoff (2026-04-16, session 3)

## 🔖 Where we left off on 2026-04-16 (session 3 — read this first)

Two small fixes shipped this session — wizard custom-formations and post-match result entry.

### Shipped this session
1. **Wizard now shows custom formations regardless of which tab launched it.** `openMatchWizard` is now `async` and fetches `formations` for the team from Supabase before rendering Step 2, then caches the list back onto `editor.customFormations`. Previously it relied on whatever was on `editor` at the moment, which was empty/stale when the wizard was opened from the desktop sidebar "+" while sat on Squad/Help/Formations/Admin tabs (those tabs don't reassign `editor` with `customFormations`). Phone happened to work because users typically launched the wizard from the Matches sub-tab "+ New match" card, where `editor.customFormations` was always populated.
2. **Post-match Result entry on a played match.** New columns on `lineups`: `our_score_ht`, `opp_score_ht`, `our_score_ft`, `opp_score_ft`. Goalscorers live in the existing `data` JSONB as `data.goalscorers = [{player_id, count}]`. The `✎ Edit match` modal grows a new **⚽ Result** section once `matchHasBeenPlayed(current)` is true (i.e. game_date < today, or game_date == today AND now ≥ kickoff_time, fallback midday if no KO time). Inputs are: HT us/them · FT us/them · per-player goal counter (+/− buttons + number input). Goalscorer list is the matchday squad (slots ∪ subs); falls back to whole squad if the squad hasn't been picked yet (e.g. status is still draft/availability). Live tally vs FT us shows a red warning if they don't match. Autosaves via the standard hash mechanism — no extra Save button.
3. **Result chip on match cards + summary.** New helper `matchResultBadge(l)` returns `{ text, outcome, color }`. `_matchCardHtml` in the Matches sub-tab now renders a coloured chip (green W / red L / grey D / amber HT-only) above the status pill on cards with a result. `matchSummaryHtml` (Info sub-tab) shows the same chip + a comma-separated scorer line underneath ("⚽ Smith, Jones (2)").

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
- `web/app.js` — `openMatchWizard` (async + fetch), `newLineupState` (5 new fields), `_lineupContentHash` (5 new fields), 3 lineup-load points, `saveLineupWithMsg` (5 columns + JSONB scorers), new `matchHasBeenPlayed`/`matchHasResult`/`matchResultBadge`/`matchResultSectionHtml`, wiring inside `wireMatchDetailsFields`, chip injection into `_matchCardHtml` + `matchSummaryHtml`, `HELP_SECTIONS` lineups entry.
- `web/FAQ.md` — new "How do I record the result after the game?" Q under Lineups tab.

### Sanity-check script
1. Wizard formation list: open Squad tab → desktop sidebar "+" → New match → step 2 should now list any custom formations alongside presets. Same from Help/Admin/Formations tabs.
2. Result entry: open a past match (or change game_date to yesterday) → Edit match → scroll to ⚽ Result → enter HT 1-0, FT 3-2 → goalscorers list should show the matchday squad → tap + on two players → close modal → match card shows green "FT 3-2 W" chip → Info card shows the chip + scorer names underneath.
3. Tally warning: enter FT us = 3, but only assign 2 goals to scorers → red warning appears. Add the third goal → warning clears.
4. Goalscorer fallback: open a draft/availability match where no slots/subs are filled → result section shows "No matchday squad picked yet — showing whole squad" and the picker lists every squad player.

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
- Team-wide public page so parents bookmark one URL for the whole season.
- League table / results tracker (W-D-L, GF-GA).
- Player stats over time (appearances, minutes, goals, assists).
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
