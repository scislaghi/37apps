/* ══ Icarus — simulation ══
   Flap-and-glide between two lethal boundaries. The sea is a hard floor; the
   sun is a soft ceiling that charges you for the time you spend near it. The
   only skill the game asks for is choosing which of the two to be closer to
   at any given moment. */

import { clamp } from "@37apps/core/canvas/color.js";
import { makeSkyLadder, drawSky } from "@37apps/core/canvas/sky.js";
import { createSkyBackdrop, drawSkyLayers, drawMotes } from "@37apps/core/canvas/skyBackdrop.js";
import { createParticles, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette, ZONES,
  PX_PER_METRE, PLAYER_X_RATIO, PLAYER_R, GRAVITY, FLAP_V, MAX_FALL, MAX_TILT,
  SEA_Y_RATIO, MELT_Y_RATIO, WAX_GAIN, WAX_COOL, FEATHER_COOL,
  MIN_GAP, UNLOCK, GULL_SPEED,
  FEATHER_PICKUP_R, FEATHER_POINTS, FEATHER_FILL, BURN_POINTS,
  GLIDE_TIME, GLIDE_SCORE_MULT, REVIVE_GRACE,
  scaleFor, speedFor, spawnGapFor,
} from "./constants.js";
import {
  drawSun, drawMeltLine, createSea, drawSea, drawSpire, drawCrag,
  drawGull, drawStorm, drawFeather, drawIcarus,
} from "./sprites.js";

const { skyAt } = makeSkyLadder(ZONES);
let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

export function createGame({ onFlap, onFeather, onGlide, onBurn, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false,

    scroll: 0, metres: 0, score: 0, zoneIndex: -1,
    py: 350, vy: 0, tilt: 0,

    wax: 0, charge: 0, glide: 0, invuln: 0,
    hazards: [], feathers: [],
    parts: createParticles(),
    nextSpawnAt: 0,
    sky: createSkyBackdrop(1717),
    sea: createSea(),
    shake: 0,

    onFlap, onFeather, onGlide, onBurn, onDeath, onZone,
  };

  g.resize = (w, h) => {
    const k = h / (g.h || h);
    g.w = w; g.h = h; g.s = scaleFor(w);
    g.py *= k;
  };

  g.reset = () => {
    g.t = 0;
    g.scroll = 0; g.metres = 0; g.score = 0; g.zoneIndex = -1;
    g.py = g.h * 0.55; g.vy = 0; g.tilt = 0;
    g.wax = 0; g.charge = 0; g.glide = 0; g.invuln = 1.2;
    g.hazards = []; g.feathers = [];
    g.parts = createParticles();
    g.nextSpawnAt = 460;
    g.shake = 0;
  };

  g.revive = () => {
    g.hazards = g.hazards.filter(o => o.x < -140 || o.x > g.w + 200);
    g.py = g.h * 0.55;
    g.vy = 0;
    g.wax = 0;
    g.invuln = REVIVE_GRACE;
    burst(g.parts, playerX(g), g.py, palette.hot, 22, 260, 5, g.reduced ? 0.4 : 1);
  };

  g.flap = () => {
    g.vy = FLAP_V * g.s;
    burst(g.parts, playerX(g) - 12 * g.s, g.py + 6 * g.s, "#FFFFFF", 4, 90, 3, g.reduced ? 0.4 : 1);
    g.onFlap?.();
  };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  if (import.meta.env.DEV) window.__icarus = g;
  return g;
}

const playerX = (g) => g.w * PLAYER_X_RATIO;
const seaY = (g) => g.h * SEA_Y_RATIO;
const meltY = (g) => g.h * MELT_Y_RATIO;

/* ── spawning ─────────────────────────────────────────────────────────── */

function rockPts() {
  const n = 8;
  return Array.from({ length: n }, (_, i) => [(Math.PI * 2 * i) / n, 0.72 + Math.random() * 0.42]);
}

