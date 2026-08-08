/* ══ Flick — simulation ══
   Owns no React state. The component samples a small HUD snapshot ~15×/s and
   everything inside the play field stays on the canvas. */

import { clamp, rng, withAlpha } from "@37apps/core/canvas/color.js";
import { createParticles, burst, emit, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette, SIDE_COLOR,
  TIME_START, TIME_MAX, TIME_LOW, timeGainFor, spawnRateFor,
  START_DISCS, MAX_RUN,
  BOOST_NOTCHES, BOOST_TIME, BOOST_SCORE_MULT, BOOST_TIME_MULT,
  SPECIALS, SPECIAL_COOLDOWN, GOLD_POINTS, GOLD_TIME, WILD_POINTS,
  CHILL_TIME, CHILL_DRAIN, CHILL_SPAWN,
  SWAP_FROM, SWAP_EVERY, SWAP_TIME,
  COMBO_STEP, COMBO_TIME, REVIVE_DISCS,
  layoutFor,
} from "./constants.js";
import {
  drawDisc, drawWalls, drawColumn, drawDangerLine, drawMotes, drawHints, clearGradientCache,
} from "./sprites.js";

let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

export function createGame(hooks = {}) {
  const g = {
    w: 390, h: 700, t: 0, running: false, reduced: false,
    L: layoutFor(390, 700),

    stack: [],          // [0] = bottom of the tower, last = the one you flick
    nextDisc: null,     // already drawn, rising out of the floor
    spawnProgress: 0,   // 0..1 of one disc height
    flying: [],

    time: TIME_START, score: 0, combo: 0,
    boost: 0, boostLeft: 0, chill: 0,
    swapped: false, swapT: 0, sinceSwap: 0,
    sinceSpecial: 0, runColor: 0, runLen: 0,

    parts: createParticles(240),
    wallPulse: [0, 0],
    shake: 0, alarm: 0, hint: 0,
    motes: [],
    ...hooks,
  };

  g.resize = (w, h) => {
    g.w = w; g.h = h;
    g.L = layoutFor(w, h);
    clearGradientCache();
    const r = rng(9931);
    g.motes = Array.from({ length: 12 }, () => ({
      x: r(), y: r() * (h + 200), r: 14 + r() * 46, v: 12 + r() * 26,
    }));
  };

  g.reset = () => {
    g.t = 0;
    g.stack = [];
    g.runColor = 0; g.runLen = 0; g.sinceSpecial = SPECIAL_COOLDOWN;
    for (let i = 0; i < START_DISCS; i++) g.stack.push(makeDisc(g, true));
    g.nextDisc = makeDisc(g);
    g.spawnProgress = 0;
    g.flying = [];
    g.time = TIME_START; g.score = 0; g.combo = 0;
    g.boost = 0; g.boostLeft = 0; g.chill = 0;
    g.swapped = false; g.swapT = 0; g.sinceSwap = 0;
    g.parts = createParticles(240);
    g.wallPulse = [0, 0];
    g.shake = 0; g.alarm = 0;
    g.dead = false;
  };

  /** Rewarded-ad continue: cut the tower back and hand the clock back full. */
  g.revive = () => {
    g.stack = g.stack.slice(0, REVIVE_DISCS);
    g.spawnProgress = 0;
    g.time = TIME_MAX;
    g.combo = 0;
    g.dead = false;
    g.shake = 0;
    burst(g.parts, g.L.cx, g.L.baseY - g.L.discH * 2, palette.success, 26, 300, 5, g.reduced ? 0.4 : 1);
  };

  g.flick = (dir) => flick(g, dir);
  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__flick = g;
  return g;
}

/* ── the deck ───────────────────────────────────────────────────────────── */

/**
 * One disc. Colour runs are capped so the tower never turns into a wall of
 * one colour (which stops being a decision) and never perfectly alternates
 * (which stops being a read and becomes a rhythm).
 */
function makeDisc(g, plain = false) {
  let side = Math.random() < 0.5 ? -1 : 1;
  if (side === g.runColor && g.runLen >= MAX_RUN) side = -side;
  if (side === g.runColor) g.runLen += 1;
  else { g.runColor = side; g.runLen = 1; }

  let kind = "normal";
  if (!plain && g.sinceSpecial >= SPECIAL_COOLDOWN) {
    for (const [name, cfg] of Object.entries(SPECIALS)) {
      if (g.score >= cfg.from && Math.random() < cfg.chance) { kind = name; break; }
    }
  }
  if (kind === "normal") g.sinceSpecial += 1;
  else g.sinceSpecial = 0;

  return { id: uid++, side, kind, seed: Math.random() * 10 };
}

