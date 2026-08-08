import { useState, useEffect, useCallback, useRef } from "react";
import { animated } from "@react-spring/web";
import { initAds, showInterstitial, showRewarded, isRewardedReady, isNativeAdPlatform } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, ACCENTS, SUCCESS } from "@37apps/core/theme.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { useScorePop } from "@37apps/core/animation.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

/* ── board sizes ──────────────────────────────────────────────────────────
   Two boards, picked before the round. Identical rules; only how many cells
   can be live at once and how fast they arrive is tuned per size, because a
   3×3 with the 5×5 spawn cadence is unreadable — nine tiles is a glance, but
   twenty-five is a scan, so the wide board gets more time per cell and more
   cells to hunt. Each size keeps its own best score.                        */
const SIZES = {
  3: { label: "3 × 3", tag: "Quick", startCells: 2, maxCells: 4, spawnFrom: 1.00, spawnTo: 0.45 },
  5: { label: "5 × 5", tag: "Wide",  startCells: 3, maxCells: 8, spawnFrom: 0.82, spawnTo: 0.33 },
};
const SIZE_KEYS = [3, 5];
const DEFAULT_SIZE = 3;

const bestStores = {
  3: createBestScoreStore("blip.best.3"),
  5: createBestScoreStore("blip.best.5"),
};
const sizeStore = createBestScoreStore("blip.boardSize");

/* ── cell kinds ───────────────────────────────────────────────────────────
   Three reads, and each one is a different *shape of attention*:
     plain — one tap, the baseline beat
     multi — a number: tap it that many times, so it holds you in one place
     fuse  — its own countdown: tap it once, but now, so it pulls you away
   Colour alone would not be enough on a board this fast, so each kind also
   owns a distinct interior (dot / numeral / depleting ring).               */
const KIND_COLOR = {
  plain: ACCENTS[4], // Cyan Arc — Blip's accent, worn by the ordinary cell
  multi: ACCENTS[6], // Violet Spark
  fuse: ACCENTS[1],  // Amber Pulse, burning toward Signal Coral
};
const FUSE_END_COLOR = ACCENTS[0];
const ACCENT = KIND_COLOR.plain;

const TIMER_START = 10;
/* the clock is capped so a hot streak banks skill as *score*, not as a
   stockpile of seconds that makes the next 30 seconds free. */
const TIMER_CAP = 14;
const CONTINUE_TIME = 6;

/* One fuse unit. The brief asked for a countdown that is visibly not seconds
   — at 90 ms a "30" is 2.7 s and a "10" is 0.9 s, which reads as a fuse
   racing rather than a second clock competing with the real one. */
const FUSE_TICK_MS = 90;
const FUSE_MIN = 10;
const FUSE_MAX = 30;

const DEATH_BEAT_MS = 780;

const TIME_MISS = -0.5;
const TIME_EXPIRE = -1.5;

