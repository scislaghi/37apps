# Blip

Tap the lit cells before the clock dies. Every cell you clear buys time back.

## Loop

- The round opens with **10 seconds** on the clock and it never stops draining.
  The only source of time is the board: clearing a cell pays some of it back,
  capped at **14 s** so a hot streak banks as score rather than as a stockpile.
- Cells arrive on their own cadence into free tiles. The board holds a few at
  once, and both the cadence and the ceiling tighten as the score climbs.
- **Tapping a dark tile costs 0.5 s** and breaks the streak. Without that, the
  optimal strategy is to mash all nine tiles forever, which is not a game.
- **Score** is what you clear, times the streak multiplier.

## The three cells

Each kind is a different *shape of attention*, not just a different colour —
so each one also owns a distinct interior, because colour alone doesn't survive
a board moving this fast.

| Cell | Reads as | Costs you |
| --- | --- | --- |
| **Plain** (Cyan Arc) | a pulsing dot | one tap |
| **Multi** (Violet Spark) | a numeral, 2–5 | that many taps — it pins you to one tile while the rest of the board fills |
| **Fuse** (Amber → Coral) | a depleting ring around its own countdown | one tap, but before the ring empties — miss it and it takes **1.5 s** with it |

The fuse counts in units of **90 ms**, so a "30" is 2.7 s and a "10" is 0.9 s.
That's deliberate: a fuse ticking in real seconds would read as a second clock
competing with the round timer instead of as a fuse racing.

Kinds unlock in order — multi from score 4, fuse from score 8 — so the first
ten seconds of a first run teach exactly one thing.

## Boards

Picked before the round, same rules on both, one best score each
(`blip.best.3` / `blip.best.5`):

- **3 × 3 "Quick"** — nine tiles is a glance. Fewer live cells, slower cadence.
- **5 × 5 "Wide"** — twenty-five tiles is a scan, so it gets more cells to hunt
  and less time per cell.

Both render at the same on-screen footprint, so switching changes the tile
scale, not the size of the playfield.

## The time economy

The clock only ever refills from cells, and cells only arrive at the spawn
cadence — so the honest unit is **per spawn**, not per second. A plain cell is
worth `spawnInterval × gainRatio`:

- above **1.0** the board pays for itself if you clear everything;
- below **1.0** it cannot, no matter how perfectly you play.

`gainRatio` runs 1.45 → 0.65 across the first 70 points and crosses 1.0 around
score 39. That's what makes a run finite by design rather than by waiting for
the player to eventually fumble.

The other half of the guarantee is that **spawns are rate-limited, full
stop**. Time supply per second is `spawnRate × interval × ratio × avgKind`,
so if anything lets the spawn rate exceed `1 / interval`, the ceiling stops
being a ceiling. Everything below is a variation on that one leak.

## Balance findings

All five came out of scripted browser runs, not review. Each one produced a
bot that could not be killed, and each time the arithmetic said it should have
been — which is the argument for measuring instead of reasoning:

1. **Uncapped streak bonus.** `floor(streak / 4)` added per clear compounds; a
   25-second run reached ×29 and a score of 1918, at which point every earlier
   decision in the run is worthless next to "don't miss for another ten
   seconds". Now a real multiplier capped at **×4** — which is also what makes
   the `×N` chip in the header mean what it says.
2. **Multi cells paid `hits × 0.85 × unit`** of clock. A multi occupies one
   spawn slot, so that let a fast player farm them into an endless run. Now
   `1 + (hits − 1) × 0.18`: their extra value is score, not clock.
3. **The gain-ratio floor was 0.82**, above the ≈0.77 break-even implied by
   the late-game kind mix. A 5 taps/s bot sat at a full clock for 200 s.
4. **The spawn accumulator was held at `due` while the board was full**, so a
   cleared slot refilled instantly. That seems kinder, but at saturation it
   makes the spawn rate equal the *clear* rate — the cadence stops being a
   rate limit and becomes a faucet the player opens by tapping faster. The
   tick is consumed now whether or not there was room.
5. **The anti-dead-air shortcut fired on the instant of emptiness.** A fast
   player empties the board for a moment after *every* clear, so they
   collected the rushed cadence permanently: 2.73 spawns/s against a 2.22/s
   ceiling. It's now gated on the board having sat empty for 250 ms **and** on
   `interval > 0.6`. The second condition is the real one: plain and multi
   cells never expire, so at a tight cadence an empty board doesn't mean the
   game stalled — it means the player is outrunning it, which is exactly the
   case that must not be handed extra clock.

Final scripted runs on 3 × 3, all finite, all inside the 30 s–3 min session
target from `plan.md §5`:

| tap pace | outcome | spawns/s | score |
| --- | --- | --- | --- |
| 100 ms (10/s) | died at 89 s | 2.22 | 1845 |
| 150 ms (6.7/s) | died at 94 s | 2.21 | 1963 |
| 250 ms (4/s) | died at 74 s | 2.11 | 1263 |
| 400 ms (2.5/s) | died at 37 s | 1.48 | 372 |

The bot has zero targeting latency and always takes the fuse first, so the
fast rows are well past human. The useful read is that spawns/s never exceeds
the 2.22/s design ceiling any more.

## Tech

React + Vite + Capacitor on `@37apps/core` — shared menu / game-over /
settings chrome, procedural SFX, haptics, best-score persistence and AdMob.
Rendered in DOM with inline styles like Pounce, not on canvas: the board is
at most 25 tiles and a handful of bursts, and the tiles want to be real tap
targets.

One RAF drives the clock, every fuse, the spawner and the effect pruner, then
forces one render. Everything that loop touches lives in a ref — it only
re-subscribes on `phase`, so anything read out of its closure would be frozen
at the value it had when the round started (the stale-score bug Pounce
already paid for once).

`src/adIds.js` still holds Google's public **test** ad units; swap in the real
ones at publish time. `android/` and `ios/` are not generated yet.
