import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay } from "@37apps/core/theme.js";
import { sfx } from "@37apps/core/audio.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import Scene3D from "./Scene3D.jsx";
import { COLS, SAFE, TREE, CRACK, SPIKE, getRow, upperL, upperR, isDeadly, gemAt } from "./grid.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("ploop-climb.bestScore");

/* ── 37apps brand kit v2: light neutral UI chrome over a saturated accent sky.
   Coral is this game's accent — it's the colour of the thing chasing you, so
   every warning surface in the UI can share it without extra explanation. ── */
const palette = {
  ...baseTheme,
  accent: "#FF4529",
  gem: "#FFA31A",
};

const HOP_DURATION = 0.15;

/* the collapse starts just off the bottom of the frame rather than far below:
   the threat is the whole game, and it should be *visible* within the first
   couple of hops instead of arriving as a surprise thirty seconds in */
const DANGER_START_ROW = -7;
const BASE_DANGER_SPEED = 0.7;
const MAX_DANGER_SPEED = 2.2;
const DANGER_SPEED_PER_SCORE = 0.008;

/* The collapse never falls further than this behind the climber. Without the
   clamp a good player simply outruns it and the front spends the whole run
   off-screen — the ground stops falling away, the threat becomes invisible,
   and the game reads as a leisurely stroll. Rubber-banding keeps the bottom of
   the frame permanently crumbling, which is the entire premise, and turns the
   difficulty curve into "how much margin can you buy" rather than "did you
   survive the first ten seconds". */
const MAX_DANGER_LAG = 4;

/* the tile under a stationary climber gives way on its own — standing still is
   never safe, so the player is always fleeing something, even between hops */
const STAND_LIMIT = 1.7;

/* banking a gem shoves the collapse back down. It's the one way to buy time,
   which turns each gem into a real decision (it may sit off your safest line)
   rather than a number that only goes up. */
const GEM_DANGER_RELIEF = 1.1;

