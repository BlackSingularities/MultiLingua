import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildServer } from './app.ts';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

const app = await buildServer({
  dbPath: process.env.CONTENT_DB ?? join(root, 'data', 'content.db'),
  staticDir: process.env.STATIC_DIR ?? join(root, 'dist'),
  appVersion: pkg.version,
  repo: process.env.GITHUB_REPO ?? 'BlackSingularities/MultiLingua',
  logger: process.env.NODE_ENV === 'production',
});

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
console.log(`MultiLingua: http://localhost:${port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}
