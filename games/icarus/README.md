# Icarus

Fly the myth. A horizontal flap-and-glide runner squeezed between two lethal
boundaries: the sun above and the sea below.

## Loop

- **Tap** anywhere to flap; gravity does the rest. `Space` / arrow-up on desktop.
- **The sun is a soft ceiling.** Above the shimmering melt line the wax meter
  fills, faster the higher you go. Fill it and your wings come apart.
- **The sea is a hard floor.** Touch it and the run is over.
- Staying low cools the wax — but low is where the rocks are. That trade is the
  whole game.
- **Distance in metres is the score.**

| Hazard | From | Behaviour |
| --- | --- | --- |
| Rock spire | 0 m | Climbs out of the sea; pushes you up toward the sun |
| Gull | 110 m | Flies *toward* you, so it closes faster than the world scrolls |
| Floating crag | 400 m | Bobs in mid-air, right where the safe lane is |
| Storm cloud | 850 m | Wide and solid; route around it |

**Feathers** cool the wax on pickup and charge the meter (4 fill it). A full
meter fires **GLIDE**: ~4.5s of double score, no heating at all, and gulls,
crags and storms burned through on contact — but not the spires, so it never
becomes a licence to stop steering.

The melt is drawn on the character, not just metered: his wings shed quills and
run wax as the meter climbs, and the whole frame bleaches as he cooks.

## Structure

`src/Icarus.jsx` is the React shell. The play field is canvas:

- `src/game/constants.js` — tuning, palette, the two boundaries, sky ladder
- `src/game/sprites.js` — sun, melt line, sea, hazards, and Icarus himself
- `src/game/engine.js` — flight, wax, spawning, collision

Shared canvas machinery lives in `@37apps/core/canvas`.

## Dev

```sh
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle
```

Dev builds expose the live engine as `window.__icarus`; the branch is stripped
from production.
