import { useState, useEffect, useCallback, useRef } from "react";
import { animated } from "@react-spring/web";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay } from "@37apps/core/theme.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { useScorePop } from "@37apps/core/animation.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import {
  DinoSprite, RexSprite, TreeSprite, PondSprite, FoodSprite, FootprintSprite,
} from "./sprites.jsx";
import { LIME, CORAL, AMBER, CYAN, withAlpha } from "./palette.js";

/* ── Chomp ────────────────────────────────────────────────────────────────
   A 13×13 clearing. Your herbivore never stops running; you only ever set
   which way it is pointing, and it takes the next square in that direction
   on its own clock. Eat the frond, +1, a new one grows somewhere else. Trees
   block you, water drowns you, and one T-Rex is always somewhere on the
   board — until it leaves the board entirely and comes back in on an edge
   you were not watching.

   Both dinos run on their own independent clocks that speed up with your
   score, so this is a real-time chase, not Pounce's turn-based one. That's
   the one structural decision everything else follows from: see the engine
   comment below for why it's a single self-rescheduling timer over a mutable
   ref rather than two intervals over React state.                          */

const N = 13;
const CENTER = 6;
const key = (r, c) => r * N + c;
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const rnd = (n) => Math.floor(Math.random() * n);

/* ── difficulty ───────────────────────────────────────────────────────────
   Both dinos accelerate, but the Rex accelerates faster, so the run is a
   closing gap rather than a flat treadmill. It starts ~47% slower than you
   (survivable while you learn the board) and is only ~24% slower by score
   40 — at which point the trees it has to path around are the whole reason
   you're still alive.                                                      */
const DINO_MS_START = 340, DINO_MS_MIN = 165;
const REX_MS_START = 500, REX_MS_MIN = 210;
const dinoMsFor = (s) => Math.max(DINO_MS_MIN, DINO_MS_START - s * 5);
const rexMsFor = (s) => Math.max(REX_MS_MIN, REX_MS_START - s * 8);
/** Rex steps between rampages — it leaves the board more often as you score. */
const rampageEveryFor = (s) => Math.max(8, 15 - Math.floor(s / 6));

const READY_MS = 850;     // beat before the first step, so you can read the board
const GONE_MS = 640;      // Rex is off the board entirely — your only breather
const ARRIVE_MS = 820;    // telegraph sits on the re-entry square this long
const DEATH_BEAT_MS = 820; // board holds the death frame before the card covers it

/* 24 blocked squares of 169. Higher numbers (the first pass ran 18/12) both
   played tighter than the speed curve wanted AND turned the board into a
   texture — at 27px a cell, scenery is the loudest thing on screen long
   before the two dinos are, so the count is a readability lever as much as a
   difficulty one. */
const TREE_COUNT = 14;
const POND_COUNT = 10;

const bestStore = createBestScoreStore("chomp.best");

/* ── board generation ─────────────────────────────────────────────────────
   Ponds grow as short random walks so they read as puddles rather than
   confetti; trees are scattered singles. Nothing spawns within 2 squares of
   the centre (you start there, at speed, already pointed somewhere).

   The flood fill is the part that matters: a board where 12 random ponds
   wall off a corner would strand food in a pocket you can never reach, so a
   layout is only accepted if ≥90% of its open squares are reachable from the
   spawn, and everything that spawns later picks from that reachable set.   */
function floodFrom(r0, c0, blocked) {
  const seen = new Set([key(r0, c0)]);
  const queue = [[r0, c0]];
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [dr, dc] of ORTHO) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const k = key(nr, nc);
      if (seen.has(k) || blocked(nr, nc)) continue;
      seen.add(k);
      queue.push([nr, nc]);
    }
  }
  return seen;
}

function generateBoard() {
  const nearSpawn = (r, c) => Math.max(Math.abs(r - CENTER), Math.abs(c - CENTER)) <= 2;

  for (let attempt = 0; attempt < 40; attempt++) {
    const trees = new Set(), ponds = new Set();
    const taken = (r, c) => trees.has(key(r, c)) || ponds.has(key(r, c));

    let placed = 0, guard = 0;
    while (placed < POND_COUNT && guard++ < 600) {
      let r = rnd(N), c = rnd(N);
      const len = 1 + rnd(3);
      for (let i = 0; i < len && placed < POND_COUNT; i++) {
        if (r < 0 || r >= N || c < 0 || c >= N || nearSpawn(r, c) || taken(r, c)) break;
        ponds.add(key(r, c));
        placed++;
        const [dr, dc] = ORTHO[rnd(4)];
        r += dr; c += dc;
      }
    }

    placed = 0; guard = 0;
    while (placed < TREE_COUNT && guard++ < 800) {
      const r = rnd(N), c = rnd(N);
      if (nearSpawn(r, c) || taken(r, c)) continue;
      trees.add(key(r, c));
      placed++;
    }

    let openCount = 0;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (!taken(r, c)) openCount++;

    const open = floodFrom(CENTER, CENTER, taken);
    if (open.size >= openCount * 0.9) return { trees, ponds, open };
  }

  /* 40 rejected layouts in a row is effectively impossible with these counts,
     but an empty clearing is a playable fallback and a thrown error isn't. */
  const open = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) open.add(key(r, c));
  return { trees: new Set(), ponds: new Set(), open };
}

