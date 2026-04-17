# Interpro Coach / Manager Assistant — How to use

A practical guide for coaches, assistants and parents using the lineup tool.

---

## Getting started

### How do I sign in for the first time?
On the login screen, enter your email and choose **Sign up**, then set a password (minimum 8 characters). You'll be signed in straight away. If you forget your password, use the **Forgot password?** link to get a reset email.

### I was sent an invite email — what do I do?
Click the link in the invite. You'll be asked to set a password (or sign in if you already have an account). Once you set a password you'll be added to the team automatically and dropped on the team page. You can sign in from any device after that.

### Why am I being asked to set a password right after signing in?
If you arrived via a magic link or invite, the app prompts you once to set a password so you can log back in from any device. Pick something at least 8 characters and confirm. You won't see this prompt again.

### How do I sign out?
Click **Log out** in the top-right of the header (on phone it's tucked inside the ☰ drawer; on desktop it sits at the bottom of the left sidebar).

---

## Teams

### How do I create a team?
Two places:
- **Your teams** (the picker page) — tap the dashed **+ Create new team** card. A modal asks for the team name + age group, then you're done.
- **Admin tab** (inside a team) — tap **+ Create new team** at the end of the team switcher strip. Doesn't auto-switch; the new team joins your list.

Only **admins** (or brand-new users with zero teams) can create teams. Coaches can't — ask the admin to add you to the new team.

### How do I set or change the team's age group?
Open **Squad details → Team info** and pick from the dropdown (U7s through U18s). The stored value auto-bumps by one each **7 June** — a week after 31 May, the end of the season — so you don't have to remember to roll it forward. If you set a new value at any point, it resets the bump clock to that season.

### How do I switch between teams?
Three options:
- **↻ Switch team** in the sidebar / drawer — appears for anyone with >1 team OR any admin role. Takes you back to the picker.
- **Admin tab** → click any team card in the top strip. Switches in place.
- **← Your teams** breadcrumb in the header.

### Who can see my team?
Only people you invite as members. Each team is private by default. The exceptions are **published lineups** and **player stats cards**, which can be shared with anyone via public links (see Parent view + Player stats card below).

---

## The team dashboard — layout

### Desktop / tablet / phone layouts
- **Desktop (≥900px)** — a persistent left sidebar lists the tabs: **Matches**, **Squad details**, **Tactics**, **Formations**, **Help** and (coach/admin only) **Admin**. Your user badge and **Log out** sit at the bottom of the sidebar. If you're on >1 team (or admin anywhere) you also get a **↻ Switch team** shortcut just above the badge.
- **Phone (≤640px)** — a ☰ hamburger in the header opens a slide-in drawer with the same tabs.
- **Tablet (641–899px)** — a horizontal tab strip across the top of the page.

### What happens after I sign in?
If you're a coach with exactly one team, the app takes you straight into it — no team picker. If you have more than one team, or you're an admin in any team, you'll see the **Your teams** card grid so you can pick. Admins can also create a new team from there (coaches can't — only admins can start fresh teams, see below).

### What's the orange **+** button in the sidebar / header?
That's the **global quick-create menu**. Click it from anywhere and pick one of:

- **+ New match** — opens the match creation wizard
- **+ New player** — opens the Add player modal on the Squad tab
- **+ New tactic** — jumps to Tactics → Tactic details with a blank editor, name input focused
- **+ New formation** — jumps to Formations with a fresh canvas in edit-formation mode

It's the primary way to start anything new — you don't need to be on the right tab first.

---

## Match creation wizard

### How do I start a new match?
Click the orange **+** button (sidebar on desktop, header on phone) and choose **+ New match**. A step-by-step popup guides you through the essentials.

### What are the steps?
Step count depends on whether the match is Home or Away:

- **Home (4 steps):**
  1. **Who & when** — opponent, match type (Friendly / League / Cup), Home/Away toggle, game date, kick-off, team arrival.
  2. **Formation** — pick a preset or one of your saved custom formations.
  3. **Location** — read-only confirmation of your Squad-tab **Home ground**.
  4. **Summary** — review and click **Create**.
- **Away (5 steps):** same as Home, but step 3 becomes **Venue** (name + postcode with 🔍 lookup) and step 4 becomes **Fine-tune on map** (drag the pin to the exact spot). Summary moves to step 5.

The step indicator at the top of the wizard shows "Step X of Y" and updates live if you flip Home/Away on step 1.

