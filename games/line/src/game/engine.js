/* ══ Line — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas. */

import { clamp } from "@37apps/core/canvas/color.js";
import { createParticles, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette,
  PX_PER_METRE, HEAD_Y_RATIO, HEAD_R, TRAIL_SAMPLE, TRAIL_MAX,
  STEER_STIFFNESS, STEER_DAMPING, DRAG_GAIN, KEY_STEER_SPEED,
  MIN_CORRIDOR, UNLOCK,
  ORB_PICKUP_R, ORB_FILL, ORB_POINTS, CUT_POINTS,
  SURGE_TIME, SURGE_SPEED_MULT, SURGE_SCORE_MULT, REVIVE_GRACE,
  scaleFor, speedFor, spawnGapFor,
} from "./constants.js";
import { createField, drawField, fieldAt } from "./backdrop.js";
import { drawTrail, drawHead, drawBar, drawArc, drawBlade, drawGate, drawOrb } from "./sprites.js";

let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

export function createGame({ onOrb, onSurge, onCut, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false,

    scroll: 0, metres: 0, score: 0, zoneIndex: -1,
    px: 195, pvx: 0, targetX: 195, keyDir: 0,

    trail: [],          // world-space points, scrolled down each frame
    sinceSample: 0,

    charge: 0, surge: 0, invuln: 0,
    hazards: [], orbs: [],
    parts: createParticles(),
    nextSpawnAt: 0,
    field: createField(),
    shake: 0,

    onOrb, onSurge, onCut, onDeath, onZone,
  };

  g.resize = (w, h) => {
    const k = w / (g.w || w);
    g.w = w; g.h = h; g.s = scaleFor(w);
    g.px *= k; g.targetX *= k;
    for (const p of g.trail) p.x *= k;
  };

  g.reset = () => {
    g.t = 0;
    g.scroll = 0; g.metres = 0; g.score = 0; g.zoneIndex = -1;
    g.px = g.w / 2; g.targetX = g.w / 2; g.pvx = 0; g.keyDir = 0;
    g.trail = [{ x: g.w / 2, y: headY(g) }];
    g.sinceSample = 0;
    g.charge = 0; g.surge = 0; g.invuln = 1.1;
    g.hazards = []; g.orbs = [];
    g.parts = createParticles();
    g.nextSpawnAt = 500;
    g.shake = 0;
  };

  /** Rewarded-ad continue: clear the screen and hand back a grace window. */
  g.revive = () => {
    g.hazards = g.hazards.filter(o => o.y < -160 || o.y > g.h + 160);
    g.invuln = REVIVE_GRACE;
    g.pvx = 0;
    g.targetX = g.px;
    burst(g.parts, g.px, headY(g), palette.lineHot, 22, 260, 4, g.reduced ? 0.4 : 1);
  };

  let dragFrom = null;
  g.pointerDown = (x) => { dragFrom = { x, target: g.targetX }; };
  g.pointerMove = (x) => {
    if (!dragFrom) return;
    g.targetX = clamp(dragFrom.target + (x - dragFrom.x) * DRAG_GAIN, edge(g), g.w - edge(g));
  };
  g.pointerUp = () => { dragFrom = null; };
  g.setKeyDir = (d) => { g.keyDir = d; };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__line = g;
  return g;
}

const headY = (g) => g.h * HEAD_Y_RATIO;
const edge = (g) => 22 * g.s;

/* ── spawning ─────────────────────────────────────────────────────────── */

function makeHazard(g, kind, y) {
  const s = g.s;
  if (kind === "bar") {
    const hw = rand(40, 78) * s;
    return { id: uid++, kind, y, x: rand(hw + edge(g), g.w - hw - edge(g)), hw, hh: 7 * s, halfW: hw,
             drift: rand(-34, 34) };
  }
  if (kind === "arc") {
    const r = rand(74, 118) * s;
    const side = Math.random() > 0.5 ? 1 : -1;
    /* anchored just off the edge so the flat side of the half-disc is flush
       with the wall rather than floating a few px inside it */
    return { id: uid++, kind, y, x: side > 0 ? g.w + 2 : -2, r, side, spin: 0, spinV: rand(-0.25, 0.25),
             halfW: r, drift: 0 };
  }
  if (kind === "blade") {
    const len = rand(52, 84) * s;
    return { id: uid++, kind, y, x: rand(len + edge(g), g.w - len - edge(g)), len,
             spin: Math.random() * Math.PI, spinV: rand(0.9, 2.1) * (Math.random() > 0.5 ? 1 : -1),
             halfW: len, drift: 0 };
  }
  // gate — spans the full width, so its own gap *is* the corridor
  const gapW = rand(MIN_CORRIDOR + 16, MIN_CORRIDOR + 54) * s;
  return {
    id: uid++, kind, y, gapW, hh: 9 * s, halfW: 0, drift: 0,
    gapHome: rand(gapW / 2 + edge(g), g.w - gapW / 2 - edge(g)),
    gapRange: rand(0, 70) * s, gapPhase: Math.random() * Math.PI * 2, gapSpeed: rand(0.5, 1.3),
    gapX: 0,
  };
}