/** A square the Rex can stand on. Water stops it too — that's what makes
    running a lap around a pond a real defensive move and not just decor. */
function rexCanEnter(g, r, c) {
  if (r < 0 || r >= N || c < 0 || c >= N) return false;
  return !g.trees.has(key(r, c)) && !g.ponds.has(key(r, c));
}

/** One chase step: greedy toward the dino, never doubling back unless it's
    the only way out, and with an 18% "wrong foot" so it isn't a solver. A
    Rex with perfect pathing at these speeds isn't hard, it's unsurvivable —
    and it reads as cheating rather than as an animal. */
function planRexStep(g) {
  const opts = [];
  for (const [dr, dc] of ORTHO) {
    const r = g.rex.row + dr, c = g.rex.col + dc;
    if (!rexCanEnter(g, r, c)) continue;
    opts.push({
      row: r, col: c, dr, dc,
      reversing: dr === -g.rex.dr && dc === -g.rex.dc,
      dist: Math.abs(r - g.dino.row) + Math.abs(c - g.dino.col),
    });
  }
  if (!opts.length) return null;

  const forward = opts.filter(o => !o.reversing);
  const pool = forward.length ? forward : opts;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.sort((a, b) => a.dist - b.dist); // stable, so the shuffle breaks ties
  return pool.length > 1 && Math.random() < 0.18 ? pool[1] : pool[0];
}

/** Where the Rex comes back in after a rampage: an edge square at least 4
    away, picked from the three closest — close enough to cut you off, random
    enough that you can't pre-run to the safe corner every time. */
function pickReentry(g) {
  const edge = [], anywhere = [];
  for (const k of g.open) {
    const r = Math.floor(k / N), c = k % N;
    const dist = Math.abs(r - g.dino.row) + Math.abs(c - g.dino.col);
    if (dist < 4) continue;
    anywhere.push({ row: r, col: c, dist });
    if (r === 0 || c === 0 || r === N - 1 || c === N - 1) edge.push({ row: r, col: c, dist });
  }
  const pool = edge.length ? edge : anywhere;
  if (!pool.length) return { row: 0, col: 0 };
  pool.sort((a, b) => a.dist - b.dist);
  return pool[rnd(Math.min(3, pool.length))];
}

/** Somewhere to grow the next frond: reachable, not under you, not under him. */
function pickFood(g) {
  const cands = [];
  for (const k of g.open) {
    const r = Math.floor(k / N), c = k % N;
    if (Math.abs(r - g.dino.row) + Math.abs(c - g.dino.col) < 2) continue;
    if (g.rex.phase === "hunt" && Math.abs(r - g.rex.row) + Math.abs(c - g.rex.col) < 3) continue;
    cands.push({ row: r, col: c });
  }
  if (!cands.length) return { row: CENTER, col: CENTER, id: rnd(1e9) };
  return { ...cands[rnd(cands.length)], id: rnd(1e9) };
}

let fxId = 1;

