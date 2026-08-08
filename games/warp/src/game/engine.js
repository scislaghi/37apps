/* ══ Warp — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas.

   Two ideas carry the whole file. First, an obstacle is *an angular span at a
   world depth* — never a mesh, never pixels — so the same three numbers draw it
   and kill you. Second, `arcsAt()` is the single source of truth for where a
   moving obstacle is at a given instant: the spinner's rim and the spinner's
   hitbox cannot drift apart because there is only one of them. */

import { clamp, withAlpha } from "@37apps/core/canvas/color.js";
import { createParticles, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette,
  Z_PLAYER, Z_NEAR, Z_FAR, SPAWN_Z, ORBIT, METRES_PER_UNIT,
  ROLL_MAX, ROLL_ACCEL, ROLL_DAMP, CAM_LAG, CRAFT_HALF,
  OBST_INNER, MIN_FREE_SECTORS, MIN_FREE_SECTORS_TIGHT, UNLOCK,
  CORE_HALF, CORE_FILL, CORE_POINTS, SMASH_POINTS,
  HYPER_TIME, HYPER_SPEED_MULT, HYPER_SCORE_MULT, REVIVE_GRACE,
  speedFor, spawnIntervalFor, blockFracFor,
} from "./constants.js";
import { zoneAt, makeCamera, drawTunnel, drawVignette, scaleAt, project } from "./tunnel.js";
import { drawSlab, drawCore, drawCraft, drawLane } from "./sprites.js";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let uid = 1;

/** Signed shortest angular distance from `a` to `b`, in (-π, π]. */
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Is `theta` inside the arc that starts at `s` and spans `e - s` (> 0)? */
function inArc(theta, s, e) {
  let d = (theta - s) % TAU;
  if (d < 0) d += TAU;
  return d <= e - s;
}

/**
 * Where an obstacle's blocked spans are at time `time`. Spinners carry a
 * constant rotation, irises breathe symmetrically about each span's centre.
 * Everything that draws or tests an obstacle goes through here.
 */
export function arcsAt(o, time) {
  const rot = o.rot + o.spin * time;
  const grow = o.pulseAmp ? Math.sin(time * o.pulseSpeed + o.pulsePhase) * o.pulseAmp : 0;
  const out = [];
  for (const [a, b] of o.arcs) out.push([a + rot - grow, b + rot + grow]);
  return out;
}

export function createGame({ onCore, onHyper, onSmash, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, t: 0,
    running: false, reduced: false,

    travel: 0, metres: 0, score: 0, zoneIndex: -1,
    angle: Math.PI / 2,      // the craft, in world angle
    rollV: 0, input: 0, keyDir: 0, camRoll: Math.PI / 2,

    charge: 0, hyper: 0, invuln: 0,
    obstacles: [], cores: [], debris: [],
    parts: createParticles(),
    spawnTimer: 0,
    shake: 0, flash: 0,

    onCore, onHyper, onSmash, onDeath, onZone,
  };

  g.resize = (w, h) => { g.w = w; g.h = h; };

  g.reset = () => {
    g.t = 0;
    g.travel = 0; g.metres = 0; g.score = 0; g.zoneIndex = -1;
    g.angle = Math.PI / 2; g.camRoll = Math.PI / 2; g.rollV = 0; g.input = 0;
    g.charge = 0; g.hyper = 0; g.invuln = 1.2;
    g.obstacles = []; g.cores = []; g.debris = [];
    g.parts = createParticles();
    /* the first slab is spawned immediately so the run opens on something to
       read rather than on an empty tube */
    g.spawnTimer = 0.45;
    g.shake = 0; g.flash = 0;
  };

  /** Rewarded-ad continue: clear the tube ahead and hand back a grace window. */
  g.revive = () => {
    g.obstacles = g.obstacles.filter(o => o.wz - g.travel > SPAWN_Z * 0.55);
    g.invuln = REVIVE_GRACE;
    g.rollV = 0;
    g.shake = 0;
    burst(g.parts, g.w / 2, g.h / 2, palette.craft, 24, 260, 4, g.reduced ? 0.4 : 1);
  };

  /* ── input: hold a side of the screen to roll that way. A rate, not a
     position — the tunnel is a loop with no ends, so there is no absolute
     "here" for a drag to map onto. ── */
  const pointers = new Map();
  g.pointerDown = (id, x) => { pointers.set(id, x < g.w / 2 ? -1 : 1); syncInput(); };
  g.pointerUp = (id) => { pointers.delete(id); syncInput(); };
  g.setKeyDir = (d) => { g.keyDir = d; syncInput(); };
  function syncInput() {
    /* the newest touch wins, so sliding a thumb across the middle of the
       screen reverses immediately instead of cancelling out against the
       finger that's still down */
    const held = [...pointers.values()];
    const screenDir = g.keyDir || (held.length ? held[held.length - 1] : 0);
    /* Screen → world sign flip, and it is not cosmetic. Canvas angles sweep
       *clockwise* because y points down, and the craft sits at the bottom of
       the ring — so increasing the world angle carries it to the LEFT of the
       screen. Holding the right side has to drive the world angle down, or the
       whole tunnel rolls away from the thumb that asked for it. */
    g.input = -screenDir;
  }

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped */
  if (import.meta.env.DEV) window.__warp = g;
  return g;
}

