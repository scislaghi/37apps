/* ══ Line — the neon vocabulary ══
   Four hazard shapes, one collectible, one stroke. Everything is a flat
   accent fill with a two-pass bloom around it: a wide low-alpha copy under a
   solid core. On a dark field that reads as emission, which is what makes the
   shapes look lit rather than merely coloured — and it costs a fraction of
   what canvas `shadowBlur` does at 60fps. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { palette } from "./constants.js";

/** Runs `path` three times: wide halo, mid halo, solid core. */
function neon(ctx, color, path, s, core = "#FFFFFF") {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = withAlpha(color, 0.14);
  path(9 * s);
  ctx.fillStyle = withAlpha(color, 0.28);
  path(4 * s);
  ctx.restore();
  ctx.fillStyle = color;
  path(0);
  /* a hairline of near-white along the shape keeps the silhouette crisp once
     the bloom has softened its edges */
  ctx.fillStyle = withAlpha(core, 0.55);
  path(-2 * s);
}

/* ────────────────────────────  the stroke  ──────────────────────────── */

/**
 * The player's line: a persistent polyline of everywhere it has been, drawn
 * once as a soft wide halo and once as the bright core, fading out toward the
 * tail so the oldest history dissolves instead of being cut off mid-stroke.
 */
export function drawTrail(ctx, pts, s, surge) {
  if (pts.length < 2) return;
  const col = surge ? palette.lineHot : palette.line;

  /* One continuous path, faded by a gradient along its length. Stroking each
     segment separately with its own alpha is the obvious approach and it's
     wrong: consecutive round caps overlap at different opacities and the
     stroke reads as a string of beads instead of a line. */
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);

  const yOld = pts[0].y, yNew = pts[pts.length - 1].y;
  const fade = (hex, a) => {
    if (Math.abs(yOld - yNew) < 1) return withAlpha(hex, a);
    const g = ctx.createLinearGradient(0, yOld, 0, yNew);
    g.addColorStop(0, withAlpha(hex, 0));
    g.addColorStop(0.4, withAlpha(hex, a * 0.6));
    g.addColorStop(1, withAlpha(hex, a));
    return g;
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 22 * s; ctx.strokeStyle = fade(col, 0.12); ctx.stroke(path);
  ctx.lineWidth = 12 * s; ctx.strokeStyle = fade(col, 0.2); ctx.stroke(path);
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5.5 * s; ctx.strokeStyle = fade(col, 1); ctx.stroke(path);
  /* a hot white filament inside the stroke — it's what makes the line read as
     emitting rather than as a coloured ribbon */
  ctx.lineWidth = 1.8 * s; ctx.strokeStyle = fade("#FFFFFF", 0.55); ctx.stroke(path);
  ctx.restore();
}

/** The live tip — a bright disc with a corona and a forward spark. */
export function drawHead(ctx, s, t, surge, invuln) {
  const col = surge ? palette.lineHot : palette.line;
  const r = 6 * s * (1 + Math.sin(t * 9) * 0.06);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 6);
  g.addColorStop(0, withAlpha(col, 0.7));
  g.addColorStop(1, withAlpha(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();

  if (invuln) {
    ctx.strokeStyle = withAlpha(palette.lineHot, 0.35 + Math.sin(t * 18) * 0.25);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(0, 0, 18 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ──────────────────────────────  hazards  ────────────────────────────── */

/** BAR — a plain capsule segment. The shape that teaches "go around". */
export function drawBar(ctx, s, hw, hh) {
  neon(ctx, palette.bar, (g) => {
    ctx.beginPath();
    ctx.roundRect(-hw - g, -hh - g, (hw + g) * 2, (hh + g) * 2, hh + g);
    ctx.fill();
  }, s);
}

/**
 * ARC — a half-disc anchored to a screen edge, straight out of the reference
 * art. It doesn't just block a lane, it eats an entire side, which is what
 * makes it feel different from a bar rather than a bar with round ends.
 * @param {-1|1} side which edge it grows from
 */
export function drawArc(ctx, s, r, side, spin) {
  ctx.save();
  ctx.rotate(spin);
  neon(ctx, palette.arc, (g) => {
    ctx.beginPath();
    ctx.arc(0, 0, r + g, side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side > 0 ? Math.PI * 1.5 : Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
  }, s);
  ctx.restore();
}

/** BLADE — a bar rotating about its centre. Pure timing. */
export function drawBlade(ctx, s, len, spin) {
  ctx.save();
  ctx.rotate(spin);
  neon(ctx, palette.blade, (g) => {
    ctx.beginPath();
    ctx.roundRect(-len - g, -5 * s - g, (len + g) * 2, (5 * s + g) * 2, 5 * s + g);
    ctx.fill();
  }, s);
  /* hub: without it the bar reads as free-floating and the rotation has no
     visible centre to read the timing against */
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * GATE — two bars closing in from both edges with a travelling gap. The gap
 * position is passed in rather than derived here so the collision test and
 * the drawing can never disagree about where the safe lane is.
 */
export function drawGate(ctx, s, w, gapX, gapW, hh) {
  const draw = (x0, x1) => {
    if (x1 - x0 < 1) return;
    neon(ctx, palette.gate, (g) => {
      ctx.beginPath();
      ctx.roundRect(x0 - g, -hh - g, (x1 - x0) + g * 2, (hh + g) * 2, Math.min(hh + g, 8 * s));
      ctx.fill();
    }, s);
  };
  draw(-20, gapX - gapW / 2);
  draw(gapX + gapW / 2, w + 20);
}

/* ──────────────────────────────  orb  ────────────────────────────── */

/** The collectible that charges SURGE. */
export function drawOrb(ctx, s, t, phase) {
  const pulse = 1 + Math.sin(t * 6 + phase) * 0.12;
  const r = 6 * s * pulse;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
  g.addColorStop(0, withAlpha(palette.orb, 0.85));
  g.addColorStop(1, withAlpha(palette.orb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* a slowly counter-rotating ring makes an orb read as "collect me" rather
     than as one more round hazard */
  ctx.strokeStyle = withAlpha(palette.orb, 0.9);
  ctx.lineWidth = 1.8 * s;
  ctx.setLineDash([5 * s, 5 * s]);
  ctx.lineDashOffset = -t * 22;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}
