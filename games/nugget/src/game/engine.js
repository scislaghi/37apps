/* ══ Nugget — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas.

   The rules, in full:
     · the miner runs right along one of three stacked tunnels, forever;
     · nuggets are worth exactly +1 each — no multipliers, no bonuses;
     · a boulder hangs from the ceiling of one tunnel. Be under it when it
       comes down and you're crushed; be anywhere else and it just becomes a
       rock you'd rather not run into. */

import { clamp } from "@37apps/core/canvas/color.js";
import { createParticles, emit, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette, LANES, PX_PER_METRE,
  HOP_TIME, HOP_BUFFER, HOP_ARC,
  FALL_LEAD, RUMBLE_LEAD, FALL_GRAVITY,
  GOLD_PICKUP_R, GOLD_SPREAD, VEIN_EVERY, REVIVE_GRACE,
  BASE_SPEED, MAX_SPEED,
  speedFor, colGapFor, goldTargetFor, doubleChanceFor,
} from "./constants.js";
import { applyLayout, laneFloorY, laneCeilY } from "./layout.js";
import { createMine, drawMine, drawForeground } from "./backdrop.js";
import { drawMiner, drawNugget, drawBoulder, drawCrushZone, drawLampCone } from "./sprites.js";

let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (k) => 1 - Math.pow(1 - k, 2.4);

export function createGame({ onGold, onHop, onLand, onRumble, onVein, onDeath } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false,

    scroll: 0, speed: 0, score: 0, depth: 0, streak: 0,
    lane: 1, laneFrom: 1, hopT: 1, queued: 0, squash: 0,

    rocks: [], golds: [], pops: [],
    parts: createParticles(),
    mine: createMine(),

    nextColX: 0, lastGoldX: 0, prevSafe: [0, 1, 2],
    shake: 0, invuln: 0,

    onGold, onHop, onLand, onRumble, onVein, onDeath,
  };

  applyLayout(g, g.w, g.h);

  g.resize = (w, h) => {
    applyLayout(g, w, h);
  };

  g.reset = () => {
    g.t = 0;
    g.scroll = 0; g.score = 0; g.depth = 0; g.streak = 0;
    g.lane = 1; g.laneFrom = 1; g.hopT = 1; g.queued = 0; g.squash = 0;
    g.rocks = []; g.golds = []; g.pops = [];
    g.parts = createParticles();
    g.nextColX = g.w * 1.7;    // a beat of empty tunnel before the first rock
    g.lastGoldX = g.w * 0.75;
    g.prevSafe = [0, 1, 2];
    g.firstColumn = true;
    g.shake = 0; g.invuln = 0.9;
    g.speed = speedFor(0) * g.s;
  };

  /** Rewarded-ad continue: clear the rocks around the miner, hand back grace. */
  g.revive = () => {
    g.rocks = g.rocks.filter(o => {
      const sx = o.wx - g.scroll;
      return sx < g.playerX - g.cell || sx > g.playerX + g.cell * 3.2;
    });
    g.invuln = REVIVE_GRACE;
    g.squash = 0;
    burst(g.parts, g.playerX, feetY(g) - g.bodyH * 0.5, palette.goldHot, 24, 260, 4, g.reduced ? 0.4 : 1);
  };

  /** @param {-1|1} dir  -1 = up a tunnel, +1 = down a tunnel */
  g.hop = (dir) => {
    if (!g.running) return;
    /* late input inside a hop is buffered rather than dropped — at speed the
       player is already thinking about the next tunnel before this one lands.
       Input in the *first* half of a hop is ignored on purpose: that's a
       double-tap, and honouring it would fling him two lanes he can't see. */
    if (g.hopT < 1) {
      if (g.hopT >= HOP_BUFFER) g.queued = dir;
      return;
    }
    doHop(g, dir);
  };

  /** Tap-to-hop: above the current tunnel's midline goes up, below goes down. */
  g.tapAt = (y) => {
    const mid = laneFloorY(g, g.lane) - g.laneH * 0.5;
    g.hop(y < mid ? -1 : 1);
  };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__nugget = g;
  return g;
}

function doHop(g, dir) {
  const next = clamp(g.lane + dir, 0, LANES - 1);
  if (next === g.lane) return;
  g.laneFrom = g.lane;
  g.lane = next;
  g.hopT = 0;
  g.queued = 0;
  burst(g.parts, g.playerX, laneFloorY(g, g.laneFrom), "#6A6178", g.reduced ? 3 : 7, 120, 2.6, g.reduced ? 0.5 : 1);
  g.onHop?.();
}

/* ── where the miner is ────────────────────────────────────────────────── */

