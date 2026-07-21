# 37apps — Project Plan

> Living document. Update as decisions evolve.

## 1. Vision

Build a personal "mobile app factory": a portfolio of very simple, hyper-casual
games, all sharing the same technical framework and the same minimal visual
brand, but with different core mechanics (Flappy Bird / Stack / Snake / Helix
Jump style). No levels — only score (and optionally a running timer).
Monetization through ads only. No backend, no website, no social, no
newsletter. Everything runs locally on the user's device, including offline.

Goal: publish ~15 games in 6 months to find out if at least one reaches
5,000–10,000 monthly active users (MAU).

## 2. Business / Publishing Setup

- Use existing Italian Partita IVA for revenue (advertising income) — confirm
  correct ATECO/tax treatment with accountant.
- Publish under **personal name** on both stores for now (simpler than setting
  up a company/org account). "37apps" stays as the internal project/repo name
  only, not necessarily the public developer name.
- Google Play Console: one developer account, ~€25 one-time.
- Apple Developer Program: one account, ~€99/year.
- Suggested order: launch on Android first (faster iteration/testing), then
  port winners to iOS.

## 3. Ads & Analytics

- Single AdMob account for all games (one per game = separate ad unit IDs, not
  separate accounts). Concretely: one Google AdMob account → register each
  game as its own "app" inside that account → each app gets its own App ID
  plus its own banner/interstitial/rewarded ad unit IDs. Payments, reporting,
  and mediation stay unified across the whole portfolio; only the IDs differ
  per game.
- Ad formats: banner, interstitial (between runs), rewarded video (continue /
  bonus score).
- Implementation: `@capacitor-community/admob` plugin, one integration per
  game (banner + interstitial wired in Ploop Chess using Google's public
  test ad unit IDs until the real AdMob account/app entries exist — swap in
  real IDs at publish time, no code changes needed elsewhere).
- Single Firebase project, one app entry per game, using only:
  - Firebase Analytics (minimal events: install, first open, session,
    Day 1 retention, Day 7 retention)
  - Firebase Crashlytics
- No custom internal dashboard for now — rely on Google Play Console, App
  Store Connect, and AdMob console directly.
- No website, no social channels, no newsletter, no CRM/email at this stage.

## 4. Technical Architecture

- No backend, no database, no authentication.
- All data local on-device (score, best score, settings, unlocks, IAP state).
- Stack: **React + Vite + Capacitor** (not Unity — revised after game #1's
  prototype turned out to be plain React/DOM with no performance-heavy
  rendering, a clean fit for a Capacitor-wrapped web app). Each game is its
  own standalone Capacitor project (own bundle id, own store listing) under
  `games/<name>/`. AdMob via a Capacitor community plugin.
