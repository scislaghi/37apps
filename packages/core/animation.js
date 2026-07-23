import { useSpring } from '@react-spring/web';

/**
 * Physics-based "pop" feedback for a value that jumps up (score, combo, etc.).
 * Returns a react-spring style object to spread onto an animated.span/div —
 * replaces the fixed-duration CSS pulse with a spring that overshoots and
 * settles, so it reads as a reaction to the game rather than a timer.
 * @param {number} value
 */
export function useScorePop(value) {
  const style = useSpring({
    from: { scale: 1.4 },
    to: { scale: 1 },
    reset: true,
    config: { mass: 1, tension: 400, friction: 12 },
    key: value,
  });
  return style;
}

/**
 * Entrance "punch" for panels that appear suddenly (game-over card, modals):
 * scales/settles in with a spring instead of a linear fade.
 * @param {boolean} active
 */
export function usePanelEntrance(active) {
  return useSpring({
    opacity: active ? 1 : 0,
    scale: active ? 1 : 0.85,
    config: { mass: 1, tension: 380, friction: 22 },
  });
}
