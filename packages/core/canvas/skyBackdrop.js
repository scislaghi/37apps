/* ══ Shared parallax sky ══
   The layers between the gradient and the actors: stars, a sun/moon disc,
   horizontal haze bands, cloud puffs, and foreground motes.

   Every layer is seeded once and drawn with modulo wrapping, so the world is
   endless without allocating per frame. Scroll is passed as {sx, sy} so the
   same code serves a vertical climber and a horizontal side-scroller — the
   only difference between the two is which axis carries the motion. */

import { rng, withAlpha } from './color.js';

const STAR_STRIP = 1400;
const BAND_STRIP = 900;
const PUFF_STRIP = 1100;

/** @param {number} [seed] */
export function createSkyBackdrop(seed = 20240727) {
  const r = rng(seed);
  return {
    stars: Array.from({ length: 90 }, () => ({
      x: r(), y: r() * STAR_STRIP, r: 0.6 + r() * 1.5, tw: r() * Math.PI * 2,
    })),
    /* the horizontal light bands are what make a flat gradient read as "sky"
       rather than "wallpaper" — lifted straight from the reference art */
    bands: Array.from({ length: 14 }, () => ({
      y: r() * BAND_STRIP, h: 16 + r() * 54, a: 0.05 + r() * 0.13,
    })),
    puffs: Array.from({ length: 16 }, () => ({
      x: r(), y: r() * PUFF_STRIP, s: 0.5 + r() * 1.1, a: 0.16 + r() * 0.22, flip: r() > 0.5,
    })),
    motes: Array.from({ length: 34 }, () => ({
      x: r(), y: r(), s: 0.5 + r() * 1.2, sp: 0.4 + r() * 0.9, ph: r() * Math.PI * 2,
    })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

function drawStars(ctx, w, h, bd, sx, sy, sky, t) {
  if (sky.dark <= 0.02) return;
  const oy = sy * 0.06, ox = sx * 0.06;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  for (const st of bd.stars) {
    const y = wrap(st.y - oy, STAR_STRIP);
    if (y > h + 4) continue;
    const x = wrap(st.x * w - ox, w);
    ctx.globalAlpha = sky.dark * (0.55 + Math.sin(t * 2 + st.tw) * 0.45);
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Sun by day, moon by night, cross-faded through the zone transition. The
 * moon is the same disc with a bite punched out via `destination-out`, so
 * there's no second sprite to keep in sync.
 */
function drawBody(ctx, w, h, sx, sy, sky, anchor) {
  const cx = w * anchor.x - wrap(sx * 0.02, w * 3);
  const cy = h * anchor.y - wrap(sy * 0.02, h * 2.4);
  const R = Math.min(w, h) * 0.115;

  const paint = (warm, alpha) => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const core = warm ? '#FFF0BE' : '#EAE6FF';
    const halo = warm ? '#FFA31A' : '#8E86C9';

    const g = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 3.6);
    g.addColorStop(0, withAlpha(halo, 0.5));
    g.addColorStop(1, withAlpha(halo, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    if (!warm) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx + R * 0.42, cy - R * 0.28, R * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const moonish = sky.body === 'moon' ? 1 - sky.bodyBlend : sky.bodyBlend;
  paint(true, 1 - moonish);
  paint(false, moonish);
}

function drawBands(ctx, w, h, bd, sy, sky) {
  const off = sy * 0.22;
  ctx.save();
  ctx.fillStyle = sky.band;
  for (const b of bd.bands) {
    const y = wrap(b.y - off, BAND_STRIP);
    if (y > h + b.h) continue;
    ctx.globalAlpha = b.a;
    ctx.fillRect(0, y, w, b.h);
  }
  ctx.restore();
}

function puff(ctx, x, y, s, flip) {
  const lobes = [[-1.5, 0.18, 0.72], [-0.6, -0.32, 1.0], [0.35, -0.1, 0.86], [1.3, 0.22, 0.6]];
  ctx.beginPath();
  for (const [lx, ly, lr] of lobes) {
    const px = x + (flip ? -lx : lx) * 26 * s;
    ctx.moveTo(px + lr * 22 * s, y + ly * 20 * s);
    ctx.arc(px, y + ly * 20 * s, lr * 22 * s, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawPuffs(ctx, w, h, bd, sx, sy, sky) {
  const oy = sy * 0.5, ox = sx * 0.5;
  const night = sky.dark > 0.6;
  ctx.save();
  ctx.fillStyle = night ? '#1B1830' : '#FFFFFF';
  for (const p of bd.puffs) {
    const y = wrap(p.y - oy, PUFF_STRIP);
    if (y > h + 90) continue;
    ctx.globalAlpha = p.a * (night ? 1.5 : 1);
    puff(ctx, wrap(p.x * w - ox, w + 220) - 110, y, p.s, p.flip);
  }
  ctx.restore();
}

/**
 * Foreground motes streaking past the camera. Cheap, but the single biggest
 * contributor to the sense of speed, so `speedK` (0..1) drives their length
 * rather than running them at a fixed rate.
 */
export function drawMotes(ctx, w, h, bd, sx, sy, speedK, sky) {
  const night = sky.dark > 0.5;
  ctx.save();
  /* in the dark zones these are embers on the wind, so they need full opacity
     and a short streak — a long, half-transparent amber dash over near-black
     just reads as muddy brown debris */
  ctx.fillStyle = night ? '#FFA31A' : '#FFFFFF';
  const horiz = Math.abs(sx) > Math.abs(sy);
  for (const m of bd.motes) {
    ctx.globalAlpha = night ? 0.4 + m.sp * 0.35 : 0.16 + m.sp * 0.16;
    const len = (5 + speedK * 26 * m.sp) * (night ? 0.55 : 1);
    if (horiz) {
      const x = wrap(m.x * w - sx * (1.5 + m.sp) * 0.9, w + 120);
      ctx.fillRect(x, m.y * h + Math.sin(sx * 0.01 + m.ph) * 6, len, m.s * 1.6);
    } else {
      const y = wrap(m.y * h - sy * (1.5 + m.sp) * 0.9, h + 120);
      ctx.fillRect(m.x * w + Math.sin(sy * 0.01 + m.ph) * 6, y - len, m.s * 1.6, len);
    }
  }
  ctx.restore();
}

/**
 * Layers 1–4, in order — call after `drawSky` and before the actors.
 *
 * `body: false` suppresses the sun/moon disc. Icarus needs that: its sun is a
 * mechanic with its own rays and heat corona, and two celestial bodies on one
 * screen reads as a bug rather than as scenery.
 *
 * @param {{sx?: number, sy?: number, body?: boolean, anchor?: {x: number, y: number}}} [opts]
 */
export function drawSkyLayers(ctx, w, h, bd, sky, t, { sx = 0, sy = 0, body = true, anchor = { x: 0.2, y: 0.2 } } = {}) {
  drawStars(ctx, w, h, bd, sx, sy, sky, t);
  if (body) drawBody(ctx, w, h, sx, sy, sky, anchor);
  drawBands(ctx, w, h, bd, sy, sky);
  drawPuffs(ctx, w, h, bd, sx, sy, sky);
}