/* ── helpers ── */
function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(a, b, t) {
  const pa = a.replace("#", ""), pb = b.replace("#", "");
  const ch = (p, i) => parseInt(p.slice(i * 2, i * 2 + 2), 16);
  const out = [0, 1, 2].map(i => Math.round(ch(pa, i) + (ch(pb, i) - ch(pa, i)) * t));
  return `#${out.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ── difficulty & the time economy ────────────────────────────────────────
   The clock only ever refills from cells, and cells only arrive at the spawn
   cadence — so the honest way to state the economy is *per spawn*, not per
   second. A plain cell is worth `interval × ratio`: above 1.0 the board pays
   for itself if you clear everything, below 1.0 it cannot, no matter how
   perfectly you play. The ratio crosses 1.0 around score 40, which is what
   makes the run finite instead of relying on the player eventually fumbling. */
function spawnIntervalFor(score, cfg) {
  const t = clamp01(score / 60);
  return cfg.spawnFrom + (cfg.spawnTo - cfg.spawnFrom) * t;
}
/* The floor is not a taste number — it is set so that *perfect* play at the
   hardest cadence still loses ground. Time supply per second is
   `(1 / interval) × interval × ratio × avgKindMultiplier` = `ratio × avgKind`,
   and at the top of the ramp the kind mix averages ≈1.3×, so anything above
   ~0.77 makes a fast enough player literally unkillable. A scripted 5 taps/s
   bot sat at a full clock for 200 s with the floor at 0.82. */
function gainRatioFor(score) {
  const t = clamp01(score / 70);
  return 1.45 + (0.65 - 1.45) * t;
}
function liveCapFor(score, cfg) {
  return Math.min(cfg.maxCells, cfg.startCells + Math.floor(score / 7));
}

/* Kinds unlock one at a time so the first ten seconds of a first run teach
   exactly one thing. */
function pickKind(score) {
  const fuseW = score < 8 ? 0 : Math.min(0.30, 0.10 + (score - 8) * 0.012);
  const multiW = score < 4 ? 0 : Math.min(0.32, 0.12 + (score - 4) * 0.012);
  const r = Math.random();
  if (r < fuseW) return "fuse";
  if (r < fuseW + multiW) return "multi";
  return "plain";
}
function multiHitsFor(score) {
  const span = Math.min(4, 1 + Math.floor(score / 10)); // 2 → 2..5
  return 2 + Math.floor(Math.random() * span);
}
function fuseUnitsFor(score) {
  const top = Math.max(FUSE_MIN + 4, FUSE_MAX - Math.min(16, score * 0.4));
  return Math.round(FUSE_MIN + Math.random() * (top - FUSE_MIN));
}

/** Time a cleared cell pays back, in seconds. */
function timeValue(cell, score, cfg) {
  const unit = spawnIntervalFor(score, cfg) * gainRatioFor(score);
  /* A multi is deliberately not worth its full hit count in seconds. It
     occupies one spawn slot, so paying `hits × unit` for it lets a fast
     player farm multis into a run that never ends — its extra value is
     score, not clock. */
  if (cell.kind === "multi") return unit * (1 + (cell.hits - 1) * 0.18);
  if (cell.kind === "fuse") return unit * 1.5; // the risk premium
  return unit;
}
/** Points a cleared cell is worth, before the streak multiplier. */
function pointValue(cell) {
  if (cell.kind === "multi") return cell.hits;
  if (cell.kind === "fuse") return 3;
  return 1;
}

/* The streak is a real multiplier, and it is capped. An uncapped per-clear
   bonus compounds — a scripted 25 s run reached ×29 and a score of 1918,
   which makes every earlier decision in the run worthless next to "don't
   miss for another ten seconds". ×4 is enough to make a clean streak feel
   like the thing worth protecting without erasing the rest of the run. */
const MAX_MULT = 4;
function multiplierFor(streak) {
  return 1 + Math.min(MAX_MULT - 1, Math.floor(streak / 5));
}

let uid = 1;

/* ── the cell ─────────────────────────────────────────────────────────────
   One component for all three kinds: same tile, same spawn pop, different
   interior. `frac` is only meaningful for a fuse (1 → 0 as it burns).      */
function CellToken({ cell, frac }) {
  const isFuse = cell.kind === "fuse";
  const color = isFuse ? mixHex(FUSE_END_COLOR, KIND_COLOR.fuse, frac) : KIND_COLOR[cell.kind];
  /* Discrete panic tiers rather than a duration computed from `frac`: this
     component re-renders every frame, and a duration that changes every
     frame restarts the CSS animation every frame, which shows up as a cell
     that vibrates in place instead of one that pulses faster. */
  const tier = frac > 0.55 ? 0 : frac > 0.28 ? 1 : 2;
  const idle = isFuse
    ? ["blFuseCalm 0.9s ease-in-out infinite", "blFuseWarn 0.5s ease-in-out infinite", "blFusePanic 0.26s ease-in-out infinite"][tier]
    : cell.kind === "multi"
      ? "blNudge 2.2s ease-in-out infinite"
      : "blBreathe 1.5s ease-in-out infinite";

  return (
    <div style={{
      position: "absolute", inset: 0,
      animation: "blSpawn 0.32s cubic-bezier(0.34,1.56,0.64,1) backwards",
      pointerEvents: "none",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        borderRadius: "calc(var(--bl-cell) * 0.22)",
        background: `linear-gradient(160deg, ${mixHex(color, "#FFFFFF", 0.28)} 0%, ${color} 55%, ${mixHex(color, "#000000", 0.16)} 100%)`,
        boxShadow: `0 4px 12px ${withAlpha(color, 0.42)}, inset 0 2px 0 ${withAlpha("#FFFFFF", 0.45)}, inset 0 -3px 0 ${withAlpha("#000000", 0.14)}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: idle,
      }}>
        {cell.kind === "plain" && (
          <>
            <div style={{
              position: "absolute", width: "34%", height: "34%", borderRadius: "50%",
              background: withAlpha("#FFFFFF", 0.92),
              boxShadow: `0 0 10px ${withAlpha("#FFFFFF", 0.7)}`,
            }} />
            <div style={{
              position: "absolute", width: "34%", height: "34%", borderRadius: "50%",
              border: `2px solid ${withAlpha("#FFFFFF", 0.85)}`,
              animation: "blPing 1.5s ease-out infinite",
            }} />
          </>
        )}

        {cell.kind === "multi" && (
          <span
            key={cell.hitsLeft}
            style={{
              fontFamily: fontDisplay, fontWeight: 900, color: "#FFFFFF",
              fontSize: "calc(var(--bl-cell) * 0.44)", lineHeight: 1,
              textShadow: `0 2px 4px ${withAlpha("#000000", 0.28)}`,
              animation: "blPunch 0.24s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {cell.hitsLeft}
          </span>
        )}

        {isFuse && (
          <>
            <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: "9%", transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="41" fill="none" stroke={withAlpha("#FFFFFF", 0.28)} strokeWidth="9" />
              <circle
                cx="50" cy="50" r="41" fill="none"
                stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 41}
                strokeDashoffset={2 * Math.PI * 41 * (1 - frac)}
              />
            </svg>
            <span style={{
              position: "relative",
              fontFamily: fontDisplay, fontWeight: 900, color: "#FFFFFF",
              fontSize: "calc(var(--bl-cell) * 0.34)", lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              textShadow: `0 2px 4px ${withAlpha("#000000", 0.3)}`,
            }}>
              {Math.max(1, Math.ceil(cell.fuse))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── board-size segmented control (start screen) ──
   stopPropagation matters: the screen root starts a round on any tap, so
   without it picking a size would also launch the game. */
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
              border: `2px solid ${active ? ACCENT : baseTheme.border}`,
              background: active ? withAlpha(ACCENT, 0.09) : baseTheme.panelBg,
              boxShadow: active ? `0 4px 14px ${withAlpha(ACCENT, 0.24)}` : "none",
              transform: active ? "translateY(-1px)" : "none",
              transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.18s",
            }}
          >
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 20, lineHeight: 1.1,
              color: active ? ACCENT : baseTheme.text,
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

/** Miniature of each cell kind for the menu legend — same interiors, no logic. */
function KindChip({ kind }) {
  const color = KIND_COLOR[kind];
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 9,
      background: `linear-gradient(160deg, ${mixHex(color, "#FFFFFF", 0.28)} 0%, ${color} 55%, ${mixHex(color, "#000000", 0.16)} 100%)`,
      boxShadow: `0 3px 8px ${withAlpha(color, 0.4)}, inset 0 1px 0 ${withAlpha("#FFFFFF", 0.45)}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 900, fontSize: 15,
    }}>
      {kind === "plain" && <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#FFFFFF" }} />}
      {kind === "multi" && "3"}
      {kind === "fuse" && (
        <svg viewBox="0 0 100 100" width="22" height="22" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="40" fill="none" stroke={withAlpha("#FFFFFF", 0.3)} strokeWidth="14" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * 0.38} />
        </svg>
      )}
    </div>
  );
}

export default function Blip() {
  const [phase, setPhase] = useState("start"); // start | play | dying | dead | settings
  const [boardSize, setBoardSize] = useState(DEFAULT_SIZE);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bests, setBests] = useState({ 3: 0, 5: 0 });
  const [shake, setShake] = useState(false);
  const [, setFrame] = useState(0);

  /* Everything the 60 Hz loop touches lives in a ref: the loop re-subscribes
     only on `phase`, so anything read out of its closure would be frozen at
     the value it had when the round started (the exact bug that used to bank
     a stale score in Pounce). React state here is only what the *chrome*
     renders — score, streak, phase. */
  const cellsRef = useRef([]);
  const fxRef = useRef([]);
  const timeRef = useRef(TIMER_START);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const spawnAccRef = useRef(0);
  const emptySinceRef = useRef(0);
  const sizeRef = useRef(DEFAULT_SIZE);
  const endingRef = useRef(false);
  const continueUsedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutsRef = useRef([]);
  const bestLoadedRef = useRef(false);

  const N = boardSize;
  const best = bests[N] || 0;
  const scorePop = useScorePop(score);

  useEffect(() => { sizeRef.current = boardSize; }, [boardSize]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);
  /** setTimeout that a restart or unmount cancels. */
  const later = useCallback((fn, ms) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  /* ── transient effects ──────────────────────────────────────────────────
     Kept in a ref and pruned by the loop rather than held in state: a burst
     is pure decoration with a fixed lifetime, and routing ten of them a
     second through setState would re-render the chrome for nothing. The loop
     already re-renders every frame. */
  const addFx = useCallback((fx) => {
    fxRef.current.push({ id: `f${uid++}`, born: performance.now(), ttl: 700, ...fx });
  }, []);

  const addBurst = useCallback((row, col, color, { label, sub, count = 10, spread = 30 } = {}) => {
    const shards = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const d = spread * (0.6 + Math.random() * 0.8);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: 4 + Math.random() * 4 };
    });
    addFx({ type: "burst", row, col, color, label, sub, shards, ttl: 760 });
  }, [addFx]);

  /* ── game over ──────────────────────────────────────────────────────────
     Holds a "dying" beat so the empty board and the red wash actually read —
     the game-over card is opaque and full-screen, so anything animated under
     it would otherwise never be seen. The interstitial fires at the end of
     that beat, never over the death frame. */
  const endGame = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;

    const finalScore = scoreRef.current;
    const size = sizeRef.current;
    setPhase("dying");
    setShake(true);
    sfx.hit();
    vibrate([0, 45, 60, 90]);
    later(() => setShake(false), 520);
    later(() => {
      setBests(b => ({ ...b, [size]: Math.max(b[size] || 0, finalScore) }));
      setPhase("dead");
      showInterstitial(AD_IDS);
    }, DEATH_BEAT_MS);
  }, [later]);

  /* ── spawning ── */
  const freeCells = useCallback((n) => {
    const taken = new Set(cellsRef.current.map(c => c.row * n + c.col));
    const free = [];
    for (let i = 0; i < n * n; i++) if (!taken.has(i)) free.push(i);
    return free;
  }, []);

  const spawnCell = useCallback((n, sc, forcedKind) => {
    const free = freeCells(n);
    if (!free.length) return false;
    const i = free[Math.floor(Math.random() * free.length)];
    const kind = forcedKind || pickKind(sc);
    const cell = {
      id: `c${uid++}`,
      row: Math.floor(i / n), col: i % n,
      kind,
      hits: kind === "multi" ? multiHitsFor(sc) : 1,
      fuse: 0, fuseMax: 1,
    };
    cell.hitsLeft = cell.hits;
    if (kind === "fuse") {
      cell.fuseMax = fuseUnitsFor(sc);
      cell.fuse = cell.fuseMax;
    }
    cellsRef.current.push(cell);
    sfx.select();
    return true;
  }, [freeCells]);

  /* ── main loop ──────────────────────────────────────────────────────────
     One RAF drives the clock, every fuse, the spawner and the effect pruner,
     then forces one render. dt is clamped so a backgrounded tab that resumes
     after ten seconds doesn't instantly burn the whole round down. */
  useEffect(() => {
    if (phase !== "play") return;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const n = sizeRef.current;
      const conf = SIZES[n];

      timeRef.current -= dt;

      /* fuses */
      const fuseStep = (dt * 1000) / FUSE_TICK_MS;
      for (const cell of cellsRef.current) {
        if (cell.kind !== "fuse") continue;
        cell.fuse -= fuseStep;
        if (cell.fuse <= 0) {
          cellsRef.current = cellsRef.current.filter(c => c.id !== cell.id);
          timeRef.current += TIME_EXPIRE;
          streakRef.current = 0;
          setStreak(0);
          sfx.hit();
          vibrate(45);
          addBurst(cell.row, cell.col, FUSE_END_COLOR, { label: `${TIME_EXPIRE.toFixed(1)}s`, count: 12, spread: 34 });
          addFx({ type: "wash", tone: "bad", ttl: 420 });
          setShake(true);
          later(() => setShake(false), 260);
        }
      }

      /* spawner */
      spawnAccRef.current += dt;
      const interval = spawnIntervalFor(scoreRef.current, conf);
      const cap = liveCapFor(scoreRef.current, conf);
      /* An empty board is dead air in a game whose whole verb is "tap the lit
         one", so a board that has been *sitting* empty refills fast rather
         than waiting out the full interval. The delay before that kicks in is
         load-bearing, not politeness: a fast player empties the board for an
         instant after every single clear, and an ungated shortcut hands them
         the rushed cadence permanently — measured at 2.73 spawns/s against a
         2.22/s ceiling, which is enough extra clock to outrun the ramp. */
      if (cellsRef.current.length === 0) {
        if (emptySinceRef.current === 0) emptySinceRef.current = now;
      } else {
        emptySinceRef.current = 0;
      }
      /* ...and it only exists while the cadence is slow enough for a hole to
         be genuine dead air. Plain and multi cells never expire, so at a
         tight cadence an empty board doesn't mean the game stalled — it means
         the player is outrunning it, which is precisely the case that must
         not be handed extra clock. An 8.3 taps/s bot kept the board empty 41%
         of the time and rode the rush to 2.54 spawns/s. */
      const sittingEmpty = emptySinceRef.current !== 0
        && now - emptySinceRef.current > 250
        && interval > 0.6;
      const due = sittingEmpty ? Math.min(interval, 0.18) : interval;
      if (spawnAccRef.current >= due) {
        /* The tick is consumed whether or not there was room. Holding the
           accumulator at `due` while the board is full seems kinder — a
           cleared slot refills instantly instead of leaving a hole — but it
           turns the cadence into a demand-driven faucet: at saturation the
           spawn rate becomes the *clear* rate, so a fast enough player mints
           unlimited clock. A 6.7 taps/s bot rode that to 200 s at a full
           timer. Spawns are rate-limited, full stop; the empty-board
           shortcut below is the only concession. */
        spawnAccRef.current = 0;
        if (cellsRef.current.length < cap) spawnCell(n, scoreRef.current);
      }

      /* effect pruning */
      if (fxRef.current.length) {
        fxRef.current = fxRef.current.filter(f => now - f.born < f.ttl);
      }

      if (timeRef.current <= 0) {
        timeRef.current = 0;
        endGame();
        return;
      }

      setFrame(f => f + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame, spawnCell, addBurst, addFx, later]);

  /* ── ads + audio: once on mount ── */
  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
    initHaptics();
  }, []);

  /* ── best scores + last board size ── */
  useEffect(() => {
    Promise.all([
      bestStores[3].loadBestScore(),
      bestStores[5].loadBestScore(),
      sizeStore.loadBestScore(),
    ]).then(([b3, b5, storedSize]) => {
      setBests({ 3: b3, 5: b5 });
      if (SIZE_KEYS.includes(storedSize)) setBoardSize(storedSize);
      bestLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!bestLoadedRef.current) return;
    bestStores[3].saveBestScore(bests[3]);
    bestStores[5].saveBestScore(bests[5]);
  }, [bests]);

  const pickSize = useCallback((k) => {
    setBoardSize(k);
    sizeStore.saveBestScore(k);
    sfx.select();
  }, []);

  /* ── start / restart ── */
  const startGame = useCallback(() => {
    clearTimeouts();
    const n = sizeRef.current;
    cellsRef.current = [];
    fxRef.current = [];
    timeRef.current = TIMER_START;
    scoreRef.current = 0;
    streakRef.current = 0;
    spawnAccRef.current = 0;
    emptySinceRef.current = 0;
    endingRef.current = false;
    continueUsedRef.current = false;
    /* The opening cells are always plain: the first thing a new player should
       learn is "the lit one is the one", not the whole vocabulary at once. */
    for (let i = 0; i < SIZES[n].startCells; i++) spawnCell(n, 0, "plain");
    setScore(0);
    setStreak(0);
    setShake(false);
    setPhase("play");
  }, [clearTimeouts, spawnCell]);

  /* ── rewarded continue: one per run, and only ever offered when an ad is
     actually loaded (see the GameOverCard call below). ── */
  const handleWatchAdContinue = useCallback(async () => {
    const reward = await showRewarded(AD_IDS);
    if (!reward) return false;
    continueUsedRef.current = true;
    clearTimeouts();
    cellsRef.current = [];
    fxRef.current = [];
    timeRef.current = CONTINUE_TIME;
    spawnAccRef.current = 0;
    emptySinceRef.current = 0;
    endingRef.current = false;
    streakRef.current = 0;
    setStreak(0);
    setShake(false);
    setPhase("play");
    return true;
  }, [clearTimeouts]);

  /* ── the tap ────────────────────────────────────────────────────────────
     Every tile is live, including the empty ones — without a cost for hitting
     a dark tile the optimal strategy is to mash the whole board, which is not
     a game. The penalty is small enough to survive and loud enough to teach. */
  const handleTileTap = useCallback((row, col) => {
    if (phase !== "play") return;

    const cell = cellsRef.current.find(c => c.row === row && c.col === col);

    if (!cell) {
      timeRef.current = Math.max(0, timeRef.current + TIME_MISS);
      streakRef.current = 0;
      setStreak(0);
      sfx.hit();
      vibrate(35);
      addFx({ type: "miss", row, col, ttl: 400 });
      addFx({ type: "wash", tone: "bad", ttl: 360 });
      return;
    }

    /* a multi cell that isn't done yet: chip it, don't clear it */
    if (cell.hitsLeft > 1) {
      cell.hitsLeft -= 1;
      sfx.tap();
      vibrate(12);
      addBurst(row, col, KIND_COLOR.multi, { count: 5, spread: 18 });
      return;
    }

    cellsRef.current = cellsRef.current.filter(c => c.id !== cell.id);

    const conf = SIZES[sizeRef.current];
    streakRef.current += 1;
    const mult = multiplierFor(streakRef.current);
    const points = pointValue(cell) * mult;
    const gained = timeValue(cell, scoreRef.current, conf);

    scoreRef.current += points;
    timeRef.current = Math.min(TIMER_CAP, timeRef.current + gained);
    setScore(scoreRef.current);
    setStreak(streakRef.current);

    /* the fanfare is reserved for the two moments worth marking: beating a
       fuse, and stepping the multiplier up a notch */
    const steppedUp = mult > multiplierFor(streakRef.current - 1);
    if (cell.kind === "fuse" || steppedUp) sfx.power();
    else sfx.score();
    vibrate(cell.kind === "plain" ? 18 : 28);

    addBurst(row, col, cell.kind === "fuse" ? FUSE_END_COLOR : KIND_COLOR[cell.kind], {
      label: `+${points}`,
      sub: `+${gained.toFixed(1)}s`,
      count: cell.kind === "plain" ? 9 : 14,
      spread: cell.kind === "plain" ? 28 : 38,
    });
    if (cell.kind === "fuse") addFx({ type: "wash", tone: "good", ttl: 360 });
  }, [phase, addBurst, addFx]);

  /* ── layout ──
     Both boards land on the same on-screen footprint, so switching 3×3 ⇄ 5×5
     changes the tile scale, not the size of the playfield. */
  const cellSize = `min(${(400 / N).toFixed(2)}px, ${(84 / N).toFixed(2)}vw)`;
  const boardPx = `calc(${cellSize} * ${N})`;

  const onBoard = phase === "play" || phase === "dying";
  const time = timeRef.current;
  const danger = onBoard && time < 3.2;
  const timePct = clamp01(time / TIMER_CAP);
  const mult = multiplierFor(streak);
  const maxedOut = mult === MAX_MULT;
  /* the board's own glow is the streak read — one less number on screen */
  const glow = Math.min(0.5, streak * 0.045);
  const cells = cellsRef.current;
  const fx = fxRef.current;
  /* the newest wash wins — two in the same breath should show the second */
  const wash = [...fx].reverse().find(f => f.type === "wash");

  const cellFx = (row, col) => fx.filter(f => f.row === row && f.col === col);

  return (
    <div
      onPointerDown={() => { if (phase === "start" || phase === "dead") startGame(); }}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, ${baseTheme.bg} 58%, #EFEAE1 100%)`,
        fontFamily: fontUI, userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", padding: 12, position: "relative", overflow: "hidden",
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
              {mult > 1 && (
                /* keyed by the multiplier, not by the streak: the chip should
                   punch when the multiplier actually steps up, not on every
                   single clear */
                <span key={mult} style={{
                  fontSize: 12, fontWeight: 900, fontFamily: fontDisplay,
                  color: maxedOut ? "#FFFFFF" : ACCENT,
                  background: maxedOut ? ACCENT : "transparent",
                  border: `1.5px solid ${withAlpha(ACCENT, maxedOut ? 1 : 0.5)}`,
                  borderRadius: 99, padding: "2px 8px",
                  boxShadow: maxedOut ? `0 0 12px ${withAlpha(ACCENT, 0.6)}` : "none",
                  animation: "blPunch 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                  ×{mult}
                </span>
              )}
            </div>
            <span style={{
              fontSize: 30, fontWeight: 900, fontFamily: fontDisplay, lineHeight: 1,
              color: danger ? ACCENTS[0] : baseTheme.text,
              fontVariantNumeric: "tabular-nums",
              animation: danger ? "blPanic 0.5s ease-in-out infinite" : "none",
            }}>
              {time.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 800 }}>s</span>
            </span>
          </div>

          <div style={{ height: 8, borderRadius: 99, background: "rgba(24,23,29,0.08)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${timePct * 100}%`,
              background: danger
                ? `linear-gradient(90deg, ${ACCENTS[1]}, ${ACCENTS[0]})`
                : `linear-gradient(90deg, ${ACCENT}, ${SUCCESS})`,
              boxShadow: `0 0 10px ${withAlpha(danger ? ACCENTS[0] : ACCENT, 0.5)}`,
            }} />
          </div>
        </div>
      )}

      {/* ── board ── */}
      <div style={{ animation: shake ? "blShake 0.42s cubic-bezier(.36,.07,.19,.97)" : "none" }}>
        <div style={{
          "--bl-cell": cellSize,
          position: "relative",
          width: boardPx, height: boardPx,
          borderRadius: 24, padding: 8,
          background: "linear-gradient(160deg, #FFFFFF 0%, #F0EBE1 100%)",
          border: `1px solid ${danger ? withAlpha(ACCENTS[0], 0.5) : baseTheme.border}`,
          boxShadow: danger
            ? `0 12px 34px rgba(24,23,29,0.16), 0 0 0 4px ${withAlpha(ACCENTS[0], 0.14)}`
            : `0 12px 34px rgba(24,23,29,0.16), 0 0 0 ${4 + glow * 10}px ${withAlpha(ACCENT, 0.05 + glow * 0.22)}`,
          transition: "border-color 0.3s",
        }}>
          <div style={{
            display: "grid", width: "100%", height: "100%",
            gridTemplateColumns: `repeat(${N}, 1fr)`,
            gridTemplateRows: `repeat(${N}, 1fr)`,
            gap: "calc(var(--bl-cell) * 0.075)",
          }}>
            {Array.from({ length: N * N }).map((_, i) => {
              const row = Math.floor(i / N), col = i % N;
              const cell = cells.find(c => c.row === row && c.col === col);
              return (
                <div
                  key={i}
                  onPointerDown={(e) => { e.stopPropagation(); handleTileTap(row, col); }}
                  style={{
                    position: "relative",
                    borderRadius: "calc(var(--bl-cell) * 0.22)",
                    background: "linear-gradient(180deg, #FFFFFF 0%, #F6F2EA 100%)",
                    boxShadow: "inset 0 -2px 0 rgba(24,23,29,0.06), 0 1px 2px rgba(24,23,29,0.05)",
                    cursor: phase === "play" ? "pointer" : "default",
                  }}
                >
                  {/* keyed by cell id, not by tile: without it React reuses the
                      element when a new cell lands on a tile that just cleared,
                      and the spawn pop never plays for it */}
                  {cell && onBoard && (
                    <CellToken key={cell.id} cell={cell} frac={cell.kind === "fuse" ? clamp01(cell.fuse / cell.fuseMax) : 1} />
                  )}

                  {/* per-tile effects: bursts, floats, missed-tap crosses */}
                  {cellFx(row, col).map(f => (
                    <div key={f.id} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}>
                      {f.type === "miss" && (
                        <div style={{
                          position: "absolute", inset: 0,
                          borderRadius: "calc(var(--bl-cell) * 0.22)",
                          background: withAlpha(ACCENTS[0], 0.18),
                          display: "flex", alignItems: "center", justifyContent: "center",
                          animation: "blDenied 0.4s ease-in-out forwards",
                        }}>
                          <svg viewBox="0 0 24 24" width="38%" height="38%" fill="none"
                            stroke={ACCENTS[0]} strokeWidth="4" strokeLinecap="round">
                            <path d="M6 6 L18 18 M18 6 L6 18" />
                          </svg>
                          <span style={{
                            position: "absolute", bottom: "6%", fontSize: 10, fontWeight: 900,
                            fontFamily: fontDisplay, color: ACCENTS[0],
                          }}>
                            {TIME_MISS.toFixed(1)}s
                          </span>
                        </div>
                      )}

                      {f.type === "burst" && (
                        <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
                          <div style={{
                            position: "absolute", left: 0, top: 0,
                            width: "var(--bl-cell)", height: "var(--bl-cell)",
                            marginLeft: "calc(var(--bl-cell) / -2)", marginTop: "calc(var(--bl-cell) / -2)",
                            borderRadius: "calc(var(--bl-cell) * 0.24)",
                            border: `3px solid ${withAlpha(f.color, 0.8)}`,
                            animation: "blRing 0.5s cubic-bezier(0.2,0.8,0.3,1) forwards",
                          }} />
                          {f.shards.map((s, k) => (
                            <div key={k} style={{
                              position: "absolute", left: 0, top: 0,
                              width: s.size, height: s.size, borderRadius: 2, background: f.color,
                              "--bl-dx": `${s.dx}px`, "--bl-dy": `${s.dy}px`,
                              animation: "blShard 0.6s cubic-bezier(0.15,0.7,0.3,1) forwards",
                            }} />
                          ))}
                          {f.label && (
                            <span style={{
                              position: "absolute", left: 0, top: 0, whiteSpace: "nowrap",
                              fontSize: 18, fontWeight: 900, fontFamily: fontDisplay,
                              color: baseTheme.text, textShadow: "0 1px 4px rgba(255,255,255,0.95)",
                              animation: "blFloat 0.72s ease-out forwards",
                            }}>
                              {f.label}
                            </span>
                          )}
                          {f.sub && (
                            <span style={{
                              position: "absolute", left: 0, top: 0, whiteSpace: "nowrap",
                              fontSize: 11, fontWeight: 900, fontFamily: fontDisplay,
                              color: SUCCESS, textShadow: "0 1px 4px rgba(255,255,255,0.95)",
                              animation: "blFloatSub 0.72s ease-out forwards",
                            }}>
                              {f.sub}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* board-wide wash: one frame of colour so a fumble or a fuse save
              registers peripherally, without moving the tiles */}
          {wash && (
            <div key={wash.id} style={{
              position: "absolute", inset: 0, borderRadius: 24, pointerEvents: "none", zIndex: 6,
              background: `radial-gradient(circle at center, transparent 35%, ${withAlpha(wash.tone === "bad" ? ACCENTS[0] : SUCCESS, 0.3)} 100%)`,
              animation: "blWash 0.4s ease-out forwards",
            }} />
          )}

          {/* death wash */}
          {phase === "dying" && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 24, pointerEvents: "none", zIndex: 7,
              background: `radial-gradient(circle at center, transparent 28%, ${withAlpha(ACCENTS[0], 0.34)} 100%)`,
              animation: "blDeathWash 0.8s ease-out forwards",
            }} />
          )}
        </div>
      </div>

      {/* ── START ── */}
      {phase === "start" && (
        <StartScreen
          accent={ACCENT}
          title={
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 12px)", gap: 4,
                filter: `drop-shadow(0 4px 12px ${withAlpha(ACCENT, 0.45)})`,
              }}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: 3.5,
                    background: i === 4 ? ACCENT : withAlpha(baseTheme.text, 0.14),
                    animation: i === 4 ? "blBreathe 1.5s ease-in-out infinite" : "none",
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 46, fontWeight: 900, color: baseTheme.text, fontFamily: fontDisplay, letterSpacing: -1, lineHeight: 1 }}>
                BLIP
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
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: baseTheme.textMuted,
                }}>
                  Three kinds of cell
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  {[
                    { kind: "plain", label: "One tap" },
                    { kind: "multi", label: "Tap ×N" },
                    { kind: "fuse", label: "Before 0" },
                  ].map(({ kind, label }) => (
                    <div key={kind} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1 }}>
                      <KindChip kind={kind} />
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: baseTheme.textMuted }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
          description="Clear lit cells before the clock dies — every one you clear buys time back. Hit a dark tile and it costs you."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {/* ── GAME OVER ── */}
      {phase === "dead" && (
        <GameOverCard
          accent={ACCENT}
          title="Time's up!"
          score={score}
          best={best}
          onRetry={startGame}
          onWatchAdContinue={
            !continueUsedRef.current && isNativeAdPlatform() && isRewardedReady()
              ? handleWatchAdContinue
              : undefined
          }
        />
      )}

      {/* ── SETTINGS ── */}
      {phase === "settings" && (
        <SettingsScreen
          accent={ACCENT}
          onBack={() => setPhase("start")}
          onResetProgress={() => {
            bestStores[3].resetBestScore();
            bestStores[5].resetBestScore();
            setBests({ 3: 0, 5: 0 });
          }}
        />
      )}

      {/* game-specific keyframes (the PLAY pulse comes from the shared components) */}
      <style>{`
        @keyframes blSpawn {
          0%   { opacity: 0; transform: scale(0.2) rotate(-12deg); }
          65%  { opacity: 1; transform: scale(1.12) rotate(3deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes blBreathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.055); }
        }
        @keyframes blNudge {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25%      { transform: scale(1.03) rotate(-1.6deg); }
          75%      { transform: scale(1.03) rotate(1.6deg); }
        }
        @keyframes blPing {
          0%   { opacity: 0.85; transform: scale(0.8); }
          70%  { opacity: 0;    transform: scale(2.1); }
          100% { opacity: 0;    transform: scale(2.1); }
        }
        @keyframes blFuseCalm {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.03); }
        }
        @keyframes blFuseWarn {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50%      { transform: scale(1.06) rotate(1.2deg); }
        }
        @keyframes blFusePanic {
          0%, 100% { transform: translateX(-2px) scale(1.05); }
          50%      { transform: translateX(2px) scale(1.09); }
        }
        @keyframes blPunch {
          0%   { transform: scale(1.65); }
          100% { transform: scale(1); }
        }
        @keyframes blRing {
          0%   { opacity: 0.95; transform: scale(0.6); }
          100% { opacity: 0;    transform: scale(1.7); }
        }
        @keyframes blShard {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--bl-dx)), calc(-50% + var(--bl-dy))) scale(0.25); }
        }
        /* clears the tile it spawns on before it fades, so a reward never
           reads as a smudge sitting on top of the next cell */
        @keyframes blFloat {
          0%   { opacity: 0; transform: translate(-50%, -60%) scale(0.7); }
          22%  { opacity: 1; transform: translate(-50%, -135%) scale(1.12); }
          100% { opacity: 0; transform: translate(-50%, -235%) scale(1); }
        }
        @keyframes blFloatSub {
          0%   { opacity: 0; transform: translate(-50%, 10%) scale(0.7); }
          28%  { opacity: 1; transform: translate(-50%, 40%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, 125%) scale(1); }
        }
        @keyframes blDenied {
          0%   { opacity: 1; transform: translateX(0); }
          20%  { transform: translateX(-4px); }
          60%  { transform: translateX(4px); }
          100% { opacity: 0; transform: translateX(0); }
        }
        @keyframes blWash {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes blDeathWash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0.75; }
        }
        @keyframes blShake {
          10%, 90% { transform: translate(-2px, 1px) rotate(-0.4deg); }
          20%, 80% { transform: translate(4px, -2px) rotate(0.6deg); }
          30%, 50%, 70% { transform: translate(-5px, 2px) rotate(-0.7deg); }
          40%, 60% { transform: translate(5px, -1px) rotate(0.7deg); }
        }
        @keyframes blPanic {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.07); }
        }
      `}</style>
    </div>
  );
}
