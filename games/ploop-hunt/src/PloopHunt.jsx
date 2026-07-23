import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { animated } from "@react-spring/web";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay, ACCENTS } from "@37apps/core/theme.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { useScorePop } from "@37apps/core/animation.js";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";

const { loadBestScore, saveBestScore } = createBestScoreStore("ploophunt.bestScore");

const N = 7;
const PLAYER_TYPE = "✱";
const TYPES = ["+", "—", "|", "✕", "✱"];
const TYPE_LABEL = { "+": "orthogonal", "—": "horizontal only", "|": "vertical only", "✕": "diagonal only", "✱": "omnidirectional" };
const DIRS = {
  "+": [[0,1],[0,-1],[1,0],[-1,0]],
  "—": [[0,1],[0,-1]],
  "|": [[1,0],[-1,0]],
  "✕": [[1,1],[1,-1],[-1,1],[-1,-1]],
  "✱": [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]],
};
// rotation angles (0 = up, clockwise) used to draw each type's arrow-burst glyph
const ICON_DIRS = {
  "+": [0, 90, 180, 270],
  "—": [90, 270],
  "|": [0, 180],
  "✕": [45, 135, 225, 315],
  "✱": [0, 45, 90, 135, 180, 225, 270, 315],
};

const SLIDE_MS = 260;
const TELEGRAPH_MS = 320;

/* ── reachability (sliding, blocked by pieces) ── */
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

function chebyshev(a, b) { return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)); }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let idCounter = 1;

/** Spawns a new enemy somewhere it can NOT immediately reach the player's square. */
function spawnEnemySafe(player, enemies) {
  const occ = [player, ...enemies];
  const cands = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (occ.some(p => p.row === r && p.col === c)) continue;
      if (Math.abs(r - player.row) + Math.abs(c - player.col) < 2) continue;
      cands.push({ row: r, col: c });
    }
  for (const pos of shuffle(cands)) {
    for (const type of shuffle(TYPES)) {
      const reach = getReachable(pos.row, pos.col, type, occ);
      const threatens = reach.some(sq => sq.row === player.row && sq.col === player.col);
      if (!threatens) return { ...pos, type, id: idCounter++ };
    }
  }
  return null;
}

/** Picks the enemy nearest to the player that has a legal move, and its best chase move. */
function planEnemyTurn(enemies, player) {
  const blockers = [player, ...enemies];
  const byDistance = [...enemies].sort((a, b) => chebyshev(a, player) - chebyshev(b, player));
  for (const en of byDistance) {
    const options = getReachable(en.row, en.col, en.type, blockers);
    if (!options.length) continue;
    let bestDist = Infinity, ties = [];
    for (const opt of options) {
      const d = chebyshev(opt, player);
      if (d < bestDist) { bestDist = d; ties = [opt]; }
      else if (d === bestDist) ties.push(opt);
    }
    const to = ties[Math.floor(Math.random() * ties.length)];
    return { id: en.id, to };
  }
  return null;
}

