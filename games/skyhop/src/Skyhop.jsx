import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, showInterstitial, showRewarded, isRewardedReady, isNativeAdPlatform } from "@37apps/core/ads.js";
import { AD_IDS } from "./adIds.js";
import { initAudio, sfx } from "@37apps/core/audio.js";
import { initHaptics } from "@37apps/core/haptics.js";
import { createBestScoreStore } from "@37apps/core/save.js";
import { baseTheme, fontUI, fontDisplay } from "@37apps/core/theme.js";
import ScoreHeader from "@37apps/core/components/ScoreHeader.jsx";
import StartScreen from "@37apps/core/components/StartScreen.jsx";
import GameOverCard from "@37apps/core/components/GameOverCard.jsx";
import SettingsScreen from "@37apps/core/components/SettingsScreen.jsx";

const { loadBestScore, saveBestScore, resetBestScore } = createBestScoreStore("skyhop.bestScore");

/* ── 37apps brand kit: light neutral base + Signal Coral accent ── */
const palette = {
  ...baseTheme,
  player: "#FF4529",
  playerGlow: "rgba(255,69,41,0.5)",
  pipe: "#726F7C",
  pipeEdge: "rgba(255,69,41,0.55)",
};

const PLAYER_X = 90;
const PLAYER_RADIUS = 18;
const GRAVITY = 1600;
const FLAP_VELOCITY = -430;
const MAX_FALL_SPEED = 700;

const PIPE_WIDTH = 70;
const SPAWN_GAP_X = 260;
const BASE_SCROLL_SPEED = 200;
const SCROLL_SPEED_PER_SCORE = 4;
const MAX_SCROLL_BONUS = 160;

const START_GAP_HEIGHT = 190;
const GAP_SHRINK_PER_SCORE = 4;
const MIN_GAP_HEIGHT = 120;
const MAX_TILT_DEG = 8;

function gapHeightForScore(score) {
  return Math.max(MIN_GAP_HEIGHT, START_GAP_HEIGHT - score * GAP_SHRINK_PER_SCORE);
}

function scrollSpeedForScore(score) {
  return BASE_SCROLL_SPEED + Math.min(score * SCROLL_SPEED_PER_SCORE, MAX_SCROLL_BONUS);
}

let idCounter = 1;
function makePipe(x, trackHeight, gapHeight) {
  const margin = gapHeight / 2 + 40;
  const gapCenter = margin + Math.random() * Math.max(0, trackHeight - margin * 2);
  const tilt = (Math.random() * 2 - 1) * MAX_TILT_DEG;
  return { id: idCounter++, x, gapCenter, gapHeight, tilt, passed: false };
}

