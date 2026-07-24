import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initHaptics } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import Scene3D from "./Scene3D.jsx";
import { COLS, SAFE, TREE, CRACK, SPIKE, getRow, upperL, upperR, isDeadly } from "./grid.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("ploop-climb.bestScore");

/* ── 37apps brand kit: light neutral base + Volt Lime accent. Signature motif: a living sky that the collapse chases upward through. ── */
const palette = {
  ...baseTheme,
  accent: "#C0E637",
};

const HOP_DURATION = 0.16;

const BASE_DANGER_SPEED = 0.55;
const MAX_DANGER_SPEED = 1.9;
const DANGER_SPEED_PER_SCORE = 0.006;

/* the tile under a stationary climber gives way on its own — standing still is
   never safe, so the player is always fleeing something, even between hops */
const STAND_LIMIT = 1.7;

export default function PloopClimb() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [deathReason, setDeathReason] = useState("fall");
  const [bump, setBump] = useState(null);

  const trackRef = useRef(null);
  const rowsRef = useRef({});
  const playerRef = useRef({ row: 0, col: 2 });
  const hopRef = useRef({ active: false, from: null, to: null, t: 0, dir: 0 });
  const dangerRowRef = useRef(-16);
  const dangerSpeedRef = useRef(BASE_DANGER_SPEED);
  const standTimeRef = useRef(0);
  const scoreRef = useRef(0);
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
      showInterstitial(AD_IDS);
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  /* ── main loop: hop progress, rising collapse. Camera framing is a rendering
     concern now owned entirely by Scene3D — this loop only ever touches game
     state (hop timing, collision, score, row generation), never pixels. ── */
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
    dangerRowRef.current = -16;
    dangerSpeedRef.current = BASE_DANGER_SPEED;
    standTimeRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
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
      return;
    }
    const targetType = getRow(rowsRef.current, target.r)[target.c];
    if (targetType === TREE) {
      setBump({ dir, key: performance.now() });
      return;
    }
    hopRef.current = { active: true, from: { row, col }, to: target, t: 0, dir };
  }, [phase, startGame]);

  const handlePointerDown = useCallback((e) => {
    /* menu/game-over background tap = play again; settings has its own buttons
       (which stopPropagation) and must never fall through to this */
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attemptMove]);

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(null), 200);
    return () => clearTimeout(t);
  }, [bump]);

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
      {phase === "play" && <ScoreHeader score={score} best={best} theme={palette} />}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* sky, clouds, tower, climber, and the rising collapse all live inside
            Scene3D now — see its own comment on why the canvas is opaque */}
        {(phase === "play" || phase === "dead") && (
          <Scene3D
            phase={phase}
            playerRef={playerRef}
            hopRef={hopRef}
            rowsRef={rowsRef}
            dangerRowRef={dangerRowRef}
            standTimeRef={standTimeRef}
            standLimit={STAND_LIMIT}
            bump={bump}
            reducedMotion={reducedMotion}
          />
        )}

        {phase === "start" && (
          <StartScreen
            accent={palette.accent}
            title="PLOOP CLIMB"
            preview={
              <div style={{ display: "flex", gap: 14 }}>
                {[
                  { type: SAFE, label: "Safe" },
                  { type: TREE, label: "Blocks" },
                  { type: SPIKE, label: "Deadly" },
                  { type: CRACK, label: "Deadly" },
                ].map(item => (
                  <div key={item.label + item.type} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: item.type === SPIKE ? "#9AA0AA" : item.type === CRACK ? "#C0553C" : palette.accent,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {item.type === TREE && <div style={{ fontSize: 18 }}>🌲</div>}
                    </div>
                    <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            }
            description="Hop left or right, climbing block to block. Trees block your step. Spikes, rubble and gaps are deadly. Never stand still — every block gives way under you, and the collapse below never stops climbing after you."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {phase === "dead" && (
          <GameOverCard
            accent={palette.accent}
            title={
              deathReason === "danger" ? "Buried in rubble!"
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

/** Respects the OS-level motion preference: idle bob, camera shake, and scrolling
    textures in Scene3D all gate off this instead of running unconditionally. */
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
