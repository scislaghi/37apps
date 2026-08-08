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
import { palette, TIME_MAX, TIME_LOW, BOOST_NOTCHES, IMPACT_MS } from "./game/constants.js";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("flick.bestScore");

const DEATH_TITLE = {
  wrong: "Wrong side!",
  time: "Out of time!",
  overflow: "Tower overflow!",
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

/* ── The clock. It's the whole game, so it gets the whole width: a bolt cap on
   the left and a bar that empties right-to-left, warming from amber to coral
   as it goes. Below three seconds it pulses — by then the player is watching
   the tower, not the HUD, and needs the alarm in their peripheral vision. ── */
function TimeBar({ time, chilled }) {
  const pct = Math.max(0, Math.min(1, time / TIME_MAX));
  const low = time <= TIME_LOW;
  const fill = chilled
    ? `linear-gradient(90deg, #7FD7F5, #1DC0ED)`
    : low
      ? `linear-gradient(90deg, ${palette.gold}, ${palette.danger})`
      : `linear-gradient(90deg, ${palette.gold}, ${palette.danger} 82%)`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="20" height="26" viewBox="0 0 20 26" style={{ flexShrink: 0 }}>
        <path
          d="M12.5 1 3 15h5.5L7.5 25 17 11h-5.5z"
          fill={chilled ? "#1DC0ED" : low ? palette.danger : palette.ink}
          stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round"
        />
      </svg>
      <div style={{
        flex: 1, height: 15, borderRadius: 99, overflow: "hidden",
        background: "rgba(255,255,255,0.85)",
        boxShadow: `inset 0 0 0 1.5px ${withAlpha(palette.ink, 0.14)}, 0 1px 2px rgba(0,0,0,0.06)`,
        animation: low ? "timeAlarm 0.5s ease-in-out infinite" : "none",
      }}>
        <div style={{
          width: `${pct * 100}%`, height: "100%", borderRadius: 99,
          background: fill,
          transition: "width 0.09s linear",
        }} />
      </div>
    </div>
  );
}

/** Boost charge — eight notches that fill, then burn back down as it spends. */
function BoostMeter({ charge, active }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: BOOST_NOTCHES }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, charge * BOOST_NOTCHES - i));
        return (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 3, overflow: "hidden",
            background: withAlpha(palette.ink, 0.1),
          }}>
            <div style={{
              width: `${fill * 100}%`, height: "100%", borderRadius: 3,
              background: active ? palette.gold : palette.accent,
              boxShadow: fill > 0 && active ? `0 0 7px ${withAlpha(palette.gold, 0.9)}` : "none",
              transition: "width 0.14s ease",
            }} />
          </div>
        );
      })}
    </div>
  );
}