### What happens after I click Create?
The lineup is inserted into the database as a **Draft** and the match editor opens on it immediately. A follow-up prompt asks **"Share to WhatsApp now?"** — tap **Yes, share** to flip the status to **Availability** and open WhatsApp with a pre-filled message (opponent, date, kick-off, venue, share link). Tap **Not now** to just keep editing.

### Where else can I start the wizard?
Two other entry points open the same wizard: the desktop match-editor header has a **+ New** button next to **Share**, and the global **+** menu's **+ New match** item works from anywhere.

---

## Squad details tab — team settings and players

### What's in the Squad details tab?
Two sub-tabs:
- **Team info** — edit team name, pick / change age group, set or fine-tune the team's home ground (name + postcode + map pin).
- **Squad** — add / edit / remove players, upload photos, manage access codes and siblings, filter by position.

The sub-tab you're on persists, so changing a filter on the Squad tab doesn't bounce you back to Team info.

### How do I add a player?
Open **Squad details → Squad** and click **+ Add player**. Fill in name, shirt number, preferred positions and any notes. Click **Save**.

### What does the position field do?
A player's preferred positions help colour-code them on the lineup picker. They're suggestions, not restrictions — you can put any player anywhere on the pitch.

### How is the Squad page organised?
When the **All** filter is active, players are grouped under **Goalkeepers**, **Defenders**, **Midfielders**, **Forwards** and **Unassigned** headings. Use the filter on the right to narrow to one group. Each card shows the shirt number as a small blue badge in the top-left corner of the photo — it stays visible even when a photo is set. The grid is 4 across on desktop and 2 on mobile.

### How do I edit or remove a player?
Tap a player's card. The **Edit player** modal opens with the full form — name, number, position, parents, photo, access codes. Changes save automatically as you edit each field. Use **Remove player** at the bottom to delete. Removing a player won't break old saved lineups — they'll just appear as empty slots in past lineups.

### How do I add a player photo?
Open the player modal and click **Upload photo** under **Photo**. A cropper opens on top of the modal — drag and zoom to frame the face inside the square, then save. The image is compressed to a 512×512 JPEG and shows up everywhere that player appears: squad list, pitch chip, subs row, parent view chips, fixtures preview. Click **Replace** or **Remove** later to change it.

### Why does each player have an Access codes box?
That's how parents prove they're allowed to mark availability for their child — see the **Publishing & sharing with parents** section below.

### What are the parent name and phone fields for?
Right now they're a place to keep contact details handy when you need to chase someone. Future versions will use them for invites and SMS notifications.

### Where do I set the team's home ground?
At the top of the **Squad** tab there's a **Home ground** card. Add the venue name and postcode, then use the map to fine-tune the exact pin. This venue is used automatically for every **Home** game so you don't have to type it each time.

### Why does it say "fine-tune" the map?
Postcode lookup gets you in the right neighbourhood, but UK postcodes can cover a large area. Drag the pin to the exact spot of the pitch entrance/car park so parents can find you. The pin's coordinates are what get shared with parents.

---

## Match editor (Matches tab)

### Which match do I land on when I open Matches?
The app auto-picks the **closest** match — the next upcoming fixture, or the most recently played match if its kick-off was within the last 24 hours (so you stay parked on a just-finished game long enough to enter the result). After 24 hours have passed since KO, it rolls forward to the next upcoming automatically.

### How do I open a different match?
Use the **Matches** sub-tab inside the editor — it shows the full card list, split into **Upcoming** and **Past**. Tap any card to switch. A match flips from Upcoming to Past the moment its kick-off time passes, not at midnight.

### What do the coloured outlines on match cards mean?
- **Orange outline** — the match you're currently inside the editor for.
- **Green outline** — a played match with a result entered. Done, no action needed.
- **Red outline + "⚠ Needs score" chip** — a played match with no result yet. You should record it.
- **Neutral outline** — a future match, nothing special.

### What are the sub-tabs inside the match editor?
Below the match header (and above the pitch) you'll see a horizontal strip of sub-tabs:

- **Matches** — the card list of all your upcoming and past fixtures. Tap a card to switch. To create a new one, use the global **+** or the **+ New** button in the editor header.
- **Squad** — the **Available players** palette you drag onto the pitch.
- **Subs** — the substitutes row (max 5) below the pitch.
- **Formation** — preset and custom formations. **Read-only here** — pick one to apply, but editing or saving a formation lives on the **Formations** top-level tab.
- **Info** — the match summary card: date, venue, map/directions, share button, **Add to calendar**, result chip, scorers, MOTM.