/* ── generation ───────────────────────────────────────────────────────── */

/** Blocked sector groups for a wave, as [startSector, length] pairs. */
function sectorGroups(kind, n, m) {
  const minFree = n <= 4 ? MIN_FREE_SECTORS_TIGHT : MIN_FREE_SECTORS;
  const want = Math.round(n * blockFracFor(m));

  if (kind === "twin") {
    /* two blocked groups, so the tunnel offers two ways through and the read
       is "which gap is nearer" rather than "where is the gap" */
    const budget = Math.min(want + 1, n - minFree * 2);
    if (budget < 2) return [[Math.floor(Math.random() * n), 1]];
    const b1 = Math.max(1, Math.floor(budget / 2));
    const b2 = Math.max(1, budget - b1);
    const gap1 = Math.max(minFree, Math.floor((n - b1 - b2) / 2));
    const start = Math.floor(Math.random() * n);
    return [[start, b1], [start + b1 + gap1, b2]];
  }

  const len = clamp(want, 1, n - minFree);
  return [[Math.floor(Math.random() * n), len]];
}

function makeObstacle(g, kind, wz) {
  const z = zoneAt(wz * METRES_PER_UNIT);
  const n = z.t < 0.5 ? z.n0 : z.n1;
  const seg = TAU / n;
  const groups = sectorGroups(kind, n, g.metres);

  const o = {
    id: uid++, kind, wz,
    n0: z.n0, n1: z.n1, t: z.t, n,
    glow: z.glow,
    arcs: groups.map(([s, len]) => [s * seg, (s + len) * seg]),
    rot: 0, spin: 0,
    pulseAmp: 0, pulseSpeed: 0, pulsePhase: 0,
    passed: false, dying: 0,
  };

  if (kind === "spin") {
    o.spin = rand(0.35, 0.85) * (Math.random() > 0.5 ? 1 : -1);
  }
  if (kind === "pulse") {
    /* the iris may never close the gap below what the craft can fit through —
       an obstacle whose *own* animation can make it unpassable isn't a timing
       puzzle, it's a coin flip resolved before you arrive */
    const gap = TAU - (o.arcs[0][1] - o.arcs[0][0]);
    o.pulseAmp = Math.max(0, Math.min(seg * 0.5, (gap - (CRAFT_HALF * 2 + 0.35)) / 2));
    o.pulseSpeed = rand(1.5, 2.6);
    o.pulsePhase = Math.random() * TAU;
  }
  return o;
}

/** Free spans between an obstacle's blocked arcs, as [start, end] pairs. */
function gapsOf(arcs) {
  const norm = arcs
    .map(([a, b]) => [((a % TAU) + TAU) % TAU, ((a % TAU) + TAU) % TAU + (b - a)])
    .sort((p, q) => p[0] - q[0]);
  const gaps = [];
  for (let i = 0; i < norm.length; i++) {
    const end = norm[i][1];
    const nextStart = i === norm.length - 1 ? norm[0][0] + TAU : norm[i + 1][0];
    if (nextStart - end > 0.02) gaps.push([end, nextStart]);
  }
  return gaps;
}

