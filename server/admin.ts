// Panel administratora (tylko web, ta sama domena): edycja treści kursów,
// generowanie rozdziałów przez AI (OpenRouter) i ilustracje słówek.
//
// Bezpieczeństwo:
// - pierwsze konto zakłada się kodem startowym z logu serwera (albo ADMIN_SETUP_CODE),
// - hasło: scrypt z solą; sesja: losowy token w ciasteczku HttpOnly, SameSite=Strict,
// - zmiany wymagają nagłówka X-MultiLingua-Admin (formularz z obcej strony go nie wyśle),
// - logowanie ma limit prób na adres IP, ścieżki plików są ściśle sprawdzane.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { checkSvg, compileCourse, ContentError, imageKeyOf } from '../scripts/content-lib.ts';
import { buildContentDb } from '../scripts/content-db.ts';
import type { ContentStore } from './content-store.ts';
import { chat, extractYaml, listModels, loadCourseContext, revisePrompt, unitPrompt, type ModelInfo, type UnitBrief } from './ai.ts';

export interface AdminOptions {
  store: ContentStore;
  /** Katalog z kursami: <coursesDir>/<kurs>/course.yaml, units/, images/. */
  coursesDir: string;
  /** Katalog na dane panelu (admin.json, kosz). */
  dataDir: string;
  /** Stały kod startowy (zmienna ADMIN_SETUP_CODE); bez niego losujemy i wypisujemy w logu. */
  setupCode?: string;
  /** Klucz OpenRouter ze zmiennej środowiskowej — ma pierwszeństwo przed zapisanym w panelu. */
  openrouterKey?: string;
  defaultModel?: string;
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
}

interface AdminFile {
  passwordHash: string;
  createdAt: string;
  model?: string;
  openrouterKey?: string;
}

const COOKIE = 'ml_admin';
const SESSION_MS = 12 * 3600_000;
const COURSE_RE = /^[a-z]{2}-[a-z]{2}$/;
const FILE_RE = /^(course\.yaml|units\/\d{2}-[a-z0-9-]+\.yaml)$/;
const KEY_RE = /^[a-z0-9-]+$/;
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, got);
}

function sameText(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Ciasteczko tylko dla API panelu — także za proxy pod prefiksem (np. /multilingua). */
function cookiePath(req: FastifyRequest): string {
  const prefix = String(req.headers['x-forwarded-prefix'] ?? '');
  return `${/^\/[\w-]+$/.test(prefix) ? prefix : ''}/api/admin`;
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Zapis „wszystko albo nic”: najpierw plik tymczasowy, potem podmiana. */
function writeAtomic(file: string, data: string, mode?: number) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { encoding: 'utf8', mode });
  renameSync(tmp, file);
}

