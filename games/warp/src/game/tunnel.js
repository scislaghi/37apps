/* ══ Warp — the tunnel ══
   Cross-section, projection and the wall itself. The whole world is one radius
   function `polyR(θ, n)` sampled at whatever angles a caller needs, which is
   what lets the tunnel morph between side counts for free: a morphing tunnel is
   just a blend of two radius functions, not a mesh that has to be re-built. */

import { blendHex, withAlpha, clamp, smoothstep } from "@37apps/core/canvas/color.js";
import { ZONES, MORPH_LEN, RING_STEP, Z_NEAR, Z_FAR, METRES_PER_UNIT } from "./constants.js";

const TAU = Math.PI * 2;
const CYCLE = ZONES[ZONES.length - 1].at;

/**
 * Distance from the axis to the wall of a regular `n`-gon at angle `θ`,
 * normalised so a *face* sits at radius 1 and the corners bulge past it.
 * Apothem-normalised rather than circumradius-normalised on purpose: it keeps
 * the flat of the wall — where the craft spends nearly all its time — at the
 * same distance in every zone, so morphing from an octagon to a square changes
 * the shape of the tunnel without also changing how big it feels.
 */
export function polyR(theta, n) {
  const seg = TAU / n;
  let l = theta % seg;
  if (l < 0) l += seg;
  return 1 / Math.cos(l - seg / 2);
}

/** Blended radius across a morph. `t` runs 0 → 1 from `n0` to `n1`. */
export function shapeR(theta, n0, n1, t) {
  if (t <= 0 || n0 === n1) return polyR(theta, n0);
  if (t >= 1) return polyR(theta, n1);
  const a = polyR(theta, n0), b = polyR(theta, n1);
  return a + (b - a) * t;
}

/**
 * Everything the tunnel looks like at a given depth *in metres along the
 * tunnel* — not at the player's own distance. Bands, obstacles and the craft
 * all call this with their own world position, which is why the next zone's
 * colour and cross-section are visible arriving from far away rather than
 * snapping over the whole screen at a threshold.
 */
export function zoneAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  const z0 = ZONES[i], z1 = ZONES[i + 1];
  /* the morph is held off until the last MORPH_LEN metres of the zone, so a
     zone is a place with an identity and not a permanent cross-fade */
  const raw = (a - (z1.at - MORPH_LEN)) / MORPH_LEN;
  const t = smoothstep(clamp(raw, 0, 1));
  /* every colour that leaves here is a real hex, because all of them get
     blended again downstream (fog by depth, glow by alpha) — see `blendHex` */
  return {
    index: i,
    t,
    n0: z0.sides,
    n1: z1.sides,
    name: t < 0.5 ? z0.name : z1.name,
    nextName: z1.name,
    wallA: blendHex(z0.wallA, z1.wallA, t),
    wallB: blendHex(z0.wallB, z1.wallB, t),
    fog: blendHex(z0.fog, z1.fog, t),
    glow: blendHex(z0.glow, z1.glow, t),
  };
}

/** The metre mark where the run's *next* cross-section starts arriving. */
export function nextMorphAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  return m - a + ZONES[i + 1].at - MORPH_LEN;
}

/* ── outline cache ───────────────────────────────────────────────────────
   A band's cross-section only depends on (n0, n1, t), and within a zone every
   band on screen shares one. Sampling is exact for a pure polygon (vertices
   *and* face midpoints both lie on the real edge) and a close approximation
   mid-morph, which is the only time it's blended at all. */

/* Blend quantisation. Coarser than this and two neighbouring bands mid-morph
   snap to different cross-sections, which shows up as a hard ring drawn across
   the wall exactly where the rounding changes — the band overlap can only hide
   a seam, not a step. */
const Q = 64;

const outlineCache = new Map();

