// Baza treści otwarta tylko do odczytu, z możliwością podmiany na nowo zbudowaną
// (po zapisie w panelu administratora) bez restartu serwera.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { existsSync, renameSync, rmSync } from 'node:fs';
import type { CourseSummary, SearchHit } from '../src/data/types.ts';

export interface Blobs {
  hash: string;
  pack: Uint8Array;
  pack_gz: Uint8Array;
  pack_br: Uint8Array;
}

export interface CourseEntry extends Blobs {
  id: string;
  summary: CourseSummary;
}

export class ContentStore {
  readonly dbPath: string;
  private db!: DatabaseSync;
  courses = new Map<string, CourseEntry>();
  summaries: CourseSummary[] = [];
  meta: Record<string, string> = {};
  private stmts!: { unit: StatementSync; images: StatementSync; search: StatementSync };

  constructor(dbPath: string) {
    if (!existsSync(dbPath)) throw new Error(`Brak bazy treści ${dbPath} — uruchom "npm run content".`);
    this.dbPath = dbPath;
    this.open();
  }

  private open() {
    this.db = new DatabaseSync(this.dbPath, { readOnly: true });
    this.meta = Object.fromEntries(
      (this.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]),
    );
    this.courses = new Map();
    const rows = this.db.prepare('SELECT id, hash, summary, pack, pack_gz, pack_br FROM courses ORDER BY position').all() as unknown as (Blobs & {
      id: string;
      summary: string;
    })[];
    for (const row of rows) this.courses.set(row.id, { ...row, summary: JSON.parse(row.summary) as CourseSummary });
    this.summaries = [...this.courses.values()].map((c) => c.summary);
    this.stmts = {
      unit: this.db.prepare('SELECT data FROM units WHERE course = ? AND id = ?'),
      images: this.db.prepare('SELECT hash, pack, pack_gz, pack_br FROM images WHERE course = ?'),
      search: this.db.prepare(`
        SELECT kind, id, unit, t, n FROM search
        WHERE search MATCH ? AND course = ?
        ORDER BY rank LIMIT ?
      `),
    };
  }

  unit(course: string, id: string): string | undefined {
    return (this.stmts.unit.get(course, id) as { data: string } | undefined)?.data;
  }

  images(course: string): Blobs | undefined {
    return this.stmts.images.get(course) as unknown as Blobs | undefined;
  }

  search(match: string, course: string, limit: number): SearchHit[] {
    return this.stmts.search.all(match, course, limit) as unknown as SearchHit[];
  }

  /** Podmienia bazę na nowo zbudowany plik. Przy błędzie wraca do poprzedniej. */
  replace(tmpFile: string) {
    this.db.close();
    try {
      renameSync(tmpFile, this.dbPath);
    } catch (e) {
      rmSync(tmpFile, { force: true });
      this.open();
      throw e;
    }
    this.open();
  }

  close() {
    this.db.close();
  }
}
