import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/app.ts';
import type { CoursePack } from '../src/data/types.ts';

const root = resolve(import.meta.dirname, '..');
const dbPath = join(root, 'data', 'content.db');

describe.skipIf(!existsSync(dbPath))('API serwera treści', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbPath, appVersion: '9.9.9', repo: 'owner/repo' });
  });
  afterAll(() => app.close());

  it('health', async () => {
    const r = await app.inject('/api/health');
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it('meta podaje wersję i link do APK', async () => {
    const r = await app.inject('/api/meta');
    expect(r.json().app.version).toBe('9.9.9');
    expect(r.json().app.apkUrl).toContain('owner/repo/releases/latest/download/MultiLingua.apk');
  });

  it('lista kursów i paczka z ETag oraz kompresją', async () => {
    const list = await app.inject('/api/courses');
    const courses = list.json().courses as { id: string; hash: string }[];
    expect(courses.length).toBeGreaterThan(0);
    const id = courses[0].id;

    const gz = await app.inject({ url: `/api/courses/${id}/pack`, headers: { 'accept-encoding': 'gzip' } });
    expect(gz.statusCode).toBe(200);
    expect(gz.headers['content-encoding']).toBe('gzip');
    const pack = JSON.parse(gunzipSync(gz.rawPayload).toString('utf8')) as CoursePack;
    expect(pack.id).toBe(id);
    expect(pack.unitsData.length).toBeGreaterThan(0);

    const again = await app.inject({ url: `/api/courses/${id}/pack`, headers: { 'if-none-match': gz.headers.etag as string } });
    expect(again.statusCode).toBe(304);
  });

  it('CORS dla aplikacji Capacitora', async () => {
    const r = await app.inject({ url: '/api/courses', headers: { origin: 'https://localhost' } });
    expect(r.headers['access-control-allow-origin']).toBe('https://localhost');
    const bad = await app.inject({ url: '/api/courses', headers: { origin: 'https://evil.example' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('wyszukiwanie pełnotekstowe ignoruje akcenty i jest odporne na składnię FTS', async () => {
    const list = (await app.inject('/api/courses')).json().courses as { id: string }[];
    const id = list.find((c) => c.id === 'pl-it')?.id ?? list[0].id;
    const r = await app.inject(`/api/courses/${id}/search?q=${encodeURIComponent('dziekuje')}`);
    expect(r.statusCode).toBe(200);
    expect(r.json().hits.length).toBeGreaterThan(0);
    const weird = await app.inject(`/api/courses/${id}/search?q=${encodeURIComponent('" OR * NEAR(')}`);
    expect(weird.statusCode).toBe(200);
  });

  it('404 dla nieznanego kursu', async () => {
    expect((await app.inject('/api/courses/xx-yy/pack')).statusCode).toBe(404);
  });
});
