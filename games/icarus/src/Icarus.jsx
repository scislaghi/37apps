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
import { palette, IMPACT_MS, WAX_WARN } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("icarus.bestScore");

const DEATH_TITLE = {
  melt: "Your wings melted!",
  sea: "Lost to the sea!",
  spire: "Dashed on the rocks!",
  crag: "Dashed on the rocks!",
  gull: "Struck by a gull!",
  storm: "Lost in the storm!",
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

/**
 * The wax gauge — a continuous bar rather than notches, because it moves
 * continuously in both directions and a notched meter would imply steps that
 * aren't there. It turns coral past the warning threshold and pulses once the
 * melt is genuinely close.
 */
function WaxMeter({ wax, reduced }) {
  const hot = wax >= WAX_WARN;
  const critical = wax >= 0.8;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
        color: "rgba(255,255,255,0.8)", textTransform: "uppercase",
      }}>Wax</span>
      <div style={{
        width: 92, height: 8, borderRadius: 4, overflow: "hidden",
        background: "rgba(24,23,29,0.3)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3)",
      }}>
        <div style={{
          width: `${Math.min(100, wax * 100)}%`, height: "100%", borderRadius: 4,
          background: hot ? palette.accentHot : palette.accent,
          boxShadow: `0 0 8px ${withAlpha(hot ? palette.accentHot : palette.accent, 0.9)}`,
          transition: "width 0.12s linear, background 0.3s ease",
          animation: critical && !reduced ? "waxPulse 0.4s ease-in-out infinite" : "none",
        }} />
      </div>
    </div>
  );
}

function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 180 * dpr; cv.height = 140 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 180, 140, reduced ? 0.5 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 180, height: 140, display: "block" }} />;
}

export default function Icarus() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ wax: 0, charge: 0, glide: false });
  const [zoneBanner, setZoneBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("sea");

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
      onFlap: () => { sfx.tap(); vibrate(5); },
      onFeather: () => { sfx.score(); vibrate(8); },
      onGlide: () => { sfx.power(); vibrate([12, 30, 12]); },
      onBurn: () => { sfx.shift(); vibrate(10); },
      onDeath: (cause) => endGame(cause),
      onZone: (name) => { setZoneBanner({ name, key: Date.now() }); sfx.shift(); },
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.score), wax: g.wax, charge: g.charge, glide: g.glide > 0 }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud({ wax: snap.wax, charge: snap.charge, glide: snap.glide });
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
    setHud({ wax: 0, charge: 0, glide: false });
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

  const onPointerDown = useCallback(() => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.flap();
  }, [engineRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (phaseRef.current !== "play") return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") {
        e.preventDefault();
        engineRef.current?.flap();
      }
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
      <canvas ref={canvasRef} onPointerDown={onPointerDown} style={canvasStyle} />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 20px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          textShadow: "0 1px 12px rgba(0,0,0,0.4)",
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: "rgba(255,255,255,0.85)", textTransform: "uppercase",
            }}>Distance</div>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 40, lineHeight: 1.05,
              color: "#FFFFFF", letterSpacing: -1,
            }}>
              {score}<span style={{ fontSize: 15, marginLeft: 3, opacity: 0.75 }}>m</span>
            </div>
            <div style={{ marginTop: 9 }}>
              <WaxMeter wax={hud.wax} reduced={reduced} />
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

      {playing && hud.glide && (
        <div style={{
          position: "absolute", left: "50%", top: "calc(22px + env(safe-area-inset-top))",
          transform: "translateX(-50%)", zIndex: 3, pointerEvents: "none",
          padding: "6px 16px", borderRadius: 99,
          background: palette.hot, color: palette.ink,
          fontFamily: fontDisplay, fontWeight: 900, fontSize: 13, letterSpacing: "0.14em",
          boxShadow: `0 0 26px ${withAlpha(palette.hot, 0.9)}`,
          animation: reduced ? "none" : "glideThrob 0.55s ease-in-out infinite",
        }}>GLIDE ×2</div>
      )}

      {playing && zoneBanner && (
        <div key={zoneBanner.key} style={{
          position: "absolute", left: 0, right: 0, top: "44%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "zoneIn 1.9s ease-out forwards",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.3em", fontWeight: 800,
            color: "rgba(255,255,255,0.8)", textTransform: "uppercase",
          }}>Entering</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 34, letterSpacing: "0.06em",
            color: "#FFFFFF", textShadow: `0 0 34px ${withAlpha(palette.accentHot, 0.9)}`,
          }}>{zoneBanner.name}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: deathCause === "sea" ? palette.sea : palette.accentHot,
          animation: "impactFlash 0.3s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.accent}
          title={
            <span style={{
              background: `linear-gradient(135deg, ${palette.hot}, ${palette.accent} 50%, ${palette.accentHot})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: `drop-shadow(0 0 22px ${withAlpha(palette.accent, 0.45)})`,
              fontSize: 42, letterSpacing: 1,
            }}>ICARUS</span>
          }
          preview={
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden", padding: 4,
              /* his wings are white: on the light menu ground they disappear, so
                 the preview carries the warm sky he actually flies in */
              background: `linear-gradient(180deg, ${palette.accent}, #FFD79A 55%, ${palette.sea})`,
              boxShadow: "0 14px 30px -18px rgba(0,0,0,0.55)",
            }}>
              {/* signature motif: the sun's glare, the thing that will kill you */}
              <div style={{
                position: "absolute", top: "16%", left: "50%", transform: "translate(-50%,-50%)",
                width: 170, height: 170, borderRadius: "50%",
                background: `radial-gradient(circle, ${withAlpha(palette.hot, 0.9)} 0%, transparent 66%)`,
              }} />
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Tap to flap. Fly too high and the sun melts the wax from your wings; fly too low and the sea takes you. Thread the middle, dodge the rocks and gulls, and catch feathers to cool down."
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
        @keyframes glideThrob {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.07); }
        }
        @keyframes waxPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.5); }
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
