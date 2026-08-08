/* ══ Shared canvas host ══
   Owns the parts every canvas game gets wrong the same way: DPR-correct
   sizing, resize/orientation handling, a single RAF loop, and — importantly —
   sampling the engine for React state only a few times a second instead of
   re-rendering the component 60 times a second next to a canvas that's
   already drawing everything. */

import { useEffect, useRef } from 'react';

/**
 * @param {object} opts
 * @param {() => object} opts.create builds the engine once, on mount
 * @param {(g: object) => void} [opts.onReady] receives the engine
 * @param {() => boolean} opts.isRunning whether to advance the simulation
 * @param {(g: object) => object} [opts.sample] HUD snapshot, called ~15×/s
 * @param {(snapshot: object) => void} [opts.onSample]
 * @param {number} [opts.sampleMs]
 * @param {any[]} [opts.deps]
 */
export function useGameCanvas({
  create, onReady, isRunning, sample, onSample, sampleMs = 66, deps = [],
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rafRef = useRef(0);

  /* the loop reads these through refs so a changing callback never forces the
     canvas to be torn down and the engine re-created mid-run */
  const live = useRef({ isRunning, sample, onSample });
  live.current = { isRunning, sample, onSample };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });

    const g = create();
    engineRef.current = g;

    const resize = () => {
      /* capping DPR at 2.5 keeps a 3× phone from paying for ~2.2× the fill
         cost it can't visibly use on a full-screen gradient */
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.resize(w, h, dpr);
    };
    resize();
    onReady?.(g);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    let last = performance.now();
    let sampledAt = 0;
    const loop = (now) => {
      /* clamped so a backgrounded tab doesn't resume with a 4-second step
         that teleports the player through every hazard on screen */
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const { isRunning: run, sample: snap, onSample: emit } = live.current;
      if (run()) g.update(dt);
      else g.t += dt;              // idle backdrop keeps drifting behind menus
      g.render(ctx);

      if (snap && emit && now - sampledAt > sampleMs) {
        sampledAt = now;
        emit(snap(g));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { canvasRef, engineRef };
}

/** Full-bleed canvas styling shared by every game's play field. */
export const canvasStyle = {
  position: 'absolute', inset: 0, width: '100%', height: '100%',
  display: 'block', touchAction: 'none',
};
