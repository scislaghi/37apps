# Hue

One ball, four colours, one thumb. An endless vertical climb where every
obstacle is made of the same four brand accents — and you only pass through
the one you currently are.

## Loop

- **Tap to rise.** Gravity does the rest. One tap lifts the ball ~64 px; miss
  enough of them and you drop off the bottom of the screen.
- **Score is distance climbed, in metres.** Nothing else adds to it — the
  cleared counter next to it is pace, not points.
- **Every obstacle is four colours, and it's turning.** Touch a segment that
  isn't your colour and the run ends; your own colour isn't there at all, you
  pass straight through it. So the move is always the same: park under it,
  read the rotation, go when yours comes round.
- **Pinwheels change you.** They sit on the centre lane the ball can never
  leave, so they're taken, not collected — the colour you hold is the game's
  choice, never yours.
- **The floor creeps.** Stall for more than ~3 s without gaining height and a
  dark haze starts rising from the bottom. Waiting is a tactic; camping isn't.

| Shape | From | Behaviour |
| --- | --- | --- |
| Ring (4 quarter-arcs) | 0 m | Rotates; centre is nudged off the lane so you cross it at a different angle each time |
| Bars | 110 m | Full-width band of four segments sliding sideways — no way round, only through |
| Cross | 260 m | Four arms about a hollow hub; the hub is the safe pocket, the arms are not |
| Dual ring | 480 m | Two concentric rings turning opposite ways, sized so you can park between them |

## Look

The shared light neutral base (brand kit v2 §01), because a colour-match game
lives or dies on all four hues reading equally well — on black, violet sinks
and coral blooms. Chrome accent is Cobalt Bright, deliberately *not* one of
the four playable hues, so a PLAY or RETRY button can never be misread as a
colour cue.

Two rules carry the readability:

1. **The matching segment is haloed, the others aren't** — the answer is the
   brightest thing on screen, so the rule teaches itself.
2. **The world takes your colour** — a soft bloom under the ball tints the
   whole field, so "what am I right now" never costs a glance away from the
   obstacle. That bloom, and the four-quarter pinwheel, are Hue's signature
   motif (brand kit §05).

## Structure

`src/Hue.jsx` is the React shell — phases, HUD, shared 37apps screens.
Everything inside the play field is canvas:

- `src/game/constants.js` — tuning, the four hues, and the altitude→field ladder
- `src/game/backdrop.js` — the neutral wash, dot lattice, hue bloom and the void
- `src/game/sprites.js` — the four shapes, the pinwheel, the ball and its trail
- `src/game/engine.js` — gravity, camera, spawning, colour collision

Shared canvas machinery (colour, particles, the RAF/DPR canvas host) lives in
`@37apps/core/canvas`.

### Two things worth knowing before changing the tuning

- **`JUMP_V` is the difficulty budget.** Every pocket a player has to hover
  inside — a ring's interior, the cross's hub, the gap between a dual's two
  rings — is sized against one hop. A pocket shorter than one hop isn't a
  pocket you can wait in, only one you gamble through.
- **Physics runs in fixed 1/120 s substeps.** At terminal fall speed a single
  50 ms frame moves the ball further than an obstacle band is thick, and
  tunnelling through a wall you should have died on is the one bug this genre
  can't have.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

In a dev build only, the live engine is exposed as `window.__hue` for the
automated visual/balance harness; `import.meta.env.DEV` is statically false in
a production build, so that branch is stripped.

Not yet done: native `android/` + `ios/` projects (`npx cap add …`), real
AdMob unit IDs in `src/adIds.js`, and store assets.
