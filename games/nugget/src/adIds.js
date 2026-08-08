/**
 * AdMob ad unit IDs for Nugget (bundle com.simonecislaghi.nugget).
 *
 * Nugget isn't registered inside the shared 37apps AdMob account yet, so the
 * per-platform maps are intentionally empty: `@37apps/core/ads.js` falls back
 * to Google's public *test* unit IDs whenever a slot is missing, which is the
 * safe thing to ship pre-registration (test creatives, no policy strikes).
 * Fill these in — and the App ID in strings.xml / Info.plist — the day the
 * game is registered; no other code changes needed.
 */
export const AD_IDS = {
  android: {},
  ios: {},
};
