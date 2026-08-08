/* ══ Skid — simulation ══
   Owns no React state: the component samples a small HUD snapshot a few times
   a second and everything else stays on the canvas.

   The shape of the world is the whole design. Terrain is one continuous
   zig-zag of slabs generated ahead of the camera, and every turn in that
   zig-zag is built so the ball *cannot* fall out of it:

       ┌ lip          run N descends →
       │╲___________
       │            ╲____ (ball leaves here, still moving →)
       │                        ┌ lip, planted BEYOND that exit
       │        ←───────────────│
                run N+1 descends ←

   Run N+1's high end always sits further along run N's direction than run N's
   exit, so the ball always lands *on* it; the vertical lip at that high end is
   the backstop for the case where it arrives too fast to land short of it.
   That pair of rules is what makes an endless free-fall self-correcting
   instead of something the player has to steer — which matters, because the
   player has exactly one input and it is "jump". */

import { clamp } from "@37apps/core/canvas/color.js";
import { createParticles, burst, stream, updateParticles, drawParticles } from "@37apps/core/canvas/particles.js";
import {
  palette,
  PX_PER_METRE, CAM_Y_RATIO, CAM_LERP,
  BALL_R, GRAVITY, MAX_FALL, JUMP_V, RESTITUTION, ROLL_FRICTION, rollCapFor,
  JUMP_BUFFER, WALL_BOUNCE,
  STROKE, LIP_MIN, LIP_MAX, DROP_MIN, DROP_MAX, SPIKE_H, SAW_R,
  anglesFor, UNLOCK, spikeChanceFor,
  ORB_PICKUP_R, ORB_FILL, ORB_POINTS, SMASH_POINTS,
  BLAZE_TIME, BLAZE_SCORE_MULT,
  CLEAR_POINTS, AIR_BONUS_AT, AIR_POINTS,
  REVIVE_GRACE, scaleFor,
} from "./constants.js";
import { createShaft, drawShaft, zoneAt, rgba } from "./backdrop.js";
import { drawSlab, drawTeeth, drawSaw, drawOrb, drawSkid, drawBall, drawPop } from "./sprites.js";

let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);
const PHYS_STEP = 1 / 240;

export function createGame({ onJump, onLand, onClear, onAir, onOrb, onBlaze, onSmash, onDeath, onZone } = {}) {
  const g = {
    w: 390, h: 700, s: 1, t: 0,
    running: false, reduced: false,

    ball: { x: 100, y: 0, vx: 0, vy: 0 },
    spin: 0, squash: 1, gn: { x: 0, y: -1 },
    grounded: false, canJump: false, buffer: 0, airTime: 0,

    camY: 0, startY: 0, maxY: 0, score: 0, streak: 0, zoneIndex: -1,

    segs: [], hazards: [], orbs: [], marks: [], pops: [],
    gen: { x: 100, y: 0, dir: 1, prevDir: 1 },
    parts: createParticles(),
    shaft: createShaft(),
    shake: 0, charge: 0, blaze: 0, invuln: 0,
    sinceMark: 0, stall: 0, lastDir: 1,

    onJump, onLand, onClear, onAir, onOrb, onBlaze, onSmash, onDeath, onZone,
  };

  g.resize = (w, h) => {
    const k = w / (g.w || w);
    g.w = w; g.h = h; g.s = scaleFor(w);
    /* terrain is authored against the current width, so a mid-run rotation
       rescales everything horizontally rather than leaving the ball outside
       the shaft it was rolling down */
    g.ball.x *= k; g.gen.x *= k;
    for (const sg of g.segs) { sg.a.x *= k; sg.b.x *= k; }
    for (const o of g.orbs) o.x *= k;
    for (const m of g.marks) m.x *= k;
  };

  g.reset = () => {
    const s = g.s;
    g.t = 0;
    g.segs = []; g.hazards = []; g.orbs = []; g.marks = []; g.pops = [];
    g.parts = createParticles();
    g.gen = { x: g.w * 0.24, y: 150 * s, dir: 1, prevDir: 1, drop: 999 };
    g.ball = { x: g.w * 0.24 + 26 * s, y: 40 * s, vx: 40 * s, vy: 0 };
    g.spin = 0; g.squash = 1; g.gn = { x: 0, y: -1 };
    g.grounded = false; g.canJump = true; g.buffer = 0; g.airTime = 0;
    g.startY = g.ball.y; g.maxY = g.ball.y;
    g.camY = g.ball.y - g.h * CAM_Y_RATIO;
    g.score = 0; g.streak = 0; g.zoneIndex = -1;
    g.shake = 0; g.charge = 0; g.blaze = 0; g.invuln = 0.6;
    g.sinceMark = 0; g.stall = 0; g.lastDir = 1;
    generate(g);
  };

  /** Rewarded-ad continue: clear what's around the ball and hand back grace. */
  g.revive = () => {
    const near = 420 * g.s;
    const gone = new Set();
    for (const hz of g.hazards) {
      if (Math.abs(hazardY(hz) - g.ball.y) < near) gone.add(hz);
    }
    g.hazards = g.hazards.filter(hz => !gone.has(hz));
    g.invuln = REVIVE_GRACE;
    g.canJump = true;
    g.ball.vy = Math.min(g.ball.vy, 0);
    burst(g.parts, g.ball.x, g.ball.y, palette.ballHot, 24, 300, 4, g.reduced ? 0.4 : 1);
  };

  g.tap = () => { g.buffer = JUMP_BUFFER; };

  g.update = (dt) => update(g, dt);
  g.render = (ctx) => render(g, ctx);

  /* dev-only handle for the automated visual/balance harness — statically
     false in a production build, so the branch is stripped. Optional-chained
     because the same engine is driven headlessly under plain Node by the
     balance harness, where `import.meta.env` doesn't exist. */
  if (import.meta.env?.DEV && typeof window !== "undefined") window.__skid = g;
  return g;
}

