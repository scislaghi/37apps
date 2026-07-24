/* ── shared grid logic: row generation, movement targets — used by both the game
   loop (PloopClimb.jsx) and the 3D renderer (Scene3D.jsx). Framework-free and
   with zero rendering concerns, so the two files can import it without any risk
   of a circular dependency between them. ── */

export const COLS = 5;
export const SAFE = 0, TREE = 1, CRACK = 2, SPIKE = 3, EMPTY = 4;

export function isDeadly(t) { return t === CRACK || t === SPIKE || t === EMPTY; }

/* isometric brick-offset lattice: each hop moves one row up, shifting half a
   column left/right depending on the row's parity */
export function upperL(row, col) {
  if (row % 2 === 0) return col > 0 ? { r: row + 1, c: col - 1 } : null;
  return { r: row + 1, c: col };
}
export function upperR(row, col) {
  if (row % 2 === 0) return col < COLS ? { r: row + 1, c: col } : null;
  return col + 1 < COLS ? { r: row + 1, c: col + 1 } : null;
}

/**
 * @param {number} n row index to generate
 * @param {number[] | undefined} prevRow the already-generated row below (n-1) —
 *   required to guarantee every reachable prior column has a real way forward
 */
export function genRow(n, prevRow) {
  if (n < 3) return Array(COLS).fill(SAFE);
  const d = Math.min(n / 60, 1);
  const row = [];
  for (let i = 0; i < COLS; i++) {
    const r = Math.random();
    if (r < 0.05 + d * 0.13) row.push(EMPTY);
    else if (r < 0.12 + d * 0.11) row.push(TREE);
    else if (r < 0.17 + d * 0.10) row.push(CRACK);
    else if (r < 0.21 + d * 0.09) row.push(SPIKE);
    else row.push(SAFE);
  }
  // fairness: edge columns are often a climber's only reachable target — never deadly
  if (isDeadly(row[0])) row[0] = SAFE;
  if (isDeadly(row[COLS - 1])) row[COLS - 1] = SAFE;

  // fairness: from every column the climber could legitimately be standing on
  // in the row below, at least one of the two diagonal hops must land SAFE.
  // Landing on TREE bumps harmlessly but never advances; landing on
  // CRACK/SPIKE/EMPTY kills — so if neither diagonal is SAFE the climber has
  // no real choice at all, only a forced death or a permanent stall.
  const prev = prevRow || Array(COLS).fill(SAFE);
  for (let pc = 0; pc < COLS; pc++) {
    if (isDeadly(prev[pc])) continue; // not a reachable standing column
    const l = upperL(n - 1, pc);
    const r = upperR(n - 1, pc);
    const lSafe = !!l && row[l.c] === SAFE;
    const rSafe = !!r && row[r.c] === SAFE;
    if (!lSafe && !rSafe) {
      const candidates = [l, r].filter(Boolean);
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        row[pick.c] = SAFE;
      }
    }
  }

  let safeCount = row.filter(t => t === SAFE).length;
  while (safeCount < 2) {
    const idx = Math.floor(Math.random() * COLS);
    if (row[idx] !== SAFE) { row[idx] = SAFE; safeCount++; }
  }
  return row;
}

/* rows must be generated strictly in order (0, 1, 2, ...) since each row's
   fairness pass depends on the actual contents of the row below it — callers
   (rendering in particular) may ask for a high row before a low one, so this
   backfills anything missing beneath n rather than trusting call order */
export function getRow(rows, n) {
  if (rows[n]) return rows[n];
  for (let i = 0; i <= n; i++) {
    if (!rows[i]) rows[i] = genRow(i, rows[i - 1]);
  }
  return rows[n];
}
