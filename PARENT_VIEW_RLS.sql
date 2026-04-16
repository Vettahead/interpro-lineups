-- Parent view (Slice 5) — public read access for published lineups
-- Paste this into Supabase → SQL Editor → Run.
-- Safe to re-run: each policy is dropped first.

-- 1) Anyone (incl. signed-out / anon) can read PUBLISHED lineups
drop policy if exists "public read published lineups" on lineups;
create policy "public read published lineups"
  on lineups for select
  to anon, authenticated
  using (published = true);

-- 2) Anyone can read the TEAM of a published lineup
--    (so we can show team name / home ground on the parent view)
drop policy if exists "public read teams with published lineups" on teams;
create policy "public read teams with published lineups"
  on teams for select
  to anon, authenticated
  using (
    exists (
      select 1 from lineups
      where lineups.team_id = teams.id
        and lineups.published = true
    )
  );

-- 3) Anyone can read PLAYERS on a team that has any published lineup
--    (so we can show names/numbers on the pitch)
drop policy if exists "public read players for teams with published lineups" on players;
create policy "public read players for teams with published lineups"
  on players for select
  to anon, authenticated
  using (
    exists (
      select 1 from lineups
      where lineups.team_id = players.team_id
        and lineups.published = true
    )
  );
