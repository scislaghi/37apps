import { Preferences } from '@capacitor/preferences';

const MUTE_KEY = '37apps.audioMuted';

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let masterGain = null;
let muted = false;

function ensureContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(ctx.destination);
  return ctx;
}

/**
 * Loads the persisted mute preference and arms a one-time listener that
 * resumes the AudioContext on the first tap (browsers suspend contexts
 * created outside a user gesture). Call once per game, e.g. next to initAds().
 */
export async function initAudio() {
  const { value } = await Preferences.get({ key: MUTE_KEY });
  muted = value === 'true';
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;

  const resume = () => {
    const c = ensureContext();
    if (c.state === 'suspended') c.resume();
    window.removeEventListener('pointerdown', resume);
  };
  window.addEventListener('pointerdown', resume, { once: true });
}

export function isMuted() {
  return muted;
}

/** @param {boolean} next */
export async function setMuted(next) {
  muted = next;
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  await Preferences.set({ key: MUTE_KEY, value: String(muted) });
}

export async function toggleMuted() {
  await setMuted(!muted);
  return muted;
}

/**
 * @param {{freq: number, duration: number, type?: OscillatorType, gain?: number, slideTo?: number | null, filterFreq?: number}} opts
 */
function playTone({ freq, duration, type = 'sine', gain = 0.25, slideTo = null, filterFreq = 5000 }) {
  if (muted) return;
  const c = ensureContext();
  const now = c.currentTime;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);

  const g = c.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, now);

  osc.connect(filter).connect(g).connect(/** @type {GainNode} */ (masterGain));
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * A short melodic run — used for multi-note stingers (score, failure) instead
 * of a single tone, which reads as more "designed" and less like a beep.
 * @param {number[]} notes
 * @param {{type?: OscillatorType, noteDuration?: number, gap?: number, gain?: number, filterFreq?: number}} [opts]
 */
function playNotes(notes, { type = 'square', noteDuration = 0.12, gap = 0.09, gain = 0.28, filterFreq = 5000 } = {}) {
  if (muted) return;
  const c = ensureContext();
  const now = c.currentTime;

  notes.forEach((freq, i) => {
    const start = now + i * gap;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    const g = c.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);

    osc.connect(filter).connect(g).connect(/** @type {GainNode} */ (masterGain));
    osc.start(start);
    osc.stop(start + noteDuration);
  });
}

/**
 * Procedural SFX presets — no external audio files, tuned by ear.
 * Shared across every game so "tap"/"score"/"hit" sound consistent
 * with the brand instead of being reinvented per game.
 */
export const sfx = {
  tap: () => playTone({ freq: 520, duration: 0.08, type: 'sine', gain: 0.2 }),
  select: () => playTone({ freq: 340, duration: 0.06, type: 'square', gain: 0.15 }),
  /** Quick blip for a state toggle/shape change — distinct timbre from tap/select. */
  shift: () => playTone({ freq: 440, duration: 0.05, type: 'triangle', gain: 0.16, filterFreq: 6000 }),
  score: () => playNotes([659.25, 987.77], { type: 'square', noteDuration: 0.1, gap: 0.08, gain: 0.22 }),
  /** Descending 3-note "failure" riff — used for crashes/wrong moves/game over. */
  hit: () => playNotes([392, 293.66, 220], { type: 'sawtooth', noteDuration: 0.16, gap: 0.11, gain: 0.26, filterFreq: 2200 }),
  /** Rising 4-note fanfare for entering a power-up / charged state — longer
      and brighter than `score` so a power-up never reads as "just a pickup". */
  power: () => playNotes([523.25, 659.25, 783.99, 1046.5], { type: 'square', noteDuration: 0.14, gap: 0.075, gain: 0.24, filterFreq: 7000 }),
};
