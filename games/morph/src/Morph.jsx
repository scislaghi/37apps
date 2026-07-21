import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, ACCENTS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";

const { loadBestScore, saveBestScore } = createBestScoreStore("morph.bestScore");

/* ── 37apps brand kit, turned up: dark base + full accent palette for color ── */
const palette = {
  ...baseTheme,
  holeBorder: "rgba(245,243,240,0.55)",
  success: "#37D6A0",
};

const PLAYER_GRADIENT = "linear-gradient(135deg, #3FC6E8, #9B6BFF)";

const backgroundAtmosphere = `
  radial-gradient(600px 500px at 15% 8%, rgba(255,107,87,0.22), transparent 60%),
  radial-gradient(520px 520px at 88% 20%, rgba(63,198,232,0.20), transparent 60%),
  radial-gradient(650px 550px at 25% 88%, rgba(155,107,255,0.20), transparent 60%),
  radial-gradient(560px 520px at 85% 92%, rgba(55,214,160,0.18), transparent 60%),
  radial-gradient(480px 480px at 50% 50%, rgba(255,184,77,0.10), transparent 65%),
  #15141B
`;

/* ── shape system ── */
const SHAPES = {
  cube: { w: 46, h: 46, radius: 18 },
  tall: { w: 24, h: 70, radius: 12 },
  wide: { w: 70, h: 24, radius: 12 },
};
const HOLES = {
  cube: { w: 50, h: 50 },
  tall: { w: 32, h: 78 },
  wide: { w: 78, h: 32 },
};
const TYPES = ["cube", "tall", "wide"];

const PLAYER_BOTTOM_OFFSET = 130;
const OBSTACLE_H = 90;
const SPAWN_GAP = 320;
const BASE_SPEED = 220;
const SPEED_PER_POINT = 6;
const MAX_SPEED_BONUS = 220;
const DRAG_THRESHOLD = 28;