function feetY(g) {
  const a = laneFloorY(g, g.laneFrom);
  const b = laneFloorY(g, g.lane);
  const arc = g.laneFrom === g.lane ? 0 : Math.sin(Math.PI * Math.min(1, g.hopT)) * HOP_ARC * g.s;
  return a + (b - a) * easeOut(Math.min(1, g.hopT)) - arc;
}

/** 0 = planted on a floor, 1 = top of the hop. Drives the sprite's tuck. */
function hopK(g) {
  if (g.laneFrom === g.lane || g.hopT >= 1) return 0;
  return Math.sin(Math.PI * g.hopT);
}

/* ── spawning ──────────────────────────────────────────────────────────── */

/**
 * One column of the shaft: one boulder (two once the player has some score),
 * never all three, and never a layout whose only safe tunnel is two hops from
 * the last one — a run should end because the player misread a rock, not
 * because the shaft asked for a jump the miner can't make.
 */
function spawnColumn(g) {
  const wx = g.nextColX;
  const lanes = [0, 1, 2];
  const wantDouble = !g.firstColumn && Math.random() < doubleChanceFor(g.score);
  let pick = null;

  for (let attempt = 0; attempt < 14 && !pick; attempt++) {
    const n = wantDouble && attempt < 9 ? 2 : 1;
    const blocked = [];
    while (blocked.length < n) {
      const l = (Math.random() * LANES) | 0;
      /* the opening rock never lands on the lane the miner starts in: a run
         that ends before the player has moved once teaches nothing */
      if (g.firstColumn && l === 1) continue;
      if (!blocked.includes(l)) blocked.push(l);
    }
    const safe = lanes.filter(l => !blocked.includes(l));
    if (safe.some(l => g.prevSafe.some(p => Math.abs(p - l) <= 1))) pick = { blocked, safe };
  }
  /* a single-boulder column is always reachable from any lane, so this is a
     guaranteed-valid fallback rather than a "shouldn't happen" branch */
  if (!pick) {
    const from = g.firstColumn ? [0, 2] : lanes;
    const b = from[(Math.random() * from.length) | 0];
    pick = { blocked: [b], safe: lanes.filter(l => l !== b) };
  }
  g.firstColumn = false;

  for (const lane of pick.blocked) {
    const r = g.rockR * rand(0.86, 1.1);
    g.rocks.push({
      id: uid++, lane, wx, r, seed: Math.random() * 100,
      state: "hang", y: laneCeilY(g, lane) + r * 0.7, vy: 0, rumble: 0, dust: 0,
    });
    /* a nugget already sitting where a boulder just appeared would be bait
       with no way out — drop it and let the maintainer place another */
    g.golds = g.golds.filter(o => !(o.lane === lane && Math.abs(o.wx - wx) < g.cell * 0.85));
  }
  g.prevSafe = pick.safe;
}

/** Places one nugget ahead of the miner, never inside a known boulder cell. */
function spawnGold(g) {
  const s = g.s;
  const base = Math.max(g.scroll + g.w + 40 * s, g.lastGoldX + rand(GOLD_SPREAD[0], GOLD_SPREAD[1]) * s);
  for (let attempt = 0; attempt < 12; attempt++) {
    const wx = base + attempt * 26 * s + rand(0, 90) * s;
    const lane = (Math.random() * LANES) | 0;
    if (g.rocks.some(o => o.lane === lane && Math.abs(o.wx - wx) < g.cell * 0.85)) continue;
    if (g.golds.some(o => o.lane === lane && Math.abs(o.wx - wx) < g.cell * 0.7)) continue;
    g.golds.push({ id: uid++, lane, wx, phase: Math.random() * 6.28, bob: Math.random() * 6.28 });
    g.lastGoldX = Math.max(g.lastGoldX, wx);
    return true;
  }
  return false;
}

function goldY(g, o) {
  return laneFloorY(g, o.lane) - g.bodyH * 0.52 + Math.sin(g.t * 2.2 + o.bob) * 4 * g.s;
}