function unitOutline(n0, n1, t) {
  const key = n0 * 10000 + n1 * 128 + Math.round(t * Q);
  const hit = outlineCache.get(key);
  if (hit) return hit;

  const tq = Math.round(t * Q) / Q;
  const angles = new Set();
  const add = (n) => {
    for (let i = 0; i < n; i++) {
      angles.add((i / n) * TAU);
      angles.add(((i + 0.5) / n) * TAU);
    }
  };
  add(n0);
  if (tq > 0 && n1 !== n0) add(n1);

  const pts = [...angles].sort((a, b) => a - b).map((th) => {
    const r = shapeR(th, n0, n1, tq);
    return [Math.cos(th) * r, Math.sin(th) * r];
  });
  outlineCache.set(key, pts);
  return pts;
}

/**
 * The same outline, pre-rotated by the camera roll. One rotation per distinct
 * cross-section per frame instead of one per band — during a morph a dozen
 * bands can each carry a slightly different blend, and rotating every vertex of
 * every band individually is the difference between a free backdrop and a
 * measurable one.
 */
export function rotatedOutline(frameCache, n0, n1, t, cosR, sinR) {
  const key = n0 * 10000 + n1 * 128 + Math.round(t * Q);
  const hit = frameCache.get(key);
  if (hit) return hit;
  const base = unitOutline(n0, n1, t);
  const out = base.map(([x, y]) => [x * cosR - y * sinR, x * sinR + y * cosR]);
  frameCache.set(key, out);
  return out;
}

/** Screen-space radius of a unit-radius feature at depth `z`. */
export const scaleAt = (cam, z) => cam.f / Math.max(z, 0.05);

/**
 * Camera basis for one frame. `roll` already contains the "player sits at the
 * bottom of the screen" half-turn, so every other module can work in plain
 * world angles and never think about screen orientation.
 */
export function makeCamera(w, h, camRoll, shakeX = 0, shakeY = 0) {
  const rot = -camRoll + Math.PI / 2;
  return {
    cx: w / 2 + shakeX,
    cy: h / 2 + shakeY,
    /* f is set from the craft's plane: the craft orbits at ORBIT × the apothem
       at z = 1, and we want that circle to land at a comfortable fraction of
       the shorter screen axis on any device */
    f: Math.min(w * 0.46, h * 0.33),
    rot,
    cos: Math.cos(rot),
    sin: Math.sin(rot),
  };
}

/** World (angle, radius, depth) → screen point. */
export function project(cam, theta, radius, z) {
  const a = theta + cam.rot;
  const s = scaleAt(cam, z) * radius;
  return [cam.cx + Math.cos(a) * s, cam.cy + Math.sin(a) * s];
}

