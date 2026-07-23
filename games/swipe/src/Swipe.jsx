import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, ACCENTS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";

const { loadBestScore, saveBestScore } = createBestScoreStore("swipe.bestScore");

/* ── 37apps brand kit: light neutral base + Cobalt Bright accent. Hex tiles cycle the full accent palette. ── */
const palette = {
  ...baseTheme,
  accent: "#3D64FF",
  accentGlow: "rgba(61,100,255,0.55)",
  trap: "#FFA31A",
  danger: "#FF4529",
};

const HEX_W = 78;
const HEX_H = 68;
const HEX_CLIP = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
const HSP = 62;
const ACT_Y_RATIO = 0.58;
const VISIBLE = 6;

const START_TIME = 30;
const MAX_TIME = 35;
const TIME_BONUS = 0.3;
const TIME_BONUS_COMBO = 0.5;
const COMBO_BONUS_AT = 5;
const DANGER_TIME = 8;

const SWIPE_THRESHOLD = 30;
const TAP_THRESHOLD = 12;

let idCounter = 1;

function makeHex(n) {
  return {
    id: idCounter++,
    dir: Math.random() > 0.5 ? 1 : -1,
    trap: n > 4 && Math.random() < Math.min(0.12 + n * 0.004, 0.32),
    color: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
  };
}

function Arrow({ dir, muted }) {
  const s = 11;
  return (
    <div style={{
      width: 0, height: 0,
      borderTop: `${s}px solid transparent`,
      borderBottom: `${s}px solid transparent`,
      borderLeft: `${s * 1.3}px solid ${muted ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.92)"}`,
      transform: dir === -1 ? "scaleX(-1)" : "none",
    }} />
  );
}

