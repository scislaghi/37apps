import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initHaptics } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("pulse.bestScore");

/* ── 37apps brand kit: light neutral base + Amber Pulse accent ── */
const palette = {
  ...baseTheme,
  track: "#EFEAE1",
  trackBorder: "#D6D0C2",
  zone: "rgba(255,163,26,0.24)",
  zoneBorder: "#FFA31A",
  perfect: "#17D39B",
  marker: "#FFA31A",
  markerGlow: "rgba(255,163,26,0.55)",
  danger: "#FF4529",
};

/* Pulse's fixed brand accent (Jade Flash) — drives PLAY/RETRY buttons and the
   Settings toggles; same hex already used for the "perfect" zone highlight. */
const ACCENT = palette.perfect;

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
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  useEffect(() => {
    initAds(AD_IDS);
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

  const endGame = useCallback(() => {
    setPhase(p => {
      if (p !== "play") return p;
      showInterstitial(AD_IDS);
      return "dead";
    });
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
    /* menu/game-over background tap = play again; settings has its own buttons
       (which stopPropagation) and must never fall through to this */
    if (phase === "start" || phase === "dead") {
      startGame();
      return;
    }
    if (phase !== "play") return;
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
        <ScoreHeader score={score} best={best} streak={streak} streakColor={palette.perfect} theme={palette} />
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
          <StartScreen
            accent={ACCENT}
            title="PULSE"
            preview={
              <div style={{ position: "relative", width: 220, height: 30 }}>
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
            }
            description="Tap when the marker is inside the zone. Land dead center for a PERFECT — chain perfects for a streak bonus. Miss the zone and it's over."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <GameOverCard accent={ACCENT} title="Missed it!" score={score} best={best} onRetry={startGame} />
        )}

        {/* ── SETTINGS ── */}
        {phase === "settings" && (
          <SettingsScreen
            accent={ACCENT}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>

      <style>{`
        @keyframes flashUp {
          0% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, -80%); }
        }
      `}</style>
    </div>
  );
}
