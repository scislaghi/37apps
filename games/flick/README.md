# Flick

A tower of coloured discs climbs out of the floor. Send each one to the wall
that matches it before the stack reaches the line — on a ten-second clock that
never stops draining.

## Loop

- **Two walls, two colours.** Hot Pink on the left, Cyan Rush on the right.
  The top disc of the tower is the one you throw.
- **Tap** the left or right half of the screen, or **swipe** left/right.
  Arrow keys / `A`-`D` on desktop. Wrong side ends the run instantly.
- **The clock starts at 10s and always drains.** Every correct flick buys a
  fraction of a second back — and that fraction shrinks as your score climbs,
  so the rate you have to sustain keeps rising.
- **The tower keeps growing from the floor**, faster with score. Let it touch
  the danger line and the run is over. Three ways to die: wrong side, clock at
  zero, tower overflow.

Past ~340 points the spawn rate caps above the flick rate the clock can pay
for — the tower wins eventually, by design. The score is how long you held it
off.

## Rules that change the run

| | From | Effect |
| --- | --- | --- |
| **Boost** | — | 8 correct flicks charge the meter; it then spends itself over 5s at double score and 40% more time per flick |
| **Gold disc** | 8 pts | Worth 5 points and hands back an extra 1.2s |
| **Wild disc** (ink) | 15 pts | Throw it either way — it's never wrong |
| **Ice disc** | 26 pts | 3.5s where the clock drains at 45% and the tower grows at half speed |
| **Swap** | 30 pts | Every 18 flicks the two walls trade colours. Throws made during the 0.55s animation always score, so a swap can't steal a run from a thumb already in motion |

Combos pay a small time bonus every 5 in a row.

## Look

Everything on the field is one shape drawn well: a cylinder — two straight
sides closed by a front-facing half-ellipse, with a horizontal gradient across
the body doing all the shading. The visible band of each disc is the stripe
between its own cap and the cap of the disc above, which is what turns a stack
of primitives into a tower.

The two wall colours are the most separable pair in the brand kit — opposite
hues *and* different luminances, so they hold up for colour blindness. The app
accent is a third colour (Violet Spark) on purpose: a PLAY button tinted like
one of the walls would read as "this side is the good one".

## Structure

`src/Flick.jsx` is the React shell — phases, HUD, shared 37apps screens.
Everything inside the play field is canvas:

- `src/game/constants.js` — tuning, palette, and the play-field geometry
- `src/game/sprites.js` — the cylinder, the walls, the column, the danger line
- `src/game/engine.js` — the deck, the clock, throws, collisions with the walls

Shared canvas machinery (colour, particles, the RAF/DPR canvas host) lives in
`@37apps/core/canvas`.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

In a dev build only, the live engine is exposed as `window.__flick` for the
automated visual/balance harness; `import.meta.env.DEV` is statically false in
a production build, so that branch is stripped.

## Ads

`src/adIds.js` is intentionally empty — `@37apps/core/ads.js` falls back to
Google's public test unit IDs, so the AdMob integration runs safely today.
Fill it in once Flick is registered as its own app in the shared AdMob
account; the App IDs go in `strings.xml` / `Info.plist`, not there.
