/* ══ Nugget — the shaft ══
   Three stacked tunnels carved out of one rock face. Everything here is
   derived from the world scroll through a hash, never stored: the shaft is
   infinite, and an infinite level that keeps an array of its own past is a
   memory leak with a view.

   Three parallax rates sell the depth — far rock at 0.25, timber and lanterns
   at 1.0 (they're *in* the tunnel with you), dust motes at 0.45 in front. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { palette, LANES } from "./constants.js";
import { laneFloorY, laneCeilY, FLOOR_H, CEIL_H } from "./layout.js";

/** Stable pseudo-random for world index `i` — same slab, same rock, forever. */
function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const BLOB_SPACING = 150;     // far rock texture
const TIMBER_SPACING = 250;   // support frames
const LANTERN_SPACING = 330;
const SLEEPER_SPACING = 34;
const JAG = 26;               // world px per ceiling-rubble tooth

export function createMine() {
  return {
    /* the only thing worth keeping: floating dust, which has to drift on its
       own clock rather than being a pure function of scroll */
    motes: Array.from({ length: 34 }, (_, i) => ({
      x: hash(i * 3.1), y: hash(i * 7.7), r: 0.7 + hash(i * 13.3) * 1.6,
      ph: hash(i * 5.5) * Math.PI * 2, sp: 0.25 + hash(i * 9.9) * 0.7,
    })),
  };
}

/* ── far rock: big soft lumps behind the tunnels, only ever glimpsed through
   the gaps. Slow parallax is doing all the work here; detail would be
   invisible and expensive. ── */
