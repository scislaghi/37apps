import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, ACCENTS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";

const { loadBestScore, saveBestScore } = createBestScoreStore("morph.bestScore");

/* ── 37apps brand kit, turned up: light base + full accent palette cycling through the gates.
   The road itself stays a dark asphalt tone regardless of base theme — it's a physical surface,
   not UI chrome, same logic as the brand kit's phone bezel and pause scrim staying dark. ── */
const palette = {
  ...baseTheme,
  holeBorder: "rgba(245,243,240,0.5)",
  success: "#17D39B",
  roadNear: "#2A2933",
  roadFar: "#17161D",
  rail: "rgba(245,243,240,0.3)",
};

const PLAYER_GRADIENT = "linear-gradient(135deg, #1DC0ED, #7B42FF)";

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

const DRAG_THRESHOLD = 28;

/* ── pseudo-3D road: gates rush toward the camera along z (1 = spawn, 0 = player) ── */
const HORIZON_RATIO = 0.21;
const PLY_RATIO = 0.77;
const TW_RATIO = 0.8;
const WALL_H_RATIO = 0.162;

const BASE_SPEED_Z = 0.32;
const SPEED_PER_SCORE_Z = 0.018;
const MAX_SPEED_Z = 0.85;
const CHECK_Z = 0.055;
const SPAWN_TRIGGER_Z = 0.5;
const SPAWN_Z = 1.08;
/* far enough past the player that proj() below has already scaled/moved the gate
   fully outside the track's overflow:hidden bounds — see proj()'s comment */
const CLEANUP_Z = -1.1;

function proj(z, trackWidth, trackHeight) {
  /* sign-preserving power: z >= 0 behaves exactly as before (approaching gates
     shrink toward the horizon). For z < 0 — a gate that already reached the
     player — t keeps going negative instead of clamping at 0, so the gate keeps
     growing and sliding past the floor line instead of freezing in place for
     the ~1s it used to take to cross CLEANUP_Z. It ends up fully below the
     track's visible area (clipped by overflow:hidden) well before it's culled
     from the array, so removal is invisible — no freeze, no pop. */
  const t = z >= 0 ? Math.pow(z, 0.72) : -Math.pow(-z, 0.72);
  const horizon = trackHeight * HORIZON_RATIO;
  const ply = trackHeight * PLY_RATIO;
  const roadW = trackWidth * TW_RATIO;
  return {
    y: ply - (ply - horizon) * t,
    tw: roadW * (1 - t * 0.92),
    sc: Math.max(0.08, 1 - t * 0.88),
  };
}

