// Serwer treści MultiLingua: udostępnia bazę kursów (SQLite, tylko odczyt)
// aplikacji webowej i mobilnym. Postępy użytkowników NIE trafiają na serwer.
// Opcjonalnie (gdy podano katalog treści) obsługuje też panel administratora.
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppMeta } from '../src/data/types.ts';
import { ContentStore, type Blobs } from './content-store.ts';
import { registerAdmin, type AdminOptions } from './admin.ts';

export interface ServerOptions {
  dbPath: string;
  staticDir?: string;
  appVersion: string;
  repo: string;
  logger?: boolean;
  /** Panel administratora: katalog z kursami (YAML) i miejsce na dane panelu. */
  admin?: Omit<AdminOptions, 'store'>;
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
  const store = new ContentStore(opts.dbPath);

  const repoUrl = `https://github.com/${opts.repo}`;
  const appMeta = (): AppMeta => ({
    app: {
      version: opts.appVersion,
      apkUrl: `${repoUrl}/releases/latest/download/MultiLingua.apk`,
      iosUrl: `${repoUrl}/releases/latest/download/MultiLingua-unsigned.ipa`,
      releasesUrl: `${repoUrl}/releases`,
      repoUrl,
    },
    content: { version: store.meta.content_version ?? 'dev', builtAt: store.meta.built_at ?? '' },
  });

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
    // Tylko odczyt z innych originów — panel administratora działa wyłącznie z tej samej domeny.
    methods: ['GET', 'HEAD'],
    maxAge: 86400,
  });
  await app.register(compress, { global: true, threshold: 1024 });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  app.get('/api/health', async () => ({ ok: true, content: appMeta().content.version, courses: store.courses.size }));

  app.get('/api/meta', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return appMeta();
  });

  app.get('/api/courses', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return { contentVersion: appMeta().content.version, courses: store.summaries };
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id/pack', async (req, reply) => {
    const c = store.courses.get(req.params.id);
    if (!c) return reply.code(404).send({ error: 'Nie ma takiego kursu.' });
    return sendCached(req.headers, reply, `"${c.hash}"`, c);
  });

  // Ilustracje słówek (SVG) — osobna paczka, żeby treść kursu pozostała lekka.
  app.get<{ Params: { id: string } }>('/api/courses/:id/images', async (req, reply) => {
    if (!store.courses.has(req.params.id)) return reply.code(404).send({ error: 'Nie ma takiego kursu.' });
    const row = store.images(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Ten kurs nie ma jeszcze ilustracji.' });
    return sendCached(req.headers, reply, `"img-${row.hash}"`, row);
  });

  app.get<{ Params: { id: string; unit: string } }>('/api/courses/:id/units/:unit', async (req, reply) => {
    const data = store.unit(req.params.id, req.params.unit);
    if (!data) return reply.code(404).send({ error: 'Nie ma takiej jednostki.' });
    reply.type('application/json; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(data);
  });

  app.get<{ Params: { id: string }; Querystring: { q?: string; limit?: string } }>('/api/courses/:id/search', async (req, reply) => {
    if (!store.courses.has(req.params.id)) return reply.code(404).send({ error: 'Nie ma takiego kursu.' });
    const terms = String(req.query.q ?? '')
      .slice(0, 80)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 6);
    if (terms.length === 0) return { hits: [] };
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    // Każde słowo jako prefiks w cudzysłowie — bezpieczne wobec składni FTS5.
    const match = terms.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
    return { hits: store.search(match, req.params.id, limit) };
  });

  if (opts.admin) await registerAdmin(app, { ...opts.admin, store });

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

  app.addHook('onClose', async () => store.close());
  return app;
}

/** ETag + paczki skompresowane z góry przy budowaniu bazy (brotli 11 / gzip 9). */
function sendCached(headers: Record<string, string | string[] | undefined>, reply: FastifyReply, etag: string, blobs: Blobs) {
  reply.header('ETag', etag);
  reply.header('Cache-Control', 'no-cache');
  reply.header('Vary', 'Accept-Encoding');
  if (headers['if-none-match'] === etag) return reply.code(304).send();
  const accept = String(headers['accept-encoding'] ?? '');
  reply.type('application/json; charset=utf-8');
  if (/\bbr\b/.test(accept)) {
    reply.header('Content-Encoding', 'br');
    return reply.send(Buffer.from(blobs.pack_br));
  }
  if (/\bgzip\b/.test(accept)) {
    reply.header('Content-Encoding', 'gzip');
    return reply.send(Buffer.from(blobs.pack_gz));
  }
  return reply.send(Buffer.from(blobs.pack));
}
