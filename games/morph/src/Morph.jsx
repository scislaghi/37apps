import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "./ads.js";
import { loadBestScore, saveBestScore } from "./save.js";

/* ── 37apps brand kit: dark neutral base + Cyan Arc accent ── */
const palette = {
  bg: "#15141B",
  wall: "#3A3944",
  holeBorder: "rgba(63,198,232,0.55)",
  player: "#3FC6E8",
  playerGlow: "rgba(63,198,232,0.45)",
  text: "#F5F3F0",
  textMuted: "#9A98A6",
  panelBg: "#2A2933",
  danger: "#FF6B57",
  success: "#37D6A0",
};

const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

/* ── shape system ── */
const SHAPES = {
  cube: { w: 40, h: 40 },
  tall: { w: 22, h: 68 },
  wide: { w: 68, h: 22 },
};
const HOLES = {
  cube: { w: 48, h: 48 },
  tall: { w: 30, h: 76 },
  wide: { w: 76, h: 30 },
};
const TYPES = ["cube", "tall", "wide"];

const PLAYER_X = 64;
const OBSTACLE_W = 90;
const SPAWN_GAP = 320;
const BASE_SPEED = 220;
const SPEED_PER_POINT = 6;
const MAX_SPEED_BONUS = 220;
const DRAG_THRESHOLD = 28;

function randType(excludeType) {
  const pool = excludeType ? TYPES.filter(t => t !== excludeType) : TYPES;
  return pool[Math.floor(Math.random() * pool.length)];
}

let idCounter = 1;
function makeObstacle(x, lastType) {
  const type = randType(lastType);
  return { id: idCounter++, x, type, hole: HOLES[type], passed: false };
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

      const trackWidth = trackRef.current ? trackRef.current.clientWidth : 360;
      const speed = BASE_SPEED + Math.min(passedCountRef.current * SPEED_PER_POINT, MAX_SPEED_BONUS);

      let gameOver = false;
      const obstacles = obstaclesRef.current
        .map(o => ({ ...o, x: o.x - speed * dt }))
        .filter(o => o.x + OBSTACLE_W > -20);

      for (const o of obstacles) {
        const inZone = o.x <= PLAYER_X && PLAYER_X <= o.x + OBSTACLE_W;
        if (inZone && !o.passed) {
          const fits = SHAPES[shapeRef.current].w <= o.hole.w && SHAPES[shapeRef.current].h <= o.hole.h;
          if (!fits) {
            gameOver = true;
            break;
          }
        } else if (!inZone && o.x + OBSTACLE_W < PLAYER_X && !o.passed) {
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

      const lastObstacle = obstacles[obstacles.length - 1];
      if (!lastObstacle) {
        obstacles.push(makeObstacle(trackWidth + 200));
      } else if (lastObstacle.x < trackWidth - SPAWN_GAP) {
        obstacles.push(makeObstacle(lastObstacle.x + SPAWN_GAP, lastObstacle.type));
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

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={releaseDrag}
      onPointerCancel={releaseDrag}
      onPointerLeave={releaseDrag}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {/* header */}
      {phase === "play" && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px 8px", position: "relative", zIndex: 2,
        }}>
          <span style={{ fontSize: 15, color: palette.textMuted, fontWeight: 600 }}>
            SCORE <span style={{ fontSize: 24, color: palette.text, fontWeight: 800, fontFamily: fontDisplay }}>{score}</span>
          </span>
          <span style={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
            BEST <span style={{ fontSize: 18, color: palette.text, fontWeight: 800, fontFamily: fontDisplay }}>{best}</span>
          </span>
        </div>
      )}

      {/* track */}
      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {showBoard && (
          <>
            {/* player */}
            <div style={{
              position: "absolute", top: "50%", left: PLAYER_X,
              width: SHAPES[shape].w, height: SHAPES[shape].h,
              transform: "translate(-50%, -50%)",
              background: palette.player, borderRadius: 8,
              boxShadow: `0 0 18px ${palette.playerGlow}`,
              transition: "width 0.14s ease, height 0.14s ease",
              zIndex: 3,
            }} />

            {/* obstacles */}
            {obstacles.map(o => (
              <div key={o.id} style={{
                position: "absolute", top: 0, bottom: 0, left: o.x, width: OBSTACLE_W,
                background: palette.wall, zIndex: 1,
              }}>
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: o.hole.w, height: o.hole.h,
                  transform: "translate(-50%, -50%)",
                  background: palette.bg,
                  border: `2px solid ${palette.holeBorder}`,
                  borderRadius: 4,
                }} />
              </div>
            ))}
          </>
        )}

        {/* ── START ── */}
        {phase === "start" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 24,
            background: palette.bg, zIndex: 10,
          }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: palette.text, marginBottom: 30, fontFamily: fontDisplay, letterSpacing: -1 }}>
              MORPH
            </div>

            <div style={{ display: "flex", gap: 18, marginBottom: 26 }}>
              {TYPES.map(t => (
                <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: SHAPES[t].w, height: SHAPES[t].h,
                    background: palette.player, borderRadius: 6,
                  }} />
                  <span style={{ fontSize: 11, color: palette.textMuted, fontWeight: 600 }}>
                    {t === "cube" ? "hold still" : t === "tall" ? "drag up" : "drag down"}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, color: palette.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 24 }}>
              Drag up or down to morph your shape and match each gap. Wrong shape on contact ends the run.
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
            background: "rgba(21,20,27,0.7)", zIndex: 10,
          }}>
            <div style={{
              background: palette.panelBg, borderRadius: 18, padding: "32px 40px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)", textAlign: "center", minWidth: 220,
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: palette.text, marginBottom: 6 }}>
                Wrong shape!
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>SCORE</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: palette.text, marginBottom: 6, fontFamily: fontDisplay }}>
                {score}
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 4 }}>
                BEST: {best}
              </div>
              {score > 0 && score >= best && (
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.player, marginBottom: 8 }}>
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
      `}</style>
    </div>
  );
}
