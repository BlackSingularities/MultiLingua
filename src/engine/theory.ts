// Teoria w małych krokach. Artykuł gramatyczny dzielimy na części według
// nagłówków „### ”; każda część dostaje listę słów i form, o których mówi
// („fokus”). Po fokusie dobieramy zdania, przykłady, formy odmiany i pytania,
// które ćwiczy się zaraz po przeczytaniu tego kroku.
import type { ChoiceQuestion, Conjugation, GrammarArticle, Sentence } from '../data/types.ts';
import { tokenize } from './text.ts';

export interface TheoryStep {
  /** Indeks kroku w artykule (0…). */
  index: number;
  total: number;
  /** Tytuł kroku: nagłówek części albo tytuł artykułu dla wstępu. */
  title: string;
  /** Treść kroku (Markdown). */
  body: string;
  /** Słowa i formy w języku kursu, o których mówi ten krok (małe litery). */
  focus: string[];
  /** Przykłady z artykułu pasujące do kroku. */
  examples: GrammarArticle['examples'];
}

export interface StepMaterial {
  step: TheoryStep;
  sentences: Sentence[];
  /** Tabela + osoby, których formy pojawiają się w kroku. */
  forms: { table: Conjugation; person: number }[];
  questions: ChoiceQuestion[];
}

/** Wyróżnione fragmenty: **pogrubienie** i *kursywa* (kursywą piszemy słowa w języku kursu). */
function marked(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*/g)) out.push(m[1] ?? m[2]);
  return out;
}

function words(text: string): string[] {
  return tokenize(text)
    .map((w) => w.toLowerCase().replace(/^[-–]+|[-–]+$/g, ''))
    .filter((w) => w.length > 0 && /\p{L}/u.test(w));
}

/**
 * Dzieli artykuł na kroki. Wstęp przed pierwszym nagłówkiem jest osobnym krokiem,
 * chyba że jest bardzo krótki — wtedy dołączamy go do pierwszej części.
 */
export function splitArticle(article: GrammarArticle, isTargetWord: (w: string) => boolean): TheoryStep[] {
  const parts: { title: string; body: string }[] = [];
  let cur = { title: article.title, body: '' };
  for (const line of article.body.split('\n')) {
    if (line.startsWith('### ')) {
      parts.push(cur);
      cur = { title: line.slice(4).trim(), body: '' };
    } else cur.body += `${line}\n`;
  }
  parts.push(cur);
  const clean = parts.map((p) => ({ title: p.title, body: p.body.trim() })).filter((p) => p.body);
  if (clean.length > 1 && clean[0].title === article.title && clean[0].body.length < 160) {
    const [intro, first, ...rest] = clean;
    clean.splice(0, clean.length, { title: first.title, body: `${intro.body}\n\n${first.body}` }, ...rest);
  }

  const usedExamples = new Set<number>();
  const steps = clean.map((p, index) => {
    const focus = [...new Set(marked(p.body).flatMap(words).filter(isTargetWord))];
    const examples = article.examples.filter((e, i) => {
      if (usedExamples.has(i)) return false;
      const hit = words(e.t).some((w) => focus.includes(w));
      if (hit) usedExamples.add(i);
      return hit;
    });
    return { index, total: clean.length, title: p.title, body: p.body, focus, examples };
  });
  // Przykłady, które nie pasowały do żadnego kroku, trafiają do ostatniego.
  const rest = article.examples.filter((_, i) => !usedExamples.has(i));
  if (steps.length && rest.length) steps[steps.length - 1].examples.push(...rest);
  return steps;
}

/**
 * Materiał do ćwiczeń dla każdego kroku. Słowa obecne prawie wszędzie
 * (np. rodzajnik „il”) nie wystarczą, żeby przypiąć zdanie do kroku.
 */
export function stepMaterials(
  steps: TheoryStep[],
  pool: Sentence[],
  tables: Conjugation[],
  questions: ChoiceQuestion[],
): StepMaterial[] {
  const tokenized = pool.map((s) => ({ s, w: new Set(words(s.t)) }));
  const freq = new Map<string, number>();
  for (const { w } of tokenized) for (const x of w) freq.set(x, (freq.get(x) ?? 0) + 1);
  const common = (w: string) => (freq.get(w) ?? 0) > Math.max(3, pool.length * 0.35);

  const usedSentences = new Set<string>();
  const usedQuestions = new Set<number>();
  const out = steps.map((step) => {
    const strong = step.focus.filter((f) => !common(f));
    const keys = strong.length ? strong : step.focus;
    const sentences = tokenized
      .filter(({ s, w }) => !usedSentences.has(s.id) && keys.some((k) => w.has(k)))
      .map(({ s }) => s)
      .slice(0, 4);
    sentences.forEach((s) => usedSentences.add(s.id));

    const forms: StepMaterial['forms'] = [];
    for (const table of tables) {
      table.forms.forEach((f, person) => {
        const variants = f.split('|').flatMap((x) => words(x));
        if (variants.some((v) => step.focus.includes(v))) forms.push({ table, person });
      });
    }

    const qs: ChoiceQuestion[] = [];
    questions.forEach((q, i) => {
      if (usedQuestions.has(i)) return;
      const qWords = new Set([...words(q.q), ...q.options.flatMap(words)]);
      if (keys.some((k) => qWords.has(k))) {
        usedQuestions.add(i);
        qs.push(q);
      }
    });
    return { step, sentences, forms, questions: qs };
  });
  // Pytania bez dopasowania — do ostatniego kroku (podsumowanie).
  const leftover = questions.filter((_, i) => !usedQuestions.has(i));
  if (out.length && leftover.length) out[out.length - 1].questions.push(...leftover);
  return out;
}
