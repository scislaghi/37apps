/* ══ Hue — the colour vocabulary ══
   Four obstacle shapes, one switcher, one ball. Everything is a flat brand
   accent with a soft ink shadow dropped underneath: on a light field that
   reads as a solid object lying above the page, which is the light-ground
   equivalent of the neon bloom a dark game would use.

   Two rules every shape here obeys, because they're what make the game
   readable at a glance rather than merely pretty:
     1. the arc/arm/segment matching the ball's current colour is haloed and
        the others are not — the answer is always the brightest thing on
        screen, so a new player learns the rule without being told it;
     2. no `shadowBlur` anywhere. It's the one canvas call that will not hold
        60fps on a mid-range phone with a dozen live shapes. */

import { withAlpha } from "@37apps/core/canvas/color.js";
import { HUES, ARC_GAP } from "./constants.js";

const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
const SHADOW = "rgba(24,23,29,0.09)";

/** Runs `draw` twice: an offset ink silhouette, then the real colours. */
function grounded(ctx, s, draw) {
  ctx.save();
  ctx.translate(0, 3.5 * s);
  draw(() => SHADOW, false);
  ctx.restore();
  draw((i) => HUES[i], true);
}

/* ────────────────────────────  obstacles  ──────────────────────────── */

/** One ring of four quarter-arcs, centred at the current origin. */
function arcRing(ctx, s, r, th, spin, colors, ballHue, colorOf, live) {
  for (let i = 0; i < 4; i++) {
    const a0 = spin + i * QUARTER + ARC_GAP;
    const a1 = spin + (i + 1) * QUARTER - ARC_GAP;

    if (live && colors[i] === ballHue) {
      ctx.strokeStyle = withAlpha(HUES[colors[i]], 0.24);
      ctx.lineWidth = th + 12 * s;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a1);
      ctx.stroke();
    }

    ctx.strokeStyle = colorOf(colors[i]);
    ctx.lineWidth = th;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();

    /* a hairline of white along the inner edge — gives the band a lit top
       face instead of reading as a flat sticker */
    if (live) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = th * 0.26;
      ctx.beginPath();
      ctx.arc(0, 0, r - th * 0.31, a0, a1);
      ctx.stroke();
    }
  }
}

export function drawRing(ctx, s, o, ballHue) {
  grounded(ctx, s, (colorOf, live) => arcRing(ctx, s, o.r, o.th, o.spin, o.colors, ballHue, colorOf, live));
}

export function drawDual(ctx, s, o, ballHue) {
  grounded(ctx, s, (colorOf, live) => {
    arcRing(ctx, s, o.r, o.th, o.spin, o.colors, ballHue, colorOf, live);
    arcRing(ctx, s, o.r2, o.th, o.spin2, o.colors2, ballHue, colorOf, live);
  });
}

