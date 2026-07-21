import { AdMob, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

/**
 * Google's public test ad unit IDs — safe to ship during development, show
 * placeholder test creatives, and never generate real revenue or account
 * strikes. Swap these for the real per-game IDs once Stackr is registered
 * as its own app inside the shared 37apps AdMob account (see plan.md,
 * section 3).
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

function adIds() {
  const platform = Capacitor.getPlatform();
  return TEST_IDS[platform] || TEST_IDS.android;
}

let interstitialReady = false;

export async function initAds() {
  if (!Capacitor.isNativePlatform()) return;

  await AdMob.initialize();

  AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
    interstitialReady = true;
  });

  await showBanner();
  await prepareInterstitial();
}

export async function showBanner() {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.showBanner({
    adId: adIds().banner,
    adSize: BannerAdSize.BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
  });
}

export async function prepareInterstitial() {
  if (!Capacitor.isNativePlatform()) return;
  interstitialReady = false;
  await AdMob.prepareInterstitial({ adId: adIds().interstitial });
}

export async function showInterstitial() {
  if (!Capacitor.isNativePlatform() || !interstitialReady) return;
  await AdMob.showInterstitial();
  await prepareInterstitial();
}
