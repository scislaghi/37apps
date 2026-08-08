/* ══ Prometheus — simulation ══
   A lattice of rows × columns cut into a cliff. Every input moves you *up*
   (tap = straight up, swipe = up and one column over), so there is no way to
   stall — and generation guarantees at least one reachable cell in the row
   above, so there is never a row you simply cannot leave.

   World coordinates run downward like screen space; rows climb into negative
   y. `camY` is the world-y currently at the top of the screen, so
   screenY = worldY - camY. */

import { clamp, rng } from "@37apps/core/canvas/color.js";
import { makeSkyLadder, drawSky } from "@37apps/core/canvas/sky.js";
import { createSkyBackdrop, drawSkyLayers } from "@37apps/core/canvas/skyBackdrop.js";
import { createParticles, burst, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette, ZONES, COLS, ROW_H, FIELD_L, FIELD_R, METRES_PER_ROW,
  HOP_MS, HOP_ARC, PLAYER_SCREEN_RATIO, PLAYER_R, FOOT_OFFSET, FALL_GRAVITY, FALL_MAX,
  CAM_LERP, CRUMBLE_MS, CRUMBLE_FADE, UNLOCK,
  BIRD_SPEED, ROCK_WARN, ROCK_SPEED,
  EMBER_CHANCE, EMBER_FILL, EMBER_POINTS, BURN_POINTS,
  BLAZE_TIME, BLAZE_SCORE_MULT, SIGN_EVERY, REVIVE_GRACE,
  scaleFor, extraFor, cloudChanceFor, stormChanceFor, creepFor, birdGapFor, rockGapFor,
} from "./constants.js";
import {
  createWall, drawWall, drawLedge, drawCloud, drawStorm, drawBird,
  drawFallRock, drawRockWarn, drawEmber, drawSign, drawPrometheus,
} from "./sprites.js";

const { skyAt } = makeSkyLadder(ZONES);
let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

/* cell kinds */
const EMPTY = 0, LEDGE = 1, CLOUD = 2, STORM = 3;

export function createGame({ onHop, onEmber, onBlaze, onBurn, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false,

    rows: new Map(),          // rowIndex → { cells: number[], ember: number|-1, crumble: number[] }
    topRow: -1,               // highest row generated so far

    col: 2, row: 0,
    px: 0, py: 0,             // world position (drawn position, mid-hop included)
    facing: 1,
    state: "idle",            // idle | hop | fall
    hopT: 0, fromCol: 2, fromRow: 0, toCol: 2, toRow: 0,
    vy: 0, squash: 0,

    camY: 0,
    metres: 0, score: 0, best: 0, zoneIndex: -1,
    blaze: 0, flame: 0, invuln: 0,

    birds: [], rocks: [],
    birdTimer: 3, rockTimer: 6,
    parts: createParticles(),
    wall: createWall(),
    sky: createSkyBackdrop(4242),
    shake: 0,

    onHop, onEmber, onBlaze, onBurn, onDeath, onZone,
  };

  g.resize = (w, h) => { g.w = w; g.h = h; g.s = scaleFor(w); };

  g.reset = () => {
    g.t = 0;
    g.rows = new Map();
    g.topRow = -1;
    g.col = 2; g.row = 0;
    g.state = "idle"; g.hopT = 0; g.vy = 0; g.squash = 0; g.facing = 1;
    g.metres = 0; g.score = 0; g.zoneIndex = -1;
    g.blaze = 0; g.flame = 0; g.invuln = 1;
    g.birds = []; g.rocks = [];
    g.birdTimer = 3.5; g.rockTimer = 7;
    g.parts = createParticles();
    g.shake = 0;

    /* the opening row is solid all the way across, so the first tap can never
       be the one that kills you */
    g.rows.set(0, { cells: Array(COLS).fill(LEDGE), ember: -1, crumble: Array(COLS).fill(0) });
    g.topRow = 0;
    ensureRows(g, 14);

    g.px = colX(g, 2);
    g.py = rowY(0);
    g.camY = g.py - g.h * PLAYER_SCREEN_RATIO;
  };

  g.revive = () => {
    /* put solid ground back under him and clear what's in flight */
    const r = ensureRow(g, g.row);
    r.cells[g.col] = LEDGE;
    r.crumble[g.col] = 0;
    g.state = "idle";
    g.vy = 0;
    g.py = rowY(g.row);
    g.px = colX(g, g.col);
    g.birds = []; g.rocks = [];
    g.invuln = REVIVE_GRACE;
    burst(g.parts, g.px, g.py, palette.flameHot, 22, 260, 5, g.reduced ? 0.4 : 1);
  };

  /* ── input: every move is a hop upward, so there's no "wait" button ── */
  g.hop = (dx) => {
    if (g.state !== "idle") return;
    const toCol = clamp(g.col + dx, 0, COLS - 1);
    /* a sideways hop into a wall becomes a straight-up hop rather than being
       swallowed — a dead input at the screen edge feels like a dropped tap */
    g.fromCol = g.col; g.fromRow = g.row;
    g.toCol = toCol; g.toRow = g.row + 1;
    g.hopT = 0;
    g.state = "hop";
    if (dx) g.facing = dx > 0 ? 1 : -1;
    g.onHop?.();
  };

  let down = null;
  g.pointerDown = (x, y) => { down = { x, y, t: performance.now() }; };
  g.pointerUp = (x, y) => {
    if (!down) return;
    const dx = x - down.x, dy = y - down.y;
    down = null;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) g.hop(dx > 0 ? 1 : -1);
    else g.hop(0);
  };
  g.key = (k) => {
    if (k === "left") g.hop(-1);
    else if (k === "right") g.hop(1);
    else g.hop(0);
  };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  if (import.meta.env.DEV) window.__prometheus = g;
  return g;
}

