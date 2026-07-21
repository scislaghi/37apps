# 37apps — Game Ideas Backlog

> Living document. Add, edit, or drop ideas here as they evolve. Not a
> commitment — just the pool we pick game #2, #3, ... from. See `plan.md`
> for the portfolio-level plan and `brand/brand-kit-v1.html` for the shared
> visual system.

## In development

### Ploop Chess — game #1
- **Family**: simple puzzles
- **Mechanic**: move a chess-like piece on a 7×7 grid, capturing enemy
  pieces before a countdown timer runs out; each piece type moves in a
  different set of directions (orthogonal, diagonal, all-directions).
- **Twist**: your own piece's move type changes randomly every 3 captures,
  forcing you to re-read the board; capturing adds time back to the clock.
- **Status**: working prototype exists (plain React/DOM), being wrapped as
  the first real Capacitor app.

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
