# Warp

Fall forever down a tunnel that keeps changing shape. Hold either side of the
screen to roll around it and slip through every gap.

## Loop

- The craft flies down the tube automatically and speeds up with distance
  (25 m/s → 52 m/s). **Hold the left or right half of the screen** to roll
  that way; `←`/`→` or `A`/`D` on desktop.
- The craft rides a fixed lane a little inside the wall, drawn as a faint
  dotted ring. That ring is the whole tutorial: anything crossing it is lethal,
  anything outside it isn't.
- **Score is distance in metres**, plus 15 m a core and 50 m a slab smashed
  during HYPER.

Input is a *rate*, not a position: the tunnel is a loop with no ends, so there
is no absolute "here" for a drag to map onto. A tap is a nudge and a held thumb
is a full spin, because roll is accelerated rather than set.

**The control shipped inverted the first time** and it's worth knowing why.
Canvas angles sweep clockwise (y points down) and the craft sits at the *bottom*
of the ring, so increasing the world angle carries it to the **left** of the
screen. Holding the right side has to drive the world angle *down*. `syncInput()`
now does that flip in one place, and the two quantities derived from it — the
hull's bank and the exhaust smear — are screen quantities that carry the
opposite sign to the world roll.

## The twist: the tunnel changes cross-section

The tube runs octagon → hexagon → pentagon → square and back, morphing over the
last 90 m of each zone. Because obstacles are generated in **whole sectors**,
the side count *is* the difficulty dial — one blocked sector of an octagon is an
eighth of the ring, one of a square is a quarter of it, and rolling clear of it
takes proportionally longer.

The morph is keyed to a *world position*, not to the player's own distance, so
every band, slab and core asks `zoneAt()` about where **it** is. The next zone's
colour and shape are therefore visible arriving from far down the tunnel rather
than snapping over the whole screen at a threshold — that's the game's signature
image, and it falls out of the data model instead of being animated.

## Hazards

Slabs cut out of the wall, one shape of danger per depth so the tunnel teaches
them one at a time:

| | from | behaviour |
|---|---|---|
| **bar** | 0 m | a static group of sectors |
| **spinner** | 260 m | the whole group rotates around the axis |
| **iris** | 700 m | the span breathes open and shut |
| **twin** | 1250 m | two groups, two gaps — which one you take decides which cores you get |

`arcsAt()` is the single source of truth for where a moving obstacle is at a
given instant, so a spinner's rim and a spinner's hitbox cannot drift apart.

## Fairness

A wave is only fair if the player can still be inside a gap when it arrives, so
every wave is rotated at spawn until its nearest gap is reachable **from wherever
the craft actually is at that moment** — measured against the real roll rate and
the real flight time, with a 28% margin, and evaluated against the wave's own
spin at its arrival time rather than at spawn. The iris gets a second
constraint: its breathing amplitude is clamped so its own animation can never
squeeze the gap below craft width. An obstacle that can become unpassable after
you've committed isn't a timing puzzle, it's a coin flip.

Collision is resolved **once, at the plane crossing**, against angles
interpolated to that instant — not by per-frame overlap. At the speed cap one
50 ms frame covers more than a slab is thick, so an overlap test would let the
craft pass through solid ink.

## Look

Ink hazards on a colour tunnel. Zones cycle the whole 8-accent kit, so no fixed
colour per hazard could survive every zone — the rule is instead:

- **the tunnel wears the colour** (safe),
- **ink is the danger**, lit by a single rim that brightens as it closes,
- **amber is the pickup**, **white is you**.

The craft stays white in HYPER too. Tinting it magenta was the obvious way to
show the power state and it made the craft vanish against the magenta zone, so
the state is carried by a halo and the thruster instead.

Chrome accent is **Violet Spark**, and it is deliberately not tied to a zone: a
PLAY button coloured like the wall you're currently inside would read as part of
the game state.

## Rendering

Depth is one radius function, `polyR(θ, n)`, sampled wherever a caller needs it —
which is what makes a morphing tunnel free: it's a blend of two radius
functions, not a mesh to rebuild. Cross-sections are cached per `(n0, n1, t)` and
rotated once per frame per distinct shape rather than once per band.

The wall is drawn far → near as ~40 bands, and everything inside the tube is
merged into that same walk so a slab is painted between the band behind it and
the band in front of it. Occlusion in a tube is entirely paint order; there is no
z-buffer and there doesn't need to be one.

Three things in here were found by looking at the thing rather than by reasoning
about it:

- bands that merely *shared* an edge left an antialiasing hairline between them,
  which across 40 bands read as a set of dashed rings drawn on the wall. Each
  band's far edge now overlaps the next by 1.2%;
- the blend quantisation was coarse enough (1/16) that neighbouring bands
  mid-morph snapped to different cross-sections — a hard step the overlap can't
  hide. It's 1/64 now;
- the bloom at the vanishing point was wide and soft, and it swallowed exactly
  the region where slabs first appear, so hazards stayed invisible until they
  were already close. It's small and hot instead.

## Balance

A bot with a 280 ms reaction latency that ignores anything past 11 units of
depth dies at **2143 m / 67 s**, **2045 m / 64 s** and **2976 m / 85 s** — inside
the 30 s–3 min session target in `plan.md §5`. A full-knowledge, zero-latency bot
survives past 3000 m, which is the intended shape: the ceiling is reaction time,
not the generator.

The limit of that harness is worth writing down, because it cost a shipped bug:
the bot reasons in **world angles and calls the engine directly**, so it flies
perfectly through an input mapping that is inverted for a human. A bot that
bypasses the mapping can never test the mapping. Anything between the thumb and
the simulation — which half of the screen was touched, which way that turns into
motion — has to be checked by driving it as a player, or by asserting on the
craft's projected screen position rather than on its world angle.

## Status

`android/` and `ios/` are not generated yet, and `src/adIds.js` is empty so
`@37apps/core/ads.js` falls back to Google's test units.
