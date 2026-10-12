// Generator sesji: z treści kursu i stanu pamięci użytkownika układa listę ćwiczeń.
// Zasada: im lepiej znasz element, tym trudniejsza forma ćwiczenia
// (rozpoznawanie → rozumienie → samodzielna produkcja), a słabsze umiejętności
// dostają więcej ćwiczeń.
import type { Conjugation, GrammarArticle, Lesson, Sentence, VocabItem } from '../data/types.ts';
import type { CourseIndex } from './course.ts';
import { numberAnswers, numberToWords, supportsNumbers } from './numbers.ts';
import { stage as stageOf, strength, type SrsState } from './srs.ts';
import { normalize, tokenize } from './text.ts';
import type { Exercise, LessonVariant, SessionMode, Skill } from './types.ts';
import { splitArticle, type StepMaterial, type TheoryStep } from './theory.ts';
import { Coverage, questionTopic, stepText } from './coverage.ts';

export interface GenContext {
  index: CourseIndex;
  /** Stan SRS według identyfikatora elementu. */
  srs: Map<string, SrsState>;
  now: number;
  /** Synteza mowy dostępna i włączona. */
  audio: boolean;
  /** Rozpoznawanie mowy dostępne i włączone. */
  mic: boolean;
  /** Tryb trudny: więcej pisania, mniej wyboru. */
  hard: boolean;
  /** Waga >1 = umiejętność słabsza, ćwiczymy częściej. */
  skillWeights: Partial<Record<Skill, number>>;
  /** Jednostki odblokowane (do powtórek i trenażerów). */
  unlockedUnits: Set<string>;
  mistakes?: { item: string; kind: 'v' | 's' | 'c' }[];
  rng?: () => number;
}

type Rng = () => number;
type Maker = { skill: Skill; w?: number; make: () => Exercise | null };

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: readonly T[], k: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, k);
}

const coverageCache = new WeakMap<CourseIndex, Coverage>();

class Gen {
  readonly ctx: GenContext;
  readonly ix: CourseIndex;
  readonly rng: Rng;
  readonly allVocab: VocabItem[];
  readonly allSentences: Sentence[];
  /**
   * Słowa, które uczeń już widział w tym miejscu ścieżki (ustawiane w lekcjach).
   * Dystraktory i kafelki wybieramy wtedy spośród nich — nic obcego w odpowiedziach.
   */
  taught: Set<string> | null = null;

  constructor(ctx: GenContext) {
    this.ctx = ctx;
    this.ix = ctx.index;
    this.rng = ctx.rng ?? Math.random;
    this.allVocab = [...this.ix.vocab.values()];
    this.allSentences = [...this.ix.sentences.values()];
  }

  get coverage(): Coverage {
    let c = coverageCache.get(this.ix);
    if (!c) coverageCache.set(this.ix, (c = new Coverage(this.ix)));
    return c;
  }

  /** Czy uczeń widział już wszystkie słowa tekstu (gdy nie wiemy, co widział — tak). */
  known(text: string): boolean {
    return !this.taught || this.coverage.missing(text, this.taught).length === 0;
  }

  st(id: string) {
    return stageOf(this.ctx.srs.get(id), this.ctx.now);
  }

