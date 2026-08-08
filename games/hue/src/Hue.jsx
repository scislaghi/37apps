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
import { createGame } from "./game/engine.js";
import { drawHero } from "./game/sprites.js";
import { palette, HUES, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("hue.bestScore");

const DEATH_TITLE = {
  colour: "Wrong colour!",
  fall: "Dropped it!",
};

/** Respects the OS motion preference — shake, pulses and particle counts. */
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

/** Menu hero — the same ring, switcher and ball the game draws. */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 190 * dpr; cv.height = 196 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      /* clamped at zero: a rAF timestamp is the *frame start*, which can
         predate the performance.now() captured while that same frame was
         already running — an unclamped t goes negative on the first frame */
      const t = reduced ? 1.2 : Math.max(0, (now - t0) / 1000);
      /* the preview cycles through all four hues on its own — the title screen
         states the whole rule (this ball, that arc) before anyone taps PLAY */
      drawHero(ctx, 190, 196, t, Math.floor(t / 2.4) % 4);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 190, height: 196, display: "block" }} />;
}

export default function Hue() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ cleared: 0, hue: 0 });
  const [zoneBanner, setZoneBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("colour");

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

  /* death is two beats: "impact" holds the wreckage on screen while the frame
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
      onPass: () => { sfx.score(); vibrate(7); },
      onSwitch: () => { sfx.shift(); vibrate(10); },
      onDeath: (cause) => endGame(cause),
      onZone: (name) => { setZoneBanner({ name, key: Date.now() }); sfx.select(); },
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.metres), cleared: g.combo, hue: g.hue }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud({ cleared: snap.cleared, hue: snap.hue });
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
    setHud({ cleared: 0, hue: g.hue });
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

  const handleTap = useCallback(() => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.jump();
    sfx.tap();
  }, [engineRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" && e.code !== "ArrowUp") return;
      e.preventDefault();
      handleTap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleTap]);

  const playing = phase === "play" || phase === "impact";
  const hueHex = HUES[hud.hue];

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.bg, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", touchAction: "none", overflow: "hidden",
    }}>
      <canvas ref={canvasRef} onPointerDown={handleTap} style={canvasStyle} />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 20px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: palette.inkSoft, textTransform: "uppercase",
            }}>Distance</div>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 40, lineHeight: 1.05,
              color: palette.ink, letterSpacing: -1,
            }}>
              {score}<span style={{ fontSize: 15, marginLeft: 3, opacity: 0.55 }}>m</span>
            </div>
            {hud.cleared > 0 && (
              <div style={{
                marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 10px 3px 7px", borderRadius: 99,
                background: withAlpha(hueHex, 0.14),
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: hueHex }} />
                <span style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 12, color: palette.ink }}>
                  {hud.cleared} cleared
                </span>
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: palette.inkSoft, textTransform: "uppercase",
            }}>Best</div>
            <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: palette.ink }}>{best}</div>
          </div>
        </div>
      )}

      {/* first-run coaching: one line, gone the moment the first ring is cleared */}
      {phase === "play" && hud.cleared === 0 && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: "18%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: reduced ? "none" : "hintBob 1.6s ease-in-out infinite",
        }}>
          <div style={{
            display: "inline-block", padding: "8px 18px", borderRadius: 99,
            background: "rgba(255,255,255,0.86)", boxShadow: "0 6px 20px -12px rgba(24,23,29,0.5)",
            fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: palette.inkSoft,
          }}>
            TAP TO RISE · MATCH YOUR COLOUR
          </div>
        </div>
      )}

      {playing && zoneBanner && (
        <div key={zoneBanner.key} style={{
          position: "absolute", left: 0, right: 0, top: "26%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "zoneIn 1.9s ease-out forwards",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.3em", fontWeight: 800,
            color: palette.inkSoft, textTransform: "uppercase",
          }}>Altitude</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 34, letterSpacing: "0.08em",
            color: palette.ink,
          }}>{zoneBanner.name}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: hueHex, animation: "impactFlash 0.3s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.ui}
          title={
            <span style={{
              background: `linear-gradient(115deg, ${HUES[0]}, ${HUES[1]} 32%, ${HUES[2]} 64%, ${HUES[3]})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              fontSize: 46, letterSpacing: 1,
            }}>HUE</span>
          }
          preview={<HeroPreview reduced={reduced} />}
          description="Tap to keep the ball climbing. Every ring, bar and blade is four colours — you only pass through the one you are. Grab a pinwheel and you become something else."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.ui}
          title={DEATH_TITLE[deathCause] || "Gone!"}
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
          accent={palette.ui}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes impactFlash { 0% { opacity: 0.42; } 100% { opacity: 0; } }
        @keyframes hintBob {
          0%, 100% { transform: translateY(0); opacity: 0.9; }
          50% { transform: translateY(-7px); opacity: 1; }
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