/* ── geometry helpers ─────────────────────────────────────────────────── */

/** Closest point on segment ab to p, plus its normalised parameter. */
function closest(a, b, px, py) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

/** Unit normal of ab that points up-shaft (negative y). */
function upNormal(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  let nx = dy / l, ny = -dx / l;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
}

const pointAt = (sg, t) => ({ x: sg.a.x + (sg.b.x - sg.a.x) * t, y: sg.a.y + (sg.b.y - sg.a.y) * t });

function hazardY(hz) {
  if (hz.kind === "saw") return pointAt(hz.seg, hz.u).y;
  return Math.max(pointAt(hz.seg, hz.t0).y, pointAt(hz.seg, hz.t1).y);
}

/* ── generation ───────────────────────────────────────────────────────── */

function generate(g) {
  let guard = 0;
  while (g.gen.y < g.camY + g.h * 2.1 && guard++ < 40) emitRun(g);
}

/**
 * A run's *high* end may be driven flush into a shaft wall, but never left
 * standing a ball's width short of it: that gap is a chimney, and a ball that
 * drops into one is held up by nothing — it slides the entire shaft untouched,
 * banking metres and clearing every hazard it falls past.
 */
function snapX(g, x) {
  const gap = (BALL_R * 2 + STROKE * 2) * g.s * 1.2;
  if (x < gap) return 0;
  if (x > g.w - gap) return g.w;
  return x;
}

