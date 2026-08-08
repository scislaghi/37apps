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

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("line.bestScore");

const DEATH_TITLE = {
  bar: "Blocked!",
  arc: "Clipped the arc!",
  blade: "Sliced!",
  gate: "Missed the gate!",
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

/* ── Charge meter: four notches that fill, then burn back down as SURGE
   spends itself. On a dark field the track is a light hairline — the inverse
   of the light-field games, for the same reason: contrast against the ground
   it actually sits on. ── */
function ChargeMeter({ charge, surge }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, charge * 4 - i));
        return (
          <div key={i} style={{
            width: 20, height: 6, borderRadius: 3, overflow: "hidden",
            background: "rgba(255,255,255,0.12)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
          }}>
            <div style={{
              width: `${fill * 100}%`, height: "100%", borderRadius: 3,
              background: surge ? palette.lineHot : palette.orb,
              boxShadow: fill > 0 ? `0 0 8px ${withAlpha(palette.orb, 0.9)}` : "none",
              transition: "width 0.18s ease",
            }} />
          </div>
        );
      })}
    </div>
  );
}

/** Menu hero — the same trail/head renderer as gameplay. */
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
      drawHero(ctx, 170, 150, reduced ? 0.8 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 170, height: 150, display: "block" }} />;
}

export default function Line() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ charge: 0, surge: false });
  const [zoneBanner, setZoneBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("bar");

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
      onOrb: () => { sfx.score(); vibrate(8); },
      onSurge: () => { sfx.power(); vibrate([12, 30, 12]); },
      onCut: () => { sfx.shift(); vibrate(10); },
      onDeath: (cause) => endGame(cause),
      onZone: (name) => { setZoneBanner({ name, key: Date.now() }); sfx.shift(); },
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.score), charge: g.charge, surge: g.surge > 0 }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud({ charge: snap.charge, surge: snap.surge });
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
    setHud({ charge: 0, surge: false });
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

  /* relative drag: absolute follow would park the player's thumb on top of
     the tip, and the tip is the one thing they need to watch */
  const onPointerDown = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    engineRef.current?.pointerDown(e.clientX);
  }, [engineRef]);
  const onPointerMove = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.pointerMove(e.clientX);
  }, [engineRef]);
  const onPointerUp = useCallback(() => { engineRef.current?.pointerUp(); }, [engineRef]);

  useEffect(() => {
    const set = (d) => engineRef.current?.setKeyDir(d);
    const down = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") set(-1);
      if (e.key === "ArrowRight" || e.key === "d") set(1);
    };
    const up = (e) => { if (["ArrowLeft", "a", "ArrowRight", "d"].includes(e.key)) set(0); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [engineRef]);

  const playing = phase === "play" || phase === "impact";

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.ink, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", touchAction: "none", overflow: "hidden",
    }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={canvasStyle}
      />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 20px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: "rgba(255,255,255,0.55)", textTransform: "uppercase",
            }}>Distance</div>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 40, lineHeight: 1.05,
              color: "#FFFFFF", letterSpacing: -1,
              textShadow: `0 0 24px ${withAlpha(palette.line, 0.5)}`,
            }}>
              {score}<span style={{ fontSize: 15, marginLeft: 3, opacity: 0.6 }}>m</span>
            </div>
            <div style={{ marginTop: 9 }}>
              <ChargeMeter charge={hud.charge} surge={hud.surge} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
            }}>Best</div>
            <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: "rgba(255,255,255,0.85)" }}>{best}</div>
          </div>
        </div>
      )}

      {playing && hud.surge && (
        <div style={{
          position: "absolute", left: "50%", top: "calc(22px + env(safe-area-inset-top))",
          transform: "translateX(-50%)", zIndex: 3, pointerEvents: "none",
          padding: "6px 16px", borderRadius: 99,
          background: palette.line, color: palette.ink,
          fontFamily: fontDisplay, fontWeight: 900, fontSize: 13, letterSpacing: "0.14em",
          boxShadow: `0 0 26px ${withAlpha(palette.line, 0.9)}`,
          animation: reduced ? "none" : "surgeThrob 0.55s ease-in-out infinite",
        }}>SURGE ×2</div>
      )}

      {playing && zoneBanner && (
        <div key={zoneBanner.key} style={{
          position: "absolute", left: 0, right: 0, top: "30%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "zoneIn 1.9s ease-out forwards",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.3em", fontWeight: 800,
            color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
          }}>Sector</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 34, letterSpacing: "0.08em",
            color: "#FFFFFF", textShadow: `0 0 34px ${withAlpha(palette.line, 0.8)}`,
          }}>{zoneBanner.name}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: palette.line, animation: "impactFlash 0.3s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.bar}
          title={
            <span style={{
              background: `linear-gradient(135deg, ${palette.line}, ${palette.arc} 55%, ${palette.bar})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: `drop-shadow(0 0 22px ${withAlpha(palette.line, 0.35)})`,
              fontSize: 46, letterSpacing: 2,
            }}>LINE</span>
          }
          preview={
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden",
              background: palette.ink, padding: 4,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.08), 0 14px 30px -18px rgba(0,0,0,0.6)`,
            }}>
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Draw one unbroken line as far as you can. Drag to steer — dodge bars, arcs, blades and gates, and grab orbs to charge a SURGE that cuts straight through them."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.bar}
          title={DEATH_TITLE[deathCause] || "Broken!"}
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
          accent={palette.bar}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes impactFlash { 0% { opacity: 0.5; } 100% { opacity: 0; } }
        @keyframes surgeThrob {
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
