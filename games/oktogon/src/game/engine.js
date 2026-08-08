/* ══ Oktogon — simulation ══
   Owns the dial, the falling ball and the collision verdict. Everything it
   draws lives in render.js; everything it measures lives in geometry.js. */

import { createParticles, updateParticles, burst, emit } from '@37apps/core/canvas/particles.js';
import { clamp } from '@37apps/core/canvas/color.js';
import {
  SIDES, EDGE_ANGLE, INRADIUS_RATIO, SIDE_COLORS,
  CENTER_Y_RATIO, R_W_RATIO, R_H_RATIO, R_MAX,
  BALL_R_RATIO, BALL_R_MIN, BALL_R_MAX,
  ROT_STIFFNESS, ROT_DAMPING,
  GRAVITY_GRACE_SCORE, GRAVITY_BASE, GRAVITY_PER_SCORE, GRAVITY_MAX,
  DRIFT_UNLOCK_SCORE, DRIFT_PER_SCORE, DRIFT_MAX,
} from './constants.js';
import { support, predictLanding, sideAngle } from './geometry.js';
import { renderGame } from './render.js';

const TRAIL_MAX = 14;

export function gravityFor(score) {
  const eased = Math.max(0, score - GRAVITY_GRACE_SCORE);
  return Math.min(GRAVITY_MAX, GRAVITY_BASE + eased * GRAVITY_PER_SCORE);
}

export function driftFor(score) {
  if (score < DRIFT_UNLOCK_SCORE) return 0;
  return Math.min(DRIFT_MAX, (score - DRIFT_UNLOCK_SCORE) * DRIFT_PER_SCORE);
}

const decay = (v, rate, dt) => (v > 0 ? Math.max(0, v - rate * dt) : 0);

/* Bag randomiser rather than pure random: over any eight balls the player
   sees all eight colours, so a run can't degenerate into "coral five times"
   (which reads as broken) or a stretch that never revisits a side. */
function refillBag(g) {
  const bag = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  /* avoid a repeat across the seam between two bags */
  if (bag[0] === g.lastColor && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]];
  g.bag = bag;
}

function drawColor(g) {
  if (!g.bag.length) refillBag(g);
  const c = g.bag.pop();
  g.lastColor = c;
  return c;
}

/**
 * @param {{onMatch?: Function, onMiss?: Function, onRotate?: Function,
 *          onSpawn?: Function}} cb
 */
