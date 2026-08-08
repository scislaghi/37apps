/* ══ Hue — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas.

   The ball never moves horizontally — it rides the centre line and the only
   input is a tap. So every collision in this game reduces to "which colour is
   sitting on the centre line at the height I'm crossing", which is exactly
   what makes the rule teachable in one screen and what lets the collision
   code below be exact rather than approximate. */

import { clamp } from "@37apps/core/canvas/color.js";
import { createParticles, burst, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  HUES,
  PX_PER_METRE, BALL_R, GRAVITY, JUMP_V, MAX_FALL, ANCHOR, CAM_FOLLOW,
  TRAIL_STEP, TRAIL_MAX,
  IDLE_GRACE, CREEP_SPEED, CREEP_MAX, CREEP_ACCEL,
  BAND_TH, BAR_TH, ARM_TH, UNLOCK, SWITCH_R, REVIVE_GRACE,
  scaleFor, clearanceFor, spinFor, switchChanceFor,
} from "./constants.js";
import { createField, drawField, drawVoid, drawVignette, fieldAt } from "./backdrop.js";
import { drawRing, drawDual, drawCross, drawBars, drawSwitcher, drawBall, drawTrail } from "./sprites.js";

const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
const SUBSTEP = 1 / 120;

let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

/** A permutation of all four hues — every obstacle shows each colour once, so
    "wait for mine" is always a bounded wait rather than a lottery. */
