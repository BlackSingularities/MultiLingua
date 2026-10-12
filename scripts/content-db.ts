// Budowanie bazy treści (SQLite) z katalogu kursów. Używa tego `npm run content`
// oraz serwer, gdy administrator zapisze zmiany w panelu.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileCourse, listCourseDirs, ContentError, type CompiledCourse } from './content-lib.ts';
import type { CourseSummary } from '../src/data/types.ts';

export interface BuildReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lines: string[];
  /** Plik tymczasowy z nową bazą — do podmiany przez wywołującego (tylko gdy ok). */
  tmpFile?: string;
}

const SCHEMA = `
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    pack BLOB NOT NULL,
    pack_gz BLOB NOT NULL,
    pack_br BLOB NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE images (
    course TEXT PRIMARY KEY REFERENCES courses(id),
    hash TEXT NOT NULL,
    count INTEGER NOT NULL,
    pack BLOB NOT NULL,
    pack_gz BLOB NOT NULL,
    pack_br BLOB NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE units (
    course TEXT NOT NULL REFERENCES courses(id),
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (course, id)
  ) WITHOUT ROWID;
  CREATE TABLE vocab (
    course TEXT NOT NULL, id TEXT NOT NULL, unit TEXT NOT NULL,
    t TEXT NOT NULL, n TEXT NOT NULL, pos TEXT NOT NULL,
    PRIMARY KEY (course, id)
  ) WITHOUT ROWID;
  CREATE TABLE sentences (
    course TEXT NOT NULL, id TEXT NOT NULL, unit TEXT NOT NULL,
    t TEXT NOT NULL, n TEXT NOT NULL,
    PRIMARY KEY (course, id)
  ) WITHOUT ROWID;
  CREATE TABLE grammar (
    course TEXT NOT NULL, id TEXT NOT NULL, unit TEXT NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY (course, id)
  ) WITHOUT ROWID;
  CREATE VIRTUAL TABLE search USING fts5(
    course UNINDEXED, kind UNINDEXED, id UNINDEXED, unit UNINDEXED, t, n,
    tokenize = "unicode61 remove_diacritics 2"
  );
`;

function compress(json: string) {
  const raw = Buffer.from(json, 'utf8');
  return {
    raw,
    gz: gzipSync(raw, { level: 9 }),
    br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  };
}

/** Kompiluje wszystkie kursy z `coursesRoot` do pliku tymczasowego obok `outFile`. */
export function buildContentDb(coursesRoot: string, outFile: string): BuildReport {
  const report: BuildReport = { ok: false, errors: [], warnings: [], lines: [] };
  const compiled: CompiledCourse[] = [];
  for (const dir of listCourseDirs(coursesRoot)) {
    try {
      compiled.push(compileCourse(dir));
    } catch (e) {
      if (e instanceof ContentError) report.errors.push(e.message);
      else throw e;
    }
  }
  if (report.errors.length) return report;

  mkdirSync(dirname(outFile), { recursive: true });
  const tmpFile = join(dirname(outFile), `content.${process.pid}.${Date.now()}.tmp.db`);
  if (existsSync(tmpFile)) rmSync(tmpFile);
  const db = new DatabaseSync(tmpFile);
  db.exec(SCHEMA);
  const insCourse = db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insImages = db.prepare('INSERT INTO images VALUES (?, ?, ?, ?, ?, ?)');
  const insUnit = db.prepare('INSERT INTO units VALUES (?, ?, ?, ?, ?)');
  const insVocab = db.prepare('INSERT INTO vocab VALUES (?, ?, ?, ?, ?, ?)');
  const insSentence = db.prepare('INSERT INTO sentences VALUES (?, ?, ?, ?, ?)');
  const insGrammar = db.prepare('INSERT INTO grammar VALUES (?, ?, ?, ?, ?, ?)');
  const insSearch = db.prepare('INSERT INTO search VALUES (?, ?, ?, ?, ?, ?)');
  const versionHash = createHash('sha256');

  db.exec('BEGIN');
  compiled.forEach(({ pack, json, images, warnings }, position) => {
    report.warnings.push(...warnings);
    const { raw, gz, br } = compress(json);
    const { unitsData: _units, rules: _rules, builtAt: _b, ...rest } = pack;
    const summary: CourseSummary = { ...rest, size: gz.length };
    insCourse.run(pack.id, position, pack.hash, JSON.stringify(summary), raw, gz, br);
    versionHash.update(pack.hash);
    if (pack.images.count > 0) {
      const media = compress(JSON.stringify({ course: pack.id, hash: pack.images.hash, images }));
      insImages.run(pack.id, pack.images.hash, pack.images.count, media.raw, media.gz, media.br);
      versionHash.update(pack.images.hash);
    }
    for (const u of pack.unitsData) {
      insUnit.run(pack.id, u.id, u.index, u.title, JSON.stringify(u));
      for (const v of u.vocab) {
        insVocab.run(pack.id, v.id, u.id, v.t, v.n, v.pos);
        insSearch.run(pack.id, 'vocab', v.id, u.id, [v.t, ...(v.altT ?? []), v.plural ?? ''].join(' '), [v.n, ...(v.altN ?? [])].join(' '));
      }
      for (const s of u.sentences) {
        insSentence.run(pack.id, s.id, u.id, s.t, s.n);
        insSearch.run(pack.id, 'sentence', s.id, u.id, s.t, s.n);
      }
      for (const g of u.grammar) {
        insGrammar.run(pack.id, g.id, u.id, g.title, g.summary, g.body);
        insSearch.run(pack.id, 'grammar', g.id, u.id, g.examples.map((e) => e.t).join(' '), `${g.title} ${g.summary} ${g.body}`);
      }
    }
    report.lines.push(
      `${pack.id}: ${pack.units} jedn., ${pack.lessons} lekcji, ${pack.words} słówek, ${pack.sentences} zdań, ` +
        `${pack.grammar} tematów gramatyki, ${pack.stories} historyjek, ` +
        `${pack.images.count}/${pack.words} ilustracji — ${(gz.length / 1024).toFixed(1)} KiB gzip`,
    );
  });

  const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
  insMeta.run('content_version', versionHash.digest('hex').slice(0, 12));
  insMeta.run('built_at', new Date().toISOString());
  db.exec('COMMIT');
  db.exec("INSERT INTO search(search) VALUES('optimize')");
  db.exec('VACUUM');
  db.close();
  report.ok = true;
  report.tmpFile = tmpFile;
  return report;
}
