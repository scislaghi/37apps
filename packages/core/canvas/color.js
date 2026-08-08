/* ══ Shared canvas colour helpers ══
   Three games interpolate a backdrop palette every frame, so these run hot
   enough to be worth a parse cache. */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CACHE = new Map();

/** @param {string} hex @returns {number[]} */
export function rgb(hex) {
  let v = CACHE.get(hex);
  if (!v) { v = hexToRgb(hex); CACHE.set(hex, v); }
  return v;
}

/** Linear blend between two hex colours, returned as a canvas-ready string. */
export function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

/**
 * Same blend as `mixHex`, but the result is itself a `#rrggbb` string.
 * `mixHex` returns `rgb(...)`, which is a valid fill style and *not* valid
 * input to `mixHex`/`withAlpha` — feeding one back in silently yields
 * `rgba(NaN,…)` and the canvas keeps painting with the previous style. Use
 * this whenever a blended colour is blended again or given an alpha; use
 * `mixHex` only for a value that goes straight onto the context.
 * @param {string} a @param {string} b @param {number} t
 */
export function blendHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    out += Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  }
  return out;
}

/** @param {string} hex @param {number} a */
export function withAlpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Seeded PRNG — so a reload doesn't reshuffle a game's procedural backdrop. */
export function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}
