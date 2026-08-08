/* ══ Oktogon — rendering ══
   Draw order is the whole design: a light neutral ground, an aura tinted by
   the colour you're currently chasing, the dial, the landing guide on top of
   the dial (it has to win), then the ball, then debris and flashes. */

import { drawParticles } from '@37apps/core/canvas/particles.js';
import { withAlpha, lerp, clamp } from '@37apps/core/canvas/color.js';
import { SIDES, SIDE_COLORS, HALF_EDGE, INRADIUS_RATIO, palette } from './constants.js';
import { sideAngle, sideEnds } from './geometry.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Builds the octagon outline as a path (used for the face fill and clips). */
function octagonPath(ctx, cx, cy, R, rot) {
  ctx.beginPath();
  for (let k = 0; k < SIDES; k++) {
    const a = sideAngle(rot, k) - HALF_EDGE;
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/* ── background: flat brand neutral with a soft vertical settle, plus a wide
   aura in the target colour. The aura is the reason the screen never looks
   like a white page with shapes on it — the whole field agrees with the ball. */
function drawBackdrop(ctx, g) {
  const { w, h } = g;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, palette.bg);
  grad.addColorStop(1, palette.bgDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const target = g.ball ? SIDE_COLORS[g.ball.c] : SIDE_COLORS[g.nextColor];
  const breathe = g.reduced ? 1 : 1 + Math.sin(g.t * 1.6) * 0.05;
  const rad = g.R * 3.1 * breathe;
  const aura = ctx.createRadialGradient(g.cx, g.cy, g.R * 0.35, g.cx, g.cy, rad);
  const strength = clamp(0.11 + g.streak * 0.012 + g.matchFlash * 0.16, 0, 0.34);
  aura.addColorStop(0, withAlpha(target, strength));
  aura.addColorStop(0.55, withAlpha(target, strength * 0.32));
  aura.addColorStop(1, withAlpha(target, 0));
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);
}

/* ── ambient dial texture: eight index marks, one hugging the inside of each
   coloured side, turning with the octagon. Cheap, but it's what sells "this
   is a mechanism" rather than "this is a polygon".

   They sit *inside* the shape deliberately. The octagon now spans nearly the
   full viewport width, so there is no longer any room outside it — anything
   drawn out there gets clipped by the screen edges and reads as stray arcs
   rather than as a dial. The interior is where the free space is now. ── */
function drawDialMarks(ctx, g, R) {
  const { cx, cy, rot } = g;
  ctx.save();
  ctx.lineWidth = 1.5 * g.S;
  ctx.lineCap = 'round';
  for (let k = 0; k < SIDES; k++) {
    const a = sideAngle(rot, k);
    const cos = Math.cos(a), sin = Math.sin(a);
    const inner = R * INRADIUS_RATIO;
    ctx.strokeStyle = withAlpha(SIDE_COLORS[k], 0.22 + g.sideFlash[k] * 0.55);
    ctx.beginPath();
    ctx.moveTo(cx + cos * inner * 0.84, cy + sin * inner * 0.84);
    ctx.lineTo(cx + cos * inner * 0.92, cy + sin * inner * 0.92);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineCap = 'butt';
}

/* ── the octagon ── */
function drawOctagon(ctx, g) {
  const { cx, cy, rot } = g;
  const R = g.R * (1 + g.pop * 0.055);          // impact bounce
  const S = g.S;
  const targetColor = g.ball ? SIDE_COLORS[g.ball.c] : SIDE_COLORS[g.nextColor];

  /* face: a near-white plate that lifts the coloured sides off the ground */
  ctx.save();
  ctx.shadowColor = 'rgba(24,23,29,0.16)';
  ctx.shadowBlur = 26 * S;
  ctx.shadowOffsetY = 10 * S;
  octagonPath(ctx, cx, cy, R, rot);
  const face = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
  face.addColorStop(0, '#FFFFFF');
  face.addColorStop(1, '#F3F0EA');
  ctx.fillStyle = face;
  ctx.fill();
  ctx.restore();

  /* inner ring in the target colour — a faint echo of the shape the ball has
     to reach, kept well clear of the centre where the ball itself sits */
  ctx.save();
  ctx.strokeStyle = withAlpha(targetColor, 0.2 + g.matchFlash * 0.35);
  ctx.lineWidth = 1.5 * S;
  octagonPath(ctx, cx, cy, R * 0.62, rot);
  ctx.stroke();
  ctx.restore();

  drawDialMarks(ctx, g, R);

  /* the eight coloured sides, each a capsule with a gap at the vertices so
     they read as eight separate targets instead of one banded outline */
  const bar = 11 * S;
  const gap = 7 * S;
  ctx.lineCap = 'round';
  for (let k = 0; k < SIDES; k++) {
    const { ax, ay, bx, by } = sideEnds(cx, cy, R, rot, k);
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x1 = ax + ux * gap, y1 = ay + uy * gap;
    const x2 = bx - ux * gap, y2 = by - uy * gap;

    const flash = g.sideFlash[k];
    const aimed = g.landing?.side === k;
    const locked = aimed && g.landing.locked;

    ctx.save();
    if (flash > 0.02 || locked) {
      ctx.shadowColor = withAlpha(SIDE_COLORS[k], 0.85);
      ctx.shadowBlur = (12 + flash * 26 + (locked ? 14 : 0)) * S;
    }
    ctx.strokeStyle = SIDE_COLORS[k];
    ctx.globalAlpha = aimed || flash > 0.02 ? 1 : 0.86;
    ctx.lineWidth = bar * (1 + flash * 0.42 + (locked ? 0.22 : 0));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    /* a white sheen along the flashing side reads as the hit landing on it */
    if (flash > 0.02) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha('#FFFFFF', flash * 0.75);
      ctx.lineWidth = bar * 0.32;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.lineCap = 'butt';
}

/* ── landing guide ──
   A dashed plumb line from the ball to the side it is currently on course
   for. Dashed and neutral while the aim is wrong; solid, coloured and capped
   with a chevron the moment ball colour and side colour agree. The guide is
   the tutorial: rotate, watch the target move, learn the mapping in one drop. */
function drawGuide(ctx, g) {
  const l = g.landing;
  const b = g.ball;
  if (!l || !b || !b.alive) return;

  const S = g.S;
  const locked = l.locked;
  const color = SIDE_COLORS[b.c];

  ctx.save();
  ctx.lineCap = 'round';
  if (locked) {
    ctx.setLineDash([]);
    ctx.strokeStyle = withAlpha(color, 0.62);
    ctx.lineWidth = 2.4 * S;
  } else {
    ctx.setLineDash([5 * S, 9 * S]);
    ctx.lineDashOffset = -g.t * 44 * S;
    ctx.strokeStyle = withAlpha(palette.guide, 0.85);
    ctx.lineWidth = 2 * S;
  }
  ctx.beginPath();
  ctx.moveTo(l.x, b.y + g.ballR);
  ctx.lineTo(l.x, l.y);
  ctx.stroke();
  ctx.setLineDash([]);

  /* marker at the contact point: a ring that snaps shut and pings when the
     aim locks on */
  const pulse = locked ? 1 + g.lockPulse * 0.55 : 1;
  ctx.strokeStyle = locked ? color : withAlpha(palette.guide, 0.9);
  ctx.lineWidth = (locked ? 2.6 : 1.8) * S;
  ctx.beginPath();
  ctx.arc(l.x, l.y, 7 * S * pulse, 0, Math.PI * 2);
  ctx.stroke();

  if (locked) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 3 * S, 0, Math.PI * 2);
    ctx.fill();
    if (g.lockPulse > 0.02) {
      ctx.globalAlpha = g.lockPulse * 0.55;
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 7 * S + (1 - g.lockPulse) * 34 * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/* ── the ball ── */
function drawBall(ctx, g) {
  const b = g.ball;
  if (!b || !b.alive) return;
  const S = g.S;
  const color = SIDE_COLORS[b.c];
  const r = g.ballR;

  /* trail: fading echoes down the fall line, denser the faster it drops */
  const n = b.trail.length;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    ctx.globalAlpha = k * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.trail[i], r * (0.3 + k * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* squash: stretches along the fall as it accelerates, so speed is legible
     from the shape and not only from the clock */
  const stretch = g.reduced ? 1 : clamp(1 + Math.abs(b.vy) / 5200, 1, 1.28);

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(1 / stretch, stretch);
  ctx.shadowColor = withAlpha(color, 0.75);
  ctx.shadowBlur = 20 * S;
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.32, color);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRings(ctx, g) {
  for (const ring of g.rings) {
    const k = ring.age / ring.life;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, lerp(ring.from, ring.to, easeOut(k)), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Red vignette on a miss — edges only, so the wreck stays readable. */
function drawMissFlash(ctx, g) {
  if (g.missFlash <= 0.01) return;
  const grad = ctx.createRadialGradient(g.cx, g.cy, g.R * 0.7, g.cx, g.cy, Math.max(g.w, g.h) * 0.85);
  grad.addColorStop(0, withAlpha(palette.danger, 0));
  grad.addColorStop(1, withAlpha(palette.danger, g.missFlash * 0.42));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, g.w, g.h);
}

export function renderGame(ctx, g) {
  ctx.save();
  drawBackdrop(ctx, g);

  if (g.shake > 0.01 && !g.reduced) {
    const amp = g.shake * 9 * g.S;
    ctx.translate(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp,
    );
  }

  drawOctagon(ctx, g);
  drawGuide(ctx, g);
  drawBall(ctx, g);
  drawParticles(ctx, g.particles);
  drawRings(ctx, g);
  ctx.restore();

  drawMissFlash(ctx, g);
}

/* ── menu hero ──
   The real mechanic on loop: the dial steps one side per cycle while a ball
   falls from the centre onto the floor of the octagon and matches it. Same
   drawing primitives as gameplay, so the menu is a promise the game keeps. */
export function drawHero(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.5;
  const R = Math.min(w * 0.44, h * 0.44);
  const ballR = R * 0.13;

  const CYCLE = 1.9;
  const step = Math.floor(t / CYCLE);
  const p = (t % CYCLE) / CYCLE;

  /* dial eases one side per cycle; the ball falls over the first 72% */
  const rot = (step + easeOut(clamp(p * 3.2, 0, 1))) * (Math.PI / 4);
  /* the floor is the side whose normal points straight down: solving
     rot − 90° + k·45° = 90° at rot = step·45° gives k = 4 − step */
  const colorIdx = (((4 - step) % SIDES) + SIDES) % SIDES;
  const color = SIDE_COLORS[colorIdx];

  const fall = clamp(p / 0.72, 0, 1);
  const rest = cy + R * Math.cos(Math.PI / 8) - ballR;
  const by = lerp(cy, rest, fall * fall);
  const landed = fall >= 1;

  /* filled as a disc, not a rect: the hero canvas sits on the menu's opaque
     background, and a rect would show its own corners as a tinted square */
  const auraR = R * 2.1;
  const aura = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, auraR);
  aura.addColorStop(0, withAlpha(color, 0.22));
  aura.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
  ctx.fill();

  const pop = landed ? Math.max(0, 1 - (p - 0.72) / 0.28) : 0;
  const Rp = R * (1 + pop * 0.05);

  octagonPath(ctx, cx, cy, Rp, rot);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  const bar = Math.max(4, R * 0.12);
  const gap = bar * 0.62;
  ctx.lineCap = 'round';
  for (let k = 0; k < SIDES; k++) {
    const { ax, ay, bx, by: by2 } = sideEnds(cx, cy, Rp, rot, k);
    const dx = bx - ax, dy = by2 - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    /* the floor is the side the ball just matched — flare it on landing */
    const hot = k === colorIdx && pop > 0;
    ctx.strokeStyle = SIDE_COLORS[k];
    ctx.lineWidth = bar * (hot ? 1.35 : 1);
    ctx.globalAlpha = hot ? 1 : 0.88;
    ctx.beginPath();
    ctx.moveTo(ax + ux * gap, ay + uy * gap);
    ctx.lineTo(bx - ux * gap, by2 - uy * gap);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';

  if (pop > 0) {
    ctx.strokeStyle = withAlpha(color, pop * 0.8);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, rest, ballR + (1 - pop) * R * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (!landed) {
    const grad = ctx.createRadialGradient(cx - ballR * 0.3, by - ballR * 0.35, ballR * 0.1, cx, by, ballR);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.32, color);
    grad.addColorStop(1, color);
    ctx.save();
    ctx.shadowColor = withAlpha(color, 0.7);
    ctx.shadowBlur = 16;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, by, ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
