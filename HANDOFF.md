# Interpro Coach / Manager Assistant — Handoff (2026-04-20)

## 🔖 Where we left off on 2026-04-20 (session 23 — read this first)

**Subs tab picker-click regression fixed.** After placing the first sub, coach couldn't tap empty sub slots to add another, and couldn't tap the filled sub to remove / replace — only drag-and-drop kept working. Chris: "matches the subs tab once a sub has been chosen ytou cant add any more or remove the sub, you can move his postion though". Root cause: `refreshAfterChipMove` (added session 20 as the targeted local re-render that replaced the old full `renderLineupsTab` call) rebuilds pitch slots + subs row via `innerHTML =`, which wipes the per-element click listeners `wirePicker()` attached at initial render. Drag survived because `wireDragAndDrop` uses a document-level `pointerdown` delegation guarded by `_chipDragWired` that persists across re-renders. The picker was a sibling casualty of the session 20 speed-up. One-line fix: call `wirePicker()` at the end of `refreshAfterChipMove`, gated by the same `editor?.canEdit && !_posEditMode` condition used at wire-up sites (line 10892 + line 12764).

### Shipped this session (session 23)

1. **`wirePicker()` re-bound after every chip move.** New block near the end of `refreshAfterChipMove`, right before `scheduleAutosaveIfPublished()`:
   ```js
   if (editor?.canEdit && !_posEditMode) {
     try { wirePicker(); } catch (_) {}
   }
   ```
   Wrapped in try/catch to match the defensive style of the surrounding autosave call — a stray throw here would kill the autosave that follows.
2. **Affects pitch slots + sub slots + empty-slot taps.** Chris reported only the subs tab, but the same regression was silently affecting pitch slots (tap to swap a chip vs. tap to open picker) and empty-slot picker opens. All three are now restored because `wirePicker()` binds handlers on `[data-slot]` AND `[data-sub]`.
3. **Drag untouched.** `wireDragAndDrop` already handles its own re-binding via `_chipDragWired` + document-level pointerdown delegation — nothing to change there. Dragging a filled sub into another sub slot keeps working (which is why Chris could still move the sub around).
4. **Guard conditions mirror the two existing call sites.** `wireLineupEvents` (line 10892) and the Tactics page wirer (line 12764) both gate picker wiring on `canEdit && !_posEditMode`. Using the same guard in `refreshAfterChipMove` means the re-bind is a no-op for read-only parents and for coaches in position-edit mode (where a different handler, `wirePositionEditing`, owns clicks).

### Files touched (session 23)

- `app.js` — `refreshAfterChipMove` gets the new wirePicker re-bind block just before the autosave call. Net line count 14034 → 14047 (+13; mostly comments explaining why).
- `styles.css` — untouched.
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 23)

**None.** Pure client-side handler re-wire. No schema changes.

### Design decisions locked in (session 23)

- **Re-bind at the end of `refreshAfterChipMove`, not after each of `renderPitch` / `renderSubsBar` individually.** Single re-bind covers both and matches how the other call sites wire once per full render pass. Two calls would double-bind on the sub slots or waste a pass.
- **try/catch around `wirePicker()`.** Defensive — if a future renderer mutation introduces a null DOM lookup inside `wirePicker`, the autosave + availability overlays that run after it must still fire. The existing `scheduleAutosaveIfPublished` a few lines below already uses the same try/catch pattern.
- **Don't call `wirePicker` from `renderPitch` or `renderSubsBar` directly.** Keeping render functions pure (no event-binding side effects) preserves the ability to call them in other contexts (e.g., palette-only refreshes) without double-binding picker handlers to stale slots.
- **Kept session 20's `renderLineupsTab` guard.** The whole point of session 20 was to STOP full tab rebuilds on autosave. Re-introducing a `renderLineupsTab()` call here would undo that speed-up. The `wirePicker()` re-bind is the surgical equivalent.

### Sanity-check script (session 23)

1. **Open a published match in the coach's view.** Tap an empty sub slot. Picker opens. Pick a player. Sub is placed.
2. **Tap the next empty sub slot.** Picker opens again (previously dead). Pick a player. Second sub placed.
3. **Tap the filled first sub.** Remove picker opens (previously dead). Remove. Sub is empty again.
4. **Tap an empty pitch slot.** Picker opens. Pick a player. Chip drops into the slot.
5. **Tap a filled pitch slot.** Replace-or-remove picker opens.
6. **Drag a sub chip to a different sub slot.** Still works (unchanged from before).
7. **Drag a sub chip to a pitch slot.** Still works (unchanged from before).
8. **Parent `/view` link on the same match.** No picker behaviour at all — read-only gate holds (no `canEdit`).
9. **Position-edit mode.** Enter position editing on a formation. Chip drags move positions, not players. No picker opens (the `!_posEditMode` guard holds).
10. **Locked match (past date).** Tapping a filled chip opens the award-badge modal (session 21 path). Empty-slot tap pulses the locked banner. Neither path re-binds picker behind the coach's back on the locked pitch.

### Start-here on the new machine (session 23)

1. Upload `app.js` and `HANDOFF.md` to GitHub via the web UI. (`styles.css` untouched this session.)
2. Vercel auto-deploys.
3. Hard-reload; clear cache if needed.
4. Run the sanity-check script above, especially steps 2 + 3 (the specific regression Chris hit).

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg`.
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

---

## Previous session — Where we left off on 2026-04-20 (session 22)

**Two parent-view polish fixes: (1) availability rows now collapse after a fresh submit (not just on reload), and (2) the gold highlight ring on your child's chip no longer gets clipped at the pitch edge.** Chris: "when i scroll to the bottom of the avialablity screen the gold circle o my child disappears? also the availablity once chosen isnt collapsed. needs to collapsed with the change button allways after signing it as the page is ver long". Both shipped.

### Shipped this session (session 22)

1. **Availability rows collapse immediately after submit.** Session 19 wired collapse on INITIAL RENDER (if the parent had already responded when they opened the page). But submitting a fresh response just updated the button colors and left the expanded picker + note input + last-response line fully visible — which made the page very long for sibling families. Now the `submit` handler in `wireAvailabilityForm` toggles the collapsed block on after a successful save: the pill shows the new status, responder name + optional note refresh in place, and the 3-button picker + note input vanish. The "Change" button remains as the way back into the picker.
2. **Collapsed block always in DOM.** Previously the collapsed `<div class="avail-collapsed">` was only generated when `hasResponse` was true at page load. A fresh submit had nothing to swap to. Now it's always rendered (with `display:none` when no response) so the submit handler just updates spans (`.avail-collapsed-pill`, `.avail-collapsed-responder`, `.avail-collapsed-note`) and flips `display: flex`. No HTML rebuild, no event re-binding — the existing Change button keeps its listener.
3. **`availStatusPillHtml()` hoisted to module scope.** Both the renderer and the submit handler need to build the same coloured pill. Previously an inner closure in `renderAvailabilityFormHtml`. Now a top-level helper so the submit handler can call it without duplicating the palette.
4. **Gold ring on parent's child chip uses INSET box-shadow.** `highlightMyChildrenOnPitch` applied `box-shadow: 0 0 0 4px #f4c430` as an OUTER ring — but `.pitch { overflow: hidden }` (styles.css:587) clips outer shadows on chips sitting near the pitch's edge. A goalkeeper at the bottom row, a winger hugging the touchline, a striker near the top — any chip close to the pitch boundary had its gold ring shaved off on the clipped side. Switched to `inset 0 0 0 4px #f4c430` so the ring paints inside the chip's border box and can never be clipped by an ancestor's overflow. Still reads as "this is my kid" — just a gold border inside the chip edge instead of outside it.
5. **Drop shadow preserved.** The second shadow layer (`0 1px 3px rgba(0,0,0,0.4)`) is still an outer drop shadow — it's a tiny 3px blur so even if the chip is right at the pitch edge, the clipping is imperceptible. Only the 4px primary gold ring needed the inset treatment.

### Files touched (session 22)

- `app.js` — `renderAvailabilityFormHtml` now unconditionally renders the collapsed block (display toggled via inline style); inner spans got named classes (`avail-collapsed-pill` / `avail-collapsed-responder` / `avail-collapsed-note`). `wireAvailabilityForm.submit` updates those spans + flips visibility after a save. New top-level helper `availStatusPillHtml(s)`; the inner closure in `renderAvailabilityFormHtml` now just aliases it. `highlightMyChildrenOnPitch` gold ring changed to `inset`. Net line count 13980 → ~14000 (+~20).
- `styles.css` — untouched.
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 22)

**None.** Pure client-side UX fixes. No schema changes.

### Design decisions locked in (session 22)

- **Collapse is automatic, not opt-in.** A parent who has just picked ✅/🤔/❌ probably wants the row out of their face immediately so they can find the other kids still needing a response. If they want to change their mind, the Change button is right there — one tap, expanded picker again.
- **Pill + responder + note all update in-place.** We don't blow away and rebuild the collapsed block; we just swap text inside known spans. Keeps the existing Change button handler alive (no re-binding needed) and avoids any flicker.
- **Gold ring stays the same colour and thickness, only goes inside.** `#f4c430` at 4px matches the `pv-squad` card's gold accent (`border-left:4px solid #f4c430`) so the child's chip visually links to the "Your squad" banner.
- **Inset shadow is preferred over CSS outline.** Outlines in Chromium CAN still be clipped by overflow:hidden ancestors in certain layout modes. Inset box-shadow is guaranteed to paint inside the border box.

### Sanity-check script (session 22)

1. **Fresh submit on a long availability page.** Open a parent availability link with multiple siblings, none answered yet. Pick ✅ for the first child. The row collapses immediately into `[photo] #7 Alex  [✅ Available pill]  · [responder name]  "note if present"  [Change]`. The picker + note input are gone.
2. **Change → re-submit.** Tap Change on the collapsed row. Expanded picker reappears with the previous selection highlighted. Change ✅ to 🤔. Row collapses again with the new pill + note.
3. **Siblings stay expanded until answered.** Child #2 (not yet responded) is still showing the full picker beneath the collapsed #1.
4. **Re-load the page.** Previously answered children render straight into the collapsed view. Same as before — no regression.
5. **Gold ring on parent-unlocked chip.** Open a parent /view link on a match where the child is playing. Scroll down to the pitch. The child's chip shows a gold ring INSIDE the chip perimeter (a gold border ~4px thick on the inside edge). Check chips near the pitch corners: goalkeeper at the bottom, winger at a side, striker near the top — all rings render cleanly, nothing clipped.
6. **MOTM / goals / match badges overlay cleanly.** The inset ring sits inside the chip; the star (top-left), goal-ball (top-right), badge row (bottom-left), focus marker (bottom-right) all still render on top without collision.
7. **Multiple siblings on the same pitch.** If two unlocked children are both in the squad, both chips get the gold inset ring. Verify both render.

### Start-here on the new machine (session 22)

1. Upload `app.js` and `HANDOFF.md` to GitHub via the web UI. (`styles.css` untouched this session.)
2. Vercel auto-deploys.
3. Hard-reload; clear cache if needed.
4. Run the sanity-check script above.

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg`.
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

---

## Previous session — Where we left off on 2026-04-20 (session 21)

**Locked matches: tapping a filled chip now opens the badge-award modal.** Session 20 locked the pitch on past-date matches and the banner promised "You can still... award badges" — but tapping a chip on a locked match was a dead no-op. Chris: "lock works well but cant award aby badges as clicking on aplyer does nothign now". Fixed: chip-tap on locked match → award modal for that player. Empty-slot tap still pulses the banner (nothing to award).

### Shipped this session (session 21)

1. **`openAwardBadgeForLocked(playerId)` helper.** Looks up the player in `editor.players`, then calls `openAwardBadgeModal({ team, player, lineupId: editor.current?.id, onAwarded })`. `lineupId` scopes the badge to this specific match (so it shows on the match chip + in the match awards card, not just the player's all-time totals). `onAwarded` re-runs `renderLineupsTab()` so the new badge appears on the chip immediately.
2. **`wirePicker` slot + sub click handlers rewritten.** When `isMatchLocked(editor.current)` is true:
   - Filled slot / sub (has a `playerId` in that position) → `openAwardBadgeForLocked(pid)`.
   - Empty slot / sub → `flashLockedPitch()` only (nothing to award).
   - Still returns early before opening the player picker — no accidental swap.
3. **Banner promise now backed by real affordance.** Sub-line `"You can still enter the result, award badges, and set MOTM / scorers."` is literally true again: tapping a kid on the locked pitch is now the quickest way to award a match badge.
4. **Drag + focus-mode + result-wizard paths untouched.** Drag on locked match is still a silent no-op (session 20 guard). Result wizard + "Enter result" button are separate code paths — unchanged. Squad tab's `data-award-badge` button still works for all-time (non-match-scoped) badges.

### Files touched (session 21)

- `app.js` — new `openAwardBadgeForLocked(playerId)` helper near `wirePicker`. Slot + sub click handlers in `wirePicker` rewritten to route locked-match taps to the award modal when a chip is present. Net line count 13948 → ~13970 (+22).
- `styles.css` — untouched.
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 21)

**None.** `openAwardBadgeModal` already exists (line ~2578) and already supports per-match badges via the optional `lineupId` arg. No new columns, no new RLS. `player_badges.lineup_id` was wired in Slice 2 — we're just exercising it from a new entry point.

### Design decisions locked in (session 21)

- **Locked chip = badge award, not picker.** Intentional mode-switch. On an active match, tapping a chip opens the player picker to swap/reassign. On a locked match, the chip becomes a badge target because that's the only pitch-scoped edit that still makes sense.
- **Empty slot on locked match stays pulse-only.** Nothing to award — we don't pop open a player chooser just to then award a badge. Keeps the UI honest about what's possible from this state.
- **Per-match scoping via `lineupId`.** Badges awarded this way carry `lineup_id = editor.current.id` so they appear scoped to the match. Matches the existing Squad-tab flow's match-scoped toggle.
- **`onAwarded` triggers full tab re-render.** The locked match is a read-only target anyway — rebuild latency doesn't collide with rapid chip placement (session 20's fix only matters for ACTIVE editing). Full re-render keeps everything consistent: chip badge count, awards card, totals.

### Sanity-check script (session 21)

1. **Open a past-date match.** Amber "🔒 Match played — lineup is locked." banner visible above the pitch.
2. **Tap a filled slot chip.** Badge-award modal opens with the correct player name pre-filled. Select a badge, confirm. Modal closes. Chip re-renders with the new badge indicator. Match awards card (if visible) shows the new award.
3. **Tap an empty slot.** Banner pulses amber, no modal opens.
4. **Tap a filled sub chip.** Same as #2 — badge modal opens for that player.
5. **Try to drag a chip.** Still nothing happens (session 20 silent no-op holds).
6. **Active (today or future) match — regression check.** Tapping a filled slot still opens the player picker (swap flow), NOT the badge modal. The lock-routing only triggers when `isMatchLocked` is true.
7. **Award flows from elsewhere still work.** Squad tab `data-award-badge` button → all-time badge (no `lineup_id`). Result wizard step 5 `data-rw-award-pid` chips → result-flow badges. Neither should behave differently.

### Start-here on the new machine (session 21)

1. Upload `app.js` and `HANDOFF.md` to GitHub via the web UI. (Note: `styles.css` untouched this session.)
2. Vercel auto-deploys.
3. Hard-reload; clear cache if needed.
4. Run the sanity-check script above.

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg`.
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

