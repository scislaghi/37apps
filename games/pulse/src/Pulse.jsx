import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "./ads.js";
import { loadBestScore, saveBestScore } from "./save.js";

/* ── 37apps brand kit: dark neutral base + Amber Pulse accent ── */
const palette = {
  bg: "#15141B",
  track: "#2A2933",
  trackBorder: "#3A3944",
  zone: "rgba(255,184,77,0.28)",
  zoneBorder: "#FFB84D",
  perfect: "#37D6A0",
  marker: "#FFB84D",
  markerGlow: "rgba(255,184,77,0.55)",
  text: "#F5F3F0",
  textMuted: "#9A98A6",
  panelBg: "#2A2933",
  danger: "#FF6B57",
};

const fontUI = "'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif";
const fontDisplay = "ui-rounded, 'SF Pro Rounded', 'Segoe UI Rounded', 'Avenir Next', system-ui, sans-serif";

const BAR_WIDTH = 280;
const MARKER_SIZE = 20;
const AMPLITUDE = BAR_WIDTH / 2 - MARKER_SIZE / 2;

const BASE_ANGULAR_SPEED = 2.0;
const ANGULAR_SPEED_PER_SCORE = 0.15;
const MAX_ANGULAR_SPEED = 6.0;

const START_ZONE_WIDTH = 100;
const SHRINK_PER_SCORE = 5;
const MIN_ZONE_WIDTH = 26;
const PERFECT_FRACTION = 0.35;

const FREEZE_MS = 260;

function zoneWidthForScore(score) {
  return Math.max(MIN_ZONE_WIDTH, START_ZONE_WIDTH - score * SHRINK_PER_SCORE);
}

function angularSpeedForScore(score) {
  return Math.min(MAX_ANGULAR_SPEED, BASE_ANGULAR_SPEED + score * ANGULAR_SPEED_PER_SCORE);
}

function randomZoneCenter(zoneWidth) {
  const range = Math.max(0, AMPLITUDE - zoneWidth / 2 - 10);
  return (Math.random() * 2 - 1) * range;
}

