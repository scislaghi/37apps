import { useState } from 'react';
import { animated } from '@react-spring/web';
import { baseTheme, fontDisplay, fontUI, SUCCESS } from '../theme.js';
import { usePanelEntrance } from '../animation.js';
import { isNativeAdPlatform, BANNER_SAFE_BOTTOM } from '../ads.js';

/**
 * Game Over screen — brand kit v2 §06: opaque light page, no nested card
 * floating over dimmed gameplay. `title` is each game's own death reason
 * ("Wrong shape!", "Trapped!", ...) shown as the small caps label instead of
 * a generic "GAME OVER", since it's more useful feedback and every game
 * already writes one.
 *
 * `onWatchAdContinue`, if passed, renders a secondary "CONTINUE" button below
 * RETRY. Callers should only pass it when a rewarded ad is actually ready
 * (`isRewardedReady()`) and the run hasn't already used its one continue —
 * a button that fails or does nothing when tapped is worse than not having
 * it. The prop is an async function resolving to whether the reward was
 * granted; while it's pending the button shows a loading state instead of
 * being tappable again, since the rewarded ad flow can take a few seconds.
 */
export default function GameOverCard({ accent, title, score, best, onRetry, onWatchAdContinue }) {
  const entrance = usePanelEntrance(true);
  const isNewBest = score > 0 && score >= best;
  const [continuing, setContinuing] = useState(false);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    const rewarded = await onWatchAdContinue();
    if (!rewarded) setContinuing(false);
    /* on success the parent swaps phase away from "dead", unmounting this
       card — no need to reset `continuing` in that case. */
  };

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      paddingBottom: isNativeAdPlatform() ? BANNER_SAFE_BOTTOM : 24,
      background: baseTheme.bg, zIndex: 10,
    }}>
      <animated.div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        opacity: entrance.opacity,
        transform: entrance.scale.to(s => `scale(${s})`),
      }}>
        <div style={{
          fontSize: 12, color: baseTheme.textMuted, fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, color: baseTheme.text, fontFamily: fontDisplay, lineHeight: 1 }}>
          {score}
        </div>

        {isNewBest ? (
          <div style={{
            marginTop: 12, padding: "5px 14px", borderRadius: 99,
            background: SUCCESS, color: baseTheme.text, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
          }}>
            NEW BEST
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 13, color: baseTheme.textMuted }}>
            Best · {best}
          </div>
        )}

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRetry}
          style={{
            width: 220, border: "none", borderRadius: 16, padding: "16px 0", marginTop: 32,
            background: accent, color: baseTheme.text, fontFamily: fontDisplay, fontWeight: 800,
            fontSize: 15, letterSpacing: "0.03em", cursor: "pointer",
          }}
        >
          RETRY
        </button>

        {onWatchAdContinue && (
          <button
            type="button"
            disabled={continuing}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleContinue}
            style={{
              width: 220, border: `1px solid ${baseTheme.border}`, borderRadius: 16, padding: "11px 0", marginTop: 10,
              background: "transparent", color: baseTheme.textMuted, fontFamily: fontUI, fontWeight: 700,
              fontSize: 13, cursor: continuing ? "default" : "pointer", opacity: continuing ? 0.6 : 1,
            }}
          >
            {continuing ? "Loading ad…" : "▶ Continue · watch ad"}
          </button>
        )}
      </animated.div>
    </div>
  );
}