### What does the status pill show?
The orange/green/amber pill in the match editor header shows the lineup's current state — **Draft**, **Availability ▾** or **Published**. On phones it sits in its own row above the sub-tabs so it's always visible. Tap it to open the **Status change** modal.

### What's the Status change modal?
Three cards, one for each state (Draft / Availability / Published), each with a one-line description. Tap a card to switch. Choosing **Availability** also auto-opens the share prompt so you can send the link to WhatsApp in one flow.

### How do I set match details?
Click the blue **✎ Edit match** button (in the **Info** sub-tab, or the match header). A popup opens with:

- **Opponent** — the other team's name
- **Match type** — Friendly / League match / Cup match
- **Home / Away** — Home auto-fills your home ground; Away lets you set the venue
- **Game date**
- **Kick off** and **Team arrival** time (15-minute intervals)
- **Notes** — anything parents should know (kit colours, meet point, bring training tops…)
- **Venue** — auto-filled for home games; postcode lookup + map fine-tune for away games

Click **Save lineup**. For away games, the map will pop up so you can pin the exact location.

### How do I add players to the pitch?
Drag a player from **Available players** on the right (Squad sub-tab on phone) onto a position slot. To swap two players, drag one onto the other. To remove a player, drag them back to the available list (or off the pitch).

### How do I change formation?
Open the **Formation** sub-tab and pick a preset (4-3-3, 4-4-2, etc.) or one of your custom formations. The pitch repositions immediately. Players already placed stay assigned to their position label where possible.

### What's the 👥N badge on some formation buttons?
That formation was saved with **pre-placed players** (see the **Formations** tab below). When you click it on a match with an empty pitch, those players load in automatically. If the pitch already has players, you're asked first — **OK** replaces them with the stored ones, **Cancel** keeps your current players and only the formation shape changes.

### How do I build or edit a custom formation?
On the **Formations** top-level tab (sidebar / drawer). Match editor's Formation sub-tab is read-only on purpose — see the **Formations tab** section below for the full editing flow.

### How do I add subs?
Drag players to the **Substitutes** strip on the **Subs** sub-tab (max 5).

### What's the Tactics section for?
Tactics let you draw on the pitch:

- **Press / Defensive lines** — toggle either zone line and drag it up/down to show your high press or low block
- **Arrows** — click and drag from one point to another to draw a movement arrow; click an arrow to bend it
- **Ball** — toggle the ball on/off and drag it where you want
- **Clear** buttons reset arrows or all tactics

### How do I save a lineup?
Once a match has been created via the wizard it autosaves continuously — any edit (pitch change, tactics, match details, result entry) is persisted within about a second of the change. The **Save lineup** button in the match-details popup handles the initial save if you created the lineup the legacy way (via the **+ New lineup** card instead of the wizard).

### How do I load a saved lineup?
Click any card on the **Matches** sub-tab. If you have unsaved changes you'll be warned first.

### How do I delete a lineup?
Hover/tap a match card and click the **×** that appears.

### How do I add a match to my calendar?
On the **Info** sub-tab click **📅 Add to calendar**. A chooser opens with three options tailored to your device:

- **Google Calendar** — opens a pre-filled new-event page in a new tab
- **Apple Calendar** — triggers the native Add-to-Calendar prompt on iOS/macOS
- **Outlook / Download .ics** — downloads the event file for any other calendar app

All three use the game date, kick-off, arrival, venue, postcode and your notes.

### How do I record the result after the game has been played?
Once kick-off has passed, a big amber **⚽ Enter result** button appears above the sub-tab strip. Tap it to open the 5-step **Result wizard**:

