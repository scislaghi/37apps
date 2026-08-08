/* ══ Vector — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas.

   The corridor is a single flat array of evenly spaced nodes, each holding the
   y of the top wall and the y of the bottom wall at that x. Walls are drawn as
   straight lines between consecutive nodes, and collision interpolates the
   same two numbers — so what you see and what kills you are the same data,
   spikes included. A spike isn't a separate entity, it's one node whose wall
   bites inward. */

import { clamp } from "@37apps/core/canvas/color.js";
import { createParticles, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette,
  PX_PER_METRE, ARROW_X_RATIO, ARROW_R, GRAVITY, FLAP_V, MAX_FALL,
  ANGLE_GAIN, MAX_ANGLE, TRAIL_MAX, TRAIL_SAMPLE,
  SEG, GAP_START_R, MIN_PASS_R, MARGIN_R, GAP_SLEW_R, WANDER_ACC_R, WANDER_MAX_R,
  SPIKE_BITE_MIN, SPIKE_BITE_MAX,
  MILESTONE, REVIVE_GRACE, REVIVE_EASE,
  scaleFor, speedFor, gapFor, spikeChanceFor,
} from "./constants.js";
import { createField, drawField } from "./backdrop.js";
import { drawTerrain, drawArrow, drawRibbon } from "./sprites.js";

const rand = (a, b) => a + Math.random() * (b - a);
const arrowX = (g) => g.w * ARROW_X_RATIO;

export function createGame({ onFlap, onMilestone, onDeath } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0, step: SEG,
    running: false, reduced: false,

    scroll: 0, metres: 0, score: 0,
    ay: 350, vy: 0,

    nodes: [], cy: 350, cyv: 0, lastGap: GAP_START_R * 700, sinceSpike: 99,
    easeUntilM: 0, nextMilestone: MILESTONE,

    trail: [], sinceSample: 0,
    parts: createParticles(),
    shake: 0, invuln: 0,

    onFlap, onMilestone, onDeath,
  };

  g.resize = (w, h) => {
    const kx = w / (g.w || w), ky = h / (g.h || h);
    g.w = w; g.h = h; g.s = scaleFor(w);
    g.step *= kx;
    g.lastGap *= ky;
    for (const n of g.nodes) { n.x *= kx; n.top *= ky; n.bot *= ky; }
    for (const p of g.trail) { p.x *= kx; p.y *= ky; }
    g.ay *= ky; g.cy *= ky;
  };

  g.reset = () => {
    g.t = 0;
    g.scroll = 0; g.metres = 0; g.score = 0;
    g.ay = g.h / 2; g.vy = 0;
    g.cy = g.h / 2; g.cyv = 0;
    g.step = SEG * g.s;
    g.lastGap = GAP_START_R * g.h;
    g.sinceSpike = 99;
    g.easeUntilM = 0;
    g.nextMilestone = MILESTONE;
    g.trail = []; g.sinceSample = 0;
    g.parts = createParticles();
    g.shake = 0; g.invuln = 1;

    g.nodes = [];
    pushNode(g, -g.step * 2);
    while (g.nodes[g.nodes.length - 1].x < g.w + g.step * 2) pushNode(g);
  };

  /** Rewarded-ad continue: recentre in the corridor, then hand back a stretch
      of wide, spike-free tunnel to recover in. */
  g.revive = () => {
    const ax = arrowX(g);
    /* everything from just ahead of the dart is rebuilt; the nodes already
       behind it stay so the walls don't visibly jump where the player is
       looking */
    g.nodes = g.nodes.filter(n => n.x <= ax + g.step);
    if (g.nodes.length < 2) { g.reset(); return; }

    const here = terrainAt(g, ax);
    g.ay = (here.top + here.bot) / 2;
    g.vy = 0;
    g.cy = g.ay; g.cyv = 0;
    g.sinceSpike = 99;
    g.easeUntilM = g.metres + REVIVE_EASE;
    g.invuln = REVIVE_GRACE;
    g.shake = 0.3;
    while (g.nodes[g.nodes.length - 1].x < g.w + g.step * 2) pushNode(g);
    burst(g.parts, ax, g.ay, palette.arrow, 22, 260, 4, g.reduced ? 0.4 : 1);
  };

  g.flap = () => {
    /* the tap sets vertical speed outright rather than adding to it, so a
       panicked double-tap can't launch the dart at twice the intended rate —
       every tap buys exactly the same climb, which is what makes the corridor
       readable at all */
    g.vy = -FLAP_V * g.s;
    const ax = arrowX(g);
    burst(g.parts, ax - 8 * g.s, g.ay, palette.arrow, g.reduced ? 3 : 6, 120, 2.6, g.reduced ? 0.5 : 1);
    g.onFlap?.();
  };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);
  g.field = createField();

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__vector = g;
  return g;
}