function pickDifferent(pool, exclude) {
  const filtered = exclude ? pool.filter(v => v !== exclude) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

let idCounter = 1;
function makeObstacle(y, lastType, lastColor) {
  const type = pickDifferent(TYPES, lastType);
  const color = pickDifferent(ACCENTS, lastColor);
  return { id: idCounter++, y, type, hole: HOLES[type], color, passed: false };
}

export default function Morph() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [shape, setShape] = useState("cube");
  const [, setFrameTick] = useState(0);

  const trackRef = useRef(null);
  const obstaclesRef = useRef([]);
  const shapeRef = useRef("cube");
  const passedCountRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const playCountRef = useRef(0);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const spawnCursorRef = useRef(SPAWN_GAP - 200);
  const lastTypeRef = useRef(null);
  const lastColorRef = useRef(null);

  /* ── ads: init once on mount ── */
  useEffect(() => {
    initAds();
  }, []);

  /* ── best score: load once, persist on change ── */
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
    setBest(b => (passedCountRef.current > b ? passedCountRef.current : b));
  }, []);

  /* ── main loop ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
      const playerY = trackHeight - PLAYER_BOTTOM_OFFSET;
      const speed = BASE_SPEED + Math.min(passedCountRef.current * SPEED_PER_POINT, MAX_SPEED_BONUS);

      let gameOver = false;
      const obstacles = obstaclesRef.current
        .map(o => ({ ...o, y: o.y + speed * dt }))
        .filter(o => o.y < trackHeight + 20);

      for (const o of obstacles) {
        const inZone = o.y <= playerY && playerY <= o.y + OBSTACLE_H;
        if (inZone && !o.passed) {
          const fits = SHAPES[shapeRef.current].w <= o.hole.w && SHAPES[shapeRef.current].h <= o.hole.h;
          if (!fits) {
            gameOver = true;
            break;
          }
        } else if (o.y > playerY && !o.passed) {
          o.passed = true;
          passedCountRef.current += 1;
          setScore(passedCountRef.current);
        }
      }

      if (gameOver) {
        obstaclesRef.current = obstacles;
        endGame();
        return;
      }

      spawnCursorRef.current += speed * dt;
      if (spawnCursorRef.current >= SPAWN_GAP) {
        const o = makeObstacle(-OBSTACLE_H, lastTypeRef.current, lastColorRef.current);
        lastTypeRef.current = o.type;
        lastColorRef.current = o.color;
        obstacles.push(o);
        spawnCursorRef.current -= SPAWN_GAP;
      }

      obstaclesRef.current = obstacles;
      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    if (playCountRef.current > 0) showInterstitial();
    playCountRef.current += 1;

    obstaclesRef.current = [];
    passedCountRef.current = 0;
    spawnCursorRef.current = SPAWN_GAP - 200;
    lastTypeRef.current = null;
    lastColorRef.current = null;
    shapeRef.current = "cube";
    setScore(0);
    setShape("cube");
    setPhase("play");
  }, []);

  /* ── drag controls ── */
  const applyShapeFromDelta = (delta) => {
    let next = "cube";
    if (delta < -DRAG_THRESHOLD) next = "tall";
    else if (delta > DRAG_THRESHOLD) next = "wide";
    if (next !== shapeRef.current) {
      shapeRef.current = next;
      setShape(next);
    }
  };

  const onPointerDown = (e) => {
    if (phase !== "play") {
      startGame();
      return;
    }
    draggingRef.current = true;
    dragStartYRef.current = e.clientY;
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current || phase !== "play") return;
    applyShapeFromDelta(e.clientY - dragStartYRef.current);
  };

  const releaseDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (shapeRef.current !== "cube") {
      shapeRef.current = "cube";
      setShape("cube");
    }
  };

  const obstacles = obstaclesRef.current;
  const showBoard = phase !== "start";
  const s = SHAPES[shape];

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={releaseDrag}
      onPointerCancel={releaseDrag}
      onPointerLeave={releaseDrag}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: backgroundAtmosphere, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {/* header */}
      {phase === "play" && <ScoreHeader score={score} best={best} theme={palette} />}

      {/* track */}
      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {showBoard && (
          <>
            {/* player: outer = fixed position, inner = shape/jelly */}
            <div style={{
              position: "absolute", left: "50%", bottom: PLAYER_BOTTOM_OFFSET,
              transform: "translateX(-50%)", zIndex: 3,
            }}>
              <div style={{
                width: s.w, height: s.h, borderRadius: s.radius,
                background: PLAYER_GRADIENT,
                boxShadow: "0 0 22px rgba(63,198,232,0.5), 0 0 40px rgba(155,107,255,0.25)",
                transition: "width 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.32s ease",
                animation: "jellyIdle 1.7s ease-in-out infinite",
                position: "relative",
              }}>
                <span style={eyeStyle(0.32)} />
                <span style={eyeStyle(0.68)} />
              </div>
            </div>

            {/* obstacles */}
            {obstacles.map(o => (
              <div key={o.id} style={{
                position: "absolute", left: 0, right: 0, top: o.y, height: OBSTACLE_H,
                background: o.color, zIndex: 1,
                boxShadow: `0 0 24px ${o.color}55`,
              }}>
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: o.hole.w, height: o.hole.h,
                  transform: "translate(-50%, -50%)",
                  background: palette.bg,
                  border: `2px solid ${palette.holeBorder}`,
                  borderRadius: 6,
                }} />
              </div>
            ))}
          </>
        )}

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            theme={palette}
            background={backgroundAtmosphere}
            title="MORPH"
            preview={
              <div style={{ display: "flex", gap: 18 }}>
                {TYPES.map(t => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: SHAPES[t].w, height: SHAPES[t].h, borderRadius: SHAPES[t].radius,
                      background: PLAYER_GRADIENT,
                    }} />
                    <span style={{ fontSize: 11, color: palette.textMuted, fontWeight: 600 }}>
                      {t === "cube" ? "hold still" : t === "tall" ? "drag up" : "drag down"}
                    </span>
                  </div>
                ))}
              </div>
            }
            description="Drag up or down to morph your shape and match each gap. Wrong shape on contact ends the run."
            best={best}
          />
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <GameOverCard theme={palette} title="Wrong shape!" score={score} best={best} accentColor={palette.success} />
        )}
      </div>

      <style>{`
        @keyframes jellyIdle {
          0%, 100% { transform: scale(1, 1); }
          50% { transform: scale(1.06, 0.92); }
        }
      `}</style>
    </div>
  );
}

function eyeStyle(leftFraction) {
  return {
    position: "absolute", top: "30%", left: `${leftFraction * 100}%`,
    width: 5, height: 5, borderRadius: "50%",
    background: "#15141B", transform: "translate(-50%, -50%)",
  };
}