/** Live gap centre for a gate — the single source of truth for draw + hit. */
function gateGap(g, o) {
  return clamp(
    o.gapHome + Math.sin(g.t * o.gapSpeed + o.gapPhase) * o.gapRange,
    o.gapW / 2 + 6 * g.s, g.w - o.gapW / 2 - 6 * g.s
  );
}

function spanOf(g, o) {
  const pad = HEAD_R * g.s + 10 * g.s;
  if (o.kind === "arc") {
    return o.side > 0 ? [g.w - o.r - pad, g.w + pad] : [-pad, o.r + pad];
  }
  return [o.x - o.halfW - pad, o.x + o.halfW + pad];
}

function corridorSurvives(g, list) {
  const need = MIN_CORRIDOR * g.s;
  const spans = list.map(o => spanOf(g, o)).sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [a, b] of spans) {
    if (a - cursor >= need) return true;
    cursor = Math.max(cursor, b);
  }
  return g.w - cursor >= need;
}

function spawnWave(g) {
  const m = g.metres;
  const y = -70 * g.s;

  const pool = [];
  if (m >= UNLOCK.bar) pool.push("bar", "bar");
  if (m >= UNLOCK.arc) pool.push("arc", "arc");
  if (m >= UNLOCK.blade) pool.push("blade");
  if (m >= UNLOCK.gate && Math.random() < 0.3) pool.push("gate");

  const kind = pool[Math.floor(Math.random() * pool.length)];
  const first = makeHazard(g, kind, y);
  g.hazards.push(first);

  /* a gate already occupies the whole width by design — pairing anything with
     it is how you build a wall with no way through */
  if (first.kind !== "gate") {
    const wantSecond = m > 220 && Math.random() < Math.min(0.2 + m * 0.00022, 0.6);
    if (wantSecond) {
      const others = pool.filter(k => k !== "gate");
      const cand = makeHazard(g, others[Math.floor(Math.random() * others.length)], y - rand(24, 80) * g.s);
      if (cand.kind !== "gate" && corridorSurvives(g, [first, cand])) g.hazards.push(cand);
    }
  }

  /* orbs sit near the danger, not away from it — the meter is only worth
     chasing if collecting it costs you something */
  if (Math.random() < 0.5) {
    const anchor = first.kind === "arc" ? (first.side > 0 ? g.w - first.r : first.r) : first.x;
    const ox = clamp(anchor + rand(-1, 1) * rand(60, 150) * g.s, edge(g), g.w - edge(g));
    g.orbs.push({ id: uid++, x: ox, y: y - rand(40, 150) * g.s, phase: Math.random() * 9, drift: rand(-18, 18) });
  }
}

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;

  const speed = speedFor(g.metres) * (g.surge > 0 ? SURGE_SPEED_MULT : 1);
  const dy = speed * dt;
  g.scroll += dy;
  g.metres += dy / PX_PER_METRE;
  g.score += (dy / PX_PER_METRE) * (g.surge > 0 ? SURGE_SCORE_MULT : 1);

  const zi = fieldAt(g.metres).index;
  if (zi !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(fieldAt(g.metres).name);
    g.zoneIndex = zi;
  }

  /* steering: a spring-damper rather than direct follow, so the stroke curves
     into a turn instead of snapping — the trail is the whole point, and a
     trail made of right angles isn't worth drawing */
  if (g.keyDir) g.targetX = clamp(g.targetX + g.keyDir * KEY_STEER_SPEED * dt, edge(g), g.w - edge(g));
  g.pvx += ((g.targetX - g.px) * STEER_STIFFNESS - g.pvx * STEER_DAMPING) * dt;
  g.px += g.pvx * dt;
  if (g.px < edge(g)) { g.px = edge(g); g.pvx *= -0.25; }
  if (g.px > g.w - edge(g)) { g.px = g.w - edge(g); g.pvx *= -0.25; }

  if (g.invuln > 0) g.invuln -= dt;
  if (g.surge > 0) {
    g.surge -= dt;
    g.charge = Math.max(0, g.surge / SURGE_TIME);
    if (g.surge <= 0) { g.surge = 0; g.charge = 0; }
  }

  /* ── trail: scroll every recorded point down with the world, then record
     the head's current position at a fixed *spatial* interval so the stroke
     has the same density whatever the frame rate or the speed ── */
  for (const p of g.trail) p.y += dy;
  g.sinceSample += dy;
  if (g.sinceSample >= TRAIL_SAMPLE * g.s) {
    g.sinceSample = 0;
    g.trail.push({ x: g.px, y: headY(g) });
    if (g.trail.length > TRAIL_MAX) g.trail.shift();
  }
  /* the newest point tracks the head continuously so the stroke stays
     attached to the tip between samples */
  if (g.trail.length) {
    g.trail[g.trail.length - 1] = { x: g.px, y: headY(g) };
  }
  while (g.trail.length && g.trail[0].y > g.h + 60) g.trail.shift();

  /* ── spawn ── */
  g.nextSpawnAt -= dy;
  if (g.nextSpawnAt <= 0) {
    spawnWave(g);
    g.nextSpawnAt += spawnGapFor(g.metres) * g.s;
  }

  for (const o of g.hazards) {
    o.y += dy;
    if (o.drift) {
      o.x += o.drift * dt;
      if (o.x - o.halfW < edge(g) || o.x + o.halfW > g.w - edge(g)) o.drift *= -1;
    }
    if (o.spinV) o.spin += o.spinV * dt;
    if (o.kind === "gate") o.gapX = gateGap(g, o);
  }
  g.hazards = g.hazards.filter(o => o.y < g.h + 200 * g.s);

  for (const o of g.orbs) {
    o.y += dy;
    o.x += o.drift * dt;
    if (o.x < edge(g) || o.x > g.w - edge(g)) o.drift *= -1;
  }
  g.orbs = g.orbs.filter(o => o.y < g.h + 60);

  /* ── sparks shed off the tip; rate follows speed so faster looks faster ── */
  const hy = headY(g);
  stream(g.parts, dt, g.reduced ? 16 : 34 + (speed / 640) * 34, () => ({
    x: g.px + rand(-4, 4) * g.s, y: hy + rand(-4, 4) * g.s,
    vx: -g.pvx * 0.3 + rand(-26, 26), vy: rand(50, 150),
    life: rand(0.25, 0.6), r: rand(1.5, 3.2) * g.s,
    color: g.surge > 0 ? palette.lineHot : palette.line, kind: "spark",
  }));
  updateParticles(g.parts, dt);

  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.4);

  /* ── orbs first: clipping an orb and a hazard in the same frame should read
     as "I got it, then died", not swallow the pickup ── */
  const grab = (ORB_PICKUP_R + HEAD_R) * g.s;
  for (let i = g.orbs.length - 1; i >= 0; i--) {
    const o = g.orbs[i];
    if (Math.hypot(o.x - g.px, o.y - hy) > grab) continue;
    g.orbs.splice(i, 1);
    g.score += ORB_POINTS * (g.surge > 0 ? SURGE_SCORE_MULT : 1);
    burst(g.parts, o.x, o.y, palette.orb, 12, 190, 4, g.reduced ? 0.4 : 1);
    if (g.surge > 0) { g.onOrb?.(); continue; }
    g.charge = Math.min(1, g.charge + ORB_FILL);
    if (g.charge >= 1) {
      g.surge = SURGE_TIME;
      g.shake = 0.3;
      burst(g.parts, g.px, hy, palette.lineHot, 28, 320, 5, g.reduced ? 0.4 : 1);
      g.onSurge?.();
    } else {
      g.onOrb?.();
    }
  }

  /* ── contact ── */
  const hr = HEAD_R * g.s;

  if (g.surge > 0) {
    /* SURGE cuts straight through what it touches. Ghosting harmlessly past a
       hazard wastes the one moment in the run the player is meant to feel
       unstoppable. */
    for (let i = g.hazards.length - 1; i >= 0; i--) {
      const o = g.hazards[i];
      if (!hits(g, o, hr, hy)) continue;
      g.hazards.splice(i, 1);
      g.score += CUT_POINTS * SURGE_SCORE_MULT;
      burst(g.parts, o.kind === "arc" ? g.px : o.x, o.y, colorOf(o), 16, 260, 5, g.reduced ? 0.4 : 1);
      g.onCut?.();
    }
    return;
  }

  if (g.invuln > 0) return;
  for (const o of g.hazards) {
    if (hits(g, o, hr, hy)) return die(g, o);
  }
}

