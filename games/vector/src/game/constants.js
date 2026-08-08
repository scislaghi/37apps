/* ══ Vector — tuning, palette and the depth ladder ══
   Names ending in `_R` are *ratios of screen height*; everything else is
   logical CSS pixels at scale 1 (a 390pt phone), multiplied by the runtime
   `S` factor so a tablet reads the same as a phone. See the corridor block
   below for why the two systems coexist. */

/* ── Vector keeps the brand's light neutral ground and puts the corridor on
   it as solid near-black geometry: the play field is a bright room with dark
   teeth closing in, which is the opposite read from Line's neon-in-the-dark
   and from Icarus's sky. ── */
export const palette = {
  arrow: "#FF297E",       // Magenta Pop — the dart and the lit wall edges
  arrowSecond: "#7B42FF", // Violet Spark — title gradient only, never in-play
  core: "#FFFFFF",
  terrain: "#18171D",
  terrainFace: "#2E2B3A",
  terrainDeep: "#0C0B10",
  ink: "#18171D",
  text: "#18171D",
  textMuted: "#726F7C",
};

/* Depth zones tint the light ground rather than darkening it — 2000 m in
   looks unmistakably different from the start without the corridor ever
   losing contrast against its background. `tint` colours the chevron hatch. */
export const ZONES = [
  { at: 0,    name: "DRIFT", top: "#FFFFFF", bot: "#EFEAE1", tint: "#D8D2C6" },
  { at: 450,  name: "ROSE",  top: "#FFF4F8", bot: "#F7DFEA", tint: "#F0B9D2" },
  { at: 1000, name: "IRIS",  top: "#F5F2FF", bot: "#E5DFFA", tint: "#C4B7F2" },
  { at: 1650, name: "MINT",  top: "#F0FCF8", bot: "#DDF2E9", tint: "#AEE2CE" },
  { at: 2400, name: "AMBER", top: "#FFF9EE", bot: "#F8E9D2", tint: "#EFD09B" },
  { at: 3200, name: "DRIFT", top: "#FFFFFF", bot: "#EFEAE1", tint: "#D8D2C6" },
];

/* ── travel ──
   The speed cap is set by *lookahead*, not by feel: the dart sits at 27% of
   the width, so at 430 px/s a wall entering the right edge reaches it in
   ~0.66s on a 390pt phone. Pushed to 560 that window closes to half a second,
   which is under human reaction time for a spike — the run stops being read
   and starts being guessed. Difficulty past this point comes from the
   corridor narrowing, not from outrunning the player's eyes. */
export const PX_PER_METRE = 26;
export const BASE_SPEED = 240;
export const SPEED_PER_METRE = 0.045;
export const MAX_SPEED = 430;

/* ── the dart ── */
export const ARROW_X_RATIO = 0.27;
export const ARROW_R = 8.5;             // the dart is small, so this hitbox is honest
export const GRAVITY = 2250;
export const FLAP_V = 620;              // tap sets the vertical speed outright
export const MAX_FALL = 980;
export const ANGLE_GAIN = 1.15;         // velocity → nose angle
export const MAX_ANGLE = 1.02;          // rad, ~58°
export const TRAIL_MAX = 22;
export const TRAIL_SAMPLE = 9;          // world px between recorded ribbon points

/* ── the corridor ──
   One node every SEG world px, walls drawn as straight lines between them —
   the angularity *is* the art direction, so the geometry and the collision
   shape are the same thing rather than a curve approximated by a polygon.

   Everything vertical here is a *fraction of screen height*, not a pixel
   count: a corridor tuned to 260px reads as a third of a short phone and a
   fifth of a tall one, which changes the game rather than scaling it. Only
   the horizontal node spacing is a px measure, because that one really is
   about how sharp a wall can turn. */
export const SEG = 52;
export const GAP_START_R = 0.34;
export const GAP_MIN_R = 0.21;
export const GAP_PER_METRE_R = 0.000087;   // reaches the floor around 1500 m
export const MIN_PASS_R = 0.135;           // never closes tighter, spikes included
export const MARGIN_R = 0.035;             // corridor keeps clear of the screen edges
export const GAP_SLEW_R = 0.034;           // most the gap may change per node

export const WANDER_ACC_R = 0.042;         // added to the centreline's per-node velocity
export const WANDER_MAX_R = 0.062;

/* ── spikes: a node whose wall bites inward, which renders as a triangular
   tooth for free and collides exactly as drawn ── */
export const SPIKE_FROM = 110;
export const SPIKE_P_START = 0.10;
export const SPIKE_P_PER_METRE = 0.00017;
export const SPIKE_P_MAX = 0.28;
export const SPIKE_BITE_MIN = 0.20;
export const SPIKE_BITE_MAX = 0.44;

export const MILESTONE = 250;
export const IMPACT_MS = 300;
export const REVIVE_GRACE = 1.8;        // seconds of invulnerability
export const REVIVE_EASE = 90;          // metres of wide, spike-free corridor

export function scaleFor(w) {
  return Math.max(0.85, Math.min(1.7, w / 390));
}
export function speedFor(m) {
  return Math.min(MAX_SPEED, BASE_SPEED + m * SPEED_PER_METRE);
}
/** Corridor height as a fraction of the screen — multiply by `g.h`. */
export function gapFor(m) {
  return Math.max(GAP_MIN_R, GAP_START_R - m * GAP_PER_METRE_R);
}
export function spikeChanceFor(m) {
  if (m < SPIKE_FROM) return 0;
  return Math.min(SPIKE_P_MAX, SPIKE_P_START + (m - SPIKE_FROM) * SPIKE_P_PER_METRE);
}
