# Prometheus

Carry the stolen fire up the mountain to Olympus. An endless hop-up-the-cliff
climber: a lattice of ledges and clouds cut into a rock face, one leap at a time.

## Loop

- **Tap** to leap to the platform directly above. **Swipe left/right** to leap
  diagonally, one column over. Arrow keys / `Space` on desktop.
- Every input moves you *up*, so there's no way to stall — and the camera
  creeps upward on its own, so hesitating still costs you.
- Leap onto nothing and you fall. That's survivable: you land on the first
  platform below you in that column. Fall off the bottom of the screen and the
  run is over.
- **Altitude in metres is the score** (4 m per row). Signposts bolted to the
  wall mark every 240 m.

| Hazard | From | Behaviour |
| --- | --- | --- |
| Crumbling cloud | 60 m | Landable, but sags and vanishes ~1s after you touch it |
| Eagle | 140 m | Crosses the wall in profile, aimed at the rows above you |
| Storm cloud | 420 m | Looks like footing, isn't — you drop straight through |
| Falling boulder | 800 m | Telegraphed by a chevron, then dropped down one column |

**Embers** charge the torch (4 fill it). A full torch ignites **BLAZE**: ~5s of
double score, clouds that don't crumble, and hazards incinerated on contact.

## Fairness contract

Row generation guarantees that for every occupied cell, at least one of the
three cells reachable from it (up-left, up, up-right) is real footing — and the
guaranteed cell is never a storm. There is no row you simply cannot leave.

## Structure

`src/Prometheus.jsx` is the React shell. The play field is canvas:

- `src/game/constants.js` — tuning, palette, lattice geometry, sky ladder
- `src/game/sprites.js` — the cliff face, platforms, hazards, and the Titan
- `src/game/engine.js` — the lattice, hop/fall resolution, camera, spawning

Shared canvas machinery lives in `@37apps/core/canvas`.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

Dev builds expose the live engine as `window.__prometheus` for the automated
harness; the branch is stripped from production.
