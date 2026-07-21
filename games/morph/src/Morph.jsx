import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "./ads.js";
import { loadBestScore, saveBestScore } from "./save.js";

/* ── 37apps brand kit, turned up: dark base + full accent palette for color ── */
const palette = {
  bg: "#15141B",
  holeBorder: "rgba(245,243,240,0.55)",
  text: "#F5F3F0",
  textMuted: "#9A98A6",
  panelBg: "#2A2933",
  success: "#37D6A0",
};

const ACCENTS = ["#FF6B57", "#FFB84D", "#C4E86B", "#37D6A0", "#3FC6E8", "#5B7FFF", "#9B6BFF", "#FF5EA8"];
const PLAYER_GRADIENT = "linear-gradient(135deg, #3FC6E8, #9B6BFF)";

const backgroundAtmosphere = `
  radial-gradient(600px 500px at 15% 8%, rgba(255,107,87,0.22), transparent 60%),
  radial-gradient(520px 520px at 88% 20%, rgba(63,198,232,0.20), transparent 60%),
  radial-gradient(650px 550px at 25% 88%, rgba(155,107,255,0.20), transparent 60%),
  radial-gradient(560px 520px at 85% 92%, rgba(55,214,160,0.18), transparent 60%),
  radial-gradient(480px 480px at 50% 50%, rgba(255,184,77,0.10), transparent 65%),
  #15141B
`;

const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

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
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 24,
            background: backgroundAtmosphere, zIndex: 10,
          }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: palette.text, marginBottom: 30, fontFamily: fontDisplay, letterSpacing: -1 }}>
              MORPH
            </div>

            <div style={{ display: "flex", gap: 18, marginBottom: 26 }}>
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
            background: "rgba(21,20,27,0.72)", zIndex: 10,
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
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.success, marginBottom: 8 }}>
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