- Shared framework: **`packages/core` (`@37apps/core`)**, an npm workspaces
  package (root `package.json` lists `games/*` and `packages/*` as
  workspaces). Extracted after 4 games had already duplicated the same
  code verbatim, not designed upfront — evidence-based, not guessed.
  Every game's `dist/` build stays a fully static, self-contained bundle;
  the workspace link only matters at `npm run build` time, so nothing
  changes about how each game is built/synced/released for Android or iOS.
  Currently covers:
  - `ads.js` — AdMob init/banner/interstitial (test IDs by default, real
    per-game IDs can be passed in later)
  - `save.js` — `createBestScoreStore(key)` factory over
    `@capacitor/preferences`
  - `theme.js` — shared neutrals (bg/text/textMuted/panelBg), the two font
    stacks, and the 8-color accent palette
  - `components/` — `ScoreHeader`, `StartScreen`, `GameOverCard` (the
    screens that turned out identical in shape across games; each game
    still owns its actual gameplay view and any header that doesn't fit,
    e.g. Ploop Chess's timer bar)
  - Still to fold in as more games are built: audio manager, settings
    screen, skin/theme swapping beyond a single accent color
- Target flow per game:
  Menu → Play → Game Over → Retry / Watch ad to continue → Back to Menu.

## 5. Game Design Rules

- One core mechanic per game, understandable within 5 seconds.
- Session length: 30 seconds to 3 minutes.
- No levels, no story, no complex inventory — score-driven only (best score,
  maybe simple achievements/skins).
- Each game = "known mechanic + one new twist" (avoid direct clones).
- **English only** — all in-game text, store listings, and UI copy across
  every game. No localization/multi-language support for now: keeps the
  pipeline simple and shipping fast; revisit only if a specific game gets
  real traction.
- Group games into families to speed up development:
  - Tap games (~10) — 3–7 days each
  - Physics games (~8) — 1–2 weeks each
  - Endless runners (~5) — 2–3 weeks each
  - Simple puzzles (~7) — 1–2 weeks each

## 6. Brand Kit (to define together)

Direction: **minimal, clean, modern**, consistent across all games so the
whole portfolio feels like one recognizable family while each game keeps its
own accent color/theme.

- [ ] Color palette: 1 neutral base (background/UI) + per-game accent color
- [ ] Typography: one primary display font (headings/score) + one
      readable UI font (menus/settings) — TBD
- [ ] Logo / app icon system: shared icon template/frame, swap only inner
      symbol+color per game
- [ ] UI kit: buttons, pause menu, game-over screen, settings screen —
      same layout skeleton reused across all games
- [ ] Sound identity: consistent SFX style (tap, score, game-over) across
      the portfolio
- [ ] Store assets template: consistent screenshot layout, feature graphic
      style, description structure for ASO

*(Open discussion: share references/inspiration so we can lock the palette
and fonts.)*

## 7. Legal / Compliance

- Privacy policy template (reusable, per-app variables)
- Terms template
- GDPR consent for ads
- Apple ATT (App Tracking Transparency) prompt handling

## 8. Roadmap / To-do

- [x] Draft brand kit v0.1 (colors, fonts, icon system, UI kit) — see
      `brand/brand-kit-v1.html`; per-game re-theming still pending
- [x] Scaffold Ploop Chess as a React + Vite + Capacitor project
      (`games/ploop-chess/`) — game #1, reusing the existing prototype
- [x] Build Ploop Chess end-to-end on device (validates full pipeline:
      build → Capacitor → Android/iOS install)
- [x] Translate Ploop Chess UI copy to English (was Italian in the prototype)
- [x] Re-theme Ploop Chess onto the brand kit's dark neutral + accent palette
      (Violet Spark)
- [x] Wire AdMob (banner + interstitial) in Ploop Chess with Google's public
      test ad unit IDs — confirmed rendering a real test banner on Android
- [x] Persist best score locally (`@capacitor/preferences`) in Ploop Chess
- [x] Scaffold Morph as a React + Vite + Capacitor project
      (`games/morph/`) — game #2, built from the drag-to-morph idea; core
      loop verified headless, AdMob + save wired the same way as game #1
- [x] Scaffold Pulse as a React + Vite + Capacitor project
      (`games/pulse/`) — game #3, tap-timing mechanic; core loop verified
      headless, AdMob + save wired the same way as games #1–#2
- [x] Scaffold Stackr as a React + Vite + Capacitor project
      (`games/stackr/`) — game #4, block-stacking with the same oscillation
      mechanic as Pulse; core loop verified headless, AdMob + save wired
      the same way as games #1–#3
- [x] Extract `packages/core` (`@37apps/core`) as an npm workspaces
      package — `ads.js`, `save.js`, `theme.js`, and the `ScoreHeader` /
      `StartScreen` / `GameOverCard` components; all 4 existing games
      migrated over and re-verified headless, no native/build-side impact
- [x] Scaffold Skyhop as a React + Vite + Capacitor project
      (`games/skyhop/`) — game #5, Flappy Bird–style flap/gravity physics;
      built using `@37apps/core` from the start; core loop verified
      headless, AdMob + save wired the same way as games #1–#4
- [ ] Set up Google Play Console account
- [ ] Set up real AdMob account + register each game as its own app + real
      ad unit IDs (swap in over the test IDs)
- [ ] Set up Firebase project (Analytics + Crashlytics)
- [ ] Publish game #1 (Ploop Chess) on Android
- [ ] Create privacy policy / terms templates
- [ ] Set up Apple Developer account
- [ ] Port game #1 to iOS
- [ ] Extract shared "core" (ads, save, UI, audio, skins) from Ploop Chess
      once it's shipped and proven
- [ ] Iterate: build games #2–#15 using the shared core — see
      `GAME_IDEAS.md` for the mechanic backlog
- [ ] Track Day 1 / Day 7 retention per game via store consoles + Firebase
- [ ] After 6 months: review portfolio, kill underperformers, double down on
      any game approaching 5,000–10,000 MAU

## 9. Key Metrics to Watch

| Metric | Good target |
|---|---|
| D1 retention | > 35% |
| D7 retention | > 10% |
| Avg session length | > 3 min |
| Store rating | > 4.0 |
