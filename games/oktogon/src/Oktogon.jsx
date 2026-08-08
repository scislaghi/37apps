import { useState, useEffect, useRef, useCallback } from "react";
import { animated } from "@react-spring/web";
import { initAds, showInterstitial, showRewarded, isRewardedReady, isNativeAdPlatform } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { fontUI, fontDisplay } from "@37apps/core/theme.js";
import { useScorePop } from "@37apps/core/animation.js";
import { useGameCanvas, canvasStyle } from "@37apps/core/canvas/useGameCanvas.js";
import { withAlpha } from "@37apps/core/canvas/color.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";
import { createGame } from "./game/engine.js";
import { drawHero } from "./game/render.js";
import { SIDE_COLORS, ACCENT, palette, STREAK_BANNERS, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("oktogon.bestScore");

/** Respects the OS motion preference — shake, squash and particle counts gate off it. */
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

/* ── Menu hero: the mechanic on loop, drawn with the gameplay renderer. ── */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 180 * dpr; cv.height = 160 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      /* reduced motion gets a held frame mid-landing rather than the loop */
      drawHero(ctx, 180, 160, reduced ? 1.45 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 180, height: 160, display: "block" }} />;
}

/** Swatch showing the colour of the ball queued behind the current one. */
function NextChip({ color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.18em", fontWeight: 800,
        color: palette.inkMuted, textTransform: "uppercase",
      }}>Next</div>
      <div style={{
        width: 16, height: 16, borderRadius: "50%", background: color,
        boxShadow: `0 0 12px ${withAlpha(color, 0.6)}`,
        transition: "background 0.2s ease",
      }} />
    </div>
  );
}

/* ── Tap-zone hint: two chevrons that fade out once the player has clearly
   understood the control. Shown for the first few balls of the first runs
   only — a permanent overlay would just be chrome in every screenshot.
   They live in the band *below* the octagon: the octagon spans the full
   width at its waist, so side-mounted hints would sit on top of the coloured
   sides, which are the one thing that must stay unobstructed. ── */
function TapHints({ visible }) {
  const chevron = (dir) => (
    <div style={{
      position: "absolute", bottom: "9%", [dir === -1 ? "left" : "right"]: "16%",
      display: "flex", flexDirection: "column",
      alignItems: "center", gap: 6, pointerEvents: "none",
      opacity: visible ? 1 : 0, transition: "opacity 0.45s ease",
      animation: visible ? `hintFloat${dir === -1 ? "L" : "R"} 1.6s ease-in-out infinite` : "none",
    }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
        stroke={palette.inkMuted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === -1 ? <path d="M15 5 8 12l7 7" /> : <path d="m9 5 7 7-7 7" />}
      </svg>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
        color: palette.inkMuted, textTransform: "uppercase",
      }}>Tap</span>
    </div>
  );
  return <>{chevron(-1)}{chevron(1)}</>;
}