export default function Pulse() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [zone, setZone] = useState({ center: 0, width: START_ZONE_WIDTH });
  const [flash, setFlash] = useState(null);
  const [, setFrameTick] = useState(0);

  const phaseAngleRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const zoneRef = useRef({ center: 0, width: START_ZONE_WIDTH });
  const frozenUntilRef = useRef(0);
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

  /* ── main loop: advances oscillator phase, pauses briefly on scoring ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (now >= frozenUntilRef.current) {
        const angularSpeed = angularSpeedForScore(scoreRef.current);
        phaseAngleRef.current += angularSpeed * dt;
      }

      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const startGame = useCallback(() => {
    if (playCountRef.current > 0) showInterstitial();
    playCountRef.current += 1;

    scoreRef.current = 0;
    streakRef.current = 0;
    phaseAngleRef.current = 0;
    frozenUntilRef.current = 0;
    const width = zoneWidthForScore(0);
    const center = randomZoneCenter(width);
    zoneRef.current = { center, width };
    setZone({ center, width });
    setScore(0);
    setStreak(0);
    setFlash(null);
    setPhase("play");
  }, []);

  const handleTap = useCallback(() => {
    if (phase !== "play") {
      startGame();
      return;
    }
    const now = performance.now();
    if (now < frozenUntilRef.current) return;

    const markerOffset = AMPLITUDE * Math.sin(phaseAngleRef.current);
    const { center, width } = zoneRef.current;
    const distance = Math.abs(markerOffset - center);
    const perfectWidth = width * PERFECT_FRACTION;

    if (distance > width / 2) {
      endGame();
      return;
    }

    const isPerfect = distance <= perfectWidth / 2;
    if (isPerfect) {
      streakRef.current += 1;
      const bonus = Math.floor(streakRef.current / 2);
      scoreRef.current += 1 + bonus;
      setFlash("perfect");
    } else {
      streakRef.current = 0;
      scoreRef.current += 1;
      setFlash("hit");
    }
    setScore(scoreRef.current);
    setStreak(streakRef.current);

    clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(null), FREEZE_MS + 40);

    const nextWidth = zoneWidthForScore(scoreRef.current);
    const nextCenter = randomZoneCenter(nextWidth);
    zoneRef.current = { center: nextCenter, width: nextWidth };
    setZone({ center: nextCenter, width: nextWidth });
    frozenUntilRef.current = now + FREEZE_MS;
  }, [phase, startGame, endGame]);

  const markerOffset = AMPLITUDE * Math.sin(phaseAngleRef.current);
  const perfectWidth = zone.width * PERFECT_FRACTION;

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

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {phase === "play" && (
          <div style={{ position: "relative", width: BAR_WIDTH, height: MARKER_SIZE * 2 }}>
            {/* track */}
            <div style={{
              position: "absolute", top: "50%", left: 0, right: 0, height: 14,
              transform: "translateY(-50%)", background: palette.track,
              border: `1px solid ${palette.trackBorder}`, borderRadius: 7,
            }} />

            {/* target zone */}
            <div style={{
              position: "absolute", top: "50%", height: 26,
              left: BAR_WIDTH / 2 + zone.center - zone.width / 2,
              width: zone.width,
              transform: "translateY(-50%)",
              background: palette.zone,
              border: `2px solid ${palette.zoneBorder}`,
              borderRadius: 8,
            }}>
              {/* perfect sub-zone */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                width: perfectWidth, height: 14,
                transform: "translate(-50%, -50%)",
                background: palette.perfect, borderRadius: 5, opacity: 0.85,
              }} />
            </div>

            {/* marker */}
            <div style={{
              position: "absolute", top: "50%",
              left: BAR_WIDTH / 2 + markerOffset,
              width: MARKER_SIZE, height: MARKER_SIZE,
              transform: "translate(-50%, -50%)",
              background: palette.marker, borderRadius: "50%",
              boxShadow: `0 0 16px ${palette.markerGlow}`,
            }} />
          </div>
        )}

        {flash && (
          <div style={{
            position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%)",
            fontSize: flash === "perfect" ? 22 : 18, fontWeight: 800, fontFamily: fontDisplay,
            color: flash === "perfect" ? palette.perfect : palette.text,
            animation: "flashUp 0.5s ease-out forwards", pointerEvents: "none",
          }}>
            {flash === "perfect" ? "PERFECT!" : "HIT"}
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
              PULSE
            </div>

            <div style={{ position: "relative", width: 220, height: 30, marginBottom: 26 }}>
              <div style={{
                position: "absolute", top: "50%", left: 0, right: 0, height: 12,
                transform: "translateY(-50%)", background: palette.track,
                border: `1px solid ${palette.trackBorder}`, borderRadius: 6,
              }} />
              <div style={{
                position: "absolute", top: "50%", left: "38%", width: 60, height: 22,
                transform: "translateY(-50%)", background: palette.zone,
                border: `2px solid ${palette.zoneBorder}`, borderRadius: 7,
              }} />
              <div style={{
                position: "absolute", top: "50%", left: "38%", width: 22, height: 22,
                transform: "translateY(-50%)", background: palette.marker, borderRadius: "50%",
                boxShadow: `0 0 14px ${palette.markerGlow}`,
              }} />
            </div>

            <div style={{ fontSize: 13, color: palette.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 24 }}>
              Tap when the marker is inside the zone. Land dead center for a
              PERFECT — chain perfects for a streak bonus. Miss the zone and
              it's over.
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
                Missed it!
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 18 }}>SCORE</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: palette.text, marginBottom: 6, fontFamily: fontDisplay }}>
                {score}
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 4 }}>
                BEST: {best}
              </div>
              {score > 0 && score >= best && (
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.perfect, marginBottom: 8 }}>
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
      `}</style>
    </div>
  );
}
