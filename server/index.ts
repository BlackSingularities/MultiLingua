import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildServer } from './app.ts';
import { buildContentDb } from '../scripts/content-db.ts';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const env = process.env;

// Treść kursów (YAML) i dane serwera. W kontenerze leżą na wolumenie, żeby zmiany
// z panelu administratora przetrwały restart; lokalnie — w repozytorium.
const coursesDir = env.CONTENT_DIR ?? join(root, 'content', 'courses');
const dataDir = env.DATA_DIR ?? join(root, 'data');
const dbPath = env.CONTENT_DB ?? join(dataDir, 'content.db');
mkdirSync(dataDir, { recursive: true });

if (env.CONTENT_SEED_DIR) seedContent(env.CONTENT_SEED_DIR);
if (!existsSync(dbPath)) rebuildDb();

const app = await buildServer({
  dbPath,
  staticDir: env.STATIC_DIR ?? join(root, 'dist'),
  appVersion: pkg.version,
  repo: env.GITHUB_REPO ?? 'BlackSingularities/MultiLingua',
  logger: env.NODE_ENV === 'production',
  admin: env.ADMIN_DISABLED === '1'
    ? undefined
    : {
        coursesDir,
        dataDir,
        setupCode: env.ADMIN_SETUP_CODE || undefined,
        openrouterKey: env.OPENROUTER_API_KEY || undefined,
        defaultModel: env.OPENROUTER_MODEL || undefined,
      },
});

const port = Number(env.PORT ?? 8787);
await app.listen({ port, host: env.HOST ?? '0.0.0.0' });
console.log(`MultiLingua: http://localhost:${port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

function rebuildDb() {
  const report = buildContentDb(coursesDir, dbPath);
  if (!report.ok || !report.tmpFile) throw new Error(`Nie udało się zbudować treści:\n${report.errors.join('\n')}`);
  renameSync(report.tmpFile, dbPath);
  for (const l of report.lines) console.log(`Treść: ${l}`);
}

/**
 * Treść z obrazu (repozytorium) trafia na wolumen przy pierwszym starcie i przy każdej
 * nowej wersji — chyba że administrator coś zmienił w panelu. Wtedy zostawiamy jego
 * wersję i tylko zapisujemy, że w repozytorium czeka nowsza (panel to pokazuje).
 */
function seedContent(seedDir: string) {
  const hash = dirHash(seedDir);
  const seedFile = join(dataDir, 'seed.json');
  const seed = existsSync(seedFile) ? (JSON.parse(readFileSync(seedFile, 'utf8')) as { hash: string; edited?: boolean }) : null;
  if (seed && seed.hash === hash && existsSync(coursesDir)) return;
  if (seed?.edited && existsSync(coursesDir)) {
    writeFileSync(seedFile, JSON.stringify({ ...seed, pending: hash }));
    console.warn('Treść kursów ma zmiany z panelu administratora — nowa treść z repozytorium NIE została wgrana.');
    return;
  }
  rmSync(coursesDir, { recursive: true, force: true });
  cpSync(seedDir, coursesDir, { recursive: true });
  writeFileSync(seedFile, JSON.stringify({ hash, edited: false, at: new Date().toISOString() }));
  rmSync(dbPath, { force: true });
  console.log('Wgrano treść kursów z obrazu.');
}

function dirHash(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p.slice(dir.length)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 16);
}
