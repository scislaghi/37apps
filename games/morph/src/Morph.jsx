import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, ACCENTS, SUCCESS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import Scene3D from "./Scene3D.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("morph.bestScore");

/* Morph's fixed brand accent (Violet Spark) — drives PLAY/RETRY buttons and the
   Settings toggles; independent of the per-gate accent colors used in-scene. */
const ACCENT = ACCENTS[6];

const PLAYER_GRADIENT = "linear-gradient(135deg, #1DC0ED, #7B42FF)";

/* ── shape system: drives the actual pass/fail collision check below. Scene3D has
   its own separate visual-only dimensions — this file never has to know how the
   shapes are rendered, only whether they fit. ── */
const SHAPES = {
  cube: { w: 46, h: 46, radius: 18 },
  tall: { w: 24, h: 70, radius: 12 },
  wide: { w: 70, h: 24, radius: 12 },
};
const HOLES = {
  cube: { w: 50, h: 50 },
  tall: { w: 32, h: 78 },
  wide: { w: 78, h: 32 },
};
const TYPES = ["cube", "tall", "wide"];

const DRAG_THRESHOLD = 28;

/* ── gates rush toward the camera along z (1 = spawn, 0 = player); Scene3D maps
   this straight to world-space depth, no perspective faking needed on this side ── */
const BASE_SPEED_Z = 0.32;
const SPEED_PER_SCORE_Z = 0.018;
const MAX_SPEED_Z = 0.85;
const CHECK_Z = 0.055;
const SPAWN_TRIGGER_Z = 0.5;
const SPAWN_Z = 1.08;
const CLEANUP_Z = -1.1;