function emitRun(g) {
  const s = g.s, w = g.w;
  /* a run's *low* end must stay clear of the walls by more than a ball, and
     for the opposite reason to the rule above: a downhill that ends in a wall
     is a pocket with gravity pointing into the corner and no tangent out of
     it, and the ball sits there until the player closes the app */
  const pad = (BALL_R * 2 + STROKE * 2) * s * 1.35;
  const { x, y, prevDir, drop } = g.gen;
  let dir = g.gen.dir;

  /* not enough shaft left in the intended direction to build a run worth
     rolling down — carry on the way we came instead, which reads as a stepped
     descent rather than a stub jammed against the wall */
  if ((dir > 0 ? w - pad - x : x - pad) < w * 0.26) dir = -dir;
  const room = dir > 0 ? w - pad - x : x - pad;

  /* The lip only exists to catch a ball arriving with momentum from the far
     side, so it's built only on the runs that actually reverse direction — and
     it's kept shorter than the drop that feeds it, so it can never poke up
     past the run above and pinch a slot the ball can wedge into. */
  if (dir !== prevDir) {
    const lipH = Math.min(rand(LIP_MIN, LIP_MAX) * s, (drop || 999) - 16 * s);
    if (lipH > 14 * s) g.segs.push({ id: uid++, a: { x, y: y - lipH }, b: { x, y }, lip: true });
  }

  const m = Math.max(0, (y - g.startY) / PX_PER_METRE);
  const { lo, hi } = anglesFor(m);
  const ang = rand(lo, hi);
  const lx = Math.max(w * 0.24, Math.min(room, rand(0.36, 0.7) * w));
  const ex = clamp(x + dir * lx, pad, w - pad);
  const run = {
    id: uid++,
    a: { x, y },
    b: { x: ex, y: y + Math.abs(ex - x) * Math.tan(ang) },
    run: true, dir,
  };
  g.segs.push(run);

  /* How far down this run the ball can still be in the air, having been
     dropped onto it by the previous run rather than by a jump it chose. The
     ball enters at the low end of the last run, `overOf` short of this run's
     high end, and travels toward the high end while it falls — so everything
     between here and the high end is a landing zone, and anything lethal in it
     is a death the player was never offered a way out of. */
  const landZone = Math.min(0.8, (g.gen.over || 0) / Math.max(1, Math.abs(ex - x)));
  decorate(g, run, m, landZone);

  const over = rand(0.1, 0.2) * w;
  const nextDrop = rand(DROP_MIN, DROP_MAX) * s * (1 + Math.min(m / 2600, 0.75));
  g.gen = {
    x: snapX(g, clamp(run.b.x + dir * over, pad * 0.4, w - pad * 0.4)),
    y: run.b.y + nextDrop,
    dir: -dir,
    prevDir: dir,
    drop: nextDrop,
    over,
  };
}

/**
 * Hazards and pickups for one run. Everything lethal is placed after
 * `landZone` — the stretch the ball can still be falling through — so that no
 * hazard can ever be met by a fall the player didn't choose.
 */
function decorate(g, run, m, landZone) {
  const s = g.s;
  if (m < 12) return;                       // the first stretch teaches the roll

  const n = upNormal(run.a, run.b);
  const len = Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y);
  /* + a beat of clear slab past the landing, so the player gets to see the
     teeth from the ground before they have to act on them */
  const safe = landZone + 0.14;

  let spikeT0 = 1;
  if (safe < 0.6 && Math.random() < spikeChanceFor(m)) {
    /* never at the very bottom either, so there's always slab left to land
       back on after the hop */
    const t0 = rand(Math.max(0.32, safe), 0.6);
    const t1 = Math.min(0.9, t0 + rand(0.13, 0.24));
    g.hazards.push({ id: uid++, kind: "spike", seg: run, t0, t1, side: -1, cleared: false });
    spikeT0 = t0;

    /* a second patch only once the player has had a few hundred metres of
       single ones to learn the jump arc from — and far enough past the first
       that there's slab to land on between them rather than one long comb */
    if (m > 620 && len > g.w * 0.7 && Math.random() < Math.min(0.55, 0.28 + m * 0.00008)) {
      const u0 = t1 + rand(0.17, 0.26);
      const u1 = u0 + rand(0.08, 0.14);
      if (u1 < 0.97) g.hazards.push({ id: uid++, kind: "spike", seg: run, t0: u0, t1: u1, side: -1, cleared: false });
    }
  }

  /* fangs: a bar suspended over a clear stretch *before* any spikes, so the
     rule it teaches is "not yet" — you have to hold the jump until you're out
     from under it, rather than tapping the instant you see teeth ahead */
  if (m > UNLOCK.fang && spikeT0 - safe > 0.26 && Math.random() < 0.34) {
    const t0 = safe, t1 = Math.min(spikeT0 - 0.12, t0 + rand(0.12, 0.2));
    if (t1 > t0 + 0.06) {
      const hover = rand(56, 74) * s;
      const p0 = pointAt(run, t0), p1 = pointAt(run, t1);
      const bar = {
        id: uid++,
        a: { x: p0.x + n.x * hover, y: p0.y + n.y * hover },
        b: { x: p1.x + n.x * hover, y: p1.y + n.y * hover },
        fang: true,
      };
      g.segs.push(bar);
      /* the lethal span stops short of the bar's own ends: at t=0 or t=1 the
         closest-point test can't tell "under the fangs" from "falling past the
         side of the bar", and killing for the latter is a death with nothing
         on screen to explain it */
      g.hazards.push({ id: uid++, kind: "fang", seg: bar, t0: 0.08, t1: 0.92, side: 1, cleared: false });
    }
  }

  /* saws only ride runs that are otherwise clear — a moving hazard stacked on
     a fixed one is two timing problems in the same second */
  if (m > UNLOCK.saw && spikeT0 > 0.9 && safe < 0.55 && Math.random() < 0.4) {
    const speed = rand(0.16, 0.26) + Math.min(m / 14000, 0.16);
    const lo = safe;
    g.hazards.push({
      id: uid++, kind: "saw", seg: run,
      u: rand(lo, 0.6), lo, hi: 0.88, vdir: Math.random() > 0.5 ? 1 : -1,
      speed, spin: 0, cleared: false,
    });
  }

  /* orbs hang above the slab, usually right over the teeth — the charge is
     only worth chasing if collecting it means committing to the jump */
  if (Math.random() < 0.5) {
    const t = spikeT0 < 1 ? clamp(spikeT0 + rand(0.02, 0.12), 0.05, 0.95) : rand(0.25, 0.85);
    const p = pointAt(run, t);
    const hover = rand(46, 88) * s;
    g.orbs.push({ id: uid++, x: p.x + n.x * hover, y: p.y + n.y * hover, phase: Math.random() * 9 });
  }
}