function makeHazard(g, kind, x) {
  const s = g.s;
  if (kind === "spire") {
    /* anchored to the sea, so its *top* is the only thing that matters — the
       clearance above it is what the corridor check reasons about */
    const hgt = rand(70, 175) * s;
    return { id: uid++, kind, x, y: seaY(g), hw: rand(30, 48) * s, hgt,
             top: seaY(g) - hgt, bottom: g.h + 40 };
  }
  if (kind === "crag") {
    const r = rand(20, 34);
    const y = rand(meltY(g) + 40 * s, seaY(g) - 70 * s);
    return { id: uid++, kind, x, y, r, pts: rockPts(), bobPh: Math.random() * 9,
             top: y - r * s, bottom: y + r * s * 0.8 };
  }
  if (kind === "gull") {
    const y = rand(meltY(g) + 24 * s, seaY(g) - 46 * s);
    return { id: uid++, kind, x, y, phase: Math.random() * 9, drift: rand(-26, 26),
             speed: GULL_SPEED * rand(0.7, 1.4) * s,
             top: y - 16 * s, bottom: y + 16 * s };
  }
  // storm
  const hw = rand(52, 84) * s, hh = rand(19, 27) * s;
  const y = rand(meltY(g) - 10 * s, seaY(g) - 120 * s);
  return { id: uid++, kind, x, y, hw, hh, phase: Math.random() * 9,
           top: y - hh, bottom: y + hh };
}

/** Vertical clearance left between the sun's edge and the sea, given a wave. */
function corridorSurvives(g, list) {
  const need = MIN_GAP * g.s;
  const spans = list.map(o => [o.top, o.bottom]).sort((a, b) => a[0] - b[0]);
  let cursor = 10;
  for (const [a, b] of spans) {
    if (a - cursor >= need) return true;
    cursor = Math.max(cursor, b);
  }
  return seaY(g) - cursor >= need;
}

