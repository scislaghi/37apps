/* ══ Vector — the corridor and the dart ══
   Everything here draws in canvas-local space and never reads engine state,
   so the menu preview can reuse the exact same dart the player flies. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { palette } from "./constants.js";

/** Traces one wall's inner edge across every visible node. */
function edgePath(ctx, nodes, side) {
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, side === "top" ? nodes[0].top : nodes[0].bot);
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    ctx.lineTo(n.x, side === "top" ? n.top : n.bot);
  }
}

/**
 * The corridor. Solid near-black mass, a lit inner edge in the live accent,
 * and a lighter bevel just inside it — the bevel is what stops a big flat
 * silhouette from reading as a hole punched in the page.
 */
export function drawTerrain(ctx, nodes, w, h, s, accent) {
  if (nodes.length < 2) return;
  const first = nodes[0].x, last = nodes[nodes.length - 1].x;
  const over = 80 * s;

  for (const side of ["top", "bot"]) {
    const outer = side === "top" ? -over : h + over;

    /* the mass, then everything else painted *inside* it — a wall that far
       from the corridor is most of the screen on a tall phone, and left flat
       it reads as a hole in the page rather than as rock */
    ctx.save();
    edgePath(ctx, nodes, side);
    ctx.lineTo(last, outer);
    ctx.lineTo(first, outer);
    ctx.closePath();
    ctx.fillStyle = palette.terrain;
    ctx.fill();
    ctx.clip();

    /* lit near the corridor, unlit deep in — depth without a light source */
    let near = nodes[0][side];
    for (const n of nodes) near = side === "top" ? Math.max(near, n[side]) : Math.min(near, n[side]);
    const grad = ctx.createLinearGradient(0, near, 0, outer);
    grad.addColorStop(0, palette.terrainFace);
    grad.addColorStop(1, palette.terrainDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, Math.min(near, outer), w, Math.abs(outer - near));

    /* faint diagonal ribbing, echoing the background hatch so the two masses
       read as the same material seen from two sides */
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    const lean = h * 0.3 * (side === "top" ? -1 : 1);
    for (let x = -Math.abs(lean); x < w + Math.abs(lean); x += 26 * s) {
      ctx.beginPath();
      ctx.moveTo(x, -over);
      ctx.lineTo(x + lean, h + over);
      ctx.stroke();
    }
    ctx.restore();

    /* bevel — a soft lighter stroke sitting on the mass, drawn before the
       accent so the accent always ends up the brightest thing on the edge */
    ctx.save();
    ctx.strokeStyle = palette.terrainFace;
    ctx.lineWidth = 9 * s;
    ctx.lineJoin = "round";
    edgePath(ctx, nodes, side);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.8 * s;
    ctx.lineJoin = "round";
    ctx.shadowColor = withAlpha(accent, 0.85);
    ctx.shadowBlur = 14 * s;
    edgePath(ctx, nodes, side);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The dart. One solid chevron so the silhouette survives at 8px, a white core
 * so it never disappears against a dark wall it's about to hit, and a nose
 * angle driven entirely by the caller's velocity — the arrow always points
 * where it is actually going, which is the whole reason it's an arrow.
 */
export function drawArrow(ctx, s, t, accent, ghost = false) {
  const k = 1.55 * s;
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.35 + Math.sin(t * 22) * 0.25;

  ctx.shadowColor = withAlpha(accent, 0.9);
  ctx.shadowBlur = 18 * s;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(11 * k, 0);
  ctx.lineTo(-6 * k, -6.4 * k);
  ctx.lineTo(-2.6 * k, 0);
  ctx.lineTo(-6 * k, 6.4 * k);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.core;
  ctx.beginPath();
  ctx.moveTo(6.4 * k, 0);
  ctx.lineTo(-2.2 * k, -2.3 * k);
  ctx.lineTo(-0.7 * k, 0);
  ctx.lineTo(-2.2 * k, 2.3 * k);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * The exhaust ribbon — a short tapered wedge behind the dart. Deliberately
 * short-lived: the persistent drawn trail belongs to Line, and this one only
 * has to sell speed.
 */
export function drawRibbon(ctx, pts, s, accent) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i++) {
    const k = i / (pts.length - 1);
    ctx.globalAlpha = k * 0.5;
    ctx.strokeStyle = accent;
    ctx.lineWidth = (1 + k * 5) * s;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
