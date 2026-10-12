// Teoria przeplatana z ćwiczeniami: podział artykułów na kroki i kolejność w lekcjach.
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { checkSvg, compileCourse, listCourseDirs } from '../scripts/content-lib.ts';
import { CourseIndex } from '../src/engine/course.ts';
import { buildSession, mulberry32 } from '../src/engine/generator.ts';
import { splitArticle } from '../src/engine/theory.ts';
import type { GrammarArticle } from '../src/data/types.ts';

const root = resolve(import.meta.dirname, '..');
const dir = listCourseDirs(join(root, 'content', 'courses'))[0];
const index = new CourseIndex(compileCourse(dir).pack);

const ctx = (seed: number) => ({
  index,
  srs: new Map(),
  now: Date.UTC(2026, 5, 1),
  audio: false,
  mic: false,
  hard: false,
  skillWeights: {},
  unlockedUnits: new Set(index.units.map((u) => u.id)),
  rng: mulberry32(seed),
});

describe('teoria w krokach', () => {
  it('dzieli artykuł po nagłówkach i zbiera formy w języku kursu', () => {
    const article: GrammarArticle = {
      id: 'g-x', unit: 'u01', title: 'Test', summary: 's', check: [],
      body: 'Krótki wstęp.\n\n### Pierwszy\nForma *sono* i **sei**.\n\n### Drugi\nTeraz *siamo*.',
      examples: [{ t: 'Io sono Anna.', n: 'Jestem Anna.' }, { t: 'Noi siamo amici.', n: 'Jesteśmy przyjaciółmi.' }],
    };
    const steps = splitArticle(article, (w) => index.isTarget(w));
    expect(steps.map((s) => s.title)).toEqual(['Pierwszy', 'Drugi']);
    expect(steps[0].body).toContain('Krótki wstęp.');
    expect(steps[0].focus).toEqual(expect.arrayContaining(['sono', 'sei']));
    expect(steps[1].focus).toContain('siamo');
    expect(steps[0].examples.map((e) => e.t)).toEqual(['Io sono Anna.']);
    expect(steps[1].examples.map((e) => e.t)).toEqual(['Noi siamo amici.']);
  });

  it('lekcja teorii: każdy krok, a zaraz po nim ćwiczenia', () => {
    const grammarLessons = index.path.filter((l) => l.kind === 'grammar');
    expect(grammarLessons.length).toBeGreaterThan(0);
    for (const [i, lesson] of grammarLessons.entries()) {
      const list = buildSession({ kind: 'lesson', lessonId: lesson.id }, ctx(i + 1));
      expect(list[0].type, lesson.id).toBe('theory');
      const theory = list.filter((e) => e.type === 'theory');
      expect(theory.every((e) => e.type === 'theory' && e.step)).toBe(true);
      // Po każdym kroku (poza ewentualnie ostatnim) jest przynajmniej jedno ćwiczenie przed kolejnym krokiem.
      list.forEach((e, k) => {
        if (e.type === 'theory' && k + 1 < list.length) expect(list[k + 1].type, `${lesson.id} krok ${k}`).not.toBe('theory');
      });
      const practice = buildSession({ kind: 'lesson', lessonId: lesson.id, variant: 'practice' }, ctx(i + 1));
      expect(practice.some((e) => e.type === 'theory')).toBe(false);
      expect(practice.length).toBeGreaterThan(2);
    }
  });

  it('lekcja słówek wplata krótką wskazówkę teorii przed słowami, których dotyczy', () => {
    const withTips = index.path
      .filter((l) => l.kind === 'learn')
      .map((l, i) => buildSession({ kind: 'lesson', lessonId: l.id }, ctx(i + 7)))
      .filter((list) => list.some((e) => e.type === 'theory'));
    expect(withTips.length).toBeGreaterThan(0);
    for (const list of withTips) {
      const k = list.findIndex((e) => e.type === 'theory');
      const tip = list[k];
      expect(tip.type === 'theory' && tip.tip).toBe(true);
      // Zaraz po wskazówce przychodzi karta nowego słowa, o którym była mowa.
      expect(list[k + 1].type).toBe('intro');
    }
    const plain = buildSession({ kind: 'lesson', lessonId: index.path.find((l) => l.kind === 'learn')!.id, variant: 'practice' }, ctx(3));
    expect(plain.some((e) => e.type === 'theory')).toBe(false);
  });
});

describe('ilustracje SVG', () => {
  const ok = '<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="40" fill="#f90"/></svg>';

  it('przyjmuje czystą grafikę i dopisuje przestrzeń nazw', () => {
    const out = checkSvg('a.svg', `<?xml version="1.0"?>\n<!-- komentarz -->\n${ok}\n`);
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(out).not.toContain('komentarz');
  });

  it.each([
    ['skrypt', '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'],
    ['zdarzenie', '<svg viewBox="0 0 1 1"><rect onclick="x()"/></svg>'],
    ['zewnętrzny obraz', '<svg viewBox="0 0 1 1"><use href="https://evil.example/a.svg#x"/></svg>'],
    ['brak viewBox', '<svg width="10"><rect/></svg>'],
    ['nie SVG', '<html></html>'],
  ])('odrzuca: %s', (_name, svg) => {
    expect(() => checkSvg('x.svg', svg)).toThrow();
  });
});