---

## Previous session — Where we left off on 2026-04-20 (session 20)

**Two fixes on the match editor: autosave no longer collapses the whole tab, and past-date matches lock the pitch.** Chris reported two connected issues while adding players to the pitch in match mode: (1) "takes a second once added and the matches collapse and reload for a split second causing issues if you choose another player too quickly", and (2) "if a game has passed the playdate we shouldn't be able to change the lineup on the pitch (can add badges though)". Both shipped this session.

### Shipped this session (session 20)

1. **Root cause of the "collapse + reload" flash was `saveLineupWithMsg` calling `renderLineupsTab()` unconditionally.** Every chip move triggers `refreshAfterChipMove` (targeted local DOM update) then `scheduleAutosaveIfPublished` (800ms debounce → DB write). After the DB write resolved, the final line of `saveLineupWithMsg` rebuilt the ENTIRE Matches tab — wiping the open editor, re-running all renderers, and re-wiring every event listener. If a coach tapped a second slot during that rebuild window (~50–300ms), the tap landed on a stale slot element that was about to be replaced — the picker either didn't open at all or opened for the wrong position. **Fix:** `renderLineupsTab()` now only fires when `msgEl` is present — i.e. only for EXPLICIT saves (Save button, status-change pills). Autosave (msgEl = null) and `flushAutosave` (pre-navigation) skip the rebuild because `refreshAfterChipMove` has already reconciled the UI locally. Net effect: coaches can tap/drag multiple chips in quick succession with zero flicker, and the "split second gap" disappears.
2. **`isMatchLocked(lineup)` helper.** Returns true when `lineup.game_date < today (ISO yyyy-mm-dd)`. Null date = not locked (TBD matches stay editable). Today's matches (game_date === today) are editable too — coaches need to be able to make last-minute changes on matchday. Simple date compare, no time-of-day check.
3. **Pitch lock on past-date matches.** Gated ALL lineup-edit entry points:
   - `wirePicker()` slot + sub click handlers check `isMatchLocked(editor.current)` before opening the player picker.
   - Global `pointerdown` chip-drag listener refuses to start a drag when the current match is locked.
   - `handleDropToSlot`, `handleDropToSub`, `handleDropToPalette` all early-return when locked — defensive guard so any future code path that calls them directly is safe.
   - Badges, MOTM, scorers, and the result wizard stay editable: they're separate code paths (`data-award-badge` button, result form inputs, JSONB writes) that don't touch the pitch-slot assignment flow.
4. **Locked banner + pulse feedback.** When a match is locked, a small amber banner renders above the pitch card: `🔒 Match played — lineup is locked.` with a sub-line `You can still enter the result, award badges, and set MOTM / scorers.` If a coach taps a pitch slot on a locked match, `flashLockedPitch()` restarts a 0.55s CSS pulse animation on the banner — enough to draw the eye without blocking the click with an alert. Force-reflow trick (`void el.offsetWidth`) restarts the animation on repeat taps.

### Files touched (session 20)

- `app.js` — one-line fix in `saveLineupWithMsg` (`renderLineupsTab()` → `if (msgEl) renderLineupsTab();`). New `isMatchLocked` helper near `handleDropToPalette`. New `flashLockedPitch` helper near `wirePicker`. Guards added in `wirePicker` (slot + sub click handlers), global `pointerdown` drag listener, and all three `handleDropTo*` functions. Locked-banner markup inserted at the top of `.me-pitch-col` in `renderLineupsTab`. Net line count 13894 → 13948 (+54).
- `styles.css` — new `.pitch-locked-banner` / `.pitch-locked-ic` / `.pitch-locked-sub` / `.pitch-locked-pulse` + `@keyframes pitch-locked-pulse-anim`. ~37 new lines (4459 → 4496).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 20)

**None.** No schema changes. Lock is a pure client-side guard based on `game_date` — the server already accepts writes from any past-date match (RLS only cares about team role). Intentional: if a coach somehow bypasses the guard (different build cached on another device), the DB still accepts the edit so we never block legitimate data. The lock is a UX guardrail, not a security boundary.

### Design decisions locked in (session 20)

- **Autosave is invisible by design.** Manual save + status changes still re-render the tab so the match card on the left stays in sync with any opponent / date / status tweaks. Autosave is only for chip-level moves where the local `refreshAfterChipMove` has already updated everything visible.
- **Lock is per-match, evaluated at render time.** No "locked_at" column, no manual lock toggle. When the clock rolls past midnight UTC, yesterday's matches auto-lock on next render. Simple, predictable, no data to migrate.
- **Today's matches stay editable.** Matchday tweaks (kid got injured in warmup, late arrival, emergency sub) are common — coaches need to reshuffle. The lock only kicks in once the calendar day has passed.
- **TBD / null dates = never locked.** Fixtures without a confirmed date stay editable indefinitely. Once Chris sets a date and it passes, they lock automatically on next render.
- **Silent pointerdown refusal.** When a coach tries to drag a chip on a locked match, nothing happens visibly beyond the banner already being on screen. No alert (would be aggressive on desktop), no toast (adds complexity). Clicking a slot gives the pulse feedback because that's a more deliberate tap gesture; dragging has drift/accidental triggers.
- **Banner says what IS editable, not just what isn't.** Coaches land on a locked match and immediately see the next useful action (enter result, award badges, set MOTM) rather than just a "can't edit" dead-end.

### Sanity-check script (session 20)

1. **Rapid-fire chip placement (was buggy, now smooth).** Open a Published match. Drag player A to slot 1. Immediately (within ~200ms) tap slot 2 and pick player B. Both should land cleanly — no flash, no stale-click miss, no "you're on the wrong slot" confusion.
2. **Autosave still works.** After any chip move, wait ~1 second, then hard-reload the page. The moves persist.
3. **Manual Save still re-renders.** Click the Save button. The match card in the left list updates (name/status/opponent). Info panel stays consistent. No regression from the autosave fix.
4. **Past-date match — banner.** Create a match with game_date set to yesterday (or an old fixture). Open it. Amber `🔒 Match played — lineup is locked.` banner appears above the pitch.
5. **Past-date match — pitch is read-only.** Try to tap an empty slot: banner pulses amber, no picker opens. Try to tap a filled slot: same pulse, picker doesn't open. Try to drag a chip: nothing happens (silent).
6. **Past-date match — result flow still works.** Click "Enter result" → result wizard opens. Enter scores, set MOTM, add a goalscorer, save. All works.
7. **Past-date match — badges still work.** Open the match awards flow (or Squad tab player modal) and award a match-linked badge. Saves. Re-renders. Visible on the pitch chip.
8. **Today's match is editable.** A match with game_date === today still allows chip moves. Banner doesn't show.
9. **TBD match (null game_date) is editable.** Banner doesn't show; chips still draggable.

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg`.
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

### Start-here on the new machine (session 20)

1. Upload `app.js`, `styles.css`, and `HANDOFF.md` to GitHub via the web UI.
2. Vercel auto-deploys.
3. Hard-reload Interpro in the browser; clear cache if you see stale JS.
4. Run the sanity-check script above.

---

## Previous session — Where we left off on 2026-04-20 (session 19)

**Availability rows auto-collapse once a parent has responded.** Small but nice polish on the unified parent page from session 18. Before this: every child in `unlockedPlayers` always rendered with the full 3-button picker (✅ Available / 🤔 Maybe / ❌ Unavailable) + note input, regardless of whether the parent had already replied. Now: on page load, a child with an existing response renders as a compact single-line summary showing a coloured status pill, responder name, and any saved note; a small "Change" button expands it back to the full picker if the parent wants to edit. Chris's exact ask: "can we have availabillity colapsed if allready submitted?" — yes, per child.

Matters more for sibling families (two kids on the roster, parent has already replied for one and not the other). The unresponded child still gets the full picker; the submitted child is tucked into a one-liner so the eye goes to what still needs doing.

### Shipped this session (session 19)

1. **Per-child collapse, not whole-card collapse.** Each row in the availability list is now two sibling `<div>`s wrapped in one `.avail-row`: `.avail-collapsed` (shown when `availByPlayer[pid]` has a non-null status) and `.avail-expanded` (the original 3-button picker + note input, hidden by `style="display:none"` when a response exists). Both blocks live in the DOM from the start, so `wireAvailabilityForm` doesn't need to re-bind event handlers after the swap.
2. **Compact summary row.** Collapsed block shows: photo, `#num Name`, a coloured status pill (reuses the existing `.avail-pills` / `.ap` / `.ap-av` / `.ap-mb` / `.ap-un` palette from `styles.css`), responder name in muted text, saved note in italics if present, and a "Change" button on the right.
3. **"Change" button toggles visibility.** New handler in `wireAvailabilityForm` finds `[data-collapsed-for]` / `[data-expanded-for]` by player id and flips `display: none` — no re-render, no fetch. Once expanded, the row stays expanded for the rest of the session; a page refresh or the 6s poll re-runs `renderParentView` and will re-collapse if the response is still there.
4. **Fixed a latent `.muted` selector ambiguity.** The submit handler used to update the "Last response: …" line via `row.querySelector('.muted')`. The new collapsed block also contains `.muted` spans (for responder name + note), so the selector is now `.avail-last-line` (new dedicated class on the line we actually want to update).

### Files touched (session 19)

- `app.js` — `renderAvailabilityFormHtml` expanded from one row template to a collapsed+expanded pair with a `statusPillHtml(status)` inner helper. `wireAvailabilityForm`: scoped the last-response selector to `.avail-last-line`, added a 4-line loop wiring `.avail-change-btn` clicks to toggle the display of the collapsed/expanded siblings. Net line count 13844 → 13894 (+50).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 19)

**None.** No schema changes. No new tables or columns — `player_availability` already carries everything we need.

### Design decisions locked in (session 19)

- **Collapse is purely visual, driven by initial render.** Don't try to auto-collapse after a successful submit mid-session — it's more useful to leave the expanded block visible so the parent sees "✓ Saved" and the newly-active status button. Next refresh / poll tick collapses it naturally.
- **"Change" button over a generic expand icon.** Explicit verb is friendlier for non-technical parents than a chevron or tap-target that isn't obviously interactive. Labelled `Change`, styled as `.btn-secondary` (grey), small so it doesn't dominate.
- **Per-child, not per-card.** The whole availability card staying fully visible even when collapsed keeps the page rhythm familiar — parents aren't suddenly presented with a "tap to open availability" affordance they didn't have before. They still see the card heading, the name input, and each child's status at a glance.
- **Reuse existing pill palette, no new CSS.** Wrapped the collapsed-state status pill in `<span class="avail-pills">` with `display:inline-flex` override so the existing compound selectors `.avail-pills .ap-av` etc kick in. Zero styles.css churn this session.

### Sanity-check script (session 19)

