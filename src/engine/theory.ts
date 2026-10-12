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

  const steps = clean.map((p, index) => ({
    index,
    total: clean.length,
    title: p.title,
    body: p.body,
    focus: [...new Set(marked(p.body).flatMap(words).filter(isTargetWord))],
    examples: [] as GrammarArticle['examples'],
  }));
  // Przykład trafia do kroku, z którym ma najwięcej wspólnych form (remis — późniejszy krok,
  // bo wtedy uczeń zna już wszystko z wcześniejszych); bez dopasowania — do ostatniego.
  for (const e of article.examples) {
    const ws = new Set(words(e.t));
    let best = steps.length - 1;
    let bestScore = 0;
    steps.forEach((s, i) => {
      const score = s.focus.filter((f) => ws.has(f)).length;
      if (score > 0 && score >= bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (steps[best]) steps[best].examples.push(e);
  }
  return steps;
}
