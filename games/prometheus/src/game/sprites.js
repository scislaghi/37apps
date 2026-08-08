/* ══ Prometheus — canvas sprites ══
   Every actor is drawn from paths: crisp at any DPR, nothing to ship, and
   free to react per frame. Each function expects the context already
   translated to the actor's anchor. */

import { withAlpha, rng } from "@37apps/core/canvas/color.js";
import { drawFlame, drawGlow } from "@37apps/core/canvas/flame.js";
import { palette } from "./constants.js";

/* ───────────────────────────  the mountain  ─────────────────────────── */

/**
 * The cliff face. Built once as a set of world-space features and drawn with
 * modulo wrapping, so the wall is endless without allocating per frame. The
 * silhouette edges wander, which is what stops it reading as a brown rectangle
 * with sky either side.
 */
export function createWall(seed = 771) {
  const r = rng(seed);
  return {
    /* edge wobble is a sum of two sines per side — cheap, and never repeats
       on a period the eye can catch */
    edge: [
      { a1: 0.018 + r() * 0.02, f1: 0.004 + r() * 0.003, a2: 0.01 + r() * 0.012, f2: 0.011 + r() * 0.006, ph: r() * 9 },
      { a1: 0.018 + r() * 0.02, f1: 0.004 + r() * 0.003, a2: 0.01 + r() * 0.012, f2: 0.011 + r() * 0.006, ph: r() * 9 },
    ],
    blotches: Array.from({ length: 52 }, () => ({
      x: r(), y: r() * 2400, rx: 10 + r() * 26, ry: 6 + r() * 15, rot: r() * 3, dark: r() > 0.45,
    })),
    cracks: Array.from({ length: 22 }, () => ({
      x: r(), y: r() * 2400, len: 30 + r() * 90, lean: (r() - 0.5) * 1.2, seed: r() * 100,
    })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

/** World-x of the rock edge at a given world-y. Shared by draw and layout. */
export function wallEdge(wall, w, worldY, side, base) {
  const e = wall.edge[side < 0 ? 0 : 1];
  const wob = Math.sin(worldY * e.f1 + e.ph) * e.a1 + Math.sin(worldY * e.f2 + e.ph * 2.1) * e.a2;
  return w * (base + (side < 0 ? wob : -wob));
}

export function drawWall(ctx, w, h, wall, camY, s) {
  const STEP = 26;
  const L = 0.05, R = 0.95;

  ctx.beginPath();
  ctx.moveTo(0, h + 4);
  for (let y = h + STEP; y >= -STEP; y -= STEP) {
    ctx.lineTo(wallEdge(wall, w, y + camY, -1, L), y);
  }
  for (let y = -STEP; y <= h + STEP; y += STEP) {
    ctx.lineTo(wallEdge(wall, w, y + camY, 1, R), y);
  }
  ctx.lineTo(w, h + 4);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, palette.rockDark);
  g.addColorStop(0.34, palette.rock);
  g.addColorStop(0.62, palette.rockLit);
  g.addColorStop(1, palette.rockDark);
  ctx.fillStyle = g;
  ctx.fill();

  /* texture is clipped to the silhouette, so blotches never bleed into sky */
  ctx.save();
  ctx.clip();
  for (const b of wall.blotches) {
    const y = wrap(b.y - camY, 2400);
    if (y < -80 || y > h + 80) continue;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = b.dark ? palette.rockDark : palette.rockLit;
    ctx.beginPath();
    ctx.ellipse(b.x * w, y, b.rx * s, b.ry * s, b.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = palette.rockEdge;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = "round";
  for (const c of wall.cracks) {
    const y = wrap(c.y - camY, 2400);
    if (y < -140 || y > h + 140) continue;
    ctx.beginPath();
    ctx.moveTo(c.x * w, y);
    for (let i = 1; i <= 4; i++) {
      const k = i / 4;
      ctx.lineTo(c.x * w + Math.sin(c.seed + i * 2.3) * 12 * s + c.lean * c.len * k * s, y + c.len * k * s);
    }
    ctx.stroke();
  }
  ctx.restore();

  /* a dark rim down both edges reads as the wall turning away from us */
  ctx.save();
  ctx.strokeStyle = palette.rockEdge;
  ctx.lineWidth = 3 * s;
  for (const [side, base] of [[-1, L], [1, R]]) {
    ctx.beginPath();
    for (let y = -STEP; y <= h + STEP; y += STEP) {
      const x = wallEdge(wall, w, y + camY, side, base);
      if (y === -STEP) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ────────────────────────────  platforms  ──────────────────────────── */

/** A rock shelf jutting out of the wall — the solid, permanent footing. */
export function drawLedge(ctx, s, hw, alpha = 1) {
  ctx.globalAlpha = alpha;
  const hh = 9 * s;
  /* cast shadow: without it the shelf reads as painted on the wall rather
     than jutting out of it, and the footing stops being obvious at a glance */
  ctx.fillStyle = "rgba(58,30,11,0.4)";
  ctx.beginPath();
  ctx.moveTo(-hw + 4 * s, hh - 1 * s);
  ctx.lineTo(hw - 4 * s, hh - 1 * s);
  ctx.lineTo(hw - 11 * s, hh + 9 * s);
  ctx.lineTo(-hw + 11 * s, hh + 9 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-hw, -hh);
  ctx.lineTo(hw, -hh);
  ctx.lineTo(hw - 6 * s, hh);
  ctx.lineTo(-hw + 6 * s, hh);
  ctx.closePath();
  ctx.fillStyle = palette.rockDark;
  ctx.fill();
  /* lit top face: the surface you actually stand on has to be the brightest
     thing about the shelf or the footing is ambiguous */
  ctx.beginPath();
  ctx.moveTo(-hw, -hh);
  ctx.lineTo(hw, -hh);
  ctx.lineTo(hw - 3 * s, -hh + 5 * s);
  ctx.lineTo(-hw + 3 * s, -hh + 5 * s);
  ctx.closePath();
  ctx.fillStyle = "#E0A05E";
  ctx.fill();
  ctx.strokeStyle = palette.rockEdge;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh);
  ctx.lineTo(hw, -hh);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A white cloud — landable, but it crumbles shortly after you touch it. */
export function drawCloud(ctx, s, hw, alpha = 1, crumble = 0) {
  ctx.globalAlpha = alpha;
  const lobes = [[-0.72, 0.1, 0.5], [-0.28, -0.22, 0.72], [0.18, -0.12, 0.66], [0.66, 0.12, 0.46]];
  const sag = crumble * 5 * s;
  const disc = (dy, k, fill) => {
    ctx.fillStyle = fill;
    for (const [lx, ly, lr] of lobes) {
      ctx.beginPath();
      ctx.arc(lx * hw, ly * 15 * s + dy + sag, lr * 17 * s * (1 - crumble * 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  disc(3 * s, 1, palette.cloudShade);
  disc(0, 1, palette.cloud);
  ctx.globalAlpha = 1;
}

/**
 * A storm cloud — looks like footing, isn't. It has to be unmistakable at a
 * glance (near-black, a live crackle) because falling through something you
 * read as solid is the least fair death a hopper can serve.
 */
export function drawStorm(ctx, s, hw, t, phase) {
  const lobes = [[-0.72, 0.1, 0.5], [-0.28, -0.22, 0.72], [0.18, -0.12, 0.66], [0.66, 0.12, 0.46]];
  const disc = (dy, k, fill) => {
    ctx.fillStyle = fill;
    for (const [lx, ly, lr] of lobes) {
      ctx.beginPath();
      ctx.arc(lx * hw, ly * 15 * s + dy, lr * 17 * s * k, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  disc(-2 * s, 1.06, "rgba(190,182,214,0.5)");
  disc(0, 1, palette.storm);
  disc(5 * s, 0.8, palette.stormDark);

  const flash = Math.max(0, Math.sin(t * 3 + phase) - 0.75) * 5;
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash);
    ctx.strokeStyle = "#F2ECFF";
    ctx.lineWidth = 2.2 * s;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-hw * 0.2, -8 * s);
    ctx.lineTo(0, 2 * s);
    ctx.lineTo(-hw * 0.12, 4 * s);
    ctx.lineTo(hw * 0.2, 16 * s);
    ctx.stroke();
    ctx.restore();
  }
}

/* ──────────────────────────────  hazards  ────────────────────────────── */

/**
 * The eagle from the myth, seen from the side here rather than from above —
 * it crosses the wall in profile, so the wings beat up and down through the
 * body line and the silhouette stays a bird at 30px.
 */
export function drawBird(ctx, s, t, dir, phase) {
  ctx.save();
  ctx.scale(dir * 1.2, 1.2);
  const beat = Math.sin(t * 9 + phase);

  /* far wing behind the body, near wing in front — the offset is what gives a
     side-on bird any depth at all */
  const wing = (lift, fill) => {
    ctx.beginPath();
    ctx.moveTo(-2 * s, -1 * s);
    ctx.quadraticCurveTo(-10 * s, -6 * s + lift, -18 * s, -2 * s + lift * 1.4);
    ctx.quadraticCurveTo(-11 * s, 2 * s + lift * 0.9, -2 * s, 4 * s);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  wing(beat * 13 * s, "#2E252C");

  ctx.beginPath();
  ctx.ellipse(0, 0, 12 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3B2F36";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8 * s, -2 * s);
  ctx.lineTo(-20 * s, -5 * s);
  ctx.lineTo(-18 * s, 3 * s);
  ctx.closePath();
  ctx.fillStyle = "#4E4048";
  ctx.fill();

  wing(-beat * 15 * s, "#5A4854");

  ctx.beginPath();
  ctx.arc(9 * s, -3 * s, 5.4 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#EFEAE0";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13 * s, -5 * s);
  ctx.quadraticCurveTo(21 * s, -3 * s, 13 * s, -0.6 * s);
  ctx.closePath();
  ctx.fillStyle = palette.flame;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10.5 * s, -4.6 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.restore();
}

/** A boulder shaken loose above you, tumbling down one column. */
export function drawFallRock(ctx, s, r, pts, spin) {
  ctx.save();
  ctx.rotate(spin);
  const trace = () => {
    ctx.beginPath();
    pts.forEach(([a, k], i) => {
      const x = Math.cos(a) * r * k * s, y = Math.sin(a) * r * k * s;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  trace();
  ctx.fillStyle = "#8A5730";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-r * 1.5 * s, -r * 1.5 * s);
  ctx.lineTo(r * 0.5 * s, -r * 1.5 * s);
  ctx.lineTo(-r * 1.5 * s, r * 0.5 * s);
  ctx.closePath();
  ctx.fillStyle = palette.rockLit;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 1.5 * s, r * 1.5 * s);
  ctx.lineTo(-r * 0.3 * s, r * 1.5 * s);
  ctx.lineTo(r * 1.5 * s, -r * 0.4 * s);
  ctx.closePath();
  ctx.fillStyle = palette.rockEdge;
  ctx.fill();
  ctx.restore();
  trace();
  ctx.strokeStyle = "#3A1E0B";
  ctx.lineWidth = 2 * s;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

/** The telegraph for an incoming rock: a pulsing chevron over its column. */
export function drawRockWarn(ctx, s, x, y, p) {
  const pulse = 0.3 + Math.abs(Math.sin(p * Math.PI * 4)) * 0.6;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(x, y + 14 * s);
  ctx.lineTo(x - 11 * s, y - 4 * s);
  ctx.lineTo(x + 11 * s, y - 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ───────────────────────────  the collectible  ─────────────────────── */

export function drawEmber(ctx, s, t, phase) {
  const pulse = 1 + Math.sin(t * 6 + phase) * 0.12;
  const r = 6 * s * pulse;
  drawGlow(ctx, 0, 0, r * 4, palette.flame, 0.75);
  ctx.fillStyle = palette.flameHot;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.rotate(t * 1.6 + phase);
  ctx.fillStyle = withAlpha(palette.flameHot, 0.9);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    ctx.lineTo(Math.cos(a) * r * 2.4, Math.sin(a) * r * 2.4);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.5, Math.sin(a + Math.PI / 4) * r * 0.5);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ───────────────────────  the milestone signpost  ─────────────────── */

/** Bolted to the wall every so many rows — the reference art's "Olimpo" sign. */
export function drawSign(ctx, s, metres) {
  ctx.save();
  ctx.rotate(-0.08);
  const w = 74 * s, h = 26 * s;
  ctx.fillStyle = "#8A5A32";
  ctx.fillRect(-2 * s, 0, 4 * s, 26 * s);
  ctx.fillStyle = "#E8D9BE";
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h, w, h, 4 * s);
  ctx.fill();
  ctx.strokeStyle = "#8A5A32";
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.fillStyle = "#5A3A22";
  ctx.font = `800 ${11 * s}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("OLYMPUS", 0, -h + 12 * s);
  ctx.font = `700 ${9 * s}px system-ui, sans-serif`;
  ctx.fillText(`${metres} m`, 0, -h + 22 * s);
  ctx.restore();
}

/* ────────────────────────────  Prometheus  ──────────────────────────── */

/**
 * Side-on this time, not the back view of a flyer: he's climbing a wall, so
 * we read his stance. `squash` (-1..1) compresses him on landing and stretches
 * him at the top of a hop — the single cheapest thing that makes a jump feel
 * like it has weight.
 */
export function drawPrometheus(ctx, s, t, facing, squash, blaze, invuln) {
  ctx.save();
  ctx.scale(facing, 1);
  ctx.scale(1 - squash * 0.22, 1 + squash * 0.26);

  const cloak = blaze > 0 ? palette.blaze : palette.accent;
  const cloakDark = blaze > 0 ? "#E08A0F" : "#C42A14";

  if (blaze > 0) drawGlow(ctx, 0, -6 * s, 42 * s, palette.flame, 0.5);

  /* cloak: a single sheet streaming back and down, its hem riding a wave */
  const wave = Math.sin(t * 6);
  ctx.beginPath();
  ctx.moveTo(-3 * s, -20 * s);
  ctx.quadraticCurveTo(-18 * s, -14 * s, -22 * s + wave * 2 * s, 4 * s);
  ctx.quadraticCurveTo(-16 * s, 2 * s + wave * 3 * s, -12 * s, 10 * s);
  ctx.quadraticCurveTo(-8 * s, 4 * s - wave * 2 * s, -2 * s, 8 * s);
  ctx.closePath();
  ctx.fillStyle = cloak;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-3 * s, -20 * s);
  ctx.quadraticCurveTo(-14 * s, -10 * s, -12 * s, 10 * s);
  ctx.quadraticCurveTo(-8 * s, 4 * s, -2 * s, 8 * s);
  ctx.closePath();
  ctx.fillStyle = withAlpha(cloakDark, 0.7);
  ctx.fill();

  /* legs: tuck up on the way through a hop, plant on landing */
  const tuck = Math.max(0, -squash) * 5 * s;
  ctx.fillStyle = palette.ink;
  for (const dx of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.roundRect(dx * s - 2.6 * s, 6 * s, 5.2 * s, 12 * s - tuck, 2 * s);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.roundRect(-7 * s, -9 * s, 14 * s, 16 * s, 3 * s);
  ctx.fillStyle = "#241F2B";
  ctx.fill();
  ctx.fillStyle = palette.skinShade;
  ctx.fillRect(-7 * s, 1 * s, 14 * s, 2.6 * s);

  /* arms: the torch arm stays up, the free arm counterbalances the hop */
  ctx.strokeStyle = palette.skin;
  ctx.lineWidth = 4.6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4 * s, -6 * s);
  ctx.quadraticCurveTo(-12 * s, -2 * s + squash * 6 * s, -14 * s, 4 * s + squash * 8 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4 * s, -6 * s);
  ctx.quadraticCurveTo(12 * s, -14 * s, 13 * s, -23 * s);
  ctx.stroke();

  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(1 * s, -15 * s, 6.6 * s, 0, Math.PI * 2);
  ctx.fill();
  /* hair as a cap plus a lock trailing behind, so bronze still reads */
  ctx.beginPath();
  ctx.arc(1 * s, -16.4 * s, 6.7 * s, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(-5 * s, -12 * s, -6.5 * s, -8 * s);
  ctx.quadraticCurveTo(-3 * s, -13 * s, -5.6 * s, -15 * s);
  ctx.closePath();
  ctx.fillStyle = palette.ink;
  ctx.fill();

  ctx.strokeStyle = "#5A3A22";
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(13 * s, -21 * s);
  ctx.lineTo(15 * s, -31 * s);
  ctx.stroke();
  const torchH = (16 + Math.sin(t * 15) * 3) * s * (blaze > 0 ? 1.6 : 1);
  drawFlame(ctx, 15.3 * s, -31 * s, 11 * s * (blaze > 0 ? 1.3 : 1), torchH, t, 1.1);

  if (invuln) {
    ctx.beginPath();
    ctx.arc(0, -6 * s, 28 * s, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(palette.flameHot, 0.35 + Math.sin(t * 18) * 0.25);
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();
  }
  ctx.restore();
}
