/* ══ Skid — the shaft ══
   Not the shared sky backdrop: this game is looking *down* a hole, so the
   backdrop's job is to make descent legible. Two devices do all the work —
   depth rulers ruled across the shaft every 20 m carrying their own metre
   number, and dust that drifts upward past the camera. Both are pinned to
   world space, so they scroll at exactly the rate the player is falling and
   the number on a passing ruler is a second, checkable readout of the HUD. */

import { rng, rgb, smoothstep } from "@37apps/core/canvas/color.js";
import { ZONES, PX_PER_METRE } from "./constants.js";

const RULER_M = 20;                 // metres between rulers
const CYCLE = ZONES[ZONES.length - 1].at;

/* Zone colours are interpolated, so they can't be kept as hex — and the shared
   `withAlpha()` takes a *hex*: hand it an interpolated `rgb(...)` string and it
   parses the slice as base-16, gets NaN, and silently returns opaque black. So
   the ladder blends to numeric triples and everything that needs an alpha
   builds its own rgba() from them. */
function mix3(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
  ];
}

/** @param {number[]} c @param {number} a */
export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Blends the two bracketing depth zones. */
export function zoneAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  const z0 = ZONES[i], z1 = ZONES[i + 1];
  const t = smoothstep(Math.min(1, Math.max(0, (a - z0.at) / (z1.at - z0.at))));
  const top = mix3(z0.top, z1.top, t);
  const bot = mix3(z0.bot, z1.bot, t);
  const rule = mix3(z0.rule, z1.rule, t);
  return {
    top: rgba(top, 1), bot: rgba(bot, 1), rule: rgba(rule, 1),
    topC: top, ruleC: rule,
    name: t < 0.5 ? z0.name : z1.name,
    index: i,
  };
}

export function createShaft(seed = 3701) {
  const r = rng(seed);
  return {
    /* Dust lives in a fixed-height world band that wraps, rather than being
       spawned and culled — a descent that never ends would otherwise leak
       particles forever. */
    dust: Array.from({ length: 34 }, () => ({
      x: r(), y: r(), r: 0.6 + r() * 2.2, sp: 0.25 + r() * 0.55, tw: r() * Math.PI * 2,
    })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

/**
 * @param {number} camY world y at the top of the viewport
 */
export function drawShaft(ctx, w, h, sh, camY, t, s) {
  const m = camY / PX_PER_METRE;
  const z = zoneAt(Math.max(0, m));

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, z.top);
  g.addColorStop(1, z.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /* ── shaft walls: two vertical hairlines just inside the edges with a soft
     inward gradient. They give the field a left and a right boundary, which is
     what stops an endless drop from reading as "falling through nothing". ── */
  const edgeW = Math.min(46 * s, w * 0.16);
  for (const side of [0, 1]) {
    const x0 = side ? w : 0, x1 = side ? w - edgeW : edgeW;
    const eg = ctx.createLinearGradient(x0, 0, x1, 0);
    eg.addColorStop(0, rgba(z.ruleC, 0.16));
    eg.addColorStop(1, rgba(z.ruleC, 0));
    ctx.fillStyle = eg;
    ctx.fillRect(Math.min(x0, x1), 0, edgeW, h);
  }

  /* ── depth rulers ── */
  const step = RULER_M * PX_PER_METRE;
  const first = Math.ceil(camY / step) * step;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(10 * s)}px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`;
  for (let wy = first; wy < camY + h + step; wy += step) {
    const y = wy - camY;
    const metres = Math.round(wy / PX_PER_METRE);
    if (metres <= 0) continue;
    const major = metres % 100 === 0;

    ctx.strokeStyle = rgba(z.ruleC, major ? 0.5 : 0.24);
    ctx.lineWidth = major ? 1.4 : 1;
    ctx.setLineDash(major ? [] : [3 * s, 7 * s]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    /* labels hug the left wall and are suppressed under the HUD band — a
       depth number sliding through the depth readout is the one place two
       numbers on this screen can be misread for each other */
    if (major && y > 150 * s) {
      ctx.fillStyle = rgba(z.ruleC, 0.85);
      ctx.textAlign = "left";
      ctx.fillText(`${metres} m`, 8 * s, y - 9 * s);
    }
  }
  ctx.restore();

  /* ── dust: rises past the camera, faster than the world scrolls, so even a
     stalled ball still reads as "you are deep and still going down" ── */
  const band = h + 300;
  ctx.save();
  for (const d of sh.dust) {
    const y = wrap(d.y * band - camY * (0.35 + d.sp * 0.4), band) - 150;
    if (y < -20 || y > h + 20) continue;
    ctx.globalAlpha = 0.18 + Math.sin(t * 1.3 + d.tw) * 0.1;
    ctx.fillStyle = z.rule;
    ctx.beginPath();
    ctx.arc(d.x * w, y, d.r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* vignette — darkens the very bottom so terrain rising into view has
     somewhere to rise *from* */
  const vg = ctx.createLinearGradient(0, h * 0.72, 0, h);
  vg.addColorStop(0, "rgba(24,23,29,0)");
  vg.addColorStop(1, "rgba(24,23,29,0.13)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  return z;
}
