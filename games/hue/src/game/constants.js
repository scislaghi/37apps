/* ══ Hue — tuning, palette and the climb ladder ══
   Sizes are logical CSS pixels at scale 1 (a 390pt phone), multiplied by the
   runtime `S` factor so a tablet reads the same as a phone. World space is
   y-down like the canvas, so *climbing means y decreases* — every comparison
   in the engine reads "higher = smaller y". */

/* ── the four hues ──
   Straight out of the brand kit's 8 accents, picked for maximum separation
   from each other at a glance: warm-red, warm-yellow, cool-green, cool-violet.
   Their *order* here is fixed (it's the switcher pinwheel's clockwise order
   and the menu mark), while each obstacle shuffles its own arc assignment. */
export const HUES = ["#FF4529", "#FFA31A", "#17D39B", "#7B42FF"];
export const HUE_NAMES = ["Coral", "Amber", "Jade", "Violet"];

/* ── Hue keeps the shared light neutral field (brand kit §01). A colour-match
   game lives or dies on how cleanly four saturated hues read against each
   other, and the light ground is the only one that keeps all four equally
   legible — on black, violet sinks and coral blooms. The chrome accent is
   Cobalt Bright, deliberately *not* one of the four playable hues, so a PLAY
   or RETRY button can never be misread as a colour cue. ── */
export const palette = {
  bg: "#F7F5F2",
  ink: "#18171D",
  inkSoft: "#726F7C",
  grid: "#E3DED3",
  ui: "#3D64FF",
};

/** Depth ladder: the field never leaves the neutral base, it only drifts in
    temperature, so 800 m in looks unmistakably different from the start
    without ever competing with the four hues for attention. */
export const ZONES = [
  { at: 0,    name: "DAWN",   top: "#FFFFFF", bot: "#EFEAE1", grid: "#E3DED3" },
  { at: 400,  name: "TIDE",   top: "#F4F8FF", bot: "#E2E9F4", grid: "#D3DDEC" },
  { at: 900,  name: "BLOOM",  top: "#FFF6F4", bot: "#F3E4E4", grid: "#EFD5D3" },
  { at: 1500, name: "GROVE",  top: "#F4FBF7", bot: "#E2EFE7", grid: "#CFE5D8" },
  { at: 2200, name: "DUSK",   top: "#F8F5FF", bot: "#E9E3F4", grid: "#DCD3EF" },
  { at: 3000, name: "DAWN",   top: "#FFFFFF", bot: "#EFEAE1", grid: "#E3DED3" },
];

/* ── the ball ── */
export const PX_PER_METRE = 15;
export const BALL_R = 11;
export const GRAVITY = 1800;
/* One tap lifts the ball ~64 px. That number is the whole difficulty budget:
   every pocket a player has to hover inside — a ring's interior, a cross's
   hub, the ring-to-ring gap of a dual — is sized against it further down this
   file, because a pocket shorter than one hop is a pocket you cannot wait in,
   only gamble through. */
export const JUMP_V = 480;
export const MAX_FALL = 1100;
export const ANCHOR = 0.62;         // where the ball rides on screen while climbing
export const CAM_FOLLOW = 9;        // per-second lerp toward the anchor
export const TRAIL_STEP = 9;
export const TRAIL_MAX = 34;

/* ── the void ──
   Every obstacle is solvable by waiting for the right colour to come round,
   which on its own would make hovering forever a free strategy. So the floor
   creeps up once you stop gaining height: slow enough that reading a rotation
   is never rushed, fast enough that camping isn't a plan. */
export const IDLE_GRACE = 3.2;
export const CREEP_SPEED = 34;
export const CREEP_MAX = 105;
export const CREEP_ACCEL = 26;

/* ── obstacles ──
   `clearance` is the *free* gap between one obstacle's outer edge and the
   next one's, so a big ring and a thin bar are spaced by the same felt
   distance rather than the same centre-to-centre number. */
export const BAND_TH = 14;          // ring / dual-ring band thickness
export const BAR_TH = 15;           // sliding-bar thickness
export const ARM_TH = 13;           // rotating-cross arm thickness
export const ARC_GAP = 0.045;       // radians trimmed off each arc end, cosmetic only
export const CLEAR_START = 190;
export const CLEAR_MIN = 104;
export const CLEAR_PER_M = 0.055;

/** One shape at a time: the ring teaches the whole rule, and nothing else
    appears until it's been read a few times. */
export const UNLOCK = { ring: 0, bars: 110, cross: 260, dual: 480 };

export const SPIN_BASE = 0.85;
export const SPIN_PER_M = 0.0012;
export const SPIN_MAX = 2.15;

/* ── switchers ──
   Mandatory, not optional: the ball has no horizontal control, so a switcher
   parked on the centre line is always taken. That's the point — the colour
   you need is never the colour you chose. */
export const SWITCH_R = 15;
export const SWITCH_CHANCE_START = 0.9;
export const SWITCH_CHANCE_MIN = 0.55;

export const IMPACT_MS = 300;
export const REVIVE_GRACE = 1.7;

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.7, w / 390));
}
export function clearanceFor(m) {
  return Math.max(CLEAR_MIN, CLEAR_START - m * CLEAR_PER_M);
}
export function spinFor(m) {
  return Math.min(SPIN_MAX, SPIN_BASE + m * SPIN_PER_M);
}
export function switchChanceFor(m) {
  return Math.max(SWITCH_CHANCE_MIN, SWITCH_CHANCE_START - m * 0.0004);
}