export default function Chomp() {
  const [phase, setPhase] = useState("start"); // start | play | dying | dead | settings
  const [best, setBest] = useState(0);
  const [board, setBoard] = useState({ trees: [], ponds: [] });
  const [view, setView] = useState(null);      // engine snapshot, see publish()
  const [prints, setPrints] = useState([]);    // fading footprints — the signature motif
  const [bursts, setBursts] = useState([]);
  const [steer, setSteer] = useState(null);    // ghost chevron confirming your input
  const [shake, setShake] = useState(false);
  const [deathReason, setDeathReason] = useState(null); // 'rex' | 'water'

  const gRef = useRef(null);
  const phaseRef = useRef("start");
  const endingRef = useRef(false);
  const scoreRef = useRef(0);
  const bestLoadedRef = useRef(false);
  const timeoutsRef = useRef([]);
  const swipeRef = useRef(null);

  const scorePop = useScorePop(view?.score ?? 0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  /** setTimeout that a restart or unmount cancels. */
  const later = useCallback((fn, ms) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  /* ── transient effects ── */
  const addPrint = useCallback((row, col, color, angle, scale) => {
    const id = `p${fxId++}`;
    setPrints(ps => [...ps.slice(-24), { id, row, col, color, angle, scale }]);
    later(() => setPrints(ps => ps.filter(p => p.id !== id)), 720);
  }, [later]);

  const addBurst = useCallback((row, col, color, { label = null, count = 10, spread = 34 } = {}) => {
    const id = `b${fxId++}`;
    const shards = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = spread * (0.6 + Math.random() * 0.7);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: 4 + Math.random() * 4 };
    });
    setBursts(bs => [...bs, { id, row, col, color, label, shards }]);
    later(() => setBursts(bs => bs.filter(b => b.id !== id)), 800);
  }, [later]);

  /* ── ads + audio: init once on mount ── */
  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
    initHaptics();
  }, []);

  useEffect(() => {
    bestStore.loadBestScore().then(b => {
      setBest(b);
      bestLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (bestLoadedRef.current) bestStore.saveBestScore(best);
  }, [best]);

  /* ── game over ────────────────────────────────────────────────────────
     Same shape as Pounce: hold a "dying" beat so the death actually reads on
     the board (the game-over card is opaque and full-screen, so anything
     animated under it would otherwise never be seen), and fire the
     interstitial at the end of that beat so it never covers the death frame.
     Idempotent per round because the engine can have a step in flight.     */
  const endGame = useCallback((reason) => {
    if (endingRef.current) return;
    endingRef.current = true;

    const finalScore = scoreRef.current;
    setDeathReason(reason);
    setPhase("dying");
    phaseRef.current = "dying";
    setShake(true);
    sfx.hit();
    vibrate(reason === "water" ? [0, 40, 50, 70] : [0, 60, 40, 120]);
    later(() => setShake(false), 520);
    later(() => {
      setBest(b => Math.max(b, finalScore));
      setPhase("dead");
      showInterstitial(AD_IDS);
    }, DEATH_BEAT_MS);
  }, [later]);

  /** Push the mutable engine state onto React. Called once per step, not per
      frame — the sprites glide between squares with a CSS transition whose
      duration is the current step time, so the run stays smooth at ~11
      renders/second instead of 60. */
  const publish = useCallback(() => {
    const g = gRef.current;
    setView({
      dino: { ...g.dino },
      rex: { ...g.rex },
      food: { ...g.food },
      score: g.score,
      dinoMs: dinoMsFor(g.score),
      rexMs: rexMsFor(g.score),
      bumpId: g.bumpId,
      alarmed: g.rex.phase === "hunt"
        && Math.max(Math.abs(g.rex.row - g.dino.row), Math.abs(g.rex.col - g.dino.col)) <= 2,
    });
  }, []);

  /* ── the dino's step ── */
  const stepDino = useCallback((g, now) => {
    if (g.queued) { g.dino.dr = g.queued[0]; g.dino.dc = g.queued[1]; g.queued = null; }
    const { dr, dc } = g.dino;
    const nr = g.dino.row + dr, nc = g.dino.col + dc;
    g.dino.ms = dinoMsFor(g.score);
    g.nextDinoAt = now + g.dino.ms;

    /* Board edge and trees both just stop you. Losing a step to a tree while
       something faster is chasing you is already the harshest punishment this
       game has — killing you for it on top would make the board feel hostile
       rather than tight. */
    const blocked = nr < 0 || nr >= N || nc < 0 || nc >= N || g.trees.has(key(nr, nc));
    if (blocked) {
      g.bumpId++;
      sfx.select();
      return;
    }

    if (g.ponds.has(key(nr, nc))) {
      g.dino.row = nr; g.dino.col = nc;
      addBurst(nr, nc, CYAN, { count: 16, spread: 48 });
      endGame("water");
      return;
    }

    addPrint(g.dino.row, g.dino.col, withAlpha("#3E6B1A", 0.34), g.dino.angle, 0.4);
    g.dino.row = nr; g.dino.col = nc;
    g.dino.run ^= 1;
    if (dc !== 0) g.dino.face = dc > 0 ? 1 : -1;
    g.dino.angle = dr < 0 ? -90 : dr > 0 ? 90 : (dc > 0 ? 0 : 180);
    g.dino.tilt = dr < 0 ? -13 : dr > 0 ? 13 : 0;

    if (nr === g.food.row && nc === g.food.col) {
      g.score++;
      scoreRef.current = g.score;
      sfx.score();
      vibrate(22);
      addBurst(nr, nc, AMBER, { label: "+1", count: 12, spread: 38 });
      g.food = pickFood(g);
    }

    /* You ran into him. Symmetric with the Rex's own collision check below —
       whoever moves last does the killing, so a head-on swap can't phase
       through. */
    if (g.rex.phase === "hunt" && nr === g.rex.row && nc === g.rex.col) {
      addBurst(nr, nc, CORAL, { count: 18, spread: 52 });
      endGame("rex");
    }
  }, [addBurst, addPrint, endGame]);

  /* ── the Rex's step ───────────────────────────────────────────────────
     nextRexAt is the Rex's whole clock, not just its walk timer: the rampage
     states hang off the same schedule, so "leave the board" and "come back"
     are simply steps with different durations. That keeps one timeline for
     the entire predator and makes the off-board window impossible to desync
     from the chase.                                                        */
  const stepRex = useCallback((g, now) => {
    const rexMs = rexMsFor(g.score);

    if (g.rex.phase === "gone") {
      const at = pickReentry(g);
      g.rex.target = at;
      g.rex.phase = "arrive";
      g.nextRexAt = now + ARRIVE_MS;
      addPrint(at.row, at.col, withAlpha(CORAL, 0.5), 0, 0.7);
      return;
    }

    if (g.rex.phase === "arrive") {
      const at = g.rex.target;
      g.rex.row = at.row; g.rex.col = at.col;
      g.rex.face = at.col > g.dino.col ? -1 : 1;
      g.rex.dr = 0; g.rex.dc = g.rex.face;
      g.rex.phase = "hunt";
      g.rex.steps = 0;
      g.rex.spawnId++;
      g.rex.roar = false;
      g.rex.target = null;
      g.nextRexAt = now + rexMs;

      sfx.power();
      vibrate([0, 30, 40, 30]);
      addBurst(at.row, at.col, CORAL, { count: 14, spread: 44 });
      setShake(true);
      later(() => setShake(false), 340);

      if (at.row === g.dino.row && at.col === g.dino.col) endGame("rex");
      return;
    }

    /* hunting */
    if (g.rex.steps >= rampageEveryFor(g.score)) {
      g.rex.phase = "gone";
      g.rex.roar = true;
      g.nextRexAt = now + GONE_MS;
      sfx.shift();
      addBurst(g.rex.row, g.rex.col, CORAL, { count: 12, spread: 40 });
      return;
    }

    const move = planRexStep(g);
    g.nextRexAt = now + rexMs;
    if (!move) return; // fully walled in; it just growls in place until you move

    addPrint(g.rex.row, g.rex.col, withAlpha(CORAL, 0.3), 0, 0.62);
    g.rex.row = move.row; g.rex.col = move.col;
    g.rex.dr = move.dr; g.rex.dc = move.dc;
    g.rex.run ^= 1;
    g.rex.steps++;
    if (move.dc !== 0) g.rex.face = move.dc > 0 ? 1 : -1;

    if (move.row === g.dino.row && move.col === g.dino.col) {
      addBurst(move.row, move.col, CORAL, { count: 18, spread: 52 });
      endGame("rex");
    }
  }, [addBurst, addPrint, endGame, later]);

  /* ── the engine ───────────────────────────────────────────────────────
     One self-rescheduling timer that always fires at whichever dino is due
     next, over a single mutable ref. Two setIntervals over React state was
     the obvious first shape and the wrong one: they'd each read a stale
     snapshot of the other's position through their closure, so a head-on
     collision could resolve twice — or not at all — depending on which
     interval happened to tick first. With one authoritative object and one
     timeline, "did he catch me" is answered exactly once, by whoever moved.
     React state is a projection of it (see publish), never the source.     */
  useEffect(() => {
    if (phase !== "play") return;
    let cancelled = false;
    let timer = null;

    const loop = () => {
      if (cancelled) return;
      const g = gRef.current;
      const now = performance.now();
      const due = Math.min(g.nextDinoAt, g.nextRexAt);
      if (now < due - 1) { timer = setTimeout(loop, due - now); return; }

      if (g.nextDinoAt <= g.nextRexAt) stepDino(g, now);
      else stepRex(g, now);

      if (cancelled || endingRef.current) return;
      publish();
      timer = setTimeout(loop, Math.max(0, Math.min(g.nextDinoAt, g.nextRexAt) - performance.now()));
    };

    timer = setTimeout(loop, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [phase, stepDino, stepRex, publish]);

  /* ── start / restart ── */
  const startGame = useCallback(() => {
    clearTimeouts();
    const { trees, ponds, open } = generateBoard();
    const now = performance.now();

    const g = {
      trees, ponds, open,
      dino: { row: CENTER, col: CENTER, dr: 0, dc: 1, face: 1, angle: 0, tilt: 0, run: 0, ms: DINO_MS_START },
      /* the Rex opens a rampage away, so round one starts with the telegraph
         rather than with a predator already breathing on you */
      rex: { row: 0, col: 0, dr: 0, dc: 0, face: -1, run: 0, phase: "gone", steps: 0, spawnId: 1, target: null, roar: true },
      food: null,
      score: 0,
      queued: null,
      bumpId: 0,
      nextDinoAt: now + READY_MS,
      nextRexAt: now + READY_MS + 120,
    };
    g.food = pickFood(g);

    gRef.current = g;
    scoreRef.current = 0;
    endingRef.current = false;
    setBoard({
      trees: [...trees].map(k => ({ k, row: Math.floor(k / N), col: k % N })),
      ponds: [...ponds].map(k => ({ k, row: Math.floor(k / N), col: k % N })),
    });
    setPrints([]);
    setBursts([]);
    setSteer(null);
    setShake(false);
    setDeathReason(null);
    publish();
    setPhase("play");
    phaseRef.current = "play";
  }, [clearTimeouts, publish]);

  /* ── steering ─────────────────────────────────────────────────────────
     You never move the dino, you only ever point it — the direction is
     buffered and applied at its next step, which is what makes the whole
     game about reading two squares ahead instead of reacting.             */
  const setDir = useCallback((dr, dc) => {
    const g = gRef.current;
    if (!g || phaseRef.current !== "play") return;
    if (g.dino.dr === dr && g.dino.dc === dc) return;
    g.queued = [dr, dc];
    setSteer({ dr, dc, id: fxId++ });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
        W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      setDir(dir[0], dir[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDir]);

  const onPointerDown = useCallback((e) => {
    if (phase === "start" || phase === "dead") { startGame(); return; }
    if (phase === "play") swipeRef.current = { x: e.clientX, y: e.clientY };
  }, [phase, startGame]);

  const onPointerMove = useCallback((e) => {
    const s = swipeRef.current;
    if (!s || phaseRef.current !== "play") return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(0, dx > 0 ? 1 : -1);
    else setDir(dy > 0 ? 1 : -1, 0);
    /* re-anchor instead of clearing, so one long drag can chain several
       turns — how anyone who has played a snake game expects this to feel */
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }, [setDir]);

  const onPointerUp = useCallback(() => { swipeRef.current = null; }, []);

  /* ── layout ── */
  const cellSize = `min(${(430 / N).toFixed(2)}px, ${(92 / N).toFixed(2)}vw)`;
  const boardPx = `calc(${cellSize} * ${N})`;
  const cellPct = 100 / N;
  const centerPct = (i) => (i + 0.5) * cellPct;

  const onBoard = phase === "play" || phase === "dying";
  const rexOff = view && view.rex.phase !== "hunt";
  const chase = view && view.rex.phase === "hunt"
    ? Math.max(Math.abs(view.rex.row - view.dino.row), Math.abs(view.rex.col - view.dino.col))
    : N;
  const danger = onBoard && chase <= 3;
  /* 1 when he's on you, 0 at eight squares out — a bar you feel rather than read */
  const threat = onBoard ? Math.max(0, Math.min(1, 1 - (chase - 1) / 8)) : 0;

  const deathTitle = deathReason === "water" ? "Sank!" : "Chomped!";

  /** Absolutely position a single cell-sized layer at (row, col). */
  const cellAt = (row, col, z, extra = {}) => ({
    position: "absolute", top: 0, left: 0,
    width: `${cellPct}%`, height: `${cellPct}%`,
    display: "flex", alignItems: "center", justifyContent: "center",
    transform: `translate(${col * 100}%, ${row * 100}%)`,
    zIndex: z, pointerEvents: "none",
    ...extra,
  });

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, ${baseTheme.bg} 55%, #E9E2D4 100%)`,
        fontFamily: fontUI, userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", padding: 12, overflow: "hidden",
      }}
    >
      {/* ── header ── */}
      {onBoard && view && (
        <div style={{ width: boardPx, marginBottom: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{
                fontSize: 10, color: baseTheme.textMuted, fontWeight: 800,
                letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                Score
              </span>
              <animated.span style={{
                fontSize: 30, color: baseTheme.text, fontWeight: 900, fontFamily: fontDisplay,
                display: "inline-block", lineHeight: 1,
                transform: scorePop.scale.to(s => `scale(${s})`),
              }}>
                {view.score}
              </animated.span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
              color: baseTheme.textMuted,
            }}>
              Best · {best}
            </span>
          </div>

          {/* threat bar — how close the Rex is, and dead flat while he's off-board */}
          <div style={{ height: 8, borderRadius: 99, background: "rgba(24,23,29,0.08)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${threat * 100}%`,
              background: danger
                ? `linear-gradient(90deg, ${AMBER}, ${CORAL})`
                : `linear-gradient(90deg, ${LIME}, ${AMBER})`,
              boxShadow: `0 0 10px ${withAlpha(danger ? CORAL : LIME, 0.55)}`,
              transition: "width 0.22s linear, background 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* ── board ── */}
      <div style={{ animation: shake ? "chShake 0.5s cubic-bezier(.36,.07,.19,.97)" : "none" }}>
        <div style={{
          "--ch-cell": cellSize,
          position: "relative", width: boardPx, height: boardPx,
          borderRadius: 24, padding: 6,
          background: "linear-gradient(160deg, #FFFFFF 0%, #EFE6D5 100%)",
          border: `1px solid ${danger ? withAlpha(CORAL, 0.5) : baseTheme.border}`,
          boxShadow: danger
            ? `0 12px 34px rgba(24,23,29,0.16), 0 0 0 4px ${withAlpha(CORAL, 0.15)}`
            : `0 12px 34px rgba(24,23,29,0.16), 0 0 0 4px ${withAlpha(LIME, 0.16)}`,
          transition: "box-shadow 0.3s, border-color 0.3s",
        }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 18, overflow: "hidden" }}>

            {/* The clearing. Warm sand rather than the green it started as:
                with a green floor, a lime dino and green trees, three of the
                four things on the board were the same hue and the player was
                the hardest of them to find. Neutral ground gives each accent
                its meaning back — and it's the brand's own base tone. */}
            <div style={{
              position: "absolute", inset: 0, display: "grid",
              gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)`,
            }}>
              {Array.from({ length: N * N }).map((_, i) => (
                <div key={i} style={{
                  background: (Math.floor(i / N) + (i % N)) % 2 === 0 ? "#FBF7ED" : "#EDE5D3",
                }} />
              ))}
            </div>

            {/* ponds sit under everything — they're terrain, not props */}
            {board.ponds.map(p => (
              <div key={`w${p.k}`} style={cellAt(p.row, p.col, 1)}>
                <div style={{ width: "102%", height: "102%", animation: "chRipple 3.4s ease-in-out infinite" }}>
                  <PondSprite seed={p.k} />
                </div>
              </div>
            ))}

            {/* footprints */}
            {prints.map(p => (
              <div key={p.id} style={cellAt(p.row, p.col, 2)}>
                <div style={{
                  width: `${p.scale * 100}%`, height: `${p.scale * 100}%`,
                  transform: `rotate(${p.angle + 90}deg)`,
                  animation: "chPrint 0.72s ease-out forwards",
                }}>
                  <FootprintSprite color={p.color} />
                </div>
              </div>
            ))}

            {/* food */}
            {onBoard && view && (
              <div key={view.food.id} style={cellAt(view.food.row, view.food.col, 3)}>
                <div style={{
                  position: "absolute", width: "115%", height: "115%", borderRadius: "50%",
                  background: withAlpha(AMBER, 0.3), animation: "chFoodHalo 1.6s ease-out infinite",
                }} />
                <div style={{
                  width: "82%", height: "82%",
                  filter: `drop-shadow(0 2px 5px ${withAlpha("#8A4A00", 0.4)})`,
                  animation: "chFoodPop 0.45s cubic-bezier(0.34,1.56,0.64,1), chFoodBob 1.9s ease-in-out 0.45s infinite",
                }}>
                  <FoodSprite />
                </div>
              </div>
            )}

            {/* trees — above the runners' feet line, so a dino behind a trunk
                still reads as "behind it" instead of pasted on top */}
            {board.trees.map(t => (
              <div key={`t${t.k}`} style={cellAt(t.row, t.col, 6)}>
                <div style={{ width: "100%", height: "100%", filter: "drop-shadow(0 3px 4px rgba(24,23,29,0.22))" }}>
                  <TreeSprite seed={t.k} />
                </div>
              </div>
            ))}

            {/* Rex re-entry telegraph — the whole rampage exists for this beat,
                so it gets the loudest thing on the board: a growing ring, a
                stamped footprint and a countdown wipe on the exact square */}
            {onBoard && view && view.rex.phase === "arrive" && view.rex.target && (
              <div style={cellAt(view.rex.target.row, view.rex.target.col, 7)}>
                <div style={{
                  position: "absolute", inset: "-40%", borderRadius: "50%",
                  border: `3px solid ${CORAL}`, animation: "chIncoming 0.62s ease-out infinite",
                }} />
                <div style={{
                  position: "absolute", inset: "4%", borderRadius: 10,
                  background: withAlpha(CORAL, 0.28), border: `2px dashed ${CORAL}`,
                  animation: "chGhostPulse 0.4s ease-in-out infinite alternate",
                }} />
                <div style={{ width: "58%", height: "58%", opacity: 0.85 }}>
                  <FootprintSprite color={CORAL} />
                </div>
              </div>
            )}

            {/* the Rex */}
            {onBoard && view && !rexOff && (
              <div
                key={view.rex.spawnId}
                style={cellAt(view.rex.row, view.rex.col, 8, {
                  transition: `transform ${Math.round(view.rexMs * 0.72)}ms cubic-bezier(0.4,0.02,0.2,1)`,
                })}
              >
                <div style={{
                  position: "absolute", bottom: "4%", width: "62%", height: "14%",
                  borderRadius: "50%", background: "rgba(24,23,29,0.22)", filter: "blur(1px)",
                }} />
                <div style={{
                  width: "126%", height: "126%",
                  transform: `scaleX(${view.rex.face})`,
                  filter: `drop-shadow(0 3px 5px rgba(90,17,10,0.45))${danger ? ` drop-shadow(0 0 9px ${withAlpha(CORAL, 0.8)})` : ""}`,
                  animation: "chRexLand 0.42s cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                  <RexSprite run={view.rex.run} roaring={danger} />
                </div>
              </div>
            )}

            {/* the dino */}
            {onBoard && view && (
              <div style={cellAt(view.dino.row, view.dino.col, 9, {
                transition: `transform ${view.dinoMs}ms linear`,
                opacity: phase === "dying" && deathReason === "rex" ? 0 : 1,
              })}>
                <div style={{
                  position: "absolute", bottom: "6%", width: "54%", height: "12%",
                  borderRadius: "50%", background: "rgba(24,23,29,0.18)", filter: "blur(1px)",
                }} />
                {/* steering chevron: confirms the turn you just asked for on the
                    frame you ask for it, well before the dino's next step */}
                {steer && (
                  <div key={steer.id} style={{
                    position: "absolute", inset: "-26%",
                    transform: `rotate(${steer.dc > 0 ? 0 : steer.dc < 0 ? 180 : steer.dr > 0 ? 90 : -90}deg)`,
                    animation: "chSteer 0.42s ease-out forwards",
                  }}>
                    <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none"
                      stroke={LIME} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M62,28 L82,50 L62,72" />
                    </svg>
                  </div>
                )}
                <div
                  key={view.bumpId}
                  style={{
                    width: "120%", height: "120%",
                    transform: `scaleX(${view.dino.face}) rotate(${view.dino.face * view.dino.tilt}deg)`,
                    filter: `drop-shadow(0 3px 6px ${withAlpha("#3E6B1A", 0.45)})`,
                    animation: `chHop ${view.dinoMs}ms ease-in-out infinite`,
                  }}
                >
                  <div style={{ width: "100%", height: "100%", animation: "chBump 0.26s ease-out" }}>
                    <DinoSprite run={view.dino.run} alarmed={view.alarmed} />
                  </div>
                </div>
              </div>
            )}

            {/* bursts */}
            {bursts.map(b => (
              <div key={b.id} style={{
                position: "absolute", left: `${centerPct(b.col)}%`, top: `${centerPct(b.row)}%`,
                width: 0, height: 0, zIndex: 11, pointerEvents: "none",
              }}>
                <div style={{
                  position: "absolute", left: 0, top: 0,
                  width: "var(--ch-cell)", height: "var(--ch-cell)",
                  marginLeft: "calc(var(--ch-cell) / -2)", marginTop: "calc(var(--ch-cell) / -2)",
                  borderRadius: "50%", border: `3px solid ${withAlpha(b.color, 0.75)}`,
                  animation: "chRing 0.55s cubic-bezier(0.2,0.8,0.3,1) forwards",
                }} />
                {b.shards.map((s, i) => (
                  <div key={i} style={{
                    position: "absolute", left: 0, top: 0,
                    width: s.size, height: s.size, borderRadius: "50%", background: b.color,
                    "--ch-dx": `${s.dx}px`, "--ch-dy": `${s.dy}px`,
                    animation: "chShard 0.6s cubic-bezier(0.15,0.7,0.3,1) forwards",
                  }} />
                ))}
                {b.label && (
                  <span style={{
                    position: "absolute", left: 0, top: 0, whiteSpace: "nowrap",
                    fontSize: 17, fontWeight: 900, fontFamily: fontDisplay,
                    color: "#C87000", textShadow: "0 1px 3px rgba(255,255,255,0.95)",
                    animation: "chFlashUp 0.75s ease-out forwards",
                  }}>
                    {b.label}
                  </span>
                )}
              </div>
            ))}

            {/* vignette — depth without touching readability */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none", zIndex: 12,
              boxShadow: "inset 0 2px 6px rgba(24,23,29,0.10), inset 0 -16px 30px rgba(24,23,29,0.07)",
            }} />

            {/* death wash */}
            {phase === "dying" && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 13,
                background: `radial-gradient(circle at center, transparent 26%, ${withAlpha(deathReason === "water" ? CYAN : CORAL, 0.4)} 100%)`,
                animation: "chDeathWash 0.8s ease-out forwards",
              }} />
            )}

            {/* rampage banner — the beat the whole game is built around */}
            {onBoard && rexOff && (
              <div style={{
                position: "absolute", left: 0, right: 0, top: "42%", zIndex: 14,
                display: "flex", justifyContent: "center", pointerEvents: "none",
              }}>
                <div style={{
                  padding: "8px 18px", borderRadius: 99, background: withAlpha(CORAL, 0.94),
                  color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 900,
                  fontSize: 13, letterSpacing: "0.1em", whiteSpace: "nowrap",
                  boxShadow: `0 8px 22px ${withAlpha(CORAL, 0.45)}`,
                  animation: "chBanner 0.55s ease-in-out infinite alternate",
                }}>
                  T-REX INCOMING
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── hint strip ── */}
      {onBoard && (
        <div style={{
          marginTop: 12, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: baseTheme.textMuted,
        }}>
          Swipe to steer
        </div>
      )}

      {/* ── START ── */}
      {phase === "start" && (
        <StartScreen
          accent={LIME}
          title={
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 78, height: 78, filter: `drop-shadow(0 6px 14px ${withAlpha("#3E6B1A", 0.4)})`, animation: "chHop 620ms ease-in-out infinite" }}>
                <DinoSprite />
              </div>
              <div style={{ fontSize: 50, fontWeight: 900, color: baseTheme.text, fontFamily: fontDisplay, letterSpacing: -1.5, lineHeight: 1 }}>
                CHOMP
              </div>
            </div>
          }
          preview={
            <div style={{
              display: "flex", gap: 10, background: baseTheme.panelBg, borderRadius: 16,
              padding: "12px 14px", border: `1px solid ${baseTheme.border}`,
              boxShadow: "0 4px 16px rgba(24,23,29,0.08)",
            }}>
              {[
                { el: <FoodSprite />, label: "Eat" },
                { el: <TreeSprite seed={2} />, label: "Blocks" },
                { el: <PondSprite seed={1} />, label: "Drowns" },
                { el: <RexSprite />, label: "Eats you" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 54 }}>
                  <div style={{ width: 32, height: 32 }}>{item.el}</div>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.03em", color: baseTheme.textMuted, textAlign: "center" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          }
          description="Your dino never stops running — you only point it. Graze the clearing and keep the T-Rex behind you. He leaves the board. He comes back somewhere else."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {/* ── GAME OVER ── */}
      {phase === "dead" && view && (
        <GameOverCard accent={LIME} title={deathTitle} score={view.score} best={best} onRetry={startGame} />
      )}

      {/* ── SETTINGS ── */}
      {phase === "settings" && (
        <SettingsScreen
          accent={LIME}
          onBack={() => setPhase("start")}
          onResetProgress={() => { bestStore.resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes chHop {
          0%, 100% { translate: 0 0; }
          50%      { translate: 0 -7%; }
        }
        @keyframes chBump {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.18, 0.8); }
          100% { transform: scale(1); }
        }
        @keyframes chSteer {
          0%   { opacity: 0; scale: 0.6; }
          35%  { opacity: 1; scale: 1.08; }
          100% { opacity: 0; scale: 1.2; }
        }
        @keyframes chPrint {
          0%   { opacity: 0.9; }
          60%  { opacity: 0.55; }
          100% { opacity: 0; }
        }
        @keyframes chFoodHalo {
          0%   { opacity: 0.6; transform: scale(0.7); }
          70%  { opacity: 0;   transform: scale(1.5); }
          100% { opacity: 0;   transform: scale(1.5); }
        }
        @keyframes chFoodPop {
          0%   { opacity: 0; transform: scale(0) rotate(-40deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes chFoodBob {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50%      { transform: translateY(-8%) rotate(3deg); }
        }
        @keyframes chRipple {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        @keyframes chIncoming {
          0%   { opacity: 0.9; transform: scale(0.5); }
          100% { opacity: 0;   transform: scale(1.15); }
        }
        @keyframes chGhostPulse {
          from { opacity: 0.6; transform: scale(0.9); }
          to   { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes chRexLand {
          0%   { opacity: 0; transform: scale(0.3) translateY(-40%); }
          70%  { opacity: 1; transform: scale(1.16) translateY(4%); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes chBanner {
          from { transform: scale(1)    rotate(-1.2deg); }
          to   { transform: scale(1.07) rotate(1.2deg); }
        }
        @keyframes chRing {
          0%   { opacity: 0.9; transform: scale(0.35); }
          100% { opacity: 0;   transform: scale(1.8); }
        }
        @keyframes chShard {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--ch-dx)), calc(-50% + var(--ch-dy))) scale(0.25); }
        }
        @keyframes chFlashUp {
          0%   { opacity: 0; transform: translate(-50%, -90%) scale(0.7); }
          25%  { opacity: 1; transform: translate(-50%, -170%) scale(1.15); }
          100% { opacity: 0; transform: translate(-50%, -270%) scale(1); }
        }
        @keyframes chShake {
          10%, 90% { transform: translate(-2px, 1px) rotate(-0.4deg); }
          20%, 80% { transform: translate(4px, -2px) rotate(0.6deg); }
          30%, 50%, 70% { transform: translate(-6px, 2px) rotate(-0.8deg); }
          40%, 60% { transform: translate(6px, -1px) rotate(0.8deg); }
        }
        @keyframes chDeathWash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