export default function Skyhop() {
  const [phase, setPhase] = useState("start");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [, setFrameTick] = useState(0);

  const trackRef = useRef(null);
  const pipesRef = useRef([]);
  const playerYRef = useRef(0);
  const velocityRef = useRef(0);
  const scoreRef = useRef(0);
  const spawnCursorRef = useRef(0);
  const bestLoadedRef = useRef(false);
  const rafRef = useRef(null);
  const continueUsedRef = useRef(false);

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

  /* ── interstitial fires on give-up (RETRY / tap-to-restart), not on death
     itself — that way a player offered a rewarded continue only ever sees
     one ad, not a forced interstitial immediately followed by a rewarded-ad
     prompt. ── */
  const endGame = useCallback(() => {
    setPhase(p => (p === "play" ? "dead" : p));
    setBest(b => (scoreRef.current > b ? scoreRef.current : b));
  }, []);

  const handleWatchAdContinue = useCallback(async () => {
    const reward = await showRewarded(AD_IDS);
    if (!reward) return false;
    continueUsedRef.current = true;
    velocityRef.current = 0;
    const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
    playerYRef.current = trackHeight / 2;
    /* clear pipes near the player so reviving doesn't drop them straight
       back into the pipe that just killed them */
    pipesRef.current = pipesRef.current.filter(p => p.x < PLAYER_X - 160 || p.x > PLAYER_X + 320);
    setPhase("play");
    return true;
  }, []);

  /* ── main loop ── */
  useEffect(() => {
    if (phase !== "play") return;

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
      const speed = scrollSpeedForScore(scoreRef.current);

      velocityRef.current = Math.min(MAX_FALL_SPEED, velocityRef.current + GRAVITY * dt);
      playerYRef.current += velocityRef.current * dt;

      if (playerYRef.current < PLAYER_RADIUS) {
        playerYRef.current = PLAYER_RADIUS;
        velocityRef.current = 0;
      }
      if (playerYRef.current > trackHeight - PLAYER_RADIUS) {
        sfx.hit();
        endGame();
        return;
      }

      let gameOver = false;
      const pipes = pipesRef.current
        .map(p => ({ ...p, x: p.x - speed * dt }))
        .filter(p => p.x + PIPE_WIDTH > -20);

      for (const p of pipes) {
        const overlapsX = PLAYER_X + PLAYER_RADIUS > p.x && PLAYER_X - PLAYER_RADIUS < p.x + PIPE_WIDTH;
        if (overlapsX) {
          const gapTop = p.gapCenter - p.gapHeight / 2;
          const gapBottom = p.gapCenter + p.gapHeight / 2;
          if (playerYRef.current - PLAYER_RADIUS < gapTop || playerYRef.current + PLAYER_RADIUS > gapBottom) {
            gameOver = true;
            break;
          }
        } else if (!p.passed && p.x + PIPE_WIDTH < PLAYER_X) {
          p.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          sfx.score();
        }
      }

      if (gameOver) {
        pipesRef.current = pipes;
        sfx.hit();
        endGame();
        return;
      }

      spawnCursorRef.current += speed * dt;
      if (spawnCursorRef.current >= SPAWN_GAP_X) {
        pipes.push(makePipe(trackRef.current ? trackRef.current.clientWidth : 360, trackHeight, gapHeightForScore(scoreRef.current)));
        spawnCursorRef.current -= SPAWN_GAP_X;
      }

      pipesRef.current = pipes;
      setFrameTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, endGame]);

  const startGame = useCallback(() => {
    const trackHeight = trackRef.current ? trackRef.current.clientHeight : 640;
    pipesRef.current = [];
    playerYRef.current = trackHeight / 2;
    velocityRef.current = 0;
    scoreRef.current = 0;
    spawnCursorRef.current = SPAWN_GAP_X - 200;
    continueUsedRef.current = false;
    setScore(0);
    setPhase("play");
  }, []);

  const handleRetry = useCallback(() => {
    showInterstitial(AD_IDS);
    startGame();
  }, [startGame]);

  const handleTap = useCallback(() => {
    if (phase === "start") {
      startGame();
      return;
    }
    if (phase === "dead") {
      handleRetry();
      return;
    }
    if (phase !== "play") return;
    velocityRef.current = FLAP_VELOCITY;
    sfx.tap();
  }, [phase, startGame, handleRetry]);

  const pipes = pipesRef.current;
  const playerY = playerYRef.current;
  const tiltDeg = Math.max(-25, Math.min(80, velocityRef.current / 12));

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
      {phase === "play" && <ScoreHeader score={score} best={best} theme={palette} />}

      <div ref={trackRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {phase === "play" && (
          <>
            {pipes.map(p => {
              const gapTop = p.gapCenter - p.gapHeight / 2;
              const gapBottom = p.gapCenter + p.gapHeight / 2;
              return (
                <div key={p.id}>
                  <div style={{
                    position: "absolute", left: p.x, width: PIPE_WIDTH, top: 0, height: gapTop,
                    background: palette.pipe, borderBottom: `3px solid ${palette.pipeEdge}`,
                    transform: `rotate(${p.tilt}deg)`, transformOrigin: "bottom center",
                  }} />
                  <div style={{
                    position: "absolute", left: p.x, width: PIPE_WIDTH, top: gapBottom, bottom: 0,
                    background: palette.pipe, borderTop: `3px solid ${palette.pipeEdge}`,
                    transform: `rotate(${p.tilt}deg)`, transformOrigin: "top center",
                  }} />
                </div>
              );
            })}

            {/* player */}
            <div style={{
              position: "absolute", left: PLAYER_X, top: playerY,
              width: PLAYER_RADIUS * 2, height: PLAYER_RADIUS * 2,
              transform: `translate(-50%, -50%) rotate(${tiltDeg}deg)`,
              background: palette.player, borderRadius: "50%",
              boxShadow: `0 0 18px ${palette.playerGlow}`,
              zIndex: 3,
            }} />
          </>
        )}

        {/* ── START ── */}
        {phase === "start" && (
          <StartScreen
            accent={palette.player}
            title="SKYHOP"
            preview={
              <div style={{
                width: PLAYER_RADIUS * 2, height: PLAYER_RADIUS * 2, borderRadius: "50%",
                background: palette.player, boxShadow: `0 0 18px ${palette.playerGlow}`,
              }} />
            }
            description="Tap to flap and dodge the gaps. Gaps get tighter — and tilt — as your score climbs."
            best={best}
            onPlay={startGame}
            onSettings={() => setPhase("settings")}
          />
        )}

        {/* ── GAME OVER ── */}
        {phase === "dead" && (
          <GameOverCard
            accent={palette.player}
            title="Crashed!"
            score={score}
            best={best}
            onRetry={handleRetry}
            onWatchAdContinue={
              !continueUsedRef.current && isNativeAdPlatform() && isRewardedReady()
                ? handleWatchAdContinue
                : undefined
            }
          />
        )}

        {/* ── SETTINGS ── */}
        {phase === "settings" && (
          <SettingsScreen
            accent={palette.player}
            onBack={() => setPhase("start")}
            onResetProgress={() => { resetBestScore(); setBest(0); }}
          />
        )}
      </div>
    </div>
  );
}