function colorOf(o) {
  return o.kind === "bar" ? palette.bar : o.kind === "arc" ? palette.arc
    : o.kind === "blade" ? palette.blade : palette.gate;
}

/** Distance from a point to a segment — the blade's whole collision test. */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hits(g, o, hr, hy) {
  if (o.kind === "bar") {
    const dx = Math.max(Math.abs(g.px - o.x) - o.hw, 0);
    const dy = Math.max(Math.abs(hy - o.y) - o.hh, 0);
    return dx * dx + dy * dy < hr * hr;
  }
  if (o.kind === "arc") {
    /* the drawn shape is a half-disc, but only the half facing the field can
       ever be reached — so a plain radius test is exact here, not an
       approximation */
    return Math.hypot(g.px - o.x, hy - o.y) < o.r + hr;
  }
  if (o.kind === "blade") {
    const c = Math.cos(o.spin), s = Math.sin(o.spin);
    return segDist(g.px, hy, o.x - c * o.len, o.y - s * o.len, o.x + c * o.len, o.y + s * o.len) < 5 * g.s + hr;
  }
  // gate: lethal everywhere on its row except inside the travelling gap
  if (Math.abs(hy - o.y) > o.hh + hr) return false;
  return Math.abs(g.px - o.gapX) > o.gapW / 2 - hr;
}

