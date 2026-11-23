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

Harder training earns more, and there's nothing to gain from gaming it.

- **Work** = time under tension × intensity² × edge factor.
  - **Intensity:** load as a fraction of bodyweight on two arms, worked out on the server from the kg you entered and your bodyweight (70kg is assumed if you haven't set it). +20% added = 1.2; a one-arm hang counts double; no-hang lifts use the weight lifted per hand × 2. Capped between 0.4 and 3. Squared, so heavier hangs earn clearly more.
  - **One-arm hangs** count each arm's time at half, so left + right at bodyweight equals a two-arm hang at +100%: the same load on each arm.
  - **Edge factor:** 20mm ÷ edge size, capped between 0.6 and 1.6, so smaller edges score more.
- **Points are scored per day.** A day's work is worth 40 × ln(1 + work ÷ 40): more always scores more, with diminishing returns, so long easy volume can't beat heavy work. Each session gets what it adds to its day, so splitting training into lots of little sessions earns nothing extra.
  - Holding every hang its full time adds up to 25% to a session's work points.
  - +5 for the day's first session with 15s or more under tension, and +10 for the day's first personal best (checked on the server).
- Points are calculated on the server, so they can't be faked, and a finished season's points never change.
- **Overall rank** = points from the last 28 days, plus 15 for each week of your current streak (a streak week means training on 2 or more different days).

## Project layout

| Path | What's in it |
|---|---|
| `src/views/` | Screens: Hang, Activity, Ranks, Stats, Profile, Admin, sign-in, tour |
| `src/lib/` | Timer, scoring, achievements, offline outbox, and the two backends (demo and Supabase) |
| `supabase/` | `schema.sql` (everything for a new project), update scripts for existing projects, and the `notify` push function |
| `tests/` | Vitest suite |
| `design/` | The original clickable sketch and logo explorations |
