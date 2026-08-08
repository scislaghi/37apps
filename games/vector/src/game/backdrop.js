/* ══ Vector — the light field ══
   A bright room the dark corridor is cut out of. The signature motif is the
   chevron hatch: a field of thin diagonal strokes scrolling with the world,
   leaning against the direction of travel so the whole frame reads as speed
   without competing with the corridor for attention. */

import { rng, mixHex, withAlpha, smoothstep } from "@37apps/core/canvas/color.js";
import { ZONES } from "./constants.js";

const HATCH = 34;          // world px between chevron strokes
const CYCLE = ZONES[ZONES.length - 1].at;

/** Blends the two bracketing depth zones. */
export function fieldAt(m) {
  const a = ((m % CYCLE) + CYCLE) % CYCLE;
  let i = 0;
  while (i < ZONES.length - 2 && ZONES[i + 1].at <= a) i++;
  const z0 = ZONES[i], z1 = ZONES[i + 1];
  const t = smoothstep(Math.min(1, Math.max(0, (a - z0.at) / (z1.at - z0.at))));
  return {
    top: mixHex(z0.top, z1.top, t),
    bot: mixHex(z0.bot, z1.bot, t),
    tint: mixHex(z0.tint, z1.tint, t),
    name: t < 0.5 ? z0.name : z1.name,
    index: i,
  };
}

export function createField(seed = 2971) {
  const r = rng(seed);
  return {
    /* slow parallax shards — rotated squares far behind the corridor. Without
       them the hatch alone reads as wallpaper rather than as depth. */
    shards: Array.from({ length: 14 }, () => ({
      x: r(), y: r(), size: 16 + r() * 46, spin: r() * Math.PI, rate: 0.1 + r() * 0.22,
    })),
  };
}

const wrap = (v, m) => ((v % m) + m) % m;

/** The hatch's lean, as a fraction of screen height across the full frame. */
const LEAN = 0.42;

export function drawField(ctx, w, h, fd, scroll, m, t) {
  const z = fieldAt(m);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, z.top);
  bg.addColorStop(1, z.bot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  /* ── parallax shards ── */
  ctx.save();
  for (const sh of fd.shards) {
    const span = w + 260;
    const x = wrap(sh.x * span - scroll * sh.rate, span) - 130;
    ctx.save();
    ctx.translate(x, sh.y * h);
    ctx.rotate(sh.spin + t * 0.08 * sh.rate);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = z.tint;
    ctx.lineWidth = 2;
    ctx.strokeRect(-sh.size / 2, -sh.size / 2, sh.size, sh.size);
    ctx.restore();
  }
  ctx.restore();

  /* ── chevron hatch ──
     Drawn as sheared verticals rather than a symmetric pattern, so the lean
     always reads as a direction. The stroke spacing is measured along x, so a
     steep lean doesn't thin the field out. */
  const lean = LEAN * h;
  const off = wrap(-scroll * 0.55, HATCH);
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = z.tint;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let x = -Math.abs(lean) - HATCH + off; x < w + Math.abs(lean) + HATCH; x += HATCH) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + lean, h);
    ctx.stroke();
  }
  ctx.restore();

  /* ── horizon band: one bright stripe across the middle third, so the
     corridor always has something to be silhouetted against ── */
  const band = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, withAlpha("#FFFFFF", 0.5));
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);

  /* ── vignette: light, just enough to pull the eye off the edges ── */
  const vg = ctx.createRadialGradient(w * 0.42, h * 0.5, Math.min(w, h) * 0.3, w * 0.42, h * 0.5, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(24,23,29,0.14)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  return z;
}
