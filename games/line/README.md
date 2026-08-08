# Line

Draw one unbroken line as far as you can. An endless vertical runner on a dark
neon field — the stroke you leave behind *is* the record of your run.

## Loop

- The line climbs automatically and speeds up with distance. You only steer.
- **Drag anywhere** to steer left/right (relative drag, so your thumb never
  covers the tip). Arrow keys / `A`-`D` on desktop.
- **Distance in metres is the score.** Four hazards, unlocked one at a time:
  | Hazard | From | Behaviour |
  | --- | --- | --- |
  | Bar (cobalt) | 0 m | Capsule segment, drifts sideways — go around |
  | Arc (jade) | 120 m | Half-disc growing from a screen edge — eats a whole side |
  | Blade (coral) | 480 m | Bar rotating about its hub — pure timing |
  | Gate (violet) | 950 m | Spans the width; one travelling gap to thread |
- **Orbs** charge the meter (4 fill it). A full meter fires **SURGE**: ~4s of
  double score, a faster climb, and hazards cut straight through rather than
  dodged.

## Look

The one game in the portfolio with a dark play field — a neon stroke drawing
itself through the dark doesn't exist on a light ground. The menu / game over /
settings chrome stays on the shared light neutral base like every other game,
so the dark field reads as a deliberate arcade choice rather than app chrome.
Every hazard colour comes from the brand kit's 8 accents.

## Structure

`src/Line.jsx` is the React shell — phases, HUD, shared 37apps screens.
Everything inside the play field is canvas:

- `src/game/constants.js` — tuning, palette, and the depth→field ladder
- `src/game/backdrop.js` — the dot lattice, perspective rails and vignette
- `src/game/sprites.js` — the stroke and the four hazards, as neon paths
- `src/game/engine.js` — steering, trail sampling, spawning, collision

Shared canvas machinery (colour, sky ladder, parallax, particles, the RAF/DPR
canvas host) lives in `@37apps/core/canvas`.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

In a dev build only, the live engine is exposed as `window.__line` for the
automated visual/balance harness; `import.meta.env.DEV` is statically false in
a production build, so that branch is stripped.