/* ── piece glyph: arrow-burst compass instead of a text character ── */
function PieceGlyph({ type, color, size = "62%" }) {
  const dirs = ICON_DIRS[type] || [];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: "block", overflow: "visible" }}>
      <circle cx="12" cy="12" r="2.6" fill={color} />
      {dirs.map(deg => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          <line x1="12" y1="9.5" x2="12" y2="3.2" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
          <path d="M8.8 6.4 L12 2.4 L15.2 6.4" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

/* ── styles — 37apps brand kit: light neutral base + Violet Spark accent ── */
const palette = {
  ...baseTheme,
  boardBorder: "#E3DED3",
  cellLight: "#FFFFFF",
  cellDark: "#EFEAE1",
  playerBg: ACCENTS[6],
  playerGlow: "rgba(123,66,255,0.4)",
  enemyBg: "#726F7C",
  deniedBg: "rgba(255,69,41,0.22)",
  timerBar: ACCENTS[6],
  timerLow: ACCENTS[0],
  accent: ACCENTS[6],
};
const TYPE_COLOR = { "+": ACCENTS[5], "—": ACCENTS[1], "|": ACCENTS[3], "✕": ACCENTS[7], "✱": ACCENTS[0] };

export default function PloopHunt() {
  const [phase, setPhase] = useState("start");
  const [player, setPlayer] = useState({ row: 3, col: 3 });
  const [enemies, setEnemies] = useState([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [timer, setTimer] = useState(30);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { id, to } — telegraphed enemy move
  const [deniedCell, setDeniedCell] = useState(null);
  const [trappedWarning, setTrappedWarning] = useState(false);
  const [deathReason, setDeathReason] = useState(null); // 'timeout' | 'caught' | 'trapped'
  const timerRef = useRef(null);
  const pendingTimeoutsRef = useRef([]);
  const bestLoadedRef = useRef(false);

  const scorePop = useScorePop(score);

  const clearPendingTimeouts = useCallback(() => {
    pendingTimeoutsRef.current.forEach(clearTimeout);
    pendingTimeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearPendingTimeouts(), [clearPendingTimeouts]);

  /* ── game over: called from all three death paths (timeout, trapped, caught) —
     centralized so the interstitial fires exactly once per round, right when the
     board freezes, instead of before the next round starts (which let the game
     loop keep running invisibly behind the ad). ── */
  const endGame = useCallback((reason, finalScore) => {
    setBest(b => Math.max(b, finalScore));
    setDeathReason(reason);
    setPhase("dead");
    showInterstitial();
  }, []);

  /* ── ads + audio: init once on mount ── */
  useEffect(() => {
    initAds();
    initAudio();
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

  /* ── player's legal squares this turn (no visual hints — used only for validation) ── */
  const reachable = useMemo(() => {
    if (phase !== "play") return [];
    return getReachable(player.row, player.col, PLAYER_TYPE, [player, ...enemies]);
  }, [player, enemies, phase]);

  /* ── timer ── */
  useEffect(() => {
    if (phase !== "play") { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 0.1) {
          endGame("timeout", score);
          return 0;
        }
        return +(t - 0.1).toFixed(1);
      });
    }, 100);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ── trapped check: no legal moves left at all ── */
  useEffect(() => {
    if (phase !== "play" || busy) return;
    if (reachable.length === 0 && enemies.length > 0) {
      setBusy(true);
      setTrappedWarning(true);
      const t = setTimeout(() => {
        endGame("trapped", score);
        setTrappedWarning(false);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [reachable, enemies, phase, busy, score, endGame]);

  /* ── start / restart ── */
  const startGame = useCallback(() => {
    clearPendingTimeouts();

    const p = { row: 3, col: 3 };
    const e = [];
    for (let i = 0; i < 3; i++) { const en = spawnEnemySafe(p, e); if (en) e.push(en); }
    setPlayer(p);
    setEnemies(e);
    setScore(0);
    setTimer(30);
    setFlash(null);
    setBusy(false);
    setPendingAction(null);
    setDeniedCell(null);
    setTrappedWarning(false);
    setDeathReason(null);
    setPhase("play");
  }, [clearPendingTimeouts]);

  /* ── enemy turn: telegraph → move → check capture-of-player ── */
  const runEnemyTurn = useCallback((currentEnemies, currentPlayer, currentScore) => {
    const action = planEnemyTurn(currentEnemies, currentPlayer);
    if (!action) { setBusy(false); return; }

    setPendingAction(action);
    const t1 = setTimeout(() => {
      sfx.shift();
      setEnemies(es => es.map(e => (e.id === action.id ? { ...e, row: action.to.row, col: action.to.col } : e)));
      setPendingAction(null);

      const t2 = setTimeout(() => {
        if (action.to.row === currentPlayer.row && action.to.col === currentPlayer.col) {
          sfx.hit();
          endGame("caught", currentScore);
        } else {
          setBusy(false);
        }
      }, SLIDE_MS);
      pendingTimeoutsRef.current.push(t2);
    }, TELEGRAPH_MS);
    pendingTimeoutsRef.current.push(t1);
  }, [endGame]);

  /* ── handle a tap ── */
  const handleTap = useCallback((row, col) => {
    if (phase !== "play" || busy) return;

    const move = reachable.find(m => m.row === row && m.col === col);
    if (!move) {
      sfx.select();
      setDeniedCell({ row, col, ts: Date.now() });
      setTimeout(() => setDeniedCell(null), 350);
      return;
    }

    setBusy(true);
    const newP = { row, col };
    const capturedEnemy = enemies.find(e => e.row === row && e.col === col);

    if (capturedEnemy) {
      const remaining = enemies.filter(e => e.id !== capturedEnemy.id);
      const ns = score + 1;
      setScore(ns);
      setTimer(t => +(t + 2).toFixed(1));
      sfx.score();

      setFlash({ row, col, id: Date.now() });
      setTimeout(() => setFlash(null), 700);

      const toSpawn = 1 + (ns % 5 === 0 ? 1 : 0);
      const spawned = [...remaining];
      for (let i = 0; i < toSpawn; i++) {
        const en = spawnEnemySafe(newP, spawned);
        if (en) spawned.push(en);
      }
      setEnemies(spawned);
      setPlayer(newP);
      runEnemyTurn(spawned, newP, ns);
    } else {
      sfx.tap();
      setPlayer(newP);
      runEnemyTurn(enemies, newP, score);
    }
  }, [phase, busy, reachable, enemies, score, runEnemyTurn]);

  /* ── render ── */
  const timerPct = Math.max(0, timer / 35);
  const timerColor = timer < 8 ? palette.timerLow : palette.timerBar;
  const cellSize = `min(${Math.floor(380 / N)}px, ${Math.floor(85 / N)}vw)`;
  const boardSize = `calc(${cellSize} * ${N})`;
  const cellPct = 100 / N;

  const deathTitle = deathReason === "timeout" ? "Time's up!" : deathReason === "caught" ? "Caught!" : "Trapped!";

  return (
    <div
      onPointerDown={() => { if (phase !== "play") startGame(); }}
      style={{
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
              SCORE <animated.span style={{
                fontSize: 26, color: palette.text, fontWeight: 800, fontFamily: fontDisplay,
                display: "inline-block", transform: scorePop.scale.to(s => `scale(${s})`),
              }}>{score}</animated.span>
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
            height: 6, borderRadius: 3, background: "rgba(0,0,0,0.08)", overflow: "hidden",
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
        position: "relative",
        width: boardSize, height: boardSize,
        border: `3px solid ${palette.boardBorder}`,
        borderRadius: 10,
        boxShadow: "0 6px 28px rgba(0,0,0,0.35)",
      }}>
        {/* background grid — click targets only, no move hints */}
        <div style={{
          position: "absolute", inset: 0, display: "grid",
          gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)`,
          borderRadius: 7, overflow: "hidden",
        }}>
          {Array.from({ length: N * N }).map((_, i) => {
            const row = Math.floor(i / N), col = i % N;
            const isLight = (row + col) % 2 === 0;
            const isDenied = deniedCell && deniedCell.row === row && deniedCell.col === col;
            return (
              <div
                key={i}
                onClick={() => handleTap(row, col)}
                style={{
                  position: "relative",
                  background: isLight ? palette.cellLight : palette.cellDark,
                  cursor: phase === "play" ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
              >
                {isDenied && (
                  <div style={{
                    position: "absolute", inset: 0, background: palette.deniedBg,
                    animation: "phDeniedShake 0.35s ease-in-out", pointerEvents: "none",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* piece layer — absolutely positioned, transform-animated on top of the grid */}
        {phase !== "start" && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {enemies.map(en => {
              const isTelegraph = pendingAction && pendingAction.id === en.id;
              const isLethal = isTelegraph && pendingAction.to.row === player.row && pendingAction.to.col === player.col;
              return (
                <div key={en.id} style={{
                  position: "absolute", top: 0, left: 0,
                  width: `${cellPct}%`, height: `${cellPct}%`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transform: `translate(${en.col * 100}%, ${en.row * 100}%)`,
                  transition: `transform ${SLIDE_MS}ms cubic-bezier(0.34,1.15,0.64,1)`,
                  zIndex: isTelegraph ? 3 : 2,
                }}>
                  <div style={{
                    width: "72%", height: "72%", borderRadius: "50%",
                    background: palette.enemyBg,
                    border: `2px solid ${TYPE_COLOR[en.type]}`,
                    boxShadow: isTelegraph
                      ? `0 0 0 4px ${isLethal ? "rgba(255,69,41,0.45)" : "rgba(255,163,26,0.35)"}, 0 2px 6px rgba(0,0,0,0.18)`
                      : "0 2px 6px rgba(0,0,0,0.18), inset 0 -2px 3px rgba(0,0,0,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    animation: isTelegraph ? "phTelegraph 0.32s ease-in-out infinite" : "phSpawnPop 0.36s cubic-bezier(0.34,1.56,0.64,1)",
                    transition: "box-shadow 0.15s",
                  }}>
                    <PieceGlyph type={en.type} color={TYPE_COLOR[en.type]} size="60%" />
                  </div>
                </div>
              );
            })}

            {/* player piece */}
            <div style={{
              position: "absolute", top: 0, left: 0,
              width: `${cellPct}%`, height: `${cellPct}%`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: `translate(${player.col * 100}%, ${player.row * 100}%)`,
              transition: `transform ${SLIDE_MS}ms cubic-bezier(0.34,1.15,0.64,1)`,
              zIndex: 4,
            }}>
              <div style={{
                width: "78%", height: "78%", borderRadius: "50%",
                background: palette.playerBg,
                boxShadow: `0 2px 10px ${palette.playerGlow}, inset 0 -2px 4px rgba(0,0,0,0.12)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "phPlayerBreathe 1.6s ease-in-out infinite",
              }}>
                <PieceGlyph type={PLAYER_TYPE} color="#fff" size="64%" />
              </div>
            </div>

            {/* capture flash */}
            {flash && (
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: `${cellPct}%`, height: `${cellPct}%`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transform: `translate(${flash.col * 100}%, ${flash.row * 100}%)`,
                zIndex: 6,
              }}>
                <div style={{
                  position: "absolute", inset: "12%", borderRadius: "50%",
                  border: "2px solid rgba(23,211,155,0.6)",
                  animation: "phCaptureRing 0.5s ease-out forwards",
                }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: "#17D39B", animation: "phFlashUp 0.7s ease-out forwards" }}>+2s</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* trapped/caught warning */}
      {trappedWarning && (
        <div style={{
          marginTop: 14, padding: "10px 24px", borderRadius: 10,
          background: "rgba(240,90,90,0.12)", color: palette.timerLow,
          fontSize: 15, fontWeight: 700, textAlign: "center",
        }}>
          Trapped! No moves left...
        </div>
      )}

      {/* enemy-type legend — explains how each PIECE moves, not what YOU should do */}
      {phase === "play" && !trappedWarning && (
        <div style={{
          marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap",
          justifyContent: "center", maxWidth: N * 56,
        }}>
          {TYPES.map(t => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: palette.enemyBg, border: `2px solid ${TYPE_COLOR[t]}`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <PieceGlyph type={t} color={TYPE_COLOR[t]} size="60%" />
              </div>
              <span style={{ fontSize: 10, color: palette.textMuted }}>{TYPE_LABEL[t]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── START SCREEN ── */}
      {phase === "start" && (
        <StartScreen
          /* fixed dark scrim behind this screen (unrelated to base theme), so its
             text needs the light pair rather than the page's light-theme dark ink */
          theme={{ ...palette, text: "#F5F3F0", textMuted: "#9A98A6" }}
          background="rgba(21,20,27,0.96)"
          title={<>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#F5F3F0", marginBottom: 4, fontFamily: fontDisplay }}>PLOOP</div>
            <div style={{ fontSize: 24, fontWeight: 300, color: "#9A98A6", letterSpacing: 4, fontFamily: fontDisplay }}>HUNT</div>
          </>}
          preview={
            <div style={{
              background: palette.panelBg, borderRadius: 14, padding: "16px 24px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", gap: 8, minWidth: 220,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 6, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", background: palette.playerBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}><PieceGlyph type={PLAYER_TYPE} color="#fff" size="64%" /></div>
                <span style={{ fontSize: 13, color: palette.text, fontWeight: 700 }}>you — moves any direction</span>
              </div>
              {TYPES.map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", background: palette.enemyBg,
                    border: `2px solid ${TYPE_COLOR[t]}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}><PieceGlyph type={t} color={TYPE_COLOR[t]} size="60%" /></div>
                  <span style={{ fontSize: 13, color: palette.text }}>{TYPE_LABEL[t]}</span>
                </div>
              ))}
            </div>
          }
          description="Capture enemy pieces before the timer runs out. Every move you make, the nearest enemy hunts back — let one land on you and it's over. No move hints: read the board yourself."
          best={best}
        />
      )}

      {/* ── GAME OVER ── */}
      {phase === "dead" && (
        <GameOverCard
          theme={palette}
          title={deathTitle}
          score={score}
          best={best}
          accentColor={palette.accent}
        />
      )}

      {/* game-specific keyframes (start/retry pulse comes from the shared components) */}
      <style>{`
        @keyframes phFlashUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-22px); }
        }
        @keyframes phCaptureRing {
          0% { opacity: 1; transform: scale(0.6); }
          100% { opacity: 0; transform: scale(1.6); }
        }
        @keyframes phSpawnPop {
          0% { opacity: 0; transform: scale(0); }
          70% { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes phTelegraph {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.14); }
        }
        @keyframes phPlayerBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes phDeniedShake {
          0%, 100% { transform: translateX(0); opacity: 1; }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
