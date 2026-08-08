/* ══ Oktogon — octagon geometry ══

   The whole game is one convex-polygon question asked two ways, so both
   answers come from the same primitive: a side's outward normal.

   Side k's outward normal points at  rot − 90° + k·45°, i.e. side 0 faces
   straight up when the dial is at rest. A point p (relative to the centre)
   satisfies  p·n_k ≤ inradius  for every k exactly while it is inside.

   The ball plays *inside* the octagon: it starts at the centre and falls onto
   a side's inner face. So the question is when it leaves the region, not when
   it enters one — the *largest* p·n_k over the eight sides says how close it
   has come to a wall and which wall that is, and clipping its descent against
   the same eight constraints says which wall it reaches first. */

import { SIDES, EDGE_ANGLE, HALF_EDGE } from './constants.js';

/** Outward normal angle of side `k` at dial rotation `rot`, in radians. */
export function sideAngle(rot, k) {
  return rot - Math.PI / 2 + k * EDGE_ANGLE;
}

/**
 * Endpoints of side `k` — the two vertices it spans, at circumradius R.
 * @returns {{ax: number, ay: number, bx: number, by: number}}
 */
export function sideEnds(cx, cy, R, rot, k) {
  const a = sideAngle(rot, k);
  return {
    ax: cx + R * Math.cos(a - HALF_EDGE), ay: cy + R * Math.sin(a - HALF_EDGE),
    bx: cx + R * Math.cos(a + HALF_EDGE), by: cy + R * Math.sin(a + HALF_EDGE),
  };
}

/**
 * Support function: the side the point (dx, dy) — measured from the centre —
 * is nearest to, and how far along that side's normal it has travelled.
 * @returns {{side: number, reach: number}} `reach` is p·n for that side; a
 *   ball inside is touching that wall once reach ≥ inradius − ballR.
 */
export function support(dx, dy, rot) {
  let reach = -Infinity;
  let side = 0;
  for (let k = 0; k < SIDES; k++) {
    const a = sideAngle(rot, k);
    const s = dx * Math.cos(a) + dy * Math.sin(a);
    if (s > reach) { reach = s; side = k; }
  }
  return { side, reach };
}

/**
 * Which inner face a ball falling straight down from (dx, dy) will land on,
 * and how far it still has to fall, assuming the dial stops where it is now.
 *
 * Clipping the descent against the eight half-planes: only the downward-facing
 * normals (n_y > 0) can be reached by falling, each giving an upper bound on
 * how far the ball may travel before crossing that wall. The *smallest* of
 * those bounds is the wall it actually meets — the same side `support` would
 * report a frame later.
 *
 * @param {number} lim inradius − ball radius
 * @returns {{side: number, drop: number} | null} null when the ball is already
 *   resting on a wall, so there is no forward solution.
 */
export function predictLanding(dx, dy, rot, lim) {
  let drop = Infinity;
  let side = -1;
  for (let k = 0; k < SIDES; k++) {
    const a = sideAngle(rot, k);
    const ny = Math.sin(a);
    if (ny < 1e-4) continue;               // side faces sideways or up
    const s = dx * Math.cos(a) + dy * ny;
    const t = (lim - s) / ny;              // ny > 0 ⇒ this is an upper bound on t
    if (t < drop) { drop = t; side = k; }
  }
  if (side < 0 || drop < 0 || !Number.isFinite(drop)) return null;
  return { side, drop };
}
