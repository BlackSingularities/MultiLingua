import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => ({
  // Ścieżki względne: ta sama paczka działa pod /multilingua/ i w aplikacji Capacitora.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Aplikacje mobilne łączą się z serwerem produkcyjnym.
    ...(mode === 'mobile' ? { 'import.meta.env.VITE_API_BASE': JSON.stringify('https://redzikowski.com/multilingua/api') } : {}),
  },
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'mobile',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'MultiLingua',
        short_name: 'MultiLingua',
        description: 'Nauka języków: lekcje, historyjki, słuchanie, mówienie i gramatyka.',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f2f4fb',
        theme_color: '#1b2559',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//],
        // Paczki kursów i tak trafiają do IndexedDB; API zawsze najpierw z sieci.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 6, expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
}));
