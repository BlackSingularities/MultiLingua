// Compile the approved transparent source. Run: node --experimental-strip-types scripts/icons.ts
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'artwork/app-icon.png');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
async function icon(size: number, occupancy = 0.88) {
  const glyph = await sharp(source).trim({ background: '#00000000' })
    .resize(Math.round(size * occupancy), Math.round(size * occupancy), { fit: 'inside' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: glyph, gravity: 'center' }]).png().toBuffer();
}
mkdirSync(join(root, 'public/icons'), { recursive: true });
for (const size of [192, 512]) {
  await sharp(await icon(size)).toFile(join(root, `public/icons/icon-${size}.png`));
}
await sharp(await icon(512)).toFile(join(root, 'public/favicon.png'));
await sharp(await icon(512)).toFile(join(root, 'public/icons/icon-maskable-512.png'));
await sharp(await icon(1024)).toFile(join(root, 'assets/icon-only.png'));
await sharp(await icon(1024, 0.60)).toFile(join(root, 'assets/icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: transparent } })
  .png().toFile(join(root, 'assets/icon-background.png'));
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: transparent } })
    .composite([{ input: await icon(900), gravity: 'center' }]).png().toFile(join(root, 'assets', name));
}
console.log('Transparent icon assets generated.');
