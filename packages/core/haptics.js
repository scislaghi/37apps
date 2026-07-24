import { Preferences } from '@capacitor/preferences';

const KEY = '37apps.hapticsEnabled';
let enabled = true;

/**
 * Loads the persisted haptics preference. Call once per game, next to
 * initAudio() — defaults to enabled when no preference has been saved yet.
 */
export async function initHaptics() {
  const { value } = await Preferences.get({ key: KEY });
  enabled = value === null ? true : value === 'true';
}

export function isHapticsEnabled() {
  return enabled;
}

/** @param {boolean} next */
export async function setHapticsEnabled(next) {
  enabled = next;
  await Preferences.set({ key: KEY, value: String(enabled) });
}

export async function toggleHaptics() {
  await setHapticsEnabled(!enabled);
  return enabled;
}

/**
 * Drop-in replacement for navigator.vibrate?.(pattern) — every game should
 * call this instead of touching navigator.vibrate directly, so the shared
 * Settings toggle actually controls every game's haptics in one place.
 * @param {number | number[]} pattern
 */
export function vibrate(pattern) {
  if (!enabled) return;
  navigator.vibrate?.(pattern);
}