1. **Fresh parent on match in Availability.** Paste parent link in incognito, unlock with child code. Availability card loads with the full 3-button picker for that child — same as before.
2. **Submit then reload.** Tap Available. Flash "✓ Saved". Reload the page. Row now appears collapsed — photo + `#num Name` + green "✅ Available" pill + "· Sarah (Alex's mum)" + Change button.
3. **With a saved note.** Type a note ("back by 4pm") before submitting Available. Reload. Collapsed row shows the pill AND the note in italics under the responder name.
4. **Tap Change.** Row swaps to the expanded picker (3 buttons + note input), with the previously-saved status already highlighted green and the note already populated.
5. **Change to Maybe.** Tap 🤔 Maybe. "✓ Saved" flashes, last-response line updates to `Last response: maybe — Sarah (Alex's mum)`. Row stays expanded (by design). Reload to see it re-collapse with the amber pill.
6. **Siblings — mixed state.** Family with two unlocked kids; reply for one only. On reload, first child shows collapsed, second child shows the full picker. They don't interfere with each other.
7. **No response yet.** Unresponded child still renders expanded with "No response yet" muted line.
8. **Match in Published (post-flip).** After the coach flips to Published, the same page now shows the pitch below the availability card. Collapsed responses still display correctly (and the pill colour still matches what's saved).

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg` (see memory: Rebrand + URL shortening).
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

### Start-here on the new machine (session 19)

1. Upload `app.js` and `HANDOFF.md` to GitHub via the web UI. `styles.css` untouched this session.
2. Vercel auto-deploys.
3. Hard-reload Interpro in the browser; clear cache if you see stale JS.
4. Run the sanity-check script above.

---

## Previous session — Where we left off on 2026-04-20 (session 18)

**Parent routes unified — one link now does availability + lineup + focus cues.** Before this, coaches had two parent URLs per match: `#/avail/{id}` (availability form, only visible while the lineup was in Availability or Published state) and `#/view/{id}` (lineup + tactics + focus cues, only visible while Published). Same renderer under the hood (`renderParentView` + `renderParentMatchView`), differentiated only by an `opts.mode` flag. This session collapsed the two into a single link parents get once per match: when the lineup is in Availability they see the form; when it flips to Published the same link now *also* shows the pitch, tactics, and each child's focus cues, without a second URL being sent. Chris's exact ask: "the avilabily for the games link canwe no just se that for the avail and the lineups and focus?" — yes, that's now how it works.

This is a nice lead-in to the (parked) URL-shortening work — we only need to generate one short code per match instead of two.

### Shipped this session (session 18)

1. **Mode-gating simplified in `renderParentView`.** Previously:
   ```js
   const showAvailability = viewMode === 'avail' && (status === 'availability' || status === 'published');
   const showPitch = viewMode === 'match' && status === 'published';
   ```
   Now depends only on lineup status — `viewMode` no longer gates which sections render:
   ```js
   const showAvailability = status === 'availability' || status === 'published';
   const showPitch = status === 'published';
   ```
   The draft message (shown when status is 'draft') was similarly simplified — previously it checked `viewMode === 'avail' && status === 'draft'`, now just `status === 'draft'`.
2. **`buildWhatsAppMessage` emits a single link.** Dropped the local `matchUrl` var and the "Match info:" line. New message body:
   > Tap to confirm availability — same link shows the lineup and your child's focus cues once I publish them:
   > {availUrl}
   
   The availability URL is now the one-and-only parent link. `/view/{id}` is still a valid route (see #4) — just no longer surfaced in new messages.
3. **`openShareModal` refactored from two sections to one.** The Share modal on the Matches tab used to render both an "Availability link" section and a "Lineup view link" section with separate copy / native-share buttons (via internal `section('avail')` and `section('view')` helpers). Collapsed to a single `parentLinkSection()`. Removed dead `matchUrl`, `availOpen`, `lineupOpen` state vars. Description text is status-aware — three distinct paragraphs depending on whether the match is Draft, Availability, or Published:
   - Draft: *"Once you switch the match to Availability, this link lets parents confirm their child can play. When you Publish, the same link also shows the lineup, tactics, and each child's focus cues."*
   - Availability: *"Parents tap this to say whether their child can play. When you Publish, the same link will also show the lineup, tactics, and each child's focus cues."*
   - Published: *"Parents see availability form, lineup, tactics, and each child's focus cues — all on this one link."*
4. **Backward compat — `/view/{id}` still works.** Didn't touch the hash router. Already-sent WhatsApp messages with `/view/{id}` keep working because the renderer still accepts both modes — it just ignores `viewMode` for visibility gating now. No migration needed on existing links.

### Files touched (session 18)

- `app.js` — three edits, all in `renderParentMatchView` / `buildWhatsAppMessage` / `openShareModal`. Net line count 13847 → 13844 (−3 after removing dead vars and the second share section).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 18)

**None.** No schema changes. No route changes. Purely client-side rendering logic.

### Design decisions locked in (session 18)

- **One link per match, forever.** When a match is created, the availability URL generated on day one is also the link parents use on matchday — it just shows different things at different stages. Coach never needs to resend a "here's the lineup view" message.
- **`/view/{id}` kept alive.** Deliberately not killing the legacy route — it'd break already-sent WhatsApp links, and the cost of keeping it around is zero.
- **Status-aware Share modal copy.** The description text under the single parent link adapts to the match's current lineup_status so coaches know exactly what parents will see *right now* vs after publishing. Prevents the "did I send the wrong link?" panic.

### Sanity-check script (session 18)

1. **Draft match.** Create a new match. Open the Share modal from the Matches tab. See a single "Parent link" section with the draft-state description. Copy the link, open in an incognito tab — parent view shows the "availability isn't open yet" draft message.
2. **Availability match.** Flip the match to Availability. Share modal description updates. Same link now lets the parent submit availability. Pitch / focus cues NOT visible yet (status is `availability`, not `published`).
3. **Published match.** Flip to Published. Same link now shows availability form AT THE TOP, and below it the pitch with positions, tactical notes, and each child's parent-visible focus cues.
4. **Legacy link.** Paste an older `#/view/{id}` URL (if any still exist in WhatsApp history). Should still work — renders identically to the unified flow for a Published match.
5. **WhatsApp button on the match card.** Tap the 💬 WhatsApp button on the Upcoming tab or inside the Matches-tab Share modal. Pre-filled message should contain the new one-line "Tap to confirm availability — same link shows the lineup and your child's focus cues once I publish them:" copy and a SINGLE URL (no more "Match info:" line).

### Still pending

- **URL shortening + custom domain** — parked until Chris buys `gengen.football` + `gengen.gg` (see memory: Rebrand + URL shortening). Now cheaper to implement because only one short code per match is needed.
- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

### Start-here on the new machine (session 18)

1. Upload `app.js` and `HANDOFF.md` to GitHub via the web UI (same folder as before). `styles.css` untouched this session.
2. Vercel auto-deploys.
3. Hard-reload Interpro in the browser; clear cache if you see stale JS.
4. Run the sanity-check script above.

---

## Previous session — Where we left off on 2026-04-20 (session 17)

**Per-parent WhatsApp nudge shipped.** Notifications-channel question finally got a v1 answer: WhatsApp deep-links, one per parent-on-file. Zero infra, zero recurring cost, works on every phone. Coach taps `🔔 Nudge non-responders` on either Upcoming-tab card; a sheet lists kids who haven't replied, with a green WhatsApp button per parent phone number on file. Tap → WhatsApp opens with a pre-filled message that includes the child's first name, the event date/time, and the availability link. Phone normaliser handles UK `+44` and domestic `0` prefixes (also `0044`, `44`, and bare subscriber numbers); Chris's nudge on this was explicit. Nothing else changed — the decision for email/SMS/push still deferred.

### Shipped this session (session 17)

1. **`waPhone(raw)` phone normaliser.** Converts any parent-entered UK format into the digits-only form `wa.me` expects. Handles `+44 7123 456789`, `07123 456789`, `0044 …`, `44 …`, `7123456789`, with any combination of spaces/dashes/brackets. Returns `''` when the input can't plausibly dial so the UI can show "No number on file" rather than a broken link. Non-UK entries with a country code pass through unchanged.
2. **Nudge message builders.** `buildNudgeMatchMsg(player, parentFirst, match, team)` and `buildNudgeTrainingMsg(player, parentFirst, session, team)` — short friendly texts pre-filled with child's first name + event date/time + the availability/training URL. Short enough that Chris usually won't edit before sending.
3. **`openNudgeSheet(mode, data, team)` modal.** Reuses the existing `.picker-overlay` / `.picker-modal` classes. Lists non-responded players alphabetically; each row has one WhatsApp-green button per parent-on-file (labelled with the parent's first name). Players with no phone get a `No number on file — add in Squad →` inline link that closes the sheet and jumps to the Squad tab. Invalid phones render a disabled grey button.
4. **Wired the Upcoming tab.** Added module-scope `_upcomingNudgeData = { training, match }` cache, reset at the top of every `renderUpcomingTab` call. Both async availability fetches now also build a non-responders list (roster minus whoever submitted any intent/status) and stash it on the cache. The `🔔 Nudge non-responders` button's click handler was previously a "coming soon" alert — it now reads the cache and calls `openNudgeSheet`. Falls back to "still loading" if tapped before the fetch resolves.
5. **CSS for the nudge sheet.** `.nudge-list` (flex column, `max-height: 60vh` + scroll), `.nudge-row` (flex, wraps on narrow), `.nudge-name` (600 weight), `.nudge-wa` (WhatsApp green, white text, pill-ish), disabled-state greying, `.nudge-add-link` (amber for the "add in Squad" fallback).

### Files touched (session 17)

- `app.js` — inserted five new helpers and one module-scope var right after `buildWhatsAppMessage` (`waPhone`, `buildNudgeMatchMsg`, `buildNudgeTrainingMsg`, `openNudgeSheet`, `_upcomingNudgeData`). Modified `renderUpcomingTab`: added `playerById` map, reset cache at top, populated `_upcomingNudgeData.training` / `.match` in each async fetch, replaced the placeholder nudge-button alert with a call to `openNudgeSheet`, updated the `title=` tooltip on both nudge buttons. ~213 new lines (13638 → 13851).
- `styles.css` — added the `.nudge-*` block at the end of the file. ~65 new lines (4394 → 4459).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 17)

**None.** `players.parent1_name` / `parent1_phone` / `parent2_name` / `parent2_phone` already exist on the schema and are already editable via the Squad tab player modal (lines 5083–5089). No new columns needed.

### Design decisions locked in (session 17)

- **v1 notifications channel = WhatsApp deep-links.** Cheaper than Twilio (zero recurring cost), more reliable than self-hosted SMS gateways, and parents already have WhatsApp. Trade-off: one tap per parent rather than a bulk blast — acceptable for a 12–16 kid squad. Email/SMS can layer on later without removing this.
- **Phone-number entry lives in the Squad tab.** Not a new tab, not a separate onboarding step — Chris already enters players there; parent phones slot in alongside name/DOB. (Fields already existed in the schema + modal.)
- **Nudge button only on the Upcoming tab for v1.** Deliberately NOT adding it to the Matches tab or Training attendance tracker yet — keep the surface area small until Chris has used it a few times and tells us where else it needs to live.

### Sanity-check script (session 17)

1. **Upcoming tab still loads.** Counts + name pills render as before.
2. **Nudge button — match card.** Tap `🔔 Nudge non-responders` on the match card. A sheet opens titled "Nudge non-responders — match". Kids who haven't replied are listed alphabetically. Each row shows a green WhatsApp button per parent-on-file. Tapping a button opens WhatsApp with a pre-filled message that includes the child's first name + match details + availability link.
3. **Nudge button — training card.** Same behaviour on the training card. Message references the training session + the rolling training link.
4. **Phone-number edge cases.** Test parents with `+44 7700 900123`, `07700 900123`, `07700900123`, `0044 7700 900123` — all should open WhatsApp to the correct `+44 7700 900123`. A parent with no phone on file shows the `No number on file — add in Squad →` link instead of a button.
5. **Empty state.** If every kid has responded, the sheet shows `Everyone's responded! Nothing to nudge.`
6. **Tapped before loaded.** Rare but testable: tap the nudge button before the async fetch has filled the cache (e.g. very slow network) — an alert says "Still loading responses — give it a second and try again."

### Still pending (for notifications, when the decision lands)

- **Email notifications on publish.** Different channel, different audience (some parents prefer email). Not blocked by the WhatsApp nudge.
- **SMS fallback for parents without WhatsApp.** Deferred — Twilio's too pricey; revisit if enough parents complain.
- **Bulk blast vs per-parent taps.** If Chris ends up wanting a "send to everyone" option later, that's a different UI. For now per-parent is what we've got.

### Next up (unchanged)

- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.

### Start-here on the new machine (session 17)

1. Upload `app.js`, `styles.css`, and `HANDOFF.md` to GitHub via the web UI (same folder as before).
2. Vercel auto-deploys.
3. Hard-reload Interpro in the browser; clear cache if you see stale JS.
4. Run the sanity-check script above.
5. (Optional housekeeping) Delete `app.js.broken` from the workspace once you're happy the restored file is stable — it was kept as a forensics safety net.

---

## Previous session — Where we left off on 2026-04-20 (session 16)

**File-rescue + Upcoming-tab polish.** The deployed `app.js` was discovered truncated at line 13277 mid-template-literal inside `renderAdminTab` — everything after that (rest of admin UI, `renderUpcomingTab`, boot code, event handlers) was missing, causing `Uncaught SyntaxError: Unexpected end of input` in the browser. Chris uploaded a clean copy of `app.js` from earlier today (post-session-14, 13404 lines); I swapped it in, re-applied all 8 session-15 edits (Upcoming tab + landing picker + tab-bar entries), then added three follow-on refinements Chris asked for on the Upcoming tab: WhatsApp button, per-status name pills, draft-guard on the WhatsApp button.

### Shipped this session (session 16)

1. **File rescue.** Swapped the truncated `app.js` for the uploaded clean copy, then re-applied session 15 fresh: `LANDING_TAB_OPTIONS = ['upcoming', …]`, `LANDING_TAB_DEFAULT = 'upcoming'`, Upcoming button on horizontal tab bar + nav drawer + desktop sidebar, dispatch branch in `renderTeamDashboard`, full `renderUpcomingTab` function (pulled out of `app.js.broken` since that function lived entirely above the truncation point), Admin picker `Upcoming (default)` option. Backed up the truncated file as `app.js.broken` in the workspace for forensics — safe to delete once Chris confirms the restored file is stable.
2. **💬 WhatsApp button on the match card.** Reuses `buildWhatsAppMessage(nextMatch, team)` — same composer the Matches-tab Share modal uses. Builds the pre-filled text, copies to clipboard, opens `wa.me` in a new tab. Green WhatsApp brand colour (`#25D366`) to match the existing "Share to WhatsApp" button elsewhere. Deliberately does NOT auto-flip a draft to Availability (that's an explicit state change; see #4 below).
3. **Per-status name pills below the count chips.** Both cards now show WHO responded yes/maybe/no underneath the count chips. One pill per kid, colour-coded (green / amber / red), no icon inside each pill (colour carries it). Alphabetised within each status, green → amber → red order. **Unresponded names are not shown** by design — just the `—` count chip represents them. Reuses the existing `.avail-pills` / `.ap` / `.ap-av` / `.ap-mb` / `.ap-un` classes verbatim so the styling matches the count chips exactly (same rounded shape, same 0.72rem font). Data fetches updated to select `player_id` alongside `intent` / `status` and group by bucket; player names resolved from `editor.players`. Tried a "one pill per status, names comma-joined inside" variant (full-width stretched pills) and reverted — Chris preferred the chip-per-kid look.
4. **Draft-guard on the WhatsApp button.** When `nextMatch.lineup_status === 'draft'`, the button renders as disabled, greyed-out (`#e0e0e0` bg, `not-allowed` cursor, `0.7` opacity), labelled `💬 WhatsApp (draft)`, with a tooltip: *"Match is still Draft — open the match and set it to Availability first."* HTML `disabled` attribute so no click fires. The status-flip stays explicit — coach must open the match and change the status pill deliberately. Once flipped to Availability or Published, the pill reverts to the green active button.

### Files touched (session 16)

- `app.js` — full file-swap from the upload; then re-applied session-15 edits; then modified `renderUpcomingTab`: added `playerNameById` Map, `ucNamesLine(groups)` inner helper, WhatsApp button rendering with draft-guard IIFE, `[data-uc-wa-match]` click handler calling `buildWhatsAppMessage`, training + match async fetches now select `player_id` too and call `ucNamesLine`.
- `styles.css` — added `.uc-wa-btn` / `.uc-wa-disabled` / `[disabled]` styles (greyed palette for draft state, brightness-filter on hover for active state); added `.uc-names-wrap` + `.uc-name-pills` (just `margin-top`; the pills themselves are styled by the existing `.avail-pills` block).
- `app.js.broken` — preserved copy of the truncated file (can be deleted after confirmation).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 16)

**None.** No schema changes.

### Cause of the truncation (best guess)

Workspace is not a git repo — files are uploaded to GitHub via the web UI. Truncation shape (clean cut mid-template-literal, exactly 127 lines lost off the tail) is consistent with either (a) an interrupted save in the GitHub web editor, (b) a copy/paste that hit a clipboard boundary, or (c) an editor that autosaved a partial buffer. **Avoid editing `app.js` directly in the GitHub web UI going forward** — the file's big enough (>13k lines) that the web editor has been unreliable.

### Sanity-check script (session 16)

1. **File loads without syntax error.** Open DevTools console, reload Interpro, sign in, tap a team. No `Uncaught SyntaxError` from `app.js`. `vendor.js` extension errors are unrelated and can be ignored.
2. **Upcoming tab renders with count chips.** Both cards show the four-chip row (✓ / ? / ✗ / —).
3. **Name pills under the chips.** Each responded player appears as a small coloured pill — green for Available, amber for Maybe, red for Unavailable. Alphabetised. Unresponded kids do NOT appear as pills (only in the — count).
4. **Match WhatsApp button — Draft.** Create a new match or leave an existing one at Draft. The button renders greyed, labelled `💬 WhatsApp (draft)`, tooltip explains why. Clicking does nothing.
5. **Match WhatsApp button — Availability.** Flip status to Availability via the Matches tab. Return to Upcoming. Button is green, labelled `💬 WhatsApp`. Tap it → WhatsApp opens in a new tab with the pre-filled match message; the same text is on the clipboard.
6. **Tab jumps still work.** Open match → lands inside the match editor. Open parent link → new tab loads parent training page.

### Still pending (for notifications, when the decision lands)

Unchanged from session 15 — the 🔔 Nudge buttons stay as placeholders until the sitewide notifications channel decision is made.

### Next up (unchanged)

- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.
- **Sitewide notifications design** — unblocks the nudge buttons and several deferred asks.

### Start-here on the new machine (session 16)

Pull `app.js` + `styles.css`. No DB changes. Smoke test: open a team → lands on Upcoming → both cards show count chips + coloured name pills underneath → if a match is Draft, WhatsApp button is greyed with "(draft)" label, otherwise it's green and opens `wa.me` with a pre-filled message.

---

## 🔖 Where we left off on 2026-04-20 (session 15)

**New "Upcoming" tab shipped — at-a-glance next training + next match availability for coaches.** Tab bar gains a leftmost `Upcoming` tab; it's the new default landing page for anyone who hasn't explicitly picked a different landing tab. Two stacked summary cards: next training (from `teams.training_schedule` + `training_attendance`) and next match (next upcoming lineup + `player_availability`). Each card shows the existing count-pill row (✓ / ? / ✗ / —) and includes a **🔔 Nudge non-responders** placeholder button — intentionally not plumbed in, because the sitewide notifications decision (WhatsApp / SMS / push / email) is still parked. Tapping the nudge button shows a "coming soon" explainer; nothing is sent.

### Shipped this session (session 15)

1. **New top-level tab `Upcoming` + new default.** `LANDING_TAB_OPTIONS` gained `'upcoming'` as its first entry; `LANDING_TAB_DEFAULT` flipped from `'lineups'` to `'upcoming'`. Coaches who've explicitly saved a pick (`team_members.landing_tab` column) stay on their pick — the flip only affects anyone who's been falling back to the default. Tab button is leftmost on the horizontal header, the nav drawer (phone), and the desktop sidebar (all three mirror each other). The Admin → "My landing page" picker now shows `Upcoming (default)` as the first option; Matches/Squad/Tactics below.
2. **`renderUpcomingTab` renderer.** Reads `editor.team / editor.players / editor.lineups` populated by a new dispatch branch in `renderTeamDashboard`. Renders a `.upcoming-wrap` with an intro line + two `.uc-card`s. Each card: header row (`🏋 Next training` / `⚽ Next match` label + primary line day/date/time + secondary line location/venue), count row `.uc-counts` (initially "Loading responses…", replaced async by `availPillsHtml(counts, rosterSize)`), action row (placeholder **🔔 Nudge non-responders** + a context-appropriate second button: Open parent link ↗ for training, Open match → for matches). Empty state per card: dashed link to set up a schedule or create a match.
3. **Data fetches (both parallel, non-blocking).** Training: `nextUpcomingTraining(team)` → `supabase.rpc('ensure_training_session', { p_team_id, p_date })` → `select('intent').from('training_attendance').eq('session_id', …)` → count by intent. Match: `_findDefaultLineupId(upcomingOnly)` → `loadAvailabilityCountsForLineups([id])`. Failures degrade to an inline "couldn't load responses" message; the tab shell never gets stuck.
4. **Tab-to-tab jumps.** Empty-state links (`set one up`, `create one on Matches`) and the "Open match →" button work by programmatically `.click()`ing the matching `.h-tab[data-tab="…"]` button — reuses the existing tab-switch handler (with its `flushAutosave`, `openCards.clear()`, and closure over user/teamId) so no user stash needed on module scope. "Open match" sets `_pendingLineupIdToOpen` first so the Matches tab lands inside the match editor.
5. **Nudge button placeholder.** Clicking either nudge button shows an `alert()` explaining the decision is pending and pointing at the existing Share-to-WhatsApp flow. Deliberately unwired — don't hook it up until the sitewide notifications design is agreed.
6. **CSS.** Appended a small block at the end of `styles.css`: `.upcoming-wrap`, `.uc-intro`, `.uc-card`, `.uc-head`, `.uc-line-primary`, `.uc-line-meta`, `.uc-counts`, `.uc-empty`, `.uc-loading`, `.uc-actions`, `.uc-nudge-btn`. Reuses the existing `.avail-pills` / `.ap` styles for the count chips — no duplication.

### Files touched (session 15)

- `app.js` — `LANDING_TAB_OPTIONS` + `LANDING_TAB_DEFAULT` updated; horizontal tab bar + nav drawer tabs array + desktop sidebar tabs array each got a new `Upcoming` entry at the top; new `if (activeTab === 'upcoming')` dispatch branch in `renderTeamDashboard`; new `async function renderUpcomingTab()` inserted above `renderSquadTab`; Admin tab landing-page picker got `Upcoming (default)` as first option.
- `styles.css` — Upcoming-tab block appended at end.
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 15)

