/* ══ Flick — tuning, palette and layout ══
   Sizes are logical CSS pixels; anything that has to hold its proportion on a
   tablet is derived from the play column's width in `layoutFor` rather than
   from a global scale factor, because this game's whole read is "how tall is
   the tower relative to the column it's standing in". */

/* ── Two walls, two colours, one tower. The side colours are the only thing
   the player actually reads under time pressure, so they're the two most
   separable accents in the brand kit — Hot Pink and Cyan Rush sit at opposite
   ends of the hue wheel *and* at different luminances, which keeps them apart
   for red/green colour blindness too. The app accent is a third colour
   (Violet Spark) on purpose: a PLAY button tinted like one of the walls would
   read as "this side is the good one". ── */
export const palette = {
  left: "#FF297E",         // Hot Pink
  right: "#1DC0ED",        // Cyan Rush
  accent: "#7B42FF",       // Violet Spark — chrome only, never a wall
  gold: "#FFA31A",         // Amber Pulse
  frost: "#EAF9FF",
  ink: "#18171D",
  bg: "#F7F5F2",
  colTop: "#FFFFFF",
  colBot: "#ECE8E1",
  text: "#18171D",
  danger: "#FF4529",
  success: "#17D39B",
};

export const SIDE_COLOR = { "-1": palette.left, "1": palette.right };

/* ── the clock ──────────────────────────────────────────────────────────
   Ten seconds, always draining. Every correct flick buys a fraction of a
   second back, and that fraction shrinks with score — so the run doesn't end
   because the game got harder to read, it ends because the rate you have to
   sustain eventually outruns your thumbs. */
export const TIME_START = 10;
export const TIME_MAX = 10;
export const TIME_GAIN_START = 0.62;
export const TIME_GAIN_MIN = 0.34;
export const TIME_GAIN_DECAY = 0.0013;   // per point of score
export const TIME_LOW = 3;               // below this the HUD goes into alarm

/* ── the tower ── */
export const START_DISCS = 5;
export const SPAWN_START = 1.5;          // discs per second
export const SPAWN_MAX = 3.6;
export const SPAWN_PER_POINT = 0.0062;
export const MAX_RUN = 4;                // never more than 4 of one colour in a row

/* ── boost ──
   Eight correct flicks charge it; it then spends itself over BOOST_TIME and
   the meter visibly burns back down, so the reward has a shape instead of
   just a number going up. */
export const BOOST_NOTCHES = 8;
export const BOOST_TIME = 5;
export const BOOST_SCORE_MULT = 2;
export const BOOST_TIME_MULT = 1.4;

/* ── special discs ──
   Each joins the mix at its own score so the game introduces one rule at a
   time. Never two specials back to back — a gold immediately followed by a
   wild reads as noise rather than as an event. */
export const SPECIALS = {
  gold: { from: 8, chance: 0.06 },
  wild: { from: 15, chance: 0.045 },
  ice: { from: 26, chance: 0.05 },
};
export const SPECIAL_COOLDOWN = 3;       // discs between specials

export const GOLD_POINTS = 5;
export const GOLD_TIME = 1.2;
export const WILD_POINTS = 2;
export const CHILL_TIME = 3.5;
export const CHILL_DRAIN = 0.45;         // clock drain multiplier while chilled
export const CHILL_SPAWN = 0.5;

/* ── the swap ──
   The one rule that changes the game rather than the numbers: past
   SWAP_FROM the two walls trade colours every SWAP_EVERY flicks. During the
   animation *either* direction scores, so a swap can never steal a run from
   a player who was already mid-tap. */
export const SWAP_FROM = 30;
export const SWAP_EVERY = 18;
export const SWAP_TIME = 0.55;

export const COMBO_STEP = 5;             // every N in a row pays a time bonus
export const COMBO_TIME = 0.25;

export const IMPACT_MS = 340;
export const REVIVE_DISCS = 4;

/**
 * Play-field geometry. The tower, the column and the walls all derive from one
 * width so they can never drift out of proportion with each other.
 */
export function layoutFor(w, h) {
  const colW = Math.min(w * 0.66, 430);
  const colX0 = (w - colW) / 2;
  const r = colW * 0.315;                // disc radius
  const ry = r * 0.3;                     // top-cap ellipse minor radius
  const discH = r * 0.46;                 // stack spacing = the visible stripe
  const baseY = h - Math.max(26, h * 0.05) - ry;
  const dangerY = Math.max(h * 0.245, 148);
  return { w, h, colW, colX0, colX1: colX0 + colW, cx: w / 2, r, ry, discH, baseY, dangerY };
}

export const timeGainFor = (score) =>
  Math.max(TIME_GAIN_MIN, TIME_GAIN_START - score * TIME_GAIN_DECAY);

export const spawnRateFor = (score) =>
  Math.min(SPAWN_MAX, SPAWN_START + score * SPAWN_PER_POINT);