1. **Half-time score** — Us and Opponent number inputs. Leave blank if you didn't track HT.
2. **Full-time score** — same layout, with a small "HT was X-Y" hint if you entered HT.
3. **Goalscorers** — tap **+ Add goalscorer**, pick a player from the matchday squad, they're added with count 1. Tap **+ Add goalscorer** again and pick the same player to increment, or a different player. Use the +/− buttons on an entry to adjust the count, or the ✕ to remove. If the scorer total doesn't match FT, a red warning shows underneath so you can spot double-counts or forgotten goals. Opposition scorers aren't tracked individually.
4. **Man of the Match** — tap **+ Add Man of the Match**, pick a player, optionally type a "Why?" reason. Repeat for joint MOTM; already-selected players are disabled in the picker.
5. **Badges (optional)** — every matchday player gets a row with a **+ Award badge** button. Tap it to open the badge picker (same as the Squad tab) and give recognition for a hat-trick, a screamer, great attitude — anything. Chips already earned for this match show next to the player's name with a ✕ to remove. This step is completely optional: on step 4 you can tap **Save & skip badges** to finish without touching it, or **Next → Badges** to step in.

Tap **✓ Save result** on step 5 (or **Save & skip badges** on step 4) and the score/scorers/MOTM are persisted in one go. Badges save the instant you confirm them in the picker, so anything you awarded sticks even if you Cancel the wizard afterwards.

Once a result is saved, the amber button collapses into a small green **✎ Edit** pill tucked top-right of the compact result card. Tap that to re-open the wizard if you need to tweak anything.

The result then shows as a coloured chip on the match card list (e.g. green **FT 3-2 W**, red **FT 0-2 L**, grey **FT 1-1 D**) and at the top of the match's Info card, with a 🏆 line listing the MOTM(s) and their reasons. The match card outline flips green. The old inline Result section inside **✎ Edit match** still exists as a fallback if you prefer filling in every field on one screen, but the wizard is the primary path.

### What do the little icons on the player chips mean?
Once a lineup has availability responses and/or a recorded result, player chips on the pitch pick up decorations in the four corners:

- **Bottom-right dot** — availability status (green = Available, red = Unavailable, amber = Maybe, no dot = no response)
- **Top-left gold ★** — Man of the Match for this game
- **Top-right black-on-white number** — goals scored in this game
- **Bottom-left emoji row** — badges awarded in THIS match (only). Hover to see the badge name and the coach's "why?" note. The player's permanent collection lives on their public card; the chip row is a fixture-specific highlight reel. Stops at 3 emoji with a **+N** if more were earned in the same game.

The same decorations show on the parent view pitch once the lineup is published.

### What do the coloured rings around player chips mean?
On older lineups you may still see ring-style availability indicators. Rings are being replaced by the corner dots above, but the colour logic is the same:

- **Gold ring** — marked Available
- **Red ring** — marked Unavailable
- **Yellow `?` badge** — marked Maybe
- No ring / dot — no response yet

---

## Publishing & sharing with parents

### What are the three visibility states?
Every lineup is in one of three states, changed by clicking the status pill to open the **Status change** modal:

- **Draft** — only coaches can see it. The share link doesn't work.
- **Availability** — parents can open the share link to see match details (date, venue, kick-off, arrival, notes) and mark each player as Available, Maybe or Unavailable. The lineup itself is hidden.
- **Published** — parents see the full lineup plus match details. Availability responses are still visible to you as a coach.

### How do I collect availability from parents?
Once the lineup has a game date, click the status pill and switch to **Availability**, then click **🔗 Copy availability link for parents** (the prompt that pops up after switching offers a one-tap WhatsApp share). Paste that link into the team WhatsApp. Parents open it, **enter their child's access code once** to unlock that player on their device, optionally type their name, and tap a status (plus an optional note, e.g. "away that weekend"). Responses save immediately.

### How quickly do parent responses show up for me?
While the match editor is open on an Availability or Published lineup, the coach view polls every ~5 seconds. New responses tick in on the response panel and on the pitch chip dots without you having to reload.

### Where do I find a player's access code?
Open the **Squad** tab, expand the player's card, and look for the **Access codes** box near the bottom. Each player has a personal code (e.g. `JE1234` — first initials + 4 digits). If you've linked siblings, they also share a 5-digit **family code**. WhatsApp the code(s) to the parents — they only need to enter one once, and the device remembers it.

### How do I link siblings so one code covers them all?
On either sibling's card in the **Squad** tab, click **🔗 Link sibling…** in the Access codes box. Tick the brothers/sisters in the squad and save. The app generates (or reuses) a shared 5-digit family code — a parent enters that one code and unlocks both children at once.

### A parent has a new phone / cleared cookies — what now?
Resend them the access code from the player card. They re-enter it once and the new device remembers them.

### What if the parent code lookup fails?
Codes are case-insensitive and ignore spaces. If it still doesn't unlock, double-check the code on the player card — and remind them family codes are 5 digits, personal codes are 2 letters + 4 digits.

