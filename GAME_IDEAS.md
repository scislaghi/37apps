# 37apps — Game Ideas Backlog

> Living document. Add, edit, or drop ideas here as they evolve. Not a
> commitment — just the pool we pick game #2, #3, ... from. See `plan.md`
> for the portfolio-level plan and `brand/brand-kit-v1.html` for the shared
> visual system.

## In development

### Ploop Hunt — game #1
- **Family**: simple puzzles / predator-prey
- **Mechanic**: move an omnidirectional piece on a 7×7 grid, capturing enemy
  pieces before a countdown timer runs out; each enemy type slides in a
  different set of directions (orthogonal, horizontal/vertical-only,
  diagonal, omnidirectional), shown via a colored arrow-burst glyph instead
  of a text character.
- **Twist**: it's turn-based now, not a static puzzle — every move you make,
  the enemy nearest to you takes a chase move of its own (telegraphed with a
  brief pulse before it slides); land on your square and it's game over.
  Capturing adds time back to the clock and spawns a replacement enemy
  guaranteed to *not* threaten you on its first move. No move-hint overlays
  on the board — you read the piece types and the position yourself.
- **Status**: renamed from "Ploop Chess" and reworked end-to-end (new name,
  icon-based pieces, hint-free board, enemy chase AI, safe-spawn logic,
  slide/telegraph/capture/spawn animations, procedural SFX via
  `@37apps/core/audio.js`) after a full design pass; native iOS/Android
  bundle id and package also renamed to `com.simonecislaghi.ploophunt`.
  Verified end-to-end in a real browser via the Playwright CLI skill
  (move, capture, safe-spawn placement, chase-and-catch death, timeout
  death, denied-tap feedback all confirmed working).

### Morph — game #2
- **Family**: endless runners
- **Mechanic**: an infinite runner where the player is a cube that moves
  forward automatically. Dragging up or down morphs it into a vertical or
  horizontal rectangle. Obstacles along the path have gaps of a specific
  shape/size — the player must morph into the matching shape before
  reaching each one. Wrong shape/size on contact = game over.
- **Twist**: continuous shape-matching under time pressure, instead of the
  usual jump/slide runner input — the "twist" IS the core mechanic here.
- **Status**: built from scratch (React + Vite + Capacitor), core loop
  verified headless (drag → morph → collision → game over all confirmed
  working); AdMob + best-score persistence wired with the same pattern as
  Ploop Chess.
- Reworked after feedback: rotated to a vertical scroll (obstacles move
  top-to-bottom toward a player fixed near the bottom, matching phone
  portrait orientation), player restyled as a gelatinous blob (gradient
  fill, bouncy overshoot morph transition, idle squash/stretch wobble,
  eyes), and obstacles/background now cycle through the full brand accent
  palette instead of a single neutral tone.
- Reworked again into a pseudo-3D forward runner (gates rush toward the
  camera down a perspective road instead of scrolling vertically), ported
  from a revised canvas prototype and rebuilt in DOM/inline-style (CSS
  `clip-path` road, per-frame projected gate walls) like every other game.
  Fixed two realism/feel bugs found in that prototype: gate openings are
  now always flush with the road surface for every shape (previously only
  the tall gate's opening reached the floor; the cube/wide openings floated
  above it, making the grounded jelly appear to "hop" to enter them), and
  the jarring full-screen white flash on every successful pass was replaced
  with a small localized glow so passing through a gate never reads as a
  hitch. Core loop verified in a real browser via Playwright (correct
  passes on both drag directions, wrong-shape death, retry). Still cycles
  the full accent palette per gate; AdMob + save wired the same way as
  every other game.

### Pulse — game #3
- **Family**: tap games
- **Mechanic**: a marker oscillates back and forth on a bar; tap to stop it
  inside a target zone that shrinks each round. No physics, no scrolling —
  the simplest build of the three so far.
- **Twist**: landing dead-center scores a PERFECT; consecutive perfects
  build a streak that adds a scoring bonus. A non-perfect hit still scores
  but resets the streak; missing the zone entirely ends the run.
- **Status**: built (React + Vite + Capacitor), core loop verified headless
  (tap timing, scoring, streak bonus, miss → game over, best-score
  persistence across restarts all confirmed); AdMob wired the same way as
  the other two games.