function spawnWave(g) {
  const m = g.metres;
  const x = g.w + 80 * g.s;

  const pool = [];
  if (m >= UNLOCK.spire) pool.push("spire", "spire");
  if (m >= UNLOCK.gull) pool.push("gull", "gull");
  if (m >= UNLOCK.crag) pool.push("crag");
  if (m >= UNLOCK.storm) pool.push("storm");

  const first = makeHazard(g, pool[Math.floor(Math.random() * pool.length)], x);
  g.hazards.push(first);

  const wantSecond = m > 240 && Math.random() < Math.min(0.2 + m * 0.00022, 0.6);
  if (wantSecond) {
    const cand = makeHazard(g, pool[Math.floor(Math.random() * pool.length)], x + rand(20, 90) * g.s);
    if (corridorSurvives(g, [first, cand])) g.hazards.push(cand);
  }

  /* feathers hang high — they're the relief valve for the wax meter, so they
     have to cost you the very thing they refund */
  if (Math.random() < 0.5) {
    g.feathers.push({
      id: uid++, x: x + rand(60, 220) * g.s,
      y: rand(30 * g.s, meltY(g) + 60 * g.s),
      phase: Math.random() * 9,
    });
  }
}

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;
  const s = g.s;

  const speed = speedFor(g.metres) * (g.glide > 0 ? 1.25 : 1);
  const dx = speed * dt;
  g.scroll += dx;
  g.metres += dx / PX_PER_METRE;
  g.score += (dx / PX_PER_METRE) * (g.glide > 0 ? GLIDE_SCORE_MULT : 1);

  const zi = skyAt(g.metres).index;
  if (zi !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(skyAt(g.metres).name);
    g.zoneIndex = zi;
  }

  /* ── flight ── */
  g.vy = Math.min(MAX_FALL * s, g.vy + GRAVITY * s * dt);
  g.py += g.vy * dt;
  if (g.py < 14 * s) { g.py = 14 * s; g.vy = 0; }
  g.tilt += (clamp(g.vy / (520 * s), -1, 1) * MAX_TILT - g.tilt) * Math.min(1, dt * 8);

  if (g.invuln > 0) g.invuln -= dt;
  if (g.glide > 0) {
    g.glide -= dt;
    g.charge = Math.max(0, g.glide / GLIDE_TIME);
    if (g.glide <= 0) { g.glide = 0; g.charge = 0; }
  }

  /* ── wax: the whole point of the game. Above the melt line it fills at a
     rate proportional to how far above you are; below it, it recovers. GLIDE
     suspends the heating entirely, which is what makes feathers worth the
     climb it takes to reach them. ── */
  const ml = meltY(g);
  if (g.glide > 0) {
    g.wax = Math.max(0, g.wax - WAX_COOL * dt);
  } else {
    const above = (ml - g.py) / ml;                       // 1 at the very top
    g.wax += (above > 0 ? above * WAX_GAIN : above * WAX_COOL) * dt;
    g.wax = clamp(g.wax, 0, 1);
  }

  /* ── spawn ── */
  g.nextSpawnAt -= dx;
  if (g.nextSpawnAt <= 0) {
    spawnWave(g);
    g.nextSpawnAt += spawnGapFor(g.metres) * s;
  }

  for (const o of g.hazards) {
    o.x -= dx;
    if (o.kind === "gull") {
      /* gulls fly *toward* him, so they close faster than the world scrolls
         and can't be outrun by simply holding altitude */
      o.x -= o.speed * dt;
      o.y += o.drift * dt;
      if (o.y < ml || o.y > seaY(g) - 40 * s) o.drift *= -1;
      o.top = o.y - 16 * s; o.bottom = o.y + 16 * s;
    }
  }
  g.hazards = g.hazards.filter(o => o.x > -140 * s);

  for (const f of g.feathers) f.x -= dx;
  g.feathers = g.feathers.filter(f => f.x > -40 * s);

  /* ── shed feathers as he cooks; they're the trail and the tell at once ── */
  const px = playerX(g);
  stream(g.parts, dt, g.reduced ? 8 : 6 + g.wax * 30, () => ({
    x: px - 10 * s, y: g.py + rand(-6, 6) * s,
    vx: -rand(30, 90) - speed * 0.25, vy: rand(20, 90),
    life: rand(0.4, 0.9), r: rand(1.6, 3.4) * s,
    color: g.wax > 0.5 ? palette.accent : "#FFFFFF", kind: "spark",
  }));
  updateParticles(g.parts, dt);

  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.4);

  /* ── feathers first: clipping a feather and a crag in the same frame should
     read as "I got it, then died", not swallow the pickup ── */
  const grab = (FEATHER_PICKUP_R + PLAYER_R) * s;
  for (let i = g.feathers.length - 1; i >= 0; i--) {
    const f = g.feathers[i];
    if (Math.hypot(f.x - px, f.y - g.py) > grab) continue;
    g.feathers.splice(i, 1);
    g.score += FEATHER_POINTS * (g.glide > 0 ? GLIDE_SCORE_MULT : 1);
    g.wax = Math.max(0, g.wax - FEATHER_COOL);
    burst(g.parts, f.x, f.y, "#FFFFFF", 12, 190, 4, g.reduced ? 0.4 : 1);
    if (g.glide > 0) { g.onFeather?.(); continue; }
    g.charge = Math.min(1, g.charge + FEATHER_FILL);
    if (g.charge >= 1) {
      g.glide = GLIDE_TIME;
      g.shake = 0.3;
      burst(g.parts, px, g.py, palette.hot, 28, 320, 5, g.reduced ? 0.4 : 1);
      g.onGlide?.();
    } else {
      g.onFeather?.();
    }
  }

  /* ── the two boundaries ── */
  if (g.wax >= 1) return die(g, "melt", px, g.py);
  if (g.py + PLAYER_R * s > seaY(g)) return die(g, "sea", px, seaY(g));

  /* ── hazards ── */
  const pr = PLAYER_R * s;
  for (let i = g.hazards.length - 1; i >= 0; i--) {
    const o = g.hazards[i];
    if (!hits(g, o, pr, px)) continue;
    if (g.glide > 0 && o.kind !== "spire") {
      /* GLIDE burns through what it meets — but not a mountain of rock, so
         the power-up never becomes a licence to stop steering */
      g.hazards.splice(i, 1);
      g.score += BURN_POINTS * GLIDE_SCORE_MULT;
      burst(g.parts, o.x, o.y, palette.accent, 16, 260, 5, g.reduced ? 0.4 : 1);
      g.onBurn?.();
      continue;
    }
    if (g.invuln <= 0) return die(g, o.kind, o.x, o.y);
  }
}

