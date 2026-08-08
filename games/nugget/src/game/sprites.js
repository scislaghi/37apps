/* ══ Nugget — the cast ══
   Three actors, all procedural: the miner, the nugget, the boulder. Nothing
   is an image asset, so every one of them scales to any DPR and re-colours
   from the brand palette for free.

   The read the whole game depends on: gold = go get it, grey-with-red-cracks
   = get out from under it. Nothing else on screen is allowed either colour. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { palette } from "./constants.js";

function hash(i) {
  const x = Math.sin(i * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* ─────────────────────────────  the miner  ───────────────────────────── */

/**
 * Drawn with the origin at the miner's feet, facing right.
 * @param {object} o {w, h, t, run, hopK, squash, hurt, invuln}
 *   `hopK` 0..1 is how far off the floor he is (legs tuck), `squash` is the
 *   landing compression, `run` is the stride clock.
 */
export function drawMiner(ctx, s, o) {
  const { w: W, h: H, t, run, hopK = 0, squash = 0, hurt = false, invuln = false } = o;

  const legLen = H * 0.24, torsoH = H * 0.38, headR = H * 0.19;
  const body = hurt ? palette.danger : palette.miner;
  const stride = Math.sin(run * 13);
  const bob = Math.abs(Math.sin(run * 13)) * H * 0.03 * (1 - hopK);

  /* ── contact shadow: shrinks and fades as he leaves the floor, which is
     most of what makes a hop read as height rather than as a slide up ── */
  ctx.save();
  ctx.globalAlpha = 0.38 * (1 - hopK * 0.75);
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(0, 2 * s, W * 0.62 * (1 - hopK * 0.3), 3.6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (invuln) ctx.globalAlpha = 0.45 + Math.sin(t * 22) * 0.35;
  /* squash on landing, stretch mid-flight — applied about the feet so he
     never sinks through the floor while compressed */
  const sy = 1 - squash * 0.22 + hopK * 0.07;
  const sx = 1 + squash * 0.2 - hopK * 0.05;
  ctx.transform(sx, 0, 0, sy, 0, -bob);

  /* legs: a scissor stride while grounded, tucked under him while airborne */
  ctx.strokeStyle = body;
  ctx.lineWidth = W * 0.26;
  ctx.lineCap = "round";
  for (const dir of [-1, 1]) {
    const swing = stride * dir * (1 - hopK) * 0.9 + hopK * 0.55 * dir;
    ctx.beginPath();
    ctx.moveTo(0, -legLen);
    ctx.lineTo(swing * W * 0.55, -legLen * hopK * 0.55);
    ctx.stroke();
  }

  /* torso — leaning into the run */
  ctx.save();
  ctx.rotate(-0.08);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-W / 2, -legLen - torsoH, W, torsoH, W * 0.36);
  ctx.fill();
  /* satchel: the one dark shape on him, so the silhouette isn't a blank pill */
  ctx.fillStyle = palette.minerInk;
  ctx.beginPath();
  ctx.roundRect(-W * 0.52, -legLen - torsoH * 0.62, W * 0.42, torsoH * 0.44, W * 0.16);
  ctx.fill();
  ctx.restore();

  /* pickaxe over the shoulder. Drawn after the torso, not behind it: on a
     dark tunnel wall a silhouette-coloured tool behind a silhouette-coloured
     body is invisible, and the pick is what says "miner" at a glance. */
  ctx.save();
  ctx.translate(-W * 0.55, -legLen - torsoH * 0.95);
  ctx.rotate(-0.72 + Math.sin(run * 13) * 0.09);
  ctx.strokeStyle = palette.pick;
  ctx.lineWidth = 3.4 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-H * 0.16, H * 0.2);
  ctx.lineTo(H * 0.22, -H * 0.2);
  ctx.stroke();
  ctx.strokeStyle = palette.rail;
  ctx.lineWidth = 4.6 * s;
  ctx.beginPath();
  ctx.arc(H * 0.24, -H * 0.24, H * 0.13, Math.PI * 0.8, Math.PI * 1.8);
  ctx.stroke();
  ctx.restore();

  /* head + helmet */
  const hy = -legLen - torsoH - headR * 0.82;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(W * 0.06, hy, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.gold;
  ctx.beginPath();
  ctx.arc(W * 0.06, hy - headR * 0.12, headR * 1.06, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();      // brim, pointing the way he's running
  ctx.roundRect(W * 0.06 - headR * 0.3, hy - headR * 0.22, headR * 1.75, headR * 0.42, headR * 0.2);
  ctx.fill();

  /* helmet lamp — the game's signature motif in miniature */
  ctx.fillStyle = palette.goldHot;
  ctx.beginPath();
  ctx.arc(W * 0.06 + headR * 0.72, hy - headR * 0.42, headR * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * The lamp beam: a soft amber wedge thrown forward from the helmet. Drawn in
 * world space (not in the miner's transform) so a hop sweeps it across the
 * tunnel instead of dragging it rigidly along.
 */
export function drawLampCone(ctx, s, x, y, len, t) {
  const flick = 0.86 + Math.sin(t * 9) * 0.07 + Math.sin(t * 23) * 0.05;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  const gr = ctx.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, withAlpha(palette.goldHot, 0.3 * flick));
  gr.addColorStop(0.35, withAlpha(palette.gold, 0.1 * flick));
  gr.addColorStop(1, withAlpha(palette.gold, 0));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, -len * 0.26);
  ctx.lineTo(len, len * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ─────────────────────────────  the nugget  ──────────────────────────── */

/** Faceted gold chunk with a halo and a travelling glint. */
export function drawNugget(ctx, s, r, t, phase) {
  const pulse = 1 + Math.sin(t * 3.4 + phase) * 0.07;
  const rr = r * pulse;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 3.4);
  gr.addColorStop(0, withAlpha(palette.gold, 0.5));
  gr.addColorStop(0.4, withAlpha(palette.gold, 0.14));
  gr.addColorStop(1, withAlpha(palette.gold, 0));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, rr * 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* the lump: a 7-gon with per-vertex jitter fixed by `phase`, so each nugget
     on screen is visibly its own rock rather than a clone */
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const k = 0.78 + hash(i + phase * 31) * 0.42;
    pts.push([Math.cos(a) * rr * k, Math.sin(a) * rr * k * 0.92]);
  }
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };

  const body = ctx.createLinearGradient(-rr, -rr, rr, rr);
  body.addColorStop(0, palette.goldHot);
  body.addColorStop(0.45, palette.gold);
  body.addColorStop(1, "#C97A0C");
  ctx.fillStyle = body;
  trace();
  ctx.fill();

  /* top facet — a flat highlight is what makes it metal instead of fruit */
  ctx.fillStyle = withAlpha(palette.goldHot, 0.85);
  ctx.beginPath();
  ctx.moveTo(pts[6][0], pts[6][1]);
  ctx.lineTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0] * 0.42, pts[1][1] * 0.42);
  ctx.closePath();
  ctx.fill();

  /* glint: a four-point star that crosses the face on its own cycle */
  const gk = (Math.sin(t * 2.2 + phase * 3) + 1) / 2;
  const twinkle = Math.max(0, Math.sin(t * 4.5 + phase * 5));
  if (twinkle > 0.05) {
    const gx = (gk - 0.5) * rr * 0.9, gy = -rr * 0.25;
    const len = rr * (0.5 + twinkle * 0.55);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = withAlpha("#FFFFFF", 0.75 * twinkle);
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(gx - len, gy); ctx.lineTo(gx + len, gy);
    ctx.moveTo(gx, gy - len); ctx.lineTo(gx, gy + len);
    ctx.stroke();
    ctx.restore();
  }
}