/* ── update ────────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;

  g.speed = speedFor(g.score) * g.s;
  const dx = g.speed * dt;
  g.scroll += dx;
  g.depth += dx / (PX_PER_METRE * g.s);

  /* ── the hop ── */
  if (g.hopT < 1) {
    g.hopT = Math.min(1, g.hopT + dt / HOP_TIME);
    if (g.hopT >= 1) {
      g.squash = 1;
      burst(g.parts, g.playerX, laneFloorY(g, g.lane), "#6A6178", g.reduced ? 4 : 9, 150, 2.8, g.reduced ? 0.5 : 1);
      g.onLand?.();
      if (g.queued) doHop(g, g.queued);
    }
  }
  g.squash = Math.max(0, g.squash - dt * 5.5);
  if (g.invuln > 0) g.invuln -= dt;
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.2);

  /* ── keep the shaft ahead of the miner stocked ── */
  while (g.nextColX < g.scroll + g.w + g.cell) {
    spawnColumn(g);
    g.nextColX += colGapFor(g.score) * g.s;
  }
  let guard = 0;
  while (g.golds.length < goldTargetFor(g.score) && guard++ < 6) {
    if (!spawnGold(g)) break;
  }

  /* ── boulders: hang → rumble → fall → landed ── */
  for (const o of g.rocks) {
    const sx = o.wx - g.scroll;
    const lead = (sx - g.playerX) / Math.max(1, g.speed);   // seconds until it reaches him

    if (o.state === "hang") {
      o.rumble = lead < RUMBLE_LEAD ? clamp(1 - lead / RUMBLE_LEAD, 0, 1) : 0;
      /* grit trickling out of the ceiling: the audible-looking part of the
         warning, so the tell isn't carried by colour alone */
      if (o.rumble > 0.2) {
        o.dust += o.rumble * dt * (g.reduced ? 6 : 22);
        while (o.dust >= 1) {
          o.dust -= 1;
          emit(g.parts, {
            x: sx + rand(-o.r, o.r), y: o.y + o.r * 0.6,
            vx: rand(-10, 10), vy: rand(20, 90),
            life: rand(0.3, 0.7), r: rand(0.8, 1.8) * g.s,
            color: "#7A7188", grav: 220, kind: "chip",
          });
        }
      }
      if (lead <= FALL_LEAD) {
        o.state = "fall";
        o.vy = 0;
        g.onRumble?.();
      }
    } else if (o.state === "fall") {
      o.vy += FALL_GRAVITY * g.s * dt;
      o.y += o.vy * dt;
      const rest = laneFloorY(g, o.lane) - o.r * 0.86;
      if (o.y >= rest) {
        o.y = rest;
        o.state = "landed";
        g.shake = Math.max(g.shake, g.reduced ? 0.25 : 0.7);
        burst(g.parts, sx, laneFloorY(g, o.lane), "#7A7188", g.reduced ? 8 : 20, 260, 3.4, g.reduced ? 0.4 : 1);
        g.onLand?.();
      }
    }
  }
  g.rocks = g.rocks.filter(o => o.wx - g.scroll > -220 * g.s);

  /* ── nuggets that scrolled past uncollected break the streak ── */
  const before = g.golds.length;
  g.golds = g.golds.filter(o => o.wx - g.scroll > -60 * g.s);
  if (g.golds.length !== before) g.streak = 0;

  /* ── dust kicked up by the run ── */
  if (g.hopT >= 1) {
    stream(g.parts, dt, g.reduced ? 8 : 16 + (g.speed / (MAX_SPEED * g.s)) * 18, () => ({
      x: g.playerX - g.bodyW * 0.4, y: laneFloorY(g, g.lane) - rand(0, 4) * g.s,
      vx: rand(-140, -50), vy: rand(-40, 8),
      life: rand(0.25, 0.55), r: rand(1, 2.6) * g.s,
      color: "#6A6178", grav: 90, kind: "spark",
    }));
  }
  updateParticles(g.parts, dt, 0, -dx);

  for (const p of g.pops) p.age += dt;
  g.pops = g.pops.filter(p => p.age < 0.8);

  /* ── pickups first: grabbing a nugget and being crushed in the same frame
     should read as "I got it, then died", never swallow the pickup ── */
  const px = g.playerX;
  const fy = feetY(g);
  const cy = fy - g.bodyH * 0.5;
  const grab = GOLD_PICKUP_R * g.s;

  for (let i = g.golds.length - 1; i >= 0; i--) {
    const o = g.golds[i];
    const ox = o.wx - g.scroll;
    if (Math.hypot(ox - px, goldY(g, o) - cy) > grab) continue;

    g.golds.splice(i, 1);
    g.score += 1;                       // +1 per nugget. That's the whole economy.
    g.streak += 1;
    g.pops.push({ x: ox, y: goldY(g, o), age: 0 });
    burst(g.parts, ox, goldY(g, o), palette.gold, g.reduced ? 6 : 16, 210, 3.6, g.reduced ? 0.4 : 1);
    burst(g.parts, ox, goldY(g, o), palette.goldHot, g.reduced ? 3 : 8, 120, 2.4, g.reduced ? 0.4 : 1);
    if (g.streak > 0 && g.streak % VEIN_EVERY === 0) {
      g.shake = Math.max(g.shake, g.reduced ? 0.12 : 0.3);
      g.onVein?.(g.streak);
    } else {
      g.onGold?.();
    }
  }

  /* ── contact ── */
  if (g.invuln > 0) return;
  const halfW = g.bodyW * 0.52, halfH = g.bodyH * 0.46;
  for (const o of g.rocks) {
    const ox = o.wx - g.scroll;
    if (Math.abs(ox - px) > o.r + halfW + 8 * g.s) continue;
    if (!circleHitsRect(ox, o.y, o.r * 0.88, px, cy, halfW, halfH)) continue;
    return die(g, o, o.state === "fall" ? "crush" : "smash");
  }
}