/* ── lattice geometry ─────────────────────────────────────────────────── */

const rowY = (i) => -i * ROW_H;
function colX(g, c) {
  const l = g.w * FIELD_L, r = g.w * FIELD_R;
  return l + ((r - l) / (COLS - 1)) * c;
}
const screenY = (g, worldY) => worldY - g.camY;

/* ── generation ───────────────────────────────────────────────────────── */

function ensureRow(g, i) {
  let r = g.rows.get(i);
  if (!r) { r = { cells: Array(COLS).fill(EMPTY), ember: -1, crumble: Array(COLS).fill(0) }; g.rows.set(i, r); }
  return r;
}

/**
 * Builds row `i` from row `i-1`. The contract that makes the game fair: for
 * every occupied cell below, at least one of {c-1, c, c+1} up here is solid
 * footing. Extra platforms on top of that are what difficulty actually tunes.
 */
function genRow(g, i) {
  const below = g.rows.get(i - 1);
  const cells = Array(COLS).fill(EMPTY);
  const m = i * METRES_PER_ROW;

  const cloudP = cloudChanceFor(m);
  const stormP = stormChanceFor(m);
  const pick = () => {
    if (m >= UNLOCK.cloud && Math.random() < cloudP) {
      return (m >= UNLOCK.storm && Math.random() < stormP) ? STORM : CLOUD;
    }
    return LEDGE;
  };

  if (below) {
    for (let c = 0; c < COLS; c++) {
      if (below.cells[c] === EMPTY || below.cells[c] === STORM) continue;
      const opts = [c - 1, c, c + 1].filter(x => x >= 0 && x < COLS);
      /* if one of the reachable cells is already real footing we're done —
         otherwise carve one, and never make the guaranteed cell a storm */
      if (opts.some(x => cells[x] === LEDGE || cells[x] === CLOUD)) continue;
      const target = opts[Math.floor(Math.random() * opts.length)];
      const k = pick();
      cells[target] = k === STORM ? CLOUD : k;
    }
  }

  let extra = extraFor(m);
  while (extra > 0) {
    if (Math.random() < Math.min(1, extra)) {
      const c = Math.floor(Math.random() * COLS);
      if (cells[c] === EMPTY) cells[c] = pick();
    }
    extra -= 1;
  }

  const occupied = [];
  for (let c = 0; c < COLS; c++) if (cells[c] !== EMPTY) occupied.push(c);
  const ember = occupied.length && Math.random() < EMBER_CHANCE
    ? occupied[Math.floor(Math.random() * occupied.length)] : -1;

  g.rows.set(i, { cells, ember, crumble: Array(COLS).fill(0) });
}

function ensureRows(g, ahead) {
  while (g.topRow < g.row + ahead) {
    g.topRow += 1;
    genRow(g, g.topRow);
  }
}

