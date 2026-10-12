import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CourseIndex } from '../engine/course.ts';
import type { AnswerOutcome } from '../engine/types.ts';
import { tokenize } from '../engine/text.ts';
import { useApp } from '../data/store.ts';

export interface ExProps<T> {
  ex: T;
  course: CourseIndex;
  /** Po sprawdzeniu — blokada edycji. */
  locked: boolean;
  /** Wynik po sprawdzeniu (do podświetleń). */
  outcome: AnswerOutcome | null;
  /** Rejestruje funkcję sprawdzającą; null = przycisk „Sprawdź” nieaktywny. */
  setCheck: (fn: (() => AnswerOutcome) | null) => void;
  /** Ćwiczenie samo się kończy (pary, karta słówka, teoria). `silent` = bez panelu oceny. */
  finish: (o: AnswerOutcome, silent?: boolean) => void;
}

/** Tekst w języku docelowym z podpowiedziami słówek po dotknięciu wyrazu. */
export function HintText({ text, course, big }: { text: string; course: CourseIndex; big?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const parts = text.split(/(\s+)/);
  // Przy jednym–dwóch słowach podpowiedź zdradzałaby odpowiedź.
  if (parts.filter((p) => p.trim()).length < 3) {
    return (
      <p className={`hint-text${big ? ' big' : ''}`} lang={course.pack.target.code}>
        {text}
      </p>
    );
  }
  let wordIdx = -1;
  return (
    <p className={`hint-text${big ? ' big' : ''}`} lang={course.pack.target.code}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) return p;
        wordIdx++;
        const idx = wordIdx;
        const tokens = tokenize(p);
        const v = tokens.map((t) => course.lookup(t)).find(Boolean);
        if (!v) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="hint-word-wrap">
            <button type="button" className="hint-word" onClick={() => setOpen(open === idx ? null : idx)} aria-expanded={open === idx}>
              {p}
            </button>
            {open === idx && (
              <span className="hint-pop" role="tooltip">
                <strong>{course.withArticle(v)}</strong> {v.n}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}

/** Pole odpowiedzi z klawiaturą znaków specjalnych języka. */
export function AnswerInput({
  value, onChange, course, multiline, locked, placeholder, autoFocus = true, lang, inputRef, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  course: CourseIndex;
  multiline?: boolean;
  locked: boolean;
  placeholder: string;
  autoFocus?: boolean;
  lang: 't' | 'n';
  inputRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onEnter?: () => void;
}) {
  const own = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const ref = inputRef ?? own;
  useEffect(() => {
    if (autoFocus && !locked) ref.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, locked]);

  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return onChange(value + ch);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const chars = lang === 't' ? course.rules.specialChars : ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'];
  const common = {
    value,
    disabled: locked,
    placeholder,
    spellCheck: false,
    autoCapitalize: 'none',
    autoCorrect: 'off',
    autoComplete: 'off',
    lang: lang === 't' ? course.pack.target.code : 'pl',
    className: 'answer-input',
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnter?.();
      }
    },
  } as const;
  return (
    <div className="answer-box">
      {multiline ? (
        <textarea {...common} rows={3} ref={ref as RefObject<HTMLTextAreaElement>} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" ref={ref as RefObject<HTMLInputElement>} onChange={(e) => onChange(e.target.value)} />
      )}
      {!locked && chars.length > 0 && (
        <div className="char-row" aria-label="Znaki specjalne">
          {chars.map((c) => (
            <button key={c} type="button" className="char-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Klawisze 1–9 wybierają opcję. */
export function useNumberKeys(count: number, onPick: (i: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) {
        e.preventDefault();
        onPick(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onPick, enabled]);
}

export function Instruction({ children }: { children: React.ReactNode }) {
  return <h2 className="ex-title">{children}</h2>;
}

export function useHard() {
  return useApp((s) => s.settings.hard);
}
