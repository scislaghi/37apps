/* ══ Oktogon — tuning, palette and geometry ══ */

export const TAU = Math.PI * 2;
export const SIDES = 8;
export const EDGE_ANGLE = TAU / SIDES;      // 45°
export const HALF_EDGE = EDGE_ANGLE / 2;    // 22.5°

/* Ratio between the octagon's inradius (centre → edge midpoint) and its
   circumradius (centre → vertex). Every layout number below is expressed in
   circumradius R, so this is the one conversion the engine needs. */
export const INRADIUS_RATIO = Math.cos(HALF_EDGE);

/* ── The eight sides are the brand kit's eight accents, in kit order. That
   order happens to walk the hue wheel (coral → amber → lime → jade → sky →
   cobalt → violet → pink), so the octagon reads as a colour dial rather than
   eight arbitrary swatches — and adjacent sides being neighbouring hues is
   what makes the "is that the right one?" beat feel tight. ── */
export const SIDE_COLORS = [
  "#FF4529", // 0 Signal Coral
  "#FFA31A", // 1 Amber Pulse
  "#C0E637", // 2 Volt Lime
  "#17D39B", // 3 Jade Flash
  "#1DC0ED", // 4 Sky Bright
  "#3D64FF", // 5 Cobalt Bright
  "#7B42FF", // 6 Violet Spark
  "#FF297E", // 7 Hot Pink
];

/** Chrome accent — Oktogon's single brand colour for PLAY/RETRY and toggles. */
export const ACCENT = "#7B42FF";

export const palette = {
  bg: "#F7F5F2",
  bgDeep: "#EFEBE4",
  ink: "#18171D",
  inkMuted: "#726F7C",
  face: "#FFFFFF",
  faceEdge: "#E3DED3",
  guide: "#C9C3B6",
  danger: "#FF4529",
};

/* ── layout (all in logical CSS px unless noted) ──
   The ball plays *inside* the octagon, so the octagon is the play field and
   wants all the room the viewport can give it: the fall from the centre to the
   far wall is the entire reaction window, and a small octagon turns that
   window into a blink. */
export const CENTER_Y_RATIO = 0.5;          // octagon centre, share of height
export const R_W_RATIO = 0.455;             // circumradius vs. viewport width
export const R_H_RATIO = 0.30;              // …and vs. height, whichever is smaller
export const R_MAX = 260;                   // keeps a tablet from ballooning it
export const BALL_R_RATIO = 0.10;           // ball radius vs. R
export const BALL_R_MIN = 10;
export const BALL_R_MAX = 26;

/* ── rotation dial ──
   A spring rather than a tween: taps queue onto `rotTarget` instantly (so the
   input is never swallowed mid-animation) while the visible dial springs after
   it with a touch of overshoot. Collision reads the *visible* angle, so
   overshoot is a real risk the player feels, not just decoration. */
export const ROT_STIFFNESS = 430;
export const ROT_DAMPING = 25;              // per-second velocity decay exponent

/* ── gravity ──
   Tuned against the actual fall: centre to far wall is only ~(inradius −
   ball radius), so these numbers are far smaller than a full-screen drop
   would need. At GRAVITY_BASE that fall takes about 1.7s and at GRAVITY_MAX
   about 0.85s, which is the window a player has to read the colour, choose a
   direction and let the dial settle. The grace window means the first few
   balls teach the tap-to-rotate mapping rather than killing anyone. */
export const GRAVITY_GRACE_SCORE = 3;
export const GRAVITY_BASE = 100;
export const GRAVITY_PER_SCORE = 8;
export const GRAVITY_MAX = 400;

/* ── drift ──
   Late runs add a slow autonomous rotation that flips direction every ball:
   the dial no longer holds still, so a correct alignment decays if you set it
   too early. This is the difficulty ceiling, not the opening act. */
export const DRIFT_UNLOCK_SCORE = 22;
export const DRIFT_PER_SCORE = 0.011;       // rad/s added per score past unlock
export const DRIFT_MAX = 0.5;

/** Score thresholds that trigger a full-screen "streak" banner. */
export const STREAK_BANNERS = [5, 10, 20, 35, 50];

/** How long the wreckage stays on screen before the Game Over page swaps in. */
export const IMPACT_MS = 620;
