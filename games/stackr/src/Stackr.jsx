import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initHaptics } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("stackr.bestScore");

/* ── 37apps brand kit: light neutral base + Jade Flash accent ── */
const palette = {
  ...baseTheme,
  block: "#17D39B",
  blockShade: "#128967",
  blockCurrent: "#1DC0ED",
  blockCurrentShade: "#1F7D97",
  perfect: "#FFA31A",
  danger: "#FF4529",
};

/* Stackr's fixed brand accent (Jade Flash) — same hex as the tower blocks. */
const ACCENT = palette.block;

const BLOCK_HEIGHT = 36;
const BASE_WIDTH = 200;
const PERFECT_THRESHOLD = 5;
const MIN_WIDTH = 14;

const BASE_ANGULAR_SPEED = 1.6;
const ANGULAR_SPEED_PER_SCORE = 0.05;
const MAX_ANGULAR_SPEED = 4.5;

function angularSpeedForScore(score) {
  return Math.min(MAX_ANGULAR_SPEED, BASE_ANGULAR_SPEED + score * ANGULAR_SPEED_PER_SCORE);
}

let idCounter = 1;
let debrisCounter = 1;

export default function Stackr() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null);
  const [debris, setDebris] = useState([]);
  const [, setFrameTick] = useState(0);

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

  const endGame = useCallback(() => {
    setPhase(p => {
      if (p !== "play") return p;
      showInterstitial(AD_IDS);
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
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
      setDebris(d => [...d, { id: debrisCounter++, x: movingLeft, width, color: palette.blockCurrent }]);
      endGame();
      return;
    }

    const offset = movingLeft - lastLeft;
    const isPerfect = Math.abs(offset) <= PERFECT_THRESHOLD;

    let newX, newWidth;
    if (isPerfect) {
      newX = lastLeft;
      newWidth = width;
      streakRef.current += 1;
      const bonus = Math.floor(streakRef.current / 2);
      scoreRef.current += 1 + bonus;
      setFlash("perfect");
    } else {
      newX = overlapLeft;
      newWidth = overlapWidth;
      streakRef.current = 0;
      scoreRef.current += 1;
      setFlash("hit");

      // cut-off sliver(s) fall away
      const pieces = [];
      if (movingLeft < overlapLeft) pieces.push({ x: movingLeft, width: overlapLeft - movingLeft });
      if (movingRight > overlapRight) pieces.push({ x: overlapRight, width: movingRight - overlapRight });
      if (pieces.length) {
        setDebris(d => [...d, ...pieces.map(p => ({ id: debrisCounter++, ...p, color: palette.blockCurrent }))]);
      }
    }

    clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(null), 320);

    blocksRef.current = [...blocksRef.current, { id: idCounter++, x: newX, width: newWidth }];
    currentWidthRef.current = newWidth;
    setScore(scoreRef.current);
    setStreak(streakRef.current);
  }, [phase, startGame, endGame]);

  useEffect(() => {
    if (!debris.length) return;
    const t = setTimeout(() => setDebris([]), 500);
    return () => clearTimeout(t);
  }, [debris]);

  const gameWidth = trackRef.current ? trackRef.current.clientWidth : 360;
  const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
  const fixedCurrentY = trackHeight * 0.32;
  const n = blocksRef.current.length;
  const width = currentWidthRef.current;
  const amplitude = Math.max(0, (gameWidth - width) / 2);
  const movingX = gameWidth / 2 + amplitude * Math.sin(phaseAngleRef.current) - width / 2;

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
      {phase === "play" && (
        <ScoreHeader score={score} best={best} streak={streak} streakColor={palette.perfect} theme={palette} />
      )}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {phase === "play" && (
          <>
            {blocksRef.current
              .map((b, i) => ({ ...b, y: fixedCurrentY + (n - i) * BLOCK_HEIGHT }))
              .filter(b => b.y < trackHeight + BLOCK_HEIGHT)
              .map(b => (
                <div key={b.id} style={{
                  position: "absolute", left: b.x, width: b.width, top: b.y, height: BLOCK_HEIGHT,
                  background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`,
                  borderRadius: 4, transition: "top 0.25s ease",
                }} />
              ))}

            {/* moving block */}
            <div style={{
              position: "absolute", left: movingX, width, top: fixedCurrentY, height: BLOCK_HEIGHT,
              background: `linear-gradient(180deg, ${palette.blockCurrent}, ${palette.blockCurrentShade})`,
              borderRadius: 4, boxShadow: "0 0 18px rgba(29,192,237,0.5)",
            }} />

            {debris.map(d => (
              <div key={d.id} style={{
                position: "absolute", left: d.x, width: d.width, top: fixedCurrentY, height: BLOCK_HEIGHT,
                background: d.color, borderRadius: 4,
                animation: "fallAway 0.5s ease-in forwards",
              }} />
            ))}
          </>
        )}

        {flash && (
          <div style={{
            position: "absolute", top: "20%", left: "50%", transform: "translate(-50%, -50%)",
            fontSize: flash === "perfect" ? 22 : 18, fontWeight: 800, fontFamily: fontDisplay,
            color: flash === "perfect" ? palette.perfect : palette.text,
            animation: "flashUp 0.45s ease-out forwards", pointerEvents: "none", zIndex: 5,
          }}>
            {flash === "perfect" ? "PERFECT!" : "STACKED"}
          </div>
        )}

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            accent={ACCENT}
            title="STACKR"
            preview={
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                <div style={{ width: 120, height: 22, background: `linear-gradient(180deg, ${palette.blockCurrent}, ${palette.blockCurrentShade})`, borderRadius: 4 }} />
                <div style={{ width: 150, height: 22, background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`, borderRadius: 4 }} />
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
      `}</style>
    </div>
  );
}
