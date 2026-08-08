/* ══ Icarus — tuning, palette and the distance ladder ══
   A horizontal flap-and-glide runner squeezed between two lethal boundaries:
   the sun above and the sea below. Sizes are logical CSS pixels at scale 1
   (a 390pt phone), multiplied by the runtime `S` factor. */

/* ── brand kit v2: light neutral base + Amber Pulse accent. The wax meter and
   the sun share the amber; the sea is the one cool note, and it's there so
   the bottom boundary can never be confused with the top one. ── */
export const palette = {
  accent: "#FFA31A",       // Amber Pulse — the sun, the wax
  accentHot: "#FF4529",    // Signal Coral — the melt warning
  hot: "#FFF0BE",
  sea: "#1D6FED",
  seaDeep: "#0E3F94",
  seaFoam: "#BFE0FF",
  rock: "#726F7C",
  rockLit: "#A8A3B4",
  rockDark: "#332F3D",
  storm: "#3A3746",
  feather: "#FFFFFF",
  skin: "#C9743A",
  skinShade: "#A8552A",
  ink: "#18171D",
  bg: "#F7F5F2",
};

/* Distance drives the sky. It stays warm throughout — Icarus is a single
   sunlit flight, not a journey through night — but it climbs from a soft
   morning to a hard, bleached noon so the danger reads as escalating. */
export const ZONES = [
  { at: 0,    name: "MORNING", top: "#FFC46B", mid: "#FFE0B0", bot: "#FFF3DE", band: "#FFFFFF", dark: 0, body: "sun" },
  { at: 600,  name: "HIGH SUN",top: "#FF9E3D", mid: "#FFC46B", bot: "#FFE9CC", band: "#FFF3DE", dark: 0, body: "sun" },
  { at: 1400, name: "SCORCH",  top: "#E5342B", mid: "#FF7A3D", bot: "#FFB05C", band: "#FFD0A0", dark: 0, body: "sun" },
  { at: 2300, name: "WHITEOUT",top: "#FFF0BE", mid: "#FFC93C", bot: "#FF8A3D", band: "#FFFFFF", dark: 0, body: "sun" },
  { at: 3200, name: "MORNING", top: "#FFC46B", mid: "#FFE0B0", bot: "#FFF3DE", band: "#FFFFFF", dark: 0, body: "sun" },
];

/* ── flight ── */
export const PX_PER_METRE = 22;
export const BASE_SPEED = 210;
export const SPEED_PER_METRE = 0.05;
export const MAX_SPEED = 560;

export const PLAYER_X_RATIO = 0.26;
export const PLAYER_R = 15;
export const GRAVITY = 1250;
export const FLAP_V = -370;
export const MAX_FALL = 620;
export const MAX_TILT = 0.85;

/* ── the two boundaries ── */
export const SEA_Y_RATIO = 0.86;        // sea surface, as a fraction of height
export const MELT_Y_RATIO = 0.32;       // above this line the wax starts going

/** Wax: fills while he flies above the melt line, recovers below it. The
    asymmetry is the whole game — going high is fast but rents you time, and
    the only way to pay it back is to come down where the hazards live. */
export const WAX_GAIN = 0.42;           // per second at the very top
export const WAX_COOL = 0.3;            // per second at the sea
export const WAX_WARN = 0.55;           // meter turns coral here
export const FEATHER_COOL = 0.26;       // one feather's worth of relief

/* ── spawning ── */
export const SPAWN_GAP_START = 330;
export const SPAWN_GAP_MIN = 190;
export const SPAWN_GAP_PER_METRE = 0.04;
export const MIN_GAP = 150;             // guaranteed vertical gap, px @ scale 1

/** Each hazard joins the mix at its own distance, so the game teaches the
    sun and the sea first and only then starts filling the space between. */
export const UNLOCK = { spire: 0, gull: 110, crag: 400, storm: 850 };

export const GULL_SPEED = 70;

/* ── feathers → GLIDE ── */
export const FEATHER_R = 12;
export const FEATHER_PICKUP_R = 26;
export const FEATHER_POINTS = 12;
export const FEATHER_FILL = 0.25;       // 4 feathers charge it
export const BURN_POINTS = 22;
export const GLIDE_TIME = 4.5;
export const GLIDE_SCORE_MULT = 2;

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
