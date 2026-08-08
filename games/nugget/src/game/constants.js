/* ══ Nugget — tuning and palette ══
   Sizes are logical CSS pixels at scale 1 (a 390pt phone), multiplied by the
   runtime `S` factor so a tablet reads the same as a phone. */

/* ── Like Line, Nugget plays on a dark field: the game is set inside a mine
   shaft, and a mine lit like a light-mode app is a cave with the lights on.
   The brand chrome around it (menu, game over, settings) stays on the light
   neutral base like every other game, so the dark field reads as a deliberate
   arcade choice rather than app chrome. Every non-rock colour is straight out
   of the brand kit's 8 accents. ── */
export const palette = {
  void: "#08070C",         // behind everything
  rockDeep: "#100E16",     // far parallax
  rock: "#1D1A27",         // tunnel interior, top of the gradient
  rockLit: "#2B2539",      // tunnel interior near the floor
  /* the rock *between* tunnels has to be darker than the tunnels themselves,
     or the shaft reads as three light bars on rock instead of three lit voids
     carved out of it — and the boulders lose their silhouette */
  strata: "#0D0B12",
  strataEdge: "#3A3350",   // hairline where carved rock meets open tunnel
  beam: "#3A3246",         // timber supports
  rail: "#5A5170",         // cart rails and sleepers
  pick: "#8A8098",

  gold: "#FFA31A",         // Amber Pulse — the nugget, the lamp, the score
  goldHot: "#FFE0A3",
  danger: "#FF4529",       // Signal Coral — boulder cracks, crush warning
  vein: "#C0E637",         // Volt Lime — the streak banner

  boulder: "#3F3849",
  boulderLit: "#57506A",

  miner: "#F2F0ED",        // light silhouette = maximum read on dark rock
  minerInk: "#18171D",
  text: "#F7F5F2",
};

/** Nugget's brand accent — gold, obviously. Drives PLAY/RETRY and the toggles. */
export const ACCENT = palette.gold;

export const LANES = 3;

/* ── travel ── */
export const PX_PER_METRE = 26;
export const BASE_SPEED = 205;
export const SPEED_PER_NUGGET = 6;
export const MAX_SPEED = 500;

/* ── the miner ── */
export const HOP_TIME = 0.17;          // one lane change, start to landing
export const HOP_BUFFER = 0.6;         // fraction of a hop after which input queues
export const HOP_ARC = 22;             // how high the arc lifts off the straight line

/* ── boulders ──
   A boulder is visible hanging from its lane's ceiling for its whole approach,
   so the lane it threatens is readable from the moment it enters the screen.
   The fall is only the execution: it triggers `FALL_LEAD` seconds of travel
   before it reaches the miner, which is almost exactly its own fall time — so
   it lands on his head if he stayed, and lands in front of him if he moved. */
export const FALL_LEAD = 0.42;
export const RUMBLE_LEAD = 0.95;       // seconds of travel before the shaking starts
export const FALL_GRAVITY = 2900;

/* ── column spawning ── */
export const COL_GAP_START = 430;
export const COL_GAP_MIN = 250;
export const COL_GAP_PER_NUGGET = 4.2;
/** Two boulders in one column (leaving exactly one safe lane) start here. */
export const DOUBLE_FROM = 7;
export const DOUBLE_CHANCE_MAX = 0.42;

/* ── nuggets ──
   Two on the field at once from the first run, three once the player has
   shown they can hold a line — collecting one immediately respawns another
   somewhere ahead, so the field count never drops. */
export const GOLD_TARGET_EARLY = 2;
export const GOLD_TARGET_LATE = 3;
export const GOLD_TARGET_AT = 6;
export const GOLD_PICKUP_R = 30;
export const GOLD_SPREAD = [130, 320];  // world px between consecutive nuggets

/** Every Nth nugget in an unbroken run fires the VEIN banner (cosmetic — the
    score is always +1 per nugget, no multipliers to reason about). */
export const VEIN_EVERY = 4;

export const IMPACT_MS = 340;
export const REVIVE_GRACE = 2.4;

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.7, w / 390));
}
export function speedFor(score) {
  return Math.min(MAX_SPEED, BASE_SPEED + score * SPEED_PER_NUGGET);
}
export function colGapFor(score) {
  return Math.max(COL_GAP_MIN, COL_GAP_START - score * COL_GAP_PER_NUGGET);
}
export function goldTargetFor(score) {
  return score >= GOLD_TARGET_AT ? GOLD_TARGET_LATE : GOLD_TARGET_EARLY;
}
export function doubleChanceFor(score) {
  if (score < DOUBLE_FROM) return 0;
  return Math.min(DOUBLE_CHANCE_MAX, (score - DOUBLE_FROM) * 0.022);
}
