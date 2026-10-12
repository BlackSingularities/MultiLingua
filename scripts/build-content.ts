// Buduje data/content.db — jedyne źródło treści dla serwera (web i aplikacje mobilne).
// Uruchomienie: npm run content
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileCourse, listCourseDirs, ContentError } from './content-lib.ts';
import type { CourseSummary } from '../src/data/types.ts';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'data');
const outFile = join(outDir, 'content.db');
const tmpFile = join(outDir, `content.${process.pid}.tmp.db`);

mkdirSync(outDir, { recursive: true });
if (existsSync(tmpFile)) rmSync(tmpFile);

const db = new DatabaseSync(tmpFile);
db.exec(`
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
`);

const insCourse = db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?)');
const insUnit = db.prepare('INSERT INTO units VALUES (?, ?, ?, ?, ?)');
const insVocab = db.prepare('INSERT INTO vocab VALUES (?, ?, ?, ?, ?, ?)');
const insSentence = db.prepare('INSERT INTO sentences VALUES (?, ?, ?, ?, ?)');
const insGrammar = db.prepare('INSERT INTO grammar VALUES (?, ?, ?, ?, ?, ?)');
const insSearch = db.prepare('INSERT INTO search VALUES (?, ?, ?, ?, ?, ?)');

const dirs = listCourseDirs(join(root, 'content', 'courses'));
const versionHash = createHash('sha256');
let failed = false;

db.exec('BEGIN');
dirs.forEach((dir, position) => {
  let compiled;
  try {
    compiled = compileCourse(dir);
  } catch (e) {
    if (e instanceof ContentError) {
      console.error(`✗ ${e.message}`);
      failed = true;
      return;
    }
    throw e;
  }
  const { pack, json } = compiled;
  const raw = Buffer.from(json, 'utf8');
  const gz = gzipSync(raw, { level: 9 });
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const { unitsData: _units, rules: _rules, builtAt: _b, ...rest } = pack;
  const summary: CourseSummary = { ...rest, size: gz.length };
  insCourse.run(pack.id, position, pack.hash, JSON.stringify(summary), raw, gz, br);
  versionHash.update(pack.hash);

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
  console.log(
    `✓ ${pack.id}: ${pack.units} jedn., ${pack.lessons} lekcji, ${pack.words} słówek, ${pack.sentences} zdań, ` +
      `${pack.grammar} tematów gramatyki, ${pack.stories} historyjek — ${(gz.length / 1024).toFixed(1)} KiB gzip`,
  );
});

if (failed) {
  db.exec('ROLLBACK');
  db.close();
  rmSync(tmpFile, { force: true });
  console.error('Kompilacja treści przerwana — popraw błędy powyżej.');
  process.exit(1);
}

const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
insMeta.run('content_version', versionHash.digest('hex').slice(0, 12));
insMeta.run('built_at', new Date().toISOString());
db.exec('COMMIT');
db.exec("INSERT INTO search(search) VALUES('optimize')");
db.exec('VACUUM');
db.close();
renameSync(tmpFile, outFile);
console.log(`Zapisano ${outFile}`);
