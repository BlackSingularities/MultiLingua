// Wspólny model danych kursu. Ten sam plik importują: aplikacja (src/),
// serwer (server/) i kompilator treści (scripts/). Tylko typy — bez logiki,
// żeby Node mógł go wczytać przez --experimental-strip-types.

export interface LangInfo {
  /** Kod ISO 639-1, np. "it". */
  code: string;
  /** Nazwa w języku interfejsu (polskim), np. "włoski". */
  name: string;
  /** Nazwa własna języka, np. "italiano". */
  endonym: string;
  /** Tag BCP 47 dla syntezy i rozpoznawania mowy, np. "it-IT". */
  speech: string;
  flag: string;
}

export interface CourseRules {
  /** Zaimki osobowe, które język pozwala pominąć (włoski, hiszpański). */
  dropPronouns: string[];
  /** Etykiety osób w tabelach odmiany (6 pozycji). */
  persons: string[];
  /** Znaki specjalne pokazywane nad klawiaturą. */
  specialChars: string[];
  /** Rodzajniki do ćwiczeń z rodzajem: klucz = rodzaj gramatyczny lub forma. */
  articles: string[];
  /** Słowa, które w kafelkach traktujemy jako osobne tokeny po apostrofie (l', dell'). */
  elisions: string[];
}

export type PartOfSpeech =
  | 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'prep' | 'conj'
  | 'num' | 'interj' | 'phrase' | 'det';

export interface VocabItem {
  id: string;
  unit: string;
  /** Słowo w języku docelowym (bez rodzajnika). */
  t: string;
  /** Tłumaczenie na język ojczysty. */
  n: string;
  altT?: string[];
  altN?: string[];
  pos: PartOfSpeech;
  /** m, f, n, mf (rzeczowniki). */
  gender?: string;
  /** Rodzajnik określony, np. "il", "lo", "la", "l'". */
  article?: string;
  plural?: string;
  /** Odmienione formy występujące w zdaniach (pomagają łączyć słowa ze zdaniami). */
  forms?: string[];
  emoji?: string;
  note?: string;
  /** Przykładowe użycie. */
  ex?: { t: string; n: string };
}

export interface Sentence {
  id: string;
  unit: string;
  t: string;
  n: string;
  altT?: string[];
  altN?: string[];
  /** Słowo wycinane w ćwiczeniach z luką (musi występować w `t`). */
  gap?: string;
  /** Dystraktory dla luki — gdy brak, generowane automatycznie. */
  gapOptions?: string[];
  note?: string;
  /** Identyfikatory słówek, które zdanie utrwala (wyliczane przy kompilacji). */
  words?: string[];
}

export interface ChoiceQuestion {
  q: string;
  options: string[];
  answer: number;
  explain?: string;
}

export interface GrammarArticle {
  id: string;
  unit: string;
  title: string;
  summary: string;
  /** Uproszczony Markdown: akapity, **pogrubienie**, *kursywa*, listy, tabele, > wskazówki. */
  body: string;
  examples: { t: string; n: string; note?: string }[];
  check: ChoiceQuestion[];
}

export interface Conjugation {
  id: string;
  unit: string;
  verb: string;
  n: string;
  tense: string;
  tenseLabel: string;
  /** Sześć form w kolejności `rules.persons`. */
  forms: string[];
  irregular?: boolean;
  note?: string;
}

export interface StoryLine {
  speaker: string;
  t: string;
  n: string;
}

export interface Story {
  id: string;
  unit: string;
  title: string;
  intro: string;
  emoji: string;
  lines: StoryLine[];
  questions: ChoiceQuestion[];
}

export type LessonKind = 'learn' | 'grammar' | 'story' | 'speak' | 'test';

export interface Lesson {
  id: string;
  unit: string;
  kind: LessonKind;
  title: string;
  vocab: string[];
  sentences: string[];
  grammar?: string;
  story?: string;
  conjugations: string[];
}

export interface Unit {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  cefr: string;
  icon: string;
  goals: string[];
  lessons: Lesson[];
  vocab: VocabItem[];
  sentences: Sentence[];
  grammar: GrammarArticle[];
  conjugations: Conjugation[];
  stories: Story[];
}

export interface CourseSummary {
  id: string;
  title: string;
  tagline: string;
  description: string;
  target: LangInfo;
  native: LangInfo;
  levels: string;
  color: string;
  units: number;
  lessons: number;
  words: number;
  sentences: number;
  grammar: number;
  stories: number;
  /** Skrót treści — zmienia się przy każdej zmianie kursu. */
  hash: string;
  size: number;
}

export interface CoursePack extends Omit<CourseSummary, 'size'> {
  rules: CourseRules;
  builtAt: string;
  unitsData: Unit[];
}

export interface AppMeta {
  app: { version: string; apkUrl: string; iosUrl: string; releasesUrl: string; repoUrl: string };
  content: { version: string; builtAt: string };
}

export interface SearchHit {
  kind: 'vocab' | 'sentence' | 'grammar';
  id: string;
  unit: string;
  t: string;
  n: string;
}
