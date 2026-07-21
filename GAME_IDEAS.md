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

## Backlog

### Skyhop
- **Family**: tap games
- **Mechanic**: tap to flap/rise, gravity pulls down, dodge scrolling
  obstacles (Flappy Bird–style).
- **Twist**: obstacle gaps rotate slightly or narrow as score increases,
  instead of static pipes.

### Stackr
- **Family**: tap games
- **Mechanic**: tap to drop a moving block onto a growing stack; overhang
  gets cut off.
- **Twist**: a perfectly aligned drop adds width back instead of only ever
  shrinking — the tower can "recover."

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