function tracePath(ctx, cam, pts, z) {
  const s = scaleAt(cam, z);
  for (let i = 0; i < pts.length; i++) {
    const x = cam.cx + pts[i][0] * s;
    const y = cam.cy + pts[i][1] * s;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Draws the wall from the far plane forward, calling `flush(zFar)` before each
 * band so the caller can interleave whatever it owns (slabs, cores, debris) at
 * the right depth. Occlusion in a tube is entirely a matter of paint order —
 * there's no z-buffer here and there doesn't need to be one.
 *
 * @returns the zone at the player's own position, for the HUD and the tint.
 */
export function drawTunnel(ctx, w, h, cam, travelUnits, metres, flush) {
  const here = zoneAt(metres);

  /* backdrop: the fog the tunnel dissolves into, plus the bloom at the
     vanishing point that makes the far end read as light at the end of it */
  const bg = ctx.createRadialGradient(cam.cx, cam.cy, 0, cam.cx, cam.cy, Math.max(w, h) * 0.72);
  bg.addColorStop(0, blendHex(here.fog, here.glow, 0.22));
  bg.addColorStop(0.35, here.fog);
  bg.addColorStop(1, "#05040A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const frameCache = new Map();
  const i0 = Math.floor((travelUnits + Z_NEAR) / RING_STEP);
  const iEnd = Math.floor((travelUnits + Z_FAR) / RING_STEP);

  /* far → near, so nearer bands paint over the ones behind them */
  for (let i = iEnd; i >= i0; i--) {
    const zFar = (i + 1) * RING_STEP - travelUnits;
    const zNear = i * RING_STEP - travelUnits;
    if (zNear > Z_FAR || zFar < Z_NEAR) continue;

    flush?.(zFar);

    /* the band's own position along the tunnel, not the player's — this is
       what puts the next zone on screen ahead of you */
    const z = zoneAt((i + 0.5) * RING_STEP * METRES_PER_UNIT);

    const pts = rotatedOutline(frameCache, z.n0, z.n1, z.t, cam.cos, cam.sin);
    const depth = clamp(zFar / Z_FAR, 0, 1);
    const fade = Math.pow(depth, 0.72);
    const base = (i & 1) ? z.wallA : z.wallB;

    /* the far edge is pushed a hair past the next band's near edge: two
       antialiased fills that merely *share* an edge leave a light hairline
       between them, which on 40 bands reads as a set of dashed rings drawn on
       the wall. Bands are painted far → near, so the overlap is always covered
       by the band in front of it. */
    ctx.beginPath();
    tracePath(ctx, cam, pts, Math.max(zNear, Z_NEAR));
    tracePath(ctx, cam, pts, zFar * 1.012);
    ctx.fillStyle = blendHex(base, z.fog, fade * 0.94);
    ctx.fill("evenodd");
  }

  /* ── spokes: the corner seams running the length of the tube. Without them a
     stack of concentric bands has no rotational reference at all and holding
     left simply does nothing visible — they *are* the read on the roll. ── */
  const pz = zoneAt(metres);
  const nearZ = Math.max(Z_NEAR + 0.02, RING_STEP);
  const sNear = scaleAt(cam, nearZ);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, cam.f * 0.012);
  /* both seam counts are drawn across a morph, cross-faded — snapping the
     corner count at t = 0.5 is visible as a flicker on an otherwise smooth
     shape change, and the old corners really do survive halfway in */
  const seamSets = pz.n0 === pz.n1 ? [[pz.n0, 1]] : [[pz.n0, 1 - pz.t], [pz.n1, pz.t]];
  for (const [seams, k] of seamSets) {
    if (k <= 0.01) continue;
    const r = 1 / Math.cos(Math.PI / seams);
    for (let i = 0; i < seams; i++) {
      const th = (i / seams) * TAU + cam.rot;
      const x = cam.cx + Math.cos(th) * r * sNear;
      const y = cam.cy + Math.sin(th) * r * sNear;
      const grad = ctx.createLinearGradient(cam.cx, cam.cy, x, y);
      grad.addColorStop(0, withAlpha(pz.glow, 0));
      grad.addColorStop(0.28, withAlpha(pz.glow, 0.1 * k));
      grad.addColorStop(1, withAlpha(pz.glow, 0.34 * k));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cam.cx, cam.cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  ctx.restore();

  /* The light at the end. Deliberately small and hot rather than broad and
     soft: a wide bloom is prettier in a still frame and it swallows exactly the
     region where slabs first appear, so anything approaching stays invisible
     until it is already close. Readability beats the postcard. */
  const r = cam.f * 0.22;
  const core = ctx.createRadialGradient(cam.cx, cam.cy, 0, cam.cx, cam.cy, r);
  core.addColorStop(0, withAlpha(pz.glow, 0.85));
  core.addColorStop(0.22, withAlpha(pz.glow, 0.26));
  core.addColorStop(1, withAlpha(pz.glow, 0));
  ctx.fillStyle = core;
  ctx.fillRect(cam.cx - r, cam.cy - r, r * 2, r * 2);

  return here;
}

/** Vignette + the rounded-frame silhouette, painted after everything else. */
export function drawVignette(ctx, w, h, cam, tint, strength = 0.55) {
  const vg = ctx.createRadialGradient(cam.cx, cam.cy, Math.min(w, h) * 0.22, cam.cx, cam.cy, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
  }
}
