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

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("skid.bestScore");

const DEATH_TITLE = {
  spike: "Spiked!",
  fang: "Clipped the fangs!",
  saw: "Shredded!",
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

/* ── Charge meter: four notches that fill on orbs, then burn back down as
   BLAZE spends itself. On a light field the track is an ink hairline. ── */
function ChargeMeter({ charge, blazing }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, charge * 4 - i));
        return (
          <div key={i} style={{
            width: 20, height: 6, borderRadius: 3, overflow: "hidden",
            background: withAlpha(palette.ink, 0.07),
            boxShadow: `inset 0 0 0 1px ${withAlpha(palette.ink, 0.14)}`,
          }}>
            <div style={{
              width: `${fill * 100}%`, height: "100%", borderRadius: 3,
              background: blazing ? palette.blaze : palette.ball,
              transition: "width 0.18s ease",
            }} />
          </div>
        );
      })}
    </div>
  );
}

/** Menu hero — the same slab/teeth/ball renderers as gameplay. */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 190 * dpr; cv.height = 130 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 190, 130, reduced ? 1.5 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 190, height: 130, display: "block" }} />;
}

let toastId = 1;

export default function Skid() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ charge: 0, blazing: false, streak: 0 });
  const [toasts, setToasts] = useState([]);
  const [zoneBanner, setZoneBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("spike");
  const [showHint, setShowHint] = useState(false);

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

  const pushToast = useCallback((text) => {
    const id = toastId++;
    setToasts(list => [...list.slice(-3), { id, text }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 900);
  }, []);

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
      onJump: () => { sfx.tap(); vibrate(7); },
      onLand: (force) => { if (force > 0.35) vibrate(Math.round(6 + force * 10)); },
      onClear: () => { sfx.score(); vibrate(8); },
      onAir: (m) => pushToast(`AIR +${m}m`),
      onOrb: () => { sfx.shift(); vibrate(6); },
      onBlaze: () => { sfx.power(); vibrate([12, 30, 12]); },
      onSmash: () => { sfx.shift(); vibrate(10); },
      onDeath: (cause) => endGame(cause),
      onZone: (name) => { setZoneBanner({ name, key: Date.now() }); sfx.shift(); },
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({ score: Math.floor(g.score), charge: g.charge, blazing: g.blaze > 0, streak: g.streak }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud({ charge: snap.charge, blazing: snap.blazing, streak: snap.streak });
    },
    deps: [endGame, pushToast],
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
    setHud({ charge: 0, blazing: false, streak: 0 });
    setToasts([]);
    setZoneBanner(null);
    phaseRef.current = "play";
    setPhase("play");
    /* the hint is a first-few-seconds nudge, not a tutorial gate — it fades on
       its own whether or not the player has worked the jump out yet */
    setShowHint(true);
    setTimeout(() => setShowHint(false), 3200);
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
    engineRef.current?.tap();
  }, [engineRef]);

  useEffect(() => {
    const down = (e) => {
      if (e.key !== " " && e.key !== "ArrowUp" && e.key !== "w") return;
      e.preventDefault();
      if (phaseRef.current === "play") engineRef.current?.tap();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [engineRef]);

  const playing = phase === "play" || phase === "impact";
  const label = { fontSize: 10, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase" };

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
        }}>
          <div>
            <div style={{ ...label, color: palette.textMuted }}>Depth</div>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 40, lineHeight: 1.05,
              color: palette.text, letterSpacing: -1,
            }}>
              {score}<span style={{ fontSize: 15, marginLeft: 3, opacity: 0.5 }}>m</span>
            </div>
            <div style={{ marginTop: 9 }}>
              <ChargeMeter charge={hud.charge} blazing={hud.blazing} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...label, color: palette.textMuted }}>Best</div>
            <div style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, color: palette.text }}>{best}</div>
            {hud.streak >= 2 && (
              <div style={{
                marginTop: 8, fontFamily: fontDisplay, fontWeight: 900, fontSize: 14,
                color: palette.ball, textShadow: `0 0 8px ${palette.bg}`,
              }}>×{hud.streak}</div>
            )}
          </div>
        </div>
      )}

      {playing && hud.blazing && (
        <div style={{
          position: "absolute", left: "50%", top: "calc(20px + env(safe-area-inset-top))",
          transform: "translateX(-50%)", zIndex: 3, pointerEvents: "none",
          padding: "6px 16px", borderRadius: 99,
          background: palette.blaze, color: palette.ink,
          fontFamily: fontDisplay, fontWeight: 900, fontSize: 13, letterSpacing: "0.14em",
          boxShadow: `0 6px 22px ${withAlpha(palette.blaze, 0.55)}`,
          animation: reduced ? "none" : "blazeThrob 0.55s ease-in-out infinite",
        }}>BLAZE ×2</div>
      )}

      {playing && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: "26%", zIndex: 3,
          pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        }}>
          {toasts.map(x => (
            <div key={x.id} style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 17, color: palette.ball,
              /* toasts fire mid-flight and land on whatever is under them —
                 usually a slab, which is the one colour they'd vanish into */
              textShadow: `0 0 10px ${palette.bg}, 0 0 4px ${palette.bg}, 0 1px 2px ${palette.bg}`,
              animation: "toastUp 0.9s ease-out forwards",
            }}>{x.text}</div>
          ))}
        </div>
      )}

      {playing && showHint && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: "16%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "hintFade 3.2s ease-out forwards",
        }}>
          <div style={{
            display: "inline-block", padding: "9px 20px", borderRadius: 99,
            background: withAlpha(palette.ink, 0.06),
            fontFamily: fontDisplay, fontWeight: 800, fontSize: 12,
            letterSpacing: "0.18em", color: palette.textMuted,
          }}>TAP TO JUMP</div>
        </div>
      )}

      {playing && zoneBanner && (
        <div key={zoneBanner.key} style={{
          position: "absolute", left: 0, right: 0, top: "34%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "zoneIn 1.9s ease-out forwards",
        }}>
          <div style={{ ...label, letterSpacing: "0.3em", color: palette.textMuted }}>Depth zone</div>
          <div style={{
            fontFamily: fontDisplay, fontWeight: 900, fontSize: 34, letterSpacing: "0.08em",
            color: palette.text,
          }}>{zoneBanner.name}</div>
        </div>
      )}

      {phase === "impact" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
          background: palette.danger, animation: "impactFlash 0.32s ease-out forwards",
        }} />
      )}

      {phase === "start" && (
        <StartScreen
          accent={palette.ball}
          title={
            <span style={{
              background: `linear-gradient(135deg, ${palette.ball}, #7B42FF)`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: `drop-shadow(0 8px 22px ${withAlpha(palette.ball, 0.3)})`,
              fontSize: 46, letterSpacing: 1,
            }}>SKID</span>
          }
          preview={
            <div style={{
              borderRadius: 20, overflow: "hidden", background: "#FBFAF7", padding: 4,
              boxShadow: `0 0 0 1px ${withAlpha(palette.ink, 0.07)}, 0 14px 30px -20px ${withAlpha(palette.ink, 0.6)}`,
            }}>
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="Roll down an endless shaft. One tap hops the ball — clear the spikes, duck the hanging fangs, dodge the saws, and grab orbs to charge a BLAZE that smashes straight through them."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.ball}
          title={DEATH_TITLE[deathCause] || "Wiped out!"}
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
          accent={palette.ball}
          onBack={() => setPhase("start")}
          onResetProgress={() => { resetBestScore(); setBest(0); }}
        />
      )}

      <style>{`
        @keyframes impactFlash { 0% { opacity: 0.42; } 100% { opacity: 0; } }
        @keyframes blazeThrob {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.07); }
        }
        @keyframes toastUp {
          0%   { opacity: 0; transform: translateY(10px) scale(0.9); }
          22%  { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-18px); }
        }
        @keyframes hintFade {
          0%, 62% { opacity: 1; }
          100% { opacity: 0; }
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
