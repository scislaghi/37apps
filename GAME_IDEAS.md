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

### Pulse
- **Family**: tap games
- **Mechanic**: a marker oscillates back and forth; tap to stop it inside a
  target zone that shrinks each round. No physics, no scrolling — the
  simplest possible build.
- **Twist**: consecutive perfect stops build a streak multiplier.

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