function circleHitsRect(cx, cy, r, rx, ry, hw, hh) {
  const dx = Math.max(Math.abs(cx - rx) - hw, 0);
  const dy = Math.max(Math.abs(cy - ry) - hh, 0);
  return dx * dx + dy * dy < r * r;
}

function die(g, o, cause) {
  g.shake = 1;
  const fy = feetY(g);
  burst(g.parts, g.playerX, fy - g.bodyH * 0.5, palette.danger, g.reduced ? 10 : 26, 320, 4.5, g.reduced ? 0.4 : 1);
  burst(g.parts, o.wx - g.scroll, o.y, "#7A7188", g.reduced ? 8 : 20, 280, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(cause);
}

/* ── render ────────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { s, t } = g;
  const rush = clamp((g.speed / s - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 13 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }

  drawMine(ctx, g, g.scroll, t);

  const fy = feetY(g);

  /* the helmet beam, thrown before the actors so it lights them */
  drawLampCone(ctx, s, g.playerX + g.bodyW * 0.3, fy - g.bodyH * 0.78, g.w * 0.55, t);

  /* crush zones under every hanging boulder — the marked floor cell is the
     rule the whole game is built on, so it's drawn under everything else in
     the tunnel and never occluded by a rock */
  for (const o of g.rocks) {
    if (o.state === "landed") continue;
    ctx.save();
    ctx.translate(o.wx - g.scroll, laneFloorY(g, o.lane));
    drawCrushZone(ctx, s, o.r * 1.05, 0.35 + o.rumble * 0.65, t);
    ctx.restore();
  }

  for (const o of g.golds) {
    ctx.save();
    ctx.translate(o.wx - g.scroll, goldY(g, o));
    drawNugget(ctx, s, 16 * s, t, o.phase);
    ctx.restore();
  }

  for (const o of g.rocks) {
    ctx.save();
    ctx.translate(o.wx - g.scroll, o.y);
    drawBoulder(ctx, s, { r: o.r, seed: o.seed, rumble: o.rumble, landed: o.state === "landed", t });
    ctx.restore();
  }

  drawParticles(ctx, g.parts);

  ctx.save();
  ctx.translate(g.playerX, fy);
  drawMiner(ctx, s, {
    w: g.bodyW, h: g.bodyH, t, run: g.scroll / (60 * s),
    hopK: hopK(g), squash: g.squash, invuln: g.invuln > 0,
  });
  ctx.restore();

  /* floating "+1"s, in the score's own colour and typeface */
  for (const p of g.pops) {
    const k = p.age / 0.8;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = palette.goldHot;
    ctx.font = `800 ${20 * s}px ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("+1", p.x, p.y - 14 * s - k * 34 * s);
    ctx.restore();
  }

  ctx.restore();
  drawForeground(ctx, g, g.scroll, rush);
}

/**
 * Static hero for the menu preview — the same miner, nugget and boulder code
 * as gameplay, so what's on the title screen is literally what you play.
 */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const s = 1.05;
  const floor = h - 26;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, palette.rock);
  grad.addColorStop(1, palette.rockLit);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = palette.strata;
  ctx.fillRect(0, floor, w, h - floor);
  ctx.fillStyle = "rgba(74,66,86,0.9)";
  ctx.fillRect(0, floor + 2, w, 2);

  ctx.save();
  ctx.translate(w * 0.34, floor - 44);
  drawBoulder(ctx, s, { r: 22, seed: 3.2, rumble: 0.5 + Math.sin(t * 2) * 0.35, landed: false, t });
  ctx.restore();

  ctx.save();
  ctx.translate(w * 0.34, floor);
  drawCrushZone(ctx, s, 24, 0.9, t);
  ctx.restore();

  ctx.save();
  ctx.translate(w * 0.74, floor - 34);
  drawNugget(ctx, s, 13, t, 1.4);
  ctx.restore();

  drawLampCone(ctx, s, w * 0.24, floor - 38, w * 0.7, t);

  ctx.save();
  ctx.translate(w * 0.2, floor);
  drawMiner(ctx, s, { w: 27, h: 46, t, run: t * 4.4, hopK: 0, squash: 0 });
  ctx.restore();
}