export function createGame(cb = {}) {
  const g = {
    /* viewport */
    w: 0, h: 0, S: 1, t: 0,
    cx: 0, cy: 0, R: 0, rIn: 0, ballR: 12,

    /* dial */
    rot: 0, rotVel: 0, rotTarget: 0, driftRate: 0,

    /* run */
    ball: null, nextColor: 0, score: 0, streak: 0,
    bag: [], lastColor: -1,
    landing: null,          // {side, x, y, locked} — refreshed every frame

    /* feedback */
    particles: createParticles(320),
    rings: [],
    sideFlash: new Float32Array(SIDES),
    pop: 0, shake: 0, matchFlash: 0, missFlash: 0,
    lockPulse: 0,

    reduced: false,
    cb,
  };

  g.resize = (w, h) => {
    g.w = w; g.h = h;
    g.S = clamp(Math.min(w, h) / 390, 0.75, 1.9);
    g.cx = w / 2;
    g.cy = h * CENTER_Y_RATIO;
    g.R = Math.min(w * R_W_RATIO, h * R_H_RATIO, R_MAX * g.S);
    g.rIn = g.R * INRADIUS_RATIO;
    g.ballR = clamp(g.R * BALL_R_RATIO, BALL_R_MIN * g.S, BALL_R_MAX * g.S);
    /* a mid-flight resize (rotating the phone) keeps the ball on the octagon's
       axis rather than stranding it off to one side of the new centre */
    if (g.ball) g.ball.x = g.cx;
  };

  g.reset = () => {
    g.rot = 0; g.rotVel = 0; g.rotTarget = 0; g.driftRate = 0;
    g.score = 0; g.streak = 0;
    g.bag = []; g.lastColor = -1;
    g.particles.list.length = 0;
    g.rings.length = 0;
    g.sideFlash.fill(0);
    g.pop = 0; g.shake = 0; g.matchFlash = 0; g.missFlash = 0; g.lockPulse = 0;
    g.nextColor = drawColor(g);
    g.ball = null;
    g.spawn();
  };

  /** Drops a new ball from the dead centre of the octagon, at rest. */
  g.spawn = () => {
    const color = g.nextColor;
    g.nextColor = drawColor(g);
    g.ball = {
      c: color,
      x: g.cx, y: g.cy,
      vy: 0,
      alive: true,
      trail: [],
    };

    /* drift flips direction each ball so it never becomes a constant the
       player can pre-compensate for once and forget */
    const mag = driftFor(g.score);
    g.driftRate = mag ? mag * (Math.random() < 0.5 ? -1 : 1) : 0;

    cb.onSpawn?.(color, g.nextColor);
  };

  /** @param {-1 | 1} dir  -1 = counter-clockwise (left tap), 1 = clockwise */
  g.rotate = (dir) => {
    g.rotTarget += dir * EDGE_ANGLE;
    cb.onRotate?.(dir);
  };

  /** Rewarded-ad continue: clears the wreck and drops a fresh ball, score intact. */
  g.revive = () => {
    g.particles.list.length = 0;
    g.missFlash = 0; g.shake = 0;
    g.streak = 0;
    /* hand the player a drift-free ball to re-find their footing on */
    g.spawn();
    g.driftRate = 0;
  };

  function ringPulse(x, y, color, from, to, life, width) {
    g.rings.push({ x, y, color, from, to, life, age: 0, width });
  }

  function resolveHit(side) {
    const b = g.ball;
    /* contact point on the wall's inner face: the ball rests against it from
       the inside, so the touch is a ball-radius *further out* along the normal */
    const a = sideAngle(g.rot, side);
    const cxp = b.x + Math.cos(a) * g.ballR;
    const cyp = b.y + Math.sin(a) * g.ballR;
    const color = SIDE_COLORS[b.c];
    const rm = g.reduced ? 0.4 : 1;
    b.alive = false;

    if (side === b.c) {
      g.score += 1;
      g.streak += 1;
      g.sideFlash[side] = 1;
      g.pop = 1;
      g.matchFlash = 1;

      burst(g.particles, cxp, cyp, color, 22, 340 * g.S, 5 * g.S, rm);
      ringPulse(cxp, cyp, color, g.ballR, g.ballR + 78 * g.S, 0.5, 3 * g.S);
      /* the outer sweep stops just past the vertices: the octagon now nearly
         fills the viewport, so a wider ring would only be clipped by the edges */
      ringPulse(g.cx, g.cy, color, g.rIn * 0.55, g.R * 1.04, 0.62, 2 * g.S);
      /* a few sparks thrown back up the way the ball came, so the impact
         reads as a bounce rather than the ball being deleted */
      if (!g.reduced) {
        for (let i = 0; i < 7; i++) {
          emit(g.particles, {
            x: cxp, y: cyp,
            vx: (Math.random() * 2 - 1) * 130 * g.S,
            vy: -(90 + Math.random() * 190) * g.S,
            life: 0.45 + Math.random() * 0.3,
            r: (1.6 + Math.random() * 2.2) * g.S,
            color, grav: 520, kind: 'chip',
          });
        }
      }

      cb.onMatch?.(g.score, g.streak);
      g.spawn();
      return;
    }

    /* miss — the wreck stays put; React drives the phase change */
    g.streak = 0;
    g.sideFlash[side] = 1;
    g.shake = 1;
    g.missFlash = 1;
    burst(g.particles, cxp, cyp, color, 26, 300 * g.S, 5 * g.S, rm);
    burst(g.particles, cxp, cyp, SIDE_COLORS[side], 14, 220 * g.S, 4 * g.S, rm);
    ringPulse(cxp, cyp, color, g.ballR, g.ballR + 60 * g.S, 0.45, 2.5 * g.S);
    cb.onMiss?.(side, b.c);
  }

  g.update = (dt) => {
    g.t += dt;

    /* ── dial: taps land on rotTarget instantly, the visible angle springs
       after it. Collision reads g.rot, so the overshoot is honest. ── */
    if (g.driftRate) g.rotTarget += g.driftRate * dt;
    g.rotVel += (g.rotTarget - g.rot) * ROT_STIFFNESS * dt;
    g.rotVel *= Math.exp(-ROT_DAMPING * dt);
    g.rot += g.rotVel * dt;

    const b = g.ball;
    if (b && b.alive) {
      const prevY = b.y;
      b.vy += gravityFor(g.score) * dt;
      b.y += b.vy * dt;

      b.trail.push(b.y);
      if (b.trail.length > TRAIL_MAX) b.trail.shift();

      /* ── Continuous collision, on purpose ──
         At the top gravity the ball covers more than its own diameter in a
         frame, so testing "am I overlapping now?" both tunnels and, worse,
         can name the wrong side when the overshoot buries the ball past a
         vertex — the player would watch the guide lock on and still die.
         Instead we solve for the exact contact along this step and snap to
         it. It is the same predictLanding() that draws the guide, evaluated
         at the same rotation, so what the guide promises is what resolves. */
      const lim = g.rIn - g.ballR;
      const hit = predictLanding(b.x - g.cx, prevY - g.cy, g.rot, lim);
      if (hit) {
        if (hit.drop <= b.y - prevY) {
          b.y = prevY + hit.drop;
          resolveHit(hit.side);
        }
      } else {
        /* no forward solution: the ball is already against a wall (a resize
           can shrink the octagon in around it) — resolve where it sits */
        const { side, reach } = support(b.x - g.cx, b.y - g.cy, g.rot);
        if (reach >= lim) resolveHit(side);
      }
    }

    /* landing preview, recomputed every frame: rotating the dial visibly
       re-aims the guide, which is how the player learns the mapping */
    const live = g.ball;
    if (live && live.alive) {
      const hit = predictLanding(live.x - g.cx, live.y - g.cy, g.rot, g.rIn - g.ballR);
      if (hit) {
        const locked = hit.side === live.c;
        if (locked && !g.landing?.locked) g.lockPulse = 1;
        g.landing = { side: hit.side, x: live.x, y: live.y + hit.drop, locked };
      } else {
        g.landing = null;
      }
    } else {
      g.landing = null;
    }

    updateParticles(g.particles, dt);

    for (let i = g.rings.length - 1; i >= 0; i--) {
      const ring = g.rings[i];
      ring.age += dt;
      if (ring.age >= ring.life) g.rings.splice(i, 1);
    }

    for (let k = 0; k < SIDES; k++) g.sideFlash[k] = decay(g.sideFlash[k], 2.6, dt);
    g.pop = decay(g.pop, 3.4, dt);
    g.shake = decay(g.shake, 2.4, dt);
    g.matchFlash = decay(g.matchFlash, 3.2, dt);
    g.missFlash = decay(g.missFlash, 1.8, dt);
    g.lockPulse = decay(g.lockPulse, 3.0, dt);
  };

  g.render = (ctx) => renderGame(ctx, g);

  return g;
}