export async function registerAdmin(app: FastifyInstance, opts: AdminOptions) {
  const adminFile = join(opts.dataDir, 'admin.json');
  const log = opts.log ?? ((m: string) => console.log(m));
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { n: number; until: number }>();
  let models: { at: number; list: ModelInfo[] } | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const readAdmin = (): AdminFile | null => (existsSync(adminFile) ? (JSON.parse(readFileSync(adminFile, 'utf8')) as AdminFile) : null);
  const writeAdmin = (a: AdminFile) => writeAtomic(adminFile, `${JSON.stringify(a, null, 2)}\n`, 0o600);

  // Za krótki (albo pusty) kod z konfiguracji ignorujemy — wtedy losujemy własny.
  const setupCode = opts.setupCode && opts.setupCode.trim().length >= 8
    ? opts.setupCode.trim()
    : randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toUpperCase();
  if (!readAdmin()) {
    log(`Panel administratora nie jest skonfigurowany. Kod startowy: ${setupCode} — wpisz go na stronie #/admin.`);
  }

  const apiKey = () => opts.openrouterKey || readAdmin()?.openrouterKey || '';
  const model = () => readAdmin()?.model || opts.defaultModel || DEFAULT_MODEL;

  // ——— sesje i ochrona ———

  const limit = (req: FastifyRequest) => {
    const now = Date.now();
    const a = attempts.get(req.ip);
    if (a && a.until > now && a.n >= 8) throw new HttpError(429, 'Za dużo prób. Odczekaj 15 minut.');
    attempts.set(req.ip, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 15 * 60_000 });
  };

  const startSession = (req: FastifyRequest, reply: FastifyReply) => {
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_MS);
    attempts.delete(req.ip);
    const secure = req.protocol === 'https' ? '; Secure' : '';
    reply.header('Set-Cookie', `${COOKIE}=${token}; Path=${cookiePath(req)}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`);
  };

  const loggedIn = (req: FastifyRequest) => {
    const token = readCookie(req, COOKIE);
    if (!token) return false;
    const exp = sessions.get(token);
    if (!exp || exp < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  };

  const OPEN = new Set(['/api/admin/status', '/api/admin/setup', '/api/admin/login']);
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/admin/')) return;
    const path = req.url.split('?')[0];
    if (req.method !== 'GET' && req.headers['x-multilingua-admin'] !== '1') {
      throw new HttpError(403, 'Brak nagłówka panelu administratora.');
    }
    if (!OPEN.has(path) && !loggedIn(req)) throw new HttpError(401, 'Zaloguj się do panelu administratora.');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof ContentError) return reply.code(422).send({ error: err.message, errors: [err.message] });
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Błąd serwera.' : String(e.message) });
  });

  // ——— ścieżki ———

  const courseDir = (course: unknown): string => {
    if (typeof course !== 'string' || !COURSE_RE.test(course)) throw new HttpError(400, 'Niepoprawny identyfikator kursu.');
    const dir = join(opts.coursesDir, course);
    if (!existsSync(join(dir, 'course.yaml'))) throw new HttpError(404, 'Nie ma takiego kursu.');
    return dir;
  };

  const fileIn = (course: unknown, file: unknown): { dir: string; path: string; file: string } => {
    const dir = courseDir(course);
    if (typeof file !== 'string' || !FILE_RE.test(file)) throw new HttpError(400, 'Niepoprawna nazwa pliku.');
    return { dir, path: join(dir, ...file.split('/')), file };
  };

  /** Kompiluje kurs z podmienionymi plikami — bez dotykania prawdziwego katalogu. */
  const validate = (dir: string, overrides: Record<string, string | null>) => {
    const tmp = mkdtempSync(join(tmpdir(), 'ml-check-'));
    try {
      cpSync(dir, tmp, { recursive: true });
      for (const [file, text] of Object.entries(overrides)) {
        const p = join(tmp, ...file.split('/'));
        if (text === null) rmSync(p, { force: true });
        else {
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, text, 'utf8');
        }
      }
      try {
        const { pack, warnings } = compileCourse(tmp);
        return {
          ok: true as const,
          errors: [] as string[],
          warnings: warnings.map((w) => w.replace(tmp, '')),
          stats: { units: pack.units, lessons: pack.lessons, words: pack.words, sentences: pack.sentences, grammar: pack.grammar, stories: pack.stories, images: pack.images.count },
        };
      } catch (e) {
        if (e instanceof ContentError || e instanceof yaml.YAMLException) {
          return { ok: false as const, errors: [String(e.message).replaceAll(tmp, '')], warnings: [], stats: null };
        }
        throw e;
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };

  /** Przebudowa bazy i podmiana w działającym serwerze — po kolei, nigdy dwie naraz. */
  const rebuild = () => {
    const run = queue.then(() => {
      const report = buildContentDb(opts.coursesDir, opts.store.dbPath);
      if (!report.ok || !report.tmpFile) throw new HttpError(422, report.errors.join('\n'));
      opts.store.replace(report.tmpFile);
      return report;
    });
    queue = run.catch(() => {});
    return run;
  };

  const markEdited = () => {
    const seed = join(opts.dataDir, 'seed.json');
    if (!existsSync(seed)) return;
    const s = JSON.parse(readFileSync(seed, 'utf8')) as { hash: string; edited?: boolean };
    if (!s.edited) writeAtomic(seed, JSON.stringify({ ...s, edited: true }));
  };

  // ——— konto ———

  app.get('/api/admin/status', async (req) => {
    const seed = join(opts.dataDir, 'seed.json');
    return {
      configured: !!readAdmin(),
      loggedIn: loggedIn(req),
      seed: existsSync(seed) ? JSON.parse(readFileSync(seed, 'utf8')) : null,
    };
  });

  app.post<{ Body: { code?: string; password?: string } }>('/api/admin/setup', async (req, reply) => {
    limit(req);
    if (readAdmin()) throw new HttpError(409, 'Konto administratora już istnieje — zaloguj się.');
    const { code = '', password = '' } = req.body ?? {};
    if (!sameText(code.trim().toUpperCase(), setupCode.toUpperCase())) throw new HttpError(403, 'Niepoprawny kod startowy. Znajdziesz go w logu serwera.');
    if (password.length < 10) throw new HttpError(400, 'Hasło musi mieć co najmniej 10 znaków.');
    writeAdmin({ passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
    startSession(req, reply);
    log('Utworzono konto administratora.');
    return { ok: true };
  });

  app.post<{ Body: { password?: string } }>('/api/admin/login', async (req, reply) => {
    limit(req);
    const admin = readAdmin();
    if (!admin) throw new HttpError(409, 'Najpierw załóż konto kodem startowym.');
    if (!verifyPassword(req.body?.password ?? '', admin.passwordHash)) throw new HttpError(403, 'Niepoprawne hasło.');
    startSession(req, reply);
    return { ok: true };
  });

  app.post('/api/admin/logout', async (req, reply) => {
    const token = readCookie(req, COOKIE);
    if (token) sessions.delete(token);
    reply.header('Set-Cookie', `${COOKIE}=; Path=${cookiePath(req)}; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });

  app.post<{ Body: { current?: string; next?: string } }>('/api/admin/password', async (req) => {
    const admin = readAdmin()!;
    if (!verifyPassword(req.body?.current ?? '', admin.passwordHash)) throw new HttpError(403, 'Obecne hasło jest niepoprawne.');
    if ((req.body?.next ?? '').length < 10) throw new HttpError(400, 'Nowe hasło musi mieć co najmniej 10 znaków.');
    writeAdmin({ ...admin, passwordHash: hashPassword(req.body!.next!) });
    return { ok: true };
  });

  // ——— ustawienia AI ———

  app.get('/api/admin/settings', async () => {
    const key = apiKey();
    return {
      model: model(),
      hasKey: !!key,
      keyFromEnv: !!opts.openrouterKey,
      keyHint: key ? `…${key.slice(-4)}` : '',
    };
  });

  app.put<{ Body: { model?: string; openrouterKey?: string } }>('/api/admin/settings', async (req) => {
    const admin = readAdmin()!;
    const next = { ...admin };
    if (typeof req.body?.model === 'string') {
      if (!/^[\w.:/-]{3,120}$/.test(req.body.model)) throw new HttpError(400, 'Niepoprawny identyfikator modelu.');
      next.model = req.body.model;
    }
    if (typeof req.body?.openrouterKey === 'string') {
      const k = req.body.openrouterKey.trim();
      if (k && !/^[\w-]{20,200}$/.test(k)) throw new HttpError(400, 'To nie wygląda na klucz OpenRouter.');
      next.openrouterKey = k || undefined;
    }
    writeAdmin(next);
    return { ok: true };
  });

  app.get('/api/admin/models', async () => {
    if (!models || Date.now() - models.at > 3600_000) {
      const list = await listModels(opts.fetchImpl).catch((e: Error) => {
        throw new HttpError(502, e.message.startsWith('OpenRouter') ? e.message : 'Nie udało się połączyć z OpenRouter.');
      });
      models = { at: Date.now(), list };
    }
    return { models: models.list };
  });

  // ——— treść ———

  app.get('/api/admin/courses', async () => {
    const dirs = readdirSync(opts.coursesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && COURSE_RE.test(d.name));
    return {
      courses: dirs.map((d) => {
        const dir = join(opts.coursesDir, d.name);
        let title = d.name;
        try {
          title = (yaml.load(readFileSync(join(dir, 'course.yaml'), 'utf8')) as { title?: string }).title ?? d.name;
        } catch {
          /* pokażemy nazwę katalogu */
        }
        const unitDir = join(dir, 'units');
        const units = (existsSync(unitDir) ? readdirSync(unitDir).filter((f) => f.endsWith('.yaml')).sort() : []).map((f) => {
          try {
            const u = yaml.load(readFileSync(join(unitDir, f), 'utf8')) as {
              id?: string; title?: string; subtitle?: string; cefr?: string; icon?: string;
              vocab?: unknown[]; sentences?: unknown[]; grammar?: unknown[]; stories?: unknown[];
            };
            return {
              file: `units/${f}`, id: u.id, title: u.title, subtitle: u.subtitle, cefr: u.cefr, icon: u.icon,
              counts: { vocab: u.vocab?.length ?? 0, sentences: u.sentences?.length ?? 0, grammar: u.grammar?.length ?? 0, stories: u.stories?.length ?? 0 },
            };
          } catch (e) {
            return { file: `units/${f}`, error: (e as Error).message };
          }
        });
        return { id: d.name, title, units };
      }),
    };
  });

  app.get<{ Querystring: { course?: string; file?: string } }>('/api/admin/file', async (req) => {
    const { path, file } = fileIn(req.query.course, req.query.file);
    if (!existsSync(path)) throw new HttpError(404, 'Nie ma takiego pliku.');
    return { file, text: readFileSync(path, 'utf8') };
  });

  app.post<{ Body: { course?: string; file?: string; text?: string } }>('/api/admin/validate', async (req) => {
    const { dir, file } = fileIn(req.body?.course, req.body?.file);
    return validate(dir, { [file]: String(req.body?.text ?? '') });
  });

  app.put<{ Body: { course?: string; file?: string; text?: string; previous?: string } }>('/api/admin/file', async (req) => {
    const { dir, path, file } = fileIn(req.body?.course, req.body?.file);
    const text = String(req.body?.text ?? '').replace(/\r\n/g, '\n');
    const check = validate(dir, { [file]: text });
    if (!check.ok) return { ...check, saved: false };
    // Zmiana nazwy pliku (np. po zmianie tytułu) — stary plik usuwamy dopiero po udanym zapisie.
    const previous = req.body?.previous && req.body.previous !== file ? fileIn(req.body.course, req.body.previous) : null;
    const backup = existsSync(path) ? readFileSync(path, 'utf8') : null;
    writeAtomic(path, text);
    try {
      const report = await rebuild();
      if (previous && existsSync(previous.path)) {
        rmSync(previous.path);
        await rebuild();
      }
      markEdited();
      return { ...check, saved: true, lines: report.lines };
    } catch (e) {
      if (backup === null) rmSync(path, { force: true });
      else writeAtomic(path, backup);
      throw e;
    }
  });

  app.delete<{ Body: { course?: string; file?: string } }>('/api/admin/file', async (req) => {
    const { dir, path, file } = fileIn(req.body?.course, req.body?.file);
    if (!file.startsWith('units/')) throw new HttpError(400, 'Można usuwać tylko rozdziały.');
    if (!existsSync(path)) throw new HttpError(404, 'Nie ma takiego pliku.');
    const check = validate(dir, { [file]: null });
    if (!check.ok) return { ...check, deleted: false };
    // Do kosza, nie na zawsze — łatwo przywrócić ręcznie.
    const trash = join(opts.dataDir, 'trash', `${new Date().toISOString().replace(/[:.]/g, '-')}-${req.body!.course}-${file.replace('/', '_')}`);
    mkdirSync(dirname(trash), { recursive: true });
    cpSync(path, trash);
    rmSync(path);
    await rebuild();
    markEdited();
    return { ...check, deleted: true, trash };
  });

  app.post<{ Body: { course?: string } }>('/api/admin/rebuild', async () => {
    const report = await rebuild();
    return { ok: true, lines: report.lines, warnings: report.warnings };
  });

  // ——— AI ———

  const ai = async (system: string, user: string) => {
    const key = apiKey();
    if (!key) throw new HttpError(400, 'Dodaj klucz OpenRouter w zakładce „Model AI”.');
    try {
      return await chat({ apiKey: key, model: model(), fetchImpl: opts.fetchImpl }, system, user);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new HttpError(504, 'Model nie odpowiedział w ciągu 5 minut. Spróbuj szybszego modelu.');
      throw new HttpError(502, (e as Error).message);
    }
  };

  app.post<{ Body: { course?: string; brief?: UnitBrief } }>('/api/admin/generate/unit', async (req) => {
    const dir = courseDir(req.body?.course);
    const brief = req.body?.brief;
    if (!brief?.title?.trim() || !brief.topic?.trim()) throw new HttpError(400, 'Podaj tytuł i temat rozdziału.');
    const ctx = loadCourseContext(dir);
    const prompt = unitPrompt(ctx, { ...brief, cefr: brief.cefr || 'A1' });
    const result = await ai(prompt.system, prompt.user);
    const text = extractYaml(result.text);
    const slug = brief.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'rozdzial';
    const file = `units/${String(ctx.nextIndex).padStart(2, '0')}-${slug}.yaml`;
    return { file, text, model: result.model, usage: result.usage, ...validate(dir, { [file]: text }) };
  });

  app.post<{ Body: { course?: string; file?: string; text?: string; instruction?: string; errors?: string[] } }>('/api/admin/generate/revise', async (req) => {
    const { dir, file } = fileIn(req.body?.course, req.body?.file);
    const ctx = loadCourseContext(dir);
    const prompt = revisePrompt(ctx, file, String(req.body?.text ?? ''), String(req.body?.instruction ?? ''), (req.body?.errors ?? []).slice(0, 20).map(String));
    const result = await ai(prompt.system, prompt.user);
    const text = extractYaml(result.text);
    return { file, text, model: result.model, usage: result.usage, ...validate(dir, { [file]: text }) };
  });

  // ——— ilustracje ———

  app.get<{ Querystring: { course?: string } }>('/api/admin/images', async (req) => {
    const dir = courseDir(req.query.course);
    const imgDir = join(dir, 'images');
    const files = new Set(existsSync(imgDir) ? readdirSync(imgDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)) : []);
    const { pack } = compileCourse(dir);
    const words = pack.unitsData.flatMap((u) =>
      u.vocab.map((v) => {
        const key = v.img ?? imageKeyOf(v.id);
        return { id: v.id, unit: u.id, unitTitle: u.title, t: v.t, n: v.n, emoji: v.emoji, pos: v.pos, key, has: files.has(key) };
      }),
    );
    const used = new Set(words.map((w) => w.key));
    return { words, unused: [...files].filter((f) => !used.has(f)) };
  });

  app.get<{ Querystring: { course?: string; key?: string } }>('/api/admin/image', async (req, reply) => {
    const dir = courseDir(req.query.course);
    const key = String(req.query.key ?? '');
    if (!KEY_RE.test(key)) throw new HttpError(400, 'Niepoprawny klucz ilustracji.');
    const path = join(dir, 'images', `${key}.svg`);
    if (!existsSync(path)) throw new HttpError(404, 'Brak ilustracji.');
    // Podgląd jako tekst — panel pokazuje go przez <img src="blob:">, nigdy jako HTML.
    reply.header('Cache-Control', 'no-store');
    return { key, svg: readFileSync(path, 'utf8') };
  });

  app.put<{ Body: { course?: string; key?: string; svg?: string } }>('/api/admin/image', async (req) => {
    const dir = courseDir(req.body?.course);
    const key = String(req.body?.key ?? '');
    if (!KEY_RE.test(key)) throw new HttpError(400, 'Niepoprawny klucz ilustracji.');
    const svg = checkSvg(`${key}.svg`, String(req.body?.svg ?? ''));
    writeAtomic(join(dir, 'images', `${key}.svg`), `${svg}\n`);
    await rebuild();
    markEdited();
    return { ok: true };
  });

  app.delete<{ Body: { course?: string; key?: string } }>('/api/admin/image', async (req) => {
    const dir = courseDir(req.body?.course);
    const key = String(req.body?.key ?? '');
    if (!KEY_RE.test(key)) throw new HttpError(400, 'Niepoprawny klucz ilustracji.');
    rmSync(join(dir, 'images', `${key}.svg`), { force: true });
    await rebuild();
    markEdited();
    return { ok: true };
  });

  // ——— eksport (żeby zmiany z serwera trafiły do repozytorium) ———

  app.get<{ Querystring: { course?: string } }>('/api/admin/export', async (req, reply) => {
    const dir = courseDir(req.query.course);
    const files: Record<string, string> = {};
    const walk = (rel: string) => {
      for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r);
        else if (/\.(ya?ml|svg|md)$/.test(e.name)) files[r] = readFileSync(join(dir, r), 'utf8');
      }
    };
    walk('');
    reply.header('Content-Disposition', `attachment; filename="multilingua-${req.query.course}-${new Date().toISOString().slice(0, 10)}.json"`);
    return { course: req.query.course, exportedAt: new Date().toISOString(), files };
  });
}
