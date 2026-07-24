import { useState, useEffect, useCallback } from 'react';
import { baseTheme, fontDisplay, fontUI } from '../theme.js';
import { isMuted, toggleMuted } from '../audio.js';
import { isNativeAdPlatform, BANNER_SAFE_BOTTOM } from '../ads.js';

/**
 * Menu screen — brand kit v2 §06 "UI kit": opaque light page (never a dark
 * scrim over gameplay), icon/title area, PLAY as a real button, Settings as
 * a secondary ghost button underneath. `onPlay` also fires when the caller's
 * own tap-anywhere handler bubbles up to this screen's root (see Morph.jsx's
 * outer onPointerDown) — the PLAY/Settings buttons stopPropagation so they
 * never double-fire that outer handler.
 */
export default function StartScreen({ accent, title, preview, description, best, onPlay, onSettings }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  const handleToggleMute = useCallback(async (e) => {
    e.stopPropagation();
    const next = await toggleMuted();
    setMutedState(next);
  }, []);

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      paddingBottom: isNativeAdPlatform() ? BANNER_SAFE_BOTTOM : 24,
      background: baseTheme.bg, zIndex: 10,
    }}>
      <button
        type="button"
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleToggleMute}
        style={{
          position: "absolute", top: "calc(12px + env(safe-area-inset-top))", right: 12, width: 44, height: 44,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none", fontSize: 20,
          color: baseTheme.textMuted, cursor: "pointer", zIndex: 11,
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      <div style={{ fontSize: 46, fontWeight: 900, color: baseTheme.text, marginBottom: 28, fontFamily: fontDisplay, letterSpacing: -1 }}>
        {title}
      </div>

      {preview && <div style={{ marginBottom: 26 }}>{preview}</div>}

      <div style={{ fontSize: 13, color: baseTheme.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 22 }}>
        {description}
      </div>

      {best > 0 && (
        <div style={{
          fontSize: 11, color: baseTheme.textMuted, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 22,
        }}>
          Best · {best}
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onPlay}
        style={{
          width: 220, border: "none", borderRadius: 16, padding: "16px 0", marginBottom: 10,
          background: accent, color: baseTheme.text, fontFamily: fontDisplay, fontWeight: 800,
          fontSize: 15, letterSpacing: "0.03em", cursor: "pointer",
          animation: "startPulse 1.8s ease-in-out infinite",
        }}
      >
        PLAY
      </button>

      {onSettings && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onSettings}
          style={{
            width: 220, border: `1px solid ${baseTheme.border}`, borderRadius: 16, padding: "11px 0",
            background: "transparent", color: baseTheme.textMuted, fontFamily: fontUI, fontWeight: 700,
            fontSize: 13, cursor: "pointer",
          }}
        >
          Settings
        </button>
      )}

      <style>{`
        @keyframes startPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
      `}</style>
    </div>
  );
}
