import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { initAds, showInterstitial } from "./ads.js";
import { loadBestScore, saveBestScore } from "./save.js";

const N = 7;
const TYPES = ["+", "—", "|", "✕", "✱"];
const TYPE_LABEL = { "+": "horizontal & vertical", "—": "horizontal only", "|": "vertical only", "✕": "diagonal only", "✱": "all directions" };
const DIRS = {
  "+": [[0,1],[0,-1],[1,0],[-1,0]],
  "—": [[0,1],[0,-1]],
  "|": [[1,0],[-1,0]],
  "✕": [[1,1],[1,-1],[-1,1],[-1,-1]],
  "✱": [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]],
};

/* ── reachability (chess-like sliding, blocked by pieces) ── */
function getReachable(r, c, type, blockers) {
  const moves = [];
  for (const [dr, dc] of DIRS[type]) {
    for (let i = 1; i <= N; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) break;
      moves.push({ row: nr, col: nc });
      if (blockers.some(b => b.row === nr && b.col === nc)) break;
    }
  }
  return moves;
}

function randType() { return TYPES[Math.floor(Math.random() * TYPES.length)]; }

let idCounter = 1;
function spawnEnemy(player, enemies) {
  const occ = [player, ...enemies];
  const cands = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (occ.some(p => p.row === r && p.col === c)) continue;
      if (Math.abs(r - player.row) + Math.abs(c - player.col) < 2) continue;
      cands.push({ row: r, col: c });
    }
  if (!cands.length) return null;
  const pos = cands[Math.floor(Math.random() * cands.length)];
  return { ...pos, type: randType(), id: idCounter++ };
}

/* ── styles — 37apps brand kit: dark neutral base + Violet Spark accent ── */
const palette = {
  bg: "#15141B",
  boardBorder: "#3A3944",
  cellLight: "#1E1D26",
  cellDark: "#242330",
  playerBg: "#9B6BFF",
  playerGlow: "rgba(155,107,255,0.4)",
  enemyBg: "#3A3944",
  moveDot: "rgba(155,107,255,0.55)",
  captureBg: "rgba(55,214,160,0.28)",
  threatBg: "rgba(255,107,87,0.12)",
  timerBar: "#9B6BFF",
  timerLow: "#FF6B57",
  text: "#F5F3F0",
  textMuted: "#9A98A6",
  panelBg: "#2A2933",
  accent: "#9B6BFF",
};

const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

