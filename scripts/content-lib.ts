// Kompilacja treści kursów: pliki YAML z content/courses/<kurs>/ → CoursePack.
// Logika jest tu (bez efektów ubocznych), żeby testy mogły ją sprawdzać
// bez zapisywania bazy na dysk.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type {
  Conjugation, CoursePack, GrammarArticle, Lesson, Sentence, Story, Unit, VocabItem,
} from '../src/data/types.ts';

const str = z.string().min(1);
const strList = z.array(str).optional();

const LangSchema = z.object({
  code: str, name: str, endonym: str, speech: str, flag: str,
});

const CourseSchema = z.object({
  id: z.string().regex(/^[a-z]{2}-[a-z]{2}$/),
  title: str,
  tagline: str,
  description: str,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  levels: str,
  target: LangSchema,
  native: LangSchema,
  rules: z.object({
    dropPronouns: z.array(str).default([]),
    persons: z.array(str).length(6),
    specialChars: z.array(str).default([]),
    articles: z.array(str).default([]),
    elisions: z.array(str).default([]),
  }),
});

const ChoiceSchema = z.object({
  q: str,
  options: z.array(str).min(2).max(5),
  answer: z.number().int().min(0),
  explain: z.string().optional(),
}).refine((c) => c.answer < c.options.length, { message: 'answer poza zakresem options' });

const VocabSchema = z.object({
  id: z.string().optional(),
  t: str,
  n: str,
  alt_t: strList,
  alt_n: strList,
  pos: z.enum(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'num', 'interj', 'phrase', 'det']),
  g: z.enum(['m', 'f', 'n', 'mf']).optional(),
  art: z.string().optional(),
  pl: z.string().optional(),
  forms: strList,
  emoji: z.string().optional(),
  /** Własna nazwa pliku ilustracji (bez .svg) — np. wspólny obrazek dla „amico” i „amica”. */
  img: z.string().regex(/^[a-z0-9-]+$/).optional(),
  note: z.string().optional(),
  ex: z.tuple([str, str]).optional(),
});

const SentenceSchema = z.object({
  id: z.string().optional(),
  t: str,
  n: str,
  alt_t: strList,
  alt_n: strList,
  gap: z.string().optional(),
  gap_opts: strList,
  note: z.string().optional(),
});

const UnitSchema = z.object({
  id: z.string().regex(/^u\d{2}$/),
  title: str,
  subtitle: str,
  cefr: str,
  icon: str,
  goals: z.array(str).min(1),
  vocab: z.array(VocabSchema).min(4),
  sentences: z.array(SentenceSchema).min(4),
  grammar: z.array(z.object({
    id: str,
    title: str,
    summary: str,
    body: str,
    examples: z.array(z.object({ t: str, n: str, note: z.string().optional() })).default([]),
    check: z.array(ChoiceSchema).default([]),
  })).default([]),
  conjugations: z.array(z.object({
    verb: str,
    n: str,
    tense: str,
    label: str,
    forms: z.array(str).length(6),
    irregular: z.boolean().optional(),
    note: z.string().optional(),
  })).default([]),
  stories: z.array(z.object({
    id: str,
    title: str,
    emoji: str,
    intro: str,
    lines: z.array(z.tuple([str, str, str])).min(4),
    questions: z.array(ChoiceSchema).min(2),
  })).default([]),
});

type UnitSrc = z.infer<typeof UnitSchema>;

export class ContentError extends Error {}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';
}