**None.** Both data sources already exist from earlier sessions: `training_sessions` + `training_attendance` (session 14 rebuild), `player_availability` (legacy).

### Sanity-check script (session 15)

1. **Default lands on Upcoming.** Clear `prefs_landing_tab` from localStorage (or open in private window). Reload, sign in, tap a team. Opens on Upcoming. (Coaches with an explicit saved pick stay on that pick — expected.)
2. **Two cards render.** Training card = day/date/time + location. Match card = vs Opponent (H/A) + day/date/time + venue. Both flip from "Loading responses…" to count pills within ~300ms.
3. **Training counts match parent view.** Unlock parent training link, tap Available. Reload Upcoming — ✓ count +1, — count −1.
4. **Match counts match the Matches tab.** Open the next match in Matches, check counts in header. Upcoming card shows the same numbers.
5. **Empty states.** Temporarily null out `teams.training_schedule` → training card shows "No training schedule yet. Set one up on Squad details →". Click link → jumps to Squad tab. Team with no upcoming match → match card shows "No upcoming match. Create one on Matches →".
6. **Open match button.** Lands inside the match editor on the Matches tab (not the cards list).
7. **Open parent link button.** New tab opens `#/train/{teamId}`.
8. **Nudge button placeholder.** Tapping either nudge button pops an alert explaining it's coming soon + pointing at Share-to-WhatsApp. No state changes.
9. **Admin picker.** Admin → "My landing page" → four options, Upcoming first with "(default)". Change to Matches, reload app, lands on Matches. Change back.
10. **Phone drawer + desktop sidebar.** Both show "📅 Upcoming" as the top entry.

### Still pending (for notifications, when the decision lands)

The nudge button is the only hook that needs wiring once you pick a channel. Today we only have aggregate non-responder count; a small follow-up will surface the actual list of non-responders (to pull contact details) when the nudge is armed.

### Next up (unchanged)

- **Team hub link** — one permanent URL per team wrapping match + training + season.
- **Slice 6 — Season / history page** (parent-facing, gated by access code).
- **Admin panel, email notifications on publish, audit log UI** — Slice 5 carryover.
- **Visual / design pass** — still deferred.
- **Sitewide notifications design** — unblocks the nudge buttons and several deferred asks.

### Start-here on the new machine (session 15)

Pull `app.js`, `styles.css`, `HANDOFF.md`. No DB changes. Smoke test: open the team, land on Upcoming, see both cards render with counts. Tap Nudge → coming-soon alert. Tap Open parent link → new tab loads parent training page. Tap Open match → lands inside the match editor. Admin → My landing page should default to "Upcoming (default)".

---

## 🔖 Where we left off on 2026-04-20 (session 14)

**Slice 8 rescue — schema clean-rebuild + visible save confirmation + shareable training link. Training & attendance now working end-to-end.** Session 13 shipped Slice 8 but the parent view threw "⚠ Saving attendance isn't available yet" on every submit. The cause: **a stale `training_sessions` table from an earlier design iteration was still in the DB, so the `CREATE TABLE IF NOT EXISTS` in session 13's chunk 1 silently skipped creation, and the corresponding `ensure_training_session` RPC from that earlier iteration was reading completely different columns + a different `training_schedule` shape than the client writes.** Fixed with a clean rebuild of the three training objects. Also added two UI tweaks Chris asked for after session 13: a visible "Currently saved" summary block on the schedule editor card, and a standalone shareable training link (Copy / Open / WhatsApp buttons).

### Shipped this session (session 14)

1. **Full clean-rebuild SQL run in Supabase.** Dropped old `training_sessions`, `training_attendance`, `ensure_training_session`, `submit_training_intent`. Recreated all four to match what the client actually writes and reads. No real attendance data was lost (only a test tap).
2. **Visible "Currently saved" summary block.** Squad → Team info → Training schedule card now shows a grey summary box listing every saved slot ("Tuesday 19:00–20:00 · St Wilfreds Blackburn") above the editor. The editor itself is tucked behind a `<details>` toggle ("✎ Edit schedule" / "+ Set up schedule").
3. **Standalone shareable training link block.** Dashed-border box on the schedule card once a schedule is saved, with the permanent `#/train/{team_id}` URL + Copy / Open / WhatsApp buttons. Complements the piggy-back in the match WhatsApp message.
4. **End-to-end verified working.** Parent view unlocks with a kid code, availability submits land in `training_attendance`, the warning is gone.

### The actual problem (for future-you's sanity)

Chunk 1 of session 13's migration used `CREATE TABLE IF NOT EXISTS public.training_sessions (...)`. Because an older table of the same name from a pre-compaction design iteration was already present, the whole `CREATE TABLE` was skipped — including the new column definitions. The old table's columns were `session_date / start_time / end_time / location_name / location_postcode`, and the old `ensure_training_session` RPC read `training_schedule` as a **single object** with `{enabled, day_of_week, ...}` keys, using `extract(isodow from p_date)` (Mon=1..Sun=7). My client writes `training_schedule` as a **JSONB array** `[{"day":2,"end":"20:00","start":"19:00","location":"..."}]` with `day` using JS `getDay()` (Sun=0..Sat=6), and reads `training_sessions` as `scheduled_date / scheduled_start / scheduled_end / location`. Two different generations of the feature tripping over each other.

### Clean-rebuild SQL that was run this session (for reference / new machine)

```sql
-- 1. Drop old mismatched objects
DROP FUNCTION IF EXISTS public.submit_training_intent(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.ensure_training_session(uuid, date);
DROP TABLE IF EXISTS public.training_attendance CASCADE;
DROP TABLE IF EXISTS public.training_sessions CASCADE;

-- 2. training_sessions (one row per concrete date)
CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_start text,
  scheduled_end text,
  location text,
  status text NOT NULL DEFAULT 'scheduled',   -- 'scheduled' | 'cancelled' | 'moved'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, scheduled_date)
);
CREATE INDEX training_sessions_team_date_idx ON public.training_sessions (team_id, scheduled_date);

-- 3. training_attendance (one row per player per session)
CREATE TABLE public.training_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  intent text,           -- 'available' | 'maybe' | 'unavailable'
  attended boolean,      -- coach-recorded actual attendance
  note text,
  responded_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, player_id)
);
CREATE INDEX training_attendance_session_idx ON public.training_attendance (session_id);

-- 4. RLS
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_sessions_read  ON public.training_sessions  FOR SELECT USING (true);
CREATE POLICY training_attendance_read ON public.training_attendance FOR SELECT USING (true);
CREATE POLICY training_sessions_write_auth  ON public.training_sessions  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY training_attendance_write_auth ON public.training_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Parents write only via the SECURITY DEFINER RPC below; no anon write policy.

-- 5. ensure_training_session — finds the matching slot in teams.training_schedule
--    training_schedule is a JSONB array: [{"day":2,"start":"19:00","end":"20:00","location":"..."}]
--    day uses JS getDay() (0=Sun..6=Sat), matching PG extract(dow).
CREATE OR REPLACE FUNCTION public.ensure_training_session(
  p_team_id uuid,
  p_date date
) RETURNS public.training_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_schedule jsonb; v_slot jsonb; v_dow int;
  v_start text; v_end text; v_location text;
  v_row public.training_sessions;
BEGIN
  SELECT training_schedule INTO v_schedule FROM public.teams WHERE id = p_team_id;
  IF v_schedule IS NULL OR jsonb_typeof(v_schedule) <> 'array' THEN
    RAISE EXCEPTION 'No training schedule configured for team';
  END IF;

  v_dow := extract(dow from p_date)::int;

  SELECT elem INTO v_slot
  FROM jsonb_array_elements(v_schedule) AS elem
  WHERE (elem->>'day')::int = v_dow
  LIMIT 1;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'No training slot on %', to_char(p_date, 'YYYY-MM-DD');
  END IF;

  v_start := v_slot->>'start'; v_end := v_slot->>'end'; v_location := v_slot->>'location';

  INSERT INTO public.training_sessions
    (team_id, scheduled_date, scheduled_start, scheduled_end, location)
  VALUES (p_team_id, p_date, v_start, v_end, v_location)
  ON CONFLICT (team_id, scheduled_date) DO UPDATE
    SET scheduled_start = COALESCE(public.training_sessions.scheduled_start, EXCLUDED.scheduled_start),
        scheduled_end   = COALESCE(public.training_sessions.scheduled_end,   EXCLUDED.scheduled_end),
        location        = COALESCE(public.training_sessions.location,        EXCLUDED.location),
        updated_at      = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 6. submit_training_intent — parent submits availability, validated by access/family code
CREATE OR REPLACE FUNCTION public.submit_training_intent(
  p_session_id uuid, p_player_id uuid, p_code text,
  p_intent text, p_note text, p_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_team_id uuid; v_norm text; v_ok boolean;
BEGIN
  IF p_intent NOT IN ('available','maybe','unavailable') THEN RAISE EXCEPTION 'Invalid intent: %', p_intent; END IF;

  SELECT team_id INTO v_team_id FROM public.training_sessions WHERE id = p_session_id;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'Unknown session'; END IF;

  v_norm := upper(regexp_replace(coalesce(p_code,''), E'\\s', '', 'g'));
  IF v_norm = '' THEN RAISE EXCEPTION 'Code required'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = p_player_id AND p.team_id = v_team_id
      AND (upper(p.access_code) = v_norm OR upper(p.family_code) = v_norm)
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'Invalid code for this player'; END IF;

  INSERT INTO public.training_attendance
    (session_id, player_id, intent, note, responded_by, updated_at)
  VALUES (p_session_id, p_player_id, p_intent, nullif(p_note,''), nullif(p_name,''), now())
  ON CONFLICT (session_id, player_id) DO UPDATE
    SET intent = EXCLUDED.intent, note = EXCLUDED.note,
        responded_by = EXCLUDED.responded_by, updated_at = now();
END;
$$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION public.ensure_training_session(uuid, date)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_training_intent(uuid, uuid, text, text, text, text)    TO anon, authenticated;
GRANT SELECT ON public.training_sessions   TO anon, authenticated;
GRANT SELECT ON public.training_attendance TO anon, authenticated;
GRANT ALL    ON public.training_sessions   TO authenticated;
GRANT ALL    ON public.training_attendance TO authenticated;
```