/** Which wall a disc belongs to right now — the swap flips the whole mapping. */
const targetSide = (g, d) => (g.swapped ? -d.side : d.side);
const wallColor = (g, dir) => (g.swapped ? SIDE_COLOR[String(-dir)] : SIDE_COLOR[String(dir)]);

/** Top plane of the top disc — the number the overflow rule is written in. */
function towerTopY(g) {
  const L = g.L;
  return L.baseY - (g.stack.length + g.spawnProgress) * L.discH;
}

/* ── input ──────────────────────────────────────────────────────────────── */

function flick(g, dir) {
  if (!g.running || g.dead || g.stack.length === 0) return;
  const L = g.L;
  const disc = g.stack[g.stack.length - 1];

  /* mid-swap every direction scores: the walls are literally changing places
     under the player's thumb, and a death there would be the game's fault */
  const free = g.swapT > 0 || disc.kind === "wild";
  if (!free && targetSide(g, disc) !== dir) {
    g.combo = 0;
    g.shake = g.reduced ? 0 : 1;
    burst(g.parts, L.cx, towerTopY(g), palette.danger, 26, 340, 5, g.reduced ? 0.4 : 1);
    g.dead = true;
    g.onDeath?.("wrong", g.score);
    return;
  }

  g.stack.pop();

  /* scoring */
  const mult = g.boostLeft > 0 ? BOOST_SCORE_MULT : 1;
  const points = disc.kind === "gold" ? GOLD_POINTS : disc.kind === "wild" ? WILD_POINTS : 1;
  g.score += points * mult;

  let gain = timeGainFor(g.score) * (g.boostLeft > 0 ? BOOST_TIME_MULT : 1);
  if (disc.kind === "gold") gain += GOLD_TIME;

  g.combo += 1;
  if (g.combo % COMBO_STEP === 0) gain += COMBO_TIME;
  g.time = Math.min(TIME_MAX, g.time + gain);

  /* power-up effects */
  if (disc.kind === "ice") { g.chill = CHILL_TIME; g.onIce?.(); }
  if (disc.kind === "gold") g.onGold?.();

  /* boost only charges while it isn't already spending itself, otherwise a
     good run would top the meter back up and never end */
  if (g.boostLeft <= 0) {
    g.boost = Math.min(1, g.boost + 1 / BOOST_NOTCHES);
    if (g.boost >= 1) { g.boostLeft = BOOST_TIME; g.onBoost?.(); }
  }

  /* the throw */
  const speed = rand(920, 1080) * (dir < 0 ? -1 : 1);
  g.flying.push({
    x: L.cx, y: towerTopY(g), vx: speed, vy: rand(-260, -120),
    rot: 0, spin: rand(7, 11) * (dir < 0 ? -1 : 1),
    side: disc.side, kind: disc.kind, dir, life: 0, landed: false,
  });

  g.onFlick?.(disc.kind, g.combo);

  /* the swap only ever fires between discs, never mid-flight */
  g.sinceSwap += 1;
  if (g.score >= SWAP_FROM && g.sinceSwap >= SWAP_EVERY) {
    g.sinceSwap = 0;
    g.swapped = !g.swapped;
    g.swapT = SWAP_TIME;
    g.onSwap?.();
  }
}

/* ── simulation ─────────────────────────────────────────────────────────── */