/* ── update ───────────────────────────────────────────────────────────── */

function update(g, dt) {
  g.t += dt;
  const s = g.s;

  if (g.buffer > 0) g.buffer -= dt;
  if (g.invuln > 0) g.invuln -= dt;
  if (g.blaze > 0) {
    g.blaze -= dt;
    g.charge = Math.max(0, g.blaze / BLAZE_TIME);
    if (g.blaze <= 0) { g.blaze = 0; g.charge = 0; }
  }

  /* candidate terrain for this frame — recomputed once, then reused by every
     physics substep below */
  const reach = g.h * 0.85;
  const near = g.segs.filter(sg =>
    Math.min(sg.a.y, sg.b.y) < g.ball.y + reach && Math.max(sg.a.y, sg.b.y) > g.ball.y - reach
  );

  const steps = Math.min(8, Math.max(1, Math.ceil(dt / PHYS_STEP)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) step(g, h, near);

  /* ── depth and score ── */
  const prevMax = g.maxY;
  g.maxY = Math.max(g.maxY, g.ball.y);
  const gained = (g.maxY - prevMax) / PX_PER_METRE;
  if (gained > 0) g.score += gained * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);

  const metres = (g.maxY - g.startY) / PX_PER_METRE;
  const zi = zoneAt(metres).index;
  if (zi !== g.zoneIndex) {
    if (g.zoneIndex !== -1) g.onZone?.(zoneAt(metres).name);
    g.zoneIndex = zi;
  }

  /* ── camera: never travels back up the shaft, so a bounce can't rewind the
     view, and never lets the ball outrun the bottom of the frame ── */
  const was = g.camY;
  g.camY += (g.ball.y - g.h * CAM_Y_RATIO - g.camY) * Math.min(1, CAM_LERP * dt);
  if (g.camY < was) g.camY = was;
  g.camY = Math.max(g.camY, g.ball.y - g.h * 0.74);

  generate(g);

  /* ── moving parts ── */
  for (const hz of g.hazards) {
    if (hz.kind !== "saw") continue;
    hz.u += hz.vdir * hz.speed * dt;
    if (hz.u > hz.hi) { hz.u = hz.hi; hz.vdir = -1; }
    if (hz.u < hz.lo) { hz.u = hz.lo; hz.vdir = 1; }
    hz.spin += dt * 7;
  }

  /* ── trail ── */
  const speed = Math.hypot(g.ball.vx, g.ball.vy);
  if (g.blaze > 0) {
    stream(g.parts, dt, g.reduced ? 20 : 60, () => ({
      x: g.ball.x + rand(-5, 5) * s, y: g.ball.y + rand(-5, 5) * s,
      vx: -g.ball.vx * 0.15 + rand(-40, 40), vy: -g.ball.vy * 0.15 + rand(-70, 10),
      life: rand(0.25, 0.6), r: rand(2, 5) * s,
      color: Math.random() < 0.5 ? palette.blaze : palette.blazeHot, kind: "spark",
    }));
  } else if (!g.reduced && g.grounded && speed > 240 * s) {
    stream(g.parts, dt, 26, () => ({
      x: g.ball.x - g.gn.x * BALL_R * s, y: g.ball.y - g.gn.y * BALL_R * s,
      vx: -g.ball.vx * 0.12 + rand(-30, 30), vy: rand(-70, -10),
      life: rand(0.2, 0.45), r: rand(1.2, 2.8) * s,
      color: palette.ball, kind: "spark",
    }));
  }
  updateParticles(g.parts, dt);

  for (const p of g.pops) p.k += dt * 3.4;
  g.pops = g.pops.filter(p => p.k < 1);

  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3.2);
  g.squash += (1 - g.squash) * Math.min(1, dt * 16);
  g.spin += (g.ball.vx / (BALL_R * s)) * dt;

  /* ── pickups, then hazards: clipping an orb and a spike in the same frame
     should read as "I got it, then died", not swallow the pickup ── */
  const grab = (ORB_PICKUP_R + BALL_R) * s;
  for (let i = g.orbs.length - 1; i >= 0; i--) {
    const o = g.orbs[i];
    if (Math.hypot(o.x - g.ball.x, o.y - g.ball.y) > grab) continue;
    g.orbs.splice(i, 1);
    g.score += ORB_POINTS * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);
    burst(g.parts, o.x, o.y, palette.blaze, 12, 190, 4, g.reduced ? 0.4 : 1);
    if (g.blaze > 0) { g.onOrb?.(); continue; }
    g.charge = Math.min(1, g.charge + ORB_FILL);
    if (g.charge >= 1) {
      g.blaze = BLAZE_TIME;
      g.shake = 0.35;
      burst(g.parts, g.ball.x, g.ball.y, palette.blazeHot, 30, 340, 5, g.reduced ? 0.4 : 1);
      g.onBlaze?.();
    } else {
      g.onOrb?.();
    }
  }

  scoreClears(g);
  cullWorld(g);

  if (g.invuln > 0) return;
  for (let i = g.hazards.length - 1; i >= 0; i--) {
    const hz = g.hazards[i];
    if (!hazardHits(g, hz)) continue;
    if (g.blaze > 0) {
      g.hazards.splice(i, 1);
      if (hz.kind === "fang") g.segs = g.segs.filter(sg => sg !== hz.seg);
      g.score += SMASH_POINTS * BLAZE_SCORE_MULT;
      const p = hz.kind === "saw" ? pointAt(hz.seg, hz.u) : pointAt(hz.seg, (hz.t0 + hz.t1) / 2);
      burst(g.parts, p.x, p.y, palette.ink, 16, 260, 4, g.reduced ? 0.4 : 1);
      g.shake = Math.max(g.shake, 0.3);
      g.onSmash?.();
      continue;
    }
    return die(g, hz);
  }
}

