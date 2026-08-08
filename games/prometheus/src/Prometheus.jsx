import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial, showRewarded, isRewardedReady, isNativeAdPlatform } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { fontUI, fontDisplay } from "@37apps/core/theme.js";
import { useGameCanvas, canvasStyle } from "@37apps/core/canvas/useGameCanvas.js";
import { withAlpha } from "@37apps/core/canvas/color.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import { createGame, drawHero } from "./game/engine.js";
import { palette, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("prometheus.bestScore");

const DEATH_TITLE = {
  fall: "You fell!",
  bird: "The eagle caught you!",
  rock: "Crushed by a boulder!",
};

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

/* Four ember notches that fill, then burn back down as BLAZE spends itself. */
function TorchMeter({ flame, blaze }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, flame * 4 - i));
        return (
          <div key={i} style={{
            width: 20, height: 7, borderRadius: 3, overflow: "hidden",
            background: "rgba(24,23,29,0.34)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3)",
          }}>
            <div style={{
              width: `${fill * 100}%`, height: "100%", borderRadius: 3,
              background: blaze ? palette.flameHot : palette.flame,
              boxShadow: fill > 0 ? `0 0 6px ${withAlpha(palette.flame, 0.9)}` : "none",
              transition: "width 0.18s ease",
            }} />
          </div>
        );
      })}
    </div>
  );
}

function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 170 * dpr; cv.height = 150 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 170, 150, reduced ? 0.6 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 170, height: 150, display: "block" }} />;
}

export default function Prometheus() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ flame: 0, blaze: false });
  const [zoneBanner, setZoneBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("fall");

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
     flashes and shakes, then "dead" swaps in the Game Over page. */
  const endGame = useCallback((cause) => {
    if (phaseRef.current !== "play") return;
    setDeathCause(cause);
    sfx.hit();
    vibrate([18, 45, 22]);
    phaseRef.current = "impact";
    setPhase("impact");
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  const { canvasRef, engineRef } = useGameCanvas({
    create: () => createGame({
      onHop: () => { sfx.tap(); vibrate(6); },
      onEmber: () => { sfx.score(); vibrate(8); },
      onBlaze: () => { sfx.power(); vibrate([12, 30, 12]); },
      onBurn: () => { sfx.shift(); vibrate(10); },
      onDeath: (cause) => endGame(cause),
      onZone: (name) => { setZoneBanner({ name, key: Date.now() }); sfx.shift(); },
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.score), flame: g.flame, blaze: g.blaze > 0 }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud({ flame: snap.flame, blaze: snap.blaze });
    },
    deps: [endGame],
  });

  useEffect(() => {
    if (engineRef.current) engineRef.current.reduced = reduced;
  }, [reduced, engineRef]);

  useEffect(() => {
    if (!zoneBanner) return;
    const id = setTimeout(() => setZoneBanner(null), 1900);
    return () => clearTimeout(id);
  }, [zoneBanner]);

  const startGame = useCallback(() => {
    const g = engineRef.current;
    if (!g) return;
    sfx.select();
    g.reset();
    g.running = true;
    continueUsedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setHud({ flame: 0, blaze: false });
    setZoneBanner(null);
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

  /* tap = hop straight up, horizontal swipe = hop up and one column over.
     Resolved on pointer-up so a swipe is never mistaken for a tap. */
  const onPointerDown = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    engineRef.current?.pointerDown(e.clientX, e.clientY);
  }, [engineRef]);
  const onPointerUp = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.pointerUp(e.clientX, e.clientY);
  }, [engineRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (phaseRef.current !== "play") return;
      if (e.key === "ArrowLeft" || e.key === "a") engineRef.current?.key("left");
      else if (e.key === "ArrowRight" || e.key === "d") engineRef.current?.key("right");
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") engineRef.current?.key("up");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engineRef]);

  const playing = phase === "play" || phase === "impact";

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.bg, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", touchAction: "none", overflow: "hidden",
    }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={canvasStyle}
      />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 20px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          textShadow: "0 1px 12px rgba(0,0,0,0.45)",
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: "rgba(255,255,255,0.85)", textTransform: "uppercase",
            }}>Altitude</div>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 40, lineHeight: 1.05,
              color: "#FFFFFF", letterSpacing: -1,
            }}>
              {score}<span style={{ fontSize: 15, marginLeft: 3, opacity: 0.75 }}>m</span>
            </div>
            <div style={{ marginTop: 9 }}>
              <TorchMeter flame={hud.flame} blaze={hud.blaze} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: "rgba(255,255,255,0.72)", textTransform: "uppercase",
            }}>Best</div>
            <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: "#FFFFFF" }}>{best}</div>
          </div>
        </div>
      )}

      {playing && hud.blaze && (
        <div style={{
          position: "absolute", left: "50%", top: "calc(22px + env(safe-area-inset-top))",
          transform: "translateX(-50%)", zIndex: 3, pointerEvents: "none",
          padding: "6px 16px", borderRadius: 99,
          background: palette.flame, color: palette.ink,
          fontFamily: fontDisplay, fontWeight: 900, fontSize: 13, letterSpacing: "0.14em",
          boxShadow: `0 0 26px ${withAlpha(palette.flame, 0.85)}`,
          animation: reduced ? "none" : "blazeThrob 0.55s ease-in-out infinite",
        }}>BLAZE ×2</div>
      )}

      {playing && zoneBanner && (
        <div key={zoneBanner.key} style={{
          position: "absolute", left: 0, right: 0, top: "28%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "zoneIn 1.9s ease-out forwards",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.3em", fontWeight: 800,
            color: "rgba(255,255,255,0.78)", textTransform: "uppercase",
          }}>Entering</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 34, letterSpacing: "0.06em",
            color: "#FFFFFF", textShadow: `0 0 34px ${withAlpha(palette.flame, 0.9)}`,
          }}>{zoneBanner.name}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: palette.accent, animation: "impactFlash 0.3s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.accent}
          title={
            <span style={{
              background: `linear-gradient(135deg, ${palette.flame}, ${palette.accent} 58%, #C2201F)`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: `drop-shadow(0 0 22px ${withAlpha(palette.accent, 0.4)})`,
              fontSize: 38, letterSpacing: 0.5,
            }}>PROMETHEUS</span>
          }
          preview={
            <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
              {/* signature motif: the fire's glow, the same radial the brand kit
                  specs behind a game's icon on its menu */}
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                width: 190, height: 190, borderRadius: "50%",
                background: `radial-gradient(circle, ${withAlpha(palette.flame, 0.42)} 0%, transparent 68%)`,
                filter: "blur(4px)",
              }} />
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Carry the stolen fire up the mountain to Olympus. Tap to leap to the ledge above, swipe to leap diagonally. Clouds crumble underfoot, storm clouds aren't there at all — and the eagle is always watching."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.accent}
          title={DEATH_TITLE[deathCause] || "You fell!"}
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
          accent={palette.accent}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes impactFlash { 0% { opacity: 0.55; } 100% { opacity: 0; } }
        @keyframes blazeThrob {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.07); }
        }
        @keyframes zoneIn {
          0%   { opacity: 0; transform: translateY(14px) scale(0.94); }
          14%  { opacity: 1; transform: translateY(0) scale(1); }
          72%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-16px) scale(1); }
        }
      `}</style>
    </div>
  );
}
