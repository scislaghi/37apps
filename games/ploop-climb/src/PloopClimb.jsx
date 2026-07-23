import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";

const { loadBestScore, saveBestScore } = createBestScoreStore("ploop-climb.bestScore");

/* ── 37apps brand kit: light neutral base + Volt Lime accent. Signature motif: a living sky that the collapse chases upward through. ── */
const palette = {
  ...baseTheme,
  accent: "#C0E637",
  accentDark: "#778C31",
  danger: "#FF4529",
  dangerDark: "#642116",
  rock: "#9AA0AA",
  rockDark: "#565B63",
  rust: "#C0553C",
  rustDark: "#5C271A",
  climber: "#3D64FF",
  climberDark: "#334DB6",
};

/* ── grid geometry (isometric brick offset) ── */
const COLS = 5;
const BW = 64;
const HALF = BW / 2;
const HH = 16;
const BD = 22;
const BOX_H = HH * 2 + BD;
const ROW_SP = 32;
const START_COL = 2;

const TOP_Y = (HH / BOX_H) * 100;
const MID_Y = ((HH * 2) / BOX_H) * 100;
const BOT_Y = ((HH + BD) / BOX_H) * 100;
const TOP_CLIP = `polygon(50% 0%, 100% ${TOP_Y}%, 50% ${MID_Y}%, 0% ${TOP_Y}%)`;
const LEFT_CLIP = `polygon(0% ${TOP_Y}%, 50% ${MID_Y}%, 50% 100%, 0% ${BOT_Y}%)`;
const RIGHT_CLIP = `polygon(100% ${TOP_Y}%, 50% ${MID_Y}%, 50% 100%, 100% ${BOT_Y}%)`;

const SAFE = 0, TREE = 1, CRACK = 2, SPIKE = 3, EMPTY = 4;

const ANCHOR_RATIO = 0.66;
const CAM_LEAD_RATIO = 0.36;
const CAM_LERP = 0.12;

const HOP_DURATION = 0.16;
const ARC_HEIGHT = 36;

const BASE_DANGER_SPEED = 0.55;
const MAX_DANGER_SPEED = 1.9;
const DANGER_SPEED_PER_SCORE = 0.006;
const DANGER_WARN_ROWS = 3;

function bx(row, col, trackWidth) {
  const gl = (trackWidth - COLS * BW) / 2;
  return gl + col * BW + (row % 2 ? HALF : 0) + HALF;
}
function screenY(row, camY, trackHeight) {
  return trackHeight * ANCHOR_RATIO - (row * ROW_SP - camY);
}
function upperL(row, col) {
  if (row % 2 === 0) return col > 0 ? { r: row + 1, c: col - 1 } : null;
  return { r: row + 1, c: col };
}
function upperR(row, col) {
  if (row % 2 === 0) return col < COLS ? { r: row + 1, c: col } : null;
  return col + 1 < COLS ? { r: row + 1, c: col + 1 } : null;
}

function isDeadly(t) { return t === CRACK || t === SPIKE || t === EMPTY; }

function genRow(n) {
  if (n < 3) return Array(COLS).fill(SAFE);
  const d = Math.min(n / 60, 1);
  const row = [];
  for (let i = 0; i < COLS; i++) {
    const r = Math.random();
    if (r < 0.05 + d * 0.13) row.push(EMPTY);
    else if (r < 0.12 + d * 0.11) row.push(TREE);
    else if (r < 0.17 + d * 0.10) row.push(CRACK);
    else if (r < 0.21 + d * 0.09) row.push(SPIKE);
    else row.push(SAFE);
  }
  // fairness: edge columns are often a climber's only reachable target — never deadly
  if (isDeadly(row[0])) row[0] = SAFE;
  if (isDeadly(row[COLS - 1])) row[COLS - 1] = SAFE;
  // fairness: never strand a climber between two deadly diagonals
  for (let i = 0; i < COLS - 1; i++) {
    if (isDeadly(row[i]) && isDeadly(row[i + 1])) row[i + 1] = SAFE;
  }
  let safeCount = row.filter(t => t === SAFE).length;
  while (safeCount < 2) {
    const idx = Math.floor(Math.random() * COLS);
    if (row[idx] !== SAFE) { row[idx] = SAFE; safeCount++; }
  }
  return row;
}

function getRow(rows, n) {
  if (!rows[n]) rows[n] = genRow(n);
  return rows[n];
}