function update(g, dt) {
  const L = g.L;
  g.t += dt;
  g.hint = Math.max(0, g.hint - dt);

  if (g.dead) { decay(g, dt); return; }

  g.chill = Math.max(0, g.chill - dt);
  const chilled = g.chill > 0;

  if (g.boostLeft > 0) {
    g.boostLeft = Math.max(0, g.boostLeft - dt);
    g.boost = g.boostLeft / BOOST_TIME;
  }
  if (g.swapT > 0) g.swapT = Math.max(0, g.swapT - dt);

  /* the clock */
  g.time -= dt * (chilled ? CHILL_DRAIN : 1);
  if (g.time <= 0) {
    g.time = 0;
    g.dead = true;
    g.shake = g.reduced ? 0 : 0.8;
    g.onDeath?.("time", g.score);
    return;
  }

  /* the tower grows from the floor */
  g.spawnProgress += spawnRateFor(g.score) * dt * (chilled ? CHILL_SPAWN : 1);
  while (g.spawnProgress >= 1) {
    g.spawnProgress -= 1;
    g.stack.unshift(g.nextDisc);
    g.nextDisc = makeDisc(g);
  }

  const top = towerTopY(g);
  if (top <= L.dangerY) {
    g.dead = true;
    g.shake = g.reduced ? 0 : 1;
    burst(g.parts, L.cx, L.dangerY, palette.danger, 30, 380, 5, g.reduced ? 0.4 : 1);
    g.onDeath?.("overflow", g.score);
    return;
  }

  /* how close the tower is to the line, and how close the clock is to zero —
     the backdrop alarm takes whichever is worse */
  const room = L.baseY - L.dangerY;
  const towerNear = clamp(1 - (top - L.dangerY) / (room * 0.26), 0, 1);
  const timeNear = clamp(1 - g.time / TIME_LOW, 0, 1);
  g.alarm = Math.max(towerNear, timeNear);

  decay(g, dt);
}

function decay(g, dt) {
  const L = g.L;

  for (let i = g.flying.length - 1; i >= 0; i--) {
    const f = g.flying[i];
    f.life += dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += 1500 * dt;
    f.rot += f.spin * dt;

    if (!f.landed) {
      const wall = f.dir < 0 ? L.colX0 : L.colX1;
      if ((f.dir < 0 && f.x - L.r <= wall) || (f.dir > 0 && f.x + L.r >= wall)) {
        f.landed = true;
        g.wallPulse[f.dir < 0 ? 0 : 1] = 1;
        const col = f.kind === "wild" ? palette.accent : SIDE_COLOR[String(f.side)];
        burst(g.parts, wall, f.y, col, g.reduced ? 8 : 18, 340, 5, g.reduced ? 0.4 : 1);
        if (f.kind === "gold") burst(g.parts, wall, f.y, palette.gold, g.reduced ? 6 : 16, 420, 4, g.reduced ? 0.4 : 1);
      }
    }
    if (f.life > 1.1 || f.y > L.h + L.r * 2) g.flying.splice(i, 1);
  }

  /* boost sparks rising out of the tower — the only ambient emitter, gated on
     the state that earns it */
  if (g.boostLeft > 0 && !g.reduced && Math.random() < dt * 34) {
    emit(g.parts, {
      x: L.cx + rand(-L.r, L.r), y: towerTopY(g) + rand(0, L.discH * 3),
      vx: rand(-30, 30), vy: rand(-190, -90), life: rand(0.4, 0.8),
      r: rand(1.5, 3.4), color: palette.gold, grav: -40, kind: "spark",
    });
  }

  updateParticles(g.parts, dt);
  g.wallPulse[0] = Math.max(0, g.wallPulse[0] - dt * 5);
  g.wallPulse[1] = Math.max(0, g.wallPulse[1] - dt * 5);
  g.shake = Math.max(0, g.shake - dt * 3.2);
}

