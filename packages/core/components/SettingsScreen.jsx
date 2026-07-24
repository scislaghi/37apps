import { useState, useEffect, useCallback } from 'react';
import { baseTheme, fontDisplay } from '../theme.js';
import { isMuted, toggleMuted } from '../audio.js';
import { isHapticsEnabled, toggleHaptics } from '../haptics.js';
import { isNativeAdPlatform, BANNER_SAFE_BOTTOM } from '../ads.js';

function Toggle({ on, onToggle, accent }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onToggle}
      style={{
        width: 40, height: 24, borderRadius: 99, border: "none", padding: 2,
        background: on ? accent : baseTheme.border, cursor: "pointer", flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <span style={{
        display: "block", width: 20, height: 20, borderRadius: "50%", background: "#FFFFFF",
        transform: on ? "translateX(16px)" : "translateX(0)", transition: "transform 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

/**
 * Settings screen — brand kit v2 §06. No "Music" row: no game has a music
 * system yet (the brand kit's own §07 says a music loop isn't needed for
 * v1), so a toggle for it would control nothing. "Reset progress" needs a
 * second tap to confirm since it's destructive and not shown mid-interaction
 * in the static mock.
 */
export default function SettingsScreen({ accent, onBack, onResetProgress }) {
  const [muted, setMutedState] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    setHaptics(isHapticsEnabled());
  }, []);

  const handleSound = useCallback(async () => {
    const nowMuted = await toggleMuted();
    setMutedState(nowMuted);
  }, []);

  const handleHaptics = useCallback(async () => {
    const next = await toggleHaptics();
    setHaptics(next);
  }, []);

  const handleReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onResetProgress();
    setConfirmReset(false);
  }, [confirmReset, onResetProgress]);

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: baseTheme.bg, zIndex: 10, padding: "24px 28px",
      paddingBottom: isNativeAdPlatform() ? BANNER_SAFE_BOTTOM : 24,
    }}>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onBack}
        style={{
          alignSelf: "flex-start", border: "none", background: "transparent",
          color: baseTheme.textMuted, fontSize: 14, fontWeight: 700, cursor: "pointer",
          padding: "8px 0", marginTop: "env(safe-area-inset-top)", marginBottom: 8,
        }}
      >
        ‹ Back
      </button>

      <div style={{ fontSize: 22, fontWeight: 900, color: baseTheme.text, fontFamily: fontDisplay, marginBottom: 18 }}>
        SETTINGS
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${baseTheme.border}` }}>
        <span style={{ color: baseTheme.text, fontSize: 14, fontWeight: 600 }}>Sound</span>
        <Toggle on={!muted} onToggle={handleSound} accent={accent} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${baseTheme.border}` }}>
        <span style={{ color: baseTheme.text, fontSize: 14, fontWeight: 600 }}>Haptics</span>
        <Toggle on={haptics} onToggle={handleHaptics} accent={accent} />
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleReset}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 0", border: "none", background: "transparent", textAlign: "left", cursor: "pointer",
        }}
      >
        <span style={{ color: confirmReset ? "#FF4529" : baseTheme.text, fontSize: 14, fontWeight: 600 }}>
          {confirmReset ? "Tap again to confirm" : "Reset progress"}
        </span>
      </button>
    </div>
  );
}