**Note:** this clean-rebuild supersedes session 13's 7-chunk migration. For a fresh DB, run only this session-14 SQL; session-13 SQL should NOT be re-run.

### Files touched (session 14)

- `app.js` — `renderSquadTab` training card: added "Currently saved" summary block above the editor `<details>`; added shareable training link block (Copy / Open / WhatsApp buttons); editor fields moved inside a `<details>` element.
- Supabase — clean-rebuild SQL above.
- `HANDOFF.md` — this entry.

### Start-here on the new machine (session 14)

Pull `app.js` and `HANDOFF.md`. If the DB has already been through session 14's rebuild (which it has on prod), do nothing on the DB. If spinning up fresh, run the clean-rebuild SQL above (NOT session 13's chunks).

---

## 🔖 Where we left off on 2026-04-19 (session 13)

**Slice 8 — Training & attendance shipped.** Recurring weekly schedule per team + permanent rolling parent link + coach attendance tracker + per-session overrides + WhatsApp share piggy-back. Uses the existing kid / family access-code pattern (no new auth). **Note: this session's 7-chunk DB migration was superseded by session 14's clean rebuild — see session 14 above. The client code described here is still in place.**

### Shipped this session (session 13)

1. **Database migration (superseded — see session 14).** Added `teams.training_schedule` JSONB column + `training_sessions` table (per-date materialisation; status scheduled/cancelled/moved) + `training_attendance` table (per-player intent: available/maybe/unavailable + coach-side `attended` bool + note) + `ensure_training_session(p_team_id, p_date)` RPC + `submit_training_intent` RPC + RLS. Session 14 rebuilt all of this from scratch to fix a schema-drift bug; the rebuild is what's live today.
2. **Training schedule editor (Squad tab → Team info subtab).** Multi-row editor for Tue+Thu-style teams. Day select + start/end time + optional location. Rows add/remove client-side; saved as JSONB array on `teams.training_schedule`. Session 14 added a visible saved-schedule summary + a shareable link block on top of this.
3. **Training helpers (top of `app.js`).** `parseTrainingSchedule`, `computeNextTrainingInstance` (handles the 1h-past-end cutoff that rolls the link forward to next week), `nextUpcomingTraining`, `fmtTimeHHMM`, `toLocalDateStr`, `fmtTrainingHeader`. `DAY_NAMES` / `DAY_NAMES_SHORT` constants.
4. **Public training view — `#/train/{team_id}`.** New public route wired in `currentRoute()` + `render()`. Page resolves the next upcoming session, calls `ensure_training_session` to materialise a concrete row, then renders: session header + code-entry box → per-child intent buttons (✅ / 🤔 / ❌) + optional note field. Submits via `submit_training_intent` RPC which re-validates the access code server-side. Unlock reuses the existing `get_player_by_code(team_id, code)` RPC, `pv_unlocked_*` / `pv_codes_*` localStorage keys, and family-code sibling flow. Cancelled sessions hide the attendance form.
5. **Coach attendance tracker (Squad tab → new Training subtab).** Third subtab. Shows the next upcoming session with: session header + parent link URL, override controls, intent counts (✅/🤔/❌), and a full squad row list with an inline **✓ Attended / ✕ No show / Clear** toggle for post-session ground truth. Writes to `training_attendance` via upsert (authenticated; RLS gates to team members). A "Recent sessions" card lists the last 12 past sessions; clicking opens a modal for editing attendance after the fact.
6. **WhatsApp share piggy-back.** `buildWhatsAppMessage` appends the permanent training link under the match + availability links when the team has a schedule set. One pinned WhatsApp post covers match + training for the whole week. No change when the team hasn't configured training yet.
7. **Per-session overrides.** On the Training subtab, a `<details>` block exposes per-session override controls: change start/end time, change location, add a note, or cancel entirely. Writes update the materialised `training_sessions` row; status flips to `moved` / `cancelled` / back to `scheduled`. Public parent view surfaces these.
8. **Cutoff behaviour.** Parent's training link always shows one session at a time. Cutoff is `end time + 1h`. Before: parents sign up for the upcoming session. After: link flips to next week's instance. Coach tracker is not cutoff-bound.

### Files touched (session 13)

- `app.js` — training helpers block (top, after `AGE_GROUP_OPTIONS`); new `#/train/{team_id}` route in `currentRoute()` and `render()`; `renderTrainingPublicView` + `wireTrainingPublicView` (public parent view) after `renderPlayerCardBody`; `renderSquadTab` training schedule editor + "Training" third subtab; new `renderTrainingTracker` + `openPastTrainingModal` functions; `buildWhatsAppMessage` appends training URL. No CSS changes — reused existing `pv-wrap` / `pv-card` / `avail-*` / `sd-subtabs` / `lineup-phone-tab` classes.

---

## 🔖 Where we left off on 2026-04-18 (session 12)

