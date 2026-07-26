import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, SUCCESS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("teeter.bestScore");

/* ── 37apps brand kit: light neutral base + Cyan Arc accent (icon system §04
   assigns Teeter's stack/timing glyph to Cyan Arc — the swinging block and
   every UI accent below now match that, instead of the old mixed jade/cyan). ── */
const palette = {
  ...baseTheme,
  accent: "#1DC0ED",
  accentShade: "#1276A0",
  block: "#8FE3F7",
  blockShade: "#3FA9CC",
  danger: "#FF4529",
};

const ACCENT = palette.accent;

const BLOCK_HEIGHT = 36;
const BASE_WIDTH = 200;
const PERFECT_THRESHOLD = 5;
const MIN_WIDTH = 14;

/* Start noticeably calmer than before, and hold that calm pace for the first
   few blocks before ramping — the old curve sped up from the very first tap,
   which read as punishing before a new player had found the rhythm. */
const BASE_ANGULAR_SPEED = 1.05;
const RAMP_GRACE_SCORE = 3;
const ANGULAR_SPEED_PER_SCORE = 0.05;
const MAX_ANGULAR_SPEED = 4.2;
const IMPACT_MS = 240;

function angularSpeedForScore(score) {
  const ramped = Math.max(0, score - RAMP_GRACE_SCORE);
  return Math.min(MAX_ANGULAR_SPEED, BASE_ANGULAR_SPEED + ramped * ANGULAR_SPEED_PER_SCORE);
}

/** Respects the OS-level motion preference: motion blur, shake, and spark
    bursts all gate off this instead of running unconditionally. */
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

let idCounter = 1;
let debrisCounter = 1;
let sparkCounter = 1;

/* ── spark burst: a few tinted specks flung from the landing edge on every
   successful drop — small on a normal hit, brighter/wider on a perfect, so
   the tower feels alive instead of just gaining a silent rectangle. ── */
function makeSparks(color, originX, count) {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const dist = 18 + Math.random() * 30;
    return {
      id: sparkCounter++,
      originX,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      color,
    };
  });
}

