import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.redzikowski.multilingua',
  appName: 'MultiLingua',
  webDir: 'dist',
  android: {
    // Treść kursów pobieramy z https://redzikowski.com — bez ruchu HTTP.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#1b2559',
      showSpinner: false,
    },
  },
};

export default config;
