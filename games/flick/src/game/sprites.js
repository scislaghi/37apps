/* ══ Flick — the disc vocabulary ══
   Everything on screen is one shape drawn well: a cylinder. Body = two
   straight sides closed by a front-facing half-ellipse at the bottom, cap =
   a full ellipse on top. The 3D read comes entirely from a horizontal
   gradient across the body (dark rim → lit band at 34% → dark rim), which is
   how a matte cylinder actually falls off under a soft key light, and it
   costs one gradient instead of any shading maths per frame. */

import { withAlpha, mixHex } from "@37apps/core/canvas/color.js";
import { palette } from "./constants.js";

/* Gradients are rebuilt every frame for every disc otherwise — a 14-disc
   tower at 60fps is ~840 createLinearGradient calls a second for maybe six
   distinct (colour, width) pairs. Keyed cache, cleared on resize. */
const gradCache = new Map();
export function clearGradientCache() { gradCache.clear(); }

function bodyGradient(ctx, x, r, color) {
  const key = `${color}|${Math.round(r)}|${Math.round(x)}`;
  let g = gradCache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, mixHex(color, "#000000", 0.42));
    g.addColorStop(0.16, mixHex(color, "#000000", 0.14));
    g.addColorStop(0.34, mixHex(color, "#FFFFFF", 0.26));
    g.addColorStop(0.58, color);
    g.addColorStop(1, mixHex(color, "#000000", 0.46));
    gradCache.set(key, g);
  }
  return g;
}

/* ─────────────────────────────  emblems  ───────────────────────────── */

/** Drawn onto the top cap, squashed by the cap's own foreshortening. */
function emblem(ctx, kind, x, y, r, ry, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / r);
  const k = r * 0.42;

  if (kind === "gold") {
    ctx.rotate(Math.sin(t * 2) * 0.12);
    ctx.fillStyle = "#5A3B00";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? k : k * 0.44;
      ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === "ice") {
    ctx.strokeStyle = "#2E6F8E";
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = "round";
    ctx.rotate(t * 0.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * k, -Math.sin(a) * k);
      ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k);
      ctx.stroke();
      /* barbs — without them three crossed lines read as an asterisk, not ice */
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * k * s, Math.sin(a) * k * s);
        ctx.lineTo(Math.cos(a + 0.7) * k * 0.55 * s, Math.sin(a + 0.7) * k * 0.55 * s);
        ctx.stroke();
      }
    }
  } else if (kind === "wild") {
    /* a double-headed arrow: the disc's own instruction manual */
    ctx.fillStyle = "#FFFFFF";
    const head = (dir) => {
      ctx.beginPath();
      ctx.moveTo(dir * k, 0);
      ctx.lineTo(dir * k * 0.45, -k * 0.5);
      ctx.lineTo(dir * k * 0.45, k * 0.5);
      ctx.closePath();
      ctx.fill();
    };
    head(-1); head(1);
    ctx.fillRect(-k * 0.6, -k * 0.15, k * 1.2, k * 0.3);
  }
  ctx.restore();
}

/* ──────────────────────────────  the disc  ────────────────────────────── */

/**
 * One cylinder. `yTop` is the plane of the top cap; the body hangs below it.
 * @param {object} o {kind, alpha, lift, t, glow}
 */
