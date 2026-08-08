/**
 * AdMob ad unit IDs for Blip (bundle com.simonecislaghi.blip).
 *
 * Still Google's public *test* units — Blip hasn't been registered as its own
 * app inside the shared 37apps AdMob account yet. Swap these three per
 * platform for the real ones at publish time; nothing else in the game needs
 * to change (see `@37apps/core/ads.js`). The App ID lives in strings.xml /
 * Info.plist, not here.
 */
export const AD_IDS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};
