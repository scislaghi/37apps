import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import { animated } from "@react-spring/web";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, ACCENTS } from "@37apps/core/theme.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { useScorePop } from "@37apps/core/animation.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

/* ── board sizes ──────────────────────────────────────────────────────────
   Two boards, picked before the round starts. The rules are identical; only
   the starting enemy count and the bonus-spawn cadence are tuned per size,
   because 3 enemies plus an extra spawn every 5 captures (the 7×7 numbers)
   floods a 5×5 board faster than anyone can clear it. Each size keeps its
   own best score — they're different games to be good at.                  */
const SIZES = {
  5: { label: "5 × 5", tag: "Tight", startEnemies: 2, bonusEvery: 6 },
  7: { label: "7 × 7", tag: "Classic", startEnemies: 3, bonusEvery: 5 },
};
const SIZE_KEYS = [5, 7];
const DEFAULT_SIZE = 7;

const bestStores = {
  5: createBestScoreStore("pounce.best.5"),
  7: createBestScoreStore("pounce.best.7"),
};
const sizeStore = createBestScoreStore("pounce.boardSize");

/* ── piece types ──────────────────────────────────────────────────────────
   A type is just the set of directions it slides along, and every piece is
   drawn from that same set (see ANGLES / PieceToken) — so a piece's outline
   IS its move set. A Slider is a horizontal double-arrow, a Blade is an X,
   a Star is an eight-point burst. Colour and face are secondary cues.      */
const PLAYER_TYPE = "omni";
const TYPES = ["ortho", "horiz", "vert", "diag", "omni"];

const DIRS = {
  ortho: [[0, 1], [0, -1], [1, 0], [-1, 0]],
  horiz: [[0, 1], [0, -1]],
  vert: [[1, 0], [-1, 0]],
  diag: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  omni: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

/** Blade angles in degrees (0 = up, clockwise) — must mirror DIRS exactly. */
const ANGLES = {
  ortho: [0, 90, 180, 270],
  horiz: [90, 270],
  vert: [0, 180],
  diag: [45, 135, 225, 315],
  omni: [0, 45, 90, 135, 180, 225, 270, 315],
};

const TYPE_NAME = { ortho: "Cross", horiz: "Slider", vert: "Riser", diag: "Blade", omni: "Star" };
const TYPE_COLOR = {
  ortho: ACCENTS[5], // blue
  horiz: ACCENTS[1], // orange
  vert: ACCENTS[4],  // cyan
  diag: ACCENTS[7],  // pink
  omni: ACCENTS[0],  // red — moves like you do, so it's the scariest one
};

const PLAYER_COLOR = ACCENTS[6]; // violet — the game's accent, worn only by you

const SLIDE_MS = 260;
const TELEGRAPH_MS = 360;
const DEATH_BEAT_MS = 820; // board holds the death frame before the card covers it
const TIMER_START = 30;
const TIMER_CAP = 35;

/* ── helpers ── */
function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function chebyshev(a, b) { return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)); }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ── reachability (sliding, blocked by pieces) ── */
function getReachable(r, c, type, blockers, n) {
  const moves = [];
  for (const [dr, dc] of DIRS[type]) {
    for (let i = 1; i <= n; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) break;
      moves.push({ row: nr, col: nc });
      if (blockers.some(b => b.row === nr && b.col === nc)) break;
    }
  }
  return moves;
}

let idCounter = 1;

/** Spawns a new enemy somewhere it can NOT immediately reach the player's square. */
function spawnEnemySafe(player, enemies, n) {
  const occ = [player, ...enemies];
  const cands = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (occ.some(p => p.row === r && p.col === c)) continue;
      if (Math.abs(r - player.row) + Math.abs(c - player.col) < 2) continue;
      cands.push({ row: r, col: c });
    }
  for (const pos of shuffle(cands)) {
    for (const type of shuffle(TYPES)) {
      const reach = getReachable(pos.row, pos.col, type, occ, n);
      const threatens = reach.some(sq => sq.row === player.row && sq.col === player.col);
      if (!threatens) return { ...pos, type, id: idCounter++ };
    }
  }
  return null;
}

