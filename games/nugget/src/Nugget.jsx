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
import { createGame, drawHero } from "./game/engine.js";
import { palette, ACCENT, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("nugget.bestScore");

const DEATH_TITLE = {
  crush: "Crushed!",
  smash: "Hit the rubble!",
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

/** The nugget glyph — same faceted silhouette as the collectible on the field. */
function NuggetIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11 3.4 L18.6 6.2 L21 13.2 L16.4 19.6 L8.2 20.4 L3.2 15 L4 7.6 Z"
        fill={palette.gold}
      />
      <path d="M11 3.4 L4 7.6 L9.6 10.2 Z" fill={palette.goldHot} />
    </svg>
  );
}

/** Menu hero — the same miner/nugget/boulder renderer as gameplay. */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 210 * dpr; cv.height = 132 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 210, 132, reduced ? 1.2 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 210, height: 132, display: "block" }} />;
}

export default function Nugget() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [depth, setDepth] = useState(0);
  const [vein, setVein] = useState(null);
  const [deathCause, setDeathCause] = useState("crush");

  const phaseRef = useRef("start");
  const bestLoadedRef = useRef(false);
  const continueUsedRef = useRef(false);
  const scoreRef = useRef(0);
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

  /* death is two beats: "impact" keeps the wreckage on screen while the frame
     flashes and shakes, then "dead" swaps in the Game Over page. The
     interstitial fires on RETRY rather than on death, so a player offered a
     rewarded continue only ever sits through one ad. */
  const endGame = useCallback((cause) => {
    if (phaseRef.current !== "play") return;
    setDeathCause(cause);
    sfx.hit();
    vibrate([22, 50, 26]);
    phaseRef.current = "impact";
    setPhase("impact");
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  const { canvasRef, engineRef } = useGameCanvas({
    create: () => createGame({
      onGold: () => { sfx.score(); vibrate(9); },
      onHop: () => { sfx.shift(); vibrate(6); },
      onLand: () => { vibrate(11); },
      onRumble: () => { sfx.select(); },
      onVein: (n) => { sfx.power(); vibrate([10, 24, 14]); setVein({ n, key: Date.now() }); },
      onDeath: (cause) => endGame(cause),
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: g.score, depth: Math.floor(g.depth) }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setDepth(snap.depth);
    },
    deps: [endGame],
  });

  useEffect(() => {
    if (engineRef.current) engineRef.current.reduced = reduced;
  }, [reduced, engineRef]);

  useEffect(() => {
    if (!vein) return;
    const id = setTimeout(() => setVein(null), 1500);
    return () => clearTimeout(id);
  }, [vein]);

  const startGame = useCallback(() => {
    const g = engineRef.current;
    if (!g) return;
    sfx.select();
    g.reset();
    g.running = true;
    continueUsedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setDepth(0);
    setVein(null);
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

  /* ── input: swipe up/down, or tap above/below the tunnel you're in. Both
     resolve on pointer *up* so a swipe is never also read as a tap. ── */
  const dragRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { y: e.clientY, fired: false };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.fired || phaseRef.current !== "play") return;
    const dy = e.clientY - d.y;
    /* a swipe fires the moment it clears the threshold, not on release —
       waiting for the finger to lift costs a hop the player already asked for */
    if (Math.abs(dy) > 26) {
      engineRef.current?.hop(dy < 0 ? -1 : 1);
      d.fired = true;
    }
  }, [engineRef]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.fired || phaseRef.current !== "play") return;
    engineRef.current?.tapAt(e.clientY);
  }, [engineRef]);

  useEffect(() => {
    const down = (e) => {
      if (phaseRef.current !== "play") return;
      if (e.key === "ArrowUp" || e.key === "w") engineRef.current?.hop(-1);
      if (e.key === "ArrowDown" || e.key === "s") engineRef.current?.hop(1);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [engineRef]);

  const playing = phase === "play" || phase === "impact";

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.void, fontFamily: fontUI,
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
              color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
            }}>Nuggets</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
              <NuggetIcon size={22} />
              <animated.span style={{
                fontFamily: fontDisplay, fontWeight: 900, fontSize: 42, lineHeight: 1.05,
                color: "#FFFFFF", letterSpacing: -1, display: "inline-block",
                textShadow: `0 0 26px ${withAlpha(palette.gold, 0.55)}`,
                transform: scorePop.scale.to(k => `scale(${k})`),
              }}>{score}</animated.span>
            </div>
            <div style={{
              marginTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
            }}>
              Depth {depth} m
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

      {playing && vein && (
        <div key={vein.key} style={{
          position: "absolute", left: 0, right: 0, top: "28%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "veinIn 1.5s ease-out forwards",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.3em", fontWeight: 800,
            color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
          }}>Rich seam</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 36, letterSpacing: "0.06em",
            color: palette.goldHot, textShadow: `0 0 34px ${withAlpha(palette.gold, 0.8)}`,
          }}>VEIN ×{vein.n}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: palette.danger, animation: "impactFlash 0.34s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={ACCENT}
          title={
            <span style={{
              background: `linear-gradient(135deg, ${palette.goldHot}, ${palette.gold} 55%, #C97A0C)`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: `drop-shadow(0 0 22px ${withAlpha(palette.gold, 0.35)})`,
              fontSize: 46, letterSpacing: 2,
            }}>NUGGET</span>
          }
          preview={
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden",
              background: palette.rock, padding: 4,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.08), 0 14px 30px -18px rgba(0,0,0,0.6)`,
            }}>
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Swipe up or down to switch tunnel. Grab every nugget you can — and never be standing under a boulder when it lets go."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={ACCENT}
          title={DEATH_TITLE[deathCause] || "Buried!"}
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
        @keyframes impactFlash { 0% { opacity: 0.55; } 100% { opacity: 0; } }
        @keyframes veinIn {
          0%   { opacity: 0; transform: translateY(16px) scale(0.9); }
          14%  { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-18px) scale(1); }
        }
      `}</style>
    </div>
  );
}