function shuffle4() {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame({ onPass, onSwitch, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false, dead: false,

    by: 0, vy: 0, hue: 0, cam: 0, topY: 0, metres: 0,
    trail: [], sinceTrail: 0,

    obstacles: [], switchers: [], frontier: 0, lastKind: null,
    combo: 0, idle: 0, creep: 0, invuln: 0, shake: 0, flash: 0, zoneIndex: -1,
    parts: createParticles(),
    field: createField(),

    onPass, onSwitch, onDeath, onZone,
  };

  g.resize = (w, h) => {
    const k = w / (g.w || w);
    g.w = w; g.h = h; g.s = scaleFor(w);
    for (const o of g.obstacles) {
      for (const key of ["cx", "r", "r2", "th", "len", "hub", "off"]) {
        if (o[key] !== undefined) o[key] *= k;
      }
    }
    for (const p of g.trail) p.x *= k;
  };

  g.reset = () => {
    g.t = 0;
    g.dead = false;
    g.by = 0; g.vy = 0; g.topY = 0; g.metres = 0;
    g.hue = Math.floor(Math.random() * 4);
    g.cam = -g.h * ANCHOR;
    g.trail = []; g.sinceTrail = 0;
    g.obstacles = []; g.switchers = []; g.lastKind = null;
    /* the first obstacle sits a little over half a screen up: far enough that
       the opening tap is never a reaction, close enough that the rule shows
       itself before the player has invented a wrong one */
    g.frontier = -g.h * 0.6;
    g.combo = 0; g.idle = 0; g.creep = 0; g.invuln = 0.7;
    g.shake = 0; g.flash = 0; g.zoneIndex = -1;
    g.parts = createParticles();
  };

  /** Rewarded-ad continue: clear the neighbourhood, recentre, hand back grace. */
  g.revive = () => {
    g.dead = false;
    g.obstacles = g.obstacles.filter(o => Math.abs(o.y - g.by) > g.h * 0.55);
    g.switchers = g.switchers.filter(o => Math.abs(o.y - g.by) > g.h * 0.3);
    g.vy = -JUMP_V * g.s * 0.55;
    g.cam = g.by - g.h * ANCHOR;
    g.invuln = REVIVE_GRACE;
    g.idle = 0; g.creep = 0; g.shake = 0;
    burst(g.parts, g.w / 2, g.by, HUES[g.hue], 22, 260, 4, g.reduced ? 0.4 : 1);
  };

  g.jump = () => {
    if (g.dead) return;
    g.vy = -JUMP_V * g.s;
    if (!g.reduced) {
      burst(g.parts, g.w / 2, g.by + BALL_R * g.s, HUES[g.hue], 4, 90, 2.4, 0.6);
    }
  };

  g.update = (dt) => {
    /* fixed substeps: at terminal fall speed a single 50 ms frame would move
       the ball further than an obstacle band is thick, and tunnelling through
       a wall you should have died on is the one bug this genre can't have */
    let left = dt;
    while (left > 0 && !g.dead) {
      const h = Math.min(SUBSTEP, left);
      step(g, h);
      left -= h;
    }
    frame(g, dt);
  };
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__hue = g;
  return g;
}

/* ── geometry ─────────────────────────────────────────────────────────── */

/** Half the obstacle's vertical extent — drives both spacing and broadphase. */
function halfOf(o) {
  if (o.kind === "cross") return o.len + o.th / 2;
  if (o.kind === "bars") return o.th / 2;
  return o.r + o.th / 2;
}

/** Distance from a point to a segment. */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Which quarter of a ring the ball is touching, or -1 for no contact. */
function ringHit(g, cx, cy, r, th, spin, colors, hr) {
  const dx = g.w / 2 - cx, dy = g.by - cy;
  const d = Math.hypot(dx, dy);
  if (Math.abs(d - r) > th / 2 + hr) return -1;
  /* the drawn arcs have a hairline gap between quarters; collision treats the
     band as continuous on purpose — a 3 px cosmetic seam that let you through
     a wrong colour would read as the game being broken, not generous */
  const a = ((Math.atan2(dy, dx) - spin) % TAU + TAU) % TAU;
  return colors[Math.floor(a / QUARTER) % 4];
}

/** The hue the ball is currently in contact with on `o`, or -1. */
function contactColor(g, o) {
  const hr = BALL_R * g.s;

  if (o.kind === "ring") return ringHit(g, o.cx, o.y, o.r, o.th, o.spin, o.colors, hr);

  if (o.kind === "dual") {
    const outer = ringHit(g, o.cx, o.y, o.r, o.th, o.spin, o.colors, hr);
    if (outer >= 0 && outer !== g.hue) return outer;
    const inner = ringHit(g, o.cx, o.y, o.r2, o.th, o.spin2, o.colors2, hr);
    return inner >= 0 ? inner : outer;
  }

  if (o.kind === "cross") {
    for (let i = 0; i < 4; i++) {
      const a = o.spin + i * QUARTER;
      const cos = Math.cos(a), sin = Math.sin(a);
      const d = segDist(
        g.w / 2, g.by,
        o.cx + cos * o.hub, o.y + sin * o.hub,
        o.cx + cos * o.len, o.y + sin * o.len,
      );
      if (d < o.th / 2 + hr) {
        if (o.colors[i] !== g.hue) return o.colors[i];   // a fatal arm wins
      }
    }
    return -1;
  }

  // bars — a full-width band, so there is no going round it, only through it
  if (Math.abs(g.by - o.y) > o.th / 2 + hr) return -1;
  const seg = g.w / 4;
  const x = ((g.w / 2 - o.off) % g.w + g.w) % g.w;
  return o.colors[Math.floor(x / seg) % 4];
}

/* ── spawning ─────────────────────────────────────────────────────────── */

function makeObstacle(g, kind) {
  const s = g.s, w = g.w, m = g.metres;
  /* radial shapes are sized off the *narrower* of the two axes, not the width:
     on a phone that's the width and nothing changes, but on a landscape or
     desktop window a width-only ring would be taller than the screen it has
     to be crossed inside */
  const span = Math.min(w, g.h * 0.62);
  const spinV = spinFor(m) * (Math.random() < 0.5 ? -1 : 1);
  const spin = Math.random() * TAU;
  const base = { id: uid++, kind, y: 0, passed: false, colors: shuffle4() };

  if (kind === "ring") {
    const r = span * rand(0.30, 0.345);
    /* nudging the centre off the lane changes *where* on the arc you cross it,
       so two rings with the same rotation still play differently */
    return { ...base, cx: w / 2 + rand(-0.28, 0.28) * r, r, th: BAND_TH * s, spin, spinV };
  }

  if (kind === "dual") {
    /* the two radii are set by the gap they leave, not by how they look: the
       ball has to be able to park between the rings while it waits for the
       inner arc to come round, so outer-inner ≈ one hop plus both bands. The
       inner ring also turns slower than the outer — each colour dwells longer
       exactly where the waiting happens. */
    const r = span * 0.4;
    return {
      ...base, cx: w / 2, r, r2: r * 0.34, th: BAND_TH * s,
      spin, spinV: spinV * 0.8, spin2: Math.random() * TAU, spinV2: -spinV * 0.75, colors2: shuffle4(),
    };
  }

  if (kind === "cross") {
    const len = span * rand(0.33, 0.4);
    return { ...base, cx: w / 2 + rand(-0.06, 0.06) * w, len, hub: len * 0.42, th: ARM_TH * s, spin, spinV };
  }

  return { ...base, th: BAR_TH * s, off: Math.random() * w, drift: rand(70, 145) * s * (Math.random() < 0.5 ? -1 : 1) };
}

function spawnNext(g) {
  const m = g.metres;
  const pool = ["ring"];
  if (m >= UNLOCK.bars) pool.push("bars");
  if (m >= UNLOCK.cross) pool.push("cross");
  if (m >= UNLOCK.dual) pool.push("dual");

  let kind = pool[Math.floor(Math.random() * pool.length)];
  /* one re-roll against a repeat: variety matters more than a pure random
     sequence, and back-to-back identical shapes is what a run of bad luck
     actually feels like */
  if (pool.length > 1 && kind === g.lastKind) kind = pool[Math.floor(Math.random() * pool.length)];
  g.lastKind = kind;

  const o = makeObstacle(g, kind);
  const half = halfOf(o);
  o.y = g.frontier - half;
  g.obstacles.push(o);

  const clear = clearanceFor(m) * g.s;
  g.frontier = o.y - half - clear;

  if (Math.random() < switchChanceFor(m)) {
    g.switchers.push({ id: uid++, y: g.frontier + clear * 0.5, spin: Math.random() * TAU });
  }
}

/* ── simulation ───────────────────────────────────────────────────────── */

function step(g, dt) {
  const s = g.s;

  g.vy = Math.min(MAX_FALL * s, g.vy + GRAVITY * s * dt);
  g.by += g.vy * dt;

  if (g.by < g.topY) { g.topY = g.by; g.idle = 0; }
  else g.idle += dt;
  g.metres = -g.topY / (PX_PER_METRE * s);

  for (const o of g.obstacles) {
    o.spin += o.spinV * dt;
    if (o.spinV2) o.spin2 += o.spinV2 * dt;
    if (o.kind === "bars") o.off = ((o.off + o.drift * dt) % g.w + g.w) % g.w;
  }
  for (const sw of g.switchers) sw.spin += 1.5 * dt;

  /* ── the switcher is mandatory by design: it sits on the lane the ball can
     never leave, so the colour you hold is always the game's choice ── */
  const grabR = (SWITCH_R + BALL_R) * s;
  for (let i = g.switchers.length - 1; i >= 0; i--) {
    const sw = g.switchers[i];
    if (Math.abs(sw.y - g.by) > grabR) continue;
    g.switchers.splice(i, 1);
    const next = (g.hue + 1 + Math.floor(Math.random() * 3)) % 4;   // never a no-op
    g.hue = next;
    g.flash = 1;
    burst(g.parts, g.w / 2, sw.y, HUES[next], 16, 220, 4, g.reduced ? 0.4 : 1);
    g.onSwitch?.();
  }

  for (const o of g.obstacles) {
    if (!o.passed && g.by < o.y) {
      o.passed = true;
      g.combo += 1;
      burst(g.parts, g.w / 2, o.y, HUES[g.hue], 10, 170, 3.4, g.reduced ? 0.4 : 1);
      g.onPass?.();
    }
  }

  if (g.invuln > 0) {
    g.invuln -= dt;
    return;
  }

  const reach = BALL_R * s;
  for (const o of g.obstacles) {
    if (Math.abs(o.y - g.by) > halfOf(o) + reach) continue;
    const c = contactColor(g, o);
    if (c >= 0 && c !== g.hue) { die(g, "colour", o.y, c); return; }
  }
}

/** Per-frame work that doesn't need substepping. */
function frame(g, dt) {
  g.t += dt;

  const target = g.by - g.h * ANCHOR;
  if (target < g.cam) g.cam += (target - g.cam) * Math.min(1, CAM_FOLLOW * dt);

  /* ── the void: stalling is a decision with a cost, not a free pause ── */
  if (g.idle > IDLE_GRACE) {
    g.creep = Math.min(CREEP_MAX, Math.max(CREEP_SPEED, g.creep) + CREEP_ACCEL * dt);
    g.cam -= g.creep * g.s * dt;
  } else {
    g.creep = Math.max(0, g.creep - 140 * dt);
  }

  while (g.frontier > g.cam - g.h * 0.9) spawnNext(g);

  g.obstacles = g.obstacles.filter(o => o.y < g.cam + g.h + 300 * g.s);
  g.switchers = g.switchers.filter(o => o.y < g.cam + g.h + 120 * g.s);

  /* the trail records where the ball has been *and what it was* — sampled by
     distance so it stays the same density however fast the ball is moving */
  g.sinceTrail += Math.abs(g.vy) * dt;
  if (g.sinceTrail >= TRAIL_STEP * g.s) {
    g.sinceTrail = 0;
    g.trail.push({ x: g.w / 2, y: g.by, c: g.hue });
    if (g.trail.length > TRAIL_MAX) g.trail.shift();
  }
  while (g.trail.length && g.trail[0].y > g.cam + g.h + 60) g.trail.shift();

  updateParticles(g.parts, dt);
  if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 4);
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.4);

  const zi = fieldAt(g.metres).index;
  if (zi !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(fieldAt(g.metres).name);
    g.zoneIndex = zi;
  }

  if (!g.dead && g.by > g.cam + g.h + 30 * g.s) die(g, "fall", g.cam + g.h, g.hue);
}

