# Bluies Finest

Hangboard accountability and bragging rights. A mobile-first web app for a small group of climbers. You can log sessions with a protocol-based timer, compete on leaderboards, and cheer each other on in the activity feed.

**Live:** https://hangboarding.github.io/bluies-finest/ (invite-only; install it to your phone's home screen)

## Features

- **Hang timer:** 12 protocols (Max Hangs, Repeaters, Abrahangs, 7/53…), or save your own, plus "Just let me hang".
  - Get-ready countdown, beeps, let-go logging and left/right one-arm hangs.
  - The screen stays awake while you hang.
- **Smart prompts:** warm-up and overtraining reminders, and next time's load adjusted from how hard the session felt.
- **Offline-safe saving:** sessions saved with no signal upload automatically later.
- **Seasons:** Summer, Autumn, Winter and Spring leaderboards (Blue Mountains time). The winner is crowned season champion and joins the Hall of champions.
- **Ranks:** other leaderboards over the last 90 days (strength, grip types, volume and consistency). Strength is scored as % of bodyweight; bodyweight itself is never shown.
- **Stats:** consistency calendar, personal bests, trends and achievements (10 tiers from Iron to GOAT, plus secret ones).
- **Activity:** feed with hearts and comments, a group challenge with a shared progress bar, a weekly recap, and climber profiles.
- **Notifications:** an in-app bell, plus optional phone push notifications ([docs/PUSH.md](docs/PUSH.md)).
- **Admin tools:** invite codes, group challenges, backups and moderation, all from inside the app.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 119 tests: timer, scoring, streaks, seasons, challenges, achievements
```

Without Supabase keys the app runs in **demo mode**: data stays in your browser, there are sample climbers, and the invite code is `BLUIES`.

## Set up the real backend

Follow [docs/SUPABASE.md](docs/SUPABASE.md) (about 15 minutes, free plan). In short:
1. Run `supabase/schema.sql` in a new Supabase project.
2. Add the project URL and publishable key as GitHub secrets.
3. Set up an email sender.
4. Make yourself admin.

## Deploy

Every push to `main` runs the tests, then builds and deploys to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It needs the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and **Settings → Pages → Source: GitHub Actions**.

## How scoring works

- **Session points** = 5, plus time under tension × load factor × edge factor ÷ 2, plus 2 per full hang, plus 20 for a personal best.
  - **Load factor:** % of bodyweight (or target effort for no-hang lifts), capped between 0.4 and 2.
  - **Edge factor:** 20mm ÷ edge size, capped between 0.6 and 1.6, so smaller edges score more.
- Points are recalculated on the server, so they can't be faked.
- **Overall rank** = points from the last 28 days, plus 15 for each week of your current streak (a streak week means 2 or more sessions).

## Project layout

| Path | What's in it |
|---|---|
| `src/views/` | Screens: Hang, Activity, Ranks, Stats, Profile, Admin, sign-in, tour |
| `src/lib/` | Timer, scoring, achievements, offline outbox, and the two backends (demo and Supabase) |
| `supabase/` | `schema.sql` (everything for a new project), update scripts for existing projects, and the `notify` push function |
| `tests/` | Vitest suite |
| `design/` | The original clickable sketch and logo explorations |
