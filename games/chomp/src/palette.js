import { ACCENTS } from "@37apps/core/theme.js";

/* ── Chomp's four meanings ────────────────────────────────────────────────
   Brand kit v2 §02 gives a game one accent; Chomp spends four, because on a
   13×13 board every colour has to answer "what is this square" in one glance
   at ~26px. So each accent is assigned exactly one meaning and nothing else
   on the board is allowed to wear it — the trees and grass stay off-palette
   neutral greens precisely so they never compete with these.
   Lime is still *the* accent: it's the player, the buttons and the icon.  */
export const LIME = ACCENTS[2];   // #C0E637 — you
export const CORAL = ACCENTS[0];  // #FF4529 — the T-Rex
export const AMBER = ACCENTS[1];  // #FFA31A — food
export const CYAN = ACCENTS[4];   // #1DC0ED — water, the other way to die

export function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
