import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents, InterstitialAdPluginEvents, RewardAdPluginEvents, AdmobConsentStatus } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

/**
 * Google's public test ad unit IDs — safe to ship during development, show
 * placeholder test creatives, and never generate real revenue or account
 * strikes. Pass a real per-platform `AdIds` (see the shape below) once a
 * game is registered as its own app inside the shared 37apps AdMob account
 * — no other code changes needed.
 */
const TEST_IDS = {
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

/**
 * @typedef {{ banner?: string, interstitial?: string, rewarded?: string }} PlatformAdIds
 * @typedef {{ android?: PlatformAdIds, ios?: PlatformAdIds }} AdIds
 */

/** @param {AdIds} [overrides] */
function resolveIds(overrides) {
  const platform = Capacitor.getPlatform();
  const defaults = TEST_IDS[platform] || TEST_IDS.android;
  const custom = overrides?.[platform];
  return {
    banner: custom?.banner || defaults.banner,
    interstitial: custom?.interstitial || defaults.interstitial,
    rewarded: custom?.rewarded || defaults.rewarded,
  };
}

/** True on-device (iOS/Android); false in the browser, where no banner ever shows. */
export function isNativeAdPlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Reserved space for the bottom adaptive banner on native platforms. The
 * plugin doesn't hand back the real banner height synchronously before it
 * loads, so this is a fixed, generous estimate (adaptive banners run
 * roughly 50-90dp depending on device width) — used as bottom padding on
 * any screen with tappable UI near the bottom edge, so the native banner
 * never covers a button. Combine with env(safe-area-inset-bottom).
 */
export const BANNER_SAFE_BOTTOM = 64;

let interstitialReady = false;

/* ── frequency cap: interstitials are the most disruptive ad format, so we
   only actually show one every 3-5 game overs rather than every single one.
   The threshold is re-rolled after each shown ad (not fixed at 4) so the
   rhythm doesn't become learnable — a player who's noticed "every 4th death"
   starts pre-bracing/resenting the ad before it even shows, which is worse
   for perceived intrusiveness than the same average frequency landing on an
   unpredictable beat. Counter is per app-session (resets on relaunch). ── */
function rollInterstitialThreshold() {
  return 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
}
let gameOverCount = 0;
let interstitialThreshold = rollInterstitialThreshold();

/** @param {AdIds} [ids] */
export async function initAds(ids) {
  if (!Capacitor.isNativePlatform()) return;

  await AdMob.initialize();

  /* Required setup order per the plugin's own docs: request App Tracking
     Transparency (iOS 14+) and gather GDPR/UMP consent *before* requesting
     any ads. Skipping this leaves `canRequestAds` false for users in
     consent-required regions (e.g. EEA/UK) — the SDK then silently refuses
     to serve anything, which reads as "ads just don't show" with no error. */
  const trackingInfo = await AdMob.trackingAuthorizationStatus();
  if (trackingInfo.status === 'notDetermined') {
    await AdMob.requestTrackingAuthorization();
  }

  const consentInfo = await AdMob.requestConsentInfo();
  if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
    await AdMob.showConsentForm();
  }

  AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
    interstitialReady = true;
  });

  /* Diagnostic only — surfaces the real Google Mobile Ads SDK error (fill
     rate, invalid request, etc.) in the WKWebView console (Safari ▸ Develop
     ▸ [device] ▸ [app]) instead of a banner that just silently never
     appears with no visible reason. */
  AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (info) => {
    console.error('[ads] banner failed to load:', info);
  });
  AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (info) => {
    console.error('[ads] interstitial failed to load:', info);
  });

  await showBanner(ids);
  await prepareInterstitial(ids);
  await prepareRewarded(ids);
}

/** @param {AdIds} [ids] */
export async function showBanner(ids) {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.showBanner({
    adId: resolveIds(ids).banner,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
  });
}

/** @param {AdIds} [ids] */
export async function prepareInterstitial(ids) {
  if (!Capacitor.isNativePlatform()) return;
  interstitialReady = false;
  await AdMob.prepareInterstitial({ adId: resolveIds(ids).interstitial });
}

/** @param {AdIds} [ids] */
export async function showInterstitial(ids) {
  if (!Capacitor.isNativePlatform()) return;
  gameOverCount += 1;
  if (gameOverCount < interstitialThreshold) return;
  gameOverCount = 0;
  interstitialThreshold = rollInterstitialThreshold();
  if (!interstitialReady) return;
  await AdMob.showInterstitial();
  await prepareInterstitial(ids);
}

let rewardedReady = false;

AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
  rewardedReady = true;
});
AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (info) => {
  rewardedReady = false;
  console.error('[ads] rewarded ad failed to load:', info);
});

/** @param {AdIds} [ids] */
export async function prepareRewarded(ids) {
  if (!Capacitor.isNativePlatform()) return;
  rewardedReady = false;
  await AdMob.prepareRewardVideoAd({ adId: resolveIds(ids).rewarded });
}

/** True once a prepared rewarded ad is loaded and safe to offer to the player. */
export function isRewardedReady() {
  return rewardedReady;
}

/**
 * Shows the rewarded ad and resolves with the reward once the player earns
 * it, or `null` if it wasn't ready, failed, or was dismissed before
 * completion (closed early — no reward). Callers must treat `null` as "no
 * reward" and never grant the continue/bonus speculatively before this
 * resolves. Always re-prepares the next one afterwards so it's ready next
 * time the player reaches this screen.
 * @param {AdIds} [ids]
 */
export async function showRewarded(ids) {
  if (!Capacitor.isNativePlatform() || !rewardedReady) return null;

  const reward = await new Promise((resolve) => {
    let settled = false;
    const rewardedHandle = AdMob.addListener(RewardAdPluginEvents.Rewarded, (item) => {
      settled = true;
      resolve(item);
    });
    const dismissedHandle = AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      if (!settled) resolve(null);
    });
    AdMob.showRewardVideoAd().finally(() => {
      Promise.all([rewardedHandle, dismissedHandle]).then((handles) => {
        handles.forEach((h) => h.remove());
      });
    });
  });

  await prepareRewarded(ids);
  return reward;
}
