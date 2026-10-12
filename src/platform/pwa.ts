import { Capacitor } from '@capacitor/core';

/** Service worker tylko w wersji webowej — aplikacje mobilne mają pliki w paczce. */
export function registerServiceWorker() {
  if (Capacitor.isNativePlatform() || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
