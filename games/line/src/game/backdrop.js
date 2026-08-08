/* ══ Line — the dark field ══
   Not the shared sky backdrop: this game's ground is a lattice, not weather.
   A dot grid plus a pair of converging perspective rails, both scrolling at
   different rates — enough parallax to sell speed, quiet enough that the neon
   never has to compete with it. */

import { rng, mixHex, withAlpha, smoothstep } from "@37apps/core/canvas/color.js";
import { ZONES } from "./constants.js";

const CELL = 46;
const CYCLE = ZONES[ZONES.length - 1].at;

/** Blends the two bracketing depth zones. Mirrors `makeSkyLadder`, but this
    game's ladder carries a `grid` tint instead of sun/star fields. */
export function fieldAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  const z0 = ZONES[i], z1 = ZONES[i + 1];
  const t = smoothstep(Math.min(1, Math.max(0, (a - z0.at) / (z1.at - z0.at))));
  return {
    top: mixHex(z0.top, z1.top, t),
    mid: mixHex(z0.mid, z1.mid, t),
    bot: mixHex(z0.bot, z1.bot, t),
    grid: mixHex(z0.grid, z1.grid, t),
    name: t < 0.5 ? z0.name : z1.name,
    index: i,
  };
}

export function createField(seed = 5150) {
  const r = rng(seed);
  return {
    /* a sparse set of brighter nodes on the lattice — without them a uniform
       dot grid reads as a texture rather than a space */
    nodes: Array.from({ length: 26 }, () => ({ x: r(), y: r(), tw: r() * Math.PI * 2 })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

export function drawField(ctx, w, h, fd, scroll, m, t) {
  const z = fieldAt(m);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, z.top);
  g.addColorStop(0.55, z.mid);
  g.addColorStop(1, z.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /* ── perspective rails: two lines converging toward a vanishing point above
     the player. They're what turn a flat dot field into a corridor you're
     travelling *down*, and they're the reference art's rounded frame read as
     depth instead of as chrome. ── */
  const vx = w / 2, vy = -h * 0.35;
  ctx.save();
  ctx.strokeStyle = withAlpha(z.grid, 0.32);
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(vx + side * w * 0.62, h + 20);
    ctx.lineTo(vx + side * w * 0.06, vy);
    ctx.stroke();
  }
  ctx.restore();

  /* ── dot lattice ── */
  const off = wrap(scroll * 0.35, CELL);
  ctx.save();
  ctx.fillStyle = z.grid;
  ctx.globalAlpha = 0.55;
  for (let y = -CELL + off; y < h + CELL; y += CELL) {
    /* rows alternate a half-cell across, which is what gives the reference
       art's diamond read rather than a plain square graph-paper grid */
    const stagger = (Math.round((y - off) / CELL) % 2) * (CELL / 2);
    for (let x = -CELL + stagger; x < w + CELL; x += CELL) {
      const d = Math.abs(x - vx) / w;
      ctx.globalAlpha = 0.3 + (1 - d) * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  /* ── brighter nodes, drifting slower ── */
  const noff = wrap(scroll * 0.18, h + 200);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const n of fd.nodes) {
    const y = wrap(n.y * (h + 200) - noff, h + 200) - 100;
    if (y < -20 || y > h + 20) continue;
    ctx.globalAlpha = 0.18 + Math.sin(t * 1.6 + n.tw) * 0.12;
    ctx.fillStyle = z.grid;
    ctx.beginPath();
    ctx.arc(n.x * w, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* ── vignette: pulls the eye to the centre lane and gives the field the
     rounded-frame silhouette of the reference art without drawing a frame ── */
  const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.25, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  return z;
}
