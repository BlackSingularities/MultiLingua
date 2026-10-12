// Zasada kursu: pytania i ćwiczenia dotyczą tylko tego, co uczeń już widział —
// w kartach słówek albo w teorii (także krok wcześniej w tej samej lekcji).
// Ten test pilnuje treści (także rozdziałów dodanych w panelu) i generatora.
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { compileCourse, listCourseDirs } from '../scripts/content-lib.ts';
import { CourseIndex } from '../src/engine/course.ts';
import { Coverage, coverageProblems, questionTopic, stepText } from '../src/engine/coverage.ts';
import { buildSession, mulberry32 } from '../src/engine/generator.ts';
import { splitArticle } from '../src/engine/theory.ts';
import type { Exercise } from '../src/engine/types.ts';

const root = resolve(import.meta.dirname, '..');

const ctx = (index: CourseIndex, seed: number) => ({
  index,
  srs: new Map(),
  now: Date.UTC(2026, 5, 1),
  audio: true,
  mic: false,
  hard: false,
  skillWeights: {},
  unlockedUnits: new Set(index.units.map((u) => u.id)),
  rng: mulberry32(seed),
});

/** Tekst w języku kursu, którego ćwiczenie wymaga od ucznia. */
function targetText(ex: Exercise): string {
  switch (ex.type) {
    case 'tiles':
    case 'write':
      return ex.promptSide === 'n' ? ex.answers[0] : ex.prompt;
    case 'cloze':
      return ex.full;
    case 'errorspot':
      return ex.full;
    case 'judge':
      return ex.text;
    case 'listen':
    case 'dictation':
      return ex.type === 'listen' ? ex.options[ex.answer] : ex.answers[0];
    default:
      return '';
  }
}

describe.each(listCourseDirs(join(root, 'content', 'courses')))('pokrycie materiału: %s', (dir) => {
  const index = new CourseIndex(compileCourse(dir).pack);
  const cov = new Coverage(index);

  it('każde pytanie teorii ma swój krok i używa tylko pokazanych słów', () => {
    const problems: string[] = [];
    for (const l of index.path.filter((x) => x.kind === 'grammar')) {
      const g = index.grammar.get(l.grammar!)!;
      const steps = splitArticle(g, (w) => index.isTarget(w)).map((s) => stepText(s.title, s.body, s.examples));
      for (const p of cov.place(g.check, (q) => cov.questionText(q), questionTopic, steps, cov.taughtAt(l), 'last')) {
        if (p.step < 0) problems.push(`${g.id}: „${p.item.q}” — brak w materiale: ${p.missing.join(', ')}`);
      }
      for (const p of cov.place(g.examples, (e) => e.t, (e) => e.t, steps, cov.taughtAt(l), 'last')) {
        if (p.step < 0) problems.push(`${g.id}: przykład „${p.item.t}” — brak w materiale: ${p.missing.join(', ')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('historyjki, przykłady na kartach słów i cała treść mieszczą się w materiale', () => {
    expect(coverageProblems(index, (g) => splitArticle(g, (w) => index.isTarget(w)))).toEqual([]);
  });

  it('każde zdanie jednostki da się zbudować ze słów jednostki i wcześniejszych', () => {
    const problems: string[] = [];
    for (const u of index.units) {
      const taught = cov.taughtAt(u.lessons.at(-1)!);
      for (const s of u.sentences) {
        const m = cov.missing(s.t, taught);
        if (m.length) problems.push(`${u.id}: „${s.t}” — brak: ${m.join(', ')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('teoria na ścieżce idzie po lekcji słówek, która wprowadza jej słowa (rytm słówka → teoria)', () => {
    for (const u of index.units) {
      const kinds = u.lessons.map((l) => l.kind);
      expect(kinds[0], u.id).toBe('learn');
      // Żadne dwie lekcje teorii z rzędu na samym końcu jednostki, gdy są jeszcze lekcje słówek do przeplecenia.
      const firstGrammar = kinds.indexOf('grammar');
      if (firstGrammar >= 0) expect(firstGrammar, u.id).toBeLessThanOrEqual(2);
    }
  });

  it('lekcje: ćwiczenia ze zdań używają tylko słów pokazanych wcześniej', () => {
    const problems: string[] = [];
    index.path.forEach((lesson, i) => {
      if (lesson.kind !== 'learn' && lesson.kind !== 'grammar') return;
      const taught = new Set(cov.taughtAt(lesson));
      const list = buildSession({ kind: 'lesson', lessonId: lesson.id }, ctx(index, i + 3));
      for (const ex of list) {
        if (ex.type === 'theory') cov.articleWords(ex.step?.body ?? ex.article.body).forEach((w) => taught.add(w));
        // Powtórki z wcześniejszych lekcji są z definicji znane.
        if (ex.item && !lesson.vocab.includes(ex.item.id) && !lesson.sentences.includes(ex.item.id) && ex.type !== 'cloze' && ex.type !== 'errorspot') continue;
        const text = targetText(ex);
        const m = text ? cov.missing(text, taught) : [];
        if (m.length) problems.push(`${lesson.id} ${ex.type}: „${text}” — brak: ${m.join(', ')}`);
      }
    });
    expect(problems).toEqual([]);
  });
});

describe('pytanie trafia za krok, którego dotyczy', () => {
  const index = new CourseIndex(compileCourse(join(root, 'content', 'courses', 'pl-it')).pack);
  it('pytanie o formę grzecznościową dopiero po kroku o formie grzecznościowej', () => {
    const lesson = index.path.find((l) => l.grammar === 'g-it-essere')!;
    for (let seed = 1; seed <= 5; seed++) {
      const list = buildSession({ kind: 'lesson', lessonId: lesson.id }, ctx(index, seed));
      const q = list.findIndex((e) => e.type === 'question' && /grzecznie/.test(e.question.q));
      const theory = list.findIndex((e) => e.type === 'theory' && /grzecznościow/i.test(`${e.step?.title} ${e.step?.body}`));
      expect(q, 'pytanie jest w lekcji').toBeGreaterThan(0);
      expect(theory, 'krok o formie grzecznościowej').toBeGreaterThanOrEqual(0);
      expect(q).toBeGreaterThan(theory);
    }
  });
});