### Where do I see the responses?
Open the lineup on the **Matches** tab. In the Match details card you'll see an **Availability responses** panel with a tally (✅ / 🤔 / ❌ / no reply) and a per-player list. It refreshes every ~5 seconds while the editor is open.

### How do I publish the lineup once I've picked the squad?
Click the status pill and pick **Published** in the Status change modal. The share link URL doesn't change — parents who already have it will now see the pitch instead of the availability form.

### Do I need to re-share the link if I make changes?
No. The link always points to the latest version of the lineup, whichever state it's in. Parent views poll every ~6 seconds, or they can tap **↻ Refresh**.

### How do I take a lineup offline?
Switch the state back to **Draft**. The share link will stop working immediately. Availability responses are preserved in case you want to return to Availability later.

### What do parents see?
- Team vs opponent header with date, kick-off, arrival time
- Venue name + postcode with **🗺️ Open map** and **///what3words** links
- Coach notes (if you've added any)
- The full pitch with players in position — with MOTM ★ and goal-count overlays on played matches
- Subs list

They don't see your other lineups, draft tactics, or anything from the admin side.

---

## Formations tab

### What's the Formations tab for?
It's the dedicated page for creating, editing and saving formation templates — the shapes you pick inside a match. It has the same pitch + sub-tabs layout as the match editor, trimmed to two sub-tabs:

- **Formation** — the list of presets and your custom formations, with editing controls (✎ Edit formation, 💾 Save formation, ➕ Save as new formation…).
- **Squad** — the player palette so you can drag players onto pitch positions to preview the shape, or optionally save those players *with* the formation.

### How do I edit a formation?
Pick a formation from the list, then tap **✎ Edit formation**. Drag the position handles to move players around. Double-click a position label (GK, CB, ST, etc.) to open a dropdown of common roles — or type a custom label up to 4 characters. Tap **✓ Done editing** when finished, then **💾 Save formation** or **➕ Save as new formation…** to persist. **Built-in presets (4-3-3, 4-4-2, etc.) can't be overwritten** — if you pick Save on one, it falls back to Save as new.

### What happens if I place players on the pitch, then save?
When you tap Save formation or Save as new, you get an optional prompt: **"Remember the N player placements on the pitch with this formation? OK — save players too, Cancel — shape only."**

- Say **OK** and those placements stick to the formation. Next time you pick that formation on the Formations page, the players pre-fill. A small **👥N** badge appears on the formation button to tell you players are stored.
- Say **Cancel** and only the formation shape (positions + labels) is saved.

### What does the 👥N badge do inside a match?
The same badge shows on custom formations in the match editor's Formation sub-tab. Clicking the formation on a match:

- With an empty pitch → the stored players load automatically.
- With players already placed → you're asked first. **OK** replaces them, **Cancel** keeps your placements and only changes the shape.

### How do I delete a custom formation?
On the Formations page, click the small **×** on the right side of the formation button. Presets can't be deleted (there's no × on them).

---

## Tactics tab

### What's a tactic?
A tactic is a reusable set-piece or pattern template: a formation, (optionally) some players, arrows showing player movement, a ball start position, and press/defensive zone lines. Each one is labelled **In possession** or **Out of possession**. Use them for corners, free kicks, high-press triggers, build-up patterns and anything else you want to reuse across matches.

### What does the Tactics page look like?
Same pitch + sub-tabs skeleton as the match editor and Formations page. Four sub-tabs:

- **Tactics** — grid of cards for every saved tactic (name, formation, In/Out chip, ✕ delete). Filter dropdown at top (All / In possession / Out of possession), **+ New tactic** button next to it.
- **Squad** — player palette to drag onto the pitch.
- **Moves** — pitch-layout + drawing tools: **✎ Edit positions** to nudge position dots for this one tactic, **▶ Move / → Click / ↗ Drag** arrow modes, **⚽ Ball** toggle, press / def zone sliders, Clear arrows / Clear all.
- **Tactic details** — **Name**, **In possession / Out of possession** radio, **Description**, formation picker, **💾 Save** / **➕ Save as new…** / **✕ Delete** buttons.

### How do I create a tactic?
Tap **+ New tactic** on the Tactics sub-tab (or the global **+** → **+ New tactic**). You land on Tactic details with a blank editor. Fill in a name, pick In/Out, pick a formation, add players via Squad, draw arrows / zones / ball on Moves, then tap **💾 Save tactic**.