/** Four capsule arms around a hollow hub, so the centre stays threadable. */
export function drawCross(ctx, s, o, ballHue) {
  grounded(ctx, s, (colorOf, live) => {
    for (let i = 0; i < 4; i++) {
      const a = o.spin + i * QUARTER;
      const cos = Math.cos(a), sin = Math.sin(a);

      if (live && o.colors[i] === ballHue) {
        ctx.strokeStyle = withAlpha(HUES[o.colors[i]], 0.24);
        ctx.lineWidth = o.th + 12 * s;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cos * o.hub, sin * o.hub);
        ctx.lineTo(cos * o.len, sin * o.len);
        ctx.stroke();
      }

      ctx.strokeStyle = colorOf(o.colors[i]);
      ctx.lineWidth = o.th;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cos * o.hub, sin * o.hub);
      ctx.lineTo(cos * o.len, sin * o.len);
      ctx.stroke();
    }

    /* the hub itself is empty and has to *look* empty, or players read the
       one safe pocket on the shape as the deadliest part of it */
    if (live) {
      ctx.strokeStyle = "rgba(24,23,29,0.12)";
      ctx.lineWidth = 1.4 * s;
      ctx.setLineDash([4 * s, 5 * s]);
      ctx.beginPath();
      ctx.arc(0, 0, o.hub * 0.66, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

/** Full-width band of four sliding segments, drawn at the band's own y. */
export function drawBars(ctx, s, w, o, ballHue) {
  const seg = w / 4;
  grounded(ctx, s, (colorOf, live) => {
    for (let i = 0; i < 4; i++) {
      /* each segment is drawn twice, once wrapped, so the band never shows a
         seam as it slides off one edge and back in the other */
      for (const k of [0, -1]) {
        const x = ((o.off + i * seg) % w + w) % w + k * w;
        if (x > w || x + seg < 0) continue;
        const pad = 1.5 * s;

        if (live && o.colors[i] === ballHue) {
          ctx.fillStyle = withAlpha(HUES[o.colors[i]], 0.24);
          ctx.beginPath();
          ctx.roundRect(x + pad, -o.th / 2 - 6 * s, seg - pad * 2, o.th + 12 * s, o.th);
          ctx.fill();
        }

        ctx.fillStyle = colorOf(o.colors[i]);
        ctx.beginPath();
        ctx.roundRect(x + pad, -o.th / 2, seg - pad * 2, o.th, o.th / 2);
        ctx.fill();

        if (live) {
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.beginPath();
          ctx.roundRect(x + pad + o.th * 0.3, -o.th / 2 + o.th * 0.2, seg - pad * 2 - o.th * 0.6, o.th * 0.2, o.th * 0.1);
          ctx.fill();
        }
      }
    }
  });
}

/* ────────────────────────────  switcher  ──────────────────────────── */

/** The pinwheel: four quadrants in the fixed brand order, always spinning. */
export function drawSwitcher(ctx, s, r, spin) {
  ctx.save();
  ctx.translate(0, 3 * s);
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(spin);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = HUES[i];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, i * QUARTER, (i + 1) * QUARTER);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();

  /* a wide breathing halo so it's obvious from a screen away that something
     is about to happen to you, not just decoration passing by */
  ctx.strokeStyle = "rgba(24,23,29,0.14)";
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  ctx.arc(0, 0, r + 5 * s, 0, TAU);
  ctx.stroke();
}

/* ────────────────────────────  the ball  ──────────────────────────── */

/**
 * The climb history, as a comet of fading dots. Dots rather than a stroked
 * polyline on purpose: the trail changes colour mid-flight every time you hit
 * a switcher, and a single stroked path can't carry per-point colour without
 * either banding at the joins or being re-stroked per segment.
 */
export function drawTrail(ctx, pts, s, cam) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    /* deliberately smaller than the ball: the head has to stay the brightest,
       biggest thing on the lane or the eye tracks the tail instead */
    ctx.globalAlpha = k * k * 0.45;
    ctx.fillStyle = HUES[pts[i].c];
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y - cam, (1.6 + k * 4) * s, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * @param {number} stretch vertical squash/stretch, 1 = at rest
 * @param {number} flash 0..1, a white pulse right after a colour switch
 */
export function drawBall(ctx, s, r, hue, t, stretch, flash, ghost) {
  const col = HUES[hue];

  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 3.4);
  glow.addColorStop(0, withAlpha(col, 0.34));
  glow.addColorStop(1, withAlpha(col, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.4, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.scale(1 / stretch, stretch);
  if (ghost) ctx.globalAlpha = 0.45 + Math.sin(t * 22) * 0.25;

  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.arc(0, 3.5 * s, r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.34, r * 0.32, r * 0.24, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────────  menu hero  ──────────────────────────── */

/** The title-screen loop: the same ring and ball code the game runs. */
export function drawHero(ctx, w, h, t, hue) {
  ctx.clearRect(0, 0, w, h);
  const s = 1.05;
  /* the whole loop is laid out as one vertical column — switcher, ring, ball —
     because that's the order the player meets them on the way up */
  const cx = w / 2, cy = h * 0.52;
  const r = w * 0.26;
  const safe = ((hue % 4) + 4) % 4;

  ctx.save();
  ctx.translate(cx, cy);
  drawRing(ctx, s, { r, th: 13 * s, spin: t * 0.9, colors: [0, 1, 2, 3] }, safe);
  ctx.restore();

  const bob = Math.sin(t * 2.1);
  ctx.save();
  ctx.translate(cx, cy + r + 20 + bob * 10);
  drawBall(ctx, s, 11 * s, safe, t, 1 + bob * 0.06, 0, false);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy - r - 26);
  drawSwitcher(ctx, s, 13 * s, -t * 1.4);
  ctx.restore();
}