function pickDifferent(pool, exclude) {
  const filtered = exclude ? pool.filter(v => v !== exclude) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

let idCounter = 1;
function makeGate(lastType, lastColor) {
  const type = pickDifferent(TYPES, lastType);
  const color = pickDifferent(ACCENTS, lastColor);
  return { id: idCounter++, z: SPAWN_Z, type, color, passed: false };
}

/** Reactive expression: idle dot, happy squint on a good pass, ✕ on death. */
function Eye({ leftFraction, mood }) {
  const left = `${leftFraction * 100}%`;
  if (mood === "dead") {
    return (
      <span style={{
        position: "absolute", top: "26%", left, transform: "translate(-50%, -50%)",
        fontSize: 9, lineHeight: 1, color: "#18171D", fontWeight: 900,
      }}>✕</span>
    );
  }
  if (mood === "happy") {
    return (
      <span style={{
        position: "absolute", top: "32%", left, width: 7, height: 4,
        borderTop: "2px solid #18171D", borderRadius: "6px 6px 0 0",
        transform: "translate(-50%, -50%)",
      }} />
    );
  }
  return (
    <span style={{
      position: "absolute", top: "30%", left, width: 5, height: 5, borderRadius: "50%",
      background: "#18171D", transform: "translate(-50%, -50%)",
    }} />
  );
}

/* ── shared road trapezoid geometry: gate walls clip to this exact silhouette so
   nothing ever bleeds into the off-road corners past the perspective edges ── */
function roadGeometry(trackWidth, trackHeight) {
  const cx = trackWidth / 2;
  const horizon = trackHeight * HORIZON_RATIO;
  const ply = trackHeight * PLY_RATIO;
  const roadW = trackWidth * TW_RATIO;
  const farW = roadW * 0.08;
  return {
    cx, horizon, ply,
    nearLeft: cx - roadW / 2, nearRight: cx + roadW / 2,
    farLeft: cx - farW / 2, farRight: cx + farW / 2,
  };
}
function roadClipPath(g) {
  return `polygon(${g.nearLeft}px ${g.ply}px, ${g.nearRight}px ${g.ply}px, ${g.farRight}px ${g.horizon}px, ${g.farLeft}px ${g.horizon}px)`;
}
/* road width at a given screen y, linearly interpolated between the near and far
   edges — used only to chamfer a gate's top corners down to the road's true width
   there, not to reshape the whole wall (see CHAMFER_FRACTION below) */
function roadWidthAtY(y, g) {
  const frac = Math.min(1, Math.max(0, (g.ply - y) / (g.ply - g.horizon)));
  const nearW = g.nearRight - g.nearLeft;
  const farW = g.farRight - g.farLeft;
  return nearW + (farW - nearW) * frac;
}
/* only the top slice of a wall chamfers inward to the road's narrower width there;
   the rest stays a straight-sided vertical panel — see the pseudo3d-wall-rectangle
   memory note for why clipping the *whole* height to the road trapezoid is wrong
   (it reads as the wall lying flat on the ground) */
const CHAMFER_FRACTION = 1;

function RoadSvg({ trackWidth, trackHeight, geo }) {
  const { cx, horizon, ply, nearLeft, nearRight, farLeft, farRight } = geo;

  return (
    <>
      <div style={{
        position: "absolute", inset: 0,
        clipPath: roadClipPath(geo),
        background: `linear-gradient(to top, ${palette.roadNear}, ${palette.roadFar})`,
      }} />
      <svg width={trackWidth} height={trackHeight} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <line x1={nearLeft} y1={ply} x2={farLeft} y2={horizon} stroke={palette.rail} strokeWidth="2" />
        <line x1={nearRight} y1={ply} x2={farRight} y2={horizon} stroke={palette.rail} strokeWidth="2" />
        <line
          x1={cx} y1={ply} x2={cx} y2={horizon}
          stroke="rgba(245,243,240,0.22)" strokeWidth="2" strokeDasharray="10 16"
          style={{ animation: "dashMove 0.6s linear infinite" }}
        />
      </svg>
    </>
  );
}

/* ── a gate's wall is always flush with the road surface at its depth: the opening
   sits with its bottom pinned to that floor line, never floating above it, so the
   jelly (which stays grounded) glides straight through instead of "hopping" up ── */
function GateWalls({ gate, trackWidth, trackHeight, roadGeo }) {
  /* lower bound intentionally not checked here: CLEANUP_Z (the array filter in
     the main loop) is the single source of truth for when a gate disappears,
     and by then proj() has already pushed it fully below the visible track. */
  if (gate.z > 1.12) return null;
  const p = proj(gate.z, trackWidth, trackHeight);
  const cx = trackWidth / 2;
  const wH = trackHeight * WALL_H_RATIO * p.sc;
  const wT = p.y - wH;
  const wL = cx - p.tw / 2, wR = cx + p.tw / 2;

  const op = HOLES[gate.type];
  const ow = op.w * p.sc;
  const oh = Math.min(op.h * p.sc, wH);
  const oL = cx - ow / 2, oR = cx + ow / 2;
  const oB = p.y, oT = oB - oh;

  const leftW = Math.max(0, oL - wL);
  const rightW = Math.max(0, wR - oR);
  const topH = Math.max(0, oT - wT);
  const glow = `0 0 ${Math.max(6, 18 * p.sc)}px ${gate.color}55`;

  /* chamfer clip, in coordinates relative to this wall's own box (0,0 = wL,wT).
     Built as an explicit point list rather than a fixed 6-point template: at
     CHAMFER_FRACTION = 1 the "before taper" points collapse onto the same y as
     the top-taper points, and a fixed template leaves them in as redundant
     colinear vertices — which silently fill in the notch and render as a plain
     untapered rectangle. Omitting them when chamferY ≈ 0 keeps the shape a
     true trapezoid at every fraction from 0 to 1. */
  const taperW = Math.min(p.tw, roadWidthAtY(wT, roadGeo));
  const chamferInset = (p.tw - taperW) / 2;
  const chamferY = wH * (1 - CHAMFER_FRACTION);
  const clipPoints = [[0, wH], [p.tw, wH]];
  if (chamferY > 0.5) clipPoints.push([p.tw, chamferY]);
  clipPoints.push([p.tw - chamferInset, 0], [chamferInset, 0]);
  if (chamferY > 0.5) clipPoints.push([0, chamferY]);
  const clip = `polygon(${clipPoints.map(([x, y]) => `${x}px ${y}px`).join(", ")})`;

  return (
    <div style={{ position: "absolute", left: wL, top: wT, width: p.tw, height: wH, clipPath: clip }}>
      {leftW > 0.5 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: leftW, height: wH, background: gate.color, boxShadow: glow }} />
      )}
      {rightW > 0.5 && (
        <div style={{ position: "absolute", left: leftW + ow, top: 0, width: rightW, height: wH, background: gate.color, boxShadow: glow }} />
      )}
      {topH > 0.5 && (
        <div style={{ position: "absolute", left: leftW, top: 0, width: ow, height: topH, background: gate.color, boxShadow: glow }} />
      )}
      <div style={{
        position: "absolute", left: leftW, top: oT - wT, width: ow, height: oh, boxSizing: "border-box",
        border: `${Math.max(1, 2 * p.sc)}px solid ${palette.holeBorder}`, borderRadius: 4 * p.sc,
      }} />
    </div>
  );
}