function die(g, cause, y, colorIndex) {
  g.dead = true;
  g.shake = 1;
  burst(g.parts, g.w / 2, g.by, HUES[g.hue], 26, 340, 5, g.reduced ? 0.4 : 1);
  burst(g.parts, g.w / 2, y, HUES[colorIndex], 14, 230, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(cause);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h, s, t, cam } = g;
  const ballY = g.by - cam;

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 10 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  drawField(ctx, w, h, g.field, cam, g.metres, t, HUES[g.hue], ballY);

  drawTrail(ctx, g.trail, s, cam);

  for (const sw of g.switchers) {
    const y = sw.y - cam;
    if (y < -60 || y > h + 60) continue;
    ctx.save();
    ctx.translate(w / 2, y);
    drawSwitcher(ctx, s, SWITCH_R * s, sw.spin);
    ctx.restore();
  }

  for (const o of g.obstacles) {
    const y = o.y - cam;
    const half = halfOf(o);
    if (y + half < -40 || y - half > h + 40) continue;
    ctx.save();
    if (o.kind === "bars") {
      ctx.translate(0, y);
      drawBars(ctx, s, w, o, g.hue);
    } else {
      ctx.translate(o.cx, y);
      if (o.kind === "ring") drawRing(ctx, s, o, g.hue);
      else if (o.kind === "dual") drawDual(ctx, s, o, g.hue);
      else drawCross(ctx, s, o, g.hue);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(0, -cam);
  drawParticles(ctx, g.parts);
  ctx.restore();

  if (!g.dead) {
    const stretch = clamp(1 + (g.vy / (2400 * s)) * 0.2, 0.86, 1.2);
    ctx.save();
    ctx.translate(w / 2, ballY);
    drawBall(ctx, s, BALL_R * s, g.hue, t, stretch, g.flash, g.invuln > 0);
    ctx.restore();
  }

  /* the void's haze fades in a beat *before* the floor actually starts to
     move, so the pressure is a warning and not an ambush */
  drawVoid(ctx, w, h, clamp((g.idle - IDLE_GRACE * 0.55) / (IDLE_GRACE * 0.45), 0, 1));
  drawVignette(ctx, w, h);

  ctx.restore();
}