/* ── rendering ──────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const L = g.L;
  ctx.save();

  if (g.shake > 0) {
    const k = g.shake * g.shake * 9;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  /* walls — during a swap the two colours cross-slide past each other rather
     than cutting, so the player can watch the mapping change */
  const leftCol = wallColor(g, -1);
  const rightCol = wallColor(g, 1);
  if (g.swapT > 0) {
    /* mid-animation both walls sit on the neutral accent for a beat: an
       unmistakable "neither side is wrong right now" */
    const k = Math.sin((1 - g.swapT / SWAP_TIME) * Math.PI);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, L.w, L.h);
    drawWalls(ctx, L, leftCol, rightCol, g.wallPulse, g.t);
    ctx.fillStyle = withAlpha(palette.accent, k * 0.75);
    ctx.fillRect(0, 0, L.colX0, L.h);
    ctx.fillRect(L.colX1, 0, L.w - L.colX1, L.h);
  } else {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, L.w, L.h);
    drawWalls(ctx, L, leftCol, rightCol, g.wallPulse, g.t);
  }

  /* column, tinted by the wall the next disc is headed for */
  const next = g.stack[g.stack.length - 1];
  const glowCol = !next ? null
    : next.kind === "wild" ? palette.accent
    : wallColor(g, targetSide(g, next));
  drawColumn(ctx, L, g.t, g.alarm, glowCol);
  drawMotes(ctx, L, g.motes, g.t);
  drawDangerLine(ctx, L, g.alarm, g.t);

  /* the tower, bottom-up so each disc overlaps the seam of the one below */
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.colX0, 0, L.colW, L.h);
  ctx.clip();

  const rise = g.spawnProgress * L.discH;
  /* the next disc, still climbing out of the floor — drawing it here is what
     makes the tower rise continuously instead of jumping a disc at a time */
  if (g.nextDisc) {
    drawDisc(ctx, L.cx, L.baseY - rise, L.r, L.ry, L.discH + L.ry,
      SIDE_COLOR[String(g.nextDisc.side)], { kind: g.nextDisc.kind, t: g.t + g.nextDisc.seed });
  }
  for (let i = 0; i < g.stack.length; i++) {
    const d = g.stack[i];
    const yTop = L.baseY - (i + 1) * L.discH - rise;
    const isTop = i === g.stack.length - 1;
    drawDisc(ctx, L.cx, yTop, L.r, L.ry, L.discH + L.ry, SIDE_COLOR[String(d.side)], {
      kind: d.kind, t: g.t + d.seed,
      glow: isTop ? 0.35 + Math.sin(g.t * 5) * 0.12 : 0,
    });
  }
  ctx.restore();

  /* thrown discs fly over the walls */
  for (const f of g.flying) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    const squash = 0.35 + Math.abs(Math.cos(f.rot * 1.6)) * 0.65;
    const fade = clamp(1 - (f.life - 0.55) / 0.55, 0, 1);
    drawDisc(ctx, 0, 0, L.r, L.ry * squash, L.discH + L.ry, SIDE_COLOR[String(f.side)], {
      kind: f.kind, t: g.t, alpha: fade,
    });
    ctx.restore();
  }

  drawParticles(ctx, g.parts);
  drawHints(ctx, L, g.hint > 0 ? Math.min(1, g.hint) : 0, g.t);

  ctx.restore();
}

/**
 * Menu preview: the same renderer, running a canned loop — one disc leaves the
 * top of a four-disc tower every beat while the tower rises to replace it, so
 * the still image on the menu already shows the verb.
 */
const HERO_SEQ = [-1, 1, 1, -1, 1, -1, -1, 1];
const HERO_BEAT = 1.05;

export function drawHero(ctx, w, h, tRaw) {
  /* rAF hands its callback the frame's *start* timestamp, which in Chrome can
     be a hair earlier than a performance.now() taken while arming the loop —
     so the first frame arrives with a slightly negative elapsed time. Left
     alone that walks the sequence index negative and hands drawDisc an
     undefined colour, killing the loop on frame one. */
  const t = Math.max(0, tRaw);
  const r = w * 0.2;
  const L = {
    w, h, cx: w / 2,
    colX0: w * 0.19, colX1: w * 0.81, colW: w * 0.62,
    r, ry: r * 0.3, discH: r * 0.46,
    baseY: h - 10, dangerY: 14,
  };

  ctx.clearRect(0, 0, w, h);
  drawWalls(ctx, L, palette.left, palette.right, [0, 0], t);
  drawColumn(ctx, L, t, 0, null);

  const step = Math.floor(t / HERO_BEAT);
  const p = (t % HERO_BEAT) / HERO_BEAT;
  const side = (i) => HERO_SEQ[(((step + i) % HERO_SEQ.length) + HERO_SEQ.length) % HERO_SEQ.length];

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.colX0, 0, L.colW, h);
  ctx.clip();
  const rise = p * L.discH;
  for (let i = -1; i < 4; i++) {
    drawDisc(ctx, L.cx, L.baseY - (i + 1) * L.discH - rise, L.r, L.ry, L.discH + L.ry,
      SIDE_COLOR[String(side(i + 1))], { t });
  }
  ctx.restore();

  /* the disc that just left — thrown toward the wall that matches it */
  const dir = side(0);
  const fx = L.cx + dir * p * w * 0.62;
  const fy = L.baseY - 4 * L.discH + p * p * 150 - p * 90;
  ctx.save();
  ctx.globalAlpha = 1 - p * 0.55;
  ctx.translate(fx, fy);
  ctx.rotate(p * 5.5 * dir);
  drawDisc(ctx, 0, 0, L.r, L.ry * (0.35 + Math.abs(Math.cos(p * 9)) * 0.65), L.discH + L.ry,
    SIDE_COLOR[String(dir)], { t });
  ctx.restore();
}