function hits(g, o, pr, px) {
  const s = g.s;
  if (o.kind === "spire") {
    const dx = Math.max(Math.abs(px - o.x) - o.hw * 0.72, 0);
    /* only the part standing proud of the sea is solid */
    const cy = (o.top + g.h) / 2, chh = (g.h - o.top) / 2;
    const dy = Math.max(Math.abs(g.py - cy) - chh, 0);
    return dx * dx + dy * dy < pr * pr;
  }
  if (o.kind === "storm") {
    const dx = Math.max(Math.abs(px - o.x) - o.hw * 0.86, 0);
    const dy = Math.max(Math.abs(g.py - o.y) - o.hh * 0.62, 0);
    return dx * dx + dy * dy < pr * pr;
  }
  if (o.kind === "crag") {
    const dx = (px - o.x) / (o.r * s + pr);
    const dy = (g.py - o.y) / (o.r * s * 0.7 + pr);
    return dx * dx + dy * dy < 1;
  }
  // gull — an ellipse tight to the body, the wings are mostly feather
  const dx = (px - o.x) / (16 * s + pr);
  const dy = (g.py - o.y) / (10 * s + pr);
  return dx * dx + dy * dy < 1;
}

function die(g, cause, x, y) {
  g.shake = 1;
  burst(g.parts, playerX(g), g.py, cause === "melt" ? palette.accent : "#FFFFFF", 26, 340, 5, g.reduced ? 0.4 : 1);
  if (cause !== "melt") burst(g.parts, x, y, palette.accentHot, 12, 220, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(cause);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h, s, t } = g;

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 11 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  const sky = skyAt(g.metres);
  drawSky(ctx, w, h, sky);
  drawSkyLayers(ctx, w, h, g.sky, sky, t, { sx: g.scroll, body: false });

  drawSun(ctx, w * 0.5, h * 0.085, Math.min(w, h) * 0.095, t, g.wax);
  drawMeltLine(ctx, w, meltY(g), t, g.wax);
  drawSea(ctx, w, h, seaY(g), g.sea, g.scroll, t);

  for (const f of g.feathers) {
    ctx.save(); ctx.translate(f.x, f.y);
    drawFeather(ctx, s, t, f.phase);
    ctx.restore();
  }

  for (const o of g.hazards) {
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.kind === "spire") drawSpire(ctx, s, o.hw, o.hgt);
    else if (o.kind === "crag") drawCrag(ctx, s, o.r, o.pts, Math.sin(t * 1.6 + o.bobPh) * 5 * s);
    else if (o.kind === "gull") drawGull(ctx, s, t, o.phase);
    else drawStorm(ctx, s, o.hw, o.hh, t, o.phase);
    ctx.restore();
  }

  drawParticles(ctx, g.parts);

  if (g.running) {
    ctx.save();
    ctx.translate(playerX(g), g.py);
    drawIcarus(ctx, s, t, g.tilt, g.wax, g.glide, g.invuln > 0 && g.glide <= 0);
    ctx.restore();
  }

  drawMotes(ctx, w, h, g.sky, g.scroll, 0, clamp((speedFor(g.metres) - 210) / 350, 0, 1), sky);

  /* the closer he is to melting, the more the whole frame bleaches — the
     failure state should be visible without ever reading a number */
  if (g.wax > 0.4) {
    ctx.fillStyle = `rgba(255,245,200,${(g.wax - 0.4) * 0.42})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

/** Static hero for the menu — the same sprite, gliding. */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2 + Math.sin(t * 1.9) * 6);
  ctx.rotate(Math.sin(t * 1.4) * 0.1);
  drawIcarus(ctx, 1.5, t, 0, 0, 0, false);
  ctx.restore();
}
