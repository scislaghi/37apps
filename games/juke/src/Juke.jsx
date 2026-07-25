import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics, vibrate } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, ACCENTS } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("juke.bestScore");

/* ── 37apps brand kit: light neutral base + Cobalt Bright accent. Hex tiles cycle the full accent palette. ── */
const palette = {
  ...baseTheme,
  accent: "#3D64FF",
  accentGlow: "rgba(61,100,255,0.55)",
  trap: "#FFA31A",
  danger: "#FF4529",
};

const HEX_W = 82;
const HEX_H = 72;
const HEX_CORNER_R = 8;
const HSP = 88;
const ACT_Y_RATIO = 0.58;
const VISIBLE = 6;

/* ── rounded-corner hexagon path (flat top/bottom, pointed sides) for
   clip-path: path() — sharp clip-path polygon() corners are what made
   stacked tiles read as touching/seamed; rounding them plus the HSP gap
   above is what actually fixes it. `outline` widens the same hex by a few
   px so it can sit as a colored layer behind the fill, simulating a stroke
   that a real CSS border can't follow around an arbitrary clip-path. ── */
function roundedHexPath(w, h, r) {
  const pts = [[w * 0.25, 0], [w * 0.75, 0], [w, h * 0.5], [w * 0.75, h], [w * 0.25, h], [0, h * 0.5]];
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = curr[0] - prev[0], v1y = curr[1] - prev[1];
    const v1l = Math.hypot(v1x, v1y) || 1;
    const v2x = next[0] - curr[0], v2y = next[1] - curr[1];
    const v2l = Math.hypot(v2x, v2y) || 1;
    const cr = Math.min(r, v1l / 2, v2l / 2);
    const p1x = curr[0] - (v1x / v1l) * cr, p1y = curr[1] - (v1y / v1l) * cr;
    const p2x = curr[0] + (v2x / v2l) * cr, p2y = curr[1] + (v2y / v2l) * cr;
    d += (i === 0 ? `M ${p1x} ${p1y} ` : `L ${p1x} ${p1y} `) + `Q ${curr[0]} ${curr[1]} ${p2x} ${p2y} `;
  }
  return `${d}Z`;
}
const HEX_CLIP = `path('${roundedHexPath(HEX_W, HEX_H, HEX_CORNER_R)}')`;
const HEX_CLIP_OUTLINE = `path('${roundedHexPath(HEX_W + 6, HEX_H + 6, HEX_CORNER_R + 2)}')`;

const START_TIME = 30;
const MAX_TIME = 35;
const TIME_BONUS = 0.3;
const TIME_BONUS_COMBO = 0.5;
const COMBO_BONUS_AT = 5;
const DANGER_TIME = 8;
const WARN_TIME = 14;

const SWIPE_THRESHOLD = 30;
const TAP_THRESHOLD = 12;
const IMPACT_MS = 260;

let idCounter = 1;

function makeHex(n) {
  return {
    id: idCounter++,
    dir: Math.random() > 0.5 ? 1 : -1,
    trap: n > 4 && Math.random() < Math.min(0.12 + n * 0.004, 0.32),
    color: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
  };
}

/* ── shard burst: a handful of tinted chips flung radially from the tile on a
   correct swipe — the "juice" that sells the hit instead of just sliding away ── */
function makeShards(color) {
  const n = 6;
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
    const dist = 34 + Math.random() * 26;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      rot: (Math.random() - 0.5) * 200,
      color,
    };
  });
}

/** Respects the OS-level motion preference: idle float, shake, and shard
    bursts all gate off this instead of running unconditionally. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ── single chevron, sized to read clearly at a glance — the double-chevron
   read as clutter once tiles had room to breathe, one clean mark is more
   "minimal but not MVP" than two small ones. ── */
function Arrow({ dir, muted }) {
  const color = muted ? "rgba(255,255,255,0.55)" : "#FFFFFF";
  return (
    <div style={{
      width: 0, height: 0,
      borderTop: "13px solid transparent",
      borderBottom: "13px solid transparent",
      borderLeft: `19px solid ${color}`,
      filter: muted ? "none" : "drop-shadow(0 1px 2px rgba(0,0,0,0.22))",
      transform: dir === -1 ? "scaleX(-1)" : "none",
    }} />
  );
}

