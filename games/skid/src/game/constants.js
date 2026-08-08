/* ══ Skid — tuning, palette and the depth ladder ══
   Sizes are logical CSS pixels at scale 1 (a 390pt phone), multiplied by the
   runtime `S` factor so a tablet reads the same as a phone. */

/* ── The field is the brand's light neutral base, and the terrain is drawn as
   solid ink strokes: one hot accent object (the ball) against a black-on-cream
   world. That's deliberate — a descent game lives or dies on being able to
   read the next slab and the next spike in a glance while everything is
   sliding upward, and a monochrome world with exactly one coloured thing in it
   is the most legible version of that. Signal Coral is held back entirely for
   the death beat, so the one time the field turns red it means something. ── */
export const palette = {
  ball: "#FF297E",         // Magenta Pop — the player
  ballHot: "#FFD8E8",
  blaze: "#FFA31A",        // Amber Pulse — orbs and the BLAZE state
  blazeHot: "#FFE9C2",
  ink: "#18171D",          // terrain
  danger: "#FF4529",       // Signal Coral — death flash only
  bg: "#F7F5F2",
  text: "#18171D",
  textMuted: "#726F7C",
};

/* Depth zones: the field stays light the whole way down — it shifts *cast*,
   not brightness, so 2000 m in looks unmistakably different from the surface
   without the terrain ever losing contrast against it. `rule` tints the depth
   rulers and dust. */
export const ZONES = [
  { at: 0,    name: "SURFACE", top: "#FBFAF7", bot: "#EDE8DE", rule: "#C9C2B4" },
  { at: 400,  name: "SHAFT",   top: "#F3F7E8", bot: "#DFE9C9", rule: "#B2C182" },
  { at: 1000, name: "GROTTO",  top: "#EBF3F7", bot: "#D3E4EE", rule: "#8FB2C6" },
  { at: 1800, name: "HOLLOW",  top: "#F1EBF8", bot: "#DFD3EF", rule: "#A88FC9" },
  { at: 2800, name: "EMBER",   top: "#FAEDE6", bot: "#F0D9CC", rule: "#CE9A7E" },
  { at: 4000, name: "SURFACE", top: "#FBFAF7", bot: "#EDE8DE", rule: "#C9C2B4" },
];

/* ── travel ── */
export const PX_PER_METRE = 26;
export const CAM_Y_RATIO = 0.40;      // where the ball sits on screen
export const CAM_LERP = 7.5;

/* ── the ball ── */
export const BALL_R = 11;
export const GRAVITY = 2800;
export const MAX_FALL = 1500;
export const JUMP_V = 820;

/**
 * Roll speed is capped, and the cap is what the difficulty curve actually
 * rides on. Uncapped, gravity on a 20° slope puts the ball past 600 px/s
 * inside the first second — the whole game arrives at full speed before the
 * player has seen a single spike. Starting the cap low and opening it out
 * over the first couple of thousand metres is the ramp.
 */
export function rollCapFor(m) {
  return 360 + Math.min(1, m / 3200) * 320;
}
export const RESTITUTION = 0.14;
export const ROLL_FRICTION = 0.9;     // per second, applied to tangential speed
export const JUMP_BUFFER = 0.14;
export const WALL_BOUNCE = 0.45;

/* ── terrain ── */
export const STROKE = 9;              // half-thickness is what collision uses
export const LIP_MIN = 30;
export const LIP_MAX = 66;
export const DROP_MIN = 44;
export const DROP_MAX = 120;
export const SPIKE_H = 23;
export const SAW_R = 15;

/** Run angles shallow out nowhere — they steepen with depth, which is the
    single biggest driver of "this got faster" without touching gravity. */
export function anglesFor(m) {
  const k = Math.min(1, m / 2200);
  return { lo: 0.22 + k * 0.16, hi: 0.46 + k * 0.28 };   // radians, ~13°→22° … 26°→43°
}

/** Each hazard joins the mix at its own depth, so the game teaches one shape
    at a time instead of dumping three on the first screen. */
export const UNLOCK = { spike: 0, fang: 260, saw: 700 };

/** Chance a given run carries a floor spike patch. */
export function spikeChanceFor(m) {
  return Math.min(0.92, 0.34 + m * 0.00028);
}

/* ── orbs → BLAZE ── */
export const ORB_R = 10;
export const ORB_PICKUP_R = 22;
export const ORB_FILL = 0.25;         // 4 orbs charge it
export const ORB_POINTS = 12;
export const SMASH_POINTS = 20;       // per hazard destroyed during BLAZE
export const BLAZE_TIME = 4.5;
export const BLAZE_SCORE_MULT = 2;

/* ── scoring extras ── */
export const CLEAR_POINTS = 6;        // per spike patch hopped
export const AIR_BONUS_AT = 0.55;     // seconds airborne that counts as an AIR
export const AIR_POINTS = 10;

export const IMPACT_MS = 320;
export const REVIVE_GRACE = 2.2;

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.7, w / 390));
}