### How do I edit an existing tactic?
Click the card. You're dropped into Tactic details with everything pre-filled. Make changes, then **💾 Save** to write back in place, or **➕ Save as new…** to duplicate under a new name.

### How do I change pitch positions for just this tactic?
Open **Moves**, tap **✎ Edit positions**, drag handles around, **✓ Done editing**. Those nudged positions ride with the tactic only — they don't change the underlying formation. The **Formations** tab is where you'd edit the formation itself.

### How do I save a tactic straight from a match lineup?
In the match editor, open the **Formation** sub-tab and tap **★ Save as tactic…**. A modal opens with name, **In possession / Out of possession** radio, and description. Tap **Save tactic** and the current match's formation, players, arrows, ball and zones are saved as a new tactic row. Useful when you build something mid-match-plan and want to reuse it.

### How do I load a tactic onto a match?
From a match's Formation sub-tab, tap **↓ Load from tactic…** in the Tactics card. Pick a tactic and the formation, arrows, zones and ball position copy onto your current lineup. Players you've already placed on the pitch stay where they are.

### Who can delete a tactic?
Any coach for tactics they created themselves, plus any admin for any tactic. The **✕ Delete** button is hidden on tactics you don't have permission to delete.

---

## Fixtures tab (tablet-only)

### What happened to the Fixtures tab?
It's been largely folded into the **Matches** sub-tab of the match editor on desktop and phone — the card list, the selected game's headline, the share button, the availability responses panel and the pitch preview all live there now. The dedicated **Fixtures** tab only surfaces on tablet-width screens (641–899px) as a legacy view.

### I'm on a tablet — what does Fixtures still do?
A coach-and-parent-friendly overview of the season. Collapsible **Calendar** and **Matches** cards sit at the top, then the selected game's headline (date, opponent, venue, map links), the parent share button, the availability responses panel, and the pitch with the lineup. As a coach you always see the pitch there (with a small banner showing the current visibility state). Tick **Show draft lineups** at the bottom of the Matches list to include drafts.

---

## Members tab — invites & roles

### What roles are there?
- **Admin** — full control: edit team, manage members, delete the team
- **Coach** — edit squad, lineups, plays, publish lineups
- **Parent** — read-only access to lineups for their child(ren)
- **Viewer** — read-only access to everything (rare; mostly for assistants)

### How do I invite someone?
Open **Members**, click **+ Invite**, enter their email and pick a role. They'll receive an email invite. They sign up (or sign in if they have an account) and are added automatically.

### What if the email never arrives?
Check spam first. If it's still missing, you can resend the invite from the Members list (look for a Resend or Pending tag next to their entry).

### How do I change someone's role?
On the Members tab, click the role next to their name and pick a new one. Admins can change anyone; coaches can manage parents/viewers but not other coaches/admins.

### How do I remove a member?
Click the **×** next to their entry. They'll lose access immediately. This doesn't delete their account — just their membership of this team.

### Can a parent see other parents' kids?
No. Parents see published lineups (which list all players in the squad — that part is public to anyone with the share link), but they can't see private team data or member emails.

---

## Parent view (public link)

### Do parents need to download an app?
No. The link opens in any browser. It works on phones, tablets and computers.

### Do parents need to log in?
No. The share link is public. As soon as they tap it they see the match details. To **mark availability** for their child, they enter the player's access code once — see below.

### What's the access code box on the parent view?
It's a small unlock prompt above the availability buttons. The first time a parent opens the link they'll see only the match details and an empty code box. They type their child's personal code (`JE1234` style) or family code (5 digits), tap **Unlock**, and that player's row appears with the ✅ / 🤔 / ❌ buttons. The unlock is remembered on that device, so they only do it once.

### What does "Add another child" do?
After unlocking the first player, the same code box label changes to **Add another child**. They paste a second code to add a sibling that wasn't linked, or to handle a kid on a different family.

### What does "Forget this device" do?
Wipes everything the parent view remembers on that device — unlocked players, codes, and saved name. Useful for shared phones or if you're handing the device to a different parent. They'll need the access code(s) again next time.