/** One fixed physics substep: integrate, then push out of every slab. */
function step(g, dt, near) {
  const s = g.s, b = g.ball, r = BALL_R * s;

  b.vy = Math.min(b.vy + GRAVITY * s * dt, MAX_FALL * s);
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * WALL_BOUNCE; }
  if (b.x > g.w - r) { b.x = g.w - r; b.vx = -Math.abs(b.vx) * WALL_BOUNCE; }

  const rad = r + STROKE * s;
  let hit = false, nx = 0, ny = 0;

  for (const sg of near) {
    const q = closest(sg.a, sg.b, b.x, b.y);
    let dx = b.x - q.x, dy = b.y - q.y;
    let l = Math.hypot(dx, dy);
    if (l >= rad) continue;
    if (l < 1e-4) { dx = 0; dy = -1; l = 1; }
    const ux = dx / l, uy = dy / l;
    b.x += ux * (rad - l);
    b.y += uy * (rad - l);
    const vn = b.vx * ux + b.vy * uy;
    if (vn < 0) {
      b.vx -= ux * vn * (1 + RESTITUTION);
      b.vy -= uy * vn * (1 + RESTITUTION);
    }
    if (uy < -0.35 && (!hit || uy < ny)) { hit = true; nx = ux; ny = uy; }
  }

  if (hit) {
    if (!g.grounded) {
      /* landing beat — squash, dust, and the airtime bonus that makes taking
         a long drop worth more than hugging the slabs */
      g.squash = Math.min(1.5, 1.16 + Math.abs(b.vy) / (900 * s) * 0.3);
      g.onLand?.(Math.abs(b.vy) / (MAX_FALL * s));
      if (!g.reduced) {
        burst(g.parts, b.x - nx * r, b.y - ny * r, palette.ink, 6, 120, 2.4, 0.7);
      }
      if (g.airTime > AIR_BONUS_AT) {
        g.score += AIR_POINTS * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);
        g.onAir?.(Math.round(AIR_POINTS));
      }
      g.marks.push({ x: b.x - nx * r, y: b.y - ny * r, brk: true });
    }
    g.grounded = true;
    g.gn = { x: nx, y: ny };
    g.canJump = true;
    g.airTime = 0;

    /* rolling: shave the along-slope component slightly and cap it, so a
       thousand-metre run doesn't end up outrunning the player's reaction time */
    const tx = -ny, ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    const damp = vt * ROLL_FRICTION * dt;
    b.vx -= tx * damp;
    b.vy -= ty * damp;
    const cap = rollCapFor((g.maxY - g.startY) / PX_PER_METRE) * s;
    if (Math.abs(b.vx) > cap) {
      const k = cap / Math.abs(b.vx);
      b.vx *= k; b.vy *= k;
    }

    /* Anti-stall. The one surface in this world with no downhill is the round
       cap on top of a lip, and a ball that arrives there with almost no speed
       balances on it forever — a soft-lock the player can't tap their way out
       of, since the jump just puts it back. Rather than special-case lip tops,
       detect the condition itself (resting, on something flat) and nudge it
       the way it was already travelling. */
    if (Math.abs(vt) < 34 * s && Math.abs(nx) < 0.3) {
      g.stall += dt;
      if (g.stall > 0.22) {
        b.vx += (g.lastDir || 1) * 150 * s;
        g.stall = 0;
      }
    } else {
      g.stall = 0;
      if (Math.abs(b.vx) > 50 * s) g.lastDir = Math.sign(b.vx);
    }
  } else {
    g.grounded = false;
    g.airTime += dt;
  }

  /* One jump per ground contact — and crucially it survives *rolling off an
     edge*, not just a 100 ms coyote window. Runs hand the ball to each other
     by dropping it, and the drop is sometimes long enough to carry it onto
     teeth further down the next run than it can reach on foot. Holding the
     jump for the whole fall is what turns that from a death the player was
     never offered a way out of into one they can still save. Buffering does
     the mirror job: a tap a moment before touchdown still fires. */
  if (g.buffer > 0 && g.canJump) {
    b.vy = -JUMP_V * s;
    b.vx += g.gn.x * 120 * s;
    g.buffer = 0; g.canJump = false; g.grounded = false;
    g.squash = 0.76;
    g.pops.push({ x: b.x, y: b.y, k: 0 });
    g.onJump?.();
  }

  /* skid marks are recorded by distance travelled, not per frame, so the
     stroke has the same density at any speed or frame rate */
  if (g.grounded) {
    g.sinceMark += Math.hypot(b.vx, b.vy) * dt;
    if (g.sinceMark > 7 * s) {
      g.sinceMark = 0;
      g.marks.push({ x: b.x - g.gn.x * r, y: b.y - g.gn.y * r });
      if (g.marks.length > 150) g.marks.shift();
    }
  }
}