export default function Oktogon() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [nextColor, setNextColor] = useState(SIDE_COLORS[0]);
  const [banner, setBanner] = useState(null);
  const [ripple, setRipple] = useState(null);

  const phaseRef = useRef("start");
  const scoreRef = useRef(0);
  const bestLoadedRef = useRef(false);
  const continueUsedRef = useRef(false);
  const reduced = usePrefersReducedMotion();
  const scorePop = useScorePop(score);

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

  /* Death is two beats: "impact" holds the wreck on screen through the shake
     and the red vignette, then "dead" swaps in the Game Over page. The
     interstitial fires on RETRY, not on death, so a player who takes the
     rewarded continue only ever sits through one ad. */
  const endGame = useCallback(() => {
    if (phaseRef.current !== "play") return;
    sfx.hit();
    vibrate([18, 45, 22]);
    phaseRef.current = "impact";
    setPhase("impact");
    setStreak(0);
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  const handleMatch = useCallback((newScore, newStreak) => {
    sfx.score();
    vibrate(newStreak >= 5 ? [10, 20, 14] : 9);
    scoreRef.current = newScore;
    setScore(newScore);
    setStreak(newStreak);
    if (STREAK_BANNERS.includes(newStreak)) {
      sfx.power();
      setBanner({ streak: newStreak, key: Date.now() });
    }
  }, []);

  const { canvasRef, engineRef } = useGameCanvas({
    create: () => createGame({
      onMatch: handleMatch,
      onMiss: endGame,
      onRotate: () => { sfx.shift(); vibrate(6); },
      onSpawn: (_color, queued) => setNextColor(SIDE_COLORS[queued]),
    }),
    onReady: (g) => {
      g.reduced = reduced;
      g.reset();
      /* dev-only handle so a headless browser can play the game for tuning
         and screenshots; stripped from production builds */
      if (import.meta.env.DEV) window.__oktogon = g;
    },
    isRunning: () => phaseRef.current === "play",
    deps: [endGame, handleMatch],
  });

  useEffect(() => {
    if (engineRef.current) engineRef.current.reduced = reduced;
  }, [reduced, engineRef]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1500);
    return () => clearTimeout(id);
  }, [banner]);

  useEffect(() => {
    if (!ripple) return;
    const id = setTimeout(() => setRipple(null), 420);
    return () => clearTimeout(id);
  }, [ripple]);

  const startGame = useCallback(() => {
    const g = engineRef.current;
    if (!g) return;
    sfx.select();
    g.reset();
    continueUsedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setStreak(0);
    setNextColor(SIDE_COLORS[g.nextColor]);
    setBanner(null);
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
    setStreak(0);
    phaseRef.current = "play";
    setPhase("play");
    return true;
  }, [engineRef]);

  /* Left half = counter-clockwise, right half = clockwise. Split on the
     pointer's x against the viewport centre so it works the same whichever
     hand is holding the phone. */
  const rotate = useCallback((dir, x, y) => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.rotate(dir);
    setRipple({ x, y, dir, key: performance.now() });
  }, [engineRef]);

  const onPointerDown = useCallback((e) => {
    const dir = e.clientX < window.innerWidth / 2 ? -1 : 1;
    rotate(dir, e.clientX, e.clientY);
  }, [rotate]);

  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const w = window.innerWidth, h = window.innerHeight;
      if (e.key === "ArrowLeft" || e.key === "a") rotate(-1, w * 0.2, h * 0.5);
      if (e.key === "ArrowRight" || e.key === "d") rotate(1, w * 0.8, h * 0.5);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [rotate]);

  const playing = phase === "play" || phase === "impact";
  /* the control hint earns its place only while the player is still learning:
     first handful of balls, and only before they've ever posted a real score */
  const showHints = phase === "play" && score < 3 && best < 5;

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.bg, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", touchAction: "none", overflow: "hidden",
    }}>
      <canvas ref={canvasRef} onPointerDown={onPointerDown} style={canvasStyle} />

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, pointerEvents: "none",
          padding: "calc(14px + env(safe-area-inset-top)) 22px 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: "0.18em", fontWeight: 800,
              color: palette.inkMuted, textTransform: "uppercase",
            }}>Matched</div>
            <animated.div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 44, lineHeight: 1.05,
              color: palette.ink, letterSpacing: -1.5,
              transform: scorePop.scale.to(s => `scale(${s})`), transformOrigin: "left center",
            }}>
              {score}
            </animated.div>
            {streak >= 3 && (
              <div style={{
                marginTop: 4, fontFamily: fontDisplay, fontWeight: 900, fontSize: 13,
                letterSpacing: "0.08em", color: ACCENT,
              }}>
                STREAK ×{streak}
              </div>
            )}
          </div>

          <div style={{ paddingTop: 4 }}>
            <NextChip color={nextColor} />
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.18em", fontWeight: 800,
              color: palette.inkMuted, textTransform: "uppercase",
            }}>Best</div>
            <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: palette.ink }}>
              {best}
            </div>
          </div>
        </div>
      )}

      {playing && <TapHints visible={showHints} />}

      {ripple && (
        <div key={ripple.key} style={{
          position: "absolute", left: ripple.x, top: ripple.y, zIndex: 3,
          width: 74, height: 74, marginLeft: -37, marginTop: -37, borderRadius: "50%",
          border: `2px solid ${withAlpha(ACCENT, 0.5)}`, pointerEvents: "none",
          animation: "tapRipple 0.42s ease-out forwards",
        }} />
      )}

      {playing && banner && (
        <div key={banner.key} style={{
          position: "absolute", left: 0, right: 0, top: "22%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "bannerIn 1.5s ease-out forwards",
        }}>
          <div style={{
            display: "inline-block", padding: "8px 20px", borderRadius: 99,
            background: ACCENT, color: "#FFFFFF",
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 15, letterSpacing: "0.12em",
            boxShadow: `0 10px 30px -12px ${withAlpha(ACCENT, 0.9)}`,
          }}>
            {banner.streak} IN A ROW
          </div>
        </div>
      )}

      {phase === "start" && (
        <StartScreen
          accent={ACCENT}
          title={
            <span style={{
              background: `linear-gradient(100deg, ${SIDE_COLORS[0]}, ${SIDE_COLORS[3]} 45%, ${SIDE_COLORS[6]})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              fontSize: 46, letterSpacing: 1,
            }}>OKTOGON</span>
          }
          preview={<HeroPreview reduced={reduced} />}
          description="A coloured ball drops from the centre of the octagon. Spin the octagon so the side it lands on matches — tap right to turn clockwise, left to turn back. One wrong side ends the run."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={ACCENT}
          title="Wrong side!"
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
          accent={ACCENT}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes tapRipple {
          0%   { opacity: 0.85; transform: scale(0.35); }
          100% { opacity: 0; transform: scale(1.25); }
        }
        @keyframes bannerIn {
          0%   { opacity: 0; transform: translateY(14px) scale(0.9); }
          12%  { opacity: 1; transform: translateY(0) scale(1); }
          75%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-14px) scale(1); }
        }
        @keyframes hintFloatL {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(-5px); }
        }
        @keyframes hintFloatR {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