/** Tokenizacja zdania na potrzeby dopasowania słówek (bez interpunkcji, małe litery). */
export function matchTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?¿¡;:"«»()…—–-]/g, ' ')
    .split(/[\s']+/)
    .filter(Boolean);
}

function vocabKeys(v: VocabItem): string[][] {
  const variants = [v.t, ...(v.altT ?? []), ...(v.forms ?? []), ...(v.plural ? [v.plural] : [])];
  return variants.map((x) => matchTokens(x)).filter((x) => x.length > 0);
}

function containsSeq(tokens: string[], seq: string[]): boolean {
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

function fail(where: string, msg: string): never {
  throw new ContentError(`${where}: ${msg}`);
}

export interface CompiledCourse {
  pack: CoursePack;
  json: string;
  /** Ilustracje słówek: klucz → oczyszczony kod SVG. */
  images: Record<string, string>;
  /** Uwagi niepsujące kompilacji (np. pliki SVG bez przypisanego słówka). */
  warnings: string[];
}

/** Domyślny klucz ilustracji słówka: identyfikator bez przedrostka „v-”. */
export function imageKeyOf(vocabId: string): string {
  return vocabId.replace(/^v-/, '');
}

export const MAX_SVG_BYTES = 64 * 1024;

/**
 * Sprawdza i lekko odchudza plik SVG ilustracji. Obrazki wyświetlamy przez <img>,
 * więc i tak nie wykonają skryptów — ale odrzucamy je już tu, żeby do kursu
 * nie trafiło nic, co nie jest czystą grafiką.
 */
export function checkSvg(where: string, source: string): string {
  // trim() usuwa też znak BOM (U+FEFF).
  const svg = source
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
  if (Buffer.byteLength(svg) > MAX_SVG_BYTES) fail(where, `plik większy niż ${MAX_SVG_BYTES / 1024} KiB`);
  if (!/^<svg[\s>]/.test(svg) || !svg.endsWith('</svg>')) fail(where, 'to nie jest pojedynczy element <svg>');
  if (!/\sviewBox="[^"]+"/.test(svg.slice(0, svg.indexOf('>')))) fail(where, 'brak atrybutu viewBox w <svg>');
  if (/<script|<foreignObject|<iframe|<image[\s>]/i.test(svg)) fail(where, 'niedozwolony element (script, foreignObject, iframe, image)');
  if (/\son[a-z]+\s*=/i.test(svg)) fail(where, 'niedozwolony atrybut zdarzenia (on…)');
  if (/(?:href|src)\s*=\s*"(?!#)/i.test(svg) || /url\((?!['"]?#)/i.test(svg)) {
    fail(where, 'odwołania wolno robić tylko do elementów w tym samym pliku (#id)');
  }
  // <img> pokazuje SVG tylko z deklaracją przestrzeni nazw.
  return svg.includes('xmlns=') ? svg : svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export function compileCourse(dir: string): CompiledCourse {
  const courseFile = join(dir, 'course.yaml');
  const parsedCourse = CourseSchema.safeParse(yaml.load(readFileSync(courseFile, 'utf8')));
  if (!parsedCourse.success) fail(courseFile, z.prettifyError(parsedCourse.error));
  const course = parsedCourse.data;

  const unitDir = join(dir, 'units');
  const files = existsSync(unitDir)
    ? readdirSync(unitDir).filter((f) => f.endsWith('.yaml')).sort()
    : [];
  if (files.length === 0) fail(dir, 'kurs nie ma żadnych jednostek');

  const usedIds = new Set<string>();
  const uniqueId = (base: string, where: string, explicit?: string): string => {
    if (explicit) {
      if (usedIds.has(explicit)) fail(where, `zdublowany identyfikator "${explicit}"`);
      usedIds.add(explicit);
      return explicit;
    }
    let id = base;
    for (let k = 2; usedIds.has(id); k++) id = `${base}-${k}`;
    usedIds.add(id);
    return id;
  };

  const units: Unit[] = [];
  const allVocab: VocabItem[] = [];

  files.forEach((file, unitIndex) => {
    const where = join(unitDir, file);
    const parsed = UnitSchema.safeParse(yaml.load(readFileSync(where, 'utf8')));
    if (!parsed.success) fail(where, z.prettifyError(parsed.error));
    const src: UnitSrc = parsed.data;
    if (units.some((u) => u.id === src.id)) fail(where, `zdublowana jednostka ${src.id}`);

    const vocab: VocabItem[] = src.vocab.map((v) => ({
      id: uniqueId(`v-${slug(v.t)}`, where, v.id),
      unit: src.id,
      t: v.t,
      n: v.n,
      altT: v.alt_t,
      altN: v.alt_n,
      pos: v.pos,
      gender: v.g,
      article: v.art,
      plural: v.pl,
      forms: v.forms,
      emoji: v.emoji,
      img: v.img,
      note: v.note,
      ex: v.ex ? { t: v.ex[0], n: v.ex[1] } : undefined,
    }));

    const sentences: Sentence[] = src.sentences.map((s, i) => {
      if (s.gap && !matchTokens(s.t).includes(s.gap.toLowerCase().replace(/[’`]/g, "'"))) {
        // Luka może być też z apostrofem (np. "l'") — sprawdzamy dosłownie.
        if (!s.t.toLowerCase().includes(s.gap.toLowerCase())) {
          fail(where, `luka "${s.gap}" nie występuje w zdaniu "${s.t}"`);
        }
      }
      return {
        id: uniqueId(`${src.id}-s${String(i + 1).padStart(2, '0')}`, where, s.id),
        unit: src.id,
        t: s.t,
        n: s.n,
        altT: s.alt_t,
        altN: s.alt_n,
        gap: s.gap,
        gapOptions: s.gap_opts,
        note: s.note,
      };
    });

    const grammar: GrammarArticle[] = src.grammar.map((g) => ({
      id: uniqueId(`g-${g.id}`, where),
      unit: src.id,
      title: g.title,
      summary: g.summary,
      body: g.body.trim(),
      examples: g.examples,
      check: g.check,
    }));

    const conjugations: Conjugation[] = src.conjugations.map((c) => ({
      id: uniqueId(`c-${slug(c.verb)}-${slug(c.tense)}`, where),
      unit: src.id,
      verb: c.verb,
      n: c.n,
      tense: c.tense,
      tenseLabel: c.label,
      forms: c.forms,
      irregular: c.irregular,
      note: c.note,
    }));

    const stories: Story[] = src.stories.map((s) => ({
      id: uniqueId(`st-${s.id}`, where),
      unit: src.id,
      title: s.title,
      emoji: s.emoji,
      intro: s.intro,
      lines: s.lines.map(([speaker, t, n]) => ({ speaker, t, n })),
      questions: s.questions,
    }));

    // Powiązanie zdań ze słówkami (z tej i wcześniejszych jednostek).
    const known = [...allVocab, ...vocab];
    const keyed = known.map((v) => ({ v, keys: vocabKeys(v) }));
    for (const s of sentences) {
      const tokens = matchTokens(s.t);
      s.words = keyed.filter(({ keys }) => keys.some((k) => containsSeq(tokens, k))).map(({ v }) => v.id);
    }

    const lessons = planLessons(src.id, vocab, sentences, grammar, conjugations, stories);
    units.push({
      id: src.id,
      index: unitIndex,
      title: src.title,
      subtitle: src.subtitle,
      cefr: src.cefr,
      icon: src.icon,
      goals: src.goals,
      lessons,
      vocab,
      sentences,
      grammar,
      conjugations,
      stories,
    });
    allVocab.push(...vocab);
  });

  // Ilustracje: plik images/<klucz>.svg; klucz = `img` z YAML albo id słówka bez „v-”.
  const imageDir = join(dir, 'images');
  const imageFiles = existsSync(imageDir)
    ? new Map(readdirSync(imageDir).filter((f) => f.endsWith('.svg')).map((f) => [f.slice(0, -4), join(imageDir, f)]))
    : new Map<string, string>();
  const images: Record<string, string> = {};
  const warnings: string[] = [];
  for (const v of allVocab) {
    const key = v.img ?? imageKeyOf(v.id);
    const file = imageFiles.get(key);
    if (!file) {
      if (v.img) fail(join(imageDir, `${key}.svg`), `słówko "${v.t}" wskazuje ilustrację, której nie ma`);
      delete v.img;
      continue;
    }
    images[key] ??= checkSvg(file, readFileSync(file, 'utf8'));
    v.img = key;
  }
  for (const [key, file] of imageFiles) {
    if (!(key in images)) warnings.push(`${file}: żadne słówko nie używa tej ilustracji`);
  }
  const imageKeys = Object.keys(images).sort();
  const imagesHash = imageKeys.length
    ? createHash('sha256').update(JSON.stringify(imageKeys.map((k) => [k, images[k]]))).digest('hex').slice(0, 16)
    : '';

  const count = <K extends keyof Unit>(k: K) =>
    units.reduce((n, u) => n + (Array.isArray(u[k]) ? (u[k] as unknown[]).length : 0), 0);

  const body = {
    id: course.id,
    title: course.title,
    tagline: course.tagline,
    description: course.description,
    target: course.target,
    native: course.native,
    levels: course.levels,
    color: course.color,
    rules: course.rules,
    units: units.length,
    lessons: count('lessons'),
    words: count('vocab'),
    sentences: count('sentences'),
    grammar: count('grammar'),
    stories: count('stories'),
    images: { count: imageKeys.length, hash: imagesHash },
    unitsData: units,
  };
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  const pack: CoursePack = { ...body, hash, builtAt: new Date().toISOString() };
  return { pack, json: JSON.stringify(pack), images, warnings };
}

const LEARN_CHUNK = 6;

/** Wyrazy, których potrzebują przykłady i pytania tematu teorii (poprawne odpowiedzi i cytaty). */
export function grammarNeeds(g: GrammarArticle): string[] {
  return [
    ...g.examples.map((e) => e.t),
    ...g.check.map((q) => q.options[q.answer]),
    ...g.check.flatMap((q) => [...q.q.matchAll(/[„"«]([^”"»]+)[”"»]/g)].map((m) => m[1])),
    ...g.check.filter((q) => /_{2,}/.test(q.q)).map((q) => q.q.replace(/\([^)]*\)/g, ' ')),
  ].flatMap(matchTokens);
}

/**
 * Dzieli słówka na lekcje. Kolejność autora zostaje, ale słowa potrzebne do teorii nr i
 * trafiają najpóźniej do lekcji nr i — wtedy ścieżka może iść rytmem L1, T1, L2, T2…
 * i każda teoria ćwiczy już poznane słowa.
 */
function chunkVocab(vocab: VocabItem[], grammar: GrammarArticle[], chunkCount: number): VocabItem[][] {
  const byToken = new Map<string, VocabItem>();
  for (const v of vocab) for (const k of vocabKeys(v)) if (k.length === 1 && !byToken.has(k[0])) byToken.set(k[0], v);
  // Wyrażenia wielowyrazowe („fino a”) — po ich dłuższych słowach, jeśli nie są osobnymi hasłami.
  for (const v of vocab) for (const k of vocabKeys(v)) if (k.length > 1) for (const t of k) if (t.length > 2 && !byToken.has(t)) byToken.set(t, v);
  const deadline = new Map<VocabItem, number>();
  grammar.forEach((g, i) => {
    for (const t of grammarNeeds(g)) {
      const v = byToken.get(t);
      if (v && !deadline.has(v)) deadline.set(v, Math.min(i, chunkCount - 1));
    }
  });
  const chunks: VocabItem[][] = Array.from({ length: chunkCount }, () => []);
  const rest = [...vocab];
  for (let c = 0; c < chunkCount; c++) {
    // Rozmiar liczony na bieżąco z tego, co zostało — lekcje wychodzą równe.
    const size = Math.ceil(rest.length / (chunkCount - c));
    const forced = rest.filter((v) => (deadline.get(v) ?? Infinity) <= c);
    const take = new Set(forced);
    for (const v of rest) {
      if (take.size >= size) break;
      take.add(v);
    }
    const chunk = c === chunkCount - 1 ? rest.slice() : rest.filter((v) => take.has(v));
    chunks[c] = chunk;
    for (const v of chunk) rest.splice(rest.indexOf(v), 1);
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Układa ścieżkę jednostki: lekcje słówek przeplatane teorią, potem historyjka,
 * mówienie i sprawdzian. Zdanie trafia do pierwszej lekcji, po której znane są
 * wszystkie jego słówka z tej jednostki.
 */
export function planLessons(
  unitId: string,
  vocab: VocabItem[],
  sentences: Sentence[],
  grammar: GrammarArticle[],
  conjugations: Conjugation[],
  stories: Story[],
): Lesson[] {
  const chunkCount = Math.max(1, Math.round(vocab.length / LEARN_CHUNK));
  const chunks = chunkVocab(vocab, grammar, chunkCount);

  const lessonOfVocab = new Map<string, number>();
  chunks.forEach((c, i) => c.forEach((v) => lessonOfVocab.set(v.id, i)));

  const sentenceBuckets: string[][] = Array.from({ length: chunkCount }, () => []);
  sentences.forEach((s, i) => {
    const idx = (s.words ?? []).map((w) => lessonOfVocab.get(w)).filter((x): x is number => x !== undefined);
    const bucket = idx.length ? Math.max(...idx) : Math.min(chunkCount - 1, Math.floor((i * chunkCount) / sentences.length));
    sentenceBuckets[bucket].push(s.id);
  });

  const learn: Lesson[] = chunks.map((c, i) => ({
    id: `${unitId}-l${i + 1}`,
    unit: unitId,
    kind: 'learn',
    title: [...new Set(c.map((v) => v.n.split(/[;,/]/)[0].trim()))].slice(0, 3).join(', '),
    vocab: c.map((v) => v.id),
    sentences: sentenceBuckets[i],
    conjugations: [],
  }));

  const grammarLessons: Lesson[] = grammar.map((g, i) => ({
    id: `${unitId}-g${i + 1}`,
    unit: unitId,
    kind: 'grammar',
    title: g.title,
    vocab: [],
    sentences: [],
    grammar: g.id,
    // Tabele odmiany przypinamy do teorii, której tytuł wspomina dany czasownik.
    conjugations: conjugations
      .filter((c) => g.title.toLowerCase().includes(c.verb.toLowerCase()) || g.body.toLowerCase().includes(`**${c.verb.toLowerCase()}**`))
      .map((c) => c.id),
  }));

  // Teoria trafia na ścieżkę po lekcji słówek, która wprowadza ostatnie słowo potrzebne
  // do jej przykładów i pytań — żeby nie pytać o coś, czego uczeń jeszcze nie poznał.
  // Bez takich wymagań: przeplot L1, G1, L2, G2… Kolejność tematów teorii zostaje.
  const chunkOfToken = new Map<string, number>();
  // Tylko hasła jednowyrazowe: „a destra” nie może sprawić, że samo „a” przesunie teorię.
  chunks.forEach((c, i) => c.forEach((v) => vocabKeys(v).forEach((k) => {
    if (k.length === 1 && !chunkOfToken.has(k[0])) chunkOfToken.set(k[0], i);
  })));
  chunks.forEach((c, i) => c.forEach((v) => vocabKeys(v).forEach((k) => {
    if (k.length > 1) for (const t of k) if (t.length > 2 && !chunkOfToken.has(t)) chunkOfToken.set(t, i);
  })));
  const after: number[] = [];
  grammar.forEach((g, i) => {
    const need = Math.max(-1, ...grammarNeeds(g).map((t) => chunkOfToken.get(t) ?? -1));
    after.push(Math.min(chunks.length - 1, Math.max(i, need, after[i - 1] ?? 0)));
  });
  const path: Lesson[] = [];
  learn.forEach((l, c) => {
    path.push(l);
    grammarLessons.forEach((g, i) => after[i] === c && path.push(g));
  });

  stories.forEach((s, i) => path.push({
    id: `${unitId}-st${i + 1}`,
    unit: unitId,
    kind: 'story',
    title: s.title,
    vocab: [],
    sentences: [],
    story: s.id,
    conjugations: [],
  }));

  path.push({
    id: `${unitId}-sp`,
    unit: unitId,
    kind: 'speak',
    title: 'Mówienie i wymowa',
    vocab: vocab.map((v) => v.id),
    sentences: sentences.map((s) => s.id),
    conjugations: [],
  });
  path.push({
    id: `${unitId}-test`,
    unit: unitId,
    kind: 'test',
    title: 'Sprawdzian jednostki',
    vocab: vocab.map((v) => v.id),
    sentences: sentences.map((s) => s.id),
    conjugations: conjugations.map((c) => c.id),
  });
  return path;
}

export function listCourseDirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'course.yaml')))
    .map((d) => join(root, d.name))
    .sort();
}
