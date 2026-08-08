# Nugget

Endless mine-shaft runner. The miner runs right along one of three stacked
tunnels; you swipe up/down (or tap above/below him) to switch tunnel.

- **Score**: +1 per gold nugget. That's the whole economy — no multipliers.
- **Nuggets**: 2 on the field at once, 3 from score 6. Collect one and another
  spawns immediately at a random free position ahead, so the count never drops.
- **Boulders**: hang from the ceiling of a single tunnel and mark the floor
  cell below them with a pulsing coral zone. They let go ~0.4 s before reaching
  the miner: be in that cell and you're **crushed**, be anywhere else and it's
  just rubble you must not run into afterwards.
- Difficulty ramps with score: faster scroll, tighter columns, and from score 7
  a growing chance of two boulders in one column (never three — one tunnel is
  always open, and always within one hop of the previous safe one).

## Layout

| file | what's in it |
| --- | --- |
| `src/Nugget.jsx` | screens, HUD, input, ads/audio/haptics wiring |
| `src/game/constants.js` | tuning + palette |
| `src/game/layout.js` | shaft geometry (the single source of truth for the three tunnels) |
| `src/game/backdrop.js` | parallax rock, timber, lanterns, dust, vignette |
| `src/game/sprites.js` | miner, nugget, boulder, crush zone, lamp cone |
| `src/game/engine.js` | simulation + render loop |

Brand: light neutral chrome (brand kit v2 §06 shared screens) around a dark
play field — same deliberate exception as `line`. Accent: **Amber Pulse**
`#FFA31A`. Signature motif: the lamp glow (helmet beam, hanging lanterns, the
glow behind the menu title).

## Dev

```sh
npm run dev -w nugget      # from the repo root
npm run build -w nugget
npm run lint -w nugget
```

Native platforms aren't scaffolded yet: `npx cap add ios` / `npx cap add
android` from this folder once the game is registered in the shared AdMob
account (see `src/adIds.js`).
