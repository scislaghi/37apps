# Skid

A ball tumbling down an endless shaft. Gravity does the driving — you get one
button, and it's *jump*. Metres of depth are the score.

## Loop

- The ball rolls down a zig-zag of ink slabs on its own, turning at each one.
  Roll speed is capped, and the cap opens out with depth: that's the ramp.
- **Tap anywhere** to hop. Space / `↑` / `W` on desktop. **One jump per ground
  contact**, and it survives rolling off an edge — a fall you didn't choose can
  still be saved mid-air.
- **Depth in metres is the score**, plus bonus metres for what you pull off:
  hopping teeth (+6 and rising with your streak), long air (+10), orbs (+12).
- Three hazards, unlocked one at a time:
  | Hazard | From | Behaviour |
  | --- | --- | --- |
  | Teeth | 0 m | Sawtooth on the slab — hop it |
  | Fangs | 260 m | Bar hanging over clear slab — *don't* jump yet |
  | Saw | 700 m | Toothed disc patrolling a run — pure timing |
- **Orbs** charge the meter (4 fill it). A full meter fires **BLAZE**: ~4.5 s of
  double metres, an amber-flooded shaft, and hazards smashed through rather
  than hopped.

## Look

Ink on cream: the whole world is one colour and the ball is the only saturated
thing in it, which is what keeps the next slab and the next spike readable
while everything slides upward. Signal Coral is spent nowhere except the death
flash. Depth zones shift the field's *cast* rather than its brightness, so
2000 m in looks unmistakably different from the surface without the terrain
ever losing contrast against it. The signature motif is the **skid** — the
magenta streak the run writes onto the shaft behind you.

## The shape of the shaft

The generator is the design. Every turn is built so the ball cannot fall out of
the world, because the player has no steering to correct with:

- each run's high end sits *beyond* the previous run's exit, so the ball always
  lands on it;
- a vertical lip stands at that high end as the backstop for arriving too fast;
- a run's high end is either flush into a shaft wall or a full ball-width clear
  of it — never in between, which would leave a chimney to fall down;
- a run's low end is never in a wall, which would be a pocket with gravity
  pointing into the corner and no tangent out;
- nothing lethal is placed in the stretch the ball may still be falling through
  when a run hands it to the next one.

## Structure

`src/Skid.jsx` is the React shell — phases, HUD, shared 37apps screens.
Everything inside the play field is canvas:

- `src/game/constants.js` — tuning, palette, and the depth→zone ladder
- `src/game/backdrop.js` — the shaft: depth rulers, walls, dust, vignette
- `src/game/sprites.js` — slabs, teeth, saws, orbs, the ball and its skid
- `src/game/engine.js` — terrain generation, physics, collision, scoring

Shared canvas machinery (colour, particles, the RAF/DPR canvas host) lives in
`@37apps/core/canvas`.

## Ads

`src/adIds.js` is intentionally empty — Skid isn't registered as its own app in
the AdMob account yet, so `@37apps/core/ads.js` falls back to Google's public
test unit IDs. Fill both platforms in once it exists; nothing else changes.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```
