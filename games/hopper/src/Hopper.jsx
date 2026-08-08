import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, ACCENTS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("hopper.bestScore");

/* Hopper's fixed brand accent (Magenta Pop) drives PLAY/RETRY and the
   perfect-streak glow; the platform tile itself cycles the full 8-color
   accent palette (Morph/Swipe-style), so the two never fight for the same
   read — chrome is always magenta, the world is whatever cube you're on. */
const ACCENT = "#FF297E";

const palette = {
  ...baseTheme,
  ground: "#E3DED3",
  charFill: "#FFFFFF",
  charLine: baseTheme.text,
  shadow: "rgba(24,23,29,0.18)",
};

/* ── layout (fixed px, matches the rest of the portfolio's non-responsive
   scale — every other game sizes its playfield the same way) ── */
const CUBE_SIZE = 72;
const CHAR_SIZE = 62;
const PLATFORM_BOTTOM = 108;
const ENTRY_VW = 68;

/* ── jump physics: velocity in px/s, gravity in px/s². Airtime and apex
   fall straight out of these two numbers (~730ms airtime, ~113px apex). ── */
const JUMP_V0 = 620;
const GRAVITY = 1700;
const AIR_THRESHOLD = 40; /* must clear this height to not get clipped */
const PERFECT_THRESHOLD = 88; /* near-apex landings count as PERFECT */

/* ── difficulty ramp: a short grace window of easy, generous leads, then a
   gentle linear shrink toward a floor that's still theoretically jumpable
   but leaves almost no margin for a mistimed tap. ── */
const LEAD_GRACE_SCORE = 3;
const START_LEAD_MS = 1300;
const MIN_LEAD_MS = 640;
const LEAD_SHRINK_PER_SCORE = 32;
const SPAWN_GAP_MS = 260;
const DEATH_HOLD_MS = 320;

function leadTimeForScore(score) {
  const eased = Math.max(0, score - LEAD_GRACE_SCORE);
  return Math.max(MIN_LEAD_MS, START_LEAD_MS - eased * LEAD_SHRINK_PER_SCORE);
}

