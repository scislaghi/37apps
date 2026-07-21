import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "./ads.js";
import { loadBestScore, saveBestScore } from "./save.js";

/* ── 37apps brand kit: dark neutral base + Jade Flash accent ── */
const palette = {
  bg: "#15141B",
  block: "#37D6A0",
  blockShade: "#249A73",
  blockCurrent: "#3FC6E8",
  blockCurrentShade: "#2B8FA8",
  text: "#F5F3F0",
  textMuted: "#9A98A6",
  panelBg: "#2A2933",
  perfect: "#FFB84D",
  danger: "#FF6B57",
};

const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

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
  const playCountRef = useRef(0);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  useEffect(() => {
    initAds();
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
    setPhase(p => (p === "play" ? "dead" : p));
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
    if (playCountRef.current > 0) showInterstitial();
    playCountRef.current += 1;

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
    if (phase !== "play") {
      startGame();
      return;
    }

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
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px 8px", position: "relative", zIndex: 2,
        }}>
          <span style={{ fontSize: 15, color: palette.textMuted, fontWeight: 600 }}>
            SCORE <span style={{ fontSize: 24, color: palette.text, fontWeight: 800, fontFamily: fontDisplay }}>{score}</span>
          </span>
          {streak >= 2 && (
            <span style={{ fontSize: 13, color: palette.perfect, fontWeight: 800, fontFamily: fontDisplay }}>
              STREAK ×{streak}
            </span>
          )}
          <span style={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
            BEST <span style={{ fontSize: 18, color: palette.text, fontWeight: 800, fontFamily: fontDisplay }}>{best}</span>
          </span>
        </div>
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
              borderRadius: 4, boxShadow: "0 0 18px rgba(63,198,232,0.5)",
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
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 24,
            background: palette.bg, zIndex: 10,
          }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: palette.text, marginBottom: 30, fontFamily: fontDisplay, letterSpacing: -1 }}>
              STACKR
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 26, alignItems: "center" }}>
              <div style={{ width: 120, height: 22, background: `linear-gradient(180deg, ${palette.blockCurrent}, ${palette.blockCurrentShade})`, borderRadius: 4 }} />
              <div style={{ width: 150, height: 22, background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`, borderRadius: 4 }} />
              <div style={{ width: 200, height: 22, background: `linear-gradient(180deg, ${palette.block}, ${palette.blockShade})`, borderRadius: 4 }} />
            </div>

            <div style={{ fontSize: 13, color: palette.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 24 }}>
              Tap to drop the block onto the tower. Overhang gets cut off —
              land dead center for a PERFECT and keep full width. Miss
              completely and the tower falls.
            </div>

            <div style={{
              fontSize: 18, fontWeight: 700, color: palette.text, fontFamily: fontDisplay,
              animation: "pulse 1.6s ease-in-out infinite",
            }}>
              TAP TO START
            </div>

            {best > 0 && (
              <div style={{ marginTop: 14, fontSize: 13, color: palette.textMuted }}>
                Best: {best}
              </div>
            )}
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(21,20,27,0.72)", zIndex: 10,
          }}>
            <div style={{
              background: palette.panelBg, borderRadius: 18, padding: "32px 40px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)", textAlign: "center", minWidth: 220,
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: palette.text, marginBottom: 6 }}>
                Tower down!
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>SCORE</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: palette.text, marginBottom: 6, fontFamily: fontDisplay }}>
                {score}
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 4 }}>
                BEST: {best}
              </div>
              {score > 0 && score >= best && (
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.block, marginBottom: 8 }}>
                  ★ NEW BEST ★
                </div>
              )}
              <div style={{
                marginTop: 20, fontSize: 16, fontWeight: 700, color: palette.text, fontFamily: fontDisplay,
                animation: "pulse 1.6s ease-in-out infinite",
              }}>
                TAP TO RETRY
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
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