export default function Morph() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [shape, setShape] = useState("cube");
  const [passFx, setPassFx] = useState(null);
  const [deathBurst, setDeathBurst] = useState(null);
  const [flashKey, setFlashKey] = useState(null);
  const [, setFrameTick] = useState(0);
  const [, setAttractTick] = useState(0);

  const trackRef = useRef(null);
  const gatesRef = useRef([]);
  const shapeRef = useRef("cube");
  const scoreRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const keyHeldRef = useRef(null);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const attractRafRef = useRef(null);
  const attractGatesRef = useRef([
    { id: "attract-1", z: 1.05, type: "tall", color: ACCENTS[3] },
    { id: "attract-2", z: 0.9, type: "wide", color: ACCENTS[6] },
  ]);
  const lastTypeRef = useRef(null);
  const lastColorRef = useRef(null);

  useEffect(() => {
    initAds();
    initAudio();
  }, []);

  /* ── attract mode: a couple of decorative gates drift near the horizon on the
     start screen so the first frame has motion, isolated from gameplay refs/state
     entirely. Kept far away (high z) on purpose — close enough to read as motion,
     never close enough to grow into a solid block behind the description text. ── */
  useEffect(() => {
    if (phase !== "start") return;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      attractGatesRef.current = attractGatesRef.current.map(g => {
        const z = g.z - 0.05 * dt;
        return { ...g, z: z < 0.82 ? 1.08 : z };
      });
      setAttractTick(t => t + 1);
      attractRafRef.current = requestAnimationFrame(tick);
    };
    attractRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(attractRafRef.current);
  }, [phase]);

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

  const endGame = useCallback((failColor) => {
    setPhase(p => {
      if (p !== "play") return p;
      setDeathBurst({ key: Date.now(), color: failColor || palette.success });
      showInterstitial();
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  /* ── main loop: gates approach along z, pass/fail resolves the instant a gate reaches the player ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const speedZ = Math.min(MAX_SPEED_Z, BASE_SPEED_Z + scoreRef.current * SPEED_PER_SCORE_Z);

      const gates = gatesRef.current.map(g => ({ ...g, z: g.z - speedZ * dt })).filter(g => g.z > CLEANUP_Z);

      let gameOver = false;
      let failColor = null;
      for (const g of gates) {
        if (!g.passed && g.z <= CHECK_Z) {
          g.passed = true;
          const hole = HOLES[g.type];
          const dims = SHAPES[shapeRef.current];
          if (dims.w <= hole.w && dims.h <= hole.h) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            setPassFx({ key: now });
            sfx.score();
          } else {
            gameOver = true;
            failColor = g.color;
          }
          break;
        }
      }

      if (gameOver) {
        gatesRef.current = gates;
        sfx.hit();
        endGame(failColor);
        return;
      }

      const farthest = gates.length ? Math.max(...gates.map(g => g.z)) : -1;
      if (farthest < SPAWN_TRIGGER_Z) {
        const g = makeGate(lastTypeRef.current, lastColorRef.current);
        lastTypeRef.current = g.type;
        lastColorRef.current = g.color;
        gates.push(g);
      }

      gatesRef.current = gates;
      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    sfx.select();

    const first = makeGate(null, null);
    first.z = 1.02;
    lastTypeRef.current = first.type;
    lastColorRef.current = first.color;
    gatesRef.current = [first];
    scoreRef.current = 0;
    shapeRef.current = "cube";
    setScore(0);
    setShape("cube");
    setPassFx(null);
    setDeathBurst(null);
    setFlashKey(Date.now());
    setPhase("play");
  }, []);

  /* ── shared shape setter: every actual morph gets a matching audio tick ── */
  const changeShape = useCallback((next) => {
    if (next === shapeRef.current) return;
    shapeRef.current = next;
    setShape(next);
    sfx.shift();
  }, []);

  /* ── drag controls ── */
  const applyShapeFromDelta = (delta) => {
    let next = "cube";
    if (delta < -DRAG_THRESHOLD) next = "tall";
    else if (delta > DRAG_THRESHOLD) next = "wide";
    changeShape(next);
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
    changeShape("cube");
  };

  /* ── keyboard: alt input for desktop testing, mirrors drag up/down/release ── */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (draggingRef.current || phase !== "play") return;
      if ((e.key === "ArrowUp" || e.key === "w") && shapeRef.current !== "tall") {
        keyHeldRef.current = "tall";
        changeShape("tall");
      }
      if ((e.key === "ArrowDown" || e.key === "s") && shapeRef.current !== "wide") {
        keyHeldRef.current = "wide";
        changeShape("wide");
      }
    };
    const onKeyUp = (e) => {
      if (!keyHeldRef.current) return;
      if (["ArrowUp", "w", "ArrowDown", "s"].includes(e.key)) {
        keyHeldRef.current = null;
        changeShape("cube");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, changeShape]);

  useEffect(() => {
    if (!passFx) return;
    const t = setTimeout(() => setPassFx(null), 380);
    return () => clearTimeout(t);
  }, [passFx]);

  const trackWidth = trackRef.current ? trackRef.current.clientWidth : 360;
  const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
  const showBoard = phase === "play" || phase === "dead";
  const s = SHAPES[shape];
  const ply = trackHeight * PLY_RATIO;
  const floorOffset = trackHeight - ply;
  const gates = gatesRef.current.slice().sort((a, b) => b.z - a.z);
  const attractGates = attractGatesRef.current.slice().sort((a, b) => b.z - a.z);
  const mood = phase === "dead" ? "dead" : passFx ? "happy" : "idle";
  const roadGeo = roadGeometry(trackWidth, trackHeight);

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
      {phase === "play" && <ScoreHeader score={score} best={best} theme={palette} />}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* background + road: always on, even before the first tap, so the opening
            frame already has motion instead of a flat "press start" card */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 20% 12%, rgba(255,69,41,0.14), transparent 55%), radial-gradient(circle at 85% 8%, rgba(29,192,237,0.14), transparent 55%), radial-gradient(circle at 50% 100%, rgba(123,66,255,0.12), transparent 60%)",
        }} />

        <RoadSvg trackWidth={trackWidth} trackHeight={trackHeight} geo={roadGeo} />

        {phase === "start" && attractGates.map(g => (
          <GateWalls key={g.id} gate={g} trackWidth={trackWidth} trackHeight={trackHeight} roadGeo={roadGeo} />
        ))}

        {showBoard && gates.map(g => (
          <GateWalls key={g.id} gate={g} trackWidth={trackWidth} trackHeight={trackHeight} roadGeo={roadGeo} />
        ))}

        {passFx && (
          <div key={passFx.key} style={{
            position: "absolute", left: "50%", bottom: floorOffset,
            transform: "translate(-50%, 50%)", width: 90, height: 90, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.success}55, transparent 70%)`,
            animation: "passPulse 0.38s ease-out forwards", zIndex: 4, pointerEvents: "none",
          }} />
        )}

        {deathBurst && (
          <div key={deathBurst.key} style={{
            position: "absolute", left: "50%", bottom: floorOffset,
            transform: "translate(-50%, 0)", zIndex: 12, pointerEvents: "none",
          }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / 10 + (i % 2 ? 0.25 : -0.25);
              const dist = 42 + (i % 3) * 16;
              return (
                <span key={i} style={{
                  position: "absolute", left: 0, top: 0, width: 6, height: 6, borderRadius: "50%",
                  background: deathBurst.color,
                  "--dx": `${Math.cos(angle) * dist}px`,
                  "--dy": `${Math.sin(angle) * dist - 24}px`,
                  animation: "deathBurst 0.5s ease-out forwards",
                }} />
              );
            })}
          </div>
        )}

        {flashKey && (
          <div key={flashKey} style={{
            /* fixed white flash regardless of base theme — reads as a camera-flash pulse either way */
            position: "absolute", inset: 0, background: "#FFFFFF",
            animation: "entranceFlash 0.18s ease-out forwards", zIndex: 6, pointerEvents: "none",
          }} />
        )}

        {/* player: bottom-pinned so it stays grounded on the road while morphing height;
            rendered in every phase so it's already idling/bobbing before the first tap */}
        <div style={{ position: "absolute", left: "50%", bottom: floorOffset, transform: "translateX(-50%)", zIndex: 5 }}>
          <div style={{
            width: s.w, height: s.h, borderRadius: s.radius,
            background: PLAYER_GRADIENT,
            boxShadow: "0 0 22px rgba(29,192,237,0.5), 0 0 40px rgba(123,66,255,0.25)",
            transition: "width 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.32s ease",
            animation: phase === "dead" ? "none" : "jellyIdle 1.7s ease-in-out infinite",
            opacity: phase === "dead" ? 0.6 : 1,
            position: "relative",
          }}>
            <Eye leftFraction={0.32} mood={mood} />
            <Eye leftFraction={0.68} mood={mood} />
          </div>
        </div>

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            /* the road behind stays dark asphalt (see palette comment above), so this
               screen keeps its dark scrim too — text needs the light pair, not the
               page's light-theme dark ink, or it reads as invisible dark-on-dark */
            theme={{ ...palette, text: "#F5F3F0", textMuted: "#9A98A6" }}
            background="rgba(21,20,27,0.72)"
            title="MORPH"
            preview={
              <div style={{ display: "flex", gap: 18 }}>
                {TYPES.map(t => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: SHAPES[t].w, height: SHAPES[t].h, borderRadius: SHAPES[t].radius,
                      background: PLAYER_GRADIENT,
                    }} />
                    <span style={{ fontSize: 11, color: "#9A98A6", fontWeight: 600 }}>
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
        @keyframes passPulse {
          0% { opacity: 1; transform: translate(-50%, 50%) scale(0.4); }
          100% { opacity: 0; transform: translate(-50%, 50%) scale(1.4); }
        }
        @keyframes dashMove {
          to { stroke-dashoffset: -26; }
        }
        @keyframes entranceFlash {
          0% { opacity: 0.35; }
          100% { opacity: 0; }
        }
        @keyframes deathBurst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