function easeOutCubic(t) {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export default function Hopper() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [platformIndex, setPlatformIndex] = useState(0);
  const [platformPop, setPlatformPop] = useState(false);
  const [flash, setFlash] = useState(null);
  const [shake, setShake] = useState(false);
  const [, setFrameTick] = useState(0);

  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const platformIndexRef = useRef(0);
  const airYRef = useRef(0);
  const vRef = useRef(0);
  const groundedRef = useRef(true);
  const incomingRef = useRef(null);
  const phaseRef = useRef("start");
  const dyingRef = useRef(false);
  const bestLoadedRef = useRef(false);

  const rafRef = useRef(null);
  const spawnTimeoutRef = useRef(null);
  const flashTimeoutRef = useRef(null);
  const popTimeoutRef = useRef(null);
  const deathTimeoutRef = useRef(null);

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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => () => {
    clearTimeout(spawnTimeoutRef.current);
    clearTimeout(flashTimeoutRef.current);
    clearTimeout(popTimeoutRef.current);
    clearTimeout(deathTimeoutRef.current);
  }, []);

  const spawnCube = useCallback(() => {
    if (phaseRef.current !== "play" || dyingRef.current) return;
    const side = Math.random() < 0.5 ? "left" : "right";
    const spawnTime = performance.now();
    const leadTime = leadTimeForScore(scoreRef.current);
    incomingRef.current = { side, spawnTime, leadTime, arrivalTime: spawnTime + leadTime };
  }, []);

  const triggerDeath = useCallback(() => {
    if (dyingRef.current) return;
    dyingRef.current = true;
    incomingRef.current = null;
    sfx.hit();
    vibrate([20, 40, 20]);
    setShake(true);
    deathTimeoutRef.current = setTimeout(() => {
      setShake(false);
      setPhase("dead");
      setBest(b => (scoreRef.current > b ? scoreRef.current : b));
      showInterstitial(AD_IDS);
      dyingRef.current = false;
    }, DEATH_HOLD_MS);
  }, []);

  const resolveArrival = useCallback(() => {
    incomingRef.current = null;
    const airY = airYRef.current;
    const grounded = groundedRef.current;

    if (grounded || airY < AIR_THRESHOLD) {
      triggerDeath();
      return;
    }

    const isPerfect = airY >= PERFECT_THRESHOLD;
    streakRef.current = isPerfect ? streakRef.current + 1 : 0;
    const bonus = isPerfect ? Math.floor(streakRef.current / 3) : 0;
    scoreRef.current += 1 + bonus;
    platformIndexRef.current = (platformIndexRef.current + 1) % ACCENTS.length;

    setScore(scoreRef.current);
    setStreak(streakRef.current);
    setPlatformIndex(platformIndexRef.current);
    setFlash(isPerfect ? "perfect" : "good");
    sfx.score();
    vibrate(isPerfect ? [10, 30, 10] : 12);

    clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(null), 480);

    setPlatformPop(true);
    clearTimeout(popTimeoutRef.current);
    popTimeoutRef.current = setTimeout(() => setPlatformPop(false), 240);

    clearTimeout(spawnTimeoutRef.current);
    spawnTimeoutRef.current = setTimeout(spawnCube, SPAWN_GAP_MS);
  }, [spawnCube, triggerDeath]);

  /* ── main loop: advances jump physics and resolves the incoming cube once
     its scheduled arrival time is reached ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!groundedRef.current) {
        vRef.current -= GRAVITY * dt;
        airYRef.current += vRef.current * dt;
        if (airYRef.current <= 0) {
          airYRef.current = 0;
          vRef.current = 0;
          groundedRef.current = true;
        }
      }

      const inc = incomingRef.current;
      if (inc && now >= inc.arrivalTime) {
        resolveArrival();
      }

      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, resolveArrival]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    streakRef.current = 0;
    platformIndexRef.current = 0;
    airYRef.current = 0;
    vRef.current = 0;
    groundedRef.current = true;
    incomingRef.current = null;
    dyingRef.current = false;

    clearTimeout(spawnTimeoutRef.current);
    clearTimeout(flashTimeoutRef.current);
    clearTimeout(popTimeoutRef.current);
    clearTimeout(deathTimeoutRef.current);

    setScore(0);
    setStreak(0);
    setPlatformIndex(0);
    setPlatformPop(false);
    setFlash(null);
    setShake(false);
    setPhase("play");
    phaseRef.current = "play";
    spawnCube();
  }, [spawnCube]);

  const handleTap = useCallback(() => {
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play" || dyingRef.current) return;
    if (!groundedRef.current) return;

    groundedRef.current = false;
    vRef.current = JUMP_V0;
    sfx.tap();
    vibrate(8);
  }, [phase, startGame]);

  const airY = airYRef.current;
  const v = vRef.current;
  const inc = incomingRef.current;
  const now = performance.now();

  /* velocity-driven squash/stretch: rising stretches tall and thin, falling
     stretches slightly, landing squashes wide and flat — continuous, so it
     never pops between discrete poses */
  const stretch = Math.max(-0.32, Math.min(0.3, v / 900));
  const nearGround = groundedRef.current || airY < 14;
  const landingSquash = nearGround && v <= 0 ? -0.22 : 0;
  const scaleY = 1 + stretch + landingSquash;
  const scaleX = 1 - stretch * 0.55 - landingSquash * 0.7;

  const shadowScale = Math.max(0.32, 1 - airY / 150);
  const shadowOpacity = Math.max(0.12, 0.4 - airY / 300);

  let cubeProgress = 0;
  let cubeVW = 0;
  if (inc) {
    cubeProgress = Math.max(0, Math.min(1, (now - inc.spawnTime) / inc.leadTime));
    const eased = easeOutCubic(cubeProgress);
    const sign = inc.side === "left" ? -1 : 1;
    cubeVW = sign * ENTRY_VW * (1 - eased);
  }

  const glowOpacity = Math.min(0.3, 0.04 + streak * 0.045);
  const platformColor = ACCENTS[platformIndex % ACCENTS.length];
  /* the ink cube is colourless in flight; its ghosts carry the accent it will
     *become* on landing, so the palette change is foreshadowed rather than a
     snap at the moment of contact */
  const incomingColor = ACCENTS[(platformIndex + 1) % ACCENTS.length];

  return (
    <div
      onPointerDown={handleTap}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
        animation: shake ? "hopperShake 0.32s ease-in-out" : "none",
      }}
    >
      {shake && (
        <div style={{
          position: "absolute", inset: 0, background: "#FF4529",
          opacity: 0.22, zIndex: 9, pointerEvents: "none",
          animation: "hopperFlashOut 0.32s ease-out forwards",
        }} />
      )}

      {phase === "play" && (
        <ScoreHeader score={score} best={best} streak={streak} streakColor={ACCENT} theme={palette} />
      )}

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {phase === "play" && (
          <>
            {/* ambient glow behind the scene, grows with the perfect streak */}
            <div style={{
              position: "absolute", left: "50%", bottom: PLATFORM_BOTTOM,
              width: 320, height: 320, borderRadius: "50%",
              transform: "translate(-50%, 30%)",
              background: ACCENT, opacity: glowOpacity,
              filter: "blur(80px)", transition: "opacity 0.3s ease",
              pointerEvents: "none",
            }} />

            {/* ground line */}
            <div style={{
              position: "absolute", left: 0, right: 0, bottom: PLATFORM_BOTTOM - 2,
              height: 2, background: palette.ground,
            }} />

            {/* landing shadow */}
            <div style={{
              position: "absolute", left: "50%", bottom: PLATFORM_BOTTOM + CUBE_SIZE - 6,
              width: CHAR_SIZE * 0.9, height: CHAR_SIZE * 0.28,
              transform: `translate(-50%, 0) scale(${shadowScale})`,
              background: palette.shadow, borderRadius: "50%",
              opacity: shadowOpacity, transition: "opacity 0.1s linear",
              pointerEvents: "none",
            }} />

            {/* current platform */}
            <div style={{
              position: "absolute", left: "50%", bottom: PLATFORM_BOTTOM,
              width: CUBE_SIZE, height: CUBE_SIZE,
              transform: `translate(-50%, 0) scale(${platformPop ? 1.08 : 1})`,
              background: platformColor, borderRadius: 14,
              boxShadow: `0 10px 22px ${palette.shadow}`,
              transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease",
            }} />

            {/* incoming cube, sliding in from a random side each round */}
            {inc && (
              <>
                {[0.12, 0.06].map((back, i) => {
                  const p = Math.max(0, cubeProgress - back);
                  const eased = easeOutCubic(p);
                  const sign = inc.side === "left" ? -1 : 1;
                  const vw = sign * ENTRY_VW * (1 - eased);
                  return (
                    <div key={i} style={{
                      position: "absolute", left: "50%", bottom: PLATFORM_BOTTOM,
                      width: CUBE_SIZE, height: CUBE_SIZE,
                      transform: `translate(calc(-50% + ${vw}vw), 0)`,
                      background: incomingColor, borderRadius: 14,
                      opacity: 0.14 + i * 0.05,
                      pointerEvents: "none",
                    }} />
                  );
                })}
                <div style={{
                  position: "absolute", left: "50%", bottom: PLATFORM_BOTTOM,
                  width: CUBE_SIZE, height: CUBE_SIZE,
                  transform: `translate(calc(-50% + ${cubeVW}vw), 0)`,
                  background: palette.text, borderRadius: 14,
                  boxShadow: `0 10px 22px ${palette.shadow}`,
                }} />
              </>
            )}

            {/* character */}
            <div style={{
              position: "absolute", left: "50%",
              bottom: PLATFORM_BOTTOM + CUBE_SIZE + airY,
              width: CHAR_SIZE, height: CHAR_SIZE,
              transform: `translate(-50%, 0) scale(${scaleX}, ${scaleY})`,
              transformOrigin: "50% 100%",
            }}>
              <svg width={CHAR_SIZE} height={CHAR_SIZE} viewBox="0 0 100 100">
                <ellipse cx="50" cy="56" rx="42" ry="40" fill={palette.charFill} stroke={palette.charLine} strokeWidth="5" />
                <circle cx="33" cy="50" r="6" fill={palette.charLine} />
                <circle cx="67" cy="50" r="6" fill={palette.charLine} />
                {groundedRef.current ? (
                  <path d="M36 68 Q50 78 64 68" stroke={palette.charLine} strokeWidth="5" fill="none" strokeLinecap="round" />
                ) : (
                  <ellipse cx="50" cy="70" rx="9" ry="11" fill={palette.charLine} />
                )}
              </svg>
            </div>
          </>
        )}

        {flash && (
          <div style={{
            position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
            fontSize: flash === "perfect" ? 24 : 19, fontWeight: 800, fontFamily: fontDisplay,
            color: flash === "perfect" ? ACCENT : palette.text,
            animation: "hopperFlashUp 0.5s ease-out forwards", pointerEvents: "none",
          }}>
            {flash === "perfect" ? "PERFECT!" : "+1"}
          </div>
        )}

        {phase === "start" && (
          <StartScreen
            accent={ACCENT}
            title="HOPPER"
            preview={
              <div style={{ position: "relative", width: 200, height: 110 }}>
                <div style={{
                  position: "absolute", bottom: 8, left: "50%", width: 56, height: 56,
                  transform: "translateX(-50%)", background: ACCENTS[2], borderRadius: 12,
                }} />
                <div style={{
                  position: "absolute", bottom: 6, left: 6, width: 40, height: 40,
                  background: palette.text, opacity: 0.16, borderRadius: 10,
                }} />
                <svg width="52" height="52" viewBox="0 0 100 100" style={{ position: "absolute", bottom: 58, left: "50%", transform: "translateX(-50%)" }}>
                  <ellipse cx="50" cy="56" rx="42" ry="40" fill={palette.charFill} stroke={palette.charLine} strokeWidth="5" />
                  <circle cx="33" cy="50" r="6" fill={palette.charLine} />
                  <circle cx="67" cy="50" r="6" fill={palette.charLine} />
                  <path d="M36 68 Q50 78 64 68" stroke={palette.charLine} strokeWidth="5" fill="none" strokeLinecap="round" />
                </svg>
              </div>
            }
            description="Tap to jump — clear the cube sliding in from the side and land back on top of it. Time it wrong and it's over."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {phase === "dead" && (
          <GameOverCard accent={ACCENT} title="Squashed!" score={score} best={best} onRetry={startGame} />
        )}

        {phase === "settings" && (
          <SettingsScreen
            accent={ACCENT}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>

      <style>{`
        @keyframes hopperFlashUp {
          0% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, -80%); }
        }
        @keyframes hopperShake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-8px, 2px); }
          40% { transform: translate(7px, -3px); }
          60% { transform: translate(-5px, 2px); }
          80% { transform: translate(4px, -1px); }
        }
        @keyframes hopperFlashOut {
          0% { opacity: 0.3; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