const solid = (k) => k === LEDGE || k === CLOUD;

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;
  const s = g.s;

  if (g.invuln > 0) g.invuln -= dt;
  if (g.blaze > 0) {
    g.blaze -= dt;
    g.flame = Math.max(0, g.blaze / BLAZE_TIME);
    if (g.blaze <= 0) { g.blaze = 0; g.flame = 0; }
  }

  /* ── movement ── */
  if (g.state === "hop") {
    g.hopT += dt * 1000 / HOP_MS;
    if (g.hopT >= 1) {
      g.hopT = 1;
      land(g);
    }
    const k = g.hopT;
    g.px = colX(g, g.fromCol) + (colX(g, g.toCol) - colX(g, g.fromCol)) * k;
    g.py = rowY(g.fromRow) + (rowY(g.toRow) - rowY(g.fromRow)) * k - Math.sin(k * Math.PI) * HOP_ARC * s;
    /* stretch on the way up, squash into the landing */
    g.squash = -Math.sin(k * Math.PI) * 0.5;
  } else if (g.state === "fall") {
    g.vy = Math.min(FALL_MAX, g.vy + FALL_GRAVITY * dt);
    const prev = g.py;
    g.py += g.vy * dt;
    catchFall(g, prev);
  } else {
    g.squash += (0 - g.squash) * Math.min(1, dt * 12);
    g.px = colX(g, g.col);
    g.py = rowY(g.row);
  }

  ensureRows(g, 14);

  /* ── camera: rises to follow, never sinks, plus a creep that punishes
     hesitation. Clamping to "never sink" is what stops a recovery fall from
     yanking the view down and disorienting the player mid-save. ── */
  const target = g.py - g.h * PLAYER_SCREEN_RATIO;
  if (target < g.camY) g.camY += (target - g.camY) * Math.min(1, dt * CAM_LERP);
  g.camY -= creepFor(g.metres) * dt;

  /* ── crumbling ── */
  for (const [, r] of g.rows) {
    for (let c = 0; c < COLS; c++) {
      if (r.crumble[c] > 0) {
        r.crumble[c] += dt * 1000;
        if (r.crumble[c] > CRUMBLE_MS + CRUMBLE_FADE) r.cells[c] = EMPTY;
      }
    }
  }
  /* if the cloud he's standing on finished crumbling, he drops */
  if (g.state === "idle") {
    const r = g.rows.get(g.row);
    if (!r || !solid(r.cells[g.col])) startFall(g);
  }

  /* ── birds ── */
  if (g.metres >= UNLOCK.bird) {
    g.birdTimer -= dt;
    if (g.birdTimer <= 0) {
      g.birdTimer = birdGapFor(g.metres) * rand(0.75, 1.3);
      const dir = Math.random() > 0.5 ? 1 : -1;
      /* aimed a couple of rows above him: a bird level with the player is
         unavoidable, a bird where he's *going* is a decision */
      const y = rowY(g.row + Math.floor(rand(1, 4))) + rand(-30, 30) * s;
      g.birds.push({
        id: uid++, y, dir, x: dir > 0 ? -40 * s : g.w + 40 * s,
        speed: BIRD_SPEED * rand(0.8, 1.35) * s, phase: Math.random() * 9,
      });
    }
  }
  for (const b of g.birds) b.x += b.dir * b.speed * dt;
  g.birds = g.birds.filter(b => b.x > -90 * s && b.x < g.w + 90 * s && screenY(g, b.y) < g.h + 120);

  /* ── falling rocks ── */
  if (g.metres >= UNLOCK.rockfall) {
    g.rockTimer -= dt;
    if (g.rockTimer <= 0) {
      g.rockTimer = rockGapFor(g.metres) * rand(0.8, 1.3);
      g.rocks.push({
        id: uid++, col: Math.floor(Math.random() * COLS), age: 0,
        y: g.camY - 60 * s, r: rand(15, 23),
        pts: Array.from({ length: 8 }, (_, i) => [(Math.PI * 2 * i) / 8, 0.74 + Math.random() * 0.4]),
        spin: 0, spinV: rand(-3, 3),
      });
    }
  }
  for (const r of g.rocks) {
    r.age += dt;
    if (r.age >= ROCK_WARN) {
      r.y += ROCK_SPEED * s * dt;
      r.spin += r.spinV * dt;
    } else {
      r.y = g.camY - 40 * s;
    }
  }
  g.rocks = g.rocks.filter(r => screenY(g, r.y) < g.h + 140);

  updateParticles(g.parts, dt);
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.4);

  /* ── score ── */
  const reached = Math.max(g.row, g.toRow);
  const m = Math.max(0, reached * METRES_PER_ROW);
  if (m > g.metres) {
    g.score += (m - g.metres) * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);
    g.metres = m;
  }

  const zi = skyAt(g.metres).index;
  if (zi !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(skyAt(g.metres).name);
    g.zoneIndex = zi;
  }

  /* ── contact ── */
  const pr = PLAYER_R * s;

  for (let i = g.birds.length - 1; i >= 0; i--) {
    const b = g.birds[i];
    if (Math.hypot(b.x - g.px, b.y - (g.py - 8 * s)) > pr + 13 * s) continue;
    if (g.blaze > 0) {
      g.birds.splice(i, 1);
      g.score += BURN_POINTS * BLAZE_SCORE_MULT;
      burst(g.parts, b.x, b.y, palette.flame, 14, 250, 5, g.reduced ? 0.4 : 1);
      g.onBurn?.();
      continue;
    }
    if (g.invuln <= 0) return die(g, "bird", b.x, b.y);
  }

  for (let i = g.rocks.length - 1; i >= 0; i--) {
    const r = g.rocks[i];
    if (r.age < ROCK_WARN) continue;
    if (Math.hypot(colX(g, r.col) - g.px, r.y - (g.py - 10 * s)) > pr + r.r * s * 0.85) continue;
    if (g.blaze > 0) {
      g.rocks.splice(i, 1);
      g.score += BURN_POINTS * BLAZE_SCORE_MULT;
      burst(g.parts, colX(g, r.col), r.y, palette.rockLit, 14, 250, 5, g.reduced ? 0.4 : 1);
      g.onBurn?.();
      continue;
    }
    if (g.invuln <= 0) return die(g, "rock", colX(g, r.col), r.y);
  }

  /* fell off the bottom of the world */
  if (screenY(g, g.py) > g.h + 40) return die(g, "fall", g.px, g.py);
}

