/* ══ Skid — the ink vocabulary ══
   Everything in the world except the ball is one colour: ink on cream. Shapes
   carry all the meaning, so each one is built to be identifiable from its
   silhouette alone at a glance — a flat slab, a sawtooth run, a hanging
   sawtooth, a toothed disc. The ball is the only saturated thing on screen. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { palette, STROKE, SPIKE_H, SAW_R, ORB_R } from "./constants.js";

const TAU = Math.PI * 2;

/* ────────────────────────────  terrain  ──────────────────────────── */

/**
 * One slab. Drawn as a round-capped stroke with a soft drop shadow offset
 * *down* the shaft — the light in this world comes from the surface you fell
 * in through, so every slab casts into the dark it's falling away from.
 */
export function drawSlab(ctx, s, a, b, ink) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.save();
  ctx.translate(0, 3 * s);
  ctx.strokeStyle = withAlpha(ink, 0.12);
  ctx.lineWidth = STROKE * 2 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = ink;
  ctx.lineWidth = STROKE * 2 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  /* a hairline of the field colour along the top edge — keeps two slabs that
     cross at a shallow angle from fusing into one black mass */
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.13);
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * Sawtooth teeth along a stretch of a slab. `pulse` (0..1) swells them as the
 * ball closes in, which is the telegraph: in a monochrome world the warning
 * has to come from motion, not from turning the hazard red.
 */
export function drawTeeth(ctx, s, a, b, t0, t1, side, ink, pulse = 0) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  /* normal on the requested face: side -1 is the walkable top, +1 the underside */
  let nx = uy, ny = -ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  if (side > 0) { nx = -nx; ny = -ny; }

  const h = SPIKE_H * s * (1 + pulse * 0.22);
  const from = t0 * len, to = t1 * len;
  const span = to - from;
  const teeth = Math.max(2, Math.round(span / (18 * s)));
  const w = span / teeth;

  ctx.fillStyle = ink;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const s0 = from + i * w, s1 = s0 + w;
    const base = STROKE * 0.6 * s;
    ctx.moveTo(a.x + ux * s0 + nx * base, a.y + uy * s0 + ny * base);
    ctx.lineTo(a.x + ux * (s0 + w / 2) + nx * h, a.y + uy * (s0 + w / 2) + ny * h);
    ctx.lineTo(a.x + ux * s1 + nx * base, a.y + uy * s1 + ny * base);
    ctx.closePath();
  }
  ctx.fill();

  /* tip glints — a 1px light edge on the leading face of each tooth, so a
     dense row still reads as individual points rather than a black comb */
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.22);
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const s0 = from + i * w;
    ctx.moveTo(a.x + ux * s0, a.y + uy * s0);
    ctx.lineTo(a.x + ux * (s0 + w / 2) + nx * h, a.y + uy * (s0 + w / 2) + ny * h);
  }
  ctx.stroke();
}

/** Toothed disc patrolling a slab. */
export function drawSaw(ctx, s, x, y, spin, ink) {
  const r = SAW_R * s;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = withAlpha(ink, 0.14);
  ctx.beginPath();
  ctx.arc(0, 3 * s, r * 1.05, 0, TAU);
  ctx.fill();

  ctx.rotate(spin);
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * TAU, a1 = ((i + 0.5) / 9) * TAU, a2 = ((i + 1) / 9) * TAU;
    ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    ctx.lineTo(Math.cos(a2) * r * 0.78, Math.sin(a2) * r * 0.78);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.bg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────────  pickups  ──────────────────────────── */

export function drawOrb(ctx, s, t, phase) {
  const r = ORB_R * s;
  const k = 1 + Math.sin(t * 3 + phase) * 0.09;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = withAlpha(palette.blaze, 0.2);
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1 * k, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = palette.blaze;
  ctx.beginPath();
  ctx.arc(0, 0, r * k, 0, TAU);
  ctx.fill();

  ctx.fillStyle = withAlpha("#FFFFFF", 0.75);
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.3, r * 0.3, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = withAlpha(palette.blaze, 0.55);
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.arc(0, 0, r * (1.75 + Math.sin(t * 3 + phase) * 0.2), 0, TAU);
  ctx.stroke();
}

/* ────────────────────────────  the ball  ──────────────────────────── */

/**
 * The skid: every contact point the ball has left behind, drawn as one
 * tapering stroke that dissolves toward its tail. This is the game's
 * signature motif — the run writes itself onto the shaft behind you.
 */
export function drawSkid(ctx, marks, s, blazing) {
  if (marks.length < 2) return;
  const col = blazing ? palette.blaze : palette.ball;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < marks.length; i++) {
    const p = marks[i - 1], q = marks[i];
    if (q.brk) continue;
    const k = i / marks.length;
    ctx.strokeStyle = withAlpha(col, 0.05 + k * 0.4);
    ctx.lineWidth = (1.5 + k * 4) * s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {number} squash 1 = round, >1 = flattened along the ground normal
 * @param {{x:number,y:number}} n normal to squash against
 */
export function drawBall(ctx, s, r, spin, squash, n, blazing, invuln, t) {
  const col = blazing ? palette.blaze : palette.ball;
  const hot = blazing ? palette.blazeHot : palette.ballHot;
  const ang = Math.atan2(n.y, n.x) + Math.PI / 2;

  ctx.save();

  /* contact shadow, pinned under the ball along the surface normal */
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = withAlpha(palette.ink, 0.1);
  ctx.beginPath();
  ctx.ellipse(-n.x * r * 0.5, -n.y * r * 0.5 + 2 * s, r * 1.15, r * 0.9, ang, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  /* aura — wide and soft, the only bloom in a flat world, so the ball always
     wins the eye no matter what terrain it's sitting on */
  const glowR = r * (blazing ? 3.4 : 2.3);
  const rg = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, glowR);
  rg.addColorStop(0, withAlpha(col, blazing ? 0.5 : 0.3));
  rg.addColorStop(1, withAlpha(col, 0));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, TAU);
  ctx.fill();

  ctx.rotate(ang);
  ctx.scale(1 / squash, squash);
  ctx.rotate(-ang);

  const body = ctx.createRadialGradient(-r * 0.32, -r * 0.34, r * 0.15, 0, 0, r);
  body.addColorStop(0, hot);
  body.addColorStop(1, col);
  ctx.fillStyle = body;
  ctx.globalAlpha = invuln ? 0.55 + Math.sin(t * 26) * 0.35 : 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  /* the spin marker: without it a perfect circle rolling down a slope is
     indistinguishable from a circle sliding down it */
  ctx.rotate(spin);
  ctx.fillStyle = withAlpha("#FFFFFF", 0.9);
  ctx.beginPath();
  ctx.arc(0, -r * 0.46, r * 0.24, 0, TAU);
  ctx.fill();
  ctx.fillStyle = withAlpha(palette.ink, 0.16);
  ctx.beginPath();
  ctx.arc(0, r * 0.46, r * 0.16, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/** Ring that snaps outward at the moment of a jump. */
export function drawPop(ctx, s, x, y, k, blazing) {
  const col = blazing ? palette.blaze : palette.ball;
  ctx.save();
  ctx.strokeStyle = withAlpha(col, (1 - k) * 0.55);
  ctx.lineWidth = (3.5 - k * 2.5) * s;
  ctx.beginPath();
  ctx.arc(x, y, (8 + k * 34) * s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
