import { AdMob, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

/**
 * Google's public test ad unit IDs — safe to ship during development, show
 * placeholder test creatives, and never generate real revenue or account
 * strikes. Pass real per-game { bannerId, interstitialId } once a game is
 * registered as its own app inside the shared 37apps AdMob account (see
 * plan.md, section 3) — no other code changes needed.
 */
const TEST_IDS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
};

function resolveIds(overrides) {
  const platform = Capacitor.getPlatform();
  const defaults = TEST_IDS[platform] || TEST_IDS.android;
  return {
    banner: overrides?.bannerId || defaults.banner,
    interstitial: overrides?.interstitialId || defaults.interstitial,
  };
}

let interstitialReady = false;

export async function initAds(ids) {
  if (!Capacitor.isNativePlatform()) return;

  await AdMob.initialize();

  AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
    interstitialReady = true;
  });

  await showBanner(ids);
  await prepareInterstitial(ids);
}

export async function showBanner(ids) {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.showBanner({
    adId: resolveIds(ids).banner,
    adSize: BannerAdSize.BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
  });
}

export async function prepareInterstitial(ids) {
  if (!Capacitor.isNativePlatform()) return;
  interstitialReady = false;
  await AdMob.prepareInterstitial({ adId: resolveIds(ids).interstitial });
}

export async function showInterstitial(ids) {
  if (!Capacitor.isNativePlatform() || !interstitialReady) return;
  await AdMob.showInterstitial();
  await prepareInterstitial(ids);
}