### Can parents see old games?
The link is per-lineup, so they only see the lineup you sent them. If you want them to see a season overview, share multiple links (or eventually a team-wide page — that's on the roadmap).

### How often does the parent view refresh?
Every 6 seconds automatically. There's also a **↻ Refresh** button at the bottom of the page.

### What's the ///what3words link for?
A three-word address pinpoints a 3m × 3m square anywhere in the world — much more precise than a postcode. Tap it on a phone and it opens in the what3words app or website with directions.

### Are the access codes secret?
They're treated as private but they're not high-security secrets — they're WhatsApp-trust friction designed to stop accidental cross-clicks (so a parent can only mark their own child available). The full lineup, when published, is still visible to anyone with the link.

---

## Player stats card (public link)

### What is it?
A FIFA Ultimate Team-style card that kids and parents can open to see season stats for their player — goals, MOTM awards, starts, sub appearances, total appearances, and W-D-L record in matches they played. Lives at `/#/card/{team_id}` — one link per team. Each player unlocks their own card using their access code (or family code if siblings are linked).

### How do I share the link with parents?
Two places:
- **Squad details → Squad** → open a player's card → tap **🎴 Share stats card (WhatsApp)**. Opens WhatsApp with a pre-filled message including the child's first name, the card URL, and their access code. Just pick the recipient and send.
- **Admin tab** → **Share the team's stats-card link** card at the top → tap **📋 Copy** to copy the URL to the clipboard, or **Open ↗** to preview it yourself. Paste into a WhatsApp group along with each child's code (codes are on the Squad tab).

### What does the parent / kid do?
Open the link, type in the child's personal access code (e.g. `JE1234`) or family code (5 digits) into the Unlock box, done. The device remembers them — next visit opens straight onto the card. If they've got siblings linked by family code, small chips at the top let them switch between cards.

### What stats are on the card?
Six:
- **Goals** — total goals scored in played matches this season
- **MOTM** — number of times awarded Man of the Match
- **Starts** — matches started in the XI
- **Subs** — matches on the bench (may or may not have come on)
- **Apps** — total appearances (Starts + Subs)
- **W-D-L** — team record in matches the player featured in

All numbers update automatically when you edit a result — nothing's cached, everything's derived from the match data.

### Does the card show older seasons too?
Yes. The **← / →** arrows above the card cycle through every season the team has played matches in. Seasons run 1 September → 7 June (the bump date matches the age-group rollover).

### Can a parent sign out / forget the player on their device?
Yes — **Forget** button in the top-right of the card removes all saved unlocks for that team on that device.

### Are the stats cards public to anyone?
Anyone with the team URL + a valid access code can view. Without a code you just see the unlock form. Access codes are the same ones used for availability.

---

## Badges & achievements

### What are badges?
FIFA Ultimate Team-style achievements pinned to a player's public stats card. Each badge has an emoji icon, a name, and a short description (e.g. 🥾 **Hat-Trick Hero — 3+ goals in one match**). Kids collect them across the season.

### Who awards them?
Coaches and admins. Open **Squad details → Squad** → tap a player's card → the **🏅 Badges** section shows everything already earned, plus a **+ Award badge…** button. Pick from the grouped list (Attacking, Skill, Defending, Attitude, Teamwork, Fun, Milestone), type an optional "why?" note, Save. The note is **visible to parents/kids on the public card**, so write it like you'd want them to read it.

### Manual vs. auto badges
Right now all badges are awarded manually by the coach. In a future update some will become **auto-derived** from match data — Hat-Trick Hero, Top Scorer, Ever-Present, 10 games, 25 goals, etc. Those entries already exist in the catalog but are hidden from the Award menu until the auto-rollout lands.

### Where do badges appear?
On the **public player card**: a row of up to 9 icons sits beneath the stats grid. If the player has more than 9, an **All** button opens the full grid. Tapping a badge opens a detail sheet with name, description, date awarded, and the coach's note. If a player has earned the same badge multiple times (e.g. Fair Play × 3), the chips **stack** on the card with a little "×N" pill in the corner — the detail sheet then lists each individual award with its own date and note.

Badges awarded during a specific match **also** show as a small emoji row on the bottom-left of that player's chip on the fixture pitch (both the coach's match editor view and the parent/player match page). Only badges linked to that match appear there — their permanent collection is on the card.

### Can I remove a badge?
Yes — each earned-badge chip in the Squad player modal has a small ✕. Tap it to remove. There's no "edit": to refresh a date, remove and re-award.

