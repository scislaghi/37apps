import { Preferences } from '@capacitor/preferences';

/**
 * One local best-score store per game, keyed by a unique storage key.
 * @param {string} key
 */
export function createBestScoreStore(key) {
  return {
    async loadBestScore() {
      const { value } = await Preferences.get({ key });
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    },
    async saveBestScore(score) {
      await Preferences.set({ key, value: String(score) });
    },
    async resetBestScore() {
      await Preferences.remove({ key });
    },
  };
}
