/* ══ Warp — tuning, palette and the shape ladder ══
   Everything in here is in *world units*, not pixels: the tunnel has radius 1
   (measured to a flat face) and depth runs down +z away from the camera. Only
   the projection turns that into pixels, so a tablet and a phone fly the exact
   same tunnel and only see more or less of it. */

/* ── Readability rule, and the reason the palette is split the way it is:
   the tunnel wears the colour, the danger never does. Slabs are always ink
   with a bright rim, cores are always amber, the craft is always white. Zones
   cycle the whole 8-accent kit, so a fixed colour per hazard would collide
   with some zone's wall sooner or later — "lethal = the absence of colour" is
   the only rule that survives every zone. ── */
export const palette = {
  ink: "#0B0A10",
  slab: "#100E18",
  slabFace: "#1C1926",
  craft: "#FFFFFF",
  core: "#FFA31A",
  coreHot: "#FFE3B0",
  hyper: "#FF297E",
};

/* Depth zones. `sides` is the tunnel's cross-section: the tunnel itself
   morphs from an octagon down to a square and back, and because obstacles are
   generated in whole sectors the side count *is* the difficulty dial — one
   blocked sector of a square is a quarter of the ring, one of an octagon is an
   eighth. The last stop repeats the first so an endless run wraps seamlessly. */
export const ZONES = [
  { at: 0,    name: "OCTA",  sides: 8, wallA: "#FF297E", wallB: "#7B42FF", fog: "#1B0726", glow: "#FFC2E4" },
  { at: 420,  name: "HEXA",  sides: 6, wallA: "#1DC0ED", wallB: "#3D64FF", fog: "#04162C", glow: "#C8F2FF" },
  { at: 950,  name: "PENTA", sides: 5, wallA: "#17D39B", wallB: "#C0E637", fog: "#03231A", glow: "#E4FFCE" },
  { at: 1500, name: "QUAD",  sides: 4, wallA: "#FFA31A", wallB: "#FF4529", fog: "#260A05", glow: "#FFE0B0" },
  { at: 2100, name: "OCTA",  sides: 8, wallA: "#FF297E", wallB: "#7B42FF", fog: "#1B0726", glow: "#FFC2E4" },
];

/** Metres over which one zone becomes the next. Deliberately shorter than the
    visible depth (~105 m) so the whole morph fits on screen at once — the
    colour and the new cross-section arrive *down the tunnel*, ahead of you,
    which is the game's signature image. */
export const MORPH_LEN = 90;

/* ── camera / projection ── */
export const Z_PLAYER = 1;        // the craft's plane; also where collisions resolve
export const Z_NEAR = 0.28;       // geometry nearer than this is behind the camera
/* Perspective compresses as 1/z, so depth past ~15 units is a handful of
   pixels around the vanishing point: rendering or spawning further out buys
   nothing but fill cost and slabs that are invisible until they're close
   anyway. The band spacing is the other half of that read — bands thinner than
   the tunnel is wide are what make it a tunnel rather than a stack of rings. */
export const Z_FAR = 17;
export const RING_STEP = 0.38;    // world spacing of the wall bands
export const ORBIT = 0.78;        // craft's distance from the axis, as a fraction of the apothem

/* ── travel ── */
export const METRES_PER_UNIT = 4;
export const BASE_SPEED = 6.2;    // world units/s ≈ 25 m/s
export const SPEED_PER_METRE = 0.0016;
export const MAX_SPEED = 13;

/* ── rolling ──
   Acceleration rather than a fixed rate, so a tap-and-release is a nudge and a
   held thumb is a full spin. The camera lags the craft (see CAM_LAG) instead of
   being welded to it: without the lag a rolling tunnel and a fixed craft read
   as "the world is spinning at me" with no sense that *you* moved. */
export const ROLL_MAX = 3.6;      // rad/s
export const ROLL_ACCEL = 26;
export const ROLL_DAMP = 9;
export const CAM_LAG = 0.115;     // seconds of craft angle the camera trails by
export const CRAFT_HALF = 0.15;   // rad — the craft's own angular half-width

/* ── obstacles ── */
/** Where a wave enters the world. Also the game's reaction-time budget: at the
    opening speed it is 2.6 s of flight, and 1.2 s at the speed cap — the floor
    was set from the cap, not from the opening, because that's the one that has
    to stay above human reaction time. */
export const SPAWN_Z = 16;
export const OBST_INNER = 0.44;   // slabs reach this far in from the wall (past ORBIT)
export const OBST_THICK = 0.45;
export const MIN_FREE_SECTORS = 2;         // for 5+ sided tunnels
export const MIN_FREE_SECTORS_TIGHT = 1;   // for the square

/** Each shape of danger joins the mix at its own depth, so the tunnel teaches
    one at a time instead of dumping four on the first screen. */
export const UNLOCK = { bar: 0, spin: 260, pulse: 700, twin: 1250 };

/* ── cores → HYPER ── */
export const CORE_R = 0.13;
export const CORE_HALF = 0.2;     // rad — grab window either side of the core
export const CORE_FILL = 0.25;    // four cores charge it
export const CORE_POINTS = 15;
export const SMASH_POINTS = 25;   // per slab shattered during HYPER
export const HYPER_TIME = 4.2;
export const HYPER_SPEED_MULT = 1.32;
export const HYPER_SCORE_MULT = 2;

export const IMPACT_MS = 320;
export const REVIVE_GRACE = 2.4;

/** Seconds between spawns. Time, not distance: the tunnel accelerates by a
    factor of two over a run, so a fixed *distance* gap would silently double
    the obstacle rate at speed — which is the difficulty curve arriving as a
    side effect instead of as a decision. */
export function spawnIntervalFor(m) {
  return Math.max(0.62, 1.35 - m * 0.00024);
}
export function speedFor(m) {
  return Math.min(MAX_SPEED, BASE_SPEED + m * SPEED_PER_METRE);
}
/** Fraction of the ring a wave is allowed to block. */
export function blockFracFor(m) {
  return 0.34 + Math.min(0.26, m * 0.00016);
}