function hazardHits(g, hz) {
  const s = g.s, b = g.ball, r = BALL_R * s;
  if (hz.kind === "saw") {
    const p = pointAt(hz.seg, hz.u);
    const n = upNormal(hz.seg.a, hz.seg.b);
    return Math.hypot(b.x - (p.x + n.x * SAW_R * 0.55 * s), b.y - (p.y + n.y * SAW_R * 0.55 * s))
      < r + SAW_R * 0.82 * s;
  }
  const q = closest(hz.seg.a, hz.seg.b, b.x, b.y);
  if (q.t < hz.t0 - 0.02 || q.t > hz.t1 + 0.02) return false;
  let n = upNormal(hz.seg.a, hz.seg.b);
  if (hz.side > 0) n = { x: -n.x, y: -n.y };
  if ((b.x - q.x) * n.x + (b.y - q.y) * n.y < 0) return false;   // wrong face
  return Math.hypot(b.x - q.x, b.y - q.y) < r + SPIKE_H * 0.72 * s;
}

/** A hazard counts as beaten once the ball is comfortably past it. */
function scoreClears(g) {
  for (const hz of g.hazards) {
    if (hz.cleared || hz.kind === "fang") continue;
    if (g.ball.y < hazardY(hz) + 26 * g.s) continue;
    hz.cleared = true;
    g.streak += 1;
    g.score += (CLEAR_POINTS + Math.min(g.streak, 12)) * (g.blaze > 0 ? BLAZE_SCORE_MULT : 1);
    g.onClear?.(g.streak);
  }
}

