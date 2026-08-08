/* ══ Icarus — canvas sprites ══
   Path-drawn, so everything stays crisp at any DPR and can react per frame.
   Each function expects the context already translated to the actor's anchor. */

import { withAlpha, rng } from "@37apps/core/canvas/color.js";
import { drawGlow } from "@37apps/core/canvas/flame.js";
import { palette } from "./constants.js";

/* ──────────────────────────────  the sun  ────────────────────────────── */

/**
 * Not the shared sky-backdrop disc: this sun is a *mechanic*, so it gets
 * rotating rays and a corona that swells with the player's wax. It sits high
 * and fixed, because the whole game is judging your distance from it.
 */
export function drawSun(ctx, x, y, R, t, heat) {
  ctx.save();
  drawGlow(ctx, x, y, R * (3.4 + heat * 1.6), palette.accent, 0.35 + heat * 0.4);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.16);
  ctx.fillStyle = withAlpha(palette.accent, 0.4 + heat * 0.35);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    const len = R * (1.5 + Math.sin(t * 2 + i) * 0.12 + heat * 0.4);
    ctx.beginPath();
    ctx.moveTo(R * 0.9, -R * 0.16);
    ctx.lineTo(len, 0);
    ctx.lineTo(R * 0.9, R * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.hot;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The melt line — the boundary the wax meter actually keys off. It's drawn as
 * a shimmering band rather than a hard rule because a crisp line would read as
 * a wall you collide with, and this one you're allowed to cross.
 */
export function drawMeltLine(ctx, w, y, t, heat) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, y);
  g.addColorStop(0, withAlpha(palette.accentHot, 0.26 + heat * 0.45));
  g.addColorStop(1, withAlpha(palette.accentHot, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, y);

  ctx.strokeStyle = withAlpha(palette.accentHot, 0.65 + heat * 0.35);
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  /* the line ripples like heat haze, which is most of what sells it as
     temperature rather than as level geometry */
  for (let x = 0; x <= w; x += 12) {
    const yy = y + Math.sin(x * 0.03 + t * 3) * 3;
    if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ──────────────────────────────  the sea  ────────────────────────────── */

export function createSea(seed = 909) {
  const r = rng(seed);
  return { crests: Array.from({ length: 26 }, () => ({ x: r(), w: 0.06 + r() * 0.09, ph: r() * 9 })) };
}

/** The lower boundary. Touching it ends the run, so it has to look like water
    you'd drown in, not like a floor you'd land on. */
export function drawSea(ctx, w, h, y, sea, scroll, t) {
  const g = ctx.createLinearGradient(0, y, 0, h);
  g.addColorStop(0, palette.sea);
  g.addColorStop(1, palette.seaDeep);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, y + Math.sin(t * 1.6) * 3);
  for (let x = 0; x <= w; x += 16) {
    ctx.lineTo(x, y + Math.sin(x * 0.022 + t * 1.9) * 4 + Math.sin(x * 0.05 - t * 2.7) * 2);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = withAlpha(palette.seaFoam, 0.45);
  for (const c of sea.crests) {
    const x = (((c.x * w - scroll * 0.35) % (w + 120)) + (w + 120)) % (w + 120) - 60;
    const yy = y + 14 + Math.sin(c.ph + t * 1.5) * 8 + (c.ph % 3) * 16;
    ctx.fillRect(x, yy, c.w * w, 2.5);
  }
  ctx.restore();
}

/* ──────────────────────────────  hazards  ────────────────────────────── */

/** A rock spire climbing out of the sea — the hazard that pushes you upward. */
export function drawSpire(ctx, s, hw, hgt) {
  ctx.beginPath();
  ctx.moveTo(-hw, hgt);
  ctx.lineTo(-hw * 0.55, -hgt * 0.1);
  ctx.lineTo(-hw * 0.18, 0);
  ctx.lineTo(0, -hgt);
  ctx.lineTo(hw * 0.28, -hgt * 0.2);
  ctx.lineTo(hw * 0.62, -hgt * 0.05);
  ctx.lineTo(hw, hgt);
  ctx.closePath();
  ctx.fillStyle = palette.rock;
  ctx.fill();
  ctx.save();
  ctx.clip();
  /* one lit face and one shadowed face, no gradients — same flat-graphic
     treatment as every other solid in the portfolio */
  ctx.fillStyle = palette.rockLit;
  ctx.fillRect(-hw * 1.2, -hgt * 1.1, hw * 1.35, hgt * 2.4);
  ctx.fillStyle = palette.rockDark;
  ctx.fillRect(hw * 0.3, -hgt * 1.1, hw * 1.2, hgt * 2.4);
  ctx.restore();
  ctx.strokeStyle = "#221F2A";
  ctx.lineWidth = 2 * s;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** A floating crag — the mid-air version, straight from the reference art. */
export function drawCrag(ctx, s, r, pts, bob) {
  ctx.save();
  ctx.translate(0, bob);
  const trace = () => {
    ctx.beginPath();
    pts.forEach(([a, k], i) => {
      const x = Math.cos(a) * r * k * s, y = Math.sin(a) * r * k * s * 0.7;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  trace();
  ctx.fillStyle = palette.rock;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = palette.rockLit;
  ctx.beginPath();
  ctx.moveTo(-r * 1.4 * s, -r * 1.4 * s);
  ctx.lineTo(r * 0.5 * s, -r * 1.4 * s);
  ctx.lineTo(-r * 1.4 * s, r * 0.3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.rockDark;
  ctx.beginPath();
  ctx.moveTo(r * 1.4 * s, r * 1.4 * s);
  ctx.lineTo(-r * 0.3 * s, r * 1.4 * s);
  ctx.lineTo(r * 1.4 * s, -r * 0.3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  trace();
  ctx.strokeStyle = "#221F2A";
  ctx.lineWidth = 2 * s;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

/** A gull beating toward him — the reference art's bird, seen in profile. */
export function drawGull(ctx, s, t, phase) {
  ctx.save();
  const beat = Math.sin(t * 8 + phase);
  ctx.rotate(beat * 0.06);

  const wing = (lift, fill) => {
    ctx.beginPath();
    ctx.moveTo(2 * s, -1 * s);
    ctx.quadraticCurveTo(-8 * s, -8 * s + lift, -20 * s, -4 * s + lift * 1.5);
    ctx.quadraticCurveTo(-10 * s, 1 * s + lift * 0.8, 2 * s, 4 * s);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  wing(beat * 15 * s, "#C9C4CE");

  ctx.beginPath();
  ctx.ellipse(0, 0, 13 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#F2EFEA";
  ctx.fill();
  /* tail + wingtips are the only dark marks; a pure white bird disappears
     against a bleached sky at the exact distances that matter most */
  ctx.beginPath();
  ctx.moveTo(-9 * s, -2 * s);
  ctx.lineTo(-21 * s, -5 * s);
  ctx.lineTo(-19 * s, 2 * s);
  ctx.closePath();
  ctx.fillStyle = "#5B5765";
  ctx.fill();

  wing(-beat * 17 * s, "#FFFFFF");

  ctx.beginPath();
  ctx.arc(10 * s, -3 * s, 5.2 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14 * s, -4 * s);
  ctx.lineTo(23 * s, -1.5 * s);
  ctx.lineTo(14 * s, 0.5 * s);
  ctx.closePath();
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11.5 * s, -4.5 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.restore();
}

/** A storm cloud — solid, and the only dark mass in a bright sky. */
export function drawStorm(ctx, s, hw, hh, t, phase) {
  const puffs = [
    [-hw * 0.68, hh * 0.1, hh * 0.85], [-hw * 0.3, -hh * 0.28, hh * 1.05],
    [hw * 0.06, hh * 0.05, hh * 1.15], [hw * 0.44, -hh * 0.2, hh * 0.95],
    [hw * 0.76, hh * 0.16, hh * 0.72],
  ];
  const disc = (dy, k, fill) => {
    ctx.fillStyle = fill;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x, y + dy, r * k, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  disc(-hh * 0.12, 1.06, "rgba(190,182,214,0.5)");
  disc(0, 1, palette.storm);
  disc(hh * 0.34, 0.78, "#211C29");

  const flash = Math.max(0, Math.sin(t * 2.3 + phase) - 0.9) * 12;
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash);
    ctx.strokeStyle = "#F2ECFF";
    ctx.lineWidth = 2.4 * s;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-hw * 0.28, -hh * 0.45);
    ctx.lineTo(-hw * 0.05, 0);
    ctx.lineTo(-hw * 0.2, hh * 0.15);
    ctx.lineTo(hw * 0.14, hh * 0.7);
    ctx.stroke();
    ctx.restore();
  }
}

/* ───────────────────────────  the collectible  ─────────────────────── */

/** A fresh feather — cools the wax and charges the glide. */
export function drawFeather(ctx, s, t, phase) {
  const sway = Math.sin(t * 3 + phase) * 0.25;
  ctx.save();
  ctx.rotate(sway);
  drawGlow(ctx, 0, 0, 22 * s, "#FFFFFF", 0.55);
  ctx.beginPath();
  ctx.moveTo(0, -13 * s);
  ctx.quadraticCurveTo(8 * s, -2 * s, 0, 12 * s);
  ctx.quadraticCurveTo(-8 * s, -2 * s, 0, -13 * s);
  ctx.closePath();
  ctx.fillStyle = palette.feather;
  ctx.fill();
  ctx.strokeStyle = withAlpha(palette.accent, 0.85);
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(0, -12 * s);
  ctx.lineTo(0, 12 * s);
  ctx.stroke();
  ctx.restore();
}

/* ──────────────────────────────  Icarus  ────────────────────────────── */

/**
 * Side view, wings spread. `heat` (0..1) is drawn, not just metered: the
 * wings shed feathers and darken toward wax as he cooks, so a player who
 * never looks at the HUD still sees the danger on the character itself.
 */
export function drawIcarus(ctx, s, t, tilt, heat, glide, invuln) {
  ctx.save();
  ctx.rotate(tilt);
  /* art-only: at 1:1 he read smaller than the gulls he's dodging, which made
     the thing you control the least legible object on screen */
  ctx.scale(1.4, 1.4);

  const beat = Math.sin(t * 11);
  const feathers = Math.max(2, Math.round(6 - heat * 4));
  const wingCol = glide > 0 ? palette.hot : "#FFFFFF";
  const wingShade = glide > 0 ? palette.accent : "#D9D4DE";

  if (glide > 0) drawGlow(ctx, 0, 0, 40 * s, palette.accent, 0.5);

  /* far wing behind the body, near wing in front, beating out of phase */
  const wing = (lift, col, shade) => {
    ctx.beginPath();
    ctx.moveTo(-2 * s, -3 * s);
    ctx.quadraticCurveTo(-12 * s, -14 * s + lift, -26 * s, -8 * s + lift * 1.4);
    ctx.quadraticCurveTo(-14 * s, -2 * s + lift * 0.7, -2 * s, 2 * s);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    /* individual quills, thinning as the wax goes — the melt is visible on
       the wing long before the meter runs out */
    ctx.strokeStyle = shade;
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = "round";
    for (let i = 0; i < feathers; i++) {
      const k = i / feathers;
      ctx.beginPath();
      ctx.moveTo(-4 * s - k * 18 * s, -4 * s + lift * (0.3 + k * 0.8));
      ctx.lineTo(-6 * s - k * 20 * s, 2 * s + lift * (0.2 + k * 0.6));
      ctx.stroke();
    }
  };
  wing(beat * 12 * s, wingShade, "#B9B4C4");

  /* body */
  ctx.beginPath();
  ctx.ellipse(0, 0, 11 * s, 7.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1 * s, 2 * s, 8 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2E2A38";
  ctx.fill();

  /* legs trailing */
  ctx.strokeStyle = palette.skinShade;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6 * s, 4 * s);
  ctx.quadraticCurveTo(-14 * s, 8 * s, -18 * s, 6 * s + beat * 2 * s);
  ctx.stroke();

  wing(-beat * 15 * s, wingCol, wingShade);

  /* head, facing the direction of travel */
  ctx.beginPath();
  ctx.arc(9 * s, -5 * s, 6 * s, 0, Math.PI * 2);
  ctx.fillStyle = palette.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(9 * s, -6.5 * s, 6.1 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(3 * s, -3 * s, 3.2 * s, -6 * s);
  ctx.closePath();
  ctx.fillStyle = "#3A2A18";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12 * s, -5 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();

  /* wax running off the wings once he's genuinely in trouble */
  if (heat > 0.5) {
    ctx.fillStyle = withAlpha(palette.accent, (heat - 0.5) * 1.6);
    for (let i = 0; i < 3; i++) {
      const dx = -8 * s - i * 7 * s;
      ctx.beginPath();
      ctx.ellipse(dx, 6 * s + Math.sin(t * 6 + i) * 3 * s, 1.8 * s, 3.4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (invuln) {
    ctx.beginPath();
    ctx.arc(0, 0, 28 * s, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(palette.hot, 0.35 + Math.sin(t * 18) * 0.25);
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();
  }
  ctx.restore();
}
