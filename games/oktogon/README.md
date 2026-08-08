# Oktogon

A coloured ball drops from the centre of an octagon whose eight sides each
carry one of the brand kit's eight accents. Tap the right half of the screen
to spin the octagon clockwise, the left half to spin it back — one side per
tap. Land the ball on a side of its own colour to score; anything else ends
the run.

The ball plays *inside* the shape: it falls from the centre onto the inner
face of whichever side is beneath it. That is why the octagon is sized to
nearly fill the viewport — the fall from the centre to the far wall is the
entire reaction window, so every pixel of inradius is reaction time.

```bash
npm run dev      # vite dev server
npm run build    # production bundle into dist/
npm run lint     # oxlint
```

## Source map

| File | Responsibility |
| --- | --- |
| `src/Oktogon.jsx` | Phases, HUD, tap zones, and the shared start/game-over/settings screens |
| `src/game/constants.js` | Palette, layout ratios and every tuning number |
| `src/game/geometry.js` | Octagon maths: side normals, support function, inner-wall landing prediction |
| `src/game/engine.js` | Simulation — dial spring, gravity, collision verdict, difficulty ramps |
| `src/game/render.js` | All drawing, including the menu hero |

## Two things worth knowing before editing

**Collision is continuous, and it resolves from the inside.** The ball is
inside the octagon, so `predictLanding()` clips its descent against the
*downward*-facing walls and takes the nearest one; a ball touches a wall once
`support().reach ≥ inradius − ballR`. Getting the sign of either backwards
silently turns the game into the outside-falling version it used to be.
`engine.js` solves for the exact contact point within the step rather than
testing for overlap after the fact: near a vertex an overlap test can report
the neighbouring side and kill a player who just watched the guide lock on.
The guide and the verdict call the same function at the same rotation, which
is the only reason they cannot disagree — keep it that way.

**Rotation is a spring, and collision reads the visible angle.** Taps land on
`rotTarget` immediately so input is never swallowed mid-animation, but the ball
hits whatever `rot` has actually reached. Overshoot is therefore a real risk
the player can feel; that is deliberate, and it is why `ROT_DAMPING` should not
be lowered without replaying the last few seconds of a fast run.

## Not done yet

- `android/` and `ios/` are not generated — run `npx cap add ios` /
  `npx cap add android` when the native shells are needed.
- `src/adIds.js` holds Google's public **test** ad units. Replace them with the
  real Oktogon units before any store build.
- No `store-assets/` yet (icon, screenshots, listing copy).
