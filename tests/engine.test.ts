import { describe, expect, it } from 'vitest';
import { checkAnswer, levenshtein, normalize, speechScore, tokenize, wordDiff } from '../src/engine/text.ts';
import { DAY, review, stage, strength } from '../src/engine/srs.ts';
import { numberAnswers, numberToWords } from '../src/engine/numbers.ts';

describe('normalize i tokenize', () => {
  it('ujednolica interpunkcję, wielkość liter i apostrofy', () => {
    expect(normalize('  Ciao,   Marco! ')).toBe('ciao marco');
    expect(normalize('L’amico')).toBe("l'amico");
    expect(normalize("l' amico")).toBe("l'amico");
  });

  it('dzieli elizje na osobne kafelki', () => {
    expect(tokenize("Anch'io sto bene.")).toEqual(["Anch'", 'io', 'sto', 'bene']);
    expect(tokenize('Grazie! — Prego!')).toEqual(['Grazie', 'Prego']);
  });
});

describe('checkAnswer', () => {
  const drop = ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro'];

  it('akceptuje dokładną odpowiedź niezależnie od interpunkcji', () => {
    expect(checkAnswer('io sono anna', ['Io sono Anna.']).grade).toBe('correct');
  });

  it('pozwala pominąć zaimek osobowy w językach pro-drop', () => {
    expect(checkAnswer('Sono Anna', ['Io sono Anna.'], { dropPronouns: drop }).ok).toBe(true);
  });

  it('rozpoznaje brak akcentu jako drobny błąd', () => {
    const r = checkAnswer('Lei e molto gentile', ['Lei è molto gentile.']);
    expect(r.ok).toBe(true);
    expect(r.grade).toBe('accent');
  });

  it('wybacza jedną literówkę w dłuższym słowie', () => {
    const r = checkAnswer('arrivedrci', ['arrivederci']);
    expect(r.ok).toBe(true);
    expect(r.grade).toBe('typo');
  });

  it('nie wybacza literówek w krótkich słowach', () => {
    expect(checkAnswer('sei', ['sie']).ok).toBe(false);
  });

  it('nie uznaje innego zdania za literówkę', () => {
    expect(checkAnswer('Sono Marco', ['Sono Anna']).ok).toBe(false);
  });

  it('tryb dokładny (kafelki) nie toleruje różnic', () => {
    expect(checkAnswer('io sono anna', ['Io sono Anna'], { exact: true }).ok).toBe(true);
    expect(checkAnswer('io sono ana', ['Io sono Anna'], { exact: true }).ok).toBe(false);
  });

  it('akceptuje alternatywne tłumaczenia', () => {
    expect(checkAnswer('Dobrze, dziękuję', ['Mam się dobrze, dziękuję.', 'Dobrze, dziękuję.']).grade).toBe('correct');
  });
});

describe('levenshtein', () => {
  it('liczy przestawienie liter jako jeden błąd', () => {
    expect(levenshtein('grazie', 'garzie')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('speechScore i wordDiff', () => {
  it('ocenia wypowiedź po słowach', () => {
    expect(speechScore(['ciao mi chiamo marco'], 'Ciao, mi chiamo Marco.')).toBe(1);
    expect(speechScore(['ciao mi chiamo'], 'Ciao, mi chiamo Marco.')).toBe(0.75);
    expect(speechScore(['zupełnie coś innego', 'ciao mi chiamo marco'], 'Ciao, mi chiamo Marco.')).toBe(1);
  });

  it('wskazuje brakujące słowa', () => {
    const d = wordDiff('ciao chiamo marco', 'Ciao, mi chiamo Marco.');
    expect(d.map((w) => w.ok)).toEqual([true, false, true, true]);
  });
});

describe('SRS', () => {
  const base = { course: 'pl-it', item: 'v-ciao', kind: 'v' as const };
  const t0 = Date.UTC(2026, 0, 1);

  it('nowy element po dobrej odpowiedzi wraca po około dniu', () => {
    const s = review(undefined, base, 2, t0);
    expect(s.stab).toBe(1);
    expect(s.due).toBe(t0 + DAY);
  });

  it('kolejne dobre odpowiedzi w odstępach wydłużają interwał', () => {
    let s = review(undefined, base, 2, t0);
    const intervals: number[] = [];
    let now = t0;
    for (let i = 0; i < 4; i++) {
      now = s.due;
      s = review(s, base, 2, now);
      intervals.push(s.stab);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('powtórka w tej samej sesji prawie nie wzmacnia pamięci', () => {
    const s1 = review(undefined, base, 2, t0);
    const s2 = review(s1, base, 3, t0 + 60_000);
    expect(s2.stab).toBeLessThan(s1.stab * 1.6);
  });

  it('błąd mocno skraca interwał i podnosi trudność', () => {
    let s = review(undefined, base, 2, t0);
    s = review(s, base, 2, s.due);
    const before = s;
    s = review(s, base, 0, s.due);
    expect(s.stab).toBeLessThan(before.stab);
    expect(s.diff).toBeGreaterThan(before.diff);
    expect(s.lapses).toBe(1);
  });

  it('siła rośnie z dojrzałością i spada z czasem', () => {
    expect(stage(review(undefined, base, 0, t0), t0)).toBe(0);
    expect(stage(review(undefined, base, 2, t0), t0)).toBe(1);
    let s = review(undefined, base, 3, t0);
    for (let i = 0; i < 6; i++) s = review(s, base, 3, s.due);
    expect(strength(s, s.last)).toBeGreaterThan(0.6);
    expect(strength(s, s.last + 400 * DAY)).toBeLessThan(strength(s, s.last));
  });
});

describe('liczebniki', () => {
  it('włoskie', () => {
    expect(numberToWords('it', 21)).toBe('ventuno');
    expect(numberToWords('it', 28)).toBe('ventotto');
    expect(numberToWords('it', 33)).toBe('trentatré');
    expect(numberToWords('it', 17)).toBe('diciassette');
    expect(numberAnswers('it', 43)).toContain('quarantatre');
  });

  it('hiszpańskie', () => {
    expect(numberToWords('es', 22)).toBe('veintidós');
    expect(numberToWords('es', 45)).toBe('cuarenta y cinco');
    expect(numberToWords('es', 100)).toBe('cien');
  });

  it('angielskie', () => {
    expect(numberToWords('en', 99)).toBe('ninety-nine');
    expect(numberAnswers('en', 100)).toContain('a hundred');
  });

  it('nieobsługiwany język', () => {
    expect(numberToWords('xx', 5)).toBeNull();
  });
});
