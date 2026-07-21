import { fontDisplay } from '../theme.js';

export default function GameOverCard({ title, score, best, accentColor, theme }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "rgba(21,20,27,0.72)", zIndex: 10,
    }}>
      <div style={{
        background: theme.panelBg, borderRadius: 18, padding: "32px 40px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)", textAlign: "center", minWidth: 220,
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: theme.text, marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 18 }}>SCORE</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: theme.text, marginBottom: 6, fontFamily: fontDisplay }}>
          {score}
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>
          BEST: {best}
        </div>
        {score > 0 && score >= best && (
          <div style={{ fontSize: 13, fontWeight: 700, color: accentColor, marginBottom: 8 }}>
            ★ NEW BEST ★
          </div>
        )}
        <div style={{
          marginTop: 20, fontSize: 16, fontWeight: 700, color: theme.text, fontFamily: fontDisplay,
          animation: "pulse 1.6s ease-in-out infinite",
        }}>
          TAP TO RETRY
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
