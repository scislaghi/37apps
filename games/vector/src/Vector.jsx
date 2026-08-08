import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial, showRewarded, isRewardedReady, isNativeAdPlatform } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { fontUI, fontDisplay } from "@37apps/core/theme.js";
import { useGameCanvas, canvasStyle } from "@37apps/core/canvas/useGameCanvas.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import { createGame, drawHero } from "./game/engine.js";
import { palette, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("vector.bestScore");

const DEATH_TITLE = {
  top: "Clipped the ceiling!",
  bot: "Hit the floor!",
};

/* ── The corridor's black mass can sit anywhere, including directly under the
   score, and the corridor's light interior can too — so HUD text is dark ink
   carrying its own thick light outline instead of sitting on a scrim. A scrim
   was the first attempt and it hid the ceiling whenever the corridor rode
   high, which is worse than an unreadable score. ── */
const HUD_INK = {
  color: palette.text,
  WebkitTextStrokeWidth: "4px",
  WebkitTextStrokeColor: "rgba(247,245,242,0.92)",
  paintOrder: "stroke fill",
};
const HUD_LABEL = {
  ...HUD_INK,
  WebkitTextStrokeWidth: "3px",
  color: palette.textMuted,
};

/** Respects the OS motion preference — shake and particle counts gate off it. */
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

/** Menu hero — the same dart, ribbon and wall renderer as gameplay. */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 232 * dpr; cv.height = 128 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 232, 128, reduced ? 0.6 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 232, height: 128, display: "block" }} />;
}

export default function Vector() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const [deathSide, setDeathSide] = useState("bot");

  const phaseRef = useRef("start");
  const bestLoadedRef = useRef(false);
  const continueUsedRef = useRef(false);
  const scoreRef = useRef(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
    initHaptics();
  }, []);

  useEffect(() => {
    loadBestScore().then(stored => { setBest(stored); bestLoadedRef.current = true; });
  }, []);

  useEffect(() => {
    if (!bestLoadedRef.current) return;
    saveBestScore(best);
  }, [best]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* death is two beats: "impact" keeps the wreckage on screen while the frame
     flashes and shakes, then "dead" swaps in the Game Over page. The
     interstitial fires on RETRY rather than on death, so a player offered a
     rewarded continue only ever sits through one ad. */
  const endGame = useCallback((side) => {
    if (phaseRef.current !== "play") return;
    setDeathSide(side);
    sfx.hit();
    vibrate([18, 45, 22]);
    phaseRef.current = "impact";
    setPhase("impact");
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  const { canvasRef, engineRef } = useGameCanvas({
    create: () => createGame({
      onFlap: () => sfx.tap(),
      onMilestone: (m) => { sfx.score(); setMilestone({ m, key: `ms-${Date.now()}` }); },
      onDeath: (side) => endGame(side),
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.score) }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
    },
    deps: [endGame],
  });

  useEffect(() => {
    if (engineRef.current) engineRef.current.reduced = reduced;
  }, [reduced, engineRef]);

  useEffect(() => {
    if (!milestone) return;
    const id = setTimeout(() => setMilestone(null), 1300);
    return () => clearTimeout(id);
  }, [milestone]);

  const startGame = useCallback(() => {
    const g = engineRef.current;
    if (!g) return;
    sfx.select();
    g.reset();
    g.running = true;
    continueUsedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setMilestone(null);
    phaseRef.current = "play";
    setPhase("play");
  }, [engineRef]);

  const handleRetry = useCallback(() => {
    showInterstitial(AD_IDS);
    startGame();
  }, [startGame]);

  const handleWatchAdContinue = useCallback(async () => {
    const reward = await showRewarded(AD_IDS);
    if (!reward) return false;
    continueUsedRef.current = true;
    engineRef.current.revive();
    phaseRef.current = "play";
    setPhase("play");
    return true;
  }, [engineRef]);

  const flap = useCallback(() => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.flap();
  }, [engineRef]);

  useEffect(() => {
    const down = (e) => {
      if (e.key !== " " && e.key !== "ArrowUp" && e.key !== "w") return;
      e.preventDefault();
      flap();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [flap]);

  const playing = phase === "play" || phase === "impact";

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.ink, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", touchAction: "none", overflow: "hidden",
    }}>
      <canvas ref={canvasRef} onPointerDown={flap} style={canvasStyle} />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 20px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{
              ...HUD_LABEL, fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              textTransform: "uppercase",
            }}>Score</div>
            <div style={{
              ...HUD_INK, fontFamily: fontDisplay, fontWeight: 900, fontSize: 42,
              lineHeight: 1.05, letterSpacing: -1,
            }}>{score}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              ...HUD_LABEL, fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              textTransform: "uppercase",
            }}>Best</div>
            <div style={{ ...HUD_INK, fontFamily: fontDisplay, fontWeight: 800, fontSize: 18 }}>{best}</div>
          </div>
        </div>
      )}

      {playing && milestone && (
        <div key={milestone.key} style={{
          position: "absolute", left: 0, right: 0, top: "34%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "milestoneIn 1.3s ease-out forwards",
        }}>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 54, letterSpacing: -2,
            color: palette.arrow, opacity: 0.3,
          }}>{milestone.m}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: palette.arrow, animation: "impactFlash 0.3s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.arrow}
          title={
            <span style={{
              background: `linear-gradient(120deg, ${palette.arrow}, ${palette.arrowSecond})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              fontSize: 46, letterSpacing: 2,
            }}>VECTOR</span>
          }
          preview={
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden",
              boxShadow: "0 0 0 1px rgba(24,23,29,0.08), 0 16px 34px -20px rgba(24,23,29,0.6)",
            }}>
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Tap to lift the dart. The corridor narrows, the walls grow teeth, and the nose always points where you're about to be."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.arrow}
          title={DEATH_TITLE[deathSide] || "Crashed!"}
          score={score}
          best={best}
          onRetry={handleRetry}
          onWatchAdContinue={
            !continueUsedRef.current && isNativeAdPlatform() && isRewardedReady()
              ? handleWatchAdContinue
              : undefined
          }
        />
      )}

      {phase === "settings" && (
        <SettingsScreen
          accent={palette.arrow}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes impactFlash { 0% { opacity: 0.45; } 100% { opacity: 0; } }
        @keyframes milestoneIn {
          0%   { opacity: 0; transform: scale(0.86); }
          18%  { opacity: 1; transform: scale(1); }
          70%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.06); }
        }
      `}</style>
    </div>
  );
}
