import { Preferences } from '@capacitor/preferences';

const BEST_SCORE_KEY = 'stackr.bestScore';

export async function loadBestScore() {
  const { value } = await Preferences.get({ key: BEST_SCORE_KEY });
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function saveBestScore(score) {
  await Preferences.set({ key: BEST_SCORE_KEY, value: String(score) });
}
