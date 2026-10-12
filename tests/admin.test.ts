// Panel administratora na kopii treści w katalogu tymczasowym (repozytorium zostaje nietknięte).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildServer } from '../server/app.ts';
import { buildContentDb } from '../scripts/content-db.ts';
import type { CoursePack } from '../src/data/types.ts';

const root = resolve(import.meta.dirname, '..');
const CODE = 'TESTCODE-1234';
const H = { 'x-multilingua-admin': '1' };

describe('panel administratora', () => {
  let app: FastifyInstance;
  let tmp: string;
  let cookie = '';
  let unit01 = '';
  const calls: { url: string; body: unknown }[] = [];

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'ml-admin-'));
    cpSync(join(root, 'content', 'courses'), join(tmp, 'courses'), { recursive: true });
    const dbPath = join(tmp, 'content.db');
    const report = buildContentDb(join(tmp, 'courses'), dbPath);
    renameSync(report.tmpFile!, dbPath);
    unit01 = readFileSync(join(tmp, 'courses', 'pl-it', 'units', '01-ciao.yaml'), 'utf8');

    // Atrapa OpenRouter: model „pisze” rozdział na wzór pierwszego.
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'test/model', name: 'Test', context_length: 1000, pricing: { prompt: '0.000001', completion: '0.000002' } }] }));
      }
      const yaml = unit01.replace(/^id: u01/m, 'id: u09').replace(/^title: .*/m, 'title: Generato').replace(/\{id: [\w-]+, /g, '{');
      return new Response(JSON.stringify({ model: 'test/model', choices: [{ message: { content: `Proszę:\n\`\`\`yaml\n${yaml}\`\`\`` } }] }));
    }) as typeof fetch;

    app = await buildServer({
      dbPath,
      appVersion: '1.0.0',
      repo: 'o/r',
      admin: { coursesDir: join(tmp, 'courses'), dataDir: tmp, setupCode: CODE, log: () => {}, fetchImpl: fakeFetch },
    });
  });

  afterAll(async () => {
    await app?.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = H): Promise<LightMyRequestResponse> =>
    app.inject({ method, url: `/api/admin${url}`, payload: payload as object, headers: { ...headers, cookie } });

  it('bez konta: status i blokada pozostałych tras', async () => {
    expect((await req('GET', '/status')).json()).toMatchObject({ configured: false, loggedIn: false });
    expect((await req('GET', '/courses')).statusCode).toBe(401);
  });

  it('zakładanie konta wymaga nagłówka, kodu startowego i długiego hasła', async () => {
    expect((await req('POST', '/setup', { code: CODE, password: 'dlugiehaslo1' }, {})).statusCode).toBe(403);
    expect((await req('POST', '/setup', { code: 'ZLY-KOD-0000', password: 'dlugiehaslo1' })).statusCode).toBe(403);
    expect((await req('POST', '/setup', { code: CODE, password: 'krotkie' })).statusCode).toBe(400);
    const ok = await req('POST', '/setup', { code: CODE, password: 'dlugiehaslo1' });
    expect(ok.statusCode).toBe(200);
    const set = String(ok.headers['set-cookie']);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Strict');
    cookie = set.split(';')[0];
    expect(existsSync(join(tmp, 'admin.json'))).toBe(true);
    expect(readFileSync(join(tmp, 'admin.json'), 'utf8')).not.toContain('dlugiehaslo1');
    expect((await req('POST', '/setup', { code: CODE, password: 'dlugiehaslo2' })).statusCode).toBe(409);
  });

  it('logowanie', async () => {
    const saved = cookie;
    cookie = '';
    expect((await req('POST', '/login', { password: 'zle-haslo-123' })).statusCode).toBe(403);
    const ok = await req('POST', '/login', { password: 'dlugiehaslo1' });
    expect(ok.statusCode).toBe(200);
    cookie = String(ok.headers['set-cookie']).split(';')[0];
    expect(cookie).not.toBe(saved);
  });

  it('lista kursów i plików, ścieżki spoza kursu są odrzucane', async () => {
    const r = (await req('GET', '/courses')).json();
    expect(r.courses[0].id).toBe('pl-it');
    expect(r.courses[0].units[0]).toMatchObject({ file: 'units/01-ciao.yaml', id: 'u01' });
    expect((await req('GET', '/file?course=pl-it&file=../../admin.json')).statusCode).toBe(400);
    expect((await req('GET', '/file?course=..&file=course.yaml')).statusCode).toBe(400);
  });

  it('walidacja nie zapisuje błędnego pliku', async () => {
    const bad = await req('PUT', '/file', { course: 'pl-it', file: 'units/01-ciao.yaml', text: 'id: u01\ntitle: [' });
    expect(bad.json()).toMatchObject({ ok: false, saved: false });
    expect(readFileSync(join(tmp, 'courses', 'pl-it', 'units', '01-ciao.yaml'), 'utf8')).toBe(unit01);
  });

  it('zapis przebudowuje kurs bez restartu serwera', async () => {
    const text = unit01.replace(/^title: .*/m, 'title: Ciao a tutti!');
    const r = await req('PUT', '/file', { course: 'pl-it', file: 'units/01-ciao.yaml', text });
    expect(r.json()).toMatchObject({ ok: true, saved: true });
    const pack = (await app.inject('/api/courses/pl-it/pack')).json() as CoursePack;
    expect(pack.unitsData[0].title).toBe('Ciao a tutti!');
  });

  it('ilustracje: odrzuca skrypty, zapisuje czyste SVG i dołącza je do kursu', async () => {
    const evil = await req('PUT', '/image', { course: 'pl-it', key: 'ciao', svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>' });
    expect(evil.statusCode).toBe(422);
    const ok = await req('PUT', '/image', { course: 'pl-it', key: 'ciao', svg: '<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="50"/></svg>' });
    expect(ok.statusCode).toBe(200);
    const pack = (await app.inject('/api/courses/pl-it/pack')).json() as CoursePack;
    expect(pack.unitsData[0].vocab.find((v) => v.t === 'ciao')?.img).toBe('ciao');
    expect(pack.images.count).toBe(1);
    const images = (await app.inject('/api/courses/pl-it/images')).json();
    expect(images.images.ciao).toContain('<circle');
    const list = (await req('GET', '/images?course=pl-it')).json();
    expect(list.words.find((w: { t: string }) => w.t === 'ciao').has).toBe(true);
  });

  it('ustawienia AI, lista modeli i generowanie szkicu rozdziału', async () => {
    expect((await req('POST', '/generate/unit', { course: 'pl-it', brief: { title: 'Generato', topic: 'test', cefr: 'A2' } })).statusCode).toBe(400);
    expect((await req('PUT', '/settings', { openrouterKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz', model: 'test/model' })).statusCode).toBe(200);
    expect((await req('GET', '/settings')).json()).toMatchObject({ hasKey: true, keyHint: '…wxyz', model: 'test/model' });
    expect((await req('GET', '/models')).json().models[0]).toMatchObject({ id: 'test/model', promptPrice: 1 });

    const g = (await req('POST', '/generate/unit', { course: 'pl-it', brief: { title: 'Generato', topic: 'zakupy', cefr: 'A2' } })).json();
    expect(g.ok).toBe(true);
    expect(g.file).toMatch(/^units\/\d{2}-generato\.yaml$/);
    expect(g.text.startsWith('id: u09')).toBe(true);
    const prompt = calls.at(-1)!.body as { model: string; messages: { content: string }[] };
    expect(prompt.model).toBe('test/model');
    // Model dostaje to, co uczeń już zna — żeby budował na wcześniejszych rozdziałach.
    expect(prompt.messages[1].content).toContain('CO UCZEŃ JUŻ ZNA');
    expect(prompt.messages[1].content).toContain('Ciao a tutti!');
    // Szkic nie jest zapisany, dopóki administrator go nie zatwierdzi.
    expect(existsSync(join(tmp, 'courses', 'pl-it', g.file))).toBe(false);

    const saved = await req('PUT', '/file', { course: 'pl-it', file: g.file, text: g.text });
    expect(saved.json().saved).toBe(true);
    const pack = (await app.inject('/api/courses/pl-it/pack')).json() as CoursePack;
    expect(pack.unitsData.at(-1)!.title).toBe('Generato');

    const del = await req('DELETE', '/file', { course: 'pl-it', file: g.file });
    expect(del.json().deleted).toBe(true);
    expect(existsSync(join(tmp, 'courses', 'pl-it', g.file))).toBe(false);
  });

  it('wylogowanie unieważnia sesję', async () => {
    await req('POST', '/logout');
    expect((await req('GET', '/courses')).statusCode).toBe(401);
  });
});