export default function Teeter() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null);
  const [debris, setDebris] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [, setFrameTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  const trackRef = useRef(null);
  const phaseAngleRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const blocksRef = useRef([]);
  const currentWidthRef = useRef(BASE_WIDTH);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const flashTimeoutRef = useRef(null);

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

  /* ── death is two beats: "impact" flashes/shakes the frame with the tumbling
     block still on screen, then "dead" swaps in the opaque Game Over screen —
     same rhythm as Juke/Morphy, instead of the screen going flat instantly. ── */
  const endGame = useCallback(() => {
    setPhase(p => {
      if (p !== "play") return p;
      sfx.hit();
      vibrate([15, 40, 15]);
      showInterstitial(AD_IDS);
      return "impact";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
  }, []);

  /* ── main loop: advances the oscillator phase for the moving block ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const angularSpeed = angularSpeedForScore(scoreRef.current);
      phaseAngleRef.current += angularSpeed * dt;

      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const startGame = useCallback(() => {
    sfx.select();
    const gameWidth = trackRef.current ? trackRef.current.clientWidth : 360;
    const baseX = (gameWidth - BASE_WIDTH) / 2;

    scoreRef.current = 0;
    streakRef.current = 0;
    phaseAngleRef.current = 0;
    currentWidthRef.current = BASE_WIDTH;
    blocksRef.current = [{ id: idCounter++, x: baseX, width: BASE_WIDTH }];
    setScore(0);
    setStreak(0);
    setFlash(null);
    setDebris([]);
    setSparks([]);
    setPhase("play");
  }, []);

  const handleTap = useCallback(() => {
    /* menu/game-over background tap = play again; settings has its own buttons
       (which stopPropagation) and must never fall through to this */
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;

    const gameWidth = trackRef.current ? trackRef.current.clientWidth : 360;
    const width = currentWidthRef.current;
    const amplitude = Math.max(0, (gameWidth - width) / 2);
    const movingX = gameWidth / 2 + amplitude * Math.sin(phaseAngleRef.current) - width / 2;
    const movingLeft = movingX;
    const movingRight = movingX + width;

    const last = blocksRef.current[blocksRef.current.length - 1];
    const lastLeft = last.x;
    const lastRight = last.x + last.width;

    const overlapLeft = Math.max(lastLeft, movingLeft);
    const overlapRight = Math.min(lastRight, movingRight);
    const overlapWidth = overlapRight - overlapLeft;

    if (overlapWidth < MIN_WIDTH) {
      // whole moving block becomes debris, tumbling away
      setDebris(d => [...d, { id: debrisCounter++, x: movingLeft, width, color: palette.block }]);
      endGame();
      return;
    }

    const offset = movingLeft - lastLeft;
    const isPerfect = Math.abs(offset) <= PERFECT_THRESHOLD;
    const centerX = overlapLeft + overlapWidth / 2;

    let newX, newWidth;
    if (isPerfect) {
      newX = lastLeft;
      newWidth = width;
      streakRef.current += 1;
      const bonus = Math.floor(streakRef.current / 2);
      scoreRef.current += 1 + bonus;
      setFlash("perfect");
      sfx.score();
      vibrate(streakRef.current >= 3 ? 12 : 8);
      setSparks(s => [...s, ...makeSparks(SUCCESS, centerX, 8)]);
    } else {
      newX = overlapLeft;
      newWidth = overlapWidth;
      streakRef.current = 0;
      scoreRef.current += 1;
      setFlash("hit");
      sfx.tap();
      vibrate(8);
      setSparks(s => [...s, ...makeSparks(palette.accent, centerX, 4)]);

      // cut-off sliver(s) fall away
      const pieces = [];
      if (movingLeft < overlapLeft) pieces.push({ x: movingLeft, width: overlapLeft - movingLeft });
      if (movingRight > overlapRight) pieces.push({ x: overlapRight, width: movingRight - overlapRight });
      if (pieces.length) {
        setDebris(d => [...d, ...pieces.map(p => ({ id: debrisCounter++, ...p, color: palette.block }))]);
      }
    }

    clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(null), 320);

    blocksRef.current = [...blocksRef.current, { id: idCounter++, x: newX, width: newWidth, landedAt: performance.now() }];
    currentWidthRef.current = newWidth;
    setScore(scoreRef.current);
    setStreak(streakRef.current);
  }, [phase, startGame, endGame]);

  useEffect(() => {
    if (!debris.length) return;
    const t = setTimeout(() => setDebris([]), 500);
    return () => clearTimeout(t);
  }, [debris]);

  useEffect(() => {
    if (!sparks.length) return;
    const t = setTimeout(() => setSparks([]), 420);
    return () => clearTimeout(t);
  }, [sparks]);

  const gameWidth = trackRef.current ? trackRef.current.clientWidth : 360;
  const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
  const fixedCurrentY = trackHeight * 0.32;
  const n = blocksRef.current.length;
  const width = currentWidthRef.current;
  const amplitude = Math.max(0, (gameWidth - width) / 2);
  const sinPhase = Math.sin(phaseAngleRef.current);
  const movingX = gameWidth / 2 + amplitude * sinPhase - width / 2;
  const angularSpeed = angularSpeedForScore(score);
  /* trailing "ghost" copies read as motion blur, scaled by how fast the block
     is currently sweeping so it settles calm near the rail edges and streaks
     through the middle of the swing. */
  const speedFactor = Math.min(1, angularSpeed / MAX_ANGULAR_SPEED);
  const blurOffset = Math.abs(Math.cos(phaseAngleRef.current)) * amplitude * angularSpeed * 0.02;
  const ambientOpacity = Math.min(0.08 + streak * 0.02, 0.3);

  return (
    <div
      onPointerDown={handleTap}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {(phase === "play" || phase === "impact") && (
        <ScoreHeader score={score} best={best} streak={streak} streakColor={SUCCESS} theme={palette} />
      )}

      <div
        ref={trackRef}
        style={{
          flex: 1, position: "relative", overflow: "hidden",
          animation: phase === "impact" && !reducedMotion ? "screenShake 0.24s ease-in-out" : "none",
        }}
      >
        {/* ── ambient glow: a soft accent blob behind the swing rail, growing
            with streak — ties the HUD to what's actually happening instead of
            a static backdrop. ── */}
        {(phase === "play" || phase === "impact") && (
          <div style={{
            position: "absolute", left: "50%", top: fixedCurrentY,
            width: 300, height: 300, borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: palette.accent, opacity: ambientOpacity,
            filter: "blur(64px)", transition: "opacity 0.25s ease",
            pointerEvents: "none",
          }} />
        )}

        {phase === "impact" && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none",
            background: palette.danger,
            animation: "impactFlash 0.24s ease-out forwards",
          }} />
        )}

        {(phase === "play" || phase === "impact") && (
          <>
            {/* swing rail: a faint dashed track spanning the moving block's full
                range — Teeter's signature motif, makes the oscillation read as
                balancing on a rail instead of a rectangle sliding in a void. */}
            <div style={{
              position: "absolute", left: gameWidth / 2 - amplitude - width / 2, top: fixedCurrentY + BLOCK_HEIGHT / 2 - 1,
              width: amplitude * 2 + width, height: 2, borderRadius: 1,
              background: `repeating-linear-gradient(90deg, ${palette.border} 0 6px, transparent 6px 12px)`,
              opacity: 0.7, zIndex: 0,
            }} />

            {blocksRef.current
              .map((b, i) => ({ ...b, y: fixedCurrentY + (n - i) * BLOCK_HEIGHT }))
              .filter(b => b.y < trackHeight + BLOCK_HEIGHT)
              .map((b, i, arr) => {
                const isFresh = !reducedMotion && performance.now() - (b.landedAt || 0) < 220;
                return (
                  <div key={b.id} style={{
                    position: "absolute", left: b.x, width: b.width, top: b.y, height: BLOCK_HEIGHT,
                    background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`,
                    borderRadius: 4, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 4px rgba(18,17,29,0.12)",
                    transition: "top 0.25s ease",
                    animation: isFresh ? "blockLand 0.22s ease-out" : "none",
                    zIndex: arr.length - i,
                  }} />
                );
              })}

            {/* motion-blur ghosts, faint trailing copies offset along the swing */}
            {!reducedMotion && [1, 2].map(k => (
              <div key={k} style={{
                position: "absolute", left: movingX - Math.sign(sinPhase || 1) * blurOffset * k * 0.6,
                width, top: fixedCurrentY, height: BLOCK_HEIGHT,
                background: palette.accent, opacity: 0.14 / k, borderRadius: 4, pointerEvents: "none",
              }} />
            ))}

            {/* moving block */}
            <div style={{
              position: "absolute", left: movingX, width, top: fixedCurrentY, height: BLOCK_HEIGHT,
              background: `linear-gradient(180deg, color-mix(in srgb, ${palette.accent} 70%, white), ${palette.accent})`,
              borderRadius: 4, boxShadow: `0 0 22px ${palette.accent}88, inset 0 1px 0 rgba(255,255,255,0.6)`,
              zIndex: 999,
            }} />

            {debris.map(d => (
              <div key={d.id} style={{
                position: "absolute", left: d.x, width: d.width, top: fixedCurrentY, height: BLOCK_HEIGHT,
                background: d.color, borderRadius: 4,
                animation: reducedMotion ? "none" : "fallAway 0.5s ease-in forwards",
                opacity: reducedMotion ? 0 : 1,
              }} />
            ))}

            {!reducedMotion && sparks.map(sp => (
              <div key={sp.id} style={{
                position: "absolute", left: sp.originX - 3, top: fixedCurrentY + BLOCK_HEIGHT / 2 - 3,
                width: 6, height: 6, borderRadius: 2, background: sp.color,
                "--dx": `${sp.dx}px`, "--dy": `${sp.dy}px`,
                animation: "sparkBurst 0.4s ease-out forwards",
              }} />
            ))}
          </>
        )}

        {flash && (
          <div style={{
            position: "absolute", top: "20%", left: "50%", transform: "translate(-50%, -50%)",
            fontSize: flash === "perfect" ? 24 : 18, fontWeight: 800, fontFamily: fontDisplay,
            color: flash === "perfect" ? SUCCESS : palette.text,
            textShadow: flash === "perfect" ? `0 0 18px ${SUCCESS}66` : "none",
            animation: "flashUp 0.45s ease-out forwards", pointerEvents: "none", zIndex: 5,
          }}>
            {flash === "perfect" ? "PERFECT!" : "STACKED"}
          </div>
        )}

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            accent={ACCENT}
            title={
              <span style={{
                background: `linear-gradient(135deg, ${palette.accent}, #3D64FF)`, WebkitBackgroundClip: "text", backgroundClip: "text",
                color: "transparent", filter: `drop-shadow(0 0 18px ${palette.accent}55)`,
              }}>TEETER</span>
            }
            preview={
              <div style={{ position: "relative", width: 200, height: 96, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 120, height: 22, borderRadius: 4,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${palette.accent} 70%, white), ${palette.accent})`,
                  boxShadow: `0 0 14px ${palette.accent}66`,
                  animation: reducedMotion ? "none" : "previewSwing 2.2s ease-in-out infinite",
                }} />
                <div style={{ width: 160, height: 22, background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`, borderRadius: 4 }} />
                <div style={{ width: 200, height: 22, background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`, borderRadius: 4 }} />
              </div>
            }
            description="Tap to drop the block onto the tower. Overhang gets cut off — land dead center for a PERFECT and keep full width. Miss completely and the tower falls."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <GameOverCard accent={ACCENT} title="Tower down!" score={score} best={best} onRetry={startGame} />
        )}

        {/* ── SETTINGS ── */}
        {phase === "settings" && (
          <SettingsScreen
            accent={ACCENT}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>

      <style>{`
        @keyframes flashUp {
          0% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, -80%); }
        }
        @keyframes fallAway {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(160px) rotate(12deg); }
        }
        @keyframes blockLand {
          0% { transform: scaleY(1.35); }
          60% { transform: scaleY(0.92); }
          100% { transform: scaleY(1); }
        }
        @keyframes screenShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }
        @keyframes impactFlash {
          0% { opacity: 0.4; }
          100% { opacity: 0; }
        }
        @keyframes sparkBurst {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.3); }
        }
        @keyframes previewSwing {
          0%, 100% { transform: translateX(-32px); }
          50% { transform: translateX(32px); }
        }
      `}</style>
    </div>
  );
}
