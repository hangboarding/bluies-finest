# Bluies Finest

Hangboard training for the crew: protocol-based timers, session logging, an invite-only leaderboard, an activity feed with hearts and comments, stats and achievements. It's a mobile-first web app and can be installed to your home screen.

- **Frontend:** Vite + TypeScript (no framework), hosted on GitHub Pages
- **Backend:** Supabase (auth, Postgres with row-level security, photo storage)
- **Demo mode:** with no Supabase keys, the app runs entirely in your browser with sample climbers. The invite code is `BLUIES`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

To connect to Supabase, copy `.env.example` to `.env.local` and fill in your keys. Full steps are in [docs/SUPABASE.md](docs/SUPABASE.md).

## Deploy to GitHub Pages

1. Create a GitHub repo and push this folder to its `main` branch.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings → Secrets and variables → Actions** and add the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Every push to `main` builds and deploys automatically ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). The site will be at `https://<user>.github.io/<repo>/`.
5. In Supabase, set the Site URL and redirect URL to that address (see [docs/SUPABASE.md](docs/SUPABASE.md), step 6).

## How scoring works

- **Session points**:
  - 5 points for showing up
  - plus time under tension × load factor × edge factor ÷ 2
  - plus 2 points per full hang
  - plus 20 points for a personal best
- **Load factor**: load as a percentage of bodyweight (target effort for no-hang lifts), capped between 0.4 and 2.
- **Edge factor**: 20mm ÷ edge size, capped between 0.6 and 1.6, so smaller edges score more.
- **Overall rank**: points from the last 28 days, plus 15 for each week of your current weekly streak (2 or more sessions a week).

Bodyweight is stored in a private table that only its owner can read. Other climbers only ever see the resulting percentage.

## Project layout

| Path | What's in it |
|---|---|
| `src/main.ts` | Boot, tabs, theme |
| `src/views/*` | Hang (setup, timer, finish), Activity, Ranks, Stats, Profile, Auth, Tour |
| `src/lib/timer.ts` | Wall-clock timer, wake lock, audio |
| `src/lib/scoring.ts` | Points and leaderboard categories |
| `src/lib/achievements.ts` | 10-tier, one-off and secret achievements |
| `src/lib/local-store.ts` / `supabase-store.ts` | The two backends, behind one `Store` interface |
| `supabase/schema.sql` | Tables, security rules, invite-code signup, storage |
| `design/sketch.html` | The original clickable sketch |

To regenerate the app icons after editing `public/logo.svg`, run `npm run icons`.