export default function PloopClimb() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [gems, setGems] = useState(0);
  const [best, setBest] = useState(0);
  const [deathReason, setDeathReason] = useState("fall");
  const [bump, setBump] = useState(null);

  const trackRef = useRef(null);
  const rowsRef = useRef({});
  const playerRef = useRef({ row: 0, col: 2 });
  const hopRef = useRef({ active: false, from: null, to: null, t: 0, dir: 0 });
  const dangerRowRef = useRef(DANGER_START_ROW);
  const dangerSpeedRef = useRef(BASE_DANGER_SPEED);
  const standTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const gemsRef = useRef({ collected: new Set(), count: 0 });
  const fxRef = useRef(null);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    initAds(AD_IDS);
    initHaptics();
  }, []);

  useEffect(() => {
    loadBestScore().then(stored => {
      setBest(stored);
      bestLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!bestLoadedRef.current) return;
    saveBestScore(best);
  }, [best]);

  const endGame = useCallback((reason) => {
    setDeathReason(reason);
    setPhase(p => {
      if (p !== "play") return p;
      sfx.hit();
      vibrate(60);
      showInterstitial(AD_IDS);
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  /* ── main loop: hop progress, gem pickup, rising collapse. Camera framing and
     every visual reaction are owned by Scene3D — this loop only ever touches
     game state, never pixels. ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const hop = hopRef.current;
      if (hop.active) {
        standTimeRef.current = 0;
        hop.t = Math.min(1, hop.t + dt / HOP_DURATION);
        if (hop.t >= 1) {
          const landed = getRow(rowsRef.current, hop.to.r)[hop.to.c];
          playerRef.current = { row: hop.to.r, col: hop.to.c };
          hop.active = false;
          if (isDeadly(landed)) {
            endGame("fall");
            return;
          }
          const key = `${hop.to.r}-${hop.to.c}`;
          if (landed === SAFE && gemAt(hop.to.r, hop.to.c) && !gemsRef.current.collected.has(key)) {
            gemsRef.current.collected.add(key);
            gemsRef.current.count += 1;
            setGems(gemsRef.current.count);
            dangerRowRef.current -= GEM_DANGER_RELIEF;
            fxRef.current?.gemBurst(hop.to.r, hop.to.c);
            sfx.score();
            vibrate(12);
          }
          scoreRef.current = Math.max(scoreRef.current, hop.to.r);
          setScore(scoreRef.current);
        }
      } else {
        standTimeRef.current += dt;
        if (standTimeRef.current >= STAND_LIMIT) {
          endGame("collapse");
          return;
        }
      }

      dangerSpeedRef.current = Math.min(MAX_DANGER_SPEED, BASE_DANGER_SPEED + scoreRef.current * DANGER_SPEED_PER_SCORE);
      dangerRowRef.current += dangerSpeedRef.current * dt;
      dangerRowRef.current = Math.max(dangerRowRef.current, playerRef.current.row - MAX_DANGER_LAG);
      if (!hop.active && playerRef.current.row <= dangerRowRef.current) {
        endGame("danger");
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    rowsRef.current = {};
    playerRef.current = { row: 0, col: 2 };
    hopRef.current = { active: false, from: null, to: null, t: 0, dir: 0 };
    dangerRowRef.current = DANGER_START_ROW;
    dangerSpeedRef.current = BASE_DANGER_SPEED;
    standTimeRef.current = 0;
    scoreRef.current = 0;
    gemsRef.current = { collected: new Set(), count: 0 };
    setScore(0);
    setGems(0);
    setBump(null);
    setPhase("play");
  }, []);

  const attemptMove = useCallback((dir) => {
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;
    if (hopRef.current.active) return;

    const { row, col } = playerRef.current;
    const target = dir === -1 ? upperL(row, col) : upperR(row, col);
    if (!target || target.c < 0 || target.c >= COLS) {
      setBump({ dir, key: performance.now() });
      vibrate(8);
      return;
    }
    const targetType = getRow(rowsRef.current, target.r)[target.c];
    if (targetType === TREE) {
      setBump({ dir, key: performance.now() });
      vibrate(8);
      return;
    }
    hopRef.current = { active: true, from: { row, col }, to: target, t: 0, dir };
    sfx.tap();
  }, [phase, startGame]);

  const handlePointerDown = useCallback((e) => {
    /* menu/game-over background tap = play again; settings and the HUD buttons
       stopPropagation and must never fall through to this */
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;
    const rect = trackRef.current ? trackRef.current.getBoundingClientRect() : null;
    const isLeft = rect ? e.clientX - rect.left < rect.width / 2 : true;
    attemptMove(isLeft ? -1 : 1);
  }, [phase, startGame, attemptMove]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") attemptMove(-1);
      if (e.key === "ArrowRight" || e.key === "d") attemptMove(1);
      if (e.key === "Escape" || e.key === "p") {
        setPhase(p => (p === "play" ? "paused" : p === "paused" ? "play" : p));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attemptMove]);

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(null), 200);
    return () => clearTimeout(t);
  }, [bump]);

  const showScene = phase === "play" || phase === "paused" || phase === "dead";

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* sky, blocks, climber, gems and the collapse all live inside Scene3D —
            see its own comment on why the canvas is opaque */}
        {showScene && (
          <Scene3D
            phase={phase}
            playerRef={playerRef}
            hopRef={hopRef}
            rowsRef={rowsRef}
            dangerRowRef={dangerRowRef}
            standTimeRef={standTimeRef}
            standLimit={STAND_LIMIT}
            gemsRef={gemsRef}
            fxRef={fxRef}
            bump={bump}
            reducedMotion={reducedMotion}
          />
        )}

        {(phase === "play" || phase === "paused") && (
          <ClimbHud
            score={score}
            gems={gems}
            best={best}
            paused={phase === "paused"}
            onTogglePause={() => setPhase(p => (p === "play" ? "paused" : "play"))}
          />
        )}

        {phase === "paused" && (
          <PauseOverlay onResume={() => setPhase("play")} onQuit={() => setPhase("start")} />
        )}

        {phase === "start" && (
          <StartScreen
            accent={palette.accent}
            title="PLOOP CLIMB"
            preview={<LegendStrip />}
            description="Tap left or right to hop diagonally up the tower. Trees block your step; lava and spikes are deadly. Never stand still — the block under you gives way, and the collapse behind you never stops. Grab gems to push it back."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {phase === "dead" && (
          <GameOverCard
            accent={palette.accent}
            title={
              deathReason === "danger" ? "The collapse caught you!"
                : deathReason === "collapse" ? "The ground gave way!"
                : "You slipped!"
            }
            score={score}
            best={best}
            onRetry={startGame}
          />
        )}

        {phase === "settings" && (
          <SettingsScreen
            accent={palette.accent}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>
    </div>
  );
}

/* ── in-game HUD ────────────────────────────────────────────────────────────
   Deliberately not the shared ScoreHeader: that component assumes a light page
   behind it, and here it would sit on a saturated coral sky where its muted
   greys go illegible. The score is the one number that matters mid-hop, so it
   gets the centre of the frame at display weight; gems and best sit in a pill
   that keeps them readable against any sky tone. ── */
function ClimbHud({ score, gems, best, paused, onTogglePause }) {
  return (
    <div style={{
      /* above the pause overlay (z 12) on purpose: the pause control has to keep
         working as a toggle, and an overlay that swallows the very button that
         raised it is the classic way to strand a player */
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 13,
      padding: "calc(12px + env(safe-area-inset-top)) 14px 0",
      pointerEvents: "none",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, background: "rgba(255,255,255,0.94)",
        border: `1px solid ${palette.border}`, borderRadius: 999,
        padding: "6px 8px 6px 14px",
        boxShadow: "0 6px 18px -10px rgba(0,0,0,0.5)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 62 }}>
          <GemIcon />
          <span style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: palette.text }}>{gems}</span>
        </span>

        {/* the score lives *inside* the pill rather than floating over the
            field: the tower fills the frame edge to edge, so a white number on
            open sky is only legible for the first few rows */}
        <span style={{
          fontFamily: fontDisplay, fontWeight: 800, fontSize: 34, lineHeight: 1,
          color: palette.text, letterSpacing: "-0.02em",
        }}>
          {score}
        </span>

        <button
          type="button"
          aria-label={paused ? "Resume" : "Pause"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onTogglePause(); }}
          style={{
            pointerEvents: "auto", width: 34, height: 34, borderRadius: 999,
            border: "none", background: palette.accent, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          {paused ? (
            <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5z" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor"><rect x="1.5" y="1" width="3" height="10" rx="1" /><rect x="7.5" y="1" width="3" height="10" rx="1" /></svg>
          )}
        </button>
      </div>

      <div style={{
        textAlign: "right", marginTop: 8, paddingRight: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
        color: "rgba(255,255,255,0.9)", textShadow: "0 2px 8px rgba(90,10,25,0.6)",
      }}>
        BEST {best}
      </div>
    </div>
  );
}

function GemIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 22 9.5 12 22 2 9.5z" fill={palette.gem} />
      <path d="M12 2 22 9.5 12 22z" fill="#E08A0A" />
    </svg>
  );
}

function PauseOverlay({ onResume, onQuit }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute", inset: 0, zIndex: 12,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, background: "rgba(24,23,29,0.45)", backdropFilter: "blur(3px)",
      }}
    >
      <div style={{
        background: palette.panelBg, border: `1px solid ${palette.border}`,
        borderRadius: 22, padding: "26px 30px", textAlign: "center", minWidth: 220,
      }}>
        <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 24, color: palette.text, marginBottom: 18 }}>
          Paused
        </div>
        <button type="button" onClick={onResume} style={pauseBtn(palette.accent, "#fff")}>Resume</button>
        <button type="button" onClick={onQuit} style={{ ...pauseBtn("transparent", palette.textMuted), marginTop: 8 }}>
          Quit
        </button>
      </div>
    </div>
  );
}

