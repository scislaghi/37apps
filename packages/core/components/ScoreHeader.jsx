import { fontDisplay } from '../theme.js';

/** Used by games with a simple score/best/streak header (not Ploop Hunt, which has its own timer bar). */
export default function ScoreHeader({ score, best, streak = 0, streakColor = "#FFA31A", theme }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "calc(16px + env(safe-area-inset-top)) 20px 8px", position: "relative", zIndex: 2,
    }}>
      <span style={{ fontSize: 15, color: theme.textMuted, fontWeight: 600 }}>
        SCORE <span style={{ fontSize: 24, color: theme.text, fontWeight: 800, fontFamily: fontDisplay }}>{score}</span>
      </span>
      {streak >= 2 && (
        <span style={{ fontSize: 13, color: streakColor, fontWeight: 800, fontFamily: fontDisplay }}>
          STREAK ×{streak}
        </span>
      )}
      <span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
        BEST <span style={{ fontSize: 18, color: theme.text, fontWeight: 800, fontFamily: fontDisplay }}>{best}</span>
      </span>
    </div>
  );
}