/**
 * Fairness. A wave is only fair if the player can still be inside a gap when it
 * arrives, so the whole wave is rotated until the nearest gap is reachable from
 * wherever the craft actually is *now* — not from a convenient assumption about
 * where they ought to be. Measured against the real roll rate and the real
 * flight time, with a margin, and re-checked against the wave's own spin.
 */
function makeFair(g, o, speed) {
  const flight = Math.max(0.35, (o.wz - g.travel - Z_PLAYER) / speed);
  const reach = ROLL_MAX * flight * 0.72;
  const arrival = g.t + flight;

  let best = null;
  for (const [s, e] of gapsOf(arcsAt(o, arrival))) {
    const centre = (s + e) / 2;
    const half = (e - s) / 2 - CRAFT_HALF;
    const d = angDiff(g.angle, centre);
    /* being already inside the gap costs nothing; otherwise pay for the edge */
    const need = Math.max(0, Math.abs(d) - Math.max(0, half));
    if (!best || need < best.need) best = { need, d, half };
  }
  if (!best || best.need <= reach) return o;

  /* rotate the whole wave so the cheapest gap lands exactly at the edge of
     what the player can do in the time available */
  const over = best.need - reach;
  o.rot += Math.sign(best.d) * over * 1.05;
  return o;
}

