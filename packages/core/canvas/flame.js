/* ══ Shared flame primitive ══
   Three nested teardrops — outer coral, amber body, white-hot core — whose
   widths and heights wobble on independent sine terms so no two frames
   repeat. Prometheus' torch, Icarus' sun corona and Line's surge glow all
   come from this one function, which is what makes fire look like the same
   substance across the portfolio. */

import { withAlpha } from './color.js';

const DEFAULT_LAYERS = [
  { c: '#FF4529', w: 1, h: 1, a: 0.9 },
  { c: '#FFA31A', w: 0.66, h: 0.74, a: 0.95 },
  { c: '#FFF0BE', w: 0.32, h: 0.44, a: 1 },
];

/**
 * Draws a flame with its base at (x, y), growing upward.
 * @param {number} t seconds — drives the flicker
 * @param {number} [seed] de-syncs two flames drawn in the same frame
 */
export function drawFlame(ctx, x, y, w, h, t, seed = 0, layers = DEFAULT_LAYERS) {
  for (const L of layers) {
    const wob = Math.sin(t * 13 + seed) * 0.09 + Math.sin(t * 21.7 + seed * 2.3) * 0.05;
    const lw = w * L.w * (1 + wob);
    const lh = h * L.h * (1 - wob * 0.7);
    const lean = Math.sin(t * 9 + seed * 1.7) * w * 0.12;

    ctx.beginPath();
    ctx.moveTo(x, y - lh);
    ctx.bezierCurveTo(x + lean + lw * 0.75, y - lh * 0.45, x + lw * 0.5, y - lh * 0.06, x, y);
    ctx.bezierCurveTo(x - lw * 0.5, y - lh * 0.06, x - lean - lw * 0.75, y - lh * 0.45, x, y - lh);
    ctx.fillStyle = L.a >= 1 ? L.c : withAlpha(L.c, L.a);
    ctx.fill();
  }
}

/** A soft radial glow — cheaper and softer than canvas `shadowBlur`. */
export function drawGlow(ctx, x, y, r, color, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