/* ── corridor generation ──────────────────────────────────────────────── */

/**
 * Appends one node. `atX` is only passed for the very first node; every other
 * node lands exactly `g.step` past its predecessor, which is what lets
 * `terrainAt` find its bracketing pair by arithmetic instead of a search.
 */
function pushNode(g, atX) {
  const prev = g.nodes[g.nodes.length - 1];
  const x = prev ? prev.x + g.step : atX;
  /* metres at this node, not at the dart — difficulty has to be sampled where
     the wall will be met, or the corridor tightens a screen late */
  const mAt = g.metres + Math.max(0, x - arrowX(g)) / PX_PER_METRE;
  const easy = mAt < g.easeUntilM;

  const slew = GAP_SLEW_R * g.h;
  let gap = Math.min((easy ? GAP_START_R : gapFor(mAt)) * g.h, g.h * (1 - 2 * MARGIN_R));
  gap = clamp(gap, g.lastGap - slew, g.lastGap + slew);
  g.lastGap = gap;

  g.cyv = clamp(g.cyv + rand(-1, 1) * WANDER_ACC_R * g.h, -WANDER_MAX_R * g.h, WANDER_MAX_R * g.h);
  g.cy += g.cyv;
  const margin = MARGIN_R * g.h;
  const lo = margin + gap / 2, hi = g.h - margin - gap / 2;
  if (g.cy < lo) { g.cy = lo; g.cyv = Math.abs(g.cyv) * 0.55; }
  if (g.cy > hi) { g.cy = hi; g.cyv = -Math.abs(g.cyv) * 0.55; }

  let top = g.cy - gap / 2, bot = g.cy + gap / 2;

  /* ── spike ── */
  let spike = 0;
  if (!easy && g.sinceSpike >= 2 && Math.random() < spikeChanceFor(mAt)) {
    const bite = Math.min(gap * rand(SPIKE_BITE_MIN, SPIKE_BITE_MAX), gap - MIN_PASS_R * g.h);
    if (bite > 7 * g.s) {
      spike = Math.random() < 0.5 ? -1 : 1;
      if (spike < 0) top += bite; else bot -= bite;
      g.sinceSpike = 0;
    }
  }
  g.sinceSpike++;

  /* ── reachability clamp ──
     Wander and a spike can stack on the same node and demand a climb the dart
     physically cannot make — a wall rising faster than FLAP_V carries it at
     the current speed is an unwinnable stretch, and no amount of skill reads
     its way out of one. So each wall's per-node movement is capped by what the
     dart can actually do: `climb` when the corridor rises (one tap's worth of
     lift) and the far more generous `fall` when it drops. Measured before this
     clamp existed, the generator was asking for up to 1.23× the dart's climb
     rate around 2900 m. */
  if (prev) {
    const perPx = g.step / speedFor(mAt);
    const climb = FLAP_V * g.s * perPx * 0.7;
    const fall = MAX_FALL * g.s * perPx * 0.7;
    top = clamp(top, prev.top - climb, prev.top + fall);
    bot = clamp(bot, prev.bot - climb, prev.bot + fall);
    const minPass = MIN_PASS_R * g.h;
    if (bot - top < minPass) {
      /* widening only ever moves a wall *away* from the dart, so it can't
         reintroduce an unreachable slope */
      const need = (minPass - (bot - top)) / 2;
      top -= need; bot += need;
    }
    g.cy = (top + bot) / 2;
  }

  g.nodes.push({ x, top, bot, spike });
}

/** Wall positions at an arbitrary x — the single source of truth for both the
    drawn corridor and the hitbox. */