**Focus mode tap-to-select + pitch-chip focus marker.** Follow-up tweaks on top of session 11's Coach's Focus Phase 2 after Chris flagged UX issues: (1) with 15+ picked players the full list is too long for a phone, so the "All players" toggle option was replaced with a **Focus mode** tap-to-select flow (coach taps player on pitch → only that player's row appears in the Focus panel → add cues → tap next player); (2) no way to see on the pitch which players already have a focus set, so each chip now shows a bottom-right 🎯 pill with the cue count (tinted gold when a primary is set).

### Shipped this session (session 12)

1. **Toggle re-labelled: 📋 Full picked squad · 🎯 Focus mode.** Replaces the earlier "Picked squad / All players" toggle. `_focusListMode` now accepts `'picked'` or `'focus'`, **defaults to `'focus'`** (flipped from `'picked'` later in the session per Chris — tap-to-select scales better on a phone with 15+ players so the tap-prompt is what coaches land on first). `_wireFocusPanel` toggle click handler updated to accept the new values; previously it early-returned on `'focus'`. Leaving focus mode sweeps the selection ring off all chips so stale highlights don't linger.
2. **Tap-to-select flow.** New module-scope state `_focusSelectedPlayerId` (tracks which pitch chip the coach tapped) + `_focusSelectedLineupId` (tripwire so the selection auto-clears when the coach switches matches). New helpers `_focusModeActive()`, `_focusSelectPlayer(pid)`, `_paintFocusSelectionRing()`. `wirePicker` now calls `maybeFocusSelect(el)` before `openPlayerPicker`; when focus mode is active AND the tapped slot has a filled chip, we select that player and return. Empty slots still open the normal player picker (so a coach can pick a new kid and immediately open their focus row with the next tap).
3. **Focus panel — focus-mode branch.** `renderFocusPanelHtml` grew a `_focusListMode === 'focus'` branch: renders a `.focus-tap-prompt` empty state ("👆 Tap a player on the pitch") until a player is selected, then a single `focus-player-row` for just that player. Above the row, a `.focus-quick-switch` strip lists players who already have ≥1 cue — chip-sized buttons with their short name + count, so the coach can hop back to an in-progress player without tapping the pitch again. Active player's quick-chip is purple-filled.
4. **Pitch-chip focus marker.** `applyMatchDecorations` now paints a `.chip-focus-marker` pill in the bottom-right corner of each chip that has ≥1 cue on the current lineup, reading from `_matchCues[lineupId]`. Pill shows `🎯 N` (N = cue count for that player). Gold-tinted with `.has-primary` class when the player's primary cue is set; plain purple otherwise. Tooltip gives a longer description including the primary cue's label. Sits in the only free chip corner (MOTM top-left, goals top-right, availability bottom-right-ish, badges bottom-left — focus marker tucks into bottom-right with a small offset, no visual collision with availability dots in practice).
5. **Lazy cue cache on paint.** `applyMatchDecorations` fires `fetchMatchCues(teamId, lineupId)` on first paint if the cache for that lineup is empty (de-duped via `_matchCuesInflight[lineupId]`). When the fetch resolves it calls `_repaintFocusPitchMarkers()` which re-runs decorations on the pitch + subs row, so the 🎯 pills appear a beat later even when the coach never opens the Focus sub-tab. Previously the cue cache was only populated when the Focus tab was rendered.
6. **Cue CRUD now refreshes pitch markers.** `_rerenderFocusPanel` was extended to call `_repaintFocusPitchMarkers()` after the panel re-renders, so adding/editing/deleting a cue immediately updates the chip pill count and (if primary) the gold tint — no tab switch or reload needed.
7. **Selection auto-clears on lineup switch.** `renderFocusPanelHtml` now checks if `_focusSelectedLineupId !== current.id` and, if so, clears both the selected player id and the tripwire. Belt-and-braces: the existing guard inside the focus-mode branch (`if (_focusSelectedPlayerId && !playersById[_focusSelectedPlayerId])`) still covers the edge case where the same lineup id has a different player roster.
8. **CSS additions.** `.focus-quick-switch`, `.focus-quick-chip` (active state = purple fill, inactive = purple outline), `.focus-tap-prompt*` (dashed-border call-to-action card), `.focus-rows-single`, `.focus-panel.focus-mode-active .focus-intro-head` (purple tint when in tap mode). New `.chip.focus-target-selected` — dashed purple outline + pulsing box-shadow on the selected pitch chip so the coach sees what they've tapped. New `.chip-focus-marker` + `.has-primary` variant for the pitch pill (gold when primary set, purple otherwise), `.chip-focus-icon`, `.chip-focus-count`.

9. **Phase 3 — parent Your Squad card shows focus cues.** `highlightMyChildrenOnPitch` (the renderer for the yellow "Your squad" notice card on the public match page) now renders a `.pv-focus-block` underneath each unlocked child's entry. Block header reads "🎯 Coach's focus for this match"; body renders one `.pv-focus-chip` per parent-visible cue (catalog emoji + label + optional custom note line). Primary cue is gold-tinted with a ★, non-primaries are purple-tinted. Coach-only cues never reach this client — RLS gates anon SELECT on `match_cues` to `visibility='parent_visible' AND team_has_published_lineup(team_id)`; the client also belt-and-braces filters by `visibility === 'parent_visible'` in case a coach who's also a parent is viewing the public page logged in. The public-view data fetch was extended to include `fetchMatchCues(lineup.team_id, lineup.id)` + `fetchCueCatalog()` alongside `fetchTeamBadges`, so the caches are hot by the time `highlightMyChildrenOnPitch` runs. Only unlocked children with `role !== 'none'` get a focus block (no cues rendered for kids who aren't in the squad — the existing apology copy stands alone). Side-benefit: the pitch chip 🎯 pill (from change #4 above) already renders on the parent pitch via `applyMatchDecorations`'s lazy fetch, so parents get both surface-level markers and the detail block in the card. New CSS at end of styles.css: `.pv-focus-block`, `.pv-focus-head`, `.pv-focus-chips`, `.pv-focus-chip` (with `.is-primary` gold variant), `.pv-focus-star`, `.pv-focus-emoji`, `.pv-focus-text`, `.pv-focus-label`, `.pv-focus-note`. Dashed separator between multiple children in the card via `.pv-squad-entry + .pv-squad-entry`.

### Files touched (session 12)
- `app.js` —
  - `_matchCuesInflight` guard added beside `_matchCues`.
  - `_focusListMode` valid values changed to `'picked'` | `'focus'` (was `'picked'` | `'all'`).
  - `_focusSelectedPlayerId` + `_focusSelectedLineupId` state. `_focusModeActive`, `_focusSelectPlayer`, `_paintFocusSelectionRing` helpers.
  - `renderFocusPanelHtml` gained lineup-change tripwire + the focus-mode branch (tap-prompt / selected row / quick-switch strip). Hint text updated to mention "🎯 Focus mode" as an alternative.
  - `_rerenderFocusPanel` now also calls `_repaintFocusPitchMarkers`; new `_repaintFocusPitchMarkers` helper re-runs `applyMatchDecorations` on pitch + subs row.
  - `_wireFocusPanel` — toggle click handler accepts `'focus'`; new `[data-focus-quick-pick]` wiring for quick-switch chips.
  - `wirePicker` — new `maybeFocusSelect(el)` helper intercepts filled-chip clicks when focus mode is active.
  - `applyMatchDecorations` — lazy-fetch block for match_cues; new `.chip-focus-marker` render (count pill, gold when primary present) for each chip with ≥1 cue on this lineup.
- `styles.css` — appended Focus-mode tap-to-select block at end (quick-switch, tap prompt, selection ring, chip-focus-marker).
- `HANDOFF.md` — this entry.

### SQL to run in Supabase (session 12)
**None.** Pure UI / client-side changes on top of the Phase 1 schema.

### Sanity-check script (session 12)
1. **Toggle labels correct.** Open a match → Focus sub-tab. Segmented toggle reads `📋 Full picked squad` and `🎯 Focus mode` with counts after each label. Default is Full picked squad.
2. **Switch to Focus mode with nothing selected.** Tap `🎯 Focus mode`. Panel changes — no long list; instead a dashed-border card with 👆 and "Tap a player on the pitch". If any players already have cues, a "Already set:" strip above the card shows their names as purple-outline chips.
3. **Tap a pitch player.** Tap a filled chip on the pitch. That chip gets a dashed purple pulsing ring. The Focus panel now shows just that player's row with their existing chips + an `+ Add focus` button. Quick-switch strip (if present) doesn't have them highlighted yet (or highlights them if they already had cues).
4. **Add a cue from focus mode.** Tap `+ Add focus`, pick a cue, save. Panel re-renders the single row with the new chip. The pitch chip bottom-right now shows a 🎯 count pill (gold-tinted if the new cue is primary).
5. **Tap a second player.** Tap a different pitch chip. Ring moves to the new chip; the Focus panel swaps to that player's row. Previous player's pitch pill persists (their cues are still there).
6. **Quick-switch chip.** Tap a chip in the "Already set:" strip. Focus panel jumps to that player and the pitch ring moves to their chip.
7. **Empty slot in focus mode.** Tap an EMPTY pitch slot while in focus mode. The normal "Choose player" picker opens (empty slots still fall through — so a coach can pick a kid and immediately move to focus them).
8. **Switch to Full picked squad.** Tap `📋 Full picked squad`. Ring disappears from all chips. Panel reverts to the long list.
9. **Delete a cue.** Delete one of a player's cues. Their pitch 🎯 pill count drops by 1 — or disappears entirely if they had only one. If the primary was removed, any remaining pill loses its gold tint.
10. **Switch matches.** Click a different match in Matches sub-tab. Go to Focus → Focus mode. Selected player is cleared (tap-prompt shows fresh). Pitch pills reflect the NEW match's cues (cache populated lazily on first paint of that pitch).
11. **Open a match BEFORE visiting Focus tab.** Open a match that has cues. Before opening the Focus sub-tab, check the pitch: 🎯 pills should still appear on the correct chips (lazy fetch from `applyMatchDecorations`).
12. **Lineup status / RLS unchanged.** No schema or policy change this session; parents still can't see coach-only cues and only see parent-visible cues on published lineups.

### Known micro-issue to watch
- The `.chip-focus-marker` bottom-right position is close to the availability dot on subs chips. I haven't seen them collide on test devices (the availability dot on subs tends to sit inside the chip rather than overhanging), but if it ever looks cramped, shifting the focus marker a few px up or flipping to bottom-centre would fix it. Flagging so you don't go hunting.

### Next up (carryover from session 11)
- **Phase 3 — parent match page rendering.** Parent-visible cues on each child's lineup view. RLS already allows it; client just needs fetch + render.
- **Phase 4 — in-game focus check.** Tap-if-you-saw-it affordance on the coach's phone during the game.
- **Phase 5 — post-match delivery confirm + outcome_note.**
- **Phase 6 — export text for the match-report Claude project.**
- **Phase 7+ — Admin CRUD for cue_catalog**, templates, player notes.
- **Notifications** — sitewide design pass pending; don't bake into individual features.
- **Visual / design pass.** Still deferred.

### Start-here on the new machine (session 12)
Pull `app.js`, `styles.css`, `HANDOFF.md` (no DB migration). Verify by opening a match, switching to 🎯 Focus sub-tab, tapping `🎯 Focus mode`, then tapping a pitch chip — that player's row should appear in the panel, ring should appear on the chip, and adding a cue should make a 🎯 pill show up in the chip's bottom-right corner.

---

## 🔖 Where we left off on 2026-04-18 (session 11)

**Coach's Focus — Phase 1 (schema) + Phase 2 (coach squad-picker UI) shipped.** New feature, distinct from badges: badges celebrate what happened *after* a match; cues set one thing a player should *focus on* going into the match. Rooted in the FA Four Corner Model (Technical · Physical · Psychological · Social) + Positive Coaching Alliance's ELM (Effort / Learning / Mistakes) and ROOTS (Rules / Opponents / Officials / Teammates / Self), the Emotional Tank metaphor, welfare flags, and position/role cues. ~86 cues seeded into `cue_catalog`; per-match assignments live in `match_cues`.

### Phase 1 — schema (ran in Supabase last session, no file in repo per Chris's SQL-in-chat rule)
- `cue_catalog` table (taxonomy, ~86 seeded rows): slug PK, label, emoji, description, `framework` (FA / ELM / ROOTS / TANK / WELFARE / ROLE / ENCOURAGEMENT), `corner` (technical / physical / psychological / social / welfare / role / encouragement), sub_concept, `visibility` (parent_visible | coach_only), age_band, frequency_cap, default_pairs_with text[], active, sort_order.
- `match_cues` table (per-match assignments): id, team_id / lineup_id / player_id FKs, `cue_slug` FK → cue_catalog, `custom_note` (≤200), `is_primary` bool (unique partial index per lineup+player where true), visibility, `status` ∈ {set, delivered, partial, not_delivered} — default 'set' for Phase 2; outcome_note ≤300 for Phase 5 delivery confirm; sort_order; set_by / reviewed_by auth.users FKs; updated_at trigger. Constraint: must have either cue_slug OR custom_note.
- RLS — anon SELECT gated on `visibility='parent_visible' AND team_has_published_lineup(team_id)` (reuses the session-8 SECURITY DEFINER helper); authenticated members see all via team_members; coach/admin INSERT/UPDATE/DELETE; coach INSERT requires `set_by = auth.uid()`.

### Shipped this session (session 11) — Phase 2 coach-side UI

1. **Cue catalog fetcher + cache.** New module-scope `_cueCatalog` (slug → row map), loaded once per session via `fetchCueCatalog()` (dedupes in-flight fetches through `_cueCatalogLoading`). Fired in parallel with players/lineups in `renderTeamDashboard`'s Promise.all so the catalog is hot by the time the coach opens a match. Helpers `cueEntry(slug)`, `cueLabel(slug)`, `cueEmoji(slug)` mirror the `badgeEntry` shape.
2. **Per-lineup match_cues fetcher + cache.** `fetchMatchCues(teamId, lineupId)` reads all cues for a single lineup and stashes them in `_matchCues[lineupId]`, ordered `is_primary DESC, sort_order ASC, created_at ASC`. First render of the Focus panel for a lineup kicks off the fetch and schedules a light re-render (`_rerenderFocusPanel`) on completion, so coaches don't see a blank panel while the round-trip resolves.
3. **CRUD:** `setMatchCue` (insert, auto-demotes any existing primary on the same lineup+player), `updateMatchCue` (partial patch: cue_slug / custom_note / is_primary / visibility / status / outcome_note — same auto-demote logic), `deleteMatchCue`. All keep `_matchCues` in sync and write audit rows (`entity: 'match_cue'`).
4. **New sub-tab — 🎯 Focus.** Added a 5th entry to `_LINEUP_PHONE_TABS` between Formation and Info. Panel body renders one row per picked player (pitch starters from `current.slots` + subs from `current.subs`, de-duped in slot order) — each row shows primary-starred cue chips first, then non-primary chips, with an `+ Add focus` button (capped at 3 per player). Intro block explains the feature concisely and a stats line shows "X/Y players with a cue · N cues set". Sub-tab switcher now calls `_rerenderFocusPanel()` when Focus is activated so drags-on-the-pitch in Squad don't leave the picked-players list stale.
5. **Focus editor modal — `openFocusEditor({ teamId, lineupId, playerId, cueId? })`.** Shares `.picker-overlay` shell with the award-badge modal. Framework-grouped picker (FA → ELM → ROOTS → Tank → Welfare → Role → Encouragement) with search + category headers + coach-only lock icons on welfare items. Below the picker: 140-char custom-note textarea with live counter, `★ Primary (the one thing)` checkbox (auto-checked on the first cue for a player), `🔒 Coach-only (hide from parents)` checkbox (auto-mirrored from catalog visibility when a welfare cue is picked, so a coach never accidentally leaks it to the parent page). Edit mode populates from the `match_cues` row; add mode blanks. Save calls `setMatchCue` or `updateMatchCue`; inline `Remove focus` button in edit mode deletes.
6. **CSS.** New `.focus-panel`, `.focus-intro`, `.focus-player-row`, `.focus-cue-chip` (rounded purple pill, gold-tinted when primary with an inset star), `.focus-add-btn`, `.focus-editor-modal`, `.fe-group*`, `.fe-item*` styles. 2-column grid on ≥540px, single column on phones. Coach-only cues get a left red border in the picker so welfare items stand out from parent-visible ones.

### Files touched (session 11)
- `web/app.js` —
  - New: `_cueCatalog` / `_cueCatalogLoading` / `_matchCues` module-scope caches; `fetchCueCatalog` / `fetchMatchCues` / `getCachedCueCatalog` / `cueEntry` / `cueLabel` / `cueEmoji` / `getCachedMatchCues` / `cuesForPlayer` / `setMatchCue` / `updateMatchCue` / `deleteMatchCue` at the bottom of the badges block.
  - `renderTeamDashboard` Promise.all now fires `fetchCueCatalog()` alongside `fetchTeamBadges` so the catalog is ready on first paint (destructure is unaffected — result is ignored).
  - `_LINEUP_PHONE_TABS` gained `{ key: 'focus', label: '🎯 Focus' }`.
  - Match editor layout renders a new `<div data-phone-group="focus">` in the sub-tab panel. Its body is built by `renderFocusPanelHtml(current, teamId, players)` which in turn uses `_focusPlayerRowHtml` and `_focusChipHtml` helpers.
  - New `_rerenderFocusPanel()` that patches just the Focus panel body (used after fetches, deletes, and sub-tab activation). New `_wireFocusPanel()` wires Add / chip-click / chip-X handlers; called from `wireLineupEvents` each render.
  - New `openFocusEditor({ teamId, lineupId, playerId, cueId })` modal.
  - Sub-tab click handler now calls `_rerenderFocusPanel()` when the Focus tab is activated so the picked-players list reflects any drags that happened in Squad.
- `web/styles.css` — appended a Focus panel + editor-modal block at the end.
- `web/HANDOFF.md` — this entry.

### SQL to run in Supabase (session 11)
**None.** Phase 1 (cue_catalog + match_cues + RLS + seeds) ran last session. Phase 2 is pure JS/CSS against that schema.

### Sanity-check script (session 11)
1. **Focus sub-tab appears.** Open a played (or upcoming) match in the editor. The sub-tab strip now has six tabs: Matches · Squad · Subs · Formation · 🎯 Focus · Info. Click 🎯 Focus. If no squad is picked yet, the panel reads "Pick your squad on the pitch first…"; otherwise one row appears per picked player (starters + subs), each with a `+ Add focus` button and a `No focus yet.` placeholder.
2. **Add a cue.** Tap `+ Add focus` on a player. Editor modal opens with their name in the header. Search is empty, catalog shows seven framework groups. Pick e.g. **🧠 Scan before you receive** from the Technical group. Note auto-fills `Selected:` header. Leave `★ Primary` checked (auto-checked for first cue). Save. Modal closes; chip appears in the player's row with the gold primary styling and a ★.
3. **Primary auto-demote.** Add a second cue to the same player and tick `★ Primary` again. Save. The old primary loses its gold styling (no more star); the new one now has the star. Reload — still correct.
4. **Cap at 3.** Add a 3rd cue. Add button turns into `Max 3` text. Try to force a 4th via the modal (shouldn't be possible since the button is gone, but the client-side guard in `setMatchCue` would also throw).
5. **Custom note only.** Open Add modal, skip the picker, type into the note `Stay on your left foot today`. Save. Chip appears with 📝 emoji and the note's first chunk as the label. Hover — tooltip shows the full note.
6. **Coach-only auto-mirror.** Pick a cue from the **🛟 Welfare** group (e.g. tired today). The `🔒 Coach-only` checkbox auto-ticks. Save. The chip shows a 🔒 visibility dot. (Phase 3 will confirm this cue is hidden from the parent page.)
7. **Edit & remove.** Tap an existing chip. Modal opens in edit mode with all fields populated. Change the note or flip primary. Save. Chip updates in place. Re-open and click **Remove focus** → chip disappears. Alternative: tap the small ✕ on the chip → confirm → removed.
8. **Sub-tab-switch refresh.** On Squad, drag a new player into a slot that wasn't picked before. Switch to Focus. The newly-picked player's row is present. Drag someone off, switch back. Their row is gone (cues on removed players are still in the DB — they just don't render because they're not in the picked list).
9. **Lineup switch.** Click a different match in the Matches sub-tab. Switch to Focus. Shows that match's cues (cached per-lineup; re-fetches if this is the first visit). Switch back to the first — still consistent.
10. **Empty catalog fallback.** (Optional) Temporarily kill your network and reload. Focus panel shows "Cue catalog not loaded yet — you can still save a custom note above." in the editor modal. Saving a custom-note-only cue still works.

### Start-here on the new machine (session 11)
Pull `web/app.js`, `web/styles.css`, `web/HANDOFF.md` — no DB migration this session (Phase 1 migration already ran on the current Supabase project). Verify by opening a match, clicking the new 🎯 Focus sub-tab, and adding/removing a cue for one of the picked players.

### Next up
- **Phase 3 — parent match page rendering.** Parent-visible cues should appear on each child's lineup view (near the "your child was picked" block). Already gated by RLS, so the client just needs to fetch + render. Coach-only cues stay invisible to parents.
- **Phase 4 — in-game focus check.** A light "tap if you saw it" affordance on the coach's phone during the game (tap-only for v1; voice memo parked as a later discussion per Chris). Updates `match_cues.status` → delivered / partial / not_delivered.
- **Phase 5 — post-match delivery confirm + outcome_note.** Wizard step to confirm what actually happened, populating `outcome_note`.
- **Phase 6 — export text for the match-report Claude project** (per-player line: "Focus was X → outcome was Y").
- **Phase 7+ — Admin CRUD for cue_catalog**, templates, player notes, MOTM voting — all downstream.
- **Notifications — sitewide, NOT per-feature.** Parent push/text/email notifications are a separate design pass (Chris is aware it's complex, leaning text or push). Don't scope notifications into individual feature branches — all current mentions (Focus cues ideally push parents <48h before kickoff, awards, availability nudges) will wait on that architectural decision.
- **Visual / design pass.** Still deferred.

---

## 🔖 Where we left off on 2026-04-17 (session 10)

**Slice 9a polish — four more targeted tweaks on top of session 9, plus a big badge catalog expansion.** No schema changes; all JS/CSS. Badges are still manual-only (plus auto milestones).

### Shipped this session (session 10)

-1. **Badge catalog expansion — position-specific plethora.** `BADGE_CATALOG` grew by ~80 entries across 5 new categories — `goalkeeper`, `defender`, `midfielder`, `forward`, `setpiece` — plus fresh entries inside existing `attacking`, `skill`, `attitude`, and `milestone` buckets. Goalkeeper additions cover shot-stopping (penalty_saver, double_save, fingertip_save, one_v_one_hero, at_their_feet), sweeping/claiming (commanding_area, claim_master), distribution (distribution_king, quick_release), and leadership (keeper_captain). Defender set covers aerial/tackling (aerial_ace, header_clearance, clean_slide, block_party), positional (marking_master, position_perfect, composed_defender), and attacking defender traits (overlap_run, wingback_engine, long_ball_guru, recovery_run). Midfielder set spans tempo (metronome, pass_master, deep_architect), creative (playmaker, key_pass, eye_of_needle, switch_of_play, number_ten), physical (ball_winner, box_to_box, turnover_ninja). Forward set covers hold-up (target_man, link_up_play), finishing variety (volley_virtuoso, header_scorer, chip_finish, first_time_finish, bicycle_kick), creation (chance_creator), movement (channel_runner, first_touch_wizard), pressing (pressing_monster). Attacking-moments expansion: opener, equaliser, winning_goal, late_winner, comeback_scorer, derby_goal + an Assist family (assist_match, double_assist, hat_assist, through_ball, chance_factory). Set-piece category: free_kick_ace, corner_king, penalty_taker_ace, dead_ball_master, cross_master, long_throw_weapon. Skill-tricks expansion: stepover_specialist, scissor_kick, elastico, cruyff_turn, backheel_hero, no_look_pass. Attitude expansion: captain_armband, first_full_game, late_bloomer, silent_hero, second_chance, bench_energy. Three new auto milestones reserved for 9b: assists_1 / assists_10 / assists_25. Fun category got a 25-entry character/matchday pile: mud_magnet, goal_dance, keepy_up_king, warm_up_mvp, post_match_pundit, bag_hero, snack_hero, water_boy, cone_carrier, dressing_room_dj, photo_finish, fresh_haircut, sock_style, matchday_mascot, selfie_star, tunnel_walk, windmill_celly, ref_assistant, full_kit_hero, goal_commentator, mismatched_boots, kit_forgetful, half_time_hero, whistle_speedster, thunderclap — all positive-spin / kid-friendly so nothing stings. `BADGE_CATEGORY_LABELS` and `BADGE_CATEGORY_ORDER` updated — picker now orders position-specifics first (GK → DEF → MID → FWD), then general attacking/skill/defending/setpiece, then attitude/teamwork/fun, then milestones. All new entries are `manual` flavour (except the 3 assist milestones), so they flow straight into the existing award modal without any wiring. No schema change — the picker keys off the catalog so new slugs just appear on next deploy.

0. **Pitch-chip badge render fix + visual cleanup.** Initial render used `editor.current.team_id`, which doesn't exist on the hand-assembled lineup state object (it's picked out of `l.team_id` when loaded but never copied onto `current`). Switched all 4 editor-side call sites to `editor.team?.id`; parent view call sites were always correct (`lineup.team_id`). Also restyled the chip badge overlay: previously a single pill containing all emoji (looked like an "oblong"). Now each badge is its own 20px gold disc with dashed-border "+N" overflow disc, visually matching the MOTM star and goal-ball decorations.

0b. **"Awards given this match" card.** New `matchAwardsCardHtml(current, teamId)` helper renders a compact card, styled to pair with the scoreline card (`fafafa` bg, gold `#d6a82b` left border). Filters `getCachedTeamBadges(teamId)` by `lineup_id === current.id`, groups by player, and renders one row per recipient with inline `.maw-chip` pills for each badge + a muted italic line per coach note. Wired into the coach editor's `me-top-strip` directly below `compactMatchResultCardHtml(current)`, so it only appears on matches where ≥1 badge has been linked to the match (wizard path or explicit `lineupId` from the Squad modal — Squad-modal defaults leave `lineup_id` null and don't appear here). Returns empty string when there are no match-linked badges, so it costs nothing on unplayed matches.

1. **Match-specific badges show on the pitch chip.** `applyMatchDecorations(rootEl, motm, goalscorers, teamId, lineupId)` gained two new args. When both are provided, the cached team badges are filtered to `lineup_id === lineupId` (strict equality — cumulative awards from other games are deliberately excluded) and grouped by player. Each player chip then gets a new `.chip-badges` row in the bottom-left corner with up to 3 emoji + optional `+N` overflow pill. Hover/long-press tooltip lists the badge names and coach notes. The row sits in the one free chip corner (MOTM ★ top-left, goal count top-right, availability dot bottom-right, badges bottom-left). All 6 call sites (`renderPitch`, `renderSubsBar`, two paths in `refreshAfterChipMove`, two in `renderFixturePitch`) pass `editor.team?.id` + `current.id` (editor — `editor.current` is a manually-assembled state object and doesn't carry `team_id`, so we read the team from the parent `editor` scope) or `lineup.team_id` + `lineup.id` (parent view). The parent-view data-fetch now includes a 4th parallel `fetchTeamBadges(lineup.team_id)` call so the anon cache is populated before the pitch renders — RLS already allows anon SELECT via `team_has_published_lineup`, so no DB change was needed.
2. **Duplicate badges stack on the public card.** Previously the card de-duplicated awards by `badge_key` and dropped all but the most recent. Now they group: `renderPlayerCardBody` builds a `Map<badge_key, { key, items, latest }>` from the cache and renders one chip per group. Chips with `count > 1` get a new `.has-stack` layered box-shadow (suggesting a fanned pile) and a small blue `×N` pill in the top-right corner. The detail sheet is extended — when `openBadgeDetailSheet(badge, group)` receives a group of >1 items, the body renders a `.pc-badge-stack-list` with one row per individual award (newest-first index like `#3 / #2 / #1`, date, optional per-award note). `openBadgesGridModal` also accepts groups now (backward-compat wraps flat `badges` into pseudo-groups of one) and shows the count pill on grid cells too.

### Files touched (session 10)
- `web/app.js` —
  - `applyMatchDecorations` signature extended; badge filter + grouping logic added; `.chip-badges` overlay DOM built per chip.
  - All 6 call sites updated to pass `team_id` + lineup `id`.
  - `renderParentView` data Promise.all gains `fetchTeamBadges(lineup.team_id).catch(() => [])` so the cache is populated for anon visitors before the fixture pitch renders.
  - `renderPlayerCardBody` replaces "de-dup by `badge_key`" with "group by `badge_key`" using a `Map`; chip HTML emits `data-badge-key`, `has-stack` class, and a `.pc-badge-count` pill when `count > 1`. Click handler reads `data-badge-key` and looks the group up out of the closure-captured `Map`.
  - `openBadgeDetailSheet(badge, group)` renders a stacked list of awards when `group.items.length > 1`; header shows `×N` count pill and `Earned N times` subtitle. Single-award calls are unchanged.
  - `openBadgesGridModal(groupsOrBadges, player)` accepts either shape; renders `×N` pill on cells with `count > 1` and passes the whole group back through to the detail sheet.
  - In-app `HELP_SECTIONS` "What do the icons on player chips mean?" now lists the bottom-left badge row.
- `web/styles.css` —
  - New `.pc-badge-chip.has-stack` (layered box-shadow for fanned-stack look), `.pc-badge-count` (blue corner pill), `.pc-badge-grid-cell.has-stack` (grid variant), `.pc-badge-sheet-count` (inline pill in the detail-sheet header), `.pc-badge-stack-list` / `.pc-badge-stack-row` / `.pc-badge-stack-row-head` / `.pc-badge-stack-idx` (detail-sheet stack list).
  - New `.chip-badges` + `.chip-badge-emoji` + `.chip-badge-more` for the pitch-chip badge overlay.
- `web/FAQ.md` — "What do the little icons on the player chips mean?" gains a fourth bullet for the bottom-left row; "Where do badges appear?" mentions stacked chips and the match-chip overlay.
- `web/HANDOFF.md` — this entry.

### SQL to run in Supabase (session 10)
**None.** Session 8 migration still the only schema for Slice 9 badges. Pitch-chip badges reuse the existing `lineup_id` column already populated by session 9's wizard; stacking is pure rendering on rows already in the table.

### Sanity-check script (session 10)
1. **Match-chip badges — coach view.** Open a played match with at least one badge awarded during it (via the wizard or Squad modal with `lineupId` set). In the match editor, the player's chip on the pitch should show a small emoji pill in the bottom-left corner. Open a *different* played match — cumulative card badges should NOT appear there; only badges linked to that lineup.
2. **Match-chip badges — parent view.** Open the parent link for the same match (use an access code if needed). The same bottom-left emoji row should appear on the child's chip. Hover (or long-press on mobile) — tooltip reads badge name + coach note.
3. **Overflow +N.** Award 4 badges to one player for the same match via the wizard. The chip should show 3 emoji + `+1`. Tooltip still lists all 4.
4. **Other corners still work.** Set availability + MOTM + goal on a chip and award a badge. All four corners decorate cleanly — MOTM ★, goal ball, availability dot, badge row. Re-render (drag another chip) doesn't duplicate any.
5. **Stacking — card.** Award the same badge (e.g. Fair Play) twice in the Squad modal. On the public card, there should be ONE Fair Play chip, not two, with a small blue `×2` pill in the top-right of the chip and a subtle 3D "stacked" shadow. Award a third time — pill flips to `×3`.
6. **Stacked detail sheet.** Tap the Fair Play chip. Sheet header shows `Fair Play ×3` + subtitle `Earned 3 times`. Body lists three rows, newest first, each with `#3 / #2 / #1`, date, and optional per-award note.
7. **Grid-modal stacking.** Earn enough badges for the card to show the **All** button (≥5 groups). Tap **All** — the grid should show one cell per badge *key*, with `×N` pill on stacked ones. Tapping a stacked cell opens the same detail sheet with the list view.
8. **Backward-compat.** On a player who has no stacked badges, the card, detail sheet, and grid modal should look identical to session 9's UI — no pills, no stacked shadows.

### Start-here on the new machine (session 10)
Pull `web/app.js`, `web/styles.css`, `web/FAQ.md`, `web/HANDOFF.md` — no DB migration. Quickest demo: open a played match in the editor (need one with a wizard-linked badge already), see the bottom-left emoji on the chip; open the same player's card, see stacked chips if they have duplicate awards.

### Next up
- **Slice 9b — auto-derived badges.** Unchanged from session 8/9. Now that stacking is in, auto-derivations that can fire multiple times in a season (brace, clean sheet, super_sub) won't collapse awkwardly on the card.
- **Visual / design pass.** Still deferred — app is functionally complete but utilitarian. Slice 9a polish (half-overlap, stacked chips, match-chip badges) is only the card/pitch; global theme, typography, and spacing pass is outstanding.

---

## 🔖 Where we left off on 2026-04-17 (session 9)

**Slice 9a polish — three tweaks on top of the badges shipped in session 8.** No schema changes; all JS/CSS. Still manual-only badges; 9b (auto-derivations) unchanged.

### Shipped this session (session 9)

1. **Badges repositioned to the right edge of the FIFA card, half-overlapping.** Previously rendered as a centred row *below* the card. Now a vertical column on the right, each 42px chip translated `translateX(50%)` so it sits half-over the card's right edge. A new `.pc-card-shell` wrapper (`position: relative`, same 380px max-width as the card) hosts both the card and the absolutely-positioned `.pc-badges-row` so the card's own `overflow: hidden` can stay intact for the FIFA artwork. On viewports ≤ 400px, chips shrink to 36px and the column pulls up 2% so they don't crowd into the name line. `pointer-events: none` on the column with `auto` on children so gaps between chips pass taps through to the card. Hover now scales chips 1.06× for a satisfying feedback cue.

2. **Hover tooltips include the coach note.** `.pc-badge-chip` now renders `title="{Badge name} — {note}"` on the card (desktop hover + mobile long-press) in addition to the click-to-open detail sheet. The `+N` / **All** button also gets a tooltip ("See all N badges"). No change to the detail sheet — still the primary "tap to read full context" path.

3. **Optional badges step added to the post-match Result wizard.** The wizard was 4 steps (HT → FT → Goalscorers → MOTM); it's now **5 steps**, with step 5 = **Badges (optional)**. Each matchday candidate gets a compact row with their current badges for this match (filtered by `lineup_id`) inline as removable pill chips, plus a **+ Award badge** button. Tapping opens `openAwardBadgeModal` with `lineupId` pre-filled, so awards are linked to the match. Step 4 gains a new **Save & skip badges** button for coaches who don't want to touch the step at all — either button commits score/scorers/MOTM identically; badges save the instant they're confirmed in the picker (same as the Squad tab flow, so Cancel in the wizard afterwards doesn't roll them back).

### Files touched (session 9)
- `web/app.js` —
  - Added `.pc-card-shell` wrapper around `.pc-card` + `${badgesRowHtml}` in `renderPlayerCardBody`.
  - Badge chip `title=""` now includes coach note; **All**/`+N` gets its own tooltip.
  - `openAwardBadgeModal` signature gained `lineupId` (optional); `awardManualBadge` call passes it through as `lineupId: lineupId || null`.
  - `openResultWizard` extended to 5 steps: new `htmlStepBadges()` renderer, new `[data-rw-award-pid]` / `.rw-bg-chip-x` handlers in `wire()`, step-chips row renders 5 pips, step-label array adds `'Badges (optional)'`, `render()` caps step at 5, footer renders `Save & skip badges` on step 4 + `✓ Save result` on step 5. `doSave()` extracted from the save onclick so both buttons share the commit path.
  - In-app `HELP_SECTIONS` "Recording the result" block rewritten from 4-step to 5-step. Quickstart "Post-match" line updated to include the Badges step.
- `web/styles.css` — new `.pc-card-shell` + repositioned `.pc-badges-row` (absolute/right column); hover scale on chips; `@media (max-width: 400px)` shrinks chips to 36px on phones.
- `web/FAQ.md` — "How do I record the result after the game has been played?" rewritten for 5 steps.
- `web/HANDOFF.md` — this entry.

### SQL to run in Supabase (session 9)
**None.** Session 8's `player_badges` migration still the only schema for Slice 9. `lineup_id` column already exists and was always nullable — this session just starts populating it via the wizard.

### Sanity-check script (session 9)

1. **Right-side badges, half-overlap** — open a player card with at least 2 badges. Beneath the stats grid there should be **nothing** (the old centred row is gone). On the right edge of the card, a vertical column of gold chips sits with each chip centred on the card's right border — half chip inside the card, half outside. On a phone-sized viewport, chips shrink to 36px and still half-overlap.
2. **Tooltip** — desktop: hover a chip — the OS tooltip should read `{Badge name} — {note}`, e.g. `Clinical Finisher — Screamer from 30 yards`. Mobile: long-press a chip — same tooltip. Tap (short) — detail bottom-sheet still opens with the full info.
3. **Card artwork unchanged** — stats grid, name, number, crest, W-D-L all unchanged. The FIFA PNG artwork is not clipped (card overflow still hidden).
4. **Wizard 5 steps** — Matches → pick a played match → **⚽ Enter result**. Step indicator shows `Step 1 of 5`, five pips along the top. Advance through HT / FT / Goalscorers / MOTM as before.
5. **Step 4 footer** — on step 4, footer now shows three buttons on the right: Cancel / **Save & skip badges** / **Next → Badges**. Tap **Save & skip badges** on a fresh test match — wizard closes, match card flips green with the FT chip. No badges written (as expected).
6. **Step 5 UI** — re-open the wizard, advance to step 5. Every matchday player has a row with `+ Award badge` on the right. Tap it for any player — badge picker opens, pick `Clinical Finisher` with a note. Save → modal closes, step 5 re-renders, new gold pill appears inline beside the player's name with a `✕` to remove.
7. **Badge tied to match** — open the public card for that player. The chip on the right of the card should be the one you just awarded. Open the badge detail → date + note present.
8. **Cancel doesn't undo badges** — in the wizard step 5, award another badge. Tap **✕** to close the wizard instead of Save. Re-open the wizard — the badge is still there (persisted on confirm, as designed). Score/scorers/MOTM state is still from the last Save (unchanged by Cancel).
9. **Remove in-flight** — in step 5, tap `✕` on a chip → confirm → chip disappears, row re-renders in place.
10. **Squad-tab badges still work** — Squad → tap a player → existing Award badge + ✕ remove flow unchanged. A single badge award from there does NOT set `lineup_id` (it's left null) so won't appear in any wizard step 5 list.

### Start-here on the new machine (session 9)
Pull `web/app.js`, `web/styles.css`, `web/FAQ.md`, `web/HANDOFF.md` — no DB migration this session. Test: open the public player card first, confirm the right-edge badge column, then take a played match through the 5-step wizard and try both save paths.

### Next up
- **Slice 9b — auto-derived badges.** No change to plan from session 8. Every `flavour: 'auto'` catalog entry needs a pure-JS criterion against existing lineup data. Easy wins: `debut_match`, `opening_night`, `brace`, `hat_trick_hero`, `super_sub`, `games_10/25/50/100`, `goals_1/10/25/50`. Derive on lineup save or in a pass on `renderTeamDashboard`; persist into `player_badges` with `awarded_by = null, lineup_id = {match}`. De-dup in the UI via the existing `seenKeys` on the card.
- **Visual / design pass.** Still deferred.

---

## 🔖 Where we left off on 2026-04-17 (session 8)

**Slice 9a — Manual badges shipped.** FIFA UT-style achievement layer over the stats card. Full `BADGE_CATALOG` seeded (manual + auto stubs); 9a renders manual awards only. Auto-derived badges are Slice 9b.

### Shipped this session (session 8)

1. **`BADGE_CATALOG` single source of truth** (`app.js` just after `logAudit`). Keyed by slug; each entry has `{ name, description, emoji, category, flavour: 'manual' | 'auto' }`. Categories are `attacking · skill · defending · attitude · teamwork · fun · milestone`. Seeded with ~85 entries: manual badges are live in the award picker; auto entries (e.g. `hat_trick_hero`, `top_scorer`, `ever_present`, every milestone counter) are listed so 9b can wire criteria without a catalog rewrite.

2. **`player_badges` table + RLS.** New table storing one row per awarded badge (manual only for now). Indexed on `player_id` and `team_id`. Four RLS policies: public/anon SELECT via `team_has_published_lineup(team_id)`; authenticated member SELECT for coach/admin previews before the first publish; coach/admin INSERT + DELETE (no updates — re-award to refresh). Full SQL block at the bottom of this entry.

3. **Badge cache + DB helpers** (`app.js`). Module-scope `_teamBadges = { [teamId]: [...rows] }` cache. `fetchTeamBadges(teamId)` hydrates it (errors swallowed so a missing migration doesn't crash the squad/card). `awardManualBadge({ teamId, playerId, badgeKey, note, lineupId })` inserts + prepends to cache + fires `logAudit`. `removeBadge(id, teamId)` deletes + evicts. `badgesForPlayer(teamId, playerId, seasonYear)` filters to one player (null = all-time, otherwise matches `season_start_year`).

4. **Earned-badges row on the public card** (`renderPlayerCardBody`). Beneath the FIFA stats grid: up to `CARD_BADGES_MAX = 9` gold-ringed emoji chips, with an overflow **All** button when there are more. Tapping a chip opens `openBadgeDetailSheet(badge)` — bottom-sheet with emoji, name, description, date, and the coach's note in an indigo-left-border block. **All** opens `openBadgesGridModal(badges, player)` — auto-fill grid of every earned badge, each tile re-opens the detail sheet. De-dup by `badge_key` so re-awards don't double-display. Season filter uses `season_start_year` (falls back to deriving from `awarded_at` for legacy rows).

5. **Squad-tab player modal → 🏅 Badges section.** New `badgesSectionHtml(p)` rendered inside `detailsHtml(p)` (below the Access-codes box). Shows earned-badge chips with a small ✕ remove button (coach/admin only) and a `+ Award badge…` button.

6. **Award-badge modal** (`openAwardBadgeModal`). Searchable picker of **manual-flavour** catalog entries, grouped by category with emoji + name + description on each row. Type-to-filter narrows both name and description. Tap a row → it's selected + a `Why? (optional — shown on the public card)` note input appears. Save → inserts with `awarded_by = auth.uid()` + `season_start_year = computeCurrentSeasonStartYear()`. On save, modal closes and the player modal's badges row is re-rendered in place (no Squad-tab full refresh — keeps the scroll position).

7. **Post-award WhatsApp share prompt** (`openBadgeShareConfirm`). Fires straight after a successful award. Pre-fills `🎉 {Name} just earned a badge: {emoji} {Badge}! / "{note}" / See the full card: {URL} / Access code: {code}`. Not now dismisses. Existing "🎴 Share stats card" button on the same modal is unchanged.

8. **CSS** (`styles.css`). New blocks for `.pc-badges-row` / `.pc-badge-chip` / `.pc-badge-more` (gold-ringed circular 42px chips on the card), `.pc-badge-sheet-*` (bottom-sheet detail), `.pc-badge-grid-*` (All modal), `.pb-chip` (small rounded pill in the coach-side player modal with its ✕), `.ba-*` (award picker — grouped two-column on ≥520px, one column on phone). Re-uses the existing `.picker-overlay` / `.picker-modal` / `.picker-header` shell.

9. **Parallel badge fetch in `renderTeamDashboard` + `renderPlayerCardPage`.** Both top-level loaders now include `fetchTeamBadges(teamId)` in their `Promise.all` so the cache is populated before any UI reads it. Failure is non-fatal (empty list fallback).

10. **FAQ + in-app Help updates.** New `badges` HELP section (visible to all roles, not coach-only — kids/parents should find it too). FAQ.md gains a new `## Badges & achievements` block between the stats card and tips sections, covering what/who/manual-vs-auto/where/remove/share/why-no-auto-yet.

### SQL to run in Supabase (session 8)

```sql
-- Slice 9a — player_badges table + RLS.
-- Manual-only writes for now; auto-derived badges (Slice 9b) will use the same
-- table but populate badge_key + season_start_year + lineup_id from match data.
CREATE TABLE IF NOT EXISTS player_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id   uuid NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  badge_key text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lineup_id  uuid REFERENCES lineups(id)    ON DELETE SET NULL,
  season_start_year int,
  note text
);
CREATE INDEX IF NOT EXISTS player_badges_player_idx ON player_badges(player_id);
CREATE INDEX IF NOT EXISTS player_badges_team_idx   ON player_badges(team_id);

ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

-- Public/anon read: same gate as players — team must have at least one
-- published lineup. Uses the existing team_has_published_lineup() helper
-- so there's no recursion.
CREATE POLICY "player_badges_public_read"
  ON player_badges FOR SELECT
  TO anon, authenticated
  USING ( team_has_published_lineup(team_id) );

-- Authenticated team-member read: coaches/admins see their team's badges
-- even before the first publish (so the Squad modal isn't empty on day 1).
CREATE POLICY "player_badges_member_read"
  ON player_badges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = player_badges.team_id
        AND user_id = auth.uid()
    )
  );

-- Coach/admin INSERT + DELETE (no UPDATE — re-award to refresh).
CREATE POLICY "player_badges_coach_insert"
  ON player_badges FOR INSERT
  TO authenticated
  WITH CHECK (
    awarded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = player_badges.team_id
        AND user_id = auth.uid()
        AND role IN ('coach','admin')
    )
  );

CREATE POLICY "player_badges_coach_delete"
  ON player_badges FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = player_badges.team_id
        AND user_id = auth.uid()
        AND role IN ('coach','admin')
    )
  );
```

Run the whole block in the Supabase SQL editor before (or immediately after) pushing the code — the UI will still load without it but nothing badge-related will persist.

### Files touched (session 8)
- `web/app.js` — `BADGE_CATALOG` + `BADGE_CATEGORY_LABELS` + `BADGE_CATEGORY_ORDER` + `CARD_BADGES_MAX` constants; helpers `badgeEntry` / `badgeEmoji` / `badgeName` / `formatBadgeDate`; cache `_teamBadges` + `fetchTeamBadges` / `getCachedTeamBadges` / `badgesForPlayer` / `awardManualBadge` / `removeBadge`; `renderPlayerCardPage` parallel fetch extended; `renderPlayerCardBody` badges-row render + wiring; new functions `openBadgeDetailSheet` / `openBadgesGridModal` / `openAwardBadgeModal` / `openBadgeShareConfirm`; `renderTeamDashboard` parallel fetch extended; `renderSquadTab` gains `badgesSectionHtml(p)` + `detailsHtml` wiring in the modal; `wirePlayerDetails` adds `rerenderBadges` + `wireBadgeHandlers`; new `HELP_SECTIONS` entry `badges` (non-admin, inserted after `stats-card`).
- `web/styles.css` — badge CSS block appended just before `.me-avail-bar`: `.pc-badges-row`, `.pc-badge-chip`, `.pc-badge-more`, `.pc-badge-emoji`, `.pc-badge-sheet-*`, `.pc-badge-grid*`, `.pc-badge-note*`, `.pb-section`, `.pb-chip*`, `.badge-award-modal`, `.ba-*`.
- `web/FAQ.md` — new `## Badges & achievements` section between the stats card section and tips.
- `web/HANDOFF.md` — this entry.

### Sanity-check script (session 8)

1. **DB migration** — paste the SQL block above into Supabase and run it. Verify `player_badges` exists with 2 indexes + 4 policies (`public_read`, `member_read`, `coach_insert`, `coach_delete`).
2. **Squad-tab modal, no badges yet** — open Squad → tap a player → scroll to the new 🏅 Badges card. It should read "No badges yet." and show a `+ Award badge…` button.
3. **Award a manual badge** — tap `+ Award badge…` → modal opens, focus lands in the search box. Type "hat" → only `Clinical Finisher` shows (manual) — `Hat-Trick Hero` does NOT appear (it's auto, deferred to 9b). Clear search → scroll Attacking group → select `Clinical Finisher` → it highlights indigo. Note field appears. Type `"Great first-time finish"`. Save → modal closes, player modal's badge chip row now shows `🎯 Clinical Finisher` with an ✕. Share-to-WhatsApp confirm popup appears — tap Not now.
4. **Public card display** — open `/#/card/{team_id}` in a new tab, unlock with the player's code. Beneath the stats grid a gold-ringed row shows the `🎯` chip. Tap it → bottom-sheet with name, description, date, and the coach's note ("Great first-time finish") in an indigo-left-border block. Dismiss.
5. **Award 9+** — back in the Squad modal, award 9 more manual badges to the same player (any from the picker). Return to the public card → 9 chips + `All` button. Tap `All` → grid modal lists every badge; tap any → its detail sheet.
6. **Remove** — Squad player modal → tap ✕ on any chip → confirm → chip disappears immediately (no Squad-tab full rerender). Refresh the public card → badge is gone.
7. **Season filter** — on the public card, tap ← to go to a previous season. Badges earned this season should vanish; the row is empty (or populated if you awarded any in that year — unlikely on day 1). Tap → to return.
8. **Share-to-WhatsApp from award popup** — award another badge → Share popup → tap 💬 Share to WhatsApp → new tab opens with `wa.me/?text=…` containing `🎉 {Name} just earned…`, the note, card URL and access code.
9. **Non-admin view** — log in as a parent/coach-viewer (no `canEdit`) → open a player's card on the Squad tab → badges section renders read-only (no ✕ on chips, no Award button).
10. **Help + FAQ** — Help tab → scroll to `Badges & achievements` entry. FAQ page renders the new section between stats card and tips.

### Start-here on the new machine (session 8)
Push `web/app.js`, `web/styles.css`, `web/FAQ.md`, `web/HANDOFF.md`. **Run the session-8 SQL block** on Supabase before testing writes — reads will fall back gracefully but inserts will fail until the table + RLS exist.

**Next up** — **Slice 9b: auto-derived badges.** All criteria live as pure JS functions against existing lineup data; no DB changes beyond optionally persisting derived awards into `player_badges` (so the coach can see them in the modal too). Good first wins: `debut_match`, `brace`, `hat_trick_hero`, `games_10` / `games_25`, `opening_night`, `super_sub`. Full list in the 9a brief in session 7's entry.

---

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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       