function spawnWave(g, speed) {
  const wz = g.travel + SPAWN_Z;
  const pool = ["bar"];
  if (g.metres >= UNLOCK.spin) pool.push("spin", "spin");
  if (g.metres >= UNLOCK.pulse) pool.push("pulse");
  if (g.metres >= UNLOCK.twin) pool.push("twin");

  const o = makeFair(g, makeObstacle(g, pick(pool), wz), speed);
  g.obstacles.push(o);

  /* a core sits just past the wave, centred on one of its gaps — so which way
     you go through a twin decides which cores you get, and the meter costs a
     committed choice rather than a detour into empty tube */
  if (Math.random() < 0.5) {
    const gaps = gapsOf(arcsAt(o, g.t + 2));
    if (gaps.length) {
      const [s, e] = pick(gaps);
      g.cores.push({ id: uid++, wz: wz + rand(2.5, 5), theta: (s + e) / 2 });
    }
  }
}

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;

  const speed = speedFor(g.metres) * (g.hyper > 0 ? HYPER_SPEED_MULT : 1);
  const prevTravel = g.travel;
  const prevAngle = g.angle;
  g.travel += speed * dt;
  g.metres = g.travel * METRES_PER_UNIT;
  g.score += (speed * dt * METRES_PER_UNIT) * (g.hyper > 0 ? HYPER_SCORE_MULT : 1);

  /* ── roll ── */
  if (g.input) g.rollV += g.input * ROLL_ACCEL * dt;
  else g.rollV -= g.rollV * Math.min(1, ROLL_DAMP * dt);
  g.rollV = clamp(g.rollV, -ROLL_MAX, ROLL_MAX);
  g.angle = (g.angle + g.rollV * dt) % TAU;
  if (g.angle < 0) g.angle += TAU;

  /* the camera trails the craft by a fixed slice of time rather than being
     welded to it: the lag is what lets the craft visibly slide around the tube
     while the tunnel spins the other way */
  const target = g.angle - g.rollV * CAM_LAG;
  g.camRoll += angDiff(g.camRoll, target) * Math.min(1, 14 * dt);

  const z = zoneAt(g.metres);
  if (z.index !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(z.name);
    g.zoneIndex = z.index;
  }

  if (g.invuln > 0) g.invuln -= dt;
  if (g.hyper > 0) {
    g.hyper -= dt;
    g.charge = Math.max(0, g.hyper / HYPER_TIME);
    if (g.hyper <= 0) { g.hyper = 0; g.charge = 0; }
  }
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.2);
  if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 4);

  /* ── spawning ── */
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawnWave(g, speed);
    g.spawnTimer += spawnIntervalFor(g.metres);
  }

  /* ── engine trail: emitted in screen space behind the craft, at a rate that
     follows speed so faster genuinely looks faster ── */
  const cam = makeCamera(g.w, g.h, g.camRoll);
  const [hx, hy] = project(cam, g.angle, ORBIT, Z_PLAYER);
  stream(g.parts, dt, g.reduced ? 14 : 30 + (speed / 13) * 40, () => {
    const a = g.angle + cam.rot;
    return {
      x: hx + rand(-4, 4), y: hy + rand(-4, 4),
      /* radially outward (away from the vanishing point) plus a tangential
         smear *against* the roll — exhaust is left behind in the tunnel, so it
         drifts the way the wall appears to move, not the way the thumb pushes */
      vx: Math.cos(a) * rand(20, 90) + Math.sin(a) * g.rollV * 26,
      vy: Math.sin(a) * rand(20, 90) - Math.cos(a) * g.rollV * 26,
      life: rand(0.18, 0.45), r: rand(1.5, 3.4),
      color: g.hyper > 0 ? palette.hyper : palette.core, kind: "spark",
    };
  });
  updateParticles(g.parts, dt);

  for (const d of g.debris) d.age += dt;
  g.debris = g.debris.filter(d => d.age < 0.45);

  /* ── cores first: clipping a core and a slab in the same frame should read
     as "I got it, then died", not swallow the pickup ── */
  for (let i = g.cores.length - 1; i >= 0; i--) {
    const c = g.cores[i];
    if (c.wz - prevTravel <= Z_PLAYER || c.wz - g.travel > Z_PLAYER) continue;
    if (Math.abs(angDiff(g.angle, c.theta)) > CORE_HALF + CRAFT_HALF) continue;
    g.cores.splice(i, 1);
    g.score += CORE_POINTS * (g.hyper > 0 ? HYPER_SCORE_MULT : 1);
    burst(g.parts, hx, hy, palette.core, 12, 190, 4, g.reduced ? 0.4 : 1);
    if (g.hyper > 0) { g.onCore?.(); continue; }
    g.charge = Math.min(1, g.charge + CORE_FILL);
    if (g.charge >= 1) {
      g.hyper = HYPER_TIME;
      g.flash = 0.7;
      burst(g.parts, hx, hy, palette.hyper, 30, 330, 5, g.reduced ? 0.4 : 1);
      g.onHyper?.();
    } else {
      g.onCore?.();
    }
  }
  g.cores = g.cores.filter(c => c.wz - g.travel > Z_NEAR);

  /* ── the plane crossing ──
     Collision is resolved once, at the instant the craft's plane passes the
     slab's front face, against angles interpolated to that instant. Testing
     overlap per frame instead would miss a slab entirely at top speed (one
     50 ms step covers more than a slab is thick) and would also let a spinner's
     hitbox lag its own rim by a frame. */
  for (const o of g.obstacles) {
    if (o.passed || o.dying) continue;
    const zPrev = o.wz - prevTravel;
    const zNow = o.wz - g.travel;
    if (zPrev <= Z_PLAYER || zNow > Z_PLAYER) continue;
    o.passed = true;

    const f = (zPrev - Z_PLAYER) / Math.max(zPrev - zNow, 1e-6);
    const when = g.t - dt + dt * f;
    const at = prevAngle + angDiff(prevAngle, g.angle) * f;
    const blocked = arcsAt(o, when).some(([s, e]) => inArc(at, s - CRAFT_HALF, e + CRAFT_HALF));
    if (!blocked) continue;

    if (g.hyper > 0) {
      o.dying = 0.001;
      g.score += SMASH_POINTS * HYPER_SCORE_MULT;
      g.shake = Math.max(g.shake, 0.45);
      g.debris.push({ theta: at, age: 0, glow: o.glow });
      burst(g.parts, hx, hy, palette.hyper, 18, 300, 5, g.reduced ? 0.4 : 1);
      g.onSmash?.();
      continue;
    }
    if (g.invuln > 0) continue;
    return die(g, o, hx, hy);
  }

  for (const o of g.obstacles) if (o.dying) o.dying += dt * 3.2;
  g.obstacles = g.obstacles.filter(o => o.wz - g.travel > Z_NEAR - 0.6 && o.dying < 1);
}