/** Menu hero — the gameplay renderer running a canned loop. */
function HeroPreview({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = 190 * dpr; cv.height = 150 * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      drawHero(ctx, 190, 150, reduced ? 0.42 : (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} style={{ width: 190, height: 150, display: "block" }} />;
}

const BANNERS = {
  boost: { text: "BOOST ×2", sub: "double score", color: palette.gold },
  gold: { text: "GOLD DISC", sub: "+5 and time back", color: palette.gold },
  ice: { text: "ICE DISC", sub: "everything slows down", color: "#1DC0ED" },
  swap: { text: "SWAP!", sub: "the sides just traded", color: palette.accent },
};

export default function Flick() {
  const [phase, setPhase] = useState("start");
  const [best, setBest] = useState(0);
  const [score, setScore] = useState(0);
  const [hud, setHud] = useState({ time: TIME_MAX, combo: 0, boost: 0, boosting: false, chilled: false });
  const [banner, setBanner] = useState(null);
  const [deathCause, setDeathCause] = useState("time");

  const phaseRef = useRef("start");
  const bestLoadedRef = useRef(false);
  const continueUsedRef = useRef(false);
  const scoreRef = useRef(0);
  const playedOnceRef = useRef(false);
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

  const showBanner = useCallback((key) => {
    setBanner({ key, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(id);
  }, [banner]);

  /* death is two beats: "impact" holds the wreckage on screen while the frame
     flashes and shakes, then "dead" swaps in the Game Over page. The
     interstitial fires on RETRY rather than on death, so a player offered a
     rewarded continue only ever sits through one ad. */
  const endGame = useCallback((cause, finalScore) => {
    if (phaseRef.current !== "play") return;
    setDeathCause(cause);
    /* the HUD samples ~15×/s, so the score it happens to be holding can be a
       frame or two stale — the engine passes the real final score with the
       death, and that's what gets banked and shown */
    scoreRef.current = finalScore;
    setScore(finalScore);
    sfx.hit();
    vibrate([18, 45, 22]);
    phaseRef.current = "impact";
    setPhase("impact");
    setBest(b => (finalScore > b ? finalScore : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  const { canvasRef, engineRef } = useGameCanvas({
    create: () => createGame({
      onFlick: (kind, combo) => {
        if (kind === "gold") sfx.score();
        else sfx.tap();
        vibrate(combo % 5 === 0 ? [10, 20, 10] : 7);
      },
      onBoost: () => { sfx.power(); vibrate([12, 30, 12]); showBanner("boost"); },
      onGold: () => { showBanner("gold"); },
      onIce: () => { sfx.shift(); showBanner("ice"); },
      onSwap: () => { sfx.shift(); vibrate([14, 26, 14]); showBanner("swap"); },
      onDeath: endGame,
    }),
    onReady: (g) => { g.reset(); },
    isRunning: () => phaseRef.current === "play",
    sample: (g) => ({
      score: g.score, time: g.time, combo: g.combo,
      boost: g.boost, boosting: g.boostLeft > 0, chilled: g.chill > 0,
    }),
    onSample: (snap) => {
      scoreRef.current = snap.score;
      if (phaseRef.current !== "play") return;
      setScore(snap.score);
      setHud(snap);
    },
    deps: [endGame, showBanner],
  });

  useEffect(() => {
    if (engineRef.current) engineRef.current.reduced = reduced;
  }, [reduced, engineRef]);

  const startGame = useCallback(() => {
    const g = engineRef.current;
    if (!g) return;
    sfx.select();
    g.reset();
    g.running = true;
    /* the on-field arrows only show on a player's first run of the session —
       after that they're clutter over the one thing they need to look at */
    g.hint = playedOnceRef.current ? 0 : 3.2;
    playedOnceRef.current = true;
    continueUsedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setHud({ time: TIME_MAX, combo: 0, boost: 0, boosting: false, chilled: false });
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
    phaseRef.current = "play";
    setPhase("play");
    return true;
  }, [engineRef]);

  /* ── input ──
     Two gestures on one pointer, resolved without either stealing the other:
     a drag past the threshold fires the moment it crosses (swipes stay snappy
     and read their own direction), and anything that lifts without crossing
     it is a tap, which reads the half of the screen it landed on. Firing taps
     on pointerdown instead would be a few ms quicker, but then a swipe that
     starts on the wrong half throws the disc the wrong way — and a wrong
     throw ends the run. */
  const pointers = useRef(new Map());
  const SWIPE_PX = 26;

  const fire = useCallback((dir) => {
    if (phaseRef.current !== "play") return;
    engineRef.current?.flick(dir);
  }, [engineRef]);

  const onPointerDown = useCallback((e) => {
    if (phaseRef.current !== "play") return;
    /* record first: setPointerCapture throws for a pointer the browser
       doesn't consider active (synthetic events, and some mid-gesture races),
       and a throw here would skip the tracking entry and swallow the flick */
    pointers.current.set(e.pointerId, { x: e.clientX, armed: true });
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* capture is an optimisation, not a requirement */ }
  }, []);

  const onPointerMove = useCallback((e) => {
    const p = pointers.current.get(e.pointerId);
    if (!p || !p.armed) return;
    const dx = e.clientX - p.x;
    if (Math.abs(dx) >= SWIPE_PX) {
      p.armed = false;
      fire(dx < 0 ? -1 : 1);
    }
  }, [fire]);

  const onPointerUp = useCallback((e) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!p || !p.armed) return;
    fire(e.clientX < window.innerWidth / 2 ? -1 : 1);
  }, [fire]);

  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") fire(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") fire(1);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [fire]);

  const playing = phase === "play" || phase === "impact";
  const b = banner ? BANNERS[banner.key] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: palette.bg, fontFamily: fontUI,
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
          padding: "calc(12px + env(safe-area-inset-top)) 18px 14px",
          /* the HUD spans the full width, so a third of it sits on a saturated
             wall — a soft light scrim underneath is what keeps dark ink legible
             on pink and cyan without boxing the readout in a panel */
          background: `linear-gradient(180deg, ${withAlpha("#FFFFFF", 0.86)} 0%, ${withAlpha("#FFFFFF", 0.7)} 62%, ${withAlpha("#FFFFFF", 0)} 100%)`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{
              fontSize: 10, letterSpacing: "0.16em", fontWeight: 800,
              color: withAlpha(palette.ink, 0.45), textTransform: "uppercase",
            }}>
              Best {best}
            </span>
            <span style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 38, lineHeight: 1,
              color: palette.text, letterSpacing: -1,
              textShadow: hud.boosting ? `0 0 20px ${withAlpha(palette.gold, 0.85)}` : "none",
            }}>
              {score}
            </span>
          </div>

          <TimeBar time={hud.time} chilled={hud.chilled} />

          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <BoostMeter charge={hud.boost} active={hud.boosting} />
            </div>
            {hud.combo >= 3 && (
              <span key={hud.combo} style={{
                fontFamily: fontDisplay, fontWeight: 900, fontSize: 13,
                color: palette.accent, letterSpacing: "0.04em",
                animation: reduced ? "none" : "comboPop 0.28s ease-out",
              }}>
                ×{hud.combo}
              </span>
            )}
          </div>
        </div>
      )}

      {playing && b && (
        <div key={banner.id} style={{
          position: "absolute", left: 0, right: 0, top: "27%", zIndex: 3,
          textAlign: "center", pointerEvents: "none",
          animation: "bannerIn 1.4s ease-out forwards",
        }}>
          <div style={{
            display: "inline-block", padding: "9px 20px", borderRadius: 16,
            background: "#FFFFFF", boxShadow: `0 10px 26px -12px ${withAlpha(palette.ink, 0.5)}`,
          }}>
            <div style={{
              fontFamily: fontDisplay, fontWeight: 900, fontSize: 22,
              color: b.color, letterSpacing: "0.04em",
            }}>{b.text}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              color: withAlpha(palette.ink, 0.5), textTransform: "uppercase", marginTop: 2,
            }}>{b.sub}</div>
          </div>
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
          accent={palette.accent}
          title={
            <span style={{
              background: `linear-gradient(110deg, ${palette.left}, ${palette.accent} 52%, ${palette.right})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              fontSize: 46, letterSpacing: 1,
            }}>FLICK</span>
          }
          preview={
            <div style={{
              borderRadius: 20, overflow: "hidden",
              boxShadow: `0 0 0 1px ${withAlpha(palette.ink, 0.08)}, 0 14px 30px -18px ${withAlpha(palette.ink, 0.6)}`,
            }}>
              <HeroPreview reduced={reduced} />
            </div>
          }
          description="The tower rises. Send every disc to the wall that matches it — tap or swipe left and right — before it hits the line. You have ten seconds, and every good flick buys a little more."
          best={best}
          onPlay={startGame}
          onSettings={() => setPhase("settings")}
        />
      )}

      {phase === "dead" && (
        <GameOverCard
          accent={palette.accent}
          title={DEATH_TITLE[deathCause] || "Run over!"}
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
        @keyframes impactFlash { 0% { opacity: 0.45; } 100% { opacity: 0; } }
        @keyframes timeAlarm {
          0%, 100% { transform: scaleY(1); filter: none; }
          50% { transform: scaleY(1.22); filter: brightness(1.15); }
        }
        @keyframes comboPop {
          0% { transform: scale(1.6); }
          100% { transform: scale(1); }
        }
        @keyframes bannerIn {
          0%   { opacity: 0; transform: translateY(12px) scale(0.9); }
          12%  { opacity: 1; transform: translateY(0) scale(1); }
          72%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-14px) scale(0.98); }
        }
      `}</style>
    </div>
  );
}