### Stackr — game #4
- **Family**: tap games
- **Mechanic**: same oscillation as Pulse, applied to building a tower —
  a block swings left/right above the stack; tap to drop it. Whatever
  hangs outside the block below gets cut off and falls away; if it lands
  completely outside, the tower topples (game over).
- **Twist**: landing dead-center scores a PERFECT and keeps full width
  instead of shrinking, plus builds a streak bonus, exactly like Pulse —
  so the tower can "recover" instead of only ever narrowing.
- **Status**: built (React + Vite + Capacitor), core loop verified
  headless (drop → cut/overlap math, perfect-width recovery, streak bonus,
  miss → game over, best-score persistence all confirmed); AdMob wired the
  same way as the other games.

### Skyhop — game #5
- **Family**: tap games
- **Mechanic**: tap to flap/rise, gravity pulls down, dodge scrolling
  pipe gaps (Flappy Bird–style). Real velocity/gravity physics, not a
  discrete state machine like the other games.
- **Twist**: gap height shrinks and each pipe pair tilts a few degrees
  (randomized) as score increases, instead of static upright pipes.
- **Status**: built using `@37apps/core` from the start (no per-game
  ads.js/save.js duplication). Core loop verified headless — flap physics,
  gravity, gap collision, scoring, and game-over all confirmed correct via
  direct instrumentation (an initial quick test looked like a bug — the
  game was fine, the test's tap cadence was the issue). AdMob + save wired
  the same way as the other games. Accent: Signal Coral, per the original
  brand kit mockup.

### Swipe — game #6
- **Family**: tap games
- **Mechanic**: a vertical stack of hexagons, each carrying a directional
  arrow; swipe (or tap left/right) to match the arrow before a 30s countdown
  runs out. Correct swipes refill the clock and build a streak.
- **Twist**: some hexagons are marked as traps (chance grows with progress,
  capped at 32%) — the correct swipe for those is the *opposite* of the
  arrow shown, forcing constant re-reading instead of pure reflex.
- **Status**: built (React + Vite + Capacitor) from an existing canvas
  prototype, rebuilt as DOM/inline-style like every other game and wired
  onto `@37apps/core` (ads, save, ScoreHeader/StartScreen/GameOverCard)
  from the start. Core loop verified via Playwright (25-swipe correct
  streak with live timer refill, deliberate wrong swipe ending the run,
  tap-to-retry). Accent: Cobalt Bright; hex tiles cycle the full 8-color
  brand palette (Morph-style), which doubles as the game's signature motif.

### Ploop Climb — game #7
- **Family**: physics games
- **Mechanic**: an isometric endless climber — hop diagonally left/right up
  a brick-offset grid of blocks. Trees block a step without ending the run;
  spikes, crumbling rock and gaps are deadly. A collapse rises from below
  and ends the run if it catches the climber.
- **Twist**: obstacle density and collapse speed both scale with altitude,
  and row generation guarantees every column always has at least one
  reachable non-deadly diagonal (no cheap forced deaths) — pressure comes
  from the chase, not from unfair terrain.
- **Status**: built (React + Vite + Capacitor) from an existing canvas
  prototype, rebuilt as DOM/inline-style isometric blocks (CSS `clip-path`
  per face) like every other game, wired onto `@37apps/core` from the
  start. Core loop verified via Playwright: normal climbing progress,
  tree-bump without death, hazard-landing death ("You slipped!"),
  collapse-catch death ("Buried in rubble!") at the expected ~29s timing,
  NEW BEST, and tap-to-retry. Accent: Volt Lime for the world/UI, a
  contrasting Cobalt-jacketed climber sprite so the player never blends
  into the terrain. Signature motif: the living sky + rising collapse the
  climber is chased through.

## Backlog

### Orbit
- **Family**: physics games
- **Mechanic**: a ball orbits a central point; tap to reverse orbit
  direction to dodge incoming obstacles from outside.
- **Twist**: TBD — maybe multiple satellites controlled together.

### Wedge
- **Family**: physics games
- **Mechanic**: a rotating filled circle; tap to slice it at a precise
  point, trying to keep both halves balanced.
- **Twist**: TBD.

---

## Template for new ideas

```
### <Name>
- **Family**: tap games / physics games / endless runners / simple puzzles
- **Mechanic**: <one core mechanic, understandable in 5 seconds>
- **Twist**: <what makes it not a direct clone>
- **Status**: idea / prototype / in development / shipped
```
