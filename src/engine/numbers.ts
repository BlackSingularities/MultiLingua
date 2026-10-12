// Liczebniki słownie (0–100) do ćwiczeń z liczbami. Zwraca null dla języków bez reguł.

const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
  'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function it(n: number): string {
  if (n < 20) return IT_UNITS[n];
  if (n === 100) return 'cento';
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return IT_TENS[t];
  // Dziesiątki tracą samogłoskę przed „uno” i „otto”; „tre” na końcu dostaje akcent.
  const tens = u === 1 || u === 8 ? IT_TENS[t].slice(0, -1) : IT_TENS[t];
  return tens + (u === 3 ? 'tré' : IT_UNITS[u]);
}

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const ES_TWENTIES = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

function es(n: number): string {
  if (n < 20) return ES_UNITS[n];
  if (n < 30) return ES_TWENTIES[n - 20];
  if (n === 100) return 'cien';
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? ES_TENS[t] : `${ES_TENS[t]} y ${ES_UNITS[u]}`;
}

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function en(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n === 100) return 'one hundred';
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? EN_TENS[t] : `${EN_TENS[t]}-${EN_UNITS[u]}`;
}

const RULES: Record<string, (n: number) => string> = { it, es, en };

export function numberToWords(lang: string, n: number): string | null {
  const f = RULES[lang];
  if (!f || n < 0 || n > 100 || !Number.isInteger(n)) return null;
  return f(n);
}

/** Akceptowane warianty zapisu (np. „one hundred” i „a hundred”). */
export function numberAnswers(lang: string, n: number): string[] {
  const main = numberToWords(lang, n);
  if (!main) return [];
  const out = [main];
  if (lang === 'en' && n === 100) out.push('a hundred', 'hundred');
  if (lang === 'it' && n % 10 === 3 && n > 20) out.push(main.replace(/tré$/, 'tre'));
  return out;
}

export function supportsNumbers(lang: string): boolean {
  return lang in RULES;
}
