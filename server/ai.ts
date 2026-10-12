// Generowanie treści kursu przez OpenRouter. Model dostaje pełny kontekst:
// reguły kursu, to, czego uczeń już się nauczył (słówka, gramatyka), oraz
// wzorcowy plik jednostki — i ma zwrócić gotowy plik YAML nowego rozdziału.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export interface UnitBrief {
  /** Tytuł rozdziału w języku kursu, np. „Al mercato”. */
  title: string;
  /** Temat i sytuacje komunikacyjne. */
  topic: string;
  cefr: string;
  /** Na czym ma się skupić gramatyka (może być puste — model sam zaproponuje kolejny krok). */
  grammar?: string;
  words?: number;
  sentences?: number;
  stories?: number;
  notes?: string;
}

interface UnitSrc {
  id?: string;
  title?: string;
  subtitle?: string;
  cefr?: string;
  goals?: string[];
  vocab?: { t: string; n: string; pos?: string }[];
  grammar?: { id: string; title: string; summary: string }[];
  conjugations?: { verb: string; label: string }[];
}

export interface CourseContext {
  courseYaml: string;
  units: { file: string; src: UnitSrc }[];
  example: string;
  nextIndex: number;
}

export function loadCourseContext(courseDir: string): CourseContext {
  const courseYaml = readFileSync(join(courseDir, 'course.yaml'), 'utf8');
  const unitDir = join(courseDir, 'units');
  const files = existsSync(unitDir) ? readdirSync(unitDir).filter((f) => f.endsWith('.yaml')).sort() : [];
  const units = files.map((f) => {
    let src: UnitSrc = {};
    try {
      src = (yaml.load(readFileSync(join(unitDir, f), 'utf8')) as UnitSrc) ?? {};
    } catch {
      /* uszkodzony plik pomijamy w kontekście */
    }
    return { file: `units/${f}`, src };
  });
  const example = files.length ? readFileSync(join(unitDir, files[0]), 'utf8') : '';
  const nextIndex = units.reduce((m, u) => Math.max(m, Number(u.src.id?.slice(1)) || 0), 0) + 1;
  return { courseYaml, units, example, nextIndex };
}

/** Podsumowanie dotychczasowego materiału — model ma budować na tym, co uczeń zna. */
function progression(ctx: CourseContext, skipFile?: string): string {
  return ctx.units
    .filter((u) => u.file !== skipFile)
    .map(({ file, src }) => {
      const vocab = (src.vocab ?? []).map((v) => `${v.t}=${v.n}`).join('; ');
      const grammar = (src.grammar ?? []).map((g) => `„${g.title}” (${g.summary})`).join('; ');
      const conj = (src.conjugations ?? []).map((c) => `${c.verb} (${c.label})`).join(', ');
      return [
        `## ${src.id ?? '?'} ${src.title ?? ''} — ${src.subtitle ?? ''} [${src.cefr ?? ''}] (${file})`,
        `Cele: ${(src.goals ?? []).join(' | ')}`,
        `Gramatyka: ${grammar || '—'}`,
        `Odmiany: ${conj || '—'}`,
        `Słownictwo: ${vocab}`,
      ].join('\n');
    })
    .join('\n\n');
}

const RULES = `
ZASADY PEDAGOGICZNE (najważniejsze):
1. Rozdział jest kolejnym krokiem po materiale, który uczeń już zna (lista poniżej). Nie powtarzaj słówek,
   które już są w kursie — chyba że w nowej formie (wtedy dodaj je w "forms" nowego słówka, a nie jako duplikat).
2. Zdania (sentences), przykłady i historyjki używają WYŁĄCZNIE słów z tego rozdziału i z wcześniejszych.
   Każde słowo ze zdań (poza imionami i nazwami własnymi) musi być w "vocab" tego lub wcześniejszego rozdziału
   (także formy odmienione — dopisz je w "forms").
3. Gramatyka rozwija poziom krok po kroku: jeden–dwa nowe zagadnienia, które naturalnie wynikają z poprzednich.
   Każdy artykuł gramatyczny dziel na krótkie kroki nagłówkami "### ". Każdy krok:
   - tłumaczy JEDNĄ rzecz po polsku, z porównaniem do polszczyzny, gdy pomaga,
   - pokazuje konkretne formy w języku kursu *kursywą* albo **pogrubieniem** (z nich aplikacja buduje ćwiczenia
     zaraz po tym kroku — więc wyróżniaj właśnie te formy, które uczeń ma przećwiczyć),
   - ma pasujące zdania w "sentences" i przykłady w "examples" zawierające te formy.
   Krok ma 40–120 słów. Używaj tabel Markdown dla odmian i wskazówek "> " dla pułapek.
4. "check" to 3–5 pytań sprawdzających zrozumienie (dokładnie jedna poprawna odpowiedź, bez powtórzeń w opcjach).
5. Słownictwo dobieraj tak, żeby miało sens w tej chwili nauki: najpierw słowa potrzebne do sytuacji z tematu,
   potrzebne do zdań i historyjki. Dodaj "emoji" tylko wtedy, gdy jednoznacznie przedstawia słowo.
6. Zdania: naturalne, krótkie (3–10 słów), z wariantami tłumaczeń w alt_n (różne poprawne polskie wersje).
   "gap" to słowo z danego zdania, które warto wyciąć w ćwiczeniu z luką (najlepiej forma z gramatyki rozdziału).
7. Historyjka: dialog 6–10 kwestii [mówiący, tekst w języku kursu, tłumaczenie], 2–4 pytania po polsku.
8. Odmiany (conjugations): tabele dla czasowników z gramatyki rozdziału, dokładnie 6 form w kolejności osób z kursu.

FORMAT:
- Zwróć WYŁĄCZNIE jeden blok \`\`\`yaml z całym plikiem rozdziału — bez komentarzy przed ani po.
- Struktura i nazwy pól dokładnie jak we wzorcu: id, title, subtitle, cefr, icon, goals, vocab, sentences,
  grammar (id, title, summary, body, examples, check), conjugations, stories.
- Pola słówek: t, n, alt_t, alt_n, pos (noun|verb|adj|adv|pron|prep|conj|num|interj|phrase|det), g (m|f|mf),
  art (rodzajnik określony), pl (liczba mnoga), forms, emoji, note, ex: [zdanie, tłumaczenie].
- Identyfikatory gramatyki i historyjek: krótkie, małe litery, myślniki, unikalne w całym kursie.
- Teksty z dwukropkiem, cudzysłowem lub zaczynające się od znaków specjalnych bierz w cudzysłów.
- Nie dodawaj pola "img" — ilustracje dodaje administrator osobno.
`;

