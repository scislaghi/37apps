/* ══ Nugget — shaft geometry ══
   One module owns where the three tunnels are, because three others need the
   answer and none of them may disagree: the backdrop draws the floors, the
   engine drops boulders onto them, and the miner stands on them. */

import { LANES, scaleFor } from "./constants.js";

export const FLOOR_H = 14;     // thickness of the slab a lane's floor is drawn as
export const CEIL_H = 16;      // rubble strip hanging under each lane's ceiling

/** Recomputes every derived size after a resize. */
export function applyLayout(g, w, h) {
  const s = scaleFor(w);
  g.w = w; g.h = h; g.s = s;

  /* room for the HUD up top and a breath of shaft below the last floor */
  g.top = (92 + 22) * s;
  /* the bottom tunnel's floor has to clear the home indicator *and* the
     native banner ad, so the lowest lane is never the one you can't see */
  g.bot = 56 * s;
  g.laneH = (h - g.top - g.bot) / LANES;

  g.rockR = Math.min(40 * s, g.laneH * 0.33);
  g.bodyH = Math.min(50 * s, g.laneH * 0.46);
  g.bodyW = g.bodyH * 0.6;
  g.playerX = Math.max(66 * s, w * 0.26);
  /* "one cell" is the footprint a boulder claims, not a share of the lane —
     tying it to lane height made the danger cell balloon on a tall phone and
     starved nugget placement of legal spots */
  g.cell = Math.max(96 * s, g.rockR * 2.6);
}

/** Top surface of the slab lane `l` runs along — the miner's feet line. */
export function laneFloorY(g, l) {
  return g.top + g.laneH * (l + 1) - FLOOR_H * g.s;
}

/** Underside of lane `l`'s ceiling — where boulders hang from. */
export function laneCeilY(g, l) {
  return g.top + g.laneH * l + CEIL_H * g.s;
}

export function laneMidY(g, l) {
  return (laneCeilY(g, l) + laneFloorY(g, l)) / 2;
}
