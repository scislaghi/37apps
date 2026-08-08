# 37apps — Game Ideas Backlog

> Living document. Add, edit, or drop ideas here as they evolve. Not a
> commitment — just the pool we pick game #2, #3, ... from. See `plan.md`
> for the portfolio-level plan and `brand/brand-kit-v1.html` for the shared
> visual system.

## In development

### Pounce — game #1
- **Family**: simple puzzles / predator-prey
- **Mechanic**: move an omnidirectional piece on a board you pick before the
  round (5×5 "Tight" or 7×7 "Classic"), capturing enemy pieces before a
  countdown timer runs out; each enemy type slides in a different set of
  directions (orthogonal, horizontal-only, vertical-only, diagonal,
  omnidirectional).
- **Twist**: it's turn-based, not a static puzzle — every move you make, the
  enemy nearest to you takes a chase move of its own (telegraphed with a
  colored beam and a ghost token on the exact square it's about to land on);
  land on your square and it's game over. Capturing adds time back to the
  clock and spawns a replacement enemy guaranteed to *not* threaten you on
  its first move. No move-hint overlays on the board — you read the piece
  types and the position yourself.
- **Readability rule**: a piece is drawn as one blade per legal direction, so
  its silhouette *is* its move set — Slider is a horizontal double-arrow,
  Blade is an X, Star is an eight-point burst. Colour and face are secondary
  cues layered on top, never the primary read. Blades have to stay long
  relative to the hub or every type collapses into the same rounded blob at
  7×7 cell size.
- **Board sizes**: same rules on both; only the starting enemy count (2 vs 3)
  and the bonus-spawn cadence (every 6 vs every 5 captures) differ, because
  the 7×7 numbers flood a 5×5 faster than anyone can clear it. Best scores
  are stored per size (`pounce.best.5` / `pounce.best.7`) — they're different
  games to be good at. Both boards render at the same on-screen footprint, so
  switching changes the piece scale, not the playfield size.
- **Status**: renamed from "Ploop Hunt" (itself once "Ploop Chess") and given
  a full art/animation pass — silhouette-as-moveset pieces with faces, move
  trails, telegraph beam + destination ghost, capture particle bursts, a
  "dying" beat (shake + red wash) held before the game-over card so deaths
  actually read, and a pre-round board-size picker. Native iOS/Android bundle
  id and package renamed to `com.simonecislaghi.pounce`. Fixed a latent bug
  while rewriting: the timer effect only re-subscribes on `phase`, so it read
  a stale `score` from its closure and banked 0 as the best score on every
  timeout death — score/size now come from refs, and the death path is
  idempotent so a late interval tick can't double-fire it.
  Verified end-to-end in a real browser via the Playwright CLI skill (5×5 and
  7×7 boards, move, capture + `+2s`, safe-spawn placement, telegraph → chase
  slide, timeout death recording the right best score, denied-tap feedback).

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

### Prometheus — game #5
- **Family**: hoppers
- **Mechanic**: an endless climb up a cliff face toward Olympus. A lattice of
  ledges and clouds; **tap** leaps to the platform directly above, **swipe**
  leaps diagonally one column over. Every input moves you up, so there's no
  way to stall, and the camera creeps upward on its own.
- **Recovery**: leaping onto nothing drops you — but you land on the first
  platform below in that column. You only die falling off the bottom, which
  turns most mistakes into a scramble instead of an instant loss.
- **Hazards**: crumbling clouds (60 m), the eagle crossing the wall (140 m),
  storm clouds that look like footing and aren't (420 m), telegraphed falling
  boulders (800 m).
- **Twist**: embers charge the torch; a full torch ignites **BLAZE** — double
  score, clouds that stop crumbling, and hazards incinerated on contact.
- **Fairness contract**: row generation guarantees that for every occupied
  cell, at least one of the three cells reachable from it is real footing, and
  the guaranteed cell is never a storm. No row is ever a dead end.
- **Signature motif**: the wall itself, with "OLYMPUS · N m" signposts bolted
  to it every 240 m, and a sky beyond that climbs from foothill blue through
  ember and night to the gold of Olympus.
- **Status**: built. Canvas play field on the shared `@37apps/core/canvas`
  foundation, shared DOM chrome. Verified in a real browser via Playwright with
  a scripted hopping bot (reaches 300–700 m). Accent: Signal Coral.

### Icarus — game #6
- **Family**: tap games (this is the flap game — it replaced the old *Skyhop*
  scaffold; bundle `com.simonecislaghi.icarus`)
- **Mechanic**: horizontal flap-and-glide, squeezed between two lethal
  boundaries. **The sun is a soft ceiling**: above the melt line a wax meter
  fills, faster the higher you go, and a full meter ends the run. **The sea is
  a hard floor.** Staying low cools the wax — but low is where the rocks are.
- **Hazards**: rock spires out of the sea (0 m), gulls that fly *toward* you so
  they can't be outrun (110 m), floating crags (400 m), storm clouds (850 m).
- **Twist**: feathers cool the wax on pickup and charge **GLIDE** — double
  score, no heating at all, and gulls/crags/storms burned through on contact,
  but *not* the spires, so it never becomes a licence to stop steering.
- **Signature motif**: the melt drawn on the character, not just metered — his
  wings shed quills and run wax as the meter climbs, and the whole frame
  bleaches as he cooks.
- **Status**: built on the shared canvas foundation. Verified via Playwright
  with a scripted flying bot. Accent: Amber Pulse.

### Line — game #7
- **Family**: steer games
- **Mechanic**: an endless vertical runner where the player is a neon stroke.
  It climbs automatically; you drag to steer. The trail persists, so the line
  you draw *is* the record of the run. Distance in metres is the score.
- **Hazards**: bars (0 m), edge-anchored arcs (120 m), rotating blades (480 m),
  and full-width gates with one travelling gap (950 m) — each in its own brand
  accent, so the shape and the colour teach the same thing.
- **Twist**: orbs charge **SURGE** — double score and hazards cut straight
  through rather than dodged.
- **Look**: the one game in the portfolio with a dark play field, because a
  neon stroke drawing itself through the dark doesn't exist on a light ground.
  The shared menu / game-over / settings chrome stays on the light neutral base
  like every other game, so the dark field reads as a deliberate arcade choice
  rather than app chrome.
- **Status**: built on the shared canvas foundation. Accent: Volt Lime, with
  the other seven accents carried by the hazards.

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

### Chomp — game #8
- **Family**: real-time chase / grid survival
- **Mechanic**: a 13×13 clearing where a herbivore dino runs continuously and
  the player only ever *points* it (swipe or arrow keys); the direction is
  buffered and applied at its next step, so play is about reading two squares
  ahead rather than reacting. Eat the amber frond for +1 and it regrows
  elsewhere. Trees and the board edge cost a step (bump, no death); ponds are
  instant death; one T-Rex hunts you and eating you is the other death.
- **Twist**: the single T-Rex periodically *leaves the board entirely* and
  re-enters on an edge square at least 4 away, telegraphed for 820ms with a
  stamped footprint, an expanding ring and a T-REX INCOMING banner. That gives
  the run a breathe/dread rhythm instead of a flat pursuit, and it's the
  shareable beat — you always lose to the re-entry you didn't watch for.
- **Difficulty**: both dinos hold their own independent clocks that accelerate
  with the score, and the Rex accelerates faster — 340ms vs 500ms per square at
  score 0, 165ms vs 210ms at the floor. Rampages also get more frequent. The
  Rex is deliberately *not* a solver: greedy chase, no doubling back unless
  it's the only exit, plus an 18% "wrong foot" — perfect pathing at these
  speeds reads as cheating rather than as an animal.
- **Engine note**: one self-rescheduling `setTimeout` that always fires at
  whichever dino is due next, over a single mutable ref, with React state as a
  projection (~11 renders/sec, CSS transitions carry the motion between
  squares). Two `setInterval`s over React state was the obvious first shape and
  the wrong one — each would read a stale snapshot of the other's position
  through its closure, so a head-on collision could resolve twice or not at
  all depending on tick order. One timeline means "did he catch me" is answered
  exactly once, by whoever moved.
- **Readability rule**: four accents, one meaning each and nothing else may
  wear them — lime = you, coral = him, amber = food, cyan = death by water.
  Scenery is off-palette on purpose. The first pass had a green grass checker,
  green trees and a lime dino, which made the player the hardest thing on the
  board to find; the floor is now warm sand (the brand's own base tone) and the
  hierarchy reads instantly. Same fix on density: 18 trees + 12 ponds was both
  too tight and visual noise, 14 + 10 fixed both at once — a greedy test
  autopilot went from 4 points to 24 with the change.
- **Signature motif**: footprints — dropped behind both dinos as they run, and
  reused as the Rex's re-entry telegraph.
- **Accent**: Volt Lime, same as Ploop Climb. Kept because a green herbivore in
  a clearing wants that hue and Ploop Climb spends lime on the *world* with a
  cobalt player, but worth revisiting if the two ship close together.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core` from the
  start; lint and build clean. Verified end-to-end in a real browser via the
  Playwright CLI skill with a BFS autopilot driving it: steering, food +1 and
  respawn, tree-bump without death, drowning ("Sank!"), being eaten
  ("Chomped!"), 10 observed rampage cycles with the banner and telegraph, best
  score persisting across runs. `android/`, `ios/` and the real AdMob unit IDs
  are still to be generated — `src/adIds.js` holds Google's test units.

### Vector — game #9
- **Family**: tap games
- **Mechanic**: a dart flies right through a continuous corridor of angular
  black geometry. Gravity pulls it down; tap to lift. The nose always points
  along its own velocity, so the arrow *is* the read on where you're about to
  be. Score is distance.
- **Twist**: **none, by decision.** A gravity-inverting gate was built, tested
  and then cut on 2026-07-29 — it made the game far too hard. Simone's call
  after playing it: "va già bene così com'è senza." The consequence is worth
  writing down: Vector and *Icarus* now share the same core input (tap to lift,
  gravity pulls down, don't touch the boundaries), which is exactly the "known
  mechanic + one new twist" rule in `plan.md §5` going unmet. They still look
  and feel different — Icarus has a heat economy and a soft ceiling, Vector is
  pure corridor reading on a light field — but if the two ever ship close
  together, that's the thing to revisit. If the flip comes back it belongs in a
  separate mode, not the main run.
- **Generation**: one node every 52 px holding a top y and a bottom y; walls
  are straight lines between them, so the drawn geometry and the hitbox are
  the same two numbers. A spike isn't an entity — it's one node whose wall
  bites inward, which renders as a tooth for free and collides exactly as
  drawn. Everything vertical is a fraction of screen height, not px, so a tall
  phone gets the same game rather than a stretched one.
- **Look**: the brand's light neutral ground with the corridor cut out of it in
  near-black — a bright room with dark teeth closing in, deliberately the
  opposite read from Line's neon-in-the-dark and Icarus's sky.
- **Signature motif**: the chevron hatch leaning against the direction of
  travel, in both the background and (mirrored, faintly) inside the wall mass.
- **Accent**: Magenta Pop. Violet Spark survives only in the title gradient.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core` and the shared
  canvas foundation; lint and build clean, console clean, production build
  smoke-tested. Verified in a real browser via the Playwright CLI skill with a
  scripted flying bot: corridor generation, spikes, death → game over → retry,
  best score persisting, and the rewarded-continue `revive()` path. Three real
  defects came out of that testing rather than out of review:
  - the HUD's first design was a light scrim behind the score, which **hid the
    ceiling** whenever the corridor rode high — replaced with outlined ink that
    reads on both the black mass and the light interior;
  - a probe measuring demanded wall slope against the dart's actual climb rate
    found **genuinely unwinnable stretches** (up to 1.23× capability around
    2900 m) where wander and a spike stacked on one node. Generation now clamps
    each wall's per-node movement to what the dart can do; the same probe over
    3000 m / 1511 nodes reports 0.70×;
  - the speed cap was set by feel at 560 px/s, where a wall entering the right
    edge reached the dart in **half a second** — under human reaction time.
    It's now derived from lookahead instead (430 px/s ≈ 0.66 s).
  `android/` and `ios/` are generated (bundle `com.simonecislaghi.vector`),
  including the AdMob `APPLICATION_ID` / `GADApplicationIdentifier` entries the
  Capacitor generators don't write. Real AdMob unit IDs are still to be
  created — `src/adIds.js` holds Google's test units.

### Blip — game #10
- **Family**: tap games
- **Mechanic**: cells light up on a white board and you tap them. The round
  starts with 10 seconds and the clock never stops draining — the only source
  of time is the board, so clearing cells is how you stay alive. Board size is
  picked before the round: **3 × 3 "Quick"** or **5 × 5 "Wide"**, one best
  score each.
- **Twist**: three kinds of cell, each a different *shape of attention* rather
  than just a different colour — plain (one tap), **multi** (a numeral 2–5,
  tap it that many times, which pins you to one tile while the rest of the
  board fills), and **fuse** (its own countdown ring, one tap but before it
  empties, which pulls you away from wherever you were). Missing a fuse costs
  1.5 s.
- **The fuse counts in 90 ms units, not seconds** — a "30" is 2.7 s, a "10" is
  0.9 s. A fuse ticking in real seconds reads as a second clock competing with
  the round timer instead of as a fuse racing.
- **Tapping a dark tile costs 0.5 s** and breaks the streak. Without a cost
  for hitting a dark tile the optimal strategy is to mash all nine tiles
  forever, which is not a game.
- **Time economy**: the clock only refills from cells and cells only arrive at
  the spawn cadence, so the honest unit is *per spawn*, not per second. A
  plain cell is worth `spawnInterval × gainRatio`, and `gainRatio` runs
  1.45 → 0.65 over the first 70 points, crossing 1.0 around score 39. Above
  1.0 the board pays for itself if you clear everything; below it, it cannot,
  no matter how perfectly you play — which is what makes a run finite by
  design instead of by waiting for the player to fumble. The other half of
  that guarantee is that **spawns are rate-limited unconditionally**: supply
  per second is `spawnRate × interval × ratio × avgKind`, so anything that
  lets the spawn rate exceed `1 / interval` quietly removes the ceiling.
- **Look**: brand light neutral board of white tiles with the lit cells as
  bright rounded chips — the only game in the portfolio whose playfield *is*
  the UI. Accent is Cyan Arc, which Teeter also wears; the two are far enough
  apart in form (a balance game vs. a grid) that it isn't worth burning a
  ninth colour the palette doesn't have. Multi cells are Violet Spark, fuses
  burn Amber Pulse → Signal Coral.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core` from the
  start, DOM/inline-style like Pounce rather than canvas — the board is at
  most 25 tiles and the tiles want to be real tap targets. Lint and build
  clean, console clean. Both boards, all three cell kinds, the miss penalty,
  the fuse-expiry penalty, best-score-per-size persistence and the game-over
  card verified in a real browser via the Playwright CLI skill with a scripted
  bot at several tap paces.
  **Five** balance defects came out of that testing rather than out of review,
  and every one of them was a bot that couldn't be killed while the arithmetic
  insisted it should have been — this game is the strongest argument in the
  portfolio so far for measuring a loop instead of reasoning about it:
  - the streak was an **uncapped** `floor(streak / 4)` bonus added per clear;
    a 25 s scripted run reached ×29 and a score of 1918, at which point every
    earlier decision in the run is worthless next to "don't miss for another
    ten seconds". It's now a real multiplier capped at ×4, which is also what
    makes the `×N` chip in the header mean what it says;
  - multi cells paid `hits × 0.85 × unit` of clock. Since a multi occupies one
    spawn slot, that let a fast player farm them into a run that never ends —
    a 3.6 taps/s bot was still at a full clock after three minutes. Their
    extra value is score now, not clock;
  - the `gainRatio` floor was 0.82, above the ≈0.77 break-even implied by the
    late-game kind mix, so a 5 taps/s bot held a full clock for 200 s;
  - the spawn accumulator was **held at `due` while the board was full** so a
    cleared slot refilled instantly. At saturation that makes the spawn rate
    equal the *clear* rate — the cadence stops being a rate limit and becomes
    a faucet the player opens by tapping faster;
  - the anti-dead-air shortcut fired on the *instant* of emptiness, and a fast
    player empties the board for a moment after every clear, so they collected
    the rushed cadence permanently (2.73 spawns/s against a 2.22/s ceiling).
    It's gated on 250 ms of real emptiness **and** on `interval > 0.6` now.
    The second condition is the lesson worth keeping: plain and multi cells
    never expire, so at a tight cadence an empty board doesn't mean the game
    stalled, it means the player is outrunning it — precisely the case that
    must not be handed extra clock.
  Final runs on 3 × 3 die at 89 s / 94 s / 74 s / 37 s across tap paces of
  10 / 6.7 / 4 / 2.5 per second, with spawns/s never above the 2.22/s design
  ceiling — all inside the 30 s–3 min session target in `plan.md §5`.
  `android/` and `ios/` are not generated yet, and `src/adIds.js` holds
  Google's test units.

### Flick — game #11
- **Family**: tap/swipe sorters
- **Mechanic**: a tower of coloured discs grows out of the floor and rises.
  The top disc is the one you throw: tap the left/right half of the screen or
  swipe left/right, and it has to go to the wall whose colour matches it. Wrong
  side ends the run instantly.
- **Twist**: a global 10-second clock that never stops draining, on top of the
  overflow rule. Every correct flick buys back a fraction of a second, and that
  fraction shrinks with score while the spawn rate climbs — so the two pressures
  converge, and past ~340 points the tower spawns faster than the clock can pay
  for. Three distinct deaths: wrong side, clock at zero, tower overflow.
- **Dynamic rules**: a boost meter (8 flicks → 5s of double score and +40%
  time), gold discs (5 pts + 1.2s), wild ink discs (either direction), ice
  discs (3.5s at half clock drain and half spawn rate), and — the one that
  changes the game rather than the numbers — a **swap** past 30 points that
  trades the two wall colours every 18 flicks. Throws made during the 0.55s
  swap animation always score, so it can never steal a run from a thumb that
  was already moving.
- **Colours**: Hot Pink / Cyan Rush for the walls — the most separable accent
  pair in the kit (opposite hues *and* different luminances, so it survives
  colour blindness). The app accent is a third colour, Violet Spark, on
  purpose: a PLAY button tinted like one of the walls would read as "this side
  is the good one".
- **Look**: everything on the field is one cylinder primitive — two straight
  sides closed by a front-facing half-ellipse, shaded entirely by a horizontal
  gradient. Each disc's visible band is the stripe between its own cap and the
  cap above it, which is what turns a stack of primitives into a tower.
- **Status**: built (React + Vite + Capacitor), canvas play field on the shared
  `@37apps/core/canvas` host. Verified in a real browser via the Playwright CLI
  skill: both input paths (tap-by-half on pointerup, swipe on a 26px drag),
  all four disc kinds, boost, swap, chill, all three death causes, best-score
  persistence, and a 50s perfect-player run with zero console errors. Two bugs
  found and fixed during that pass — the menu preview died on frame one because
  rAF's first timestamp can precede the `performance.now()` taken while arming
  the loop (negative elapsed time → negative sequence index → undefined colour),
  and the death callback was declared `(cause) => endGame(cause)`, silently
  dropping the final score so Game Over rendered blank and banked 0 as the best.
  `android/` and `ios/` are not generated yet, and `src/adIds.js` is empty so
  ads fall back to Google's test units.

### Hue — game #12
- **Family**: one-thumb endless climbers / colour matching
- **Mechanic**: a ball falls under gravity; tap to lift it. The climb is
  endless and every obstacle in it is built from the same four brand accents,
  rotating or sliding. Touch a segment that isn't your current colour and the
  run ends — your own colour isn't an obstacle at all, you pass straight
  through it. Score is distance climbed, in metres.
- **Twist**: the shape doesn't tell you when to go, the *rotation* does. Every
  obstacle carries all four colours exactly once, so waiting is always
  bounded — park underneath, read the spin, commit when yours comes round.
  Pinwheel switchers sit on the centre lane the ball can never leave, so they
  aren't collected, they're taken: the colour you hold is the game's choice.
- **Anti-camp rule**: because every obstacle is solvable by waiting, hovering
  forever would be a free strategy. Stall >3.2s without gaining height and a
  dark haze rises from the bottom of the screen with a hard kill line on the
  actual boundary (not above it). Waiting is a tactic; camping isn't.
- **Shapes**: ring (0 m) → sliding bars (110 m) → cross with a hollow hub
  (260 m) → dual counter-rotating rings (480 m). Each is sized against one
  hop: every pocket the player has to hover inside is at least `JUMP_V`'s
  apex tall, because a pocket shorter than one hop can only be gambled
  through, not waited in. That single constraint set the dual ring's two radii
  and the cross's hub.
- **Colours**: Signal Coral / Amber Pulse / Jade Flash / Violet Spark — the
  four most separable accents in the kit. Chrome accent is Cobalt Bright, a
  fifth colour on purpose, so a PLAY or RETRY button can never be misread as a
  colour cue. Kept on the shared light base rather than going dark like Line:
  on black, violet sinks and coral blooms, and this game needs all four to
  read equally.
- **Look**: the matching segment is haloed and the others aren't, so the
  answer is always the brightest thing on screen and the rule teaches itself;
  and the whole field takes a soft bloom in the ball's current colour, so
  "what am I right now" never costs a glance away from the obstacle. Signature
  motif is the four-quarter pinwheel.
- **Status**: built (React + Vite + Capacitor), canvas play field on the
  shared `@37apps/core/canvas` host. Physics runs in fixed 1/120s substeps —
  at terminal fall speed one 50ms frame moves further than a band is thick,
  and tunnelling through a wall you should have died on is the one bug this
  genre can't have. Verified in a real browser via the Playwright CLI skill:
  all four shapes spawning at their unlock heights, colour collision killing
  and matching colour passing through, switchers, best-score persistence, the
  creeping void, and both death causes. Two bugs found and fixed during that
  pass — the menu preview died on frame one to the same negative-rAF-elapsed
  trap Flick hit, and the backdrop fed `mixHex`'s `rgb(...)` output into
  `withAlpha`, which only parses `#rrggbb`, so the blended zone tint silently
  became `rgba(NaN,…)` and the canvas reused the last fill style as grey
  smears. `android/` and `ios/` are not generated yet, and `src/adIds.js` is
  empty so ads fall back to Google's test units.

### Oktogon — game #13
- **Family**: one-thumb reaction / colour matching
- **Mechanic**: an octagon nearly fills the screen, one brand accent per side.
  A coloured ball appears at its centre and falls under gravity onto the inner
  face of whichever side is below it; tap the right half of the screen to spin
  the octagon clockwise, the left half to spin it back, one side per tap. If
  the side it lands on shares the ball's colour you score and the next ball
  drops from the centre, otherwise the run ends. Score is simply the number of
  balls matched.
- **Relationship to Hue**: same raw ingredients (falling ball, brand accents,
  match-or-die) and worth keeping an eye on, but the verb is inverted. In Hue
  you steer the ball and *wait* for the obstacle's rotation to offer your
  colour; here the rotation is the only thing you control and the ball is
  pure fate. Hue is patience, Oktogon is aim.
- **Twist**: the ball falls straight down the axis every time, so the *place*
  it lands is fixed and only the colour sitting there changes. All the tension
  is in the dial: it springs rather than snaps, so a rotation set too late is
  still travelling when the ball arrives, and from ball 22 the dial drifts on
  its own and an alignment set too early decays under you.
- **Readability rule**: a plumb line runs from the ball to the exact side it
  is currently on course for, recomputed every frame. Wrong aim draws it
  dashed and grey; the instant ball and side agree it snaps to solid colour
  and pings. Rotating visibly re-aims the guide, which is how the control
  maps teach themselves inside the first drop.
- **Colours**: all eight accents, in kit order, one per side. That order walks
  the hue wheel, so the shape reads as a colour dial rather than eight
  arbitrary swatches — and neighbouring sides being neighbouring hues is what
  makes the near-miss beat tight. Chrome accent is Violet Spark, which is also
  one of the eight; unlike Hue this is safe because a side is never "the
  answer" on its own, only relative to the current ball.
- **Difficulty ladder**: gravity ramps after a 3-ball grace window, taking the
  drop from ~1.7s to ~0.85s; at ball 22 the dial starts drifting on its own,
  direction flipping each ball. Because the fall is only (inradius − ball
  radius) rather than a screen height, the gravity constants are an order of
  magnitude smaller than a full-screen faller's — the first pass shipped
  outside-falling numbers into the inside-falling layout and was unplayable.
- **Status**: built (React + Vite + Capacitor), canvas play field on the
  shared `@37apps/core/canvas` host. Collision is continuous, not
  overlap-tested: at top gravity the ball covers more than its own diameter
  per frame, and an overlap test both tunnels and — near a vertex — names the
  wrong side, which would kill the player after the guide had locked on. The
  same `predictLanding()` that draws the guide resolves the hit, so the
  promise and the verdict cannot disagree. Verified in a real browser with a
  scripted bot: 21 consecutive matches with no unfair deaths before drift
  unlocks, plus phone and tablet layouts and the miss/impact beat. `android/`
  and `ios/` are not generated yet, and `src/adIds.js` carries Google's test
  units pending real AdMob units.

### Skid — game #16
- **Family**: endless runners / one-button platformer
- **Mechanic**: a ball tumbles down an endless vertical shaft made of ink slabs
  arranged in a zig-zag. Gravity drives it — it rolls down each slab, drops onto
  the next, and turns. The only input is **tap to jump**, and the only thing to
  jump is what's growing out of the slabs: sawtooth teeth. Depth in metres is
  the score, plus bonus metres for hopping teeth, long air, and orbs.
- **Twist**: the runner doesn't run at a fixed speed on a flat floor — the
  terrain's own slope is the pacing. A steep slab is fast and a shallow one is
  slow, so difficulty ramps by tilting the world rather than by cranking a
  speed constant, and steepening is something the player can *see* coming.
- **The generator is the design**: with one button and no steering, the player
  cannot correct a bad drop, so the world has to guarantee it never gives them
  one. Four rules, all discovered by breaking them first: each run's high end
  sits beyond the previous run's exit so the ball always lands on it; a vertical
  lip stands at that high end as the backstop for arriving too fast; a high end
  is either flush into a shaft wall or a full ball-width clear of it (anything
  between is a chimney the ball slides the whole shaft down, untouched, banking
  metres); a low end is never in a wall (a downhill ending in a wall is a pocket
  with gravity pointing into the corner and no tangent out — a soft-lock).
- **Fairness rule**: nothing lethal is generated in the stretch a run may still
  be catching the ball in. Measured rather than assumed — a headless harness
  drives the real engine with a bot and classifies every death as rolled-into,
  own-jump, or a fall the player never chose; the last class is the only one
  that matters and it sits at ~3%. Closing it the rest of the way is mechanical,
  not generational: **one jump per ground contact, held for the whole fall**, so
  rolling off an edge doesn't cost you the jump and every drop is recoverable.
- **Colours**: monochrome. Ink terrain on the light neutral base, with Magenta
  Pop as the only saturated thing on screen — a descent game lives on reading
  the next slab and the next spike in a glance while everything slides upward.
  Amber Pulse for orbs and the BLAZE state; Signal Coral spent nowhere except
  the death flash.
- **Signature motif**: the skid — the magenta streak the ball writes onto the
  shaft behind it, fading out along its tail. Reused in the menu preview.
- **Readability rule**: in a one-colour world a hazard can't warn you by turning
  red, so teeth telegraph by *swelling* as the ball closes on them. Depth rulers
  ruled across the shaft every 20 m, carrying their own metre number, double as
  a checkable second readout of the HUD.
- **Status**: built (React + Vite + Capacitor), canvas play field on the shared
  `@37apps/core/canvas` host, `android/` and `ios/` generated. Verified in a
  real browser plus a headless balance harness. Three defects came out of that
  harness rather than out of play: the wall chimney, the wall pocket (half of
  all runs soft-locked), and hazards spawning inside the landing zone.
  `src/adIds.js` is empty so core falls back to Google's test units; the native
  configs carry Google's sample AdMob *app* id, without which the Mobile Ads SDK
  crashes at launch.

### Warp — game #17
- **Family**: endless runners / tunnel dodgers
- **Mechanic**: an infinite fall down the inside of a tunnel. The craft rides a
  fixed lane just inside the wall and **holding either half of the screen rolls
  the whole tube around you**; slabs cut out of the wall block whole sectors of
  the ring and you have to be in a gap when you reach one. Score is distance in
  metres.
- **Twist**: the tunnel's **cross-section itself changes** — octagon → hexagon →
  pentagon → square and back, morphing over the last 90 m of each zone. Because
  obstacles are generated in whole sectors, the side count *is* the difficulty
  dial: one blocked sector of an octagon is an eighth of the ring, one of a
  square is a quarter, and rolling clear of it takes proportionally longer. The
  morph is keyed to a *world position* rather than to the player's distance, so
  every band and slab asks the zone ladder about where **it** is — which is what
  puts the next colour and the next shape on screen arriving from far down the
  tunnel instead of snapping over the whole screen at a threshold. That image is
  the game's signature motif and it falls out of the data model rather than
  being animated.
- **Hazards**: bars (0 m), spinners that rotate around the axis (260 m), an iris
  that breathes open and shut (700 m), and twins that leave two gaps so the
  choice is *which* way through (1250 m).
- **Power state**: cores charge **HYPER** — ×2 score, +32% speed, and slabs
  smashed rather than dodged. Cores sit just past a wave, centred on one of its
  gaps, so the meter costs a committed choice rather than a detour.
- **Readability rule**: zones cycle the whole 8-accent kit, so no fixed colour
  per hazard could survive every zone. The rule is instead *the tunnel wears the
  colour, ink is the danger* — slabs are always near-black with a single bright
  rim that brightens as they close, cores are always amber, the craft is always
  white. The craft stays white in HYPER too: tinting it magenta was the obvious
  way to show the state and it made the craft disappear against the magenta
  zone, so the state moved to a halo and the thruster. The player's lane is
  drawn as a faint dotted ring, which answers the one question the perspective
  genuinely hides — "does that slab reach far enough in to hit me?" — with no
  tutorial text at all.
- **Fairness contract**: every wave is rotated at spawn until its nearest gap is
  reachable from wherever the craft actually is at that moment, measured against
  the real roll rate and the real flight time with a 28% margin, and evaluated
  against the wave's own spin at its *arrival* time. The iris carries a second
  clamp: its breathing amplitude can never squeeze the gap below craft width.
  An obstacle that becomes unpassable after you've committed isn't a timing
  puzzle, it's a coin flip resolved before you arrive.
- **Engine note**: collision resolves **once, at the plane crossing**, against
  angles interpolated to that instant. At the speed cap one 50 ms frame covers
  more than a slab is thick, so per-frame overlap testing would pass the craft
  straight through solid ink — and `arcsAt()` being the single source of truth
  for a moving obstacle is what keeps a spinner's rim and its hitbox from
  drifting apart by a frame.
- **Accent**: Violet Spark for the chrome, deliberately *not* one of the zone
  colours — a PLAY button tinted like the wall you're currently inside would
  read as part of the game state. The tunnel itself spends the other seven.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core` and the shared
  canvas foundation; lint and build clean, console clean, production build
  smoke-tested. Verified in a real browser via the Playwright CLI skill with two
  scripted bots. Balance came out of the lagged one (280 ms reaction latency,
  blind past 11 units of depth): runs of 2115 m / 64 s, 2469 m / 75 s and
  2080 m / 65 s, inside the 30 s–3 min target in `plan.md §5`, while a
  zero-latency bot passes 3000 m — the ceiling is reaction time, not the
  generator. Three defects came out of *looking* at it rather than out of
  review: bands that merely shared an edge left antialiasing hairlines that read
  as dashed rings painted on the wall (each band's far edge now overlaps the
  next by 1.2%); the shape-blend cache was quantised coarsely enough (1/16) that
  neighbouring bands mid-morph snapped to different cross-sections, a hard step
  no overlap can hide (1/64 now); and the bloom at the vanishing point was wide
  and soft, swallowing exactly the region where slabs first appear, so hazards
  were invisible until they were already close. A fourth came from the HUD: the
  HYPER badge was centred at the top, where it lands on a four-digit distance
  readout on a narrow phone — it sits under the charge meter now.
  A fifth was found by **Simone playing it**, and it is the most instructive of
  the lot: the roll was **inverted** — holding the right side of the screen sent
  the craft left. Canvas angles sweep clockwise (y points down) and the craft
  sits at the *bottom* of the ring, so increasing the world angle carries it to
  the left; "right" has to drive the world angle down. The reason neither bot
  caught it is the lesson: both reason in world angles and call the engine
  directly, so they fly perfectly through a mapping that is backwards for a
  human. **A bot that bypasses the input mapping can never test the input
  mapping** — anything between the thumb and the simulation has to be driven as
  a player, or asserted on the craft's projected *screen* position rather than
  on its world angle. Balance was re-measured after the fix and is unchanged
  (2143 m / 67 s, 2045 m / 64 s, 2976 m / 85 s).
  Added `blendHex()` to `packages/core/canvas/color.js` while building this:
  `mixHex` returns `rgb(...)`, which is *not* valid input to `mixHex`/
  `withAlpha`, and this game blends every zone colour twice (fog by depth, glow
  by alpha). Hue shipped that exact bug once already.
  `android/` and `ios/` are not generated yet, and `src/adIds.js` is empty so
  ads fall back to Google's test units.

### Hopper — game #18
- **Family**: tap games
- **Mechanic**: a round character stands on a single block. Cubes slide in from
  a random side — left or right — and stop exactly where it's standing. One
  tap jumps; clear the cube and you land on top of it, +1. Mistime it and you
  get squashed. Inspired by *Capybara Jump*.
- **Twist**: landing near the **apex** scores a PERFECT, and three consecutive
  perfects start paying a bonus point. A merely-survived hop still scores 1 and
  resets the streak, so the skill ceiling is "how close to the top of the arc
  can you keep landing", not "did you survive".
- **The whole game is one number**: the only difficulty dial is the cube's
  *lead time* — how long it spends sliding in. It holds at 1300 ms for three
  hops of grace, then shrinks 32 ms per point down to a 640 ms floor. Airtime
  is a constant 730 ms out of the jump velocity and gravity, so at the floor
  the window to commit is under 300 ms and the tap has to be nearly on the
  frame. No new hazards, no second mechanic — just the same decision getting
  narrower, which is what keeps it readable at a glance in a store video.
- **Readability rule**: **the cube in flight is ink, the cube underfoot is
  colour**. The incoming cube is near-black while it's still a threat and
  becomes the next brand accent the moment you're standing on it, so "dangerous
  vs. safe" is one high-contrast read rather than a colour the player has to
  learn. Its ghost trails carry the accent it's *about* to become, so the
  palette change is foreshadowed instead of snapping on contact.
- **Signature motif**: velocity-driven squash/stretch on the character, driven
  continuously off the physics rather than keyframed — it stretches tall
  rising, squashes flat landing, and its mouth switches to an "o" the whole
  time it's airborne. The platform pops on each landing and the backdrop glow
  swells with the perfect streak, so the run's state is told by the world
  instead of by another number on screen.
- **Accent**: Magenta Pop for the chrome, deliberately *not* one of the eight
  the platform cycles through — the same rule Warp uses, so a RETRY button
  never reads as part of the playfield.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core`; lint and
  build clean, console clean (0 errors/warnings). Verified in a real browser
  via the Playwright CLI skill with a scripted timing bot: a bot tapping one
  apex-time (365 ms) before each scheduled arrival scored exactly 25 over 10
  hops — 10 base plus 15 streak bonus, i.e. every hop landed PERFECT, which
  confirms both the apex window and the streak maths. Also verified the two
  failure modes (no tap at all, and a tap so early the hop is over before the
  cube lands) both end the run, and that RETRY replays with the best score
  persisted. `android/` and `ios/` are not generated yet, and `src/adIds.js`
  is empty so ads fall back to Google's test units.

### Nugget — game #19
- **Family**: endless runners
- **Mechanic**: a Chrome-dino-style runner turned on its side. A miner runs
  right along one of **three stacked tunnels**; swipe up/down (or tap above /
  below him) to switch tunnel. Gold nuggets are worth **+1 each — the whole
  economy**, no multipliers. **2 nuggets** sit on the field at once (3 from
  score 6); take one and a replacement spawns immediately at a random free
  position ahead, so the field count never drops.
- **Twist**: the hazard isn't something you jump over, it's a **cell you must
  not be standing in**. Boulders hang from the ceiling of a single tunnel and
  mark the floor beneath them with a pulsing coral pool. Each one lets go
  ~0.42 s of travel before it reaches the miner — almost exactly its own fall
  time — so it lands *on his head* if he stayed and *in front of him* if he
  moved. Either way it's still there afterwards as rubble, which turns one
  hazard into two reads: dodge the drop, then don't run into what dropped.
- **Readability rule**: **gold means take, coral means leave**. Nothing else on
  screen is allowed either colour — which is why the hanging lanterns are drawn
  as a dark housing throwing a light *pool downward* rather than as a glowing
  ball (a bare amber dot at ceiling height reads as a nugget, the one misread
  the game can't afford), and why the ore veins in the rock are a dull ochre
  that never glints.
- **Fairness rule**: a column never blocks all three tunnels, and its safe
  tunnel is always within one hop of the previous column's — a run ends because
  the player misread a rock, never because the shaft asked for a jump the miner
  can't make. The opening column also never lands on the lane he starts in.
- **Signature motif**: **the lamp** — the miner's helmet beam sweeping the
  tunnel ahead, echoed by the hanging lanterns and by the glow behind the menu
  title.
- **Accent**: Amber Pulse `#FFA31A`. Dark play field (the second game after
  Line to take that exception — a mine lit like a light-mode app is a cave with
  the lights on), light brand chrome around it.
- **Status**: built (React + Vite + Capacitor) on `@37apps/core`; lint and build
  clean. Verified in a real browser via the Playwright CLI skill with a scripted
  bot: menu → play → collect (+1 per nugget, field count maintained) → both
  death causes (`crush` from a boulder landing on the miner, `smash` from
  running into landed rubble) → RETRY with the best score persisted, plus the
  Settings screen. A bot committing to its lane change ~1.9 s ahead ran to 11
  nuggets / 241 m, which is what confirmed the warning window is honest on a
  portrait phone; the early tuning pass came out of that (slower base scroll,
  wider first columns, the rumble tell shortened to 0.95 s so "it's about to
  go" stays a distinct beat). `android/` and `ios/` are not generated yet, and
  `src/adIds.js` is empty so ads fall back to Google's test units.

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
