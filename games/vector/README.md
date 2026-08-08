# Vector

Tap to lift a dart through a collapsing corridor of angular black geometry.

## Loop

- The dart flies right automatically and speeds up with distance. Gravity
  pulls it toward the floor; **tap anywhere** to lift it. Space / `↑` / `W`
  on desktop.
- A tap **sets** vertical speed rather than adding to it, so every tap buys
  exactly the same climb and a panicked double-tap can't launch you.
- The dart always points along its own velocity — the nose *is* the read on
  where you're about to be.
- **Score** is distance.

A gravity-inverting gate was built and then cut: it made the game far too
hard for what this is meant to be. If it ever comes back it belongs in a
separate mode, not in the main run.

## The corridor

One node every 52 px, walls drawn as straight lines between them. The
angularity is the art direction, so the drawn geometry and the collision shape
are the same two numbers per node rather than a curve approximated by a
polygon. A **spike** isn't a separate entity — it's one node whose wall bites
inward, which renders as a triangular tooth for free and collides exactly as
drawn.

Two generation constraints keep it honest:

- **Minimum pass** — the corridor never closes tighter than 13.5% of screen
  height, spikes included.
- **Reachability clamp** — each wall's per-node movement is capped by what the
  dart can physically do: one tap's worth of lift when the corridor rises, the
  more generous free-fall rate when it drops. Before this clamp existed the
  generator was asking for up to **1.23× the dart's climb rate** around 2900 m,
  i.e. genuinely unwinnable stretches. A probe over 3000 m / 1511 nodes now
  reports a steepest demand of 0.70× capability.

Everything vertical is a fraction of screen height, not a pixel count: a
corridor tuned to 260 px reads as a third of a short phone and a fifth of a
tall one, which changes the game rather than scaling it. Only the horizontal
node spacing is a pixel measure, because that one really is about how sharp a
wall is allowed to turn.

## Look

The brand's light neutral ground with the corridor cut out of it as solid
near-black geometry — a bright room with dark teeth closing in. That's the
opposite read from Line's neon-in-the-dark and from Icarus's sky, so the three
never blur together in a store grid. Accent: **Magenta Pop**; Violet Spark
appears only in the title gradient, never in play.

HUD text is dark ink carrying its own thick light outline rather than sitting
on a scrim: the corridor can put either its black mass or its light interior
directly under the score. A scrim was the first attempt and it hid the ceiling
whenever the corridor rode high, which is worse than an unreadable score.

## Structure

`src/Vector.jsx` is the React shell — phases, HUD, shared 37apps screens.
Everything inside the play field is canvas:

- `src/game/constants.js` — tuning, palette, and the depth→field ladder
- `src/game/backdrop.js` — the chevron hatch, parallax shards and vignette
- `src/game/sprites.js` — the corridor and the dart
- `src/game/engine.js` — flight, corridor generation, collision

Shared canvas machinery (colour, particles, the RAF/DPR canvas host) lives in
`@37apps/core/canvas`.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

In a dev build only, the live engine is exposed as `window.__vector` for the
automated visual/balance harness; `import.meta.env.DEV` is statically false in
a production build, so that branch is stripped.