function pauseBtn(bg, color) {
  return {
    display: "block", width: "100%", padding: "12px 20px", borderRadius: 999,
    border: bg === "transparent" ? `1px solid ${palette.border}` : "none",
    background: bg, color, fontFamily: fontUI, fontWeight: 700, fontSize: 15, cursor: "pointer",
  };
}

/** Menu legend — one swatch per thing the player can land on, so the rules are
    readable before the first hop instead of learned by dying. */
function LegendStrip() {
  const items = [
    { key: "safe", type: SAFE, label: "Safe", bg: "linear-gradient(180deg,#8FD94A 0 62%,#C79A63 62% 100%)" },
    { key: "tree", type: TREE, label: "Blocks", bg: "linear-gradient(180deg,#8FD94A 0 62%,#C79A63 62% 100%)", glyph: "🌲" },
    { key: "lava", type: CRACK, label: "Deadly", bg: "linear-gradient(180deg,#B8341C 0 62%,#3A130C 62% 100%)" },
    { key: "spike", type: SPIKE, label: "Deadly", bg: "linear-gradient(180deg,#B6BAC4 0 62%,#8D939D 62% 100%)", glyph: "▲" },
    { key: "gem", type: "gem", label: "+Time", bg: "linear-gradient(180deg,#8FD94A 0 62%,#C79A63 62% 100%)", gem: true },
  ];
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {items.map(item => (
        <div key={item.key} style={{ textAlign: "center" }}>
          <div style={{
            width: 42, height: 42, borderRadius: 9, background: item.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, color: "#fff",
            boxShadow: "0 3px 8px -4px rgba(0,0,0,0.5)",
          }}>
            {item.gem ? <GemIcon size={20} /> : item.glyph}
          </div>
          <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 5 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Respects the OS-level motion preference: idle bob, camera shake, drifting
    clouds and crumble shudder in Scene3D all gate off this. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
