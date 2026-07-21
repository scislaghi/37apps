import { fontDisplay } from '../theme.js';

export default function StartScreen({ title, description, preview, best, theme, background }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: background || theme.bg, zIndex: 10,
    }}>
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