function HexTile({ hex, active, muted, reducedMotion }) {
  return (
    <div style={{ position: "relative", width: HEX_W, height: HEX_H }}>
      {hex.trap && active && (
        <div style={{
          position: "absolute", inset: -10, borderRadius: "50%",
          border: `2px dashed ${palette.trap}`, opacity: 0.75,
          animation: reducedMotion ? "none" : "trapSpin 2.6s linear infinite",
        }} />
      )}
      {/* stroke layer: a slightly larger copy of the same rounded hex sitting
          behind the fill — a real `border` can't follow an arbitrary
          clip-path shape cleanly, this fakes one that always matches it. */}
      {(hex.trap || active) && (
        <div style={{
          position: "absolute", inset: -3, clipPath: HEX_CLIP_OUTLINE,
          background: hex.trap ? palette.trap : "rgba(255,255,255,0.9)",
          filter: active ? `drop-shadow(0 0 10px ${hex.trap ? "rgba(255,163,26,0.55)" : palette.accentGlow})` : "none",
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0, clipPath: HEX_CLIP,
        background: `radial-gradient(120% 120% at 28% 18%, rgba(255,255,255,0.55), rgba(255,255,255,0) 46%), linear-gradient(160deg, color-mix(in srgb, ${hex.color} 82%, white), ${hex.color} 55%, color-mix(in srgb, ${hex.color} 80%, black))`,
        filter: "drop-shadow(0 6px 10px rgba(24,23,29,0.22))",
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
        }}>JUKE IT!</div>
      )}
    </div>
  );
}

