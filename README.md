# Interpro Blues — Lineups

A lightweight web app for planning match lineups, collecting parent availability, and sharing match details with a grassroots youth football team.

Live site: deployed on Vercel from the `main` branch of this repo.

---

## What it does

- **Squad management** — roster, shirt numbers, preferred positions, player photos (with an in-app cropper).
- **Match planning** — create fixtures, pick a formation, drag players onto the pitch, draw tactics arrows and zones.
- **Match visibility, three states:**
  - **Draft** — coach-only.
  - **Availability** — public share link shows match details + a per-player availability form (✅ / 🤔 / ❌ with optional note). Lineup is hidden.
  - **Show lineup** — public share link shows the full lineup and pitch; parents can still update availability.
- **Coach view of responses** — inline availability tally + a per-player modal with timestamps, notes and responder names. Available players are ringed gold on the pitch, unavailable red, maybe marked with a `?`.
- **Fixtures tab** — calendar, upcoming/recent list, one-click share link, availability responses for each game.
- **Parent-friendly share link** — `#/view/{lineup-id}` works with no login, polls every 15 seconds, supports a manual refresh.
- **In-app help tab** — searchable FAQ, same content as `FAQ.md`.

---

## Stack

- **Frontend** — vanilla ES modules, single `web/app.js`, hash-based routing, no build step.
- **Backend** — Supabase (Postgres + Auth + Row Level Security + Storage).
- **Hosting** — Vercel, auto-deploys on push to `main`.
- **Deps** — Leaflet for the venue map picker; Supabase JS client; no framework.

---

## Repository layout

```
web/
  index.html         # entry point
  app.js             # everything (~4000 lines, single file by design)
  styles.css         # all styles
  FAQ.md             # in-app help content (mirrored into the Help tab)
  HANDOFF.md         # cross-session status doc for the maintainer
  logo.png, favicon.png
```

---

## Local development

There's no build step. Open `web/index.html` in a browser, or serve the `web/` folder with any static server:

```bash
cd web
python3 -m http.server 8080
# or: npx serve .
```

Supabase credentials are embedded in `app.js` (public anon key — RLS enforces access control).

---

## Deploying

Push to `main` on GitHub. Vercel auto-deploys the `web/` folder as a static site.

Schema and RLS changes are **not** stored as files in the repo. They are run manually via the Supabase SQL editor. Each feature branch should note any required SQL migrations in its PR description.

---

## Architecture notes

- **RLS pattern** — cross-table policies that would recurse are split behind `SECURITY DEFINER` helpers (e.g. `team_has_published_lineup()`, `lineup_is_parent_visible()`, `can_manage_player_photo()`).
- **Lineup visibility** — driven by a single `lineup_status` column (`draft` | `availability` | `published`). A before-insert/update trigger keeps the legacy `published` boolean + `published_at` in sync.
- **Parent auth model** — no per-parent accounts. The share URL is the credential; RLS scopes read/write of `player_availability` through `lineup_is_parent_visible(lineup_id)`.
- **Pitch sizing** — every pitch container uses `aspect-ratio: 7/10` and SVG `viewBox="0 0 70 100"`. If you ever change one, change them all.
- **Player photos** — stored in the `player-photos` Supabase Storage bucket; cropped and compressed client-side to 512×512 JPEG before upload.

---

## Roles

- **Admin** — owns a team; can invite, change roles, edit anything.
- **Coach** — edit squad, lineups, plays; publish lineups; see availability responses.
- **Parent / viewer** — read-only; can mark availability for any player via the share link (WhatsApp-trust model).

---

## Roadmap

See `web/HANDOFF.md` for the live status and slice breakdown. Short version: invites + admin panel next, then email notifications, audit log UI, branding polish. Future slices cover season history, live match day controls, training attendance, and multi-team clubs.

---

## License

Private project. All rights reserved.