export function drawDisc(ctx, x, yTop, r, ry, h, color, o = {}) {
  const { kind = "normal", alpha = 1, t = 0, glow = 0 } = o;
  const yBot = yTop + h;
  const isWild = kind === "wild";
  const base = isWild ? "#2A2833" : color;

  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;

  /* halo for special discs — the tell that something is different arrives
     before the emblem is legible, which matters at 3 flicks a second */
  if (kind !== "normal" || glow > 0) {
    const hue = kind === "gold" ? palette.gold : kind === "ice" ? "#5FD8FF" : isWild ? palette.accent : color;
    const rg = ctx.createRadialGradient(x, yTop + h * 0.4, r * 0.6, x, yTop + h * 0.4, r * 1.75);
    rg.addColorStop(0, withAlpha(hue, 0.34 + glow * 0.3));
    rg.addColorStop(1, withAlpha(hue, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(x - r * 1.8, yTop - r * 1.1, r * 3.6, h + r * 2.2);
  }

  /* body */
  ctx.beginPath();
  ctx.moveTo(x + r, yTop);
  ctx.lineTo(x + r, yBot);
  ctx.ellipse(x, yBot, r, ry, 0, 0, Math.PI, false);
  ctx.lineTo(x - r, yTop);
  ctx.closePath();
  ctx.fillStyle = bodyGradient(ctx, x, r, base);
  ctx.fill();

  /* contact shadow where this disc meets the one below — the single cheapest
     cue that the stack has depth rather than being flat stripes */
  ctx.save();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, yBot - ry * 1.1, 0, yBot + ry);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = sh;
  ctx.fillRect(x - r, yBot - ry * 1.1, r * 2, ry * 2.1);
  ctx.restore();

  /* top cap */
  ctx.beginPath();
  ctx.ellipse(x, yTop, r, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(base, "#FFFFFF", isWild ? 0.16 : 0.32);
  ctx.fill();

  /* a soft off-centre highlight on the cap: the light is up and to the left */
  const cg = ctx.createRadialGradient(x - r * 0.35, yTop - ry * 0.35, 0, x - r * 0.3, yTop - ry * 0.3, r * 1.1);
  cg.addColorStop(0, "rgba(255,255,255,0.55)");
  cg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = cg;
  ctx.fill();

  if (kind === "gold" || kind === "ice") {
    /* band around the rim carrying the power-up identity while leaving the
       body colour — the side you have to flick it to — fully intact */
    const bandCol = kind === "gold" ? palette.gold : palette.frost;
    ctx.beginPath();
    ctx.moveTo(x + r, yTop + h * 0.34);
    ctx.lineTo(x + r, yTop + h * 0.66);
    ctx.ellipse(x, yTop + h * 0.66, r, ry, 0, 0, Math.PI, false);
    ctx.lineTo(x - r, yTop + h * 0.34);
    ctx.ellipse(x, yTop + h * 0.34, r, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = withAlpha(bandCol, 0.92);
    ctx.fill();
  }

  ctx.strokeStyle = withAlpha("#FFFFFF", 0.4);
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath();
  ctx.ellipse(x, yTop, r * 0.99, ry * 0.99, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (kind !== "normal") emblem(ctx, kind, x, yTop, r, ry, t);

  ctx.restore();
}

/* ──────────────────────────────  the field  ────────────────────────────── */

/** The two colour zones, plus the flash they give off when a disc lands. */
export function drawWalls(ctx, L, leftCol, rightCol, pulse, t) {
  const bar = (x0, x1, col, p) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, mixHex(col, "#000000", 0.1));
    g.addColorStop(0.6, col);
    g.addColorStop(1, mixHex(col, "#FFFFFF", 0.1));
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, x1 - x0, L.h);

    /* slow diagonal sheen so a flat colour block still feels alive */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#FFFFFF";
    const off = ((t * 26) % (L.h + 260)) - 130;
    ctx.beginPath();
    ctx.moveTo(x0, off);
    ctx.lineTo(x1, off - 90);
    ctx.lineTo(x1, off + 20);
    ctx.lineTo(x0, off + 110);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (p > 0) {
      ctx.fillStyle = withAlpha("#FFFFFF", p * 0.55);
      ctx.fillRect(x0, 0, x1 - x0, L.h);
    }
  };

  bar(0, L.colX0, leftCol, pulse[0]);
  bar(L.colX1, L.w, rightCol, pulse[1]);
}

/** The lit column the tower stands in. */
export function drawColumn(ctx, L, t, alarm, glowCol) {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, palette.colTop);
  g.addColorStop(0.55, mixHex(palette.colTop, palette.colBot, 0.6));
  g.addColorStop(1, palette.colBot);
  ctx.fillStyle = g;
  ctx.fillRect(L.colX0, 0, L.colW, L.h);

  /* ambient pool behind the tower, tinted by whichever wall the next disc is
     headed for — the backdrop quietly answers "which side?" before you read
     the disc, which is what makes the game playable at speed */
  if (glowCol) {
    const rg = ctx.createRadialGradient(L.cx, L.baseY - L.h * 0.18, 0, L.cx, L.baseY - L.h * 0.18, L.colW * 1.1);
    rg.addColorStop(0, withAlpha(glowCol, 0.2));
    rg.addColorStop(1, withAlpha(glowCol, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(L.colX0, 0, L.colW, L.h);
  }

  /* floor: an ellipse of shadow the tower is planted on */
  ctx.fillStyle = "rgba(24,23,29,0.13)";
  ctx.beginPath();
  ctx.ellipse(L.cx, L.baseY + L.discH, L.r * 1.35, L.ry * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (alarm > 0) {
    const ag = ctx.createLinearGradient(0, 0, 0, L.h * 0.5);
    ag.addColorStop(0, withAlpha(palette.danger, 0.34 * alarm));
    ag.addColorStop(1, withAlpha(palette.danger, 0));
    ctx.fillStyle = ag;
    ctx.fillRect(L.colX0, 0, L.colW, L.h * 0.5);
  }
}

/** The line the tower must never reach. */
export function drawDangerLine(ctx, L, near, t) {
  const y = L.dangerY;
  const col = mixHex(palette.ink, palette.danger, near);
  ctx.save();
  ctx.globalAlpha = 0.22 + near * 0.68;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 8]);
  ctx.lineDashOffset = -t * 26;
  ctx.beginPath();
  ctx.moveTo(L.colX0 + 8, y);
  ctx.lineTo(L.colX1 - 8, y);
  ctx.stroke();
  ctx.setLineDash([]);

  /* chevrons pointing down into the play area — they read as "keep it below
     this", where a bare line just reads as decoration */
  ctx.fillStyle = col;
  for (const dir of [-1, 1]) {
    const x = dir < 0 ? L.colX0 + 8 : L.colX1 - 8;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + dir * 11, y);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Faint drifting rings in the column — parallax depth, never a play element. */
export function drawMotes(ctx, L, motes, t) {
  ctx.save();
  ctx.strokeStyle = "rgba(24,23,29,0.055)";
  for (const m of motes) {
    const y = (((m.y - t * m.v) % (L.h + 200)) + L.h + 200) % (L.h + 200) - 100;
    ctx.lineWidth = m.r * 0.12;
    ctx.beginPath();
    ctx.ellipse(L.colX0 + m.x * L.colW, y, m.r, m.r * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** First-run affordance: which way to flick, drawn on the walls themselves. */
export function drawHints(ctx, L, alpha, t) {
  if (alpha <= 0) return;
  const y = L.baseY - L.discH * 3;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const dir of [-1, 1]) {
    const cx = dir < 0 ? L.colX0 / 2 : (L.colX1 + L.w) / 2;
    const nudge = Math.sin(t * 3.4 + (dir < 0 ? 0 : Math.PI)) * 6 * dir;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(cx + dir * 15 + nudge, y);
    ctx.lineTo(cx - dir * 8 + nudge, y - 16);
    ctx.lineTo(cx - dir * 8 + nudge, y + 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
