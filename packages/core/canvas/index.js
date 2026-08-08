/* Shared canvas foundation used by Prometheus, Icarus and Line. Import from
   the individual modules in game code — this barrel exists so `@37apps/core`
   can re-export the whole surface in one line. */
export * from './color.js';
export * from './sky.js';
export * from './skyBackdrop.js';
export * from './particles.js';
export * from './flame.js';
export * from './useGameCanvas.js';