/* ─────────────────────────────  the boulder  ─────────────────────────── */

/**
 * @param {object} o {r, seed, rumble, landed, t}
 *   `rumble` 0..1 drives the tremble and how hot the cracks glow — it's the
 *   only warning the player gets that this one is about to come down.
 */
export function drawBoulder(ctx, s, o) {
  const { r, seed, rumble = 0, landed = false, t } = o;

  ctx.save();
  if (rumble > 0 && !landed) {
    const k = rumble * 2.4 * s;
    ctx.translate(Math.sin(t * 46 + seed) * k, Math.sin(t * 39 + seed * 2) * k);
  }
  if (landed) ctx.scale(1.06, 0.94);

  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const k = 0.8 + hash(i + seed * 17) * 0.34;
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();

  const gr = ctx.createLinearGradient(-r, -r, r * 0.6, r);
  gr.addColorStop(0, palette.boulderLit);
  gr.addColorStop(0.55, palette.boulder);
  gr.addColorStop(1, "#241F30");
  ctx.fillStyle = gr;
  ctx.fill();

  /* rim light along the top edge, so the mass reads against a dark tunnel */
  ctx.strokeStyle = withAlpha(palette.miner, 0.16);
  ctx.lineWidth = 1.6 * s;
  ctx.stroke();

  /* cracks: dark at rest, glowing coral as it's about to go — the tell is
     colour, not motion, because motion is easy to miss at speed */
  const heat = landed ? 0.5 : rumble;
  ctx.strokeStyle = heat > 0.05
    ? withAlpha(palette.danger, 0.35 + heat * 0.6)
    : withAlpha("#0B0A0F", 0.55);
  ctx.lineWidth = (1.4 + heat * 1.3) * s;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a0 = hash(i + seed * 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * r * 0.15, Math.sin(a0) * r * 0.15);
    ctx.lineTo(Math.cos(a0 + 0.5) * r * 0.62, Math.sin(a0 + 0.5) * r * 0.62);
    ctx.lineTo(Math.cos(a0 + 0.2) * r * 0.95, Math.sin(a0 + 0.2) * r * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The kill zone: a pulsing coral pool on the floor directly under a hanging
 * boulder. This is the "casella" the player must not be standing in — the
 * boulder says *which lane*, this says *exactly where*.
 */
export function drawCrushZone(ctx, s, halfW, k, t) {
  const pulse = 0.5 + Math.sin(t * 8) * 0.5;
  const a = k * (0.22 + pulse * 0.3);
  ctx.save();

  /* the marked cell, as a soft pool rather than a box — a hard-edged rectangle
     of colour reads as UI pasted over the tunnel, and this has to look like
     light falling on rock */
  ctx.save();
  ctx.scale(1, 0.62);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, halfW * 1.9);
  gr.addColorStop(0, withAlpha(palette.danger, a * 0.75));
  gr.addColorStop(0.55, withAlpha(palette.danger, a * 0.28));
  gr.addColorStop(1, withAlpha(palette.danger, 0));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, halfW * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = withAlpha(palette.danger, a);
  ctx.beginPath();
  ctx.ellipse(0, 0, halfW, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  /* two chevrons pointing down at the spot — the same "watch out below"
     grammar as a hazard stripe, without a texture */
  ctx.strokeStyle = withAlpha(palette.danger, a * 1.5);
  ctx.lineWidth = 2 * s;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const y = -14 * s - i * 9 * s - pulse * 3 * s;
    ctx.beginPath();
    ctx.moveTo(-halfW * 0.45, y - 5 * s);
    ctx.lineTo(0, y);
    ctx.lineTo(halfW * 0.45, y - 5 * s);
    ctx.stroke();
  }
  ctx.restore();
}