function drawFarRock(ctx, g, scroll) {
  const { w, h, s } = g;
  const off = scroll * 0.25;
  const i0 = Math.floor((off - 200) / BLOB_SPACING);
  const i1 = Math.ceil((off + w + 200) / BLOB_SPACING);
  ctx.save();
  ctx.fillStyle = palette.rockDeep;
  for (let i = i0; i <= i1; i++) {
    const x = i * BLOB_SPACING - off + hash(i) * 90;
    const y = hash(i * 2.3) * h;
    const r = (60 + hash(i * 4.1) * 110) * s;
    ctx.globalAlpha = 0.5 + hash(i * 6.7) * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + hash(i * 8.9) * 0.5), hash(i * 3.7) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Jagged rubble strip under a lane's ceiling — the tooth pattern is a pure
    function of world x, so it slides past instead of crawling. */
function ceilingPath(ctx, g, scroll, l) {
  const { w, s } = g;
  const yTop = g.top + g.laneH * l;
  const yBase = laneCeilY(g, l);
  const step = JAG * s;
  const i0 = Math.floor(scroll / step) - 1;

  ctx.beginPath();
  ctx.moveTo(-step, yTop - 2);
  for (let i = i0; i * step - scroll < w + step * 2; i++) {
    const x = i * step - scroll;
    const dip = hash(i * 1.7 + l * 40) * CEIL_H * s * 1.35;
    ctx.lineTo(x, yBase - CEIL_H * s * 0.35 + dip);
    ctx.lineTo(x + step * 0.5, yBase - CEIL_H * s * 0.9 + hash(i * 5.3 + l * 40) * CEIL_H * s * 0.7);
  }
  ctx.lineTo(w + step * 2, yTop - 2);
  ctx.closePath();
}

function drawTunnel(ctx, g, scroll, l) {
  const { w, s } = g;
  const bandTop = g.top + g.laneH * l;
  const bandBot = g.top + g.laneH * (l + 1);
  const floorY = laneFloorY(g, l);

  /* interior: darkest at the ceiling, warming toward the floor where the
     lamps and the miner actually are */
  const grad = ctx.createLinearGradient(0, bandTop, 0, bandBot);
  grad.addColorStop(0, palette.rock);
  grad.addColorStop(1, palette.rockLit);
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandTop, w, bandBot - bandTop);

  ctx.fillStyle = palette.strata;
  ceilingPath(ctx, g, scroll, l);
  ctx.fill();
  /* a lit hairline along the carved edge — the one thing that keeps a very
     dark ceiling from dissolving into a very dark tunnel */
  ctx.strokeStyle = withAlpha(palette.strataEdge, 0.75);
  ctx.lineWidth = 1.3 * s;
  ceilingPath(ctx, g, scroll, l);
  ctx.stroke();

  /* ── floor slab + cart rails: the sleepers are the single strongest speed
     cue in the frame — they're small, high-contrast and they stream past. ── */
  ctx.fillStyle = palette.strata;
  ctx.fillRect(0, floorY, w, bandBot - floorY + 1);

  const step = SLEEPER_SPACING * s;
  const i0 = Math.floor(scroll / step);
  ctx.fillStyle = withAlpha(palette.rail, 0.5);
  for (let i = i0; i * step - scroll < w + step; i++) {
    const x = i * step - scroll;
    ctx.fillRect(x, floorY + 3.5 * s, 4 * s, FLOOR_H * s - 5 * s);
  }
  ctx.fillStyle = withAlpha(palette.rail, 0.95);
  ctx.fillRect(0, floorY + 2.5 * s, w, 1.8 * s);
  ctx.fillStyle = withAlpha(palette.strataEdge, 0.9);
  ctx.fillRect(0, floorY, w, 1.4 * s);

  /* ── ore veins: dull ochre streaks *in the rock*, never in the open tunnel.
     They say "there's gold in these walls" — which is the whole premise — and
     because they live inside the strata and never glint, they can't be
     mistaken for a nugget you could have picked up. ── */
  const vstep = 90 * s;
  const v0 = Math.floor(scroll / vstep);
  ctx.save();
  ctx.strokeStyle = "rgba(138,106,42,0.5)";
  ctx.lineWidth = 1.6 * s;
  ctx.lineCap = "round";
  for (let i = v0; i * vstep - scroll < w + vstep; i++) {
    const k = hash(i * 3.3 + l * 71);
    if (k > 0.55) continue;
    const x = i * vstep - scroll + k * 60 * s;
    const y = k < 0.28 ? bandTop + 3 * s + k * 18 * s : floorY + 4 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (7 + k * 22) * s, y + (k - 0.25) * 10 * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Timber frames: a post through the whole shaft with a lintel per tunnel.
    Kept dim and thin — a support that reads as solid as a boulder is a lie
    the player pays for. */
function drawTimber(ctx, g, scroll) {
  const { s, h } = g;
  const step = TIMBER_SPACING * s;
  const i0 = Math.floor(scroll / step);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = palette.beam;
  for (let i = i0; i * step - scroll < g.w + step; i++) {
    const x = i * step - scroll + hash(i * 2.9) * 40 * s;
    ctx.fillRect(x, g.top, 5 * s, h - g.top - g.bot);
    for (let l = 0; l < LANES; l++) {
      ctx.fillRect(x - 16 * s, laneCeilY(g, l) - 2 * s, 38 * s, 4 * s);
    }
  }
  ctx.restore();
}

/** Hanging lanterns — the game's signature motif, echoed by the miner's own
    helmet lamp and by the glow behind the icon on the menu. */
function drawLanterns(ctx, g, scroll, t) {
  const { s } = g;
  const step = LANTERN_SPACING * s;
  const i0 = Math.floor(scroll / step);
  for (let i = i0; i * step - scroll < g.w + step; i++) {
    const l = Math.floor(hash(i * 11.3) * LANES);
    const x = i * step - scroll;
    const y = laneCeilY(g, l) + 12 * s;
    /* every lamp flickers on its own phase — a shaft where all the lights
       pulse together reads as a screen effect, not as fire */
    const flick = 0.72 + Math.sin(t * 7 + i) * 0.12 + hash(i * 17.1 + Math.floor(t * 6)) * 0.16;
    const floor = laneFloorY(g, l);

    /* A bare glowing dot up here would be read as a nugget, which is the one
       misread the game cannot afford. So a lantern is never a floating ball:
       it's a dark housing, hung from a visible bracket, throwing a light
       *pool down onto the floor*. Shape and direction do the disambiguating,
       not colour — both of them are amber and always will be. */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pool = ctx.createLinearGradient(x, y, x, floor);
    pool.addColorStop(0, withAlpha(palette.gold, 0.13 * flick));
    pool.addColorStop(1, withAlpha(palette.gold, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y);
    ctx.lineTo(x + 7 * s, y);
    ctx.lineTo(x + 46 * s, floor);
    ctx.lineTo(x - 46 * s, floor);
    ctx.closePath();
    ctx.fill();

    const gr = ctx.createRadialGradient(x, y, 0, x, y, 74 * s);
    gr.addColorStop(0, withAlpha(palette.gold, 0.2 * flick));
    gr.addColorStop(1, withAlpha(palette.gold, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(x - 74 * s, y - 74 * s, 148 * s, 148 * s);
    ctx.restore();

    ctx.strokeStyle = withAlpha(palette.beam, 0.95);
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(x, y - 16 * s);
    ctx.lineTo(x, y - 5 * s);
    ctx.stroke();

    ctx.fillStyle = palette.beam;      // housing: a dark shade, opening down
    ctx.beginPath();
    ctx.moveTo(x - 6.5 * s, y + 1 * s);
    ctx.lineTo(x - 3 * s, y - 6 * s);
    ctx.lineTo(x + 3 * s, y - 6 * s);
    ctx.lineTo(x + 6.5 * s, y + 1 * s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = withAlpha(palette.goldHot, 0.5 + flick * 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y + 1 * s, 4.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Dust in the air, in front of the tunnels but behind the actors. */
function drawMotes(ctx, g, scroll, mine, t) {
  const { w, h, s } = g;
  const span = w + 120 * s;
  ctx.save();
  ctx.fillStyle = palette.goldHot;
  for (const m of mine.motes) {
    const x = ((m.x * span - scroll * 0.45) % span + span) % span - 60 * s;
    const y = m.y * (h - g.top - g.bot) + g.top + Math.sin(t * m.sp + m.ph) * 12 * s;
    ctx.globalAlpha = 0.06 + (Math.sin(t * 1.4 + m.ph) * 0.5 + 0.5) * 0.13;
    ctx.beginPath();
    ctx.arc(x, y, m.r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawMine(ctx, g, scroll, t) {
  const { w, h } = g;

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, palette.void);
  base.addColorStop(0.5, palette.rockDeep);
  base.addColorStop(1, palette.void);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  drawFarRock(ctx, g, scroll);
  drawTimber(ctx, g, scroll);
  for (let l = 0; l < LANES; l++) drawTunnel(ctx, g, scroll, l);
  drawLanterns(ctx, g, scroll, t);
  drawMotes(ctx, g, scroll, g.mine, t);
}

/** Speed streaks + vignette, drawn over the actors. `rush` is 0..1. */
export function drawForeground(ctx, g, scroll, rush) {
  const { w, h, s } = g;

  if (rush > 0.02 && !g.reduced) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = withAlpha(palette.goldHot, 0.05 + rush * 0.09);
    ctx.lineWidth = 1.2 * s;
    const step = 120 * s;
    const i0 = Math.floor(scroll * 1.5 / step);
    for (let i = i0; i * step - scroll * 1.5 < w + step; i++) {
      const x = i * step - scroll * 1.5;
      const y = g.top + hash(i * 23.7) * (h - g.top - g.bot);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (40 + rush * 70) * s, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  const vg = ctx.createRadialGradient(w * 0.42, h * 0.5, Math.min(w, h) * 0.28, w * 0.42, h * 0.5, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.46)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