function terrainAt(g, x) {
  const n = g.nodes;
  const k = (x - n[0].x) / g.step;
  const i = clamp(Math.floor(k), 0, n.length - 2);
  const f = clamp(k - i, 0, 1);
  const a = n[i], b = n[i + 1];
  return { top: a.top + (b.top - a.top) * f, bot: a.bot + (b.bot - a.bot) * f };
}

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;
  const ax = arrowX(g);

  const speed = speedFor(g.metres);
  const dx = speed * dt;
  g.scroll += dx;
  g.metres += dx / PX_PER_METRE;
  g.score += dx / PX_PER_METRE;

  if (g.metres >= g.nextMilestone) {
    g.onMilestone?.(g.nextMilestone);
    g.nextMilestone += MILESTONE;
  }
  /* ── scroll the corridor, retire what's off the left, extend the right ── */
  for (const n of g.nodes) n.x -= dx;
  while (g.nodes.length > 3 && g.nodes[1].x < -g.step) g.nodes.shift();
  while (g.nodes[g.nodes.length - 1].x < g.w + g.step * 2) pushNode(g);

  /* ── flight ── */
  g.vy += GRAVITY * g.s * dt;
  const mf = MAX_FALL * g.s;
  g.vy = clamp(g.vy, -mf, mf);
  g.ay += g.vy * dt;

  if (g.invuln > 0) g.invuln -= dt;
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.4);

  /* ── ribbon ── */
  for (const p of g.trail) p.x -= dx;
  g.sinceSample += dx;
  if (g.sinceSample >= TRAIL_SAMPLE * g.s) {
    g.sinceSample = 0;
    g.trail.push({ x: ax, y: g.ay });
    if (g.trail.length > TRAIL_MAX) g.trail.shift();
  }

  stream(g.parts, dt, g.reduced ? 12 : 26 + (speed / MAX_FALL) * 26, () => ({
    x: ax - rand(4, 14) * g.s, y: g.ay + rand(-3, 3) * g.s,
    vx: -rand(40, 120), vy: rand(-30, 30) - g.vy * 0.12,
    life: rand(0.2, 0.5), r: rand(1.2, 2.8) * g.s,
    color: palette.arrow, kind: "spark",
  }));
  updateParticles(g.parts, dt);

  /* ── contact ── */
  if (g.invuln > 0) return;
  if (g.ay < -30 || g.ay > g.h + 30) return die(g, g.ay < 0 ? "top" : "bot");

  const r = ARROW_R * g.s;
  /* three samples across the dart's length: one vertical probe under-reads a
     steep wall, and every wall here is steep by design */
  for (const off of [-r * 0.9, 0, r * 0.9]) {
    const wall = terrainAt(g, ax + off);
    if (g.ay - r * 0.68 < wall.top) return die(g, "top");
    if (g.ay + r * 0.68 > wall.bot) return die(g, "bot");
  }
}

function die(g, side) {
  g.shake = 1;
  const ax = arrowX(g);
  burst(g.parts, ax, g.ay, palette.arrow, 26, 340, 5, g.reduced ? 0.4 : 1);
  burst(g.parts, ax, g.ay, palette.terrainFace, 14, 220, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(side);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h, s, t } = g;
  const ax = arrowX(g);

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 11 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  drawField(ctx, w, h, g.field, g.scroll, g.metres, t);
  drawTerrain(ctx, g.nodes, w, h, s, palette.arrow);

  drawRibbon(ctx, g.trail, s, palette.arrow);
  drawParticles(ctx, g.parts);

  if (g.running || g.invuln > 0) {
    const angle = clamp(Math.atan2(g.vy, speedFor(g.metres)) * ANGLE_GAIN, -MAX_ANGLE, MAX_ANGLE);
    ctx.save();
    ctx.translate(ax, g.ay);
    ctx.rotate(angle);
    drawArrow(ctx, s, t, palette.arrow, g.invuln > 0);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Static hero for the menu preview — the same dart, ribbon and wall renderer
 * as gameplay, so what's on the title screen is literally what you fly.
 */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const path = (x) => h / 2 + Math.sin(x * 0.035 + t * 1.3) * h * 0.19;
  const nodes = [];
  for (let x = -20; x <= w + 20; x += 26) {
    const c = h / 2 + Math.sin(x * 0.03 + t * 1.3 - 0.5) * h * 0.2;
    const bite = x > w * 0.55 && x < w * 0.68 ? 22 : 0;
    nodes.push({ x, top: c - 46 + bite, bot: c + 46 });
  }
  drawTerrain(ctx, nodes, w, h, 0.85, palette.arrow);

  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const x = w * 0.34 - i * 7;
    pts.push({ x, y: path(x) });
  }
  pts.reverse();
  drawRibbon(ctx, pts, 1, palette.arrow);

  const x = w * 0.34;
  const slope = (path(x + 2) - path(x - 2)) / 4;
  ctx.save();
  ctx.translate(x, path(x));
  ctx.rotate(Math.atan(slope * 6));
  drawArrow(ctx, 1.05, t, palette.arrow);
  ctx.restore();
}
