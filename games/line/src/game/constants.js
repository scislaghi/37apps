/* ══ Line — tuning, palette and the depth ladder ══
   Sizes are logical CSS pixels at scale 1 (a 390pt phone), multiplied by the
   runtime `S` factor so a tablet reads the same as a phone. */

/* ── Line is the one game in the portfolio with a dark play field: the whole
   idea is a neon stroke drawing itself through the dark, and that doesn't
   exist on a light ground. The brand chrome around it (menu, game over,
   settings) stays on the light neutral base like every other game, so the
   dark field reads as a deliberate arcade choice rather than app chrome.
   Every hazard colour is straight out of the brand kit's 8 accents. ── */
export const palette = {
  line: "#C0E637",         // Volt Lime — the player's stroke
  lineHot: "#F2FFC2",
  bar: "#3D64FF",          // Cobalt Bright
  arc: "#17D39B",          // Jade Flash
  blade: "#FF4529",        // Signal Coral
  gate: "#7B42FF",         // Violet Spark
  orb: "#FFA31A",          // Amber Pulse
  ink: "#0E0D12",
  text: "#F2F0ED",
};

/* Depth zones: the field never becomes light, it shifts *hue* — enough that
   1000 m in looks unmistakably different from the start without ever fighting
   the neon for attention. `grid` tints the dot lattice. */
export const ZONES = [
  { at: 0,    name: "NULL",    top: "#12111A", mid: "#0E0D12", bot: "#0A0910", grid: "#2A2740" },
  { at: 500,  name: "COBALT",  top: "#0F1730", mid: "#0B1024", bot: "#080B18", grid: "#22336E" },
  { at: 1100, name: "VERDANT", top: "#08231F", mid: "#061914", bot: "#04110E", grid: "#11553F" },
  { at: 1800, name: "PLUM",    top: "#220E2B", mid: "#180A1E", bot: "#100614", grid: "#5E2168" },
  { at: 2600, name: "SCARLET", top: "#2B0C10", mid: "#1E080B", bot: "#140507", grid: "#73202A" },
  { at: 3500, name: "NULL",    top: "#12111A", mid: "#0E0D12", bot: "#0A0910", grid: "#2A2740" },
];

/* ── travel ── */
export const PX_PER_METRE = 24;
export const BASE_SPEED = 250;
export const SPEED_PER_METRE = 0.06;
export const MAX_SPEED = 640;

/* ── the stroke ── */
export const HEAD_Y_RATIO = 0.66;
export const HEAD_R = 8;                // the stroke is thin, so this hitbox is honest
export const LINE_WIDTH = 6;
export const TRAIL_SAMPLE = 7;          // world px between recorded trail points
export const TRAIL_MAX = 240;
export const STEER_STIFFNESS = 17;
export const STEER_DAMPING = 6.6;
export const DRAG_GAIN = 1.45;
export const KEY_STEER_SPEED = 640;

/* ── spawning ── */
export const SPAWN_GAP_START = 380;
export const SPAWN_GAP_MIN = 215;
export const SPAWN_GAP_PER_METRE = 0.036;
export const MIN_CORRIDOR = 96;

/** Each hazard joins the mix at its own depth, so the game teaches one shape
    at a time instead of dumping four on the first screen. */
export const UNLOCK = { bar: 0, arc: 120, blade: 480, gate: 950 };

/* ── orbs → SURGE ── */
export const ORB_R = 11;
export const ORB_PICKUP_R = 24;
export const ORB_FILL = 0.25;           // 4 orbs charge it
export const ORB_POINTS = 15;
export const CUT_POINTS = 25;           // per hazard sliced through during SURGE
export const SURGE_TIME = 4;
export const SURGE_SPEED_MULT = 1.45;
export const SURGE_SCORE_MULT = 2;

export const IMPACT_MS = 300;
export const REVIVE_GRACE = 2.2;

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.7, w / 390));
}
export function speedFor(m) {
  return Math.min(MAX_SPEED, BASE_SPEED + m * SPEED_PER_METRE);
}
export function spawnGapFor(m) {
  return Math.max(SPAWN_GAP_MIN, SPAWN_GAP_START - m * SPAWN_GAP_PER_METRE);
}