function die(g, o) {
  g.shake = 1;
  burst(g.parts, g.px, headY(g), palette.line, 26, 340, 5, g.reduced ? 0.4 : 1);
  burst(g.parts, o.kind === "arc" || o.kind === "gate" ? g.px : o.x, o.y, colorOf(o), 14, 220, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(o.kind);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h, s, t } = g;

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 11 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  drawField(ctx, w, h, g.field, g.scroll, g.metres, t);

  /* SURGE tints the whole corridor, so the power-up changes how the world
     looks and not just a meter */
  if (g.surge > 0) {
    const a = Math.min(1, g.surge / 0.5) * 0.22;
    const rg = ctx.createRadialGradient(g.px, headY(g), 0, g.px, headY(g), Math.max(w, h) * 0.85);
    rg.addColorStop(0, `rgba(192,230,55,${a})`);
    rg.addColorStop(1, "rgba(192,230,55,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  for (const o of g.orbs) {
    ctx.save(); ctx.translate(o.x, o.y);
    drawOrb(ctx, s, t, o.phase);
    ctx.restore();
  }

  for (const o of g.hazards) {
    ctx.save();
    if (o.kind === "gate") {
      ctx.translate(0, o.y);
      drawGate(ctx, s, w, o.gapX, o.gapW, o.hh);
    } else {
      ctx.translate(o.x, o.y);
      if (o.kind === "bar") drawBar(ctx, s, o.hw, o.hh);
      else if (o.kind === "arc") drawArc(ctx, s, o.r, o.side, o.spin);
      else drawBlade(ctx, s, o.len, o.spin);
    }
    ctx.restore();
  }

  drawTrail(ctx, g.trail, s, g.surge > 0);
  drawParticles(ctx, g.parts);

  if (g.running) {
    ctx.save();
    ctx.translate(g.px, headY(g));
    drawHead(ctx, s, t, g.surge > 0, g.invuln > 0 && g.surge <= 0);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Static hero for the menu preview — the same trail and head code as
 * gameplay, so what's on the title screen is literally what you fly.
 */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const pts = [];
  for (let i = 0; i <= 46; i++) {
    const k = i / 46;
    pts.push({ x: w / 2 + Math.sin(k * 5 + t * 0.9) * (w * 0.28) * k, y: h - 16 - k * (h - 46) });
  }
  pts.reverse();
  drawTrail(ctx, pts, 1.1, false);
  const tip = pts[pts.length - 1];
  ctx.save();
  ctx.translate(tip.x, tip.y);
  drawHead(ctx, 1.15, t, false, false);
  ctx.restore();
}
