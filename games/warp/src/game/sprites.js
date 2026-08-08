/* ══ Warp — what gets drawn inside the tube ══
   Slabs, cores, the craft and the lane guide. Every one of them is projected
   through the same camera as the wall, so nothing here knows about pixels
   either — an obstacle is an angular span at a depth, full stop. */

import { withAlpha, blendHex, clamp } from "@37apps/core/canvas/color.js";
import { palette, OBST_INNER, OBST_THICK, ORBIT, CORE_R } from "./constants.js";
import { shapeR, scaleAt, project } from "./tunnel.js";

const TAU = Math.PI * 2;

/** Samples an arc along the wall densely enough that the polygon's corners
    inside the span are actually followed rather than cut across. */
function arcPoints(a0, a1, n0, n1, t, radiusScale) {
  const span = a1 - a0;
  const steps = Math.max(2, Math.ceil(span / 0.12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = a0 + (span * i) / steps;
    pts.push([th, shapeR(th, n0, n1, t) * radiusScale]);
  }
  return pts;
}

function traceArc(ctx, cam, pts, z, move) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = project(cam, pts[i][0], pts[i][1], z);
    if (i === 0 && move) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/**
 * One slab: an annular sector cut out of the wall, extruded away from the
 * camera. Three faces are drawn — the back plate, the inner cylindrical face
 * (visible because the camera sits *inside* the tube), and the front plate that
 * the player actually has to be clear of. The bright rim is on the front plate
 * only, so the lit edge is always the exact plane collision resolves on.
 */
export function drawSlab(ctx, cam, o, a0, a1, z, glowHex, hyper, dying = 0) {
  const outer = arcPoints(a0, a1, o.n0, o.n1, o.t, 1);
  const inner = [...arcPoints(a0, a1, o.n0, o.n1, o.t, 1)].reverse().map(([th]) => [th, OBST_INNER]);
  const zBack = z + OBST_THICK;
  const near = clamp(1 - z / 9, 0, 1);

  ctx.save();
  if (dying > 0) ctx.globalAlpha = Math.max(0, 1 - dying);

  /* back plate */
  ctx.beginPath();
  traceArc(ctx, cam, outer, zBack, true);
  traceArc(ctx, cam, inner, zBack, false);
  ctx.closePath();
  ctx.fillStyle = palette.ink;
  ctx.fill();

  /* inner face — the strip you see the underside of as it comes at you */
  ctx.beginPath();
  traceArc(ctx, cam, inner, z, true);
  traceArc(ctx, cam, [...inner].reverse(), zBack, false);
  ctx.closePath();
  ctx.fillStyle = blendHex(palette.slabFace, glowHex, 0.1 + near * 0.12);
  ctx.fill();

  /* front plate */
  ctx.beginPath();
  traceArc(ctx, cam, outer, z, true);
  traceArc(ctx, cam, inner, z, false);
  ctx.closePath();
  ctx.fillStyle = blendHex(palette.slab, "#000000", 0.15);
  ctx.fill();

  /* rim: the one bright line on an otherwise ink shape. Its weight scales with
     proximity so a slab announces itself by getting *brighter*, not just
     bigger — the same telegraph trick Skid uses for teeth. */
  ctx.strokeStyle = hyper
    ? withAlpha(palette.hyper, 0.6 + near * 0.4)
    : withAlpha(glowHex, 0.58 + near * 0.42);
  ctx.lineWidth = Math.max(1.6, scaleAt(cam, z) * 0.024);
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.restore();
}

/** The pickup: a spinning gem riding the craft's own lane. */
export function drawCore(ctx, cam, theta, z, t) {
  const s = scaleAt(cam, z);
  const [x, y] = project(cam, theta, ORBIT, z);
  const r = CORE_R * s;
  const spin = t * 2.4;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.4);
  halo.addColorStop(0, withAlpha(palette.core, 0.5));
  halo.addColorStop(1, withAlpha(palette.core, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(-r * 3.4, -r * 3.4, r * 6.8, r * 6.8);

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.72, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.72, 0);
  ctx.closePath();
  ctx.fillStyle = palette.core;
  ctx.fill();
  ctx.strokeStyle = palette.coreHot;
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.42);
  ctx.lineTo(r * 0.3, 0);
  ctx.lineTo(0, r * 0.42);
  ctx.closePath();
  ctx.fillStyle = palette.coreHot;
  ctx.fill();
  ctx.restore();
}

/**
 * The lane the craft can never leave, drawn as a faint dotted ring. It answers
 * the one question the perspective genuinely hides — "does that slab reach far
 * enough in to hit me?" — without a single word of tutorial: anything crossing
 * the ring is lethal, anything outside it isn't.
 */
export function drawLane(ctx, cam, glowHex, alpha = 0.16) {
  const s = scaleAt(cam, 1) * ORBIT;
  ctx.save();
  ctx.setLineDash([s * 0.06, s * 0.09]);
  ctx.strokeStyle = withAlpha(glowHex, alpha);
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  ctx.arc(cam.cx, cam.cy, s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * The craft. Drawn in screen space around its projected position — it's the one
 * thing that never rotates with the tunnel, only banks with how hard you're
 * rolling, which is what keeps "which way am I going" legible at speed.
 */
export function drawCraft(ctx, cam, theta, z, bank, hyper, invuln, t) {
  const s = scaleAt(cam, z);
  const [x, y] = project(cam, theta, ORBIT, z);
  const k = s * 0.115;
  /* the hull is modelled nose-up (local -y); pointing it at the vanishing
     point means turning that nose to face back down the radius it sits on */
  const facing = theta + cam.rot - Math.PI / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + bank * 0.22);
  if (invuln) ctx.globalAlpha = 0.45 + Math.sin(t * 22) * 0.3;

  /* The hull stays white in every state, including HYPER. Tinting it magenta
     was the obvious way to show the power state and it made the craft vanish
     against the magenta zone — "you are the white one" has to hold in all four
     zones, so the state is carried by the halo and the thruster instead. */
  const wash = hyper ? palette.hyper : palette.core;

  /* thruster bloom behind the hull */
  const flame = ctx.createRadialGradient(0, k * 0.9, 0, 0, k * 0.9, k * (hyper ? 3.4 : 2.6));
  flame.addColorStop(0, withAlpha(wash, hyper ? 0.95 : 0.75));
  flame.addColorStop(1, withAlpha(wash, 0));
  ctx.fillStyle = flame;
  ctx.fillRect(-k * 3.4, -k * 2, k * 6.8, k * 6.8);

  ctx.shadowColor = hyper ? withAlpha(palette.hyper, 1) : withAlpha(palette.craft, 0.9);
  ctx.shadowBlur = k * (hyper ? 2.6 : 1.4);

  /* hull: a chevron, wings swept back from a single point */
  ctx.beginPath();
  ctx.moveTo(0, -k * 1.25);
  ctx.lineTo(k * 1.0, k * 0.85);
  ctx.lineTo(0, k * 0.35);
  ctx.lineTo(-k * 1.0, k * 0.85);
  ctx.closePath();
  ctx.fillStyle = palette.craft;
  ctx.fill();

  ctx.shadowBlur = 0;
  if (hyper) {
    ctx.strokeStyle = palette.hyper;
    ctx.lineWidth = k * 0.22;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, -k * 0.72);
  ctx.lineTo(k * 0.34, k * 0.28);
  ctx.lineTo(-k * 0.34, k * 0.28);
  ctx.closePath();
  ctx.fillStyle = withAlpha(wash, 0.95);
  ctx.fill();
  ctx.restore();
}
