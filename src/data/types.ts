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
  /**
   * Klucz ilustracji SVG (nazwa pliku w content/courses/<kurs>/images/ bez .svg).
   * Ustawiany przez kompilator tylko wtedy, gdy plik istnieje.
   */
  img?: string;
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
  /** Ilustracje słówek: liczba i skrót paczki (pusty, gdy kurs nie ma obrazków). */
  images: { count: number; hash: string };
  /** Kompendium czasowników: liczba i skrót paczki (pusty, gdy kurs go nie ma). */
  verbs?: { count: number; hash: string };
}

export interface CoursePack extends Omit<CourseSummary, 'size'> {
  rules: CourseRules;
  /** Spis czasowników z kompendium (pełne odmiany w osobnej paczce). */
  verbIndex?: VerbSummary[];
  /** Głosy lektorów historyjek ustawione w panelu administratora. */
  voices?: CourseVoices;
  builtAt: string;
  unitsData: Unit[];
}

/** Paczka ilustracji kursu: klucz → kod SVG. Pobierana osobno od treści. */
export interface ImagePack {
  course: string;
  hash: string;
  images: Record<string, string>;
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

// ——— kompendium czasowników ———

/** Układ trybów i czasów dla języka kursu (z course.yaml, sekcja `conjugation`). */
export interface VerbTenseLayout {
  id: string;
  /** Nazwa w języku docelowym, np. „Passato prossimo”. */
  label: string;
  /** Nazwa po polsku, np. „czas przeszły złożony”. */
  pl: string;
  /** Krótko: kiedy się tego używa i jak się to tworzy. */
  use?: string;
  /** Etykiety wierszy (osoby albo np. presente/passato w formach nieosobowych). */
  persons: string[];
  /** Czas złożony: czasownik posiłkowy odmieniany w tym trybie i czasie. */
  aux?: { mood: string; tense: string };
}

export interface VerbMoodLayout {
  id: string;
  label: string;
  pl: string;
  /** Kolor zakładki (hex). */
  color: string;
  tenses: VerbTenseLayout[];
}

export interface VerbLayout {
  /** Etykieta osoby → polski odpowiednik (io → ja). */
  personsPl: Record<string, string>;
  moods: VerbMoodLayout[];
}

/** Jeden wiersz tabeli: forma, jej tłumaczenie i przykład w obu językach. */
export interface VerbForm {
  /** Forma; warianty rodzaju po ukośniku: „sono andato/andata”. */
  f: string;
  n: string;
  ex?: { t: string; n: string };
}

/** Hasło dodatkowe: kolokacja, idiom, słowo pokrewne, synonim. */
export interface VerbExtra {
  t: string;
  n: string;
  note?: string;
  ex?: { t: string; n: string };
}

export interface VerbExtraGroup {
  /** Podtytuł grupy, np. „z rzeczownikami” (pusty, gdy jedna grupa). */
  label: string;
  items: VerbExtra[];
}

export interface VerbEntry {
  /** Identyfikator = bezokolicznik bez znaków spoza a–z, np. "andare". */
  id: string;
  verb: string;
  n: string;
  emoji: string;
  category: string;
  regular: boolean;
  /** Np. „I koniugacja (-are)”. */
  group: string;
  /** Czasownik posiłkowy w czasach złożonych, np. „essere”, „avere/essere”. */
  auxiliary: string;
  transitive: string;
  reflexive?: string;
  ipa?: string;
  stress?: string;
  note?: string;
  /** Jednostka kursu, w której czasownik się pojawia (gdy jest w słownictwie). */
  unit?: string;
  /** forms[mood][tense] = wiersze w kolejności osób z układu. */
  forms: Record<string, Record<string, VerbForm[]>>;
  /** Sekcje dodatkowe: kolokacje, idiomy, zwroty, słowa pokrewne, synonimy. */
  extras: { id: string; title: string; groups: VerbExtraGroup[] }[];
}

/** Lekki spis czasowników w paczce kursu (pełne tabele pobierane osobno). */
export interface VerbSummary {
  id: string;
  verb: string;
  n: string;
  emoji: string;
  category: string;
  regular: boolean;
  auxiliary: string;
  unit?: string;
}

export interface VerbPack {
  course: string;
  hash: string;
  layout: VerbLayout;
  verbs: VerbEntry[];
}

// ——— głosy lektorów ———

export type VoiceGender = 'f' | 'm';

/** Głos wybrany przez administratora (nazwa z przeglądarki albo systemu). */
export interface VoiceChoice {
  name: string;
  gender: VoiceGender;
}

export interface CourseVoices {
  /** Głosy w kolejności pierwszeństwa; urządzenie użyje tych, które ma. */
  voices: VoiceChoice[];
  /** Płeć mówiących w historyjkach (imię → f/m); brak = zgadujemy po imieniu. */
  speakers: Record<string, VoiceGender>;
  /** Konkretny głos dla mówiącego w danej historyjce: id historyjki → imię → nazwa głosu. */
  stories: Record<string, Record<string, string>>;
}
