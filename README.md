# Bluies Finest

Hangboard accountability and bragging rights. A mobile-first web app for a small group of climbers. You can log sessions with a protocol-based timer, compete on leaderboards, and cheer each other on in the activity feed.

**Live:** https://hangboarding.github.io/bluies-finest/ (invite-only; install it to your phone's home screen)

## Features

- **Hang timer:** 12 protocols (Max Hangs, Repeaters, Abrahangs, 7/53…), or save your own, plus ⚡ Quick Sesh.
  - Picking a protocol loads its recommended settings; your load (added weight or assist) is remembered for each one. Pick it again to reset it. Your own protocols keep whatever you last set.
  - Every protocol (⚡ Quick Sesh too) can be a hang or a no-hang lift. A lift counts only the weight lifted (plates, a dumbbell), never your bodyweight.
  - Get-ready countdown, beeps, let-go logging and left/right one-arm hangs.
  - The screen stays awake while you hang.
- **Workouts:** queue several protocols (built-in or your own) with a rest between each, then save the list or just start it.
  - Drag to reorder, tweak any exercise's numbers and grip, duplicate or remove, and start from a few starter workouts.
  - The Hang page offers two paths: a single session, or a saved workout (tap the switch, or swipe left and right).
  - Each exercise is saved as its own session (so points, PBs and leaderboards work as before). Rate each one at the end and its load in that workout adjusts next time.
  - Finished exercises are kept on the phone until saved, so closing the app mid-workout loses nothing.
  - Workouts and your own protocols sync between your devices; rename or delete protocols under **My protocols**.
