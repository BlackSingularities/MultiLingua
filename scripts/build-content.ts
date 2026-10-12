// Buduje data/content.db — jedyne źródło treści dla serwera (web i aplikacje mobilne).
// Uruchomienie: npm run content
import { renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContentDb } from './content-db.ts';

const root = resolve(import.meta.dirname, '..');
const outFile = join(root, 'data', 'content.db');

const report = buildContentDb(join(root, 'content', 'courses'), outFile);
for (const e of report.errors) console.error(`✗ ${e}`);
for (const w of report.warnings) console.warn(`! ${w}`);
if (!report.ok || !report.tmpFile) {
  console.error('Kompilacja treści przerwana — popraw błędy powyżej.');
  process.exit(1);
}
for (const l of report.lines) console.log(`✓ ${l}`);
try {
  renameSync(report.tmpFile, outFile);
} catch (e) {
  rmSync(report.tmpFile, { force: true });
  // Windows nie pozwala podmienić pliku otwartego przez działający serwer.
  console.error(`Nie mogę podmienić ${outFile} (${(e as NodeJS.ErrnoException).code}). Zatrzymaj serwer i spróbuj ponownie.`);
  process.exit(1);
}
console.log(`Zapisano ${outFile}`);
