// Porównywanie odpowiedzi: tolerancja literówek, akcentów i pomijanych zaimków.

const PUNCT = /[.,!?¿¡;:"«»“”„()…—–\-]/g;

/** Postać kanoniczna do porównań: małe litery, bez interpunkcji, jednolite apostrofy. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’`´ʼ]/g, "'")
    .replace(PUNCT, ' ')
    .replace(/'\s+/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFC');
}

/** Odległość edycyjna z przestawieniem sąsiednich liter jako jednym błędem (OSA). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Dzieli tekst na kafelki: słowa bez interpunkcji, elizje (l', dell') jako osobne kafelki. */
export function tokenize(text: string): string[] {
  return text
    .replace(/[’`´ʼ]/g, "'")
    .replace(/[.,!?¿¡;:"«»“”„()…]/g, ' ')
    .replace(/\s[—–-]\s/g, ' ')
    .split(/\s+/)
    .flatMap((w) => {
      const m = w.match(/^(\p{L}+')(\p{L}.*)$/u);
      return m ? [m[1], m[2]] : [w];
    })
    .filter(Boolean);
}

export type Grade = 'correct' | 'accent' | 'typo' | 'wrong';

export interface CheckResult {
  ok: boolean;
  grade: Grade;
  /** Najbliższa poprawna odpowiedź w oryginalnej pisowni. */
  best: string;
}

export interface CheckOptions {
  dropPronouns?: string[];
  /** Kafelki i wybór — bez tolerancji literówek. */
  exact?: boolean;
}

/** Rozszerza listę odpowiedzi o warianty bez zaimka osobowego (Io sono → Sono). */
export function expandAnswers(answers: string[], dropPronouns: string[] = []): { shown: string; norm: string }[] {
  const out = new Map<string, string>();
  const drop = new Set(dropPronouns.map((p) => p.toLowerCase()));
  for (const a of answers) {
    const n = normalize(a);
    if (!out.has(n)) out.set(n, a);
    const words = n.split(' ');
    if (words.length > 1 && drop.has(words[0])) {
      const rest = words.slice(1).join(' ');
      if (!out.has(rest)) out.set(rest, a);
    }
  }
  return [...out].map(([norm, shown]) => ({ norm, shown }));
}

export function typoBudget(len: number): number {
  if (len < 4) return 0;
  if (len < 9) return 1;
  if (len < 20) return 2;
  return 3;
}

export function checkAnswer(input: string, answers: string[], opts: CheckOptions = {}): CheckResult {
  const given = normalize(input);
  const variants = expandAnswers(answers, opts.dropPronouns);
  if (!given) return { ok: false, grade: 'wrong', best: answers[0] ?? '' };

  for (const v of variants) if (v.norm === given) return { ok: true, grade: 'correct', best: v.shown };
  if (opts.exact) {
    return { ok: false, grade: 'wrong', best: closest(given, variants) };
  }

  const givenBare = stripAccents(given);
  for (const v of variants) {
    if (stripAccents(v.norm) === givenBare) return { ok: true, grade: 'accent', best: v.shown };
  }

  let bestDist = Infinity;
  let bestShown = answers[0] ?? '';
  for (const v of variants) {
    const d = levenshtein(givenBare, stripAccents(v.norm));
    if (d < bestDist) {
      bestDist = d;
      bestShown = v.shown;
    }
  }
  // Literówkę wybaczamy tylko, jeśli liczba słów się zgadza — inaczej to inne zdanie.
  const sameWordCount = variants.some((v) => v.shown === bestShown && v.norm.split(' ').length === given.split(' ').length);
  if (bestDist <= typoBudget(givenBare.length) && sameWordCount) {
    return { ok: true, grade: 'typo', best: bestShown };
  }
  return { ok: false, grade: 'wrong', best: bestShown };
}

function closest(given: string, variants: { shown: string; norm: string }[]): string {
  let best = variants[0]?.shown ?? '';
  let bestDist = Infinity;
  for (const v of variants) {
    const d = levenshtein(given, v.norm);
    if (d < bestDist) {
      bestDist = d;
      best = v.shown;
    }
  }
  return best;
}

/** Ocena wypowiedzi z rozpoznawania mowy: odsetek słów wzorca, które padły (w kolejności). */
export function speechScore(heard: string[], target: string): number {
  const want = stripAccents(normalize(target)).split(' ').filter(Boolean);
  if (!want.length) return 0;
  let best = 0;
  for (const h of heard) {
    const got = stripAccents(normalize(h)).split(' ').filter(Boolean);
    // Najdłuższy wspólny podciąg słów, z tolerancją jednej litery w dłuższych słowach.
    const dp: number[][] = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
    for (let i = 1; i <= want.length; i++) {
      for (let j = 1; j <= got.length; j++) {
        const same = want[i - 1] === got[j - 1] || (want[i - 1].length > 4 && levenshtein(want[i - 1], got[j - 1]) <= 1);
        dp[i][j] = same ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    best = Math.max(best, dp[want.length][got.length] / want.length);
  }
  return best;
}

/** Porównanie słowo po słowie do podświetlenia błędów w odpowiedzi. */
export function wordDiff(given: string, correct: string): { word: string; ok: boolean }[] {
  const g = normalize(given).split(' ').filter(Boolean);
  const c = tokenize(correct);
  const cn = c.map((w) => stripAccents(normalize(w)));
  const gn = g.map((w) => stripAccents(w));
  const dp: number[][] = Array.from({ length: c.length + 1 }, () => new Array(g.length + 1).fill(0));
  for (let i = 1; i <= c.length; i++) {
    for (let j = 1; j <= g.length; j++) {
      dp[i][j] = cn[i - 1] === gn[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matched = new Set<number>();
  for (let i = c.length, j = g.length; i > 0 && j > 0;) {
    if (cn[i - 1] === gn[j - 1]) {
      matched.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return c.map((word, i) => ({ word, ok: matched.has(i) }));
}
