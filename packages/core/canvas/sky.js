/* ══ Shared sky ladder ══
   Progress (metres climbed, metres flown, whatever a game counts) drives a
   ladder of named skies. Every game defines its own stops; the machinery for
   blending them, wrapping the cycle, and painting the gradient is here.

   A zone stop is:
     { at, name, top, mid, bot, band, dark, body }
   `dark` (0..1) fades the star field in, `body` picks "sun" | "moon", `band`
   tints the horizontal haze bands. The last stop should repeat the first so
   an endless run wraps without a visible seam. */

import { mixHex, smoothstep } from './color.js';

/**
 * @param {Array<object>} zones ordered by `at`, last repeating the first
 */
export function makeSkyLadder(zones) {
  const cycle = zones[zones.length - 1].at;

  /** @param {number} v progress in the game's own unit */
  function skyAt(v) {
    const a = ((v % cycle) + cycle) % cycle;
    let i = 0;
    while (i < zones.length - 2 && zones[i + 1].at <= a) i++;
    const z0 = zones[i], z1 = zones[i + 1];
    const t = smoothstep(Math.min(1, Math.max(0, (a - z0.at) / (z1.at - z0.at))));
    return {
      top: mixHex(z0.top, z1.top, t),
      mid: mixHex(z0.mid, z1.mid, t),
      bot: mixHex(z0.bot, z1.bot, t),
      band: mixHex(z0.band, z1.band, t),
      dark: z0.dark + (z1.dark - z0.dark) * t,
      body: t < 0.5 ? z0.body : z1.body,
      bodyBlend: z0.body === z1.body ? 0 : t,
      name: t < 0.5 ? z0.name : z1.name,
      index: i,
    };
  }

  return { skyAt, cycle, zones };
}

/** The base gradient. Everything else in a backdrop sits on top of this. */
export function drawSky(ctx, w, h, sky) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.52, sky.mid);
  g.addColorStop(1, sky.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