function die(g, o, hx, hy) {
  g.shake = 1;
  g.flash = 1;
  burst(g.parts, hx, hy, palette.craft, 26, 340, 5, g.reduced ? 0.4 : 1);
  burst(g.parts, hx, hy, o.glow, 16, 240, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(o.kind);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h } = g;
  let sx = 0, sy = 0;
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 13;
    sx = rand(-k, k); sy = rand(-k, k);
  }
  const cam = makeCamera(w, h, g.camRoll, sx, sy);
  const hyper = g.hyper > 0;

  /* everything inside the tube, merged into the wall's own far→near walk so a
     slab is painted between the band behind it and the band in front of it */
  const items = [];
  for (const o of g.obstacles) items.push({ z: o.wz - g.travel, o });
  for (const c of g.cores) items.push({ z: c.wz - g.travel, c });
  items.sort((a, b) => b.z - a.z);

  let cursor = 0;
  const flush = (zLimit) => {
    while (cursor < items.length && items[cursor].z >= zLimit) {
      const it = items[cursor++];
      if (it.z < Z_NEAR || it.z > Z_FAR) continue;
      if (it.o) {
        for (const [a, b] of arcsAt(it.o, g.t)) {
          drawSlab(ctx, cam, it.o, a, b, it.z, it.o.glow, hyper, it.o.dying);
        }
      } else {
        drawCore(ctx, cam, it.c.theta, it.z, g.t);
      }
    }
  };

  const zone = drawTunnel(ctx, w, h, cam, g.travel, g.metres, flush);
  flush(-Infinity);

  /* debris rings from slabs smashed in HYPER — the only thing that ever leaves
     a mark on the wall, so the power state is legible in the world, not only
     in the meter */
  for (const d of g.debris) {
    const k = 1 - d.age / 0.45;
    ctx.save();
    ctx.globalAlpha = k * 0.8;
    ctx.strokeStyle = withAlpha(palette.hyper, 1);
    ctx.lineWidth = Math.max(2, scaleAt(cam, Z_PLAYER) * 0.03 * k);
    ctx.beginPath();
    ctx.arc(cam.cx, cam.cy, scaleAt(cam, Z_PLAYER) * (OBST_INNER + (1 - k) * 1.6), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawLane(ctx, cam, hyper ? palette.hyper : zone.glow, hyper ? 0.3 : 0.16);
  drawParticles(ctx, g.parts);

  if (g.running) {
    /* bank is a *screen* quantity — it leans the hull into the direction the
       player sees it travel, which is the opposite sign of the world roll */
    drawCraft(ctx, cam, g.angle, Z_PLAYER, clamp(-g.rollV / ROLL_MAX, -1, 1), hyper, g.invuln > 0 && !hyper, g.t);
  }

  drawVignette(ctx, w, h, cam, hyper ? withAlpha(palette.hyper, 0.1) : null, 0.55);

  if (g.flash > 0) {
    ctx.fillStyle = withAlpha(hyper ? palette.hyper : "#FFFFFF", g.flash * 0.4);
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Menu hero — the same tunnel and the same craft as gameplay, drifting on its
 * own clock, so what's on the title screen is literally what you fly.
 */
export function drawHero(ctx, w, h, t) {
  const travel = t * 3.4;
  const camRoll = Math.PI / 2 + Math.sin(t * 0.6) * 0.5;
  const cam = makeCamera(w, h, camRoll);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  drawTunnel(ctx, w, h, cam, travel, travel * METRES_PER_UNIT + 240, null);
  drawLane(ctx, cam, zoneAt(travel * METRES_PER_UNIT + 240).glow, 0.18);
  drawCraft(ctx, cam, camRoll + Math.sin(t * 0.6) * 0.12, Z_PLAYER, Math.sin(t * 0.6) * 0.6, false, false, t);
  drawVignette(ctx, w, h, cam, null, 0.42);
  ctx.restore();
}