export function unitPrompt(ctx: CourseContext, brief: UnitBrief): { system: string; user: string; id: string } {
  const id = `u${String(ctx.nextIndex).padStart(2, '0')}`;
  const system = `Jesteś metodykiem i autorem kursów językowych dla Polaków. Piszesz treść aplikacji MultiLingua:
teoria podawana jest małymi krokami i zaraz po każdym kroku uczeń ćwiczy dokładnie to, o czym przeczytał.
Wszystkie wyjaśnienia piszesz poprawną polszczyzną (z polskimi znakami), krótko i konkretnie.
${RULES}`;
  const user = `KURS (course.yaml):
\`\`\`yaml
${ctx.courseYaml.trim()}
\`\`\`

CO UCZEŃ JUŻ ZNA (kolejne rozdziały):
${progression(ctx) || '— to pierwszy rozdział kursu —'}

WZORZEC PLIKU ROZDZIAŁU (format, nie treść):
\`\`\`yaml
${ctx.example.slice(0, 12000)}
\`\`\`

NAPISZ NOWY ROZDZIAŁ:
- id: ${id}
- tytuł (w języku kursu): ${brief.title}
- temat i sytuacje: ${brief.topic}
- poziom: ${brief.cefr}
- gramatyka: ${brief.grammar?.trim() || 'zaproponuj naturalny następny krok po dotychczasowej gramatyce'}
- około ${brief.words ?? 30} słówek, ${brief.sentences ?? 22} zdań, ${brief.stories ?? 1} historyjka/historyjki,
  1–2 artykuły gramatyczne podzielone na kroki
${brief.notes?.trim() ? `- dodatkowe wskazówki: ${brief.notes.trim()}` : ''}`;
  return { system, user, id };
}

export function revisePrompt(ctx: CourseContext, file: string, text: string, instruction: string, errors: string[]): { system: string; user: string } {
  const system = `Jesteś redaktorem kursu językowego MultiLingua dla Polaków. Poprawiasz plik rozdziału YAML
według polecenia, zachowując wszystko, czego polecenie nie dotyczy.
${RULES}`;
  const user = `KURS (course.yaml):
\`\`\`yaml
${ctx.courseYaml.trim()}
\`\`\`

WCZEŚNIEJSZE ROZDZIAŁY:
${progression(ctx, file) || '—'}

PLIK DO POPRAWY (${file}):
\`\`\`yaml
${text}
\`\`\`
${errors.length ? `\nBŁĘDY WALIDACJI DO NAPRAWIENIA:\n${errors.map((e) => `- ${e}`).join('\n')}\n` : ''}
POLECENIE: ${instruction.trim() || 'Napraw błędy walidacji, nic więcej nie zmieniaj.'}

Zwróć cały poprawiony plik w jednym bloku \`\`\`yaml.`;
  return { system, user };
}

/** Wyciąga YAML z odpowiedzi modelu (blok kodu albo cała odpowiedź). */
export function extractYaml(answer: string): string {
  const block = /```(?:ya?ml)?\s*\n([\s\S]*?)```/i.exec(answer);
  return `${(block ? block[1] : answer).trim()}\n`;
}

export interface ChatResult {
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

export async function chat(
  opts: { apiKey: string; model: string; fetchImpl?: typeof fetch; referer?: string },
  system: string,
  user: string,
): Promise<ChatResult> {
  const res = await (opts.fetchImpl ?? fetch)(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': opts.referer ?? 'https://redzikowski.com/multilingua/',
      'X-Title': 'MultiLingua — panel administratora',
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.5,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
    usage?: ChatResult['usage'];
    error?: { message?: string };
  } | null;
  if (!res.ok || !body) throw new Error(`OpenRouter: ${body?.error?.message ?? `błąd ${res.status}`}`);
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter: model nie zwrócił treści.');
  return { text, model: body.model ?? opts.model, usage: body.usage };
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number;
  /** Cena w USD za milion tokenów wejścia / wyjścia. */
  promptPrice: number;
  completionPrice: number;
}

export async function listModels(fetchImpl: typeof fetch = fetch): Promise<ModelInfo[]> {
  const res = await fetchImpl(`${OPENROUTER_URL}/models`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OpenRouter: nie udało się pobrać listy modeli (${res.status}).`);
  const body = (await res.json()) as {
    data: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[];
  };
  return body.data
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      context: m.context_length ?? 0,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1e6,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1e6,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
