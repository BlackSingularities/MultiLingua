// Serwer treści MultiLingua: udostępnia bazę kursów (SQLite, tylko odczyt)
// aplikacji webowej i mobilnym. Postępy użytkowników NIE trafiają na serwer.
import Fastify, { type FastifyInstance } from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppMeta, CourseSummary, SearchHit } from '../src/data/types.ts';

export interface ServerOptions {
  dbPath: string;
  staticDir?: string;
  appVersion: string;
  repo: string;
  logger?: boolean;
}

interface CourseRow {
  id: string;
  hash: string;
  summary: string;
  pack: Uint8Array;
  pack_gz: Uint8Array;
  pack_br: Uint8Array;
}

// Aplikacje Capacitora działają z tych originów; web jest na tej samej domenie.
const ALLOWED_ORIGINS = new Set([
  'https://redzikowski.com',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
]);

export async function buildServer(opts: ServerOptions): Promise<FastifyInstance> {
  if (!existsSync(opts.dbPath)) {
    throw new Error(`Brak bazy treści ${opts.dbPath} — uruchom "npm run content".`);
  }
  const db = new DatabaseSync(opts.dbPath, { readOnly: true });
  const meta = Object.fromEntries(
    (db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  );

  // Paczki kursów są małe (dziesiątki KiB) — trzymamy je w pamięci.
  const courses = new Map<string, CourseRow & { parsed: CourseSummary }>();
  for (const row of db.prepare('SELECT id, hash, summary, pack, pack_gz, pack_br FROM courses ORDER BY position').all() as unknown as CourseRow[]) {
    courses.set(row.id, { ...row, parsed: JSON.parse(row.summary) as CourseSummary });
  }
  const summaries = [...courses.values()].map((c) => c.parsed);
  const unitStmt = db.prepare('SELECT data FROM units WHERE course = ? AND id = ?');
  const searchStmt = db.prepare(`
    SELECT kind, id, unit, t, n FROM search
    WHERE search MATCH ? AND course = ?
    ORDER BY rank LIMIT ?
  `);

  const repoUrl = `https://github.com/${opts.repo}`;
  const appMeta: AppMeta = {
    app: {
      version: opts.appVersion,
      apkUrl: `${repoUrl}/releases/latest/download/MultiLingua.apk`,
      iosUrl: `${repoUrl}/releases/latest/download/MultiLingua-unsigned.ipa`,
      releasesUrl: `${repoUrl}/releases`,
      repoUrl,
    },
    content: { version: meta.content_version ?? 'dev', builtAt: meta.built_at ?? '' },
  };

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
    methods: ['GET', 'HEAD'],
    maxAge: 86400,
  });
  await app.register(compress, { global: true, threshold: 1024 });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  app.get('/api/health', async () => ({ ok: true, content: appMeta.content.version, courses: courses.size }));

  app.get('/api/meta', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return appMeta;
  });

  app.get('/api/courses', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return { contentVersion: appMeta.content.version, courses: summaries };
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id/pack', async (req, reply) => {
    const c = courses.get(req.params.id);
    if (!c) return reply.code(404).send({ error: 'Nie ma takiego kursu.' });
    const etag = `"${c.hash}"`;
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'no-cache');
    reply.header('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();

    // Paczki są skompresowane z góry przy budowaniu bazy (brotli 11 / gzip 9).
    const accept = String(req.headers['accept-encoding'] ?? '');
    reply.type('application/json; charset=utf-8');
    if (/\bbr\b/.test(accept)) {
      reply.header('Content-Encoding', 'br');
      return reply.send(Buffer.from(c.pack_br));
    }
    if (/\bgzip\b/.test(accept)) {
      reply.header('Content-Encoding', 'gzip');
      return reply.send(Buffer.from(c.pack_gz));
    }
    return reply.send(Buffer.from(c.pack));
  });

  app.get<{ Params: { id: string; unit: string } }>('/api/courses/:id/units/:unit', async (req, reply) => {
    const row = unitStmt.get(req.params.id, req.params.unit) as { data: string } | undefined;
    if (!row) return reply.code(404).send({ error: 'Nie ma takiej jednostki.' });
    reply.type('application/json; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(row.data);
  });

  app.get<{ Params: { id: string }; Querystring: { q?: string; limit?: string } }>('/api/courses/:id/search', async (req, reply) => {
    if (!courses.has(req.params.id)) return reply.code(404).send({ error: 'Nie ma takiego kursu.' });
    const terms = String(req.query.q ?? '')
      .slice(0, 80)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 6);
    if (terms.length === 0) return { hits: [] };
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    // Każde słowo jako prefiks w cudzysłowie — bezpieczne wobec składni FTS5.
    const match = terms.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
    const hits = searchStmt.all(match, req.params.id, limit) as unknown as SearchHit[];
    return { hits };
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const indexHtml = readFileSync(join(opts.staticDir, 'index.html'));
    await app.register(fastifyStatic, {
      root: opts.staticDir,
      wildcard: false,
      index: ['index.html'],
      setHeaders(res, path) {
        // Pliki z hashem w nazwie są niezmienne; reszta (index.html, sw.js, manifest) — zawsze świeża.
        if (/[\\/]assets[\\/]/.test(path)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else res.header('Cache-Control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nie znaleziono.' });
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html; charset=utf-8').send(indexHtml);
    });
  }

  app.addHook('onClose', async () => db.close());
  return app;
}