- **Session names:** a session goes by its protocol's name unless you give it your own ("Birthday hang"), on the summary when you save it or later in History. The feed and History show your name with the protocol under it, and renaming one of your own protocols renames it on the sessions you've logged with it too.
- **History:** every session you've logged (in the Workouts tab), with delete, "do it again" and edit (name, hang or lift, load and edge, grip, fingers, board, edge, feel, effort rating and note; the timings come from the timer and stay as they were).
- **Smart prompts:** warm-up and overtraining reminders, and next time's load adjusted from how hard the session felt.
- **Offline-safe saving:** sessions saved with no signal upload automatically later.
- **Seasons:** Summer, Autumn, Winter and Spring leaderboards (Blue Mountains time). The winner is crowned season champion and joins the Hall of champions.
- **Ranks:** one leaderboard card: pick a board (points, strength, each grip type from open hand and drag to crimps, pinch and sloper, volume, days trained) and it shows the podium, who rules it, the top 10 as bars and how far you are from the next place. Every board works for this week, this month, this season or overall (points: the last 28 days plus the streak bonus; the others: the last 90 days), and it moves through them by itself: the podium rises and the crown twinkles in, and climbers slide to their new places; tap one to jump to it, or pause it. Weekly streak and Most improved have a card of their own. Strength is scored as % of bodyweight; bodyweight itself is never shown.
- **Stats:** consistency calendar, personal bests, trends and achievements (10 tiers from Iron to GOAT, plus secret ones). A new achievement pops up the moment it's earned, whatever earned it.
- **Activity:** feed with hearts and comments, a group challenge with a shared progress bar, a weekly recap, and climber profiles.
- **The weekly flock:** the bird button next to the bell opens a Blue Mountains clearing where every 30 points anyone earns this week brings in a bird, wearing a leg band in its climber's colour. The birds fly off when Sunday ends, and each week brings a different species: pied currawongs, galahs, king parrots, sulphur-crested cockatoos, eastern rosellas, magpies, ravens, wood ducks, crimson rosellas, red wattlebirds and yellow-tailed black cockatoos, then round again. The button takes the shape of the week's bird and shows a dot when new birds have arrived. Across the top, "Bird of the week" with its name and scientific name, and four facts about it, one at a time (tap or swipe for the next).
  - They walk, hop, peck, pull curl grubs out of the ground, crack seeds (parrots hold them up in one foot), drink and bathe at the pond, preen, stretch, sing (magpies carol together), perch on the branches (galahs and cockies hang upside down), pester each other, steal food and squabble. Wood ducks graze and swim, and wattlebirds feed at the grevillea and the waratah. The insect-eaters stalk grasshoppers and Christmas beetles and pounce, fly up to snatch midges, butterflies and dragonflies out of the air, and snap up any they pass in flight (moths come out at night instead). At night they roost, cuddled up in rows along the branches (preening each other now and then); whoever can't fit sleeps on the ground, huddled together at the foot of a bush, and the ducks sleep on the pond or the bank. In the morning they wake one by one.
  - The clearing: gums at the back and front with four branches to perch on (each wavering and knotted, with twigs of drooping gum leaves, or broken stubs and a hollow on the dead one); a she-oak, a young gum, a flowering wattle and a tea-tree in the middle; tree ferns, banksia, waratah, grevillea, heath, bracken and tussocks; and a pond running off the left edge and winding away towards the horizon, with sandstone rocks, reed beds and cumbungi along its edge, lilies, duckweed and ribbonweed. Big mossy boulders sit about the clearing and round the water, fallen logs and sticks lie every which way among the leaf litter and curls of bark, and wonga vine, clematis and hardenbergia climb the bigger trees. Birds walk behind and in front of the trees and bushes, which sway gently in the breeze, the crowns of the big gums and the forest behind too; a gust leans everything over as it crosses the clearing, and it all springs back. Dust drifts in the light, gum leaves fall, little white curls of wind blow past, and now and then a gust ruffles everyone's feathers and blows leaves across. The sky follows the real time of day.
  - Other animals: a powerful owl lives in the hollow of an old dead stag and comes out at night, hooting, to swoop on the antechinus scurrying about; skinks dart between the rocks and a water dragon basks by the pond by day, bolting into the water if a bird comes too close; at dusk, now and then, a red-bellied black snake slides across (swimming the pond if it's in the way) and sends nearby birds up with alarm calls; a kangaroo or swamp wallaby sometimes hops by in the distance, stopping to graze or sit up; and at night a wombat comes out of its burrow on the left to graze, scratch and wander, going back underground by morning. Overhead, a loose flock of sulphur-crested cockatoos screeches across now and then through the day, yellow-tailed black cockatoos wail slowly over at dusk, and at night microbats flit about the clearing, snapping up moths.
  - Tap the ground to throw seed, or a bird to startle it; tap an animal and it reacts (the owl turns and hoots). Tap a climber below the clearing and their birds look up. Calls are made in the browser and follow the Sound setting; the speaker button at the top right mutes just the birds and animals on this phone.
- **Notifications:** an in-app bell for hearts, comments and losing your top-3 place on the Overall board, plus optional phone push notifications ([docs/PUSH.md](docs/PUSH.md)).
- **Admin tools:** invite codes, group challenges, the bird of the week (pick one for everyone, or leave it on the weekly rotation), backups and moderation, all from inside the app.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 392 tests: timer, scoring, streaks, seasons, challenges, achievements, workouts (including full workout runs on the Hang page), top-3 alerts, the weekly flock (every species run through a busy few minutes)
```

Without Supabase keys the app runs in **demo mode**: data stays in your browser, there are sample climbers, and the invite code is `BLUIES`.

## Set up the real backend

Follow [docs/SUPABASE.md](docs/SUPABASE.md) (about 15 minutes, free plan). In short:
1. Run `supabase/schema.sql` in a new Supabase project. To update an existing project later, run the whole file again: it's safe to re-run.
2. Add the project URL and publishable key as GitHub secrets.
3. Set up an email sender.
4. Make yourself admin.

## Deploy

Every push to `main` runs the tests, then builds and deploys to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It needs the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and **Settings → Pages → Source: GitHub Actions**.

## How scoring works

Harder training earns more, and there's nothing to gain from gaming it.

- **Work** = time under tension × intensity² × edge factor.
  - **Intensity:** load as a fraction of bodyweight on two arms, worked out on the server from the kg you entered and your bodyweight (70kg is assumed if you haven't set it). +20% added = 1.2; a one-arm hang counts double; no-hang lifts use the weight lifted per hand × 2 (never your bodyweight). Capped at 3; a hang counts as at least 0.4, but a lift counts only what it lifts. Squared, so heavier hangs earn clearly more.
  - **One-arm hangs** count each arm's time at half, so left + right at bodyweight equals a two-arm hang at +100%: the same load on each arm.
  - **Edge factor:** 20mm ÷ edge size, capped between 0.6 and 1.6, so smaller edges score more.
  - **Abrahangs and Warm-up** are done light (feet on or assisted), which people rarely enter as assist, so they count at most 60% of bodyweight.
- **Points are scored per day.** A day's work is worth 40 × ln(1 + work ÷ 40): more always scores more, with diminishing returns, so piling on easy volume pays less and less. Each session gets what it adds to its day, so splitting training into lots of little sessions earns nothing extra.
  - Holding every hang its full time adds up to 25% to a session's work points.
  - +5 for the day's first session with 15s or more under tension, and +10 for the day's first personal best (checked on the server).
- Points are calculated on the server, so they can't be faked, and a finished season's points never change.
- **Overall rank** = points from the last 28 days, plus 15 for each week of your current streak (a streak week means training on 2 or more different days).

## Project layout

| Path | What's in it |
|---|---|
| `src/views/` | Screens: Hang, Workouts, Activity, Ranks, Stats, Profile, Admin, sign-in, tour, the weekly flock |
| `src/lib/` | Timer, scoring, workouts, achievements, offline outbox, the weekly flock's counting (`flock.ts`), and the two backends (demo and Supabase) |
| `src/aviary/` | The weekly flock's birds: species (`species.ts`), the posable bird drawing (`rig.ts`), behaviours (`sim.ts`), the clearing (`scene.ts`), drawing a frame (`render.ts`) and calls (`sound.ts`) |
| `supabase/` | `schema.sql` (the whole database in one re-runnable file) and the `notify` push function |
| `tests/` | Vitest suite, including `schema.test.ts`, which runs `schema.sql` in an in-process Postgres and checks its points match the app |
| `docs/` | Setup guides: [SUPABASE.md](docs/SUPABASE.md) (backend) and [PUSH.md](docs/PUSH.md) (phone notifications and problem reports) |
| `public/` | App icons, the push notification worker, and the standalone tour page linked from sign-in |
| `scripts/` | `og-image.mjs`, which draws the link-preview image (`public/og-image.png`) |