function HexTile({ hex, active, muted }) {
  return (
    <div style={{ position: "relative", width: HEX_W, height: HEX_H }}>
      <div style={{
        position: "absolute", inset: 0, clipPath: HEX_CLIP,
        background: hex.color,
        border: hex.trap ? `3px solid ${palette.trap}` : active ? "3px solid rgba(255,255,255,0.5)" : "2px solid rgba(0,0,0,0.2)",
        filter: active
          ? `drop-shadow(0 0 10px ${hex.trap ? "rgba(255,163,26,0.6)" : palette.accentGlow})`
          : "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Arrow dir={hex.dir} muted={muted} />
      </div>
      {hex.trap && (
        <div style={{
          position: "absolute", top: -8, right: -2,
          width: 20, height: 20, borderRadius: "50%",
          background: palette.trap, color: "#18171D",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 900, border: "1.5px solid rgba(0,0,0,0.25)",
        }}>!</div>
      )}
      {hex.trap && active && (
        <div style={{
          position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.4, whiteSpace: "nowrap",
          color: "#18171D", background: palette.trap, padding: "2px 7px", borderRadius: 4,
        }}>INVERT!</div>
      )}
    </div>
  );
}

export default function Swipe() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(START_TIME);
  const [deathReason, setDeathReason] = useState("wrong");
  const [flyaways, setFlyaways] = useState([]);
  const [, setFrameTick] = useState(0);

  const trackRef = useRef(null);
  const queueRef = useRef([]);
  const idxRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const timerRef = useRef(START_TIME);
  const pointerRef = useRef(null);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);

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

  const ensureQueue = () => {
    while (queueRef.current.length < idxRef.current + 12) {
      queueRef.current.push(makeHex(queueRef.current.length));
    }
  };

  const endGame = useCallback((reason) => {
    setDeathReason(reason);
    setPhase(p => {
      if (p !== "play") return p;
      showInterstitial();
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  /* ── main loop: only drives the countdown timer, hex movement is CSS-transitioned ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      timerRef.current = Math.max(0, timerRef.current - dt);
      setTimeLeft(timerRef.current);
      if (timerRef.current <= 0) {
        endGame("time");
        return;
      }

      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    queueRef.current = [];
    idxRef.current = 0;
    scoreRef.current = 0;
    comboRef.current = 0;
    timerRef.current = START_TIME;
    ensureQueue();
    setScore(0);
    setStreak(0);
    setTimeLeft(START_TIME);
    setFlyaways([]);
    setPhase("play");
  }, []);

  const handleSwipe = useCallback((dir) => {
    if (phase !== "play") return;
    const hex = queueRef.current[idxRef.current];
    if (!hex) return;

    const required = hex.trap ? -hex.dir : hex.dir;
    if (dir === required) {
      scoreRef.current += 1;
      comboRef.current += 1;
      const bonus = comboRef.current >= COMBO_BONUS_AT ? TIME_BONUS_COMBO : TIME_BONUS;
      timerRef.current = Math.min(MAX_TIME, timerRef.current + bonus);
      idxRef.current += 1;
      ensureQueue();

      setFlyaways(f => [...f, { id: hex.id, dir, color: hex.color, trap: hex.trap }]);
      setScore(scoreRef.current);
      setStreak(comboRef.current);
      setTimeLeft(timerRef.current);
    } else {
      endGame("wrong");
    }
  }, [phase, endGame]);

  useEffect(() => {
    if (!flyaways.length) return;
    const t = setTimeout(() => setFlyaways([]), 320);
    return () => clearTimeout(t);
  }, [flyaways]);

  const handlePointerDown = useCallback((e) => {
    if (phase !== "play") {
      startGame();
      return;
    }
    pointerRef.current = { x: e.clientX, y: e.clientY };
  }, [phase, startGame]);

  const handlePointerUp = useCallback((e) => {
    if (phase !== "play" || !pointerRef.current) return;
    const dx = e.clientX - pointerRef.current.x;
    const dy = e.clientY - pointerRef.current.y;
    pointerRef.current = null;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      handleSwipe(dx > 0 ? 1 : -1);
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      const rect = trackRef.current ? trackRef.current.getBoundingClientRect() : null;
      const isLeft = rect ? e.clientX - rect.left < rect.width / 2 : dx < 0;
      handleSwipe(isLeft ? -1 : 1);
    }
  }, [phase, handleSwipe]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") handleSwipe(-1);
      if (e.key === "ArrowRight" || e.key === "d") handleSwipe(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSwipe]);

  const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
  const trackWidth = trackRef.current ? trackRef.current.clientWidth : 360;
  const actY = trackHeight * ACT_Y_RATIO;
  const centerX = trackWidth / 2;

  const visible = [];
  for (let i = 0; i < VISIBLE; i++) {
    const hex = queueRef.current[idxRef.current + i];
    if (!hex) continue;
    visible.push({ hex, i });
  }

  const timerPct = Math.max(0, timeLeft / START_TIME) * 100;
  const inDanger = timeLeft < DANGER_TIME;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {phase === "play" && (
        <ScoreHeader score={score} best={best} streak={streak} streakColor={palette.accent} theme={palette} />
      )}

      {phase === "play" && (
        <div style={{ height: 6, margin: "0 20px 4px", borderRadius: 3, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${timerPct}%`, borderRadius: 3,
            background: inDanger ? palette.danger : palette.accent,
            transition: "width 0.1s linear, background 0.2s ease",
          }} />
        </div>
      )}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {phase === "play" && (
          <>
            {visible.map(({ hex, i }) => (
              <div key={hex.id} style={{
                position: "absolute", left: centerX, top: actY - i * HSP,
                transform: `translate(-50%, -50%) scale(${1 - i * 0.05})`,
                opacity: Math.max(0, 1 - i * 0.14),
                zIndex: VISIBLE - i,
                transition: "top 0.22s ease, transform 0.22s ease, opacity 0.22s ease",
              }}>
                <HexTile hex={hex} active={i === 0} />
              </div>
            ))}

            {flyaways.map(f => (
              <div key={f.id} style={{
                position: "absolute", left: centerX, top: actY,
                "--fly-x": `${f.dir * 240}px`, "--fly-rot": `${f.dir * 30}deg`,
                animation: "swipeOut 0.32s ease-out forwards",
                zIndex: VISIBLE + 1, pointerEvents: "none",
              }}>
                <HexTile hex={{ dir: f.dir, trap: f.trap, color: f.color }} active={false} muted />
              </div>
            ))}
          </>
        )}

        {phase === "start" && (
          <StartScreen
            theme={palette}
            title="SWIPE"
            preview={
              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <HexTile hex={{ dir: 1, trap: false, color: palette.accent }} active />
                  <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 22 }}>swipe →</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <HexTile hex={{ dir: -1, trap: true, color: palette.trap }} active />
                  <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 22 }}>swipe ← (invert!)</div>
                </div>
              </div>
            }
            description="Swipe the direction of the arrow. Hex marked with ⚠ flips it — swipe the opposite way. Chain correct swipes to keep the clock alive."
            best={best}
          />
        )}

        {phase === "dead" && (
          <GameOverCard
            theme={palette}
            title={deathReason === "time" ? "Time's up!" : "Wrong swipe!"}
            score={score}
            best={best}
            accentColor={palette.accent}
          />
        )}
      </div>

      <style>{`
        @keyframes swipeOut {
          0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--fly-x)), -50%) rotate(var(--fly-rot)); }
        }
      `}</style>
    </div>
  );
}
