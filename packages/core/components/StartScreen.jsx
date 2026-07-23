import { useState, useEffect, useCallback } from 'react';
import { fontDisplay } from '../theme.js';
import { isMuted, toggleMuted } from '../audio.js';

export default function StartScreen({ title, description, preview, best, theme, background }) {
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
      background: background || theme.bg, zIndex: 10,
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
          color: theme.textMuted, cursor: "pointer", zIndex: 11,
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      <div style={{ fontSize: 46, fontWeight: 900, color: theme.text, marginBottom: 30, fontFamily: fontDisplay, letterSpacing: -1 }}>
        {title}
      </div>

      {preview && <div style={{ marginBottom: 26 }}>{preview}</div>}

      <div style={{ fontSize: 13, color: theme.textMuted, textAlign: "center", maxWidth: 260, lineHeight: 1.5, marginBottom: 24 }}>
        {description}
      </div>

      <div style={{
        fontSize: 18, fontWeight: 700, color: theme.text, fontFamily: fontDisplay,
        animation: "pulse 1.6s ease-in-out infinite",
      }}>
        TAP TO START
      </div>

      {best > 0 && (
        <div style={{ marginTop: 14, fontSize: 13, color: theme.textMuted }}>
          Best: {best}
        </div>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
