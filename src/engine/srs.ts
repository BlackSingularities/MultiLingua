// Powtórki rozłożone w czasie — uproszczony model pamięci w duchu FSRS.
// `stab` to liczba dni, po których prawdopodobieństwo przypomnienia spada do 90%.

export const DAY = 86_400_000;

export type ItemKind = 'v' | 's' | 'c';

export interface SrsState {
  /** `${course}:${item}` */
  key: string;
  course: string;
  item: string;
  kind: ItemKind;
  due: number;
  stab: number;
  diff: number;
  reps: number;
  lapses: number;
  last: number;
  /** Ile razy z rzędu poprawnie. */
  streak: number;
}

/** 0 — błąd, 1 — z trudem (literówka, akcent, podpowiedź), 2 — dobrze, 3 — łatwo (produkcja bez wahania). */
export type SrsGrade = 0 | 1 | 2 | 3;

const INITIAL_STAB = [0.08, 0.4, 1, 2.5];
const GROWTH = [0, 0.7, 1.6, 2.6];

export function retrievability(s: Pick<SrsState, 'stab' | 'last'>, now: number): number {
  const elapsed = Math.max(0, (now - s.last) / DAY);
  return Math.exp((Math.log(0.9) * elapsed) / Math.max(s.stab, 0.01));
}

export function review(
  prev: SrsState | undefined,
  base: { course: string; item: string; kind: ItemKind },
  grade: SrsGrade,
  now: number,
): SrsState {
  if (!prev) {
    const stab = INITIAL_STAB[grade];
    return {
      key: `${base.course}:${base.item}`,
      ...base,
      stab,
      diff: grade === 0 ? 6.5 : grade === 1 ? 5.8 : grade === 2 ? 5 : 4,
      reps: 1,
      lapses: grade === 0 ? 1 : 0,
      last: now,
      due: now + stab * DAY,
      streak: grade === 0 ? 0 : 1,
    };
  }

  const elapsedDays = Math.max(0, (now - prev.last) / DAY);
  const r = retrievability(prev, now);
  let { stab, diff } = prev;

  if (grade === 0) {
    stab = Math.max(0.05, stab * 0.3);
    diff = Math.min(10, diff + 0.9);
  } else {
    // Im trudniej było sobie przypomnieć (niższe R), tym większy przyrost — efekt „trudnej powtórki”.
    let growth = 1 + GROWTH[grade] * ((11 - diff) / 10) * (1 + (1 - r) * 2.2);
    // Powtórka zaraz po poprzedniej (w tej samej sesji) prawie nie wzmacnia pamięci.
    if (elapsedDays < prev.stab * 0.15) growth = 1 + (growth - 1) * 0.15;
    stab = Math.min(365, stab * growth);
    diff = Math.min(10, Math.max(1, diff + (grade === 1 ? 0.3 : grade === 2 ? -0.15 : -0.4)));
  }

  return {
    ...prev,
    stab,
    diff,
    reps: prev.reps + 1,
    lapses: prev.lapses + (grade === 0 ? 1 : 0),
    last: now,
    due: now + stab * DAY,
    streak: grade === 0 ? 0 : prev.streak + 1,
  };
}

/** Siła opanowania 0–1: świeżość wspomnienia × dojrzałość (stabilność do ~3 tygodni). */
export function strength(s: SrsState | undefined, now: number): number {
  if (!s) return 0;
  const maturity = Math.min(1, Math.log1p(s.stab) / Math.log1p(21));
  return Math.max(0, Math.min(1, retrievability(s, now) * (0.25 + 0.75 * maturity)));
}

/** Poziom trudności ćwiczeń dla elementu: 0 rozpoznawanie, 1 rozumienie, 2 produkcja. */
export function stage(s: SrsState | undefined, now: number): 0 | 1 | 2 {
  const x = strength(s, now);
  if (!s || x < 0.3) return 0;
  if (x < 0.6) return 1;
  return 2;
}

export function isDue(s: SrsState, now: number): boolean {
  return s.due <= now;
}
