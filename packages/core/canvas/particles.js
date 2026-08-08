/* ══ Shared particle pool ══
   A flat array of plain objects with a hard cap. Deliberately not a class
   hierarchy: every game wants the same four behaviours (spark, chip, streak,
   ring) and nothing more, and the whole thing has to survive being iterated
   60 times a second without allocating. */

const MAX = 360;

export function createParticles(max = MAX) {
  return { list: [], max, emitAcc: 0 };
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * @param {object} p pool
 * @param {object} o {x, y, vx, vy, life, r, color, grav, drift, kind}
 */
export function emit(p, o) {
  if (p.list.length >= p.max) p.list.shift();
  p.list.push({ age: 0, grav: 0, drift: 0, kind: 'spark', ...o });
}

/**
 * Radial burst — the universal "something just happened here" effect. Used
 * for pickups, deaths, and hazards destroyed by a power-up.
 * @param {number} [reduce] scale factor for prefers-reduced-motion (0..1)
 */
export function burst(p, x, y, color, n, spread, r = 4, reduce = 1) {
  const count = Math.round(n * reduce);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rand(spread * 0.35, spread);
    emit(p, {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(0.35, 0.8), r: rand(r * 0.5, r), color, grav: 260, kind: 'chip',
    });
  }
}

/**
 * Rate-limited continuous emission (engine trails). Call every frame with the
 * desired particles-per-second; the accumulator makes the rate frame-rate
 * independent instead of "one per frame, whatever that means today".
 */
export function stream(p, dt, perSecond, make) {
  p.emitAcc += perSecond * dt;
  while (p.emitAcc >= 1) {
    p.emitAcc -= 1;
    emit(p, make());
  }
}

/** @param {number} [worldDy] world scroll to carry non-spark particles with */
export function updateParticles(p, dt, worldDy = 0, worldDx = 0) {
  const out = [];
  for (const q of p.list) {
    q.age += dt;
    if (q.age >= q.life) continue;
    q.vy += q.grav * dt;
    q.x += q.vx * dt + (q.kind === 'spark' ? 0 : worldDx);
    q.y += q.vy * dt + (q.kind === 'spark' ? 0 : worldDy);
    out.push(q);
  }
  p.list = out;
}

export function drawParticles(ctx, p) {
  for (const q of p.list) {
    const k = 1 - q.age / q.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r * (0.35 + k * 0.65), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
