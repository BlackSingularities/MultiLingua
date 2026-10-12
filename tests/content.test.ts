// Kompiluje wszystkie kursy i sprawdza, że dla każdej lekcji i każdego trybu
// treningu generator tworzy sensowne, kompletne ćwiczenia.
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { compileCourse, listCourseDirs } from '../scripts/content-lib.ts';
import { CourseIndex } from '../src/engine/course.ts';
import { buildSession, mulberry32, type GenContext } from '../src/engine/generator.ts';
import { review, type SrsState } from '../src/engine/srs.ts';
import { checkAnswer, tokenize } from '../src/engine/text.ts';
import type { Exercise, SessionMode } from '../src/engine/types.ts';

const root = resolve(import.meta.dirname, '..');
const dirs = listCourseDirs(join(root, 'content', 'courses'));

function ctx(index: CourseIndex, srs: Map<string, SrsState>, seed: number, extra: Partial<GenContext> = {}): GenContext {
  return {
    index,
    srs,
    now: Date.UTC(2026, 5, 1),
    audio: true,
    mic: true,
    hard: false,
    skillWeights: {},
    unlockedUnits: new Set(index.units.map((u) => u.id)),
    rng: mulberry32(seed),
    ...extra,
  };
}

/** Sprawdza, że ćwiczenie ma rozwiązanie, które przechodzi własną walidację. */
function assertSolvable(ex: Exercise, index: CourseIndex) {
  switch (ex.type) {
    case 'choice':
    case 'listen':
    case 'article':
      expect(ex.options.length).toBeGreaterThanOrEqual(2);
      expect(ex.answer).toBeGreaterThanOrEqual(0);
      expect(new Set(ex.options).size).toBe(ex.options.length);
      break;
    case 'picture':
      expect(ex.options[ex.answer]).toBeDefined();
      break;
    case 'tiles': {
      // Kafelki muszą dać się ułożyć w pierwszą odpowiedź.
      const pool = [...ex.tiles.map((t) => t.toLowerCase())];
      for (const w of tokenize(ex.answers[0])) {
        const i = pool.indexOf(w.toLowerCase());
        expect(i, `brak kafelka „${w}” dla „${ex.answers[0]}”`).toBeGreaterThanOrEqual(0);
        pool.splice(i, 1);
      }
      break;
    }
    case 'write':
    case 'dictation':
    case 'number':
      expect(ex.answers.length).toBeGreaterThan(0);
      expect(checkAnswer(ex.answers[0], ex.answers, { dropPronouns: index.rules.dropPronouns }).ok).toBe(true);
      break;
    case 'cloze':
      expect(`${ex.before}${ex.answers[0]}${ex.after}`).toBe(ex.full);
      if (ex.options) expect(ex.options).toContain(ex.answers[0]);
      break;
    case 'conjugate':
      expect(ex.table.forms[ex.person]).toBe(ex.answers[0]);
      break;
    case 'errorspot':
      expect(ex.tokens[ex.wrong].toLowerCase()).not.toBe(ex.fix.toLowerCase());
      break;
    case 'spell':
      expect([...ex.letters].sort().join('')).toBe([...ex.answer].sort().join(''));
      break;
    case 'pairs':
      expect(ex.pairs.length).toBeGreaterThanOrEqual(3);
      break;
    case 'reorder':
      expect([...ex.order].sort()).toEqual([0, 1, 2, 3]);
      break;
    default:
      break;
  }
}

describe.each(dirs)('kurs %s', (dir) => {
  const { pack } = compileCourse(dir);
  const index = new CourseIndex(pack);

  it('ma kompletne jednostki', () => {
    expect(pack.unitsData.length).toBeGreaterThan(0);
    for (const u of pack.unitsData) {
      expect(u.lessons.some((l) => l.kind === 'learn')).toBe(true);
      expect(u.lessons.at(-1)?.kind).toBe('test');
      for (const l of u.lessons.filter((x) => x.kind === 'learn')) expect(l.vocab.length).toBeGreaterThan(0);
    }
  });

  it('każde zdanie z luką ma tę lukę w treści', () => {
    for (const s of index.sentences.values()) {
      if (s.gap) expect(s.t.toLowerCase()).toContain(s.gap.toLowerCase());
    }
  });

  it('pytania w teorii i historyjkach mają poprawne indeksy odpowiedzi', () => {
    for (const g of index.grammar.values()) for (const q of g.check) expect(q.options[q.answer]).toBeDefined();
    for (const s of index.stories.values()) for (const q of s.questions) expect(q.options[q.answer]).toBeDefined();
  });

  it('generuje rozwiązywalne ćwiczenia dla każdej lekcji (nowy i zaawansowany uczeń)', () => {
    // Uczeń zaawansowany: wszystko widziane kilka razy.
    const advanced = new Map<string, SrsState>();
    const t0 = Date.UTC(2026, 0, 1);
    for (const v of index.vocab.values()) {
      let s = review(undefined, { course: pack.id, item: v.id, kind: 'v' }, 3, t0);
      for (let i = 0; i < 4; i++) s = review(s, { course: pack.id, item: v.id, kind: 'v' }, 3, s.due);
      advanced.set(v.id, s);
    }
    for (const [i, lesson] of index.path.entries()) {
      for (const srs of [new Map<string, SrsState>(), advanced]) {
        const list = buildSession({ kind: 'lesson', lessonId: lesson.id }, ctx(index, srs, i + 1));
        expect(list.length, `lekcja ${lesson.id}`).toBeGreaterThan(lesson.kind === 'story' ? 2 : 4);
        list.forEach((ex) => assertSolvable(ex, index));
      }
    }
  });

  it('tryby treningowe działają także bez dźwięku i mikrofonu', () => {
    const srs = new Map<string, SrsState>();
    const t0 = Date.UTC(2026, 0, 1);
    for (const s of index.sentences.values()) srs.set(s.id, review(undefined, { course: pack.id, item: s.id, kind: 's' }, 2, t0));
    for (const v of index.vocab.values()) srs.set(v.id, review(undefined, { course: pack.id, item: v.id, kind: 'v' }, 2, t0));
    const modes: SessionMode[] = [
      { kind: 'review' }, { kind: 'speaking' }, { kind: 'listening' }, { kind: 'conjugation' },
      { kind: 'numbers' }, { kind: 'speed' }, { kind: 'unit', unitId: pack.unitsData[0].id },
      { kind: 'skip', unitId: pack.unitsData.at(-1)!.id },
      { kind: 'mistakes' },
    ];
    for (const [i, mode] of modes.entries()) {
      for (const audio of [true, false]) {
        const list = buildSession(mode, ctx(index, srs, 100 + i, {
          audio, mic: audio, mistakes: [...index.vocab.keys()].slice(0, 5).map((item) => ({ item, kind: 'v' as const })),
        }));
        if (!audio) expect(list.some((e) => e.needs === 'audio')).toBe(false);
        if (mode.kind !== 'listening' || audio) expect(list.length, mode.kind).toBeGreaterThan(0);
        list.forEach((ex) => assertSolvable(ex, index));
      }
    }
  });
});