function startFall(g) {
  g.state = "fall";
  g.vy = 0;
  g.squash = -0.3;
}

/** Landing resolution for a completed hop. */
function land(g) {
  g.col = g.toCol;
  g.row = g.toRow;
  g.state = "idle";
  g.hopT = 0;
  g.squash = 0.55;

  const r = ensureRow(g, g.row);
  const cell = r.cells[g.col];

  if (!solid(cell)) {
    /* STORM looks like footing and isn't; EMPTY is just air. Both drop him,
       and the fall is survivable if there's something below in this column. */
    if (cell === STORM) {
      burst(g.parts, g.px, g.py, "#8E86C9", 12, 200, 4, g.reduced ? 0.4 : 1);
    }
    startFall(g);
    return;
  }

  if (r.ember === g.col) {
    r.ember = -1;
    g.score += EMBER_POINTS * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);
    burst(g.parts, g.px, g.py - 14 * g.s, palette.flame, 12, 190, 4, g.reduced ? 0.4 : 1);
    if (g.blaze <= 0) {
      g.flame = Math.min(1, g.flame + EMBER_FILL);
      if (g.flame >= 1) {
        g.blaze = BLAZE_TIME;
        g.shake = 0.3;
        burst(g.parts, g.px, g.py - 14 * g.s, palette.flameHot, 28, 320, 5, g.reduced ? 0.4 : 1);
        g.onBlaze?.();
      } else g.onEmber?.();
    } else g.onEmber?.();
  }

  /* clouds start crumbling the moment he touches down — during BLAZE the fire
     holds them together, which is a far better reward than raw invincibility */
  if (cell === CLOUD && g.blaze <= 0 && r.crumble[g.col] === 0) r.crumble[g.col] = 1;

  burst(g.parts, g.px, g.py, cell === CLOUD ? "#FFFFFF" : palette.rockLit, 5, 90, 3, g.reduced ? 0.4 : 1);
}

/** While falling, catch on the first solid cell crossed in this column. */
function catchFall(g, prevY) {
  for (let i = g.row; i >= g.row - 40; i--) {
    const r = g.rows.get(i);
    if (!r || !solid(r.cells[g.col])) continue;
    const y = rowY(i);
    if (prevY <= y && g.py >= y) {
      g.row = i;
      g.py = y;
      g.state = "idle";
      g.vy = 0;
      g.squash = 0.7;
      if (r.cells[g.col] === CLOUD && g.blaze <= 0 && r.crumble[g.col] === 0) r.crumble[g.col] = 1;
      burst(g.parts, g.px, g.py, palette.rockLit, 8, 140, 3, g.reduced ? 0.4 : 1);
      return;
    }
  }
}

