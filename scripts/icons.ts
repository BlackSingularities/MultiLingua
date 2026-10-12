// Generuje ikony PWA i grafiki źródłowe dla @capacitor/assets z assets/*.svg.
// Uruchomienie: node --experimental-strip-types scripts/icons.ts
import sharp from 'sharp';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const icon = readFileSync(join(root, 'assets', 'icon.svg'));
const fg = readFileSync(join(root, 'assets', 'icon-foreground.svg'));
const NAVY = '#1b2559';

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
copyFileSync(join(root, 'assets', 'icon.svg'), join(root, 'public', 'favicon.svg'));

await sharp(icon, { density: 300 }).resize(192).png().toFile(join(root, 'public/icons/icon-192.png'));
await sharp(icon, { density: 300 }).resize(512).png().toFile(join(root, 'public/icons/icon-512.png'));
await sharp({ create: { width: 512, height: 512, channels: 4, background: NAVY } })
  .composite([{ input: await sharp(fg, { density: 300 }).resize(512).png().toBuffer() }])
  .png()
  .toFile(join(root, 'public/icons/icon-maskable-512.png'));

// Źródła dla `npx capacitor-assets generate`.
await sharp(icon, { density: 400 }).resize(1024).png().toFile(join(root, 'assets/icon-only.png'));
await sharp(fg, { density: 400 }).resize(1024).png().toFile(join(root, 'assets/icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NAVY } }).png().toFile(join(root, 'assets/icon-background.png'));
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: NAVY } })
    .composite([{ input: await sharp(fg, { density: 300 }).resize(900).png().toBuffer(), gravity: 'center' }])
    .png()
    .toFile(join(root, 'assets', name));
}
console.log('Ikony wygenerowane.');
