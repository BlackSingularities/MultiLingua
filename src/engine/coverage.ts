// Pokrycie materiału: co uczeń już widział w danym miejscu ścieżki.
// Zasada kursu: ćwiczenie albo pytanie może dotyczyć tylko tego, co było wcześniej
// pokazane — w kartach słówek albo w teorii (także w tej samej lekcji, krok wcześniej).
import type { ChoiceQuestion, GrammarArticle, Lesson, VocabItem } from '../data/types.ts';
import type { CourseIndex } from './course.ts';
import { stripAccents, tokenize } from './text.ts';

/** Wyrazy tekstu w języku kursu: małe litery, bez interpunkcji, z elizją jako osobnym tokenem. */
export function words(text: string): string[] {
  return tokenize(text)
    .map((w) => w.toLowerCase().replace(/^[-–]+|[-–]+$/g, ''))
    .filter((w) => /\p{L}/u.test(w));
}

/** Rdzeń do porównywania tematów (po polsku i w języku kursu): 5 pierwszych liter bez akcentów. */
function stems(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

const STOP = new Set([
  'jak', 'czy', 'jest', 'sie', 'nie', 'tak', 'to', 'ten', 'ta', 'te', 'ktore', 'ktory', 'ktora', 'jaka', 'jaki',
  'albo', 'oraz', 'dla', 'przy', 'mowimy', 'slowo', 'zdanie', 'forma', 'formy', 'znaczy', 'po', 'polsku', 'wlosku',
  'wybierz', 'uzupelnij', 'odpowiedz', 'odpowiadasz', 'poprawnie', 'brakujace', 'powiesz', 'powiedziec',
]);

export interface Placed<T> {
  item: T;
  /** Indeks kroku, po którym wolno o to zapytać; -1 = nigdy (materiał tego nie pokrywa). */
  step: number;
  missing: string[];
}

/** O czym jest pytanie: treść, poprawna odpowiedź i wyjaśnienie (błędne opcje tylko by myliły). */
export function questionTopic(q: ChoiceQuestion): string {
  return `${q.q} ${q.options[q.answer]} ${q.explain ?? ''}`;
}

export class Coverage {
  readonly ix: CourseIndex;
  private lexicon: Set<string>;
  private cache = new Map<string, Set<string>>();

  constructor(ix: CourseIndex) {
    this.ix = ix;
    this.lexicon = new Set<string>();
    for (const v of ix.vocab.values()) this.vocabWords(v).forEach((w) => this.lexicon.add(w));
    for (const s of ix.sentences.values()) [s.t, ...(s.altT ?? [])].forEach((t) => words(t).forEach((w) => this.lexicon.add(w)));
    for (const g of ix.grammar.values()) g.examples.forEach((e) => words(e.t).forEach((w) => this.lexicon.add(w)));
    for (const t of ix.tables.values()) t.forms.forEach((f) => words(f.replaceAll('|', ' ')).forEach((w) => this.lexicon.add(w)));
    for (const s of ix.stories.values()) s.lines.forEach((l) => words(l.t).forEach((w) => this.lexicon.add(w)));
    ix.rules.articles.forEach((a) => this.lexicon.add(a.toLowerCase()));
  }

  vocabWords(v: VocabItem): string[] {
    return [v.t, ...(v.forms ?? []), v.plural ?? '', ...(v.altT ?? []), v.article ?? ''].flatMap(words);
  }

  /** Wyrazy w języku kursu pokazane w tekście teorii (tabele, przykłady, wyróżnienia). */
  articleWords(text: string): Set<string> {
    return new Set(words(text.replace(/[|*>#]/g, ' ')).filter((w) => this.lexicon.has(w)));
  }

  /** Czy wyraz to imię albo nazwa — tych nie trzeba uczyć. */
  isName(w: string): boolean {
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    return this.ix.properTokens.has(cap) && !this.ix.lookup(w);
  }

  /** Wyrazy tekstu, których uczeń jeszcze nie widział. */
  missing(text: string, taught: Set<string>): string[] {
    return [...new Set(words(text).filter((w) => !taught.has(w) && !this.isName(w) && !/^\d+$/.test(w)))];
  }

  /**
   * Co uczeń widział PRZED rozpoczęciem lekcji (lekcja słówek dodaje swoje słowa —
   * karty nowych słów idą przed ćwiczeniami).
   */
  taughtAt(lesson: Lesson): Set<string> {
    const key = lesson.id;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const set = new Set<string>();
    for (const l of this.ix.path) {
      const isCurrent = l.id === lesson.id;
      if (l.kind === 'learn' || isCurrent) {
        for (const id of l.vocab) {
          const v = this.ix.vocab.get(id);
          if (v && (l.kind === 'learn' || isCurrent)) this.vocabWords(v).forEach((w) => set.add(w));
        }
      }
      if (!isCurrent && l.kind === 'grammar' && l.grammar) {
        const g = this.ix.grammar.get(l.grammar);
        if (g) this.articleWords(`${g.body}\n${g.examples.map((e) => e.t).join('\n')}`).forEach((w) => set.add(w));
      }
      if (!isCurrent && l.kind === 'story' && l.story) {
        this.ix.stories.get(l.story)?.lines.forEach((ln) => words(ln.t).forEach((w) => set.add(w)));
      }
      if (isCurrent) break;
    }
    this.cache.set(key, set);
    return set;
  }

  /** Tekst, o który pyta pytanie: poprawna odpowiedź (jeśli jest w języku kursu) i cytaty w języku kursu. */
  questionText(q: ChoiceQuestion): string {
    const parts: string[] = [];
    const isTarget = (t: string) => {
      const ws = words(t);
      return ws.length > 0 && ws.filter((w) => this.lexicon.has(w)).length / ws.length >= 0.6;
    };
    const right = q.options[q.answer];
    if (isTarget(right)) parts.push(right);
    for (const m of q.q.matchAll(/[„"«]([^”"»]+)[”"»]/g)) if (isTarget(m[1])) parts.push(m[1]);
    // Zdanie z luką w treści pytania („Tu ___ Luca?”) też jest w języku kursu.
    if (/_{2,}/.test(q.q)) parts.push(q.q.replace(/_{2,}/g, ' ').replace(/\([^)]*\)/g, ' '));
    return parts.join(' ');
  }

  /**
   * Przypina elementy (pytania, zdania) do kroków teorii: do kroku, którego dotyczą najbardziej,
   * ale nie wcześniej, niż uczeń zobaczy wszystkie potrzebne słowa.
   */
  place<T>(
    items: T[],
    textOf: (t: T) => string,
    topicOf: (t: T) => string,
    /** `cover` — co krok pokazuje (treść, tabele); `topic` — pełny tekst do porównania tematów. */
    steps: { cover: string; topic: string }[],
    before: Set<string>,
    /** Gdy nic nie pasuje tematem: 'last' — do ostatniego kroku, 'none' — pomiń. */
    fallback: 'last' | 'none',
  ): Placed<T>[] {
    const stepWords: Set<string>[] = [];
    const acc = new Set(before);
    for (const s of steps) {
      this.articleWords(s.cover).forEach((w) => acc.add(w));
      stepWords.push(new Set(acc));
    }
    const stepStems = steps.map((s) => new Set(stems(s.topic)));
    const df = new Map<string, number>();
    for (const st of stepStems) for (const x of st) df.set(x, (df.get(x) ?? 0) + 1);

    return items.map((item) => {
      const text = textOf(item);
      const topic = stems(topicOf(item));
      let best = -1;
      let bestScore = -1;
      let firstOk = -1;
      steps.forEach((_, i) => {
        if (this.missing(text, stepWords[i]).length) return;
        if (firstOk < 0) firstOk = i;
        const score = topic.reduce((sum, x) => sum + (stepStems[i].has(x) ? 1 / (df.get(x) ?? 1) : 0), 0);
        // Remis — późniejszy krok (pytanie po całym potrzebnym materiale).
        if (score >= bestScore && score > 0) {
          best = i;
          bestScore = score;
        }
      });
      const last = steps.length - 1;
      const step = best >= 0 ? best : fallback === 'last' && firstOk >= 0 ? last : -1;
      return { item, step, missing: firstOk < 0 ? this.missing(text, stepWords.at(-1) ?? before) : [] };
    });
  }
}

/** Krok teorii do przypinania pytań: co pokazuje (`cover`) i o czym jest (`topic`). */
export function stepText(title: string, body: string, examples: GrammarArticle['examples']): { cover: string; topic: string } {
  return { cover: body, topic: `${title}\n${body}\n${examples.map((e) => `${e.t} ${e.n}`).join('\n')}` };
}

/**
 * Lista miejsc, w których treść wychodzi poza pokazany materiał: pytania teorii bez
 * pokrycia, przykłady ze słowami spoza słownika i teorii, zdania z nieznanymi słowami.
 * Używają tego testy treści i walidacja w panelu administratora.
 */
export function coverageProblems(ix: CourseIndex, split: (g: GrammarArticle) => { title: string; body: string; examples: GrammarArticle['examples'] }[]): string[] {
  const cov = new Coverage(ix);
  const problems: string[] = [];
  for (const l of ix.path) {
    if (l.kind !== 'grammar' || !l.grammar) continue;
    const g = ix.grammar.get(l.grammar);
    if (!g) continue;
    const steps = split(g).map((s) => stepText(s.title, s.body, s.examples));
    const before = cov.taughtAt(l);
    for (const p of cov.place(g.check, (q) => cov.questionText(q), questionTopic, steps, before, 'last')) {
      if (p.step < 0) problems.push(`„${g.title}”: pytanie „${p.item.q}” używa słów spoza materiału: ${p.missing.join(', ')}`);
    }
    for (const p of cov.place(g.examples, (e) => e.t, (e) => e.t, steps, before, 'last')) {
      if (p.step < 0) problems.push(`„${g.title}”: przykład „${p.item.t}” używa słów spoza materiału: ${p.missing.join(', ')}`);
    }
  }
  for (const u of ix.units) {
    const last = u.lessons.at(-1);
    if (!last) continue;
    const taught = cov.taughtAt(last);
    for (const s of u.sentences) {
      const m = cov.missing(s.t, taught);
      if (m.length) problems.push(`Rozdział „${u.title}”: zdanie „${s.t}” ma słowa spoza słownika: ${m.join(', ')}`);
    }
  }
  return problems;
}
