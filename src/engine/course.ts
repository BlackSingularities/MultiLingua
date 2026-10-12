import type {
  Conjugation, CoursePack, GrammarArticle, Lesson, Sentence, Story, Unit, VocabItem,
} from '../data/types.ts';

/** Indeks paczki kursu: szybkie wyszukiwanie po identyfikatorach i kolejność lekcji. */
export class CourseIndex {
  readonly pack: CoursePack;
  readonly units: Unit[];
  readonly vocab = new Map<string, VocabItem>();
  readonly sentences = new Map<string, Sentence>();
  readonly grammar = new Map<string, GrammarArticle>();
  readonly tables = new Map<string, Conjugation>();
  readonly stories = new Map<string, Story>();
  readonly lessons = new Map<string, Lesson>();
  readonly unitById = new Map<string, Unit>();
  /** Wszystkie lekcje w kolejności ścieżki. */
  readonly path: Lesson[] = [];
  /** Słowa, które w zdaniach pisane są wielką literą także w środku (imiona, nazwy). */
  readonly properTokens = new Set<string>();
  /** Forma odmiany → tabele, w których występuje (do ćwiczeń „znajdź błąd”). */
  readonly formIndex = new Map<string, { table: Conjugation; person: number }[]>();

  constructor(pack: CoursePack) {
    this.pack = pack;
    this.units = pack.unitsData;
    for (const u of this.units) {
      this.unitById.set(u.id, u);
      u.vocab.forEach((v) => this.vocab.set(v.id, v));
      u.sentences.forEach((s) => this.sentences.set(s.id, s));
      u.grammar.forEach((g) => this.grammar.set(g.id, g));
      u.conjugations.forEach((c) => this.tables.set(c.id, c));
      u.stories.forEach((s) => this.stories.set(s.id, s));
      u.lessons.forEach((l) => {
        this.lessons.set(l.id, l);
        this.path.push(l);
      });
    }
    for (const s of this.sentences.values()) {
      for (const text of [s.t, s.n]) {
        const words = text.split(/\s+/);
        words.forEach((w, i) => {
          // Wielka litera po kropce, myślniku czy wykrzykniku to początek zdania, nie nazwa.
          if (i === 0 || /[.!?…—–:"«]$/.test(words[i - 1])) return;
          const clean = w.replace(/[^\p{L}']/gu, '');
          if (/^\p{Lu}/u.test(clean)) this.properTokens.add(clean);
        });
      }
    }
    if (pack.target.code === 'en') this.properTokens.add('I');
    for (const table of this.tables.values()) {
      table.forms.forEach((f, person) => {
        const key = f.toLowerCase();
        if (key.includes(' ') || key.includes('|')) return;
        const list = this.formIndex.get(key) ?? [];
        list.push({ table, person });
        this.formIndex.set(key, list);
      });
    }
  }

  get id(): string {
    return this.pack.id;
  }

  get rules() {
    return this.pack.rules;
  }

  get speechTarget(): string {
    return this.pack.target.speech;
  }

  lessonPosition(id: string): number {
    return this.path.findIndex((l) => l.id === id);
  }

  unitOfLesson(id: string): Unit | undefined {
    const l = this.lessons.get(id);
    return l ? this.unitById.get(l.unit) : undefined;
  }

  /** Zmniejsza pierwszą literę, chyba że to imię/nazwa — żeby kafelki nie zdradzały początku zdania. */
  tileCase(token: string): string {
    if (this.properTokens.has(token)) return token;
    return token.charAt(0).toLocaleLowerCase(this.pack.target.code) + token.slice(1);
  }

  private targetWords?: Set<string>;

  /** Czy wyraz należy do materiału w języku kursu (słówka, formy, zdania, przykłady). */
  isTarget(word: string): boolean {
    if (!this.targetWords) {
      const set = new Set<string>();
      const add = (text: string) => {
        for (const w of text.toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}']+/u)) if (w) set.add(w.replace(/^'+|'+$/g, '') || w);
      };
      for (const v of this.vocab.values()) [v.t, ...(v.forms ?? []), v.plural ?? '', ...(v.altT ?? []), v.article ?? ''].forEach(add);
      for (const s of this.sentences.values()) [s.t, ...(s.altT ?? [])].forEach(add);
      for (const g of this.grammar.values()) g.examples.forEach((e) => add(e.t));
      for (const t of this.tables.values()) t.forms.forEach((f) => add(f.replaceAll('|', ' ')));
      this.rules.articles.forEach(add);
      this.targetWords = set;
    }
    const w = word.toLowerCase();
    // Imiona i nazwy (Marco, Roma) nie są materiałem do ćwiczenia.
    const capital = w.charAt(0).toUpperCase() + w.slice(1);
    if (this.properTokens.has(capital) && !this.lookup(w)) return false;
    return this.targetWords.has(w);
  }

  private wordMap?: Map<string, VocabItem>;

  /** Słówko dla pojedynczego wyrazu z tekstu (także form odmienionych i liczby mnogiej). */
  lookup(token: string): VocabItem | undefined {
    if (!this.wordMap) {
      this.wordMap = new Map();
      for (const v of this.vocab.values()) {
        for (const f of [v.t, ...(v.forms ?? []), ...(v.plural ? [v.plural] : []), ...(v.altT ?? [])]) {
          const k = f.toLowerCase();
          if (!this.wordMap.has(k)) this.wordMap.set(k, v);
        }
      }
    }
    const clean = token.toLowerCase().replace(/[^\p{L}']/gu, '');
    return this.wordMap.get(clean) ?? this.wordMap.get(clean.replace(/^\p{L}+'/u, ''));
  }

  /** Rodzajnik + rzeczownik do wyświetlenia (z elizją: l'amico). */
  withArticle(v: VocabItem): string {
    if (!v.article) return v.t;
    return v.article.endsWith("'") ? `${v.article}${v.t}` : `${v.article} ${v.t}`;
  }
}