function die(g, cause, x, y) {
  g.shake = 1;
  burst(g.parts, g.px, g.py - 10 * g.s, palette.accent, 26, 340, 5, g.reduced ? 0.4 : 1);
  if (cause !== "fall") burst(g.parts, x, y, palette.flame, 12, 220, 4, g.reduced ? 0.4 : 1);
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
  drawSkyLayers(ctx, w, h, g.sky, sky, t, { sy: -g.camY, anchor: { x: 0.82, y: 0.16 } });

  drawWall(ctx, w, h, g.wall, g.camY, s);

  /* the grass apron only exists at the very bottom of the world, so the first
     screen reads as "you're setting off from the ground" */
  const groundY = screenY(g, rowY(0) + 74 * s);
  if (groundY < h + 40) {
    ctx.fillStyle = palette.grass;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 14 * s);
    ctx.quadraticCurveTo(w * 0.5, groundY - 10 * s, w, groundY + 14 * s);
    ctx.lineTo(w, h + 20);
    ctx.lineTo(0, h + 20);
    ctx.closePath();
    ctx.fill();
  }

  /* ── platforms + signposts ── */
  /* Row indices climb as world-y falls, so the *lowest* visible index is the
     one at the bottom edge. Deriving `first` from the top edge and adding a
     screen height walks the range the wrong way and leaves the bottom half of
     the screen empty. */
  const firstRow = Math.floor((-h - g.camY) / ROW_H) - 2;
  const lastRow = Math.ceil(-g.camY / ROW_H) + 2;
  const hw = ((w * FIELD_R - w * FIELD_L) / (COLS - 1)) * 0.42;

  for (let i = Math.max(0, firstRow); i <= lastRow; i++) {
    const r = g.rows.get(i);
    if (!r) continue;
    const y = screenY(g, rowY(i));
    if (y < -80 || y > h + 80) continue;

    if (i > 0 && i % SIGN_EVERY === 0) {
      ctx.save();
      ctx.translate(w * 0.5, y - 46 * s);
      drawSign(ctx, s, i * METRES_PER_ROW);
      ctx.restore();
    }

    for (let c = 0; c < COLS; c++) {
      const k = r.cells[c];
      if (k === EMPTY) continue;
      const x = colX(g, c);
      ctx.save();
      ctx.translate(x, y);
      if (k === LEDGE) drawLedge(ctx, s, hw);
      else if (k === STORM) drawStorm(ctx, s, hw, t, c * 1.7 + i);
      else {
        const cr = r.crumble[c];
        const prog = cr === 0 ? 0 : Math.min(1, cr / CRUMBLE_MS);
        const alpha = cr > CRUMBLE_MS ? Math.max(0, 1 - (cr - CRUMBLE_MS) / CRUMBLE_FADE) : 1;
        /* a crumbling cloud sags and shivers before it goes — the tell has to
           arrive before the platform does */
        if (prog > 0) ctx.translate(Math.sin(t * 40) * prog * 1.6 * s, 0);
        drawCloud(ctx, s, hw, alpha, prog);
      }
      ctx.restore();

      if (r.ember === c) {
        ctx.save();
        ctx.translate(x, y - 26 * s);
        drawEmber(ctx, s, t, c * 2.1);
        ctx.restore();
      }
    }
  }

  /* ── hazards ── */
  for (const r of g.rocks) {
    const x = colX(g, r.col);
    if (r.age < ROCK_WARN) {
      drawRockWarn(ctx, s, x, 26 * s, r.age / ROCK_WARN);
    } else {
      ctx.save();
      ctx.translate(x, screenY(g, r.y));
      drawFallRock(ctx, s, r.r, r.pts, r.spin);
      ctx.restore();
    }
  }

  for (const b of g.birds) {
    ctx.save();
    ctx.translate(b.x, screenY(g, b.y));
    drawBird(ctx, s, t, b.dir, b.phase);
    ctx.restore();
  }

  drawParticles(ctx, g.parts);

  if (g.running) {
    ctx.save();
    ctx.translate(g.px, screenY(g, g.py) - FOOT_OFFSET * s);
    drawPrometheus(ctx, s, t, g.facing, g.squash, g.blaze, g.invuln > 0 && g.blaze <= 0);
    ctx.restore();
  }

  ctx.restore();
}

/** Static hero for the menu — the same sprite, idling on a ledge. */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const s = 1.15;
  const ledgeY = h * 0.82;
  /* ledge first, then him on top of it — drawn the other way round he ends up
     buried inside his own footing */
  ctx.save();
  ctx.translate(w / 2, ledgeY);
  drawLedge(ctx, s, 34);
  ctx.restore();
  ctx.save();
  ctx.translate(w / 2, ledgeY - FOOT_OFFSET * s + Math.sin(t * 2) * 2);
  drawPrometheus(ctx, s, t, 1, Math.sin(t * 2) * 0.06, 0, false);
  ctx.restore();
}

export { rng };