export default function Juke() {
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
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    initAds(AD_IDS);
    initAudio();
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

  const ensureQueue = () => {
    while (queueRef.current.length < idxRef.current + 12) {
      queueRef.current.push(makeHex(queueRef.current.length));
    }
  };

  /* ── death is two beats: "impact" flashes/shakes the frame with the last tile
     still on screen, then "dead" swaps in the opaque Game Over screen — same
     rhythm as Morphy, instead of the screen just going flat the instant you're wrong. ── */
  const endGame = useCallback((reason) => {
    setDeathReason(reason);
    setPhase(p => {
      if (p !== "play") return p;
      sfx.hit();
      vibrate(reason === "wrong" ? [15, 40, 15] : [10, 30, 10]);
      showInterstitial(AD_IDS);
      return "impact";
    });
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
    setTimeout(() => setPhase(p => (p === "impact" ? "dead" : p)), IMPACT_MS);
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
    sfx.select();
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
      const onCombo = comboRef.current >= COMBO_BONUS_AT;
      const bonus = onCombo ? TIME_BONUS_COMBO : TIME_BONUS;
      timerRef.current = Math.min(MAX_TIME, timerRef.current + bonus);
      idxRef.current += 1;
      ensureQueue();

      sfx.score();
      vibrate(hex.trap ? 14 : onCombo ? 12 : 8);

      setFlyaways(f => [...f, { id: hex.id, dir, color: hex.color, trap: hex.trap, shards: makeShards(hex.color) }]);
      setScore(scoreRef.current);
      setStreak(comboRef.current);
      setTimeLeft(timerRef.current);
    } else {
      endGame("wrong");
    }
  }, [phase, endGame]);

  useEffect(() => {
    if (!flyaways.length) return;
    const t = setTimeout(() => setFlyaways([]), 340);
    return () => clearTimeout(t);
  }, [flyaways]);

  const handlePointerDown = useCallback((e) => {
    /* menu/game-over background tap = play again; settings has its own buttons
       (which stopPropagation) and must never fall through to this */
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;
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

  /* ── capped at 100: MAX_TIME (35) sits above START_TIME (30) so combo bonus
     can bank a little headroom, but the bar itself must never read as "stuck
     full" while that headroom is burning off. ── */
  const timerPct = Math.min(100, Math.max(0, timeLeft / START_TIME) * 100);
  /* urgency ramps continuously from WARN_TIME down to 0 instead of snapping
     color at a single threshold, so the clock reads as creeping toward
     danger rather than suddenly becoming dangerous. */
  const urgency = Math.min(1, Math.max(0, (WARN_TIME - timeLeft) / WARN_TIME));
  const inDanger = timeLeft < DANGER_TIME;
  const timerColor = urgency > 0
    ? `color-mix(in srgb, ${palette.danger} ${Math.round(urgency * 100)}%, ${palette.accent})`
    : palette.accent;
  const pulseSpeed = inDanger ? 0.25 + (timeLeft / DANGER_TIME) * 0.45 : 0.6;
  const activeColor = visible[0]?.hex.color || palette.accent;
  const ambientOpacity = Math.min(0.1 + streak * 0.012, 0.34);

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
      {(phase === "play" || phase === "impact") && (
        <ScoreHeader score={score} best={best} streak={streak} streakColor={palette.accent} theme={palette} />
      )}

      {(phase === "play" || phase === "impact") && (
        <div style={{ height: 6, margin: "0 20px 4px", borderRadius: 3, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${timerPct}%`, borderRadius: 3,
            background: timerColor,
            boxShadow: inDanger ? `0 0 ${10 + (1 - timeLeft / DANGER_TIME) * 10}px ${palette.danger}` : "none",
            animation: inDanger && !reducedMotion ? `dangerPulse ${pulseSpeed}s ease-in-out infinite` : "none",
          }} />
        </div>
      )}

      <div
        ref={trackRef}
        style={{
          flex: 1, position: "relative", overflow: "hidden",
          animation: phase === "impact" && !reducedMotion ? "screenShake 0.26s ease-in-out" : "none",
        }}
      >
        {/* ── ambient glow: a soft blob tinted to the live tile's color, growing
            with streak — ties the HUD to what's actually happening on screen
            instead of a static backdrop. ── */}
        {(phase === "play" || phase === "impact") && (
          <div style={{
            position: "absolute", left: "50%", top: `${ACT_Y_RATIO * 100}%`,
            width: 320, height: 320, borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: activeColor, opacity: ambientOpacity,
            filter: "blur(70px)", transition: "background 0.25s ease, opacity 0.25s ease",
            pointerEvents: "none",
          }} />
        )}

        {phase === "impact" && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none",
            background: deathReason === "wrong" ? palette.danger : palette.trap,
            animation: "impactFlash 0.26s ease-out forwards",
          }} />
        )}

        {(phase === "play" || phase === "impact") && (
          <>
            {visible.map(({ hex, i }) => (
              <div key={hex.id} style={{
                position: "absolute", left: centerX, top: actY - i * HSP,
                transform: `translate(-50%, -50%) scale(${1 - i * 0.05})`,
                opacity: Math.max(0, 1 - i * 0.14),
                zIndex: VISIBLE - i,
                transition: "top 0.22s ease, transform 0.22s ease, opacity 0.22s ease",
              }}>
                <HexTile hex={hex} active={i === 0} reducedMotion={reducedMotion} />
              </div>
            ))}

            {flyaways.map(f => (
              <div key={f.id} style={{
                position: "absolute", left: centerX, top: actY, zIndex: VISIBLE + 1, pointerEvents: "none",
                "--fly-x": `${f.dir * 240}px`, "--fly-rot": `${f.dir * 30}deg`,
                animation: "swipeOut 0.32s ease-out forwards",
              }}>
                <HexTile hex={{ dir: f.dir, trap: f.trap, color: f.color }} active={false} muted reducedMotion={reducedMotion} />
                {!reducedMotion && f.shards.map(s => (
                  <div key={s.id} style={{
                    position: "absolute", top: HEX_H / 2 - 4, left: HEX_W / 2 - 4,
                    width: 8, height: 8, borderRadius: 2, background: s.color,
                    "--sx": `${s.x}px`, "--sy": `${s.y}px`, "--sr": `${s.rot}deg`,
                    animation: "shardBurst 0.42s ease-out forwards",
                  }} />
                ))}
              </div>
            ))}
          </>
        )}

        {phase === "start" && (
          <StartScreen
            accent={palette.accent}
            title={
              <span style={{
                background: "linear-gradient(135deg, #3D64FF, #7B42FF)", WebkitBackgroundClip: "text", backgroundClip: "text",
                color: "transparent", filter: "drop-shadow(0 0 20px rgba(61,100,255,0.35))",
              }}>JUKE</span>
            }
            preview={
              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ textAlign: "center", animation: reducedMotion ? "none" : "previewFloat 2.4s ease-in-out infinite" }}>
                  <HexTile hex={{ dir: 1, trap: false, color: palette.accent }} active reducedMotion={reducedMotion} />
                  <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 22, fontWeight: 700 }}>swipe →</div>
                </div>
                <div style={{ textAlign: "center", animation: reducedMotion ? "none" : "previewFloat 2.4s ease-in-out 0.4s infinite" }}>
                  <HexTile hex={{ dir: -1, trap: true, color: palette.trap }} active reducedMotion={reducedMotion} />
                  <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 22, fontWeight: 700 }}>swipe ← (juke it!)</div>
                </div>
              </div>
            }
            description="Swipe the way the arrow points. Hexes marked ⚠ are a feint — juke the opposite way instead. Chain hits to keep the clock alive."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {phase === "dead" && (
          <GameOverCard
            accent={palette.accent}
            title={deathReason === "time" ? "Time's up!" : "Wrong way!"}
            score={score}
            best={best}
            onRetry={startGame}
          />
        )}

        {phase === "settings" && (
          <SettingsScreen
            accent={palette.accent}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>

      <style>{`
        @keyframes swipeOut {
          0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
          100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--fly-x), 0) rotate(var(--fly-rot)); }
        }
        @keyframes shardBurst {
          0% { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--sx), var(--sy)) rotate(var(--sr)) scale(0.2); }
        }
        @keyframes trapSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes dangerPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.35); }
        }
        @keyframes screenShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }
        @keyframes impactFlash {
          0% { opacity: 0.45; }
          100% { opacity: 0; }
        }
        @keyframes previewFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
