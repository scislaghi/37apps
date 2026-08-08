/* ══ Prometheus — tuning, palette and the sky ladder ══
   A hop-up-the-mountain climber. The world is a column/row lattice cut into a
   cliff face; everything below is in logical CSS pixels at scale 1 (a 390pt
   phone), multiplied by the runtime `S` factor. */

/* ── brand kit v2: light neutral base + Signal Coral accent, Amber Pulse as
   the fire's second tone. The rock browns are the only colours outside the
   accent system, and they exist so the fire has something to read against. ── */
export const palette = {
  accent: "#FF4529",       // Signal Coral — the stolen fire
  flame: "#FFA31A",        // Amber Pulse
  flameHot: "#FFF0BE",
  blaze: "#FFC93C",
  skin: "#C9743A",
  skinShade: "#A8552A",
  ink: "#18171D",
  rock: "#9A5B2E",
  rockLit: "#C07C42",
  rockDark: "#6B3B1B",
  rockEdge: "#4A2711",
  cloud: "#FFFFFF",
  cloudShade: "#D8DCE8",
  storm: "#3A3746",
  stormDark: "#241F2E",
  grass: "#3E9B52",
  bg: "#F7F5F2",
  text: "#18171D",
  textMuted: "#726F7C",
};

/* Height drives the sky behind the mountain, so the climb visibly pays out:
   the wall you're on stays rock, but what's beyond it goes dawn → dusk →
   night → the gold of Olympus, then wraps. */
export const ZONES = [
  { at: 0,    name: "FOOTHILLS", top: "#9BD4F5", mid: "#CDE9FA", bot: "#EAF6FD", band: "#FFFFFF", dark: 0,    body: "sun"  },
  { at: 500,  name: "CRAGS",     top: "#5FA8E8", mid: "#9BD4F5", bot: "#D6ECFB", band: "#EAF6FD", dark: 0,    body: "sun"  },
  { at: 1150, name: "EMBER",     top: "#E5342B", mid: "#FF8A3D", bot: "#FFC46B", band: "#FFD9A8", dark: 0.1,  body: "sun"  },
  { at: 1850, name: "DUSK",      top: "#5B2A8C", mid: "#B03A7A", bot: "#FF6A4D", band: "#FF9E7A", dark: 0.45, body: "sun"  },
  { at: 2600, name: "NIGHT",     top: "#0E0D12", mid: "#241B52", bot: "#5B2A8C", band: "#4A3A8C", dark: 1,    body: "moon" },
  { at: 3400, name: "OLYMPUS",   top: "#FFF0BE", mid: "#FFC93C", bot: "#3D2A7A", band: "#FFE9A8", dark: 0.3,  body: "sun"  },
  { at: 4300, name: "FOOTHILLS", top: "#9BD4F5", mid: "#CDE9FA", bot: "#EAF6FD", band: "#FFFFFF", dark: 0,    body: "sun"  },
];

/* ── the lattice ── */
export const COLS = 5;
export const ROW_H = 96;
export const FIELD_L = 0.12;            // fraction of width where the rock face starts
export const FIELD_R = 0.88;
export const METRES_PER_ROW = 4;

/* ── hopping ── */
export const HOP_MS = 190;
export const HOP_ARC = 34;              // px of extra height at the top of the arc
export const PLAYER_SCREEN_RATIO = 0.64;
export const PLAYER_R = 16;
/** Distance from his feet to the sprite's anchor — the lattice positions him
    by the platform's centre line, but he has to stand on its top face. */
export const FOOT_OFFSET = 27;
export const FALL_GRAVITY = 2100;
export const FALL_MAX = 1500;

/* ── camera: follows the player up and never back down, plus a slow creep so
   hesitating still costs you. Both are what stop a hopper from being a game
   you can win by never pressing anything. ── */
export const CAM_LERP = 9;
export const CREEP_START = 16;          // px/s
export const CREEP_PER_METRE = 0.019;
export const CREEP_MAX = 105;

/* ── platforms ── */
export const CRUMBLE_MS = 900;          // a cloud holds this long after you land
export const CRUMBLE_FADE = 260;

/** Density of *extra* platforms beyond the one guaranteed reachable cell per
    row. Falls with height, which is the whole difficulty curve. */
export const EXTRA_START = 1.9;
export const EXTRA_MIN = 0.45;
export const EXTRA_PER_METRE = 0.00042;

/** Chance a given platform is a cloud rather than solid rock (clouds crumble),
    and the chance a cloud is actually a storm you fall straight through. */
export const CLOUD_CHANCE_START = 0.2;
export const CLOUD_CHANCE_MAX = 0.62;
export const STORM_CHANCE_MAX = 0.3;

/* altitude at which each hazard joins the mix */
export const UNLOCK = { cloud: 60, bird: 140, storm: 420, rockfall: 800 };

/* ── birds ── */
export const BIRD_GAP_START = 3.4;      // seconds between birds
export const BIRD_GAP_MIN = 1.1;
export const BIRD_SPEED = 110;

/* ── falling rocks: telegraphed, then dropped down one column ── */
export const ROCK_WARN = 0.75;
export const ROCK_GAP_START = 6;
export const ROCK_GAP_MIN = 2.2;
export const ROCK_SPEED = 620;

/* ── embers → torch → BLAZE ── */
export const EMBER_CHANCE = 0.14;
export const EMBER_FILL = 0.25;         // 4 embers charge it
export const EMBER_POINTS = 12;
export const BURN_POINTS = 20;
export const BLAZE_TIME = 5;
export const BLAZE_SCORE_MULT = 2;

/* ── milestone signposts bolted to the wall ── */
export const SIGN_EVERY = 60;           // rows

export const IMPACT_MS = 300;
export const REVIVE_GRACE = 2;

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.6, w / 390));
}
export function extraFor(m) {
  return Math.max(EXTRA_MIN, EXTRA_START - m * EXTRA_PER_METRE);
}
export function cloudChanceFor(m) {
  return Math.min(CLOUD_CHANCE_MAX, CLOUD_CHANCE_START + m * 0.00016);
}
export function stormChanceFor(m) {
  if (m < UNLOCK.storm) return 0;
  return Math.min(STORM_CHANCE_MAX, (m - UNLOCK.storm) * 0.00012);
}
export function creepFor(m) {
  return Math.min(CREEP_MAX, CREEP_START + m * CREEP_PER_METRE);
}
export function birdGapFor(m) {
  return Math.max(BIRD_GAP_MIN, BIRD_GAP_START - (m - UNLOCK.bird) * 0.0011);
}
export function rockGapFor(m) {
  return Math.max(ROCK_GAP_MIN, ROCK_GAP_START - (m - UNLOCK.rockfall) * 0.0016);
}