function pickDifferent(pool, exclude) {
  const filtered = exclude ? pool.filter(v => v !== exclude) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

let idCounter = 1;
function makeGate(lastType, lastColor) {
  const type = pickDifferent(TYPES, lastType);
  const color = pickDifferent(ACCENTS, lastColor);
  return { id: idCounter++, z: SPAWN_Z, type, color, passed: false };
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

export default function Morph() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  const gatesRef = useRef([]);
  const shapeRef = useRef("cube");
  const scoreRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const keyHeldRef = useRef(null);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const lastTypeRef = useRef(null);
  const lastColorRef = useRef(null);
  const sceneRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
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

  /* ── death is two beats: "impact" plays the 3D burst/flash/shockwave with the
     scene still visible, then "dead" swaps in the opaque Game Over screen. Skipping
     straight to "dead" would cover the canvas in the same frame the FX starts,
     since GameOverCard is now fully opaque (brand kit v2) rather than a scrim. ── */
  const endGame = useCallback((failColor) => {
    setPhase(p => {
      if (p !== "play") return p;
      sceneRef.current?.triggerDeath(failColor || SUCCESS);
      vibrate([15, 40, 15]);
      showInterstitial(AD_IDS);
      return "impact";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), 480);
  }, []);

  /* ── main loop: gates approach along z, pass/fail resolves the instant a gate reaches the player ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const speedZ = Math.min(MAX_SPEED_Z, BASE_SPEED_Z + scoreRef.current * SPEED_PER_SCORE_Z);

      const gates = gatesRef.current.map(g => ({ ...g, z: g.z - speedZ * dt })).filter(g => g.z > CLEANUP_Z);

      let gameOver = false;
      let failColor = null;
      for (const g of gates) {
        if (!g.passed && g.z <= CHECK_Z) {
          g.passed = true;
          const hole = HOLES[g.type];
          const dims = SHAPES[shapeRef.current];
          if (dims.w <= hole.w && dims.h <= hole.h) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            sceneRef.current?.triggerPass(g.color);
            sfx.score();
            vibrate(8);
          } else {
            gameOver = true;
            failColor = g.color;
          }
          break;
        }
      }

      if (gameOver) {
        gatesRef.current = gates;
        sfx.hit();
        endGame(failColor);
        return;
      }

      const farthest = gates.length ? Math.max(...gates.map(g => g.z)) : -1;
      if (farthest < SPAWN_TRIGGER_Z) {
        const g = makeGate(lastTypeRef.current, lastColorRef.current);
        lastTypeRef.current = g.type;
        lastColorRef.current = g.color;
        gates.push(g);
      }

      gatesRef.current = gates;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    sfx.select();

    const first = makeGate(null, null);
    first.z = 1.02;
    lastTypeRef.current = first.type;
    lastColorRef.current = first.color;
    gatesRef.current = [first];
    scoreRef.current = 0;
    shapeRef.current = "cube";
    setScore(0);
    sceneRef.current?.triggerEntrance();
    sceneRef.current?.setMood("idle");
    setPhase("play");
  }, []);

  /* ── shared shape setter: every actual morph gets a matching audio tick, plus a
     fading afterimage of the old silhouette so the morph itself reads as an action ── */
  const changeShape = useCallback((next) => {
    if (next === shapeRef.current) return;
    sceneRef.current?.triggerGhost(shapeRef.current);
    shapeRef.current = next;
    sfx.shift();
  }, []);

  /* ── drag controls ── */
  const applyShapeFromDelta = (delta) => {
    let next = "cube";
    if (delta < -DRAG_THRESHOLD) next = "tall";
    else if (delta > DRAG_THRESHOLD) next = "wide";
    changeShape(next);
  };

  const onPointerDown = (e) => {
    /* menu/game-over background tap = play again; settings has its own buttons
       (which stopPropagation) and must never fall through to this */
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;
    draggingRef.current = true;
    dragStartYRef.current = e.clientY;
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current || phase !== "play") return;
    applyShapeFromDelta(e.clientY - dragStartYRef.current);
  };

  const releaseDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    changeShape("cube");
  };

  /* ── keyboard: alt input for desktop testing, mirrors drag up/down/release ── */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (draggingRef.current || phase !== "play") return;
      if ((e.key === "ArrowUp" || e.key === "w") && shapeRef.current !== "tall") {
        keyHeldRef.current = "tall";
        changeShape("tall");
      }
      if ((e.key === "ArrowDown" || e.key === "s") && shapeRef.current !== "wide") {
        keyHeldRef.current = "wide";
        changeShape("wide");
      }
    };
    const onKeyUp = (e) => {
      if (!keyHeldRef.current) return;
      if (["ArrowUp", "w", "ArrowDown", "s"].includes(e.key)) {
        keyHeldRef.current = null;
        changeShape("cube");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, changeShape]);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={releaseDrag}
      onPointerCancel={releaseDrag}
      onPointerLeave={releaseDrag}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: baseTheme.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {(phase === "play" || phase === "impact") && <ScoreHeader score={score} best={best} theme={baseTheme} />}

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Scene3D only needs to actually render while playing — the menu/game-over/
            settings screens are opaque per the brand kit (never a scrim over live
            gameplay), so nothing behind them is visible anyway; Scene3D pauses its
            own render work outside "play" instead of tearing down/rebuilding WebGL
            on every retry. */}
        <Scene3D
          ref={sceneRef}
          phase={phase}
          gatesRef={gatesRef}
          shapeRef={shapeRef}
          scoreRef={scoreRef}
          reducedMotion={reducedMotion}
        />

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            accent={ACCENT}
            title={
              <span style={{
                background: PLAYER_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text",
                color: "transparent", filter: "drop-shadow(0 0 20px rgba(123,66,255,0.35))",
              }}>MORPH</span>
            }
            preview={
              <div style={{ display: "flex", gap: 18 }}>
                {TYPES.map((t, i) => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ animation: reducedMotion ? "none" : `previewFloat 2.4s ${1.6 + i * 0.3}s ease-in-out infinite` }}>
                      <div style={{
                        width: SHAPES[t].w, height: SHAPES[t].h, borderRadius: SHAPES[t].radius,
                        background: PLAYER_GRADIENT,
                        animation: reducedMotion ? "none" : `previewPop 0.5s ${i * 0.12}s both cubic-bezier(0.34, 1.56, 0.64, 1)`,
                      }} />
                    </div>
                    <span style={{ fontSize: 14, color: baseTheme.textMuted, fontWeight: 600 }}>
                      {t === "cube" ? "hold still" : t === "tall" ? "drag up" : "drag down"}
                    </span>
                  </div>
                ))}
              </div>
            }
            description="Drag up or down to morph your shape and match each gap. Wrong shape on contact ends the run."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <GameOverCard accent={ACCENT} title="Wrong shape!" score={score} best={best} onRetry={startGame} />
        )}

        {/* ── SETTINGS ── */}
        {phase === "settings" && (
          <SettingsScreen
            accent={ACCENT}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>

      <style>{`
        @keyframes previewPop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes previewFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
