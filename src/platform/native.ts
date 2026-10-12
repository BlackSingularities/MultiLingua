import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

/** Konfiguracja natywnej powłoki: pasek stanu, przycisk „wstecz”, ekran startowy. */
export async function setupNative(goBack: () => boolean) {
  if (!isNative) return;
  App.addListener('backButton', () => {
    if (!goBack()) void App.exitApp();
  });
  await SplashScreen.hide().catch(() => {});
}

export async function syncStatusBar(dark: boolean) {
  if (!isNative) return;
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  if (platform === 'android') {
    await StatusBar.setBackgroundColor({ color: dark ? '#0f1530' : '#f2f4fb' }).catch(() => {});
  }
}

export async function appVersion(): Promise<string> {
  if (isNative) {
    try {
      return (await App.getInfo()).version;
    } catch {
      /* fallthrough */
    }
  }
  return __APP_VERSION__;
}
