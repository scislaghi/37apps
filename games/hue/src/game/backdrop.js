/* ══ Hue — the light field ══
   A calm neutral wash, a slow dot lattice for parallax (so a climb reads as
   travel even when the ball is holding station), and one live element: a soft
   bloom under the ball tinted with whatever colour it currently is. That
   bloom is the game's signature motif — the world quietly takes on your hue,
   which is both decoration and the fastest possible read of "what am I right
   now" without looking away from the obstacle. */

import { rng, mixHex, withAlpha, smoothstep } from "@37apps/core/canvas/color.js";
import { ZONES } from "./constants.js";

/** `mixHex` hands back an `rgb(...)` string, not a hex, so the shared
    `withAlpha` (which parses `#rrggbb`) can't be pointed at a blended zone
    colour — it silently produces `rgba(NaN,…)` and the canvas keeps whatever
    fill style was set last. Everything blended goes through this instead. */
function tint(color, a) {
  if (color[0] === "#") return withAlpha(color, a);
  const [r, g, b] = color.slice(4, -1).split(",");
  return `rgba(${r},${g},${b},${a})`;
}

const CELL = 52;
const CYCLE = ZONES[ZONES.length - 1].at;

/** Blends the two bracketing depth zones into one live field description. */
export function fieldAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  const z0 = ZONES[i], z1 = ZONES[i + 1];
  const t = smoothstep(Math.min(1, Math.max(0, (a - z0.at) / (z1.at - z0.at))));
  return {
    top: mixHex(z0.top, z1.top, t),
    bot: mixHex(z0.bot, z1.bot, t),
    grid: mixHex(z0.grid, z1.grid, t),
    name: t < 0.5 ? z0.name : z1.name,
    index: i,
  };
}

export function createField(seed = 3737) {
  const r = rng(seed);
  return {
    /* a handful of oversized soft discs drifting behind the lattice — they're
       what keeps a flat neutral page from looking like a blank div */
    motes: Array.from({ length: 9 }, () => ({ x: r(), y: r(), r: 0.16 + r() * 0.26, tw: r() * Math.PI * 2 })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

/**
 * @param {number} cam world y at the top of the screen (decreases as you climb)
 * @param {string} hueHex the ball's current colour, for the bloom
 * @param {number} bloomY screen y of the ball
 */
export function drawField(ctx, w, h, fd, cam, m, t, hueHex, bloomY) {
  const z = fieldAt(m);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, z.top);
  g.addColorStop(1, z.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /* ── drifting motes, parallaxed at a third of the climb ── */
  const span = h + 400;
  const moff = wrap(-cam * 0.3, span);
  for (const n of fd.motes) {
    const y = wrap(n.y * span + moff, span) - 200;
    if (y < -260 || y > h + 260) continue;
    const rad = n.r * w;
    const rg = ctx.createRadialGradient(n.x * w, y, 0, n.x * w, y, rad);
    rg.addColorStop(0, tint(z.grid, 0.42 + Math.sin(t * 0.5 + n.tw) * 0.1));
    rg.addColorStop(1, tint(z.grid, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(n.x * w, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── dot lattice: staggered rows, so it reads as a diamond weave rather
     than graph paper, scrolling at 0.55× the climb ── */
  const off = wrap(-cam * 0.55, CELL);
  ctx.save();
  ctx.fillStyle = z.grid;
  for (let y = -CELL + off; y < h + CELL; y += CELL) {
    const stagger = (Math.round((y - off) / CELL) % 2) * (CELL / 2);
    for (let x = -CELL + stagger; x < w + CELL; x += CELL) {
      const d = Math.abs(x - w / 2) / w;
      ctx.globalAlpha = 0.5 + (1 - d) * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  /* ── the bloom: the world takes the ball's colour ── */
  const br = Math.max(w, h) * 0.55;
  const bg = ctx.createRadialGradient(w / 2, bloomY, 0, w / 2, bloomY, br);
  bg.addColorStop(0, withAlpha(hueHex, 0.2));
  bg.addColorStop(0.5, withAlpha(hueHex, 0.06));
  bg.addColorStop(1, withAlpha(hueHex, 0));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  return z;
}

/**
 * The rising floor, drawn only once it's actually moving. A hue-neutral ink
 * haze rather than a coloured one — it must never be mistaken for something
 * you could match your way through.
 */
export function drawVoid(ctx, w, h, strength) {
  if (strength <= 0) return;
  const a = Math.min(1, strength);
  const top = h - h * (0.18 + a * 0.22);
  const g = ctx.createLinearGradient(0, h, 0, top);
  g.addColorStop(0, `rgba(24,23,29,${0.5 * a})`);
  g.addColorStop(1, "rgba(24,23,29,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);

  /* the bar sits on the *actual* kill line — the bottom edge of the screen —
     rather than at the top of the haze. A gradient alone reads as vignette,
     and a hard line drawn anywhere else would be telling the player the floor
     is somewhere it isn't */
  ctx.fillStyle = `rgba(24,23,29,${0.55 * a})`;
  ctx.fillRect(0, h - 3, w, 3);
}

/** Corner darkening — pulls the eye onto the centre lane the ball rides. */
export function drawVignette(ctx, w, h) {
  const vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(24,23,29,0)");
  vg.addColorStop(1, "rgba(24,23,29,0.13)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