function cullWorld(g) {
  const top = g.camY - 260 * g.s;
  const alive = new Set();
  g.segs = g.segs.filter(sg => {
    const keep = Math.max(sg.a.y, sg.b.y) > top;
    if (keep) alive.add(sg);
    return keep;
  });
  g.hazards = g.hazards.filter(hz => alive.has(hz.seg));
  g.orbs = g.orbs.filter(o => o.y > top);
  while (g.marks.length && g.marks[0].y < top) g.marks.shift();
}

function die(g, hz) {
  g.shake = 1;
  const p = hz.kind === "saw" ? pointAt(hz.seg, hz.u) : pointAt(hz.seg, (hz.t0 + hz.t1) / 2);
  burst(g.parts, g.ball.x, g.ball.y, palette.ball, 30, 360, 5, g.reduced ? 0.4 : 1);
  burst(g.parts, p.x, p.y, palette.ink, 14, 220, 4, g.reduced ? 0.4 : 1);
  g.onDeath?.(hz.kind);
}

/* ── render ───────────────────────────────────────────────────────────── */

function render(g, ctx) {
  const { w, h, s, t } = g;
  const z = drawShaft(ctx, w, h, g.shaft, g.camY, t, s);

  ctx.save();
  if (g.shake > 0 && !g.reduced) {
    const k = g.shake * g.shake * 10 * s;
    ctx.translate(rand(-k, k), rand(-k, k));
  }
  ctx.translate(0, -g.camY);

  drawSkid(ctx, g.marks, s, g.blaze > 0);

  for (const sg of g.segs) drawSlab(ctx, s, sg.a, sg.b, palette.ink);

  for (const hz of g.hazards) {
    if (hz.kind === "saw") {
      const p = pointAt(hz.seg, hz.u);
      const n = upNormal(hz.seg.a, hz.seg.b);
      drawSaw(ctx, s, p.x + n.x * SAW_R * 0.55 * s, p.y + n.y * SAW_R * 0.55 * s, hz.spin, palette.ink);
      continue;
    }
    /* telegraph: teeth swell as the ball closes on them. In a world with one
       colour, the warning has to arrive as motion. */
    const d = Math.abs(hazardY(hz) - g.ball.y);
    const pulse = d < 260 * s ? (1 - d / (260 * s)) * (0.5 + Math.sin(t * 11) * 0.5) : 0;
    drawTeeth(ctx, s, hz.seg.a, hz.seg.b, hz.t0, hz.t1, hz.side, palette.ink, pulse);
  }

  for (const o of g.orbs) {
    ctx.save();
    ctx.translate(o.x, o.y);
    drawOrb(ctx, s, t, o.phase);
    ctx.restore();
  }

  drawParticles(ctx, g.parts);
  for (const p of g.pops) drawPop(ctx, s, p.x, p.y, p.k, g.blaze > 0);

  if (g.running) {
    ctx.save();
    ctx.translate(g.ball.x, g.ball.y);
    drawBall(ctx, s, BALL_R * s, g.spin, g.squash, g.gn, g.blaze > 0, g.invuln > 0 && g.blaze <= 0, t);
    ctx.restore();
  }

  ctx.restore();

  /* ── HUD scrim ──
     The world is ink on cream and the HUD is ink on cream, so a slab that
     happens to sweep through the top of the frame renders the depth and best
     readouts unreadable — same value, same colour, one on top of the other.
     A short wash of the current zone's own sky colour, drawn last, keeps the
     band under the HUD clear without introducing a panel that would read as
     chrome bolted over the game. */
  const band = 128 * s;
  const sc = ctx.createLinearGradient(0, 0, 0, band);
  sc.addColorStop(0, z.top);
  sc.addColorStop(0.42, rgba(z.topC, 0.9));
  sc.addColorStop(0.72, rgba(z.topC, 0.4));
  sc.addColorStop(1, rgba(z.topC, 0));
  ctx.fillStyle = sc;
  ctx.fillRect(0, 0, w, band);

  /* BLAZE floods the shaft with the ball's own light, so the power-up changes
     what the world looks like and not just a meter. Applied in screen space,
     last — over the scrim as well as the world, or the HUD band would sit
     there as a cold grey stripe across an otherwise amber screen. */
  if (g.blaze > 0) {
    const a = Math.min(1, g.blaze / 0.6) * 0.2;
    const bx = g.ball.x, by = g.ball.y - g.camY;
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(w, h) * 0.8);
    rg.addColorStop(0, `rgba(255,163,26,${a})`);
    rg.addColorStop(1, "rgba(255,163,26,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
}

/* ── menu hero ────────────────────────────────────────────────────────── */

/**
 * The title-screen loop: the same slab, teeth and ball renderers as gameplay,
 * running a hand-authored 3-second cycle — roll, hop the teeth, land. What's
 * on the menu is literally what you play.
 */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const s = 0.8;

  /* a depth ruler and the tail of the slab above: the preview is meant to
     read as a window onto the shaft, not a diagram of one slab */
  ctx.save();
  ctx.strokeStyle = "rgba(114,111,124,0.22)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.2);
  ctx.lineTo(w, h * 0.2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.16;
  drawSlab(ctx, s * 0.85, { x: w * 0.55, y: -6 }, { x: w + 8, y: h * 0.13 }, palette.ink);
  ctx.restore();

  const a = { x: 12, y: h * 0.36 }, b = { x: w - 12, y: h * 0.74 };
  const n = upNormal(a, b);

  drawSlab(ctx, s, a, b, palette.ink);
  drawTeeth(ctx, s, a, b, 0.5, 0.66, -1, palette.ink, 0.4 + Math.sin(t * 6) * 0.4);

  /* one hand-authored cycle: roll in, hop the teeth, land, roll out. The hop
     is a parabola bolted onto the roll with its apex over the teeth — the
     preview only ever has to look right, not be simulated. */
  const cycle = 2.6;
  const k = 0.08 + ((t % cycle) / cycle) * 0.9;
  const jumpFrom = 0.4, jumpTo = 0.76;
  let lift = 0;
  if (k > jumpFrom && k < jumpTo) {
    lift = Math.sin(((k - jumpFrom) / (jumpTo - jumpFrom)) * Math.PI) * h * 0.25;
  }
  const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  const r = 11 * s * 1.35;
  const off = r + 5;

  const marks = [];
  for (let i = 0; i <= 18; i++) {
    const u = Math.max(0.02, k - 0.34) + (Math.min(k - 0.02, 0.34) * i) / 18;
    marks.push({ x: a.x + (b.x - a.x) * u + n.x * off, y: a.y + (b.y - a.y) * u + n.y * off });
  }
  drawSkid(ctx, marks, s, false);

  ctx.save();
  ctx.translate(p.x + n.x * off, p.y + n.y * off - lift);
  drawBall(ctx, s * 1.35, r, t * 3.2, lift > 0 ? 0.9 : 1, n, false, false, t);
  ctx.restore();
}