function BlockTile({ type }) {
  if (type === EMPTY) return null;

  let top, left, right;
  if (type === SPIKE) { top = palette.rock; left = palette.rockDark; right = "#7C828C"; }
  else if (type === CRACK) { top = palette.rust; left = palette.rustDark; right = "#7A3322"; }
  else { top = palette.accent; left = "#5C7A2E"; right = "#7A9E3C"; }

  return (
    <div style={{ position: "absolute", width: BW, height: BOX_H, left: -HALF, top: -HH }}>
      <div style={{ position: "absolute", inset: 0, clipPath: LEFT_CLIP, background: left }} />
      <div style={{ position: "absolute", inset: 0, clipPath: RIGHT_CLIP, background: right }} />
      <div style={{
        position: "absolute", inset: 0, clipPath: TOP_CLIP,
        background: `linear-gradient(135deg, ${top}, ${left === palette.rockDark ? "#B4B9C1" : left === palette.rustDark ? "#D66A4C" : "#DFF29B"})`,
      }} />

      {type === TREE && (
        <div style={{ position: "absolute", left: "50%", top: -22, transform: "translateX(-50%)" }}>
          <div style={{ position: "absolute", left: -2, top: 18, width: 4, height: 10, background: "#5A3C22", borderRadius: 1 }} />
          <div style={{
            position: "absolute", left: -13, top: -2, width: 0, height: 0,
            borderLeft: "13px solid transparent", borderRight: "13px solid transparent",
            borderBottom: "20px solid #2E8B3D",
          }} />
          <div style={{
            position: "absolute", left: -9, top: -14, width: 0, height: 0,
            borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
            borderBottom: "15px solid #17D39B",
          }} />
        </div>
      )}

      {type === SPIKE && (
        <div style={{ position: "absolute", left: "50%", top: -16, transform: "translateX(-50%)", display: "flex", gap: 2 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 0, height: 0, marginTop: i === 1 ? -6 : 0,
              borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
              borderBottom: `${i === 1 ? 22 : 16}px solid #6E7480`,
            }} />
          ))}
        </div>
      )}

      {type === CRACK && (
        <svg width={BW} height={BOX_H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <path d="M 20 24 L 32 30 L 44 25" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" fill="none" />
          <path d="M 27 32 L 36 36" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </div>
  );
}

function Climber({ x, y, dead, leanDir, bumpKey }) {
  return (
    <div
      key={bumpKey}
      style={{
        position: "absolute", left: x, top: y, zIndex: 5,
        transform: `translate(-50%, -100%) rotate(${dead ? 24 : leanDir * 10}deg)`,
        opacity: dead ? 0.55 : 1,
        transition: dead ? "transform 0.4s ease, opacity 0.4s ease" : "transform 0.15s ease",
        animation: bumpKey ? "bump 0.2s ease" : dead ? "none" : "idleBob 1.6s ease-in-out infinite",
      }}
    >
      <div style={{ width: 3, height: 9, background: palette.climberDark, margin: "0 auto", borderRadius: 1 }} />
      <div style={{ width: 20, height: 16, background: palette.climber, borderRadius: 5, position: "relative", boxShadow: "0 2px 6px rgba(0,0,0,0.35)" }}>
        <div style={{ position: "absolute", left: 2, top: -2, width: 6, height: 10, background: palette.climberDark, borderRadius: 2, transform: "rotate(-18deg)" }} />
        <div style={{ position: "absolute", right: 2, top: -2, width: 6, height: 10, background: palette.climberDark, borderRadius: 2, transform: "rotate(18deg)" }} />
      </div>
      <div style={{
        width: 13, height: 13, borderRadius: "50%", background: "#E8C6A0",
        margin: "-3px auto 0", position: "relative",
      }}>
        <div style={{ position: "absolute", left: 3, top: 5, width: 2, height: 2, borderRadius: "50%", background: "#2A2420" }} />
        <div style={{ position: "absolute", right: 3, top: 5, width: 2, height: 2, borderRadius: "50%", background: "#2A2420" }} />
        <div style={{ position: "absolute", left: 1, top: -6, width: 11, height: 7, background: "#D94F3C", borderRadius: "6px 6px 0 0" }} />
      </div>
    </div>
  );
}

export default function PloopClimb() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [deathReason, setDeathReason] = useState("fall");
  const [bump, setBump] = useState(null);
  const [, setFrameTick] = useState(0);

  const trackRef = useRef(null);
  const rowsRef = useRef({});
  const playerRef = useRef({ row: 0, col: START_COL });
  const hopRef = useRef({ active: false, from: null, to: null, t: 0, dir: 0 });
  const dangerRowRef = useRef(-16);
  const dangerSpeedRef = useRef(BASE_DANGER_SPEED);
  const camYRef = useRef(0);
  const scoreRef = useRef(0);
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

  const endGame = useCallback((reason) => {
    setDeathReason(reason);
    setPhase(p => {
      if (p !== "play") return p;
      showInterstitial();
      return "dead";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  /* ── main loop: hop progress, rising collapse, camera follow ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const hop = hopRef.current;
      if (hop.active) {
        hop.t = Math.min(1, hop.t + dt / HOP_DURATION);
        if (hop.t >= 1) {
          const landed = getRow(rowsRef.current, hop.to.r)[hop.to.c];
          playerRef.current = { row: hop.to.r, col: hop.to.c };
          hop.active = false;
          if (isDeadly(landed)) {
            endGame("fall");
            return;
          }
          scoreRef.current = Math.max(scoreRef.current, hop.to.r);
          setScore(scoreRef.current);
        }
      }

      dangerSpeedRef.current = Math.min(MAX_DANGER_SPEED, BASE_DANGER_SPEED + scoreRef.current * DANGER_SPEED_PER_SCORE);
      dangerRowRef.current += dangerSpeedRef.current * dt;
      if (!hop.active && playerRef.current.row <= dangerRowRef.current) {
        endGame("danger");
        return;
      }

      const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
      const targetCam = playerRef.current.row * ROW_SP - trackHeight * CAM_LEAD_RATIO;
      camYRef.current += (targetCam - camYRef.current) * CAM_LERP;

      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    rowsRef.current = {};
    playerRef.current = { row: 0, col: START_COL };
    hopRef.current = { active: false, from: null, to: null, t: 0, dir: 0 };
    dangerRowRef.current = -16;
    dangerSpeedRef.current = BASE_DANGER_SPEED;
    camYRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setBump(null);
    setPhase("play");
  }, []);

  const attemptMove = useCallback((dir) => {
    if (phase !== "play") {
      startGame();
      return;
    }
    if (hopRef.current.active) return;

    const { row, col } = playerRef.current;
    const target = dir === -1 ? upperL(row, col) : upperR(row, col);
    if (!target || target.c < 0 || target.c >= COLS) {
      setBump({ dir, key: performance.now() });
      return;
    }
    const targetType = getRow(rowsRef.current, target.r)[target.c];
    if (targetType === TREE) {
      setBump({ dir, key: performance.now() });
      return;
    }
    hopRef.current = { active: true, from: { row, col }, to: target, t: 0, dir };
  }, [phase, startGame]);

  const handlePointerDown = useCallback((e) => {
    if (phase !== "play") {
      startGame();
      return;
    }
    const rect = trackRef.current ? trackRef.current.getBoundingClientRect() : null;
    const isLeft = rect ? e.clientX - rect.left < rect.width / 2 : true;
    attemptMove(isLeft ? -1 : 1);
  }, [phase, startGame, attemptMove]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") attemptMove(-1);
      if (e.key === "ArrowRight" || e.key === "d") attemptMove(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attemptMove]);

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(null), 200);
    return () => clearTimeout(t);
  }, [bump]);

  const trackWidth = trackRef.current ? trackRef.current.clientWidth : 360;
  const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
  const camY = camYRef.current;
  const hop = hopRef.current;
  const player = playerRef.current;

  const minRow = Math.max(0, Math.floor((camY - trackHeight * 0.3) / ROW_SP) - 2);
  const maxRow = Math.ceil((camY + trackHeight) / ROW_SP) + 3;
  const blocks = [];
  if (phase === "play" || phase === "dead") {
    for (let rn = maxRow; rn >= minRow; rn--) {
      const row = getRow(rowsRef.current, rn);
      const sy = screenY(rn, camY, trackHeight);
      if (sy < -BOX_H - 40 || sy > trackHeight + 40) continue;
      for (let c = 0; c < COLS; c++) {
        if (row[c] === EMPTY) continue;
        blocks.push({ key: `${rn}-${c}`, type: row[c], x: bx(rn, c, trackWidth), y: sy, rn });
      }
    }
  }

  let climberX = bx(player.row, player.col, trackWidth);
  let climberY = screenY(player.row, camY, trackHeight);
  if (hop.active) {
    const fx = bx(hop.from.row, hop.from.col, trackWidth), fy = screenY(hop.from.row, camY, trackHeight);
    const tx = bx(hop.to.row, hop.to.col, trackWidth), ty = screenY(hop.to.row, camY, trackHeight);
    climberX = fx + (tx - fx) * hop.t;
    climberY = fy + (ty - fy) * hop.t - Math.sin(hop.t * Math.PI) * ARC_HEIGHT;
  }

  const dangerY = screenY(dangerRowRef.current, camY, trackHeight);
  const dangerClose = !hop.active && player.row - dangerRowRef.current < DANGER_WARN_ROWS;

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: palette.bg, fontFamily: fontUI,
        userSelect: "none", WebkitUserSelect: "none",
        touchAction: "none", position: "relative", overflow: "hidden",
      }}
    >
      {phase === "play" && <ScoreHeader score={score} best={best} theme={palette} />}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {(phase === "play" || phase === "dead") && (
          <>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, #2E86D6 0%, #5CB4E8 55%, #B9E4F2 100%)",
            }} />
            <div style={{
              position: "absolute", width: 140, height: 60, borderRadius: "50%",
              background: "rgba(255,255,255,0.55)", filter: "blur(10px)",
              left: "10%", top: "18%", animation: "drift 26s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 100, height: 44, borderRadius: "50%",
              background: "rgba(255,255,255,0.4)", filter: "blur(9px)",
              right: "8%", top: "32%", animation: "drift 34s ease-in-out infinite reverse",
            }} />

            {blocks.map(b => (
              <div key={b.key} style={{ position: "absolute", left: b.x, top: b.y }}>
                <BlockTile type={b.type} />
              </div>
            ))}

            <Climber x={climberX} y={climberY} dead={phase === "dead"} leanDir={bump ? bump.dir : hop.active ? hop.dir : 0} bumpKey={bump ? bump.key : null} />

            <div style={{
              position: "absolute", left: 0, right: 0, top: dangerY, bottom: -200,
              background: `linear-gradient(180deg, transparent 0%, ${palette.danger}66 22%, ${palette.dangerDark} 70%)`,
              clipPath: "polygon(0% 8px, 8% 0%, 18% 10px, 30% 2px, 42% 12px, 55% 0%, 68% 9px, 80% 1px, 92% 11px, 100% 4px, 100% 100%, 0% 100%)",
              boxShadow: dangerClose ? `0 0 40px 10px ${palette.danger}aa` : "none",
              animation: dangerClose ? "dangerPulse 0.7s ease-in-out infinite" : "none",
              zIndex: 6,
            }} />
          </>
        )}

        {phase === "start" && (
          <StartScreen
            theme={palette}
            title="PLOOP CLIMB"
            preview={
              <div style={{ display: "flex", gap: 14 }}>
                {[
                  { type: SAFE, label: "Safe" },
                  { type: TREE, label: "Blocks" },
                  { type: SPIKE, label: "Deadly" },
                  { type: CRACK, label: "Deadly" },
                ].map(item => (
                  <div key={item.label + item.type} style={{ textAlign: "center" }}>
                    <div style={{ position: "relative", width: BW * 0.6, height: BOX_H * 0.6 + HH * 0.6 }}>
                      <div style={{ position: "absolute", left: HALF * 0.6, top: HH * 0.6, transform: "scale(0.6)", transformOrigin: "top left" }}>
                        <BlockTile type={item.type} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            }
            description="Hop left or right, climbing block to block. Trees block your step. Spikes, rubble and gaps are deadly — and the collapse below never stops climbing after you."
            best={best}
          />
        )}

        {phase === "dead" && (
          <GameOverCard
            theme={palette}
            title={deathReason === "danger" ? "Buried in rubble!" : "You slipped!"}
            score={score}
            best={best}
            accentColor={palette.accent}
          />
        )}
      </div>

      <style>{`
        @keyframes idleBob {
          0%, 100% { transform: translate(-50%, -100%) translateY(0); }
          50% { transform: translate(-50%, -100%) translateY(-3px); }
        }
        @keyframes bump {
          0% { transform: translate(-50%, -100%) rotate(0deg); }
          30% { transform: translate(-50%, -100%) rotate(${bump ? bump.dir * -14 : 0}deg); }
          100% { transform: translate(-50%, -100%) rotate(0deg); }
        }
        @keyframes drift {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(24px); }
        }
        @keyframes dangerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}