/** Picks the enemy nearest to the player that has a legal move, and its best chase move. */
function planEnemyTurn(enemies, player, n) {
  const blockers = [player, ...enemies];
  const byDistance = [...enemies].sort((a, b) => chebyshev(a, player) - chebyshev(b, player));
  for (const en of byDistance) {
    const options = getReachable(en.row, en.col, en.type, blockers, n);
    if (!options.length) continue;
    let bestDist = Infinity, ties = [];
    for (const opt of options) {
      const d = chebyshev(opt, player);
      if (d < bestDist) { bestDist = d; ties = [opt]; }
      else if (d === bestDist) ties.push(opt);
    }
    const to = ties[Math.floor(Math.random() * ties.length)];
    return { id: en.id, to };
  }
  return null;
}

/* ── the piece ────────────────────────────────────────────────────────────
   Drawn in two passes over the same blade shapes: a fat-stroked rim pass
   whose union forms the outline (internal seams and all), then the real
   fills on top, which cover those seams. Cheaper and crisper than unioning
   the paths by hand, and it keeps every type a single clean silhouette.    */
const BLADE = "M39,40 L61,40 L50,3 Z";
const CORE_R = 21;

function PieceToken({ type, player = false, size = "100%" }) {
  const uid = useId().replace(/:/g, "");
  const angles = ANGLES[type] || [];
  const color = player ? PLAYER_COLOR : TYPE_COLOR[type];

  const bodyTop = player ? "#B491FF" : "#4B4757";
  const bodyBot = player ? "#6822EE" : "#252230";
  const rim = player ? "#3D0FA8" : "#131019";
  const bladeHi = player ? "#EBE1FF" : withAlpha("#FFFFFF", 0.6);

  const blades = angles.map(a => <path key={a} d={BLADE} transform={`rotate(${a} 50 50)`} />);

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`pnBody${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bodyTop} />
          <stop offset="100%" stopColor={bodyBot} />
        </linearGradient>
        <linearGradient id={`pnBlade${uid}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={bladeHi} />
          <stop offset="55%" stopColor={color} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>

      {/* rim / outline pass */}
      <g fill={rim} stroke={rim} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round">
        {blades}
        <circle cx="50" cy="50" r={CORE_R} />
      </g>

      {/* blades — the colour lives on the arrows, i.e. on the moves */}
      <g fill={`url(#pnBlade${uid})`} stroke={color} strokeWidth="2.5" strokeLinejoin="round">
        {blades}
      </g>

      {/* body */}
      <circle cx="50" cy="50" r={CORE_R} fill={`url(#pnBody${uid})`} />
      <path
        d="M34.4,41 A18,18 0 0 1 65.6,41"
        fill="none" stroke={withAlpha("#FFFFFF", player ? 0.5 : 0.22)} strokeWidth="3" strokeLinecap="round"
      />

      {/* face — the player looks alert, the hunters glare */}
      {player ? (
        <>
          <ellipse cx="42" cy="51" rx="5.4" ry="6.4" fill="#FFFFFF" />
          <ellipse cx="58" cy="51" rx="5.4" ry="6.4" fill="#FFFFFF" />
          <circle cx="43.2" cy="52.2" r="3.1" fill="#2B0B70" />
          <circle cx="59.2" cy="52.2" r="3.1" fill="#2B0B70" />
          <circle cx="41.2" cy="49.6" r="1.4" fill="#FFFFFF" />
          <circle cx="57.2" cy="49.6" r="1.4" fill="#FFFFFF" />
        </>
      ) : (
        <>
          <ellipse cx="42" cy="52.5" rx="4.8" ry="5.4" fill={color} />
          <ellipse cx="58" cy="52.5" rx="4.8" ry="5.4" fill={color} />
          <path d="M36,45 L47,48" stroke={rim} strokeWidth="4.6" strokeLinecap="round" />
          <path d="M64,45 L53,48" stroke={rim} strokeWidth="4.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/* ── board-size segmented control (start screen) ──
   stopPropagation matters here: the screen root starts a round on any tap,
   so without it, picking a size would also launch the game. */
function SizePicker({ value, onChange, bests }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {SIZE_KEYS.map(k => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onChange(k); }}
            style={{
              flex: 1, minWidth: 104, padding: "11px 10px 10px", cursor: "pointer",
              borderRadius: 16, fontFamily: fontUI,
              border: `2px solid ${active ? PLAYER_COLOR : baseTheme.border}`,
              background: active ? withAlpha(PLAYER_COLOR, 0.09) : baseTheme.panelBg,
              boxShadow: active ? `0 4px 14px ${withAlpha(PLAYER_COLOR, 0.22)}` : "none",
              transform: active ? "translateY(-1px)" : "none",
              transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.18s",
            }}
          >
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 20, lineHeight: 1.1,
              color: active ? PLAYER_COLOR : baseTheme.text,
            }}>
              {SIZES[k].label}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase",
              color: baseTheme.textMuted, marginTop: 3,
            }}>
              {SIZES[k].tag}
            </div>
            <div style={{ fontSize: 10, color: baseTheme.textMuted, marginTop: 5, opacity: bests[k] > 0 ? 1 : 0.45 }}>
              best · {bests[k] || 0}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Pounce() {
  const [phase, setPhase] = useState("start"); // start | play | dying | dead | settings
  const [boardSize, setBoardSize] = useState(DEFAULT_SIZE);
  const [player, setPlayer] = useState({ row: 3, col: 3 });
  const [enemies, setEnemies] = useState([]);
  const [score, setScore] = useState(0);
  const [bests, setBests] = useState({ 5: 0, 7: 0 });
  const [timer, setTimer] = useState(TIMER_START);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { id, to } — telegraphed enemy move
  const [deniedCell, setDeniedCell] = useState(null);
  const [trappedWarning, setTrappedWarning] = useState(false);
  const [deathReason, setDeathReason] = useState(null); // 'timeout' | 'caught' | 'trapped'
  const [trails, setTrails] = useState([]); // fading streaks along a move path
  const [bursts, setBursts] = useState([]); // capture / death particle bursts
  const [shake, setShake] = useState(false);

  const timerRef = useRef(null);
  const pendingTimeoutsRef = useRef([]);
  const bestLoadedRef = useRef(false);
  const endingRef = useRef(false);
  /* the timer effect intentionally only re-subscribes on `phase`, so anything
     it reads at tick time has to come from a ref, not from its closure —
     otherwise a timeout death banks the score from when the round started. */
  const scoreRef = useRef(0);
  const sizeRef = useRef(DEFAULT_SIZE);

  const N = boardSize;
  const cfg = SIZES[N];
  const best = bests[N] || 0;
  const scorePop = useScorePop(score);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { sizeRef.current = boardSize; }, [boardSize]);

  const clearPendingTimeouts = useCallback(() => {
    pendingTimeoutsRef.current.forEach(clearTimeout);
    pendingTimeoutsRef.current = [];
  }, []);

  /** setTimeout that a restart or unmount cancels. */
  const later = useCallback((fn, ms) => {
    pendingTimeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => clearPendingTimeouts(), [clearPendingTimeouts]);

  /* ── transient effects ── */
  const addTrail = useCallback((from, to, color) => {
    const id = `t${idCounter++}`;
    setTrails(ts => [...ts, { id, from, to, color }]);
    later(() => setTrails(ts => ts.filter(t => t.id !== id)), 460);
  }, [later]);

  const addBurst = useCallback((row, col, color, { label = null, count = 10, spread = 34 } = {}) => {
    const id = `b${idCounter++}`;
    const shards = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = spread * (0.6 + Math.random() * 0.7);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: 4 + Math.random() * 4 };
    });
    setBursts(bs => [...bs, { id, row, col, color, label, shards }]);
    later(() => setBursts(bs => bs.filter(b => b.id !== id)), 780);
  }, [later]);

  /* ── game over: called from all three death paths (timeout, trapped, caught).
     Holds a "dying" beat first so the death actually reads on the board — the
     game-over card is opaque and full-screen, so anything animated under it
     would otherwise never be seen. The interstitial fires once, at the end of
     that beat, so it never covers the death frame either.                   */
  const endGame = useCallback((reason) => {
    /* the interval can tick once more between "time's up" and the phase state
       actually flipping, so the whole path has to be idempotent per round. */
    if (endingRef.current) return;
    endingRef.current = true;

    const finalScore = scoreRef.current;
    const size = sizeRef.current;
    setDeathReason(reason);
    setPhase("dying");
    setShake(true);
    vibrate(reason === "timeout" ? 60 : [0, 45, 60, 90]);
    later(() => setShake(false), 520);
    later(() => {
      setBests(b => ({ ...b, [size]: Math.max(b[size] || 0, finalScore) }));
      setPhase("dead");
      showInterstitial(AD_IDS);
    }, DEATH_BEAT_MS);
  }, [later]);

  /* ── ads + audio: init once on mount ── */
  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
    initHaptics();
  }, []);

  /* ── best scores + last board size: load once on mount, persist after that ── */
  useEffect(() => {
    Promise.all([
      bestStores[5].loadBestScore(),
      bestStores[7].loadBestScore(),
      sizeStore.loadBestScore(),
    ]).then(([b5, b7, storedSize]) => {
      setBests({ 5: b5, 7: b7 });
      if (SIZE_KEYS.includes(storedSize)) setBoardSize(storedSize);
      bestLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!bestLoadedRef.current) return;
    bestStores[5].saveBestScore(bests[5]);
    bestStores[7].saveBestScore(bests[7]);
  }, [bests]);

  const pickSize = useCallback((k) => {
    setBoardSize(k);
    sizeStore.saveBestScore(k);
    sfx.select();
  }, []);

  /* ── player's legal squares this turn (no visual hints — used only for validation) ── */
  const reachable = useMemo(() => {
    if (phase !== "play") return [];
    return getReachable(player.row, player.col, PLAYER_TYPE, [player, ...enemies], N);
  }, [player, enemies, phase, N]);

  /* ── timer ── */
  useEffect(() => {
    if (phase !== "play") { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 0.1) {
          endGame("timeout");
          return 0;
        }
        return +(t - 0.1).toFixed(1);
      });
    }, 100);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ── trapped check: no legal moves left at all ── */
  useEffect(() => {
    if (phase !== "play" || busy) return;
    if (reachable.length === 0 && enemies.length > 0) {
      setBusy(true);
      setTrappedWarning(true);
      const t = setTimeout(() => {
        setTrappedWarning(false);
        addBurst(player.row, player.col, PLAYER_COLOR, { count: 12, spread: 42 });
        endGame("trapped");
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [reachable, enemies, phase, busy, score, endGame, N, player, addBurst]);

  /* ── start / restart ── */
  const startGame = useCallback(() => {
    clearPendingTimeouts();

    const mid = Math.floor(N / 2);
    const p = { row: mid, col: mid };
    const e = [];
    for (let i = 0; i < cfg.startEnemies; i++) { const en = spawnEnemySafe(p, e, N); if (en) e.push(en); }
    setPlayer(p);
    setEnemies(e);
    setScore(0);
    setTimer(TIMER_START);
    setBusy(false);
    setPendingAction(null);
    setDeniedCell(null);
    setTrappedWarning(false);
    setDeathReason(null);
    setTrails([]);
    setBursts([]);
    setShake(false);
    endingRef.current = false;
    setPhase("play");
  }, [clearPendingTimeouts, N, cfg.startEnemies]);

  /* ── enemy turn: telegraph → move → check capture-of-player ── */
  const runEnemyTurn = useCallback((currentEnemies, currentPlayer) => {
    const action = planEnemyTurn(currentEnemies, currentPlayer, N);
    if (!action) { setBusy(false); return; }

    setPendingAction(action);
    later(() => {
      sfx.shift();
      const mover = currentEnemies.find(e => e.id === action.id);
      if (mover) addTrail({ row: mover.row, col: mover.col }, action.to, TYPE_COLOR[mover.type]);
      setEnemies(es => es.map(e => (e.id === action.id ? { ...e, row: action.to.row, col: action.to.col } : e)));
      setPendingAction(null);

      later(() => {
        if (action.to.row === currentPlayer.row && action.to.col === currentPlayer.col) {
          sfx.hit();
          addBurst(currentPlayer.row, currentPlayer.col, PLAYER_COLOR, { count: 14, spread: 46 });
          endGame("caught");
        } else {
          setBusy(false);
        }
      }, SLIDE_MS);
    }, TELEGRAPH_MS);
  }, [endGame, N, later, addTrail, addBurst]);

  /* ── handle a tap ── */
  const handleTap = useCallback((row, col) => {
    if (phase !== "play" || busy) return;

    const move = reachable.find(m => m.row === row && m.col === col);
    if (!move) {
      sfx.select();
      setDeniedCell({ row, col, id: idCounter++ });
      later(() => setDeniedCell(null), 380);
      return;
    }

    setBusy(true);
    const from = { row: player.row, col: player.col };
    const newP = { row, col };
    const capturedEnemy = enemies.find(e => e.row === row && e.col === col);
    addTrail(from, newP, PLAYER_COLOR);

    if (capturedEnemy) {
      const remaining = enemies.filter(e => e.id !== capturedEnemy.id);
      const ns = score + 1;
      setScore(ns);
      setTimer(t => Math.min(TIMER_CAP, +(t + 2).toFixed(1)));
      sfx.score();
      vibrate(25);
      addBurst(row, col, TYPE_COLOR[capturedEnemy.type], { label: "+2s" });

      const toSpawn = 1 + (ns % cfg.bonusEvery === 0 ? 1 : 0);
      const spawned = [...remaining];
      for (let i = 0; i < toSpawn; i++) {
        const en = spawnEnemySafe(newP, spawned, N);
        if (en) spawned.push(en);
      }
      setEnemies(spawned);
      setPlayer(newP);
      runEnemyTurn(spawned, newP);
    } else {
      sfx.tap();
      setPlayer(newP);
      runEnemyTurn(enemies, newP);
    }
  }, [phase, busy, reachable, enemies, score, player, runEnemyTurn, N, cfg.bonusEvery, addTrail, addBurst, later]);

  /* ── layout ──
     Both boards land at roughly the same on-screen footprint, so switching
     5×5 ⇄ 7×7 changes the piece scale, not the size of the playfield. */
  const cellSize = `min(${(420 / N).toFixed(2)}px, ${(86 / N).toFixed(2)}vw)`;
  const boardPx = `calc(${cellSize} * ${N})`;
  const cellPct = 100 / N;
  const centerPct = (i) => (i + 0.5) * cellPct;

  const onBoard = phase === "play" || phase === "dying";
  const danger = onBoard && timer < 8; // stays lit through the death beat
  const timerPct = Math.max(0, Math.min(1, timer / TIMER_CAP));
  const telegraphEnemy = pendingAction ? enemies.find(e => e.id === pendingAction.id) : null;
  const telegraphLethal = !!pendingAction && pendingAction.to.row === player.row && pendingAction.to.col === player.col;
  const telegraphColor = telegraphEnemy ? (telegraphLethal ? ACCENTS[0] : TYPE_COLOR[telegraphEnemy.type]) : ACCENTS[0];

  const deathTitle = deathReason === "timeout" ? "Time's up!" : deathReason === "caught" ? "Pounced on!" : "Trapped!";

  /** a bar from cell A's centre to cell B's centre, rotated into place */
  const lineStyle = (from, to, thickness) => {
    const ax = centerPct(from.col), ay = centerPct(from.row);
    const dx = centerPct(to.col) - ax, dy = centerPct(to.row) - ay;
    return {
      position: "absolute", left: `${ax}%`, top: `${ay}%`,
      width: `${Math.hypot(dx, dy)}%`, height: thickness,
      marginTop: `calc(${thickness} / -2)`,
      transformOrigin: "0 50%",
      transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`,
      borderRadius: 99, pointerEvents: "none",
    };
  };

  return (
    <div
      onPointerDown={() => { if (phase === "start" || phase === "dead") startGame(); }}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, ${baseTheme.bg} 58%, #EFEAE1 100%)`,
        fontFamily: fontUI, userSelect: "none", WebkitUserSelect: "none", padding: 12,
      }}
    >
      {/* ── header ── */}
      {onBoard && (
        <div style={{ width: boardPx, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
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
                {score}
              </animated.span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: baseTheme.textMuted,
                border: `1px solid ${baseTheme.border}`, borderRadius: 99, padding: "3px 7px",
              }}>
                {cfg.label}
              </span>
            </div>
            <span style={{
              fontSize: 30, fontWeight: 900, fontFamily: fontDisplay, lineHeight: 1,
              color: danger ? ACCENTS[0] : baseTheme.text,
              fontVariantNumeric: "tabular-nums",
              animation: danger ? "pnPanic 0.55s ease-in-out infinite" : "none",
            }}>
              {timer.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 800 }}>s</span>
            </span>
          </div>

          <div style={{ height: 8, borderRadius: 99, background: "rgba(24,23,29,0.08)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${timerPct * 100}%`,
              background: danger
                ? `linear-gradient(90deg, ${ACCENTS[1]}, ${ACCENTS[0]})`
                : `linear-gradient(90deg, ${ACCENTS[6]}, ${ACCENTS[4]})`,
              boxShadow: `0 0 10px ${withAlpha(danger ? ACCENTS[0] : ACCENTS[6], 0.5)}`,
              transition: "width 0.1s linear, background 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* ── board ── */}
      <div style={{ animation: shake ? "pnShake 0.5s cubic-bezier(.36,.07,.19,.97)" : "none" }}>
        <div style={{
          "--pn-cell": cellSize,
          position: "relative",
          width: boardPx, height: boardPx,
          borderRadius: 22, padding: 6,
          background: "linear-gradient(160deg, #FFFFFF 0%, #EFE9DE 100%)",
          border: `1px solid ${danger ? withAlpha(ACCENTS[0], 0.5) : baseTheme.border}`,
          boxShadow: danger
            ? `0 12px 34px rgba(24,23,29,0.16), 0 0 0 4px ${withAlpha(ACCENTS[0], 0.13)}`
            : `0 12px 34px rgba(24,23,29,0.16), 0 0 0 4px ${withAlpha(PLAYER_COLOR, 0.07)}`,
          transition: "box-shadow 0.3s, border-color 0.3s",
        }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 16, overflow: "hidden" }}>

            {/* cells — tap targets only, deliberately hint-free */}
            <div style={{
              position: "absolute", inset: 0, display: "grid",
              gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)`,
            }}>
              {Array.from({ length: N * N }).map((_, i) => {
                const row = Math.floor(i / N), col = i % N;
                const isLight = (row + col) % 2 === 0;
                const isDenied = deniedCell && deniedCell.row === row && deniedCell.col === col;
                return (
                  <div
                    key={i}
                    onClick={() => handleTap(row, col)}
                    style={{
                      position: "relative",
                      background: isLight ? "#FDFCFA" : "#EDE7DC",
                      cursor: phase === "play" ? "pointer" : "default",
                    }}
                  >
                    <div style={{
                      position: "absolute", left: "50%", top: "50%", width: 3, height: 3,
                      marginLeft: -1.5, marginTop: -1.5, borderRadius: "50%",
                      background: "rgba(24,23,29,0.07)",
                    }} />
                    {isDenied && (
                      <div key={deniedCell.id} style={{
                        position: "absolute", inset: 0, background: withAlpha(ACCENTS[0], 0.2),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        animation: "pnDenied 0.38s ease-in-out forwards", pointerEvents: "none",
                      }}>
                        <svg viewBox="0 0 24 24" width="34%" height="34%" fill="none"
                          stroke={ACCENTS[0]} strokeWidth="4" strokeLinecap="round">
                          <path d="M6 6 L18 18 M18 6 L6 18" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* inner shading — depth without touching readability */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              boxShadow: "inset 0 2px 6px rgba(24,23,29,0.10), inset 0 -14px 26px rgba(24,23,29,0.06)",
            }} />

            {onBoard && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>

                {/* move trails */}
                {trails.map(t => (
                  <div key={t.id} style={{
                    ...lineStyle(t.from, t.to, "calc(var(--pn-cell) * 0.2)"),
                    background: `linear-gradient(90deg, ${withAlpha(t.color, 0)} 0%, ${withAlpha(t.color, 0.5)} 100%)`,
                    animation: "pnTrail 0.46s ease-out forwards",
                    zIndex: 1,
                  }} />
                ))}

                {/* telegraph: beam + ghost showing exactly where it's about to land */}
                {pendingAction && telegraphEnemy && (
                  <>
                    <div style={{
                      ...lineStyle(telegraphEnemy, pendingAction.to, "calc(var(--pn-cell) * 0.13)"),
                      background: `linear-gradient(90deg, ${withAlpha(telegraphColor, 0.12)} 0%, ${withAlpha(telegraphColor, 0.7)} 100%)`,
                      animation: "pnBeam 0.36s ease-out forwards",
                      zIndex: 2,
                    }} />
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: `${cellPct}%`, height: `${cellPct}%`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transform: `translate(${pendingAction.to.col * 100}%, ${pendingAction.to.row * 100}%)`,
                      zIndex: 2,
                    }}>
                      <div style={{
                        position: "absolute", inset: "9%", borderRadius: 12,
                        border: `2px dashed ${telegraphColor}`,
                        background: withAlpha(telegraphColor, 0.13),
                        animation: "pnGhostPulse 0.36s ease-in-out infinite alternate",
                      }} />
                      <div style={{ width: "58%", height: "58%", opacity: 0.45 }}>
                        <PieceToken type={telegraphEnemy.type} />
                      </div>
                    </div>
                  </>
                )}

                {/* enemies */}
                {enemies.map(en => {
                  const isTelegraph = pendingAction && pendingAction.id === en.id;
                  return (
                    <div key={en.id} style={{
                      position: "absolute", top: 0, left: 0,
                      width: `${cellPct}%`, height: `${cellPct}%`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transform: `translate(${en.col * 100}%, ${en.row * 100}%)`,
                      transition: `transform ${SLIDE_MS}ms cubic-bezier(0.34,1.15,0.64,1)`,
                      zIndex: isTelegraph ? 4 : 3,
                    }}>
                      <div style={{
                        width: "74%", height: "74%",
                        filter: `drop-shadow(0 3px 4px rgba(24,23,29,0.28))${isTelegraph ? ` drop-shadow(0 0 7px ${withAlpha(telegraphColor, 0.9)})` : ""}`,
                        animation: isTelegraph
                          ? "pnWindUp 0.36s ease-in-out infinite alternate"
                          : "pnSpawn 0.42s cubic-bezier(0.34,1.56,0.64,1)",
                      }}>
                        <PieceToken type={en.type} />
                      </div>
                    </div>
                  );
                })}

                {/* player */}
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: `${cellPct}%`, height: `${cellPct}%`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transform: `translate(${player.col * 100}%, ${player.row * 100}%)`,
                  transition: `transform ${SLIDE_MS}ms cubic-bezier(0.34,1.15,0.64,1)`,
                  zIndex: 5,
                  opacity: phase === "dying" && deathReason !== "timeout" ? 0 : 1,
                }}>
                  <div style={{
                    position: "absolute", width: "76%", height: "76%", borderRadius: "50%",
                    background: withAlpha(PLAYER_COLOR, 0.18),
                    animation: "pnHalo 1.9s ease-out infinite",
                  }} />
                  <div style={{
                    width: "82%", height: "82%",
                    filter: `drop-shadow(0 3px 8px ${withAlpha(PLAYER_COLOR, 0.5)})`,
                    animation: trappedWarning
                      ? "pnPanicPiece 0.28s ease-in-out infinite"
                      : "pnBreathe 1.7s ease-in-out infinite",
                  }}>
                    <PieceToken type={PLAYER_TYPE} player />
                  </div>
                </div>

                {/* capture / death bursts */}
                {bursts.map(b => (
                  <div key={b.id} style={{
                    position: "absolute", left: `${centerPct(b.col)}%`, top: `${centerPct(b.row)}%`,
                    width: 0, height: 0, zIndex: 9,
                  }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0,
                      width: "var(--pn-cell)", height: "var(--pn-cell)",
                      marginLeft: "calc(var(--pn-cell) / -2)", marginTop: "calc(var(--pn-cell) / -2)",
                      borderRadius: "50%", border: `3px solid ${withAlpha(b.color, 0.75)}`,
                      animation: "pnRing 0.55s cubic-bezier(0.2,0.8,0.3,1) forwards",
                    }} />
                    {b.shards.map((s, i) => (
                      <div key={i} style={{
                        position: "absolute", left: 0, top: 0,
                        width: s.size, height: s.size, borderRadius: "50%", background: b.color,
                        "--pn-dx": `${s.dx}px`, "--pn-dy": `${s.dy}px`,
                        animation: "pnShard 0.6s cubic-bezier(0.15,0.7,0.3,1) forwards",
                      }} />
                    ))}
                    {b.label && (
                      <span style={{
                        position: "absolute", left: 0, top: 0, whiteSpace: "nowrap",
                        fontSize: 15, fontWeight: 900, fontFamily: fontDisplay,
                        color: "#17D39B", textShadow: "0 1px 3px rgba(255,255,255,0.9)",
                        animation: "pnFlashUp 0.75s ease-out forwards",
                      }}>
                        {b.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* death wash */}
            {phase === "dying" && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8,
                background: `radial-gradient(circle at center, transparent 30%, ${withAlpha(ACCENTS[0], 0.34)} 100%)`,
                animation: "pnDeathWash 0.8s ease-out forwards",
              }} />
            )}
          </div>
        </div>
      </div>

      {/* ── trapped warning ── */}
      {trappedWarning && (
        <div style={{
          marginTop: 14, padding: "10px 22px", borderRadius: 99,
          background: withAlpha(ACCENTS[0], 0.12), color: ACCENTS[0],
          fontSize: 14, fontWeight: 800, letterSpacing: "0.02em",
          animation: "pnPanic 0.5s ease-in-out infinite",
        }}>
          No moves left!
        </div>
      )}

      {/* ── START SCREEN ── */}
      {phase === "start" && (
        <StartScreen
          accent={PLAYER_COLOR}
          title={
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: 48, height: 48, filter: `drop-shadow(0 4px 12px ${withAlpha(PLAYER_COLOR, 0.45)})` }}>
                <PieceToken type={PLAYER_TYPE} player />
              </div>
              <div style={{ fontSize: 46, fontWeight: 900, color: baseTheme.text, fontFamily: fontDisplay, letterSpacing: -1, lineHeight: 1 }}>
                POUNCE
              </div>
            </div>
          }
          preview={
            <div style={{ display: "flex", flexDirection: "column", gap: 11, minWidth: 244 }}>
              <SizePicker value={boardSize} onChange={pickSize} bests={bests} />
              <div style={{
                background: baseTheme.panelBg, borderRadius: 16, padding: "12px 14px",
                border: `1px solid ${baseTheme.border}`,
                boxShadow: "0 4px 16px rgba(24,23,29,0.08)",
                display: "flex", flexDirection: "column", gap: 7,
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: baseTheme.textMuted, marginBottom: 1,
                }}>
                  The arrows are the moves
                </div>
                {/* one row, no prose: the blades already say which way each
                    piece slides, and five labelled rows pushed the Settings
                    button off the bottom of a 667pt phone. */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                  {TYPES.map(t => (
                    <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
                      <div style={{ width: 29, height: 29 }}>
                        <PieceToken type={t} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: baseTheme.textMuted, letterSpacing: "0.02em" }}>
                        {TYPE_NAME[t]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
          description="Capture what you can before the clock dies. Every move you make, the nearest hunter takes one back."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {/* ── GAME OVER ── */}
      {phase === "dead" && (
        <GameOverCard accent={PLAYER_COLOR} title={deathTitle} score={score} best={best} onRetry={startGame} />
      )}

      {/* ── SETTINGS ── */}
      {phase === "settings" && (
        <SettingsScreen
          accent={PLAYER_COLOR}
          onBack={() => setPhase("start")}
          onResetProgress={() => {
            bestStores[5].resetBestScore();
            bestStores[7].resetBestScore();
            setBests({ 5: 0, 7: 0 });
          }}
        />
      )}

      {/* game-specific keyframes (start/retry pulse comes from the shared components) */}
      <style>{`
        @keyframes pnTrail {
          0%   { opacity: 0.95; }
          100% { opacity: 0; }
        }
        @keyframes pnBeam {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes pnGhostPulse {
          from { opacity: 0.55; transform: scale(0.94); }
          to   { opacity: 1;    transform: scale(1.02); }
        }
        @keyframes pnWindUp {
          from { transform: scale(1) rotate(-2deg); }
          to   { transform: scale(1.16) rotate(2deg); }
        }
        @keyframes pnSpawn {
          0%   { opacity: 0; transform: scale(0) rotate(-90deg); }
          70%  { opacity: 1; transform: scale(1.14) rotate(6deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes pnBreathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes pnPanicPiece {
          0%, 100% { transform: translateX(-2px) scale(1.02); }
          50%      { transform: translateX(2px) scale(1.02); }
        }
        @keyframes pnHalo {
          0%   { opacity: 0.55; transform: scale(0.85); }
          70%  { opacity: 0;    transform: scale(1.9); }
          100% { opacity: 0;    transform: scale(1.9); }
        }
        @keyframes pnRing {
          0%   { opacity: 0.9; transform: scale(0.35); }
          100% { opacity: 0;   transform: scale(1.75); }
        }
        @keyframes pnShard {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--pn-dx)), calc(-50% + var(--pn-dy))) scale(0.25); }
        }
        /* clears the token it spawns under before it fades, so the reward
           never reads as a smudge behind the piece */
        @keyframes pnFlashUp {
          0%   { opacity: 0; transform: translate(-50%, -90%) scale(0.7); }
          25%  { opacity: 1; transform: translate(-50%, -165%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -265%) scale(1); }
        }
        @keyframes pnDenied {
          0%   { transform: translateX(0); opacity: 1; }
          20%  { transform: translateX(-4px); }
          60%  { transform: translateX(4px); }
          100% { transform: translateX(0); opacity: 0; }
        }
        @keyframes pnShake {
          10%, 90% { transform: translate(-2px, 1px) rotate(-0.4deg); }
          20%, 80% { transform: translate(4px, -2px) rotate(0.6deg); }
          30%, 50%, 70% { transform: translate(-6px, 2px) rotate(-0.8deg); }
          40%, 60% { transform: translate(6px, -1px) rotate(0.8deg); }
        }
        @keyframes pnDeathWash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0.75; }
        }
        @keyframes pnPanic {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.07); }
        }
      `}</style>
    </div>
  );
}