  /** Wybór ważony: waga ćwiczenia × waga umiejętności. */
  pickMaker(makers: Maker[]): Exercise | null {
    const pool = makers.filter((m) => (m.w ?? 1) > 0);
    while (pool.length) {
      const weights = pool.map((m) => (m.w ?? 1) * (this.ctx.skillWeights[m.skill] ?? 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.rng() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= weights[i];
        if (r <= 0) break;
      }
      const ex = pool[i].make();
      if (ex) return ex;
      pool.splice(i, 1);
    }
    return null;
  }

  // ——— dystraktory ———

  vocabDistractors(v: VocabItem, k: number, needArt = false): VocabItem[] {
    const seen = new Set([normalize(v.n), normalize(v.t)]);
    const unitIdx = this.ix.unitById.get(v.unit)?.index ?? 0;
    const all = this.allVocab.filter((x) => {
      if (x.id === v.id || (needArt && !hasArt(x))) return false;
      return !seen.has(normalize(x.n)) && !seen.has(normalize(x.t));
    });
    // W lekcji: najpierw słowa już poznane; obce tylko, gdy znanych za mało.
    const familiar = all.filter((x) => this.known(x.t));
    const candidates = familiar.length >= k ? familiar : all;
    // Najpierw ta sama część mowy i bliskie jednostki — trudniejsze, sensowniejsze dystraktory.
    const scored = shuffle(candidates, this.rng).map((x) => ({
      x,
      s: (x.pos === v.pos ? 0 : 2) + Math.abs((this.ix.unitById.get(x.unit)?.index ?? 0) - unitIdx) * 0.4 + this.rng(),
    }));
    scored.sort((a, b) => a.s - b.s);
    const out: VocabItem[] = [];
    for (const { x } of scored) {
      if (out.length >= k) break;
      if (seen.has(normalize(x.n)) || seen.has(normalize(x.t))) continue;
      seen.add(normalize(x.n));
      seen.add(normalize(x.t));
      out.push(x);
    }
    return out;
  }

  sentenceDistractors(s: Sentence, k: number): Sentence[] {
    const len = s.t.length;
    const pool = this.allSentences.filter((x) => x.id !== s.id && normalize(x.t) !== normalize(s.t) && normalize(x.n) !== normalize(s.n));
    return shuffle(pool, this.rng)
      .sort((a, b) => Math.abs(a.t.length - len) - Math.abs(b.t.length - len) + (this.rng() - 0.5) * 8)
      .slice(0, k);
  }

  tileDistractors(answer: string[], side: 't' | 'n', k: number): string[] {
    const have = new Set(answer.map((w) => normalize(w)));
    const pool = new Map<string, string>();
    const sentences = this.taught ? this.allSentences.filter((s) => this.known(s.t)) : this.allSentences;
    for (const s of shuffle(sentences.length >= 6 ? sentences : this.allSentences, this.rng).slice(0, 40)) {
      for (const w of tokenize(side === 't' ? s.t : s.n)) {
        const nw = normalize(w);
        if (!have.has(nw) && !pool.has(nw) && (side === 'n' || this.known(w))) pool.set(nw, w);
      }
    }
    return sample([...pool.values()], k, this.rng);
  }

  // ——— ćwiczenia ze słówek ———

  intro(v: VocabItem): Exercise {
    return { key: key('intro'), type: 'intro', skill: 'vocab', vocab: v, item: { id: v.id, kind: 'v' } };
  }

  vocabChoice(v: VocabItem, dir: 't2n' | 'n2t'): Exercise | null {
    const ds = this.vocabDistractors(v, 3);
    if (ds.length < 2) return null;
    const opts = shuffle([v, ...ds], this.rng);
    const t2n = dir === 't2n';
    return {
      key: key('choice'),
      type: 'choice',
      skill: t2n ? 'reading' : 'vocab',
      item: { id: v.id, kind: 'v' },
      title: t2n ? 'Co to znaczy?' : `Jak powiesz to po ${this.langAdverb()}?`,
      prompt: t2n ? this.ix.withArticle(v) : v.n,
      promptSide: t2n ? 't' : 'n',
      audio: t2n ? this.ix.withArticle(v) : undefined,
      options: opts.map((o) => (t2n ? o.n : this.ix.withArticle(o))),
      answer: opts.indexOf(v),
    };
  }

  picture(v: VocabItem): Exercise | null {
    if (!hasArt(v)) return null;
    const ds = this.vocabDistractors(v, 3, true);
    if (ds.length < 3) return null;
    const opts = shuffle([v, ...ds], this.rng);
    return {
      key: key('picture'),
      type: 'picture',
      skill: 'vocab',
      item: { id: v.id, kind: 'v' },
      prompt: this.ix.withArticle(v),
      audio: this.ix.withArticle(v),
      options: opts.map((o) => ({ t: o.t, emoji: o.emoji, img: o.img, label: o.n })),
      answer: opts.indexOf(v),
    };
  }

  listenWord(v: VocabItem): Exercise | null {
    if (!this.ctx.audio) return null;
    const ds = this.vocabDistractors(v, 3);
    if (ds.length < 2) return null;
    const opts = shuffle([v, ...ds], this.rng);
    return {
      key: key('listen'),
      type: 'listen',
      skill: 'listening',
      needs: 'audio',
      item: { id: v.id, kind: 'v' },
      audio: this.ix.withArticle(v),
      options: opts.map((o) => this.ix.withArticle(o)),
      answer: opts.indexOf(v),
    };
  }

  article(v: VocabItem): Exercise | null {
    if (v.pos !== 'noun' || !v.article) return null;
    const pool = this.ix.rules.articles;
    if (pool.length < 2) return null;
    const opts = sample(pool.filter((a) => a !== v.article), Math.min(3, pool.length - 1), this.rng);
    const options = shuffle([v.article, ...opts], this.rng);
    return {
      key: key('article'),
      type: 'article',
      skill: 'grammar',
      item: { id: v.id, kind: 'v' },
      word: v.t,
      meaning: v.n,
      emoji: v.emoji,
      img: v.img,
      options,
      answer: options.indexOf(v.article),
      explain: v.note ?? `${this.ix.withArticle(v)} — ${genderLabel(v.gender)}${v.plural ? `, l. mn. ${v.plural}` : ''}`,
    };
  }

  spell(v: VocabItem): Exercise | null {
    const word = v.t;
    if (word.includes(' ') || word.length < 3 || word.length > 11) return null;
    return {
      key: key('spell'),
      type: 'spell',
      skill: 'writing',
      item: { id: v.id, kind: 'v' },
      prompt: v.n,
      letters: shuffle([...word], this.rng),
      answer: word,
      audio: word,
    };
  }

  writeWord(v: VocabItem, dir: 'n2t' | 't2n'): Exercise {
    const n2t = dir === 'n2t';
    const answers = n2t
      ? [this.ix.withArticle(v), v.t, ...(v.altT ?? [])]
      : [v.n, ...(v.altN ?? [])];
    return {
      key: key('write'),
      type: 'write',
      skill: 'writing',
      item: { id: v.id, kind: 'v' },
      title: n2t ? `Napisz po ${this.langAdverb()}` : 'Napisz po polsku',
      prompt: n2t ? v.n : this.ix.withArticle(v),
      promptSide: n2t ? 'n' : 't',
      audio: n2t ? undefined : this.ix.withArticle(v),
      answers,
    };
  }

  dictationWord(v: VocabItem): Exercise | null {
    if (!this.ctx.audio) return null;
    return {
      key: key('dict'),
      type: 'dictation',
      skill: 'listening',
      needs: 'audio',
      item: { id: v.id, kind: 'v' },
      audio: this.ix.withArticle(v),
      answers: [this.ix.withArticle(v), v.t],
      translation: v.n,
    };
  }

  speakText(text: string, translation: string, item: { id: string; kind: 'v' | 's' }): Exercise {
    return { key: key('speak'), type: 'speak', skill: 'speaking', needs: 'mic', item, text, translation };
  }

  vocabExercise(v: VocabItem, forceStage?: 0 | 1 | 2): Exercise | null {
    const s = forceStage ?? this.boost(this.st(v.id));
    const makers: Maker[] =
      s === 0
        ? [
            { skill: 'reading', make: () => this.vocabChoice(v, 't2n') },
            { skill: 'vocab', w: v.img ? 1.6 : v.emoji ? 1.3 : 0, make: () => this.picture(v) },
            { skill: 'listening', w: this.ctx.audio ? 0.8 : 0, make: () => this.listenWord(v) },
          ]
        : s === 1
          ? [
              { skill: 'vocab', make: () => this.vocabChoice(v, 'n2t') },
              { skill: 'grammar', w: v.article ? 1.2 : 0, make: () => this.article(v) },
              { skill: 'writing', make: () => this.spell(v) },
              { skill: 'listening', w: this.ctx.audio ? 0.8 : 0, make: () => this.listenWord(v) },
            ]
          : [
              { skill: 'writing', w: 1.5, make: () => this.writeWord(v, 'n2t') },
              { skill: 'writing', w: 0.4, make: () => this.writeWord(v, 't2n') },
              { skill: 'listening', w: this.ctx.audio ? 1 : 0, make: () => this.dictationWord(v) },
              { skill: 'speaking', w: this.ctx.mic ? 0.6 : 0, make: () => this.speakText(this.ix.withArticle(v), v.n, { id: v.id, kind: 'v' }) },
              { skill: 'grammar', w: v.article ? 0.5 : 0, make: () => this.article(v) },
            ];
    return this.pickMaker(makers);
  }

  /** W trybie trudnym podnosimy poziom ćwiczeń o jeden. */
  boost(s: 0 | 1 | 2): 0 | 1 | 2 {
    return this.ctx.hard ? (Math.min(2, s + 1) as 0 | 1 | 2) : s;
  }

  pairs(items: VocabItem[]): Exercise | null {
    const uniq: VocabItem[] = [];
    const seen = new Set<string>();
    for (const v of items) {
      const k1 = normalize(v.n);
      const k2 = normalize(v.t);
      if (seen.has(k1) || seen.has(k2)) continue;
      seen.add(k1);
      seen.add(k2);
      uniq.push(v);
    }
    if (uniq.length < 3) return null;
    return {
      key: key('pairs'),
      type: 'pairs',
      skill: 'vocab',
      pairs: uniq.slice(0, 5).map((v) => ({ id: v.id, t: v.t, n: v.n })),
    };
  }

  // ——— ćwiczenia ze zdań ———

  tiles(s: Sentence, dir: 't2n' | 'n2t' | 'audio'): Exercise | null {
    const toT = dir !== 't2n';
    if (dir === 'audio' && !this.ctx.audio) return null;
    const answerText = toT ? s.t : s.n;
    const words = tokenize(answerText);
    if (words.length < 2 || words.length > 14) return null;
    const distract = this.tileDistractors(words, toT ? 't' : 'n', Math.min(5, Math.max(2, Math.round(words.length * 0.6))));
    const tiles = shuffle([...words, ...distract], this.rng).map((w) => (toT ? this.ix.tileCase(w) : lowerFirst(w, this.ix)));
    return {
      key: key('tiles'),
      type: 'tiles',
      skill: dir === 'audio' ? 'listening' : toT ? 'writing' : 'reading',
      needs: dir === 'audio' ? 'audio' : undefined,
      item: { id: s.id, kind: 's' },
      title: dir === 'audio' ? 'Ułóż to, co słyszysz' : 'Przetłumacz to zdanie',
      prompt: dir === 'audio' ? '' : toT ? s.n : s.t,
      promptSide: dir === 'n2t' ? 'n' : 't',
      audio: dir === 'n2t' ? undefined : s.t,
      tiles,
      answers: toT ? [s.t, ...(s.altT ?? [])] : [s.n, ...(s.altN ?? [])],
    };
  }

  writeSentence(s: Sentence, dir: 'n2t' | 't2n'): Exercise {
    const n2t = dir === 'n2t';
    return {
      key: key('write'),
      type: 'write',
      skill: 'writing',
      item: { id: s.id, kind: 's' },
      title: n2t ? `Napisz po ${this.langAdverb()}` : 'Napisz po polsku',
      prompt: n2t ? s.n : s.t,
      promptSide: n2t ? 'n' : 't',
      audio: n2t ? undefined : s.t,
      answers: n2t ? [s.t, ...(s.altT ?? [])] : [s.n, ...(s.altN ?? [])],
      words: (s.words ?? []).map((id) => this.ix.vocab.get(id)).filter((x): x is VocabItem => !!x),
    };
  }

  cloze(s: Sentence, typed: boolean): Exercise | null {
    const gap = s.gap ?? this.autoGap(s);
    if (!gap) return null;
    const re = new RegExp(`(^|[^\\p{L}'])(${escapeRe(gap)})(?=[^\\p{L}]|$)`, 'iu');
    const m = re.exec(s.t);
    if (!m) return null;
    const start = m.index + m[1].length;
    const real = s.t.slice(start, start + gap.length);
    const before = s.t.slice(0, start);
    const after = s.t.slice(start + gap.length);
    let options: string[] | undefined;
    if (!typed) {
      const ds = (s.gapOptions?.length ? s.gapOptions : this.gapDistractors(real)).filter((o) => normalize(o) !== normalize(real));
      if (ds.length < 1) return null;
      options = shuffle([real, ...sample(ds, 3, this.rng)], this.rng);
    }
    return {
      key: key('cloze'),
      type: 'cloze',
      skill: options ? 'grammar' : 'writing',
      item: { id: s.id, kind: 's' },
      before,
      after,
      translation: s.n,
      options,
      answers: [real],
      full: s.t,
    };
  }

  autoGap(s: Sentence): string | null {
    const toks = tokenize(s.t);
    // Preferuj odmienione czasowniki z tabel, potem najdłuższe słowo z listy słówek.
    const verb = toks.find((t) => this.ix.formIndex.has(t.toLowerCase()));
    if (verb) return verb;
    const vocabForms = new Set((s.words ?? []).map((id) => this.ix.vocab.get(id)?.t.toLowerCase()).filter(Boolean));
    const cand = toks.filter((t) => vocabForms.has(t.toLowerCase()) && t.length > 2);
    return cand.sort((a, b) => b.length - a.length)[0] ?? null;
  }

  gapDistractors(word: string): string[] {
    const lw = word.toLowerCase();
    const forms = this.ix.formIndex.get(lw);
    if (forms?.length) {
      const table = forms[0].table;
      return [...new Set(table.forms.filter((f) => f.toLowerCase() !== lw && !f.includes(' ') && !f.includes('|')))].map((f) => matchCase(f, word));
    }
    const arts = this.ix.rules.articles;
    if (arts.includes(lw)) return arts.filter((a) => a !== lw).map((f) => matchCase(f, word));
    const v = this.allVocab.find((x) => x.t.toLowerCase() === lw);
    const ds = v ? this.vocabDistractors(v, 3) : sample(this.allVocab, 3, this.rng);
    return ds.map((d) => matchCase(d.t, word));
  }

  listenSentence(s: Sentence): Exercise | null {
    if (!this.ctx.audio) return null;
    const ds = this.sentenceDistractors(s, 2);
    if (ds.length < 2) return null;
    const opts = shuffle([s, ...ds], this.rng);
    return {
      key: key('listen'),
      type: 'listen',
      skill: 'listening',
      needs: 'audio',
      item: { id: s.id, kind: 's' },
      audio: s.t,
      options: opts.map((o) => o.t),
      answer: opts.indexOf(s),
    };
  }

  dictation(s: Sentence): Exercise | null {
    if (!this.ctx.audio) return null;
    return {
      key: key('dict'),
      type: 'dictation',
      skill: 'listening',
      needs: 'audio',
      item: { id: s.id, kind: 's' },
      audio: s.t,
      answers: [s.t, ...(s.altT ?? [])],
      translation: s.n,
    };
  }

  judge(s: Sentence): Exercise | null {
    const right = this.rng() < 0.5;
    const other = right ? null : this.sentenceDistractors(s, 1)[0];
    if (!right && !other) return null;
    return {
      key: key('judge'),
      type: 'judge',
      skill: 'reading',
      item: { id: s.id, kind: 's' },
      text: s.t,
      shown: right ? s.n : other!.n,
      correct: s.n,
      isRight: right,
    };
  }

  errorSpot(s: Sentence): Exercise | null {
    const toks = tokenize(s.t);
    const candidates: { i: number; wrong: string }[] = [];
    toks.forEach((tok, i) => {
      const lw = tok.toLowerCase();
      const forms = this.ix.formIndex.get(lw);
      if (forms?.length) {
        const others = forms[0].table.forms.filter((f) => f.toLowerCase() !== lw && !f.includes(' ') && !f.includes('|'));
        if (others.length) candidates.push({ i, wrong: matchCase(others[Math.floor(this.rng() * others.length)], tok) });
      }
      const arts = this.ix.rules.articles;
      if (arts.includes(lw) && !lw.endsWith("'")) {
        const others = arts.filter((a) => a !== lw && !a.endsWith("'"));
        if (others.length) candidates.push({ i, wrong: matchCase(others[Math.floor(this.rng() * others.length)], tok) });
      }
    });
    if (!candidates.length) return null;
    const c = candidates[Math.floor(this.rng() * candidates.length)];
    const tokens = [...toks];
    const fix = tokens[c.i];
    tokens[c.i] = c.wrong;
    return {
      key: key('err'),
      type: 'errorspot',
      skill: 'grammar',
      item: { id: s.id, kind: 's' },
      tokens,
      wrong: c.i,
      fix,
      full: s.t,
      translation: s.n,
    };
  }

  sentenceExercise(s: Sentence, forceStage?: 0 | 1 | 2): Exercise | null {
    const st = forceStage ?? this.boost(this.st(s.id));
    const makers: Maker[] =
      st === 0
        ? [
            { skill: 'reading', w: 2, make: () => this.tiles(s, 't2n') },
            { skill: 'reading', w: 0.6, make: () => this.judge(s) },
            { skill: 'listening', w: this.ctx.audio ? 0.7 : 0, make: () => this.listenSentence(s) },
          ]
        : st === 1
          ? [
              { skill: 'writing', w: 2, make: () => this.tiles(s, 'n2t') },
              { skill: 'grammar', w: 1.2, make: () => this.cloze(s, false) },
              { skill: 'listening', w: this.ctx.audio ? 1 : 0, make: () => this.tiles(s, 'audio') },
              { skill: 'grammar', w: 0.6, make: () => this.errorSpot(s) },
            ]
          : [
              { skill: 'writing', w: 2, make: () => this.writeSentence(s, 'n2t') },
              { skill: 'writing', w: 0.8, make: () => this.cloze(s, true) },
              { skill: 'listening', w: this.ctx.audio ? 1.2 : 0, make: () => this.dictation(s) },
              { skill: 'speaking', w: this.ctx.mic ? 0.8 : 0, make: () => this.speakText(s.t, s.n, { id: s.id, kind: 's' }) },
              { skill: 'writing', w: 0.4, make: () => this.writeSentence(s, 't2n') },
            ];
    return this.pickMaker(makers);
  }

  // ——— gramatyka ———

  conjugate(table: Conjugation, person?: number): Exercise {
    const p = person ?? Math.floor(this.rng() * 6);
    return {
      key: key('conj'),
      type: 'conjugate',
      skill: 'grammar',
      item: { id: table.id, kind: 'c' },
      table,
      person: p,
      personLabel: this.ix.rules.persons[p],
      // Forma może mieć warianty, np. „sono andato | sono andata”.
      answers: table.forms[p].split('|').map((f) => f.trim()),
    };
  }

  numbers(count: number): Exercise[] {
    const lang = this.ix.pack.target.code;
    if (!supportsNumbers(lang)) return [];
    const out: Exercise[] = [];
    const used = new Set<number>();
    while (out.length < count) {
      const max = out.length < count / 2 ? 20 : 100;
      const value = Math.floor(this.rng() * (max + 1));
      if (used.has(value)) continue;
      used.add(value);
      const words = numberToWords(lang, value)!;
      const mode: 'listen' | 'write' = this.ctx.audio && this.rng() < 0.5 ? 'listen' : 'write';
      out.push({
        key: key('num'),
        type: 'number',
        skill: mode === 'listen' ? 'listening' : 'writing',
        needs: mode === 'listen' ? 'audio' : undefined,
        mode,
        value,
        words,
        answers: mode === 'listen' ? [String(value), ...numberAnswers(lang, value)] : numberAnswers(lang, value),
      });
    }
    return out;
  }

  langAdverb(): string {
    return LANG_ADVERB[this.ix.pack.target.code] ?? this.ix.pack.target.name;
  }

  // ——— zbiory elementów ———

  learnedVocab(): VocabItem[] {
    return this.allVocab.filter((v) => this.ctx.srs.has(v.id));
  }

  learnedSentences(): Sentence[] {
    return this.allSentences.filter((s) => this.ctx.srs.has(s.id) || (s.words?.length && s.words.every((w) => this.ctx.srs.has(w))));
  }

  unlockedTables(): Conjugation[] {
    return [...this.ix.tables.values()].filter((t) => this.ctx.unlockedUnits.has(t.unit));
  }

  /** Elementy do powtórki: najpierw zaległe, potem najsłabsze. */
  reviewItems(limit: number): ({ kind: 'v'; v: VocabItem } | { kind: 's'; s: Sentence })[] {
    const now = this.ctx.now;
    const states = [...this.ctx.srs.values()].filter((s) => s.kind !== 'c');
    const due = states.filter((s) => s.due <= now).sort((a, b) => a.due - b.due);
    const rest = states.filter((s) => s.due > now).sort((a, b) => strength(a, now) - strength(b, now));
    const out: ({ kind: 'v'; v: VocabItem } | { kind: 's'; s: Sentence })[] = [];
    for (const s of [...due, ...rest]) {
      if (out.length >= limit) break;
      if (s.kind === 'v') {
        const v = this.ix.vocab.get(s.item);
        if (v) out.push({ kind: 'v', v });
      } else {
        const sen = this.ix.sentences.get(s.item);
        if (sen) out.push({ kind: 's', s: sen });
      }
    }
    return out;
  }
}

const LANG_ADVERB: Record<string, string> = {
  it: 'włosku', es: 'hiszpańsku', en: 'angielsku', de: 'niemiecku', fr: 'francusku', pt: 'portugalsku',
};

/** „po włosku”, „po angielsku”… */
export function inLanguage(code: string, fallback: string): string {
  return `po ${LANG_ADVERB[code] ?? fallback}`;
}

function genderLabel(g?: string): string {
  return g === 'm' ? 'rodzaj męski' : g === 'f' ? 'rodzaj żeński' : g === 'n' ? 'rodzaj nijaki' : 'rzeczownik';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchCase(word: string, like: string): string {
  return /^\p{Lu}/u.test(like) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function lowerFirst(w: string, ix: CourseIndex): string {
  return ix.properTokens.has(w) ? w : w.charAt(0).toLocaleLowerCase('pl') + w.slice(1);
}

function compact(list: (Exercise | null | undefined)[]): Exercise[] {
  return list.filter((x): x is Exercise => !!x);
}

/** Mieszanie bez stawiania dwóch ćwiczeń o ten sam element obok siebie. */
function spread(list: Exercise[], rng: Rng): Exercise[] {
  const out: Exercise[] = [];
  const pool = shuffle(list, rng);
  while (pool.length) {
    const last = out[out.length - 1];
    let i = pool.findIndex((e) => !last || e.item?.id !== last.item?.id || e.type !== last.type);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// ——— budowanie sesji ———

export function buildSession(mode: SessionMode, ctx: GenContext): Exercise[] {
  const g = new Gen(ctx);
  switch (mode.kind) {
    case 'lesson': {
      const lesson = ctx.index.lessons.get(mode.lessonId);
      if (!lesson) return [];
      switch (lesson.kind) {
        case 'learn': return learnSession(g, lesson, mode.variant ?? 'mixed');
        case 'grammar': return grammarSession(g, lesson, mode.variant ?? 'mixed');
        case 'story': return storySession(g, lesson);
        case 'speak': return speakSession(g, lesson);
        case 'test': return testSession(g, lesson.unit, 18, false);
      }
      return [];
    }
    case 'skip': return testSession(g, mode.unitId, 20, true);
    case 'unit': return unitPractice(g, mode.unitId);
    case 'review': return reviewSession(g);
    case 'mistakes': return mistakesSession(g);
    case 'speaking': return speakingPractice(g);
    case 'listening': return listeningPractice(g);
    case 'conjugation': return conjugationPractice(g, mode.tableId);
    case 'numbers': return g.numbers(12);
    case 'speed': return speedRound(g);
  }
}

/** Kroki teorii wszystkich artykułów jednostki (do wskazówek w lekcjach słówek). */
export function unitSteps(ix: CourseIndex, unitId: string): { article: GrammarArticle; step: TheoryStep }[] {
  const unit = ix.unitById.get(unitId);
  if (!unit) return [];
  return unit.grammar.flatMap((article) => splitArticle(article, (w) => ix.isTarget(w)).map((step) => ({ article, step })));
}

function vocabWords(v: VocabItem): string[] {
  return [v.t, ...(v.forms ?? []), ...(v.plural ? [v.plural] : [])].flatMap((x) => tokenize(x).map((w) => w.toLowerCase()));
}

function learnSession(g: Gen, lesson: Lesson, variant: LessonVariant): Exercise[] {
  const ix = g.ix;
  const vocab = lesson.vocab.map((id) => ix.vocab.get(id)).filter((v): v is VocabItem => !!v);
  const fresh = vocab.filter((v) => !g.ctx.srs.has(v.id));
  const replay = fresh.length === 0;
  const head: Exercise[] = [];
  // Wskazówki z teorii jednostki, które dotyczą właśnie poznawanych słów (najwyżej dwie na lekcję).
  // Wskazówki tylko z teorii, która na ścieżce jest PRZED tą lekcją albo zaraz po niej —
  // nie zapowiadamy tematów z końca jednostki.
  const pos = ix.lessonPosition(lesson.id);
  const nextGrammar = ix.path.slice(pos + 1).find((l) => l.unit === lesson.unit && l.kind !== 'learn');
  const allowed = new Set(ix.path.slice(0, pos + 1).filter((l) => l.kind === 'grammar').map((l) => l.grammar));
  if (nextGrammar?.kind === 'grammar') allowed.add(nextGrammar.grammar);
  const steps = variant === 'mixed' ? unitSteps(ix, lesson.unit).filter((x) => allowed.has(x.article.id)) : [];
  const shownSteps = new Set<TheoryStep>();
  g.taught = new Set(g.coverage.taughtAt(lesson));

  // Nowe słówka wprowadzamy grupami po trzy: karta → szybkie rozpoznanie → pary.
  for (let i = 0; i < fresh.length; i += 3) {
    const group = fresh.slice(i, i + 3);
    const groupWords = new Set(group.flatMap(vocabWords));
    const related = shownSteps.size < 2
      ? steps.find(({ step }) => !shownSteps.has(step) && step.focus.filter((f) => groupWords.has(f)).length >= 1)
      : undefined;
    if (related) {
      shownSteps.add(related.step);
      g.coverage.articleWords(related.step.body).forEach((w) => g.taught!.add(w));
      const tables = ix.unitById.get(lesson.unit)?.conjugations.filter((t) => t.forms.some((f) => groupWords.has(f.toLowerCase()))) ?? [];
      head.push({
        key: key('tip'), type: 'theory', skill: 'grammar', article: related.article, tables: tables.slice(0, 1),
        step: related.step, tip: true, upcoming: related.step.focus.filter((f) => groupWords.has(f)).slice(0, 6),
      });
    }
    for (const v of group) {
      head.push(g.intro(v));
      const quick = g.vocabChoice(v, 't2n') ?? g.picture(v);
      if (quick) head.push(quick);
    }
    const p = g.pairs([...group, ...fresh.slice(Math.max(0, i - 2), i)]);
    if (p) head.push(p);
  }

  const body: Exercise[] = [];
  for (const v of vocab) {
    const st = g.boost(g.st(v.id));
    const ex = g.vocabExercise(v, replay ? st : (Math.max(1, st) as 1 | 2));
    if (ex) body.push(ex);
  }
  if (replay) {
    const p = g.pairs(shuffle(vocab, g.rng));
    if (p) body.push(p);
  }

  // Zdania lekcji + (gdy mało) inne zdania z jednostki — zawsze tylko takie, w których
  // każde słowo i każda forma były już pokazane (karty, wskazówki, wcześniejsza teoria).
  let sentences = lesson.sentences.map((id) => ix.sentences.get(id)).filter((s): s is Sentence => !!s && g.known(s.t));
  if (sentences.length < 3) {
    const unit = ix.unitById.get(lesson.unit);
    const own = new Set(lesson.vocab);
    const extra = (unit?.sentences ?? []).filter((s) => !sentences.includes(s) && g.known(s.t));
    // Najpierw te, które używają słów z tej lekcji.
    extra.sort((a, b) => Number((b.words ?? []).some((w) => own.has(w))) - Number((a.words ?? []).some((w) => own.has(w))));
    sentences = [...sentences, ...extra.slice(0, 3 - sentences.length)];
  }
  const sentenceEx: Exercise[] = [];
  for (const s of sentences.slice(0, 5)) {
    const isNew = !g.ctx.srs.has(s.id);
    const first = g.sentenceExercise(s, isNew ? 0 : undefined);
    if (first) sentenceEx.push(first);
    if (isNew && sentences.length <= 3) {
      const second = g.sentenceExercise(s, 1);
      if (second) sentenceEx.push(second);
    }
  }

  // Dwie, trzy powtórki z wcześniejszego materiału.
  const lessonItems = new Set([...lesson.vocab, ...lesson.sentences]);
  const reviews = compact(
    g.reviewItems(6)
      .filter((r) => !lessonItems.has(r.kind === 'v' ? r.v.id : r.s.id))
      .slice(0, replay ? 4 : 2)
      .map((r) => (r.kind === 'v' ? g.vocabExercise(r.v) : g.sentenceExercise(r.s))),
  );

  return [...head, ...spread([...body, ...reviews], g.rng), ...sentenceEx].slice(0, 24);
}

/**
 * Lekcja teorii: krok artykułu → od razu ćwiczenia z tego, o czym był krok → kolejny krok.
 * W wariancie „same ćwiczenia” pomijamy karty teorii, ale zostawiamy kolejność kroków.
 */
function grammarSession(g: Gen, lesson: Lesson, variant: LessonVariant): Exercise[] {
  const ix = g.ix;
  const article = lesson.grammar ? ix.grammar.get(lesson.grammar) : undefined;
  if (!article) return [];
  const tables = lesson.conjugations.map((id) => ix.tables.get(id)).filter((t): t is Conjugation => !!t);
  const unit = ix.unitById.get(lesson.unit);
  const steps = splitArticle(article, (w) => ix.isTarget(w));
  const cov = g.coverage;
  const before = cov.taughtAt(lesson);
  const stepTexts = steps.map((st) => stepText(st.title, st.body, st.examples));
  // Rośnie krok po kroku: ćwiczenie po kroku i może używać tylko tego, co pokazały kroki 0…i.
  g.taught = new Set(before);

  // Pytania i zdania przypinamy do kroku, o którym są — i nie wcześniej, niż uczeń zobaczy
  // wszystkie potrzebne słowa. Czego materiał nie pokrywa, o to nie pytamy.
  const questions = cov.place(article.check, (q) => cov.questionText(q), questionTopic, stepTexts, before, 'last');
  const pool = [...ix.sentences.values()].filter((s) => {
    const u = ix.unitById.get(s.unit);
    return !!u && !!unit && u.index <= unit.index;
  });
  const sentences = cov.place(pool, (s) => s.t, (s) => s.t, stepTexts, before, 'none');

  const materials: StepMaterial[] = steps.map((step, i) => {
    const forms: StepMaterial['forms'] = [];
    for (const table of tables) {
      table.forms.forEach((f, person) => {
        if (f.split('|').flatMap((x) => tokenize(x).map((w) => w.toLowerCase())).some((v) => step.focus.includes(v))) forms.push({ table, person });
      });
    }
    // Najpierw zdania z tej jednostki, w których pada wyróżniona forma kroku.
    const own = sentences
      .filter((p) => p.step === i)
      .map((p) => p.item)
      .sort((a, b) => Number(b.unit === lesson.unit) - Number(a.unit === lesson.unit) ||
        Number(tokenize(b.t).some((w) => step.focus.includes(w.toLowerCase()))) - Number(tokenize(a.t).some((w) => step.focus.includes(w.toLowerCase()))));
    return { step, sentences: own.slice(0, 3), forms, questions: questions.filter((p) => p.step === i).map((p) => p.item) };
  });

  // Krok bez własnego materiału do ćwiczeń łączymy z następnym (ostatni — z poprzednim),
  // żeby po każdej karcie teorii od razu przychodziły ćwiczenia.
  const drilled = new Set<string>();
  const groups: { steps: StepMaterial[]; practice: Exercise[] }[] = [];
  let pending: StepMaterial[] = [];
  for (const m of materials) {
    cov.articleWords(m.step.body).forEach((w) => g.taught!.add(w));
    const practice = stepPractice(g, m, article.id, lesson.unit, drilled);
    pending.push(m);
    if (practice.length) {
      groups.push({ steps: pending, practice });
      pending = [];
    }
  }
  if (pending.length) {
    if (groups.length) groups[groups.length - 1].steps.push(...pending);
    else groups.push({ steps: pending, practice: [] });
  }

  const out: Exercise[] = [];
  const shownTables = new Set<Conjugation>();
  groups.forEach((grp, index) => {
    const forms = grp.steps.flatMap((m) => m.forms);
    const groupTables = forms.length ? [...new Set(forms.map((f) => f.table))] : index === 0 ? tables : [];
    groupTables.forEach((t) => shownTables.add(t));
    if (variant === 'mixed') {
      const [first, ...rest] = grp.steps;
      const step: TheoryStep = {
        ...first.step,
        index,
        total: groups.length,
        body: [first.step.body, ...rest.map((m) => `### ${m.step.title}\n${m.step.body}`)].join('\n\n'),
        focus: [...new Set(grp.steps.flatMap((m) => m.step.focus))],
        examples: grp.steps.flatMap((m) => m.step.examples),
      };
      out.push({
        key: key('theory'), type: 'theory', skill: 'grammar', article,
        tables: groupTables, step, upcoming: upcomingLabels({ ...first, step, forms }),
      });
    }
    out.push(...grp.practice);
  });

  // Tabele pokazane w teorii, których formy nie padły w ćwiczeniach kroków — krótko na koniec.
  for (const t of shownTables) {
    if (drilled.has(t.id)) continue;
    for (const p of sample([0, 1, 2, 3, 4, 5], 2, g.rng)) out.push(g.conjugate(t, p));
  }
  return out;
}

/** Co pokażemy uczniowi jako „zaraz przećwiczysz”. */
function upcomingLabels(m: StepMaterial): string[] {
  // Gdy krok ma formy z tabeli — to je ćwiczymy; inaczej wyróżnione słowa kroku.
  const forms = m.forms.map((f) => f.table.forms[f.person].split('|')[0].trim());
  return [...new Set(forms.length ? forms : m.step.focus)].slice(0, 8);
}

/** 2–5 ćwiczeń dokładnie z materiału jednego kroku teorii. */
function stepPractice(g: Gen, m: StepMaterial, articleId: string, unitId: string, drilled: Set<string>): Exercise[] {
  const ex: Exercise[] = [];
  for (const { table, person } of sample(m.forms, 3, g.rng)) {
    ex.push(g.conjugate(table, person));
    drilled.add(table.id);
  }
  // Luka trafia w formę z tabeli odmiany (np. „sono”), a dopiero potem w inne słowo z kroku.
  const formWords = new Set(m.forms.flatMap(({ table, person }) => table.forms[person].split('|').map((f) => f.trim().toLowerCase())));
  for (const s of m.sentences.slice(0, 2)) {
    const toks = tokenize(s.t);
    const word = toks.find((w) => formWords.has(w.toLowerCase())) ??
      toks.filter((w) => m.step.focus.includes(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    const cloze = word ? g.cloze({ ...s, gap: word, gapOptions: undefined }, false) : null;
    const made = cloze ?? g.errorSpot(s) ?? g.tiles(s, 'n2t');
    if (made) ex.push(made);
  }
  // Kafelki z przykładu tylko wtedy, gdy wszystkie jego słowa były już pokazane.
  const examples = m.step.examples.filter((e) => g.known(e.t));
  const example = examples[Math.floor(g.rng() * examples.length)];
  if (example && ex.length < 4) {
    const t = g.tiles({ id: `${articleId}-ex`, unit: unitId, t: example.t, n: example.n }, 'n2t');
    if (t) ex.push({ ...t, item: undefined });
  }
  for (const q of m.questions) ex.push({ key: key('q'), type: 'question', skill: 'grammar', question: q });
  return spread(ex, g.rng).slice(0, 6);
}

function storySession(g: Gen, lesson: Lesson): Exercise[] {
  const story = lesson.story ? g.ix.stories.get(lesson.story) : undefined;
  if (!story) return [];
  const out: Exercise[] = [{ key: key('story'), type: 'story', skill: 'reading', story }];
  for (const q of story.questions) {
    out.push({ key: key('q'), type: 'question', skill: 'reading', question: q, context: story.title });
  }
  if (story.lines.length >= 4) {
    const start = Math.floor(g.rng() * (story.lines.length - 3));
    const lines = story.lines.slice(start, start + 4);
    const order = shuffle([0, 1, 2, 3], g.rng);
    out.push({ key: key('reorder'), type: 'reorder', skill: 'reading', lines: order.map((i) => lines[i]), order });
  }
  if (g.ctx.audio) {
    for (const line of sample(story.lines.filter((l) => l.t.length > 12), 2, g.rng)) {
      const others = sample(story.lines.filter((l) => l !== line), 2, g.rng);
      const opts = shuffle([line, ...others], g.rng);
      out.push({
        key: key('listen'), type: 'listen', skill: 'listening', needs: 'audio',
        audio: line.t, options: opts.map((o) => o.t), answer: opts.indexOf(line),
      });
    }
  }
  const line = sample(story.lines.filter((l) => l.t.split(' ').length >= 3), 1, g.rng)[0];
  if (line && g.ctx.mic) out.push(g.speakText(line.t, line.n, { id: `${story.id}-line`, kind: 's' }));
  return out.map((e) => (e.item?.id.endsWith('-line') ? { ...e, item: undefined } : e));
}

function speakSession(g: Gen, lesson: Lesson): Exercise[] {
  const ix = g.ix;
  const sentences = sample(lesson.sentences.map((id) => ix.sentences.get(id)).filter((s): s is Sentence => !!s), 7, g.rng);
  const words = sample(lesson.vocab.map((id) => ix.vocab.get(id)).filter((v): v is VocabItem => !!v), 3, g.rng);
  const speak = [
    ...words.map((v) => g.speakText(ix.withArticle(v), v.n, { id: v.id, kind: 'v' })),
    ...sentences.map((s) => g.speakText(s.t, s.n, { id: s.id, kind: 's' })),
  ];
  const listen = compact(sample(sentences, 3, g.rng).map((s, i) => (i === 0 ? g.dictation(s) : g.tiles(s, 'audio'))));
  return [...speak.slice(0, 3), ...spread([...speak.slice(3), ...listen], g.rng)];
}

function testSession(g: Gen, unitId: string, size: number, includePrevious: boolean): Exercise[] {
  const ix = g.ix;
  const unit = ix.unitById.get(unitId);
  if (!unit) return [];
  const units = includePrevious ? ix.units.filter((u) => u.index <= unit.index) : [unit];
  // Przy przeskakiwaniu połowa pytań z docelowej jednostki, reszta z wcześniejszych.
  const pickFrom = <T>(own: T[], prev: T[], k: number) =>
    includePrevious ? [...sample(own, Math.ceil(k * 0.6), g.rng), ...sample(prev, Math.floor(k * 0.4), g.rng)] : sample(own, k, g.rng);
  const prevUnits = units.filter((u) => u !== unit);
  const vocab = pickFrom(unit.vocab, prevUnits.flatMap((u) => u.vocab), 7);
  const sentences = pickFrom(unit.sentences, prevUnits.flatMap((u) => u.sentences), 8);
  const tables = pickFrom(unit.conjugations, prevUnits.flatMap((u) => u.conjugations), 2);
  const questions = sample(unit.grammar.flatMap((a) => a.check), 2, g.rng);

  const list = compact([
    ...vocab.map((v, i) => g.vocabExercise(v, i % 3 === 0 ? 1 : 2)),
    ...sentences.map((s, i) => g.sentenceExercise(s, i % 2 === 0 ? 1 : 2)),
    ...tables.map((t) => g.conjugate(t)),
    ...questions.map((q) => ({ key: key('q'), type: 'question' as const, skill: 'grammar' as const, question: q })),
  ]).filter((e) => e.type !== 'speak');
  return spread(list, g.rng).slice(0, size);
}

function unitPractice(g: Gen, unitId: string): Exercise[] {
  const unit = g.ix.unitById.get(unitId);
  if (!unit) return [];
  return spread(compact([
    ...sample(unit.vocab, 7, g.rng).map((v) => g.vocabExercise(v)),
    ...sample(unit.sentences, 7, g.rng).map((s) => g.sentenceExercise(s)),
    ...sample(unit.conjugations, 2, g.rng).map((t) => g.conjugate(t)),
  ]), g.rng);
}

function reviewSession(g: Gen): Exercise[] {
  const items = g.reviewItems(14);
  const list = compact(items.map((r) => (r.kind === 'v' ? g.vocabExercise(r.v) : g.sentenceExercise(r.s))));
  const vocab = items.filter((r) => r.kind === 'v').map((r) => (r as { v: VocabItem }).v);
  const p = g.pairs(shuffle(vocab, g.rng));
  if (p) list.push(p);
  return spread(list, g.rng);
}

function mistakesSession(g: Gen): Exercise[] {
  const seen = new Set<string>();
  const out: Exercise[] = [];
  for (const m of g.ctx.mistakes ?? []) {
    if (seen.has(m.item) || out.length >= 14) continue;
    seen.add(m.item);
    if (m.kind === 'v') {
      const v = g.ix.vocab.get(m.item);
      const ex = v && g.vocabExercise(v, Math.max(1, g.st(v.id)) as 1 | 2);
      if (ex) out.push(ex);
    } else if (m.kind === 's') {
      const s = g.ix.sentences.get(m.item);
      const ex = s && g.sentenceExercise(s, Math.max(1, g.st(s.id)) as 1 | 2);
      if (ex) out.push(ex);
    } else {
      const t = g.ix.tables.get(m.item);
      if (t) out.push(g.conjugate(t));
    }
  }
  return spread(out, g.rng);
}

function speakingPractice(g: Gen): Exercise[] {
  const sentences = g.learnedSentences();
  const pool = sentences.length >= 4 ? sentences : [...g.ix.sentences.values()].filter((s) => g.ctx.unlockedUnits.has(s.unit));
  return sample(pool, 10, g.rng).map((s) => g.speakText(s.t, s.n, { id: s.id, kind: 's' }));
}

function listeningPractice(g: Gen): Exercise[] {
  if (!g.ctx.audio) return [];
  const sentences = g.learnedSentences();
  const vocab = g.learnedVocab();
  return spread(compact([
    ...sample(vocab, 4, g.rng).map((v) => g.listenWord(v) ?? g.dictationWord(v)),
    ...sample(sentences, 8, g.rng).map((s, i) => (i % 3 === 0 ? g.dictation(s) : i % 3 === 1 ? g.tiles(s, 'audio') : g.listenSentence(s))),
  ]), g.rng);
}

function conjugationPractice(g: Gen, tableId?: string): Exercise[] {
  if (tableId) {
    const t = g.ix.tables.get(tableId);
    if (!t) return [];
    const drills = shuffle([0, 1, 2, 3, 4, 5], g.rng).map((p) => g.conjugate(t, p));
    const forms = new Set(t.forms.map((f) => f.toLowerCase()));
    const sentences = [...g.ix.sentences.values()].filter((s) => tokenize(s.t).some((w) => forms.has(w.toLowerCase())));
    const cloze = compact(sample(sentences, 4, g.rng).map((s) => g.cloze(s, true)));
    return [...drills, ...cloze];
  }
  const tables = g.unlockedTables();
  if (!tables.length) return [];
  return Array.from({ length: 12 }, () => g.conjugate(tables[Math.floor(g.rng() * tables.length)]));
}

function speedRound(g: Gen): Exercise[] {
  const vocab = g.learnedVocab();
  const pool = vocab.length >= 8 ? vocab : [...g.ix.vocab.values()].filter((v) => g.ctx.unlockedUnits.has(v.unit));
  const items = sample(pool, 24, g.rng);
  const out: Exercise[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i % 6 === 5) {
      const p = g.pairs(items.slice(i - 5, i));
      if (p) out.push(p);
    } else {
      const ex = g.vocabChoice(items[i], g.rng() < 0.5 ? 't2n' : 'n2t');
      if (ex) out.push(ex);
    }
  }
  return out;
}

/** Czy słówko ma coś do pokazania na obrazku (ilustrację SVG albo emoji). */
function hasArt(v: VocabItem): boolean {
  return !!(v.img || v.emoji);
}