### Can I share a just-earned badge?
Yes. Immediately after saving an award, a popup offers **💬 Share to WhatsApp** — it pre-fills a message with the badge name, your note, the card link, and the player's access code. Great for the team group chat when a kid's had a big game.

### Why isn't my player getting auto-badges yet?
Auto badges ship in a later update (Slice 9b). Until then, coaches pick them manually. The auto list currently includes: On Fire, Goal Machine, Hat-Trick Hero, Brace, Opening Night, Top Scorer, Super Sub, Brick Wall, Iron Defence, Golden Glove, Consistency King, Ever-Present, Monthly Golden Boot, Lucky Charm, Debut, and all milestones (games/goals/MOTM/clean sheets counters).

---

## Tips & troubleshooting

### My changes aren't saving
Once a lineup has been created via the wizard, edits autosave continuously. If nothing seems to stick, check the match has a game date (required) and an opponent. If the **Save lineup** button does nothing on a legacy lineup, look for missing required fields in the match-details popup.

### I can't see a player I added
Make sure you're on the right team. Player additions are per-team — switching teams shows a different squad.

### The pitch looks squashed on my phone
Scroll the page or refresh the browser. The pitch resizes itself when the window resizes.

### A parent says the link doesn't work
Open the lineup and check the visibility state on the status pill. **Draft** breaks the link entirely; **Availability** hides the pitch but lets parents mark availability; **Published** shows everything.

### A parent says they entered the code but nothing happened
Double-check the code on the player's card. Codes are case-insensitive and ignore spaces. Personal codes are 2 letters + 4 digits (e.g. `JE1234`); family codes are exactly 5 digits.

### Parent responses aren't showing up on my side
The coach view refreshes availability every ~5 seconds while the match editor is open. If you think something's missing, switch away from the lineup and back, or hit the browser refresh. Responses are stored in the database immediately so they won't be lost.

### Can I undo a change?
Not directly. The app has an audit log behind the scenes (admins will eventually have a UI for it), but for now the safest pattern is: save your good lineup, then duplicate it before experimenting.

### Where is my data stored?
In a Supabase database hosted in the cloud. Only members of your team can read your private team data. Published lineups are readable by anyone with the link (that's the whole point of publishing).

### What devices does it work on?
Any modern browser — Chrome, Safari, Firefox, Edge — on phones, tablets, laptops or desktops. Add it to your phone's home screen for an app-like experience.

---

## Coach workflow at a glance

A typical week:

1. **Monday** — Orange **+** → **New match**. Wizard walks you through opponent, date, kick-off, arrival, venue, formation. Click **Create**. Match opens as Draft. Say **Not now** to the WhatsApp prompt if you're not ready to share.
2. **Tuesday** — Tap the status pill → **Availability**. Tap **🔗 Copy availability link for parents** and paste it into the team WhatsApp along with each child's access code (grab them from the Squad tab). Or say **Yes, share** when the wizard's post-create prompt asks.
3. **Wednesday/Thursday** — Watch the **Availability responses** panel fill in (you'll also see coloured dots appear on the pitch chips). Tweak the lineup to suit who's available. Add tactics arrows for set pieces.
4. **Friday** — Tap the status pill → **Published**. The same parent link now shows the pitch — no need to re-share. Parents can still update availability if anything changes.
5. **Match day** — If anyone drops out, edit the lineup and the parent link updates automatically (parents see the change within 6s).
6. **Post-match** — Open Matches, the app auto-lands on today's match (while it's within 24h of kick-off). Tap the amber **⚽ Enter result** button above the sub-tabs → step through the 4-step wizard (HT / FT / Goalscorers / MOTM) → Save. The match card flips green with a **FT 3-2 W** chip; chips on the pitch pick up ★ (MOTM) and ⚽ (goal count) overlays. If you don't enter the result, the card shows red with a **⚠ Needs score** chip until you do.

---

## Roadmap (coming soon)

- **Badges & achievements** — FIFA-style collectible badges for every player. Some **auto-awarded** (Hat Trick Hero, On Fire, 10 games played, Ever-Present, Supersub, etc.) and some **coach-awarded** (Coach's Choice, Training Star, Fair Play, Nutmeg King, Celebration Star, …). Shown under the stats on the player card and in the Squad tab. Full brief in the handoff.
- Email notifications when lineups are published or updated
- Audit log UI to see who changed what
- Team-wide public page so parents can bookmark one URL for the season
- A holistic look-and-feel polish pass