export default function PloopChess() {
  const [phase, setPhase] = useState("start");
  const [player, setPlayer] = useState({ row: 3, col: 3, type: "+" });
  const [enemies, setEnemies] = useState([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [timer, setTimer] = useState(30);
  const [flash, setFlash] = useState(null);
  const [typeChanged, setTypeChanged] = useState(false);
  const [trapped, setTrapped] = useState(false);
  const timerRef = useRef(null);
  const playCountRef = useRef(0);
  const bestLoadedRef = useRef(false);

  /* ── ads: init once on mount ── */
  useEffect(() => {
    initAds();
  }, []);

  /* ── best score: load once on mount, persist on every change after that ── */
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

  /* ── compute valid (safe) moves ── */
  const { safeMoves, threatSet } = useMemo(() => {
    if (phase !== "play") return { safeMoves: [], threatSet: new Set() };

    const allPieces = [player, ...enemies];

    // threat zones: all squares any enemy can reach
    const tSet = new Set();
    for (const en of enemies) {
      for (const sq of getReachable(en.row, en.col, en.type, allPieces)) {
        tSet.add(`${sq.row},${sq.col}`);
      }
    }

    // player reachable squares
    const reachable = getReachable(player.row, player.col, player.type, allPieces);

    const safe = reachable.map(sq => {
      const captured = enemies.find(e => e.row === sq.row && e.col === sq.col);
      const remaining = enemies.filter(e => e !== captured);
      // simulate board after move
      const after = [{ row: sq.row, col: sq.col }, ...remaining];
      const threatened = remaining.some(en => {
        return getReachable(en.row, en.col, en.type, after)
          .some(r => r.row === sq.row && r.col === sq.col);
      });
      return { ...sq, isCapture: !!captured, isSafe: !threatened };
    });

    return { safeMoves: safe, threatSet: tSet };
  }, [player, enemies, phase]);

  /* ── timer ── */
  useEffect(() => {
    if (phase !== "play") { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 0.1) { setPhase("dead"); return 0; }
        return +(t - 0.1).toFixed(1);
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  /* ── check trapped ── */
  useEffect(() => {
    if (phase !== "play") return;
    const hasSafe = safeMoves.some(m => m.isSafe);
    if (!hasSafe && enemies.length > 0) {
      setTrapped(true);
      const t = setTimeout(() => { setPhase("dead"); setTrapped(false); }, 1200);
      return () => clearTimeout(t);
    } else {
      setTrapped(false);
    }
  }, [safeMoves, enemies, phase]);

  /* ── start / restart ── */
  const startGame = useCallback(() => {
    if (playCountRef.current > 0) showInterstitial();
    playCountRef.current += 1;

    const p = { row: 3, col: 3, type: randType() };
    const e = [];
    for (let i = 0; i < 3; i++) { const en = spawnEnemy(p, e); if (en) e.push(en); }
    setPlayer(p);
    setEnemies(e);
    setScore(0);
    setTimer(30);
    setFlash(null);
    setTypeChanged(false);
    setTrapped(false);
    setPhase("play");
  }, []);

  /* ── handle move ── */
  const handleTap = useCallback((row, col) => {
    if (phase === "start" || phase === "dead") { startGame(); return; }
    if (phase !== "play" || trapped) return;

    const move = safeMoves.find(m => m.row === row && m.col === col);
    if (!move) return;

    // dangerous move → game over
    if (!move.isSafe) {
      const ns = score;
      if (ns > best) setBest(ns);
      setPlayer(p => ({ ...p, row, col }));
      setPhase("dead");
      return;
    }

    const newP = { ...player, row, col };

    if (move.isCapture) {
      const remaining = enemies.filter(e => !(e.row === row && e.col === col));
      const ns = score + 1;
      setScore(ns);
      setTimer(t => +(t + 2).toFixed(1));
      if (ns > best) setBest(ns);

      // flash
      setFlash({ row, col, id: Date.now() });
      setTimeout(() => setFlash(null), 700);

      // change type every 3 captures
      if (ns % 3 === 0) {
        const oldType = newP.type;
        do { newP.type = randType(); } while (newP.type === oldType && TYPES.length > 1);
        setTypeChanged(true);
        setTimeout(() => setTypeChanged(false), 1000);
      }

      // spawn replacement + extra after every 5
      const toSpawn = 1 + (ns % 5 === 0 ? 1 : 0);
      const spawned = [...remaining];
      for (let i = 0; i < toSpawn; i++) {
        const en = spawnEnemy(newP, spawned);
        if (en) spawned.push(en);
      }
      setEnemies(spawned);
    }

    setPlayer(newP);
  }, [phase, safeMoves, player, enemies, score, best, trapped, startGame]);

  /* ── render ── */
  const timerPct = Math.max(0, timer / 35);
  const timerColor = timer < 8 ? palette.timerLow : palette.timerBar;
  const cellSize = `min(${Math.floor(380 / N)}px, ${Math.floor(85 / N)}vw)`;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: palette.bg, fontFamily: fontUI,
      userSelect: "none", WebkitUserSelect: "none", padding: 12,
    }}>

      {/* header */}
      {phase === "play" && (
        <div style={{
          width: "100%", maxWidth: N * 56, marginBottom: 10,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 15, color: palette.textMuted, fontWeight: 600 }}>
              SCORE <span style={{ fontSize: 26, color: palette.text, fontWeight: 800, fontFamily: fontDisplay }}>{score}</span>
            </span>
            <span style={{
              fontSize: 26, fontWeight: 800, fontFamily: fontDisplay,
              color: timer < 8 ? palette.timerLow : palette.text,
              fontVariantNumeric: "tabular-nums",
            }}>
              {timer.toFixed(1)}s
            </span>
          </div>
          {/* timer bar */}
          <div style={{
            height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${timerPct * 100}%`,
              background: timerColor,
              transition: "width 0.1s linear, background 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* board */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${N}, ${cellSize})`,
        gridTemplateRows: `repeat(${N}, ${cellSize})`,
        border: `3px solid ${palette.boardBorder}`,
        borderRadius: 10, overflow: "hidden",
        boxShadow: "0 6px 28px rgba(0,0,0,0.35)",
        position: "relative",
      }}>
        {Array.from({ length: N * N }).map((_, i) => {
          const row = Math.floor(i / N), col = i % N;
          const isLight = (row + col) % 2 === 0;
          const isPlayer = phase !== "start" && player.row === row && player.col === col;
          const enemy = phase !== "start" ? enemies.find(e => e.row === row && e.col === col) : null;
          const move = safeMoves.find(m => m.row === row && m.col === col);
          const isSafeMove = move && move.isSafe;
          const isSafeCapture = move && move.isSafe && move.isCapture;
          const isDangerousMove = move && !move.isSafe;
          const isThreat = threatSet.has(`${row},${col}`) && !isPlayer && !enemy;
          const isFlash = flash && flash.row === row && flash.col === col;

          return (
            <div
              key={i}
              onClick={() => handleTap(row, col)}
              style={{
                position: "relative",
                background: isLight ? palette.cellLight : palette.cellDark,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (isSafeMove || phase !== "play") ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
              {/* threat overlay */}
              {isThreat && phase === "play" && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: palette.threatBg,
                  pointerEvents: "none",
                }} />
              )}

              {/* capture highlight */}
              {isSafeCapture && phase === "play" && (
                <div style={{
                  position: "absolute", inset: 3, borderRadius: 8,
                  background: palette.captureBg,
                  border: "2px solid rgba(80,200,100,0.5)",
                  pointerEvents: "none",
                }} />
              )}

              {/* valid move dot */}
              {isSafeMove && !isSafeCapture && phase === "play" && (
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: palette.moveDot,
                  position: "absolute",
                  pointerEvents: "none",
                }} />
              )}

              {/* dangerous move dot */}
              {isDangerousMove && phase === "play" && (
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: "rgba(240,90,90,0.35)",
                  border: "1.5px solid rgba(240,90,90,0.5)",
                  position: "absolute",
                  pointerEvents: "none",
                }} />
              )}

              {/* player piece */}
              {isPlayer && phase === "play" && (
                <div style={{
                  width: "78%", height: "78%", borderRadius: "50%",
                  background: palette.playerBg,
                  boxShadow: `0 2px 10px ${palette.playerGlow}, inset 0 -2px 4px rgba(0,0,0,0.12)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: `calc(${cellSize} * 0.42)`,
                  fontWeight: 900, color: "#fff",
                  zIndex: 2, position: "relative",
                  animation: "pulse 1.6s ease-in-out infinite",
                }}>
                  {player.type}
                </div>
              )}

              {/* enemy piece */}
              {enemy && phase === "play" && (
                <div style={{
                  width: "72%", height: "72%", borderRadius: "50%",
                  background: palette.enemyBg,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.18), inset 0 -2px 3px rgba(0,0,0,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: `calc(${cellSize} * 0.38)`,
                  fontWeight: 800, color: "#fff",
                  zIndex: 2, position: "relative",
                }}>
                  {enemy.type}
                </div>
              )}

              {/* capture flash */}
              {isFlash && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 5, pointerEvents: "none",
                  animation: "flashUp 0.7s ease-out forwards",
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#37D6A0" }}>+2s</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* info bar */}
      {phase === "play" && (
        <div style={{
          marginTop: 12, display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px", borderRadius: 10,
          background: typeChanged ? "rgba(155,107,255,0.18)" : "rgba(255,255,255,0.04)",
          transition: "background 0.3s",
          maxWidth: N * 56,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: palette.playerBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0,
          }}>
            {player.type}
          </div>
          <span style={{ fontSize: 13, color: palette.textMuted }}>
            {TYPE_LABEL[player.type]}
          </span>
          {typeChanged && (
            <span style={{ fontSize: 12, fontWeight: 700, color: palette.playerBg, marginLeft: "auto" }}>
              NEW!
            </span>
          )}
        </div>
      )}

      {/* trapped message */}
      {trapped && (
        <div style={{
          marginTop: 14, padding: "10px 24px", borderRadius: 10,
          background: "rgba(240,90,90,0.12)", color: palette.timerLow,
          fontSize: 15, fontWeight: 700, textAlign: "center",
        }}>
          Trapped! No safe moves left...
        </div>
      )}

      {/* legend */}
      {phase === "play" && !trapped && (
        <div style={{
          marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {[
            { color: palette.moveDot, label: "safe move" },
            { color: "rgba(55,214,160,0.6)", label: "capture" },
            { color: "rgba(255,107,87,0.35)", label: "danger zone" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, color: palette.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── START SCREEN ── */}
      {phase === "start" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(21,20,27,0.96)", zIndex: 10,
        }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: palette.text, marginBottom: 4, fontFamily: fontDisplay }}>
            PLOOP
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, color: palette.textMuted, marginBottom: 30, letterSpacing: 4, fontFamily: fontDisplay }}>
            CHESS
          </div>

          {/* symbols legend */}
          <div style={{
            background: palette.panelBg, borderRadius: 14, padding: "16px 24px",
            marginBottom: 28, boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column", gap: 8, minWidth: 220,
          }}>
            {TYPES.map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: palette.enemyBg, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>{t}</div>
                <span style={{ fontSize: 13, color: palette.text }}>{TYPE_LABEL[t]}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, color: palette.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 24 }}>
            Capture enemy pieces without stepping into their range. 30s timer, +2s per capture.
          </div>

          <div style={{
            fontSize: 18, fontWeight: 700, color: palette.text, fontFamily: fontDisplay,
            animation: "pulse 1.6s ease-in-out infinite",
            cursor: "pointer",
          }} onClick={startGame}>
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
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            textAlign: "center", minWidth: 220,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: palette.text, marginBottom: 6 }}>
              {timer <= 0 ? "Time's up!" : "Captured!"}
            </div>
            <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>SCORE</div>
            <div style={{ fontSize: 48, fontWeight: 900, color: palette.text, marginBottom: 6, fontFamily: fontDisplay }}>
              {score}
            </div>
            <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 4 }}>
              BEST: {best}
            </div>
            {score > 0 && score >= best && (
              <div style={{ fontSize: 13, fontWeight: 700, color: palette.accent, marginBottom: 8 }}>
                ★ NEW BEST ★
              </div>
            )}
            <div style={{
              marginTop: 20, fontSize: 16, fontWeight: 700, color: palette.text, fontFamily: fontDisplay,
              cursor: "pointer", animation: "pulse 1.6s ease-in-out infinite",
            }} onClick={startGame}>
              TAP TO RETRY
            </div>
          </div>
        </div>
      )}

      {/* global keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes flashUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-22px); }
        }
      `}</style>
    </div>
  );
}
