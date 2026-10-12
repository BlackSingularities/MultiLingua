// Ćwiczenia specjalne: pary, mówienie, teoria, historyjka, kolejność dialogu.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise } from '../engine/types.ts';
import { shuffle } from '../engine/generator.ts';
import { speechScore, wordDiff } from '../engine/text.ts';
import { useApp } from '../data/store.ts';
import { listen, MicError, stopSpeaking, type Listening } from '../platform/speech.ts';
import { sfx } from '../platform/sfx.ts';
import { Icon } from '../components/Icon.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { Say, SpeakButton, useSpeech } from '../components/ui.tsx';
import { HintText, Instruction, type ExProps } from './shared.tsx';

type Of<T extends Exercise['type']> = Extract<Exercise, { type: T }>;

export function PairsEx({ ex, course, finish }: ExProps<Of<'pairs'>>) {
  const left = useMemo(() => shuffle(ex.pairs, Math.random), [ex]);
  const right = useMemo(() => shuffle(ex.pairs, Math.random), [ex]);
  const [sel, setSel] = useState<{ side: 'l' | 'r'; id: string } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState<string[]>([]);
  const mistakes = useRef(0);
  const { say, audioOn } = useSpeech();
  const sound = useApp((s) => s.settings.sound);

  const pick = (side: 'l' | 'r', id: string, text: string) => {
    if (done.has(id)) return;
    if (side === 'l' && audioOn) void say(text);
    if (!sel || sel.side === side) {
      setSel({ side, id });
      return;
    }
    if (sel.id === id) {
      const next = new Set(done).add(id);
      setDone(next);
      setSel(null);
      if (sound) sfx.tap();
      if (next.size === ex.pairs.length) {
        setTimeout(() => finish({ ok: mistakes.current <= 1, correct: 'Wszystkie pary dopasowane' }, true), 350);
      }
    } else {
      mistakes.current++;
      setBad([`${sel.side}${sel.id}`, `${side}${id}`]);
      setSel(null);
      setTimeout(() => setBad([]), 500);
    }
  };

  const cls = (side: 'l' | 'r', id: string) =>
    `pair${done.has(id) ? ' pair-done' : ''}${sel?.side === side && sel.id === id ? ' pair-sel' : ''}${bad.includes(`${side}${id}`) ? ' pair-bad' : ''}`;

  return (
    <div className="ex">
      <Instruction>Połącz w pary</Instruction>
      <div className="pairs">
        <div className="pairs-col" lang={course.pack.target.code}>
          {left.map((p) => (
            <button key={p.id} type="button" className={cls('l', p.id)} disabled={done.has(p.id)} onClick={() => pick('l', p.id, p.t)}>
              {p.t}
            </button>
          ))}
        </div>
        <div className="pairs-col" lang="pl">
          {right.map((p) => (
            <button key={p.id} type="button" className={cls('r', p.id)} disabled={done.has(p.id)} onClick={() => pick('r', p.id, p.t)}>
              {p.n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpeakEx({ ex, course, finish, dedicated }: ExProps<Of<'speak'>>) {
  const { micOn, sttOk, lang } = useSpeech();
  const speakingEnabled = useApp((s) => s.settings.speaking);
  const muteFor = useApp((s) => s.muteFor);
  const [state, setState] = useState<'idle' | 'listening' | 'result'>('idle');
  const [heard, setHeard] = useState('');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Listening | null>(null);

  useEffect(() => () => session.current?.stop(), []);

  const start = useCallback(async () => {
    stopSpeaking();
    setError(null);
    setHeard('');
    setState('listening');
    const l = listen(lang, (partial) => setHeard(partial));
    session.current = l;
    try {
      const alts = await l.result;
      const s = speechScore(alts, ex.text);
      setScore(s);
      setHeard(alts[0] ?? '');
      setState('result');
      const n = attempts + 1;
      setAttempts(n);
      if (s >= 0.8) setTimeout(() => finish({ ok: true, partial: s < 0.95 ? 'typo' : undefined, correct: ex.text, given: alts[0] }), 700);
      else if (n >= 3) setTimeout(() => finish({ ok: false, correct: ex.text, given: alts[0] ?? '' }), 1200);
    } catch (e) {
      setState('idle');
      setError(e instanceof MicError ? e.message : 'Nie udało się uruchomić mikrofonu.');
      if (e instanceof MicError && e.code === 'denied') muteFor('mic', 60);
    }
  }, [lang, ex.text, attempts, finish, muteFor]);

  const skip = () => {
    muteFor('mic', 15);
    finish({ ok: true, skipped: true }, true);
  };

  const selfMode = !micOn;
  const diff = state === 'result' ? wordDiff(heard, ex.text) : null;

  return (
    <div className="ex">
      <Instruction>{selfMode ? 'Przeczytaj na głos' : 'Powiedz to zdanie'}</Instruction>
      <div className="speak-card">
        <div className="prompt-row">
          <SpeakButton text={ex.text} />
          <SpeakButton text={ex.text} slow size="sm" />
        </div>
        {diff ? (
          <p className="hint-text big" lang={course.pack.target.code}>
            {diff.map((w, i) => (
              <span key={i} className={w.ok ? 'said-ok' : 'said-miss'}>
                {w.word}{' '}
              </span>
            ))}
          </p>
        ) : (
          <HintText text={ex.text} course={course} big />
        )}
        <p className="muted">{ex.translation}</p>
      </div>

      {selfMode ? (
        <SelfAssess text={ex.text} onDone={(ok) => finish(ok ? { ok: true, partial: 'typo', correct: ex.text } : { ok: true, skipped: true }, !ok)} />
      ) : (
        <div className="mic-area">
          <button
            type="button"
            className={`mic-btn${state === 'listening' ? ' is-live' : ''}`}
            onClick={() => (state === 'listening' ? session.current?.stop() : void start())}
            aria-label={state === 'listening' ? 'Zakończ nagrywanie' : 'Naciśnij i mów'}
          >
            <Icon name="mic" size={34} />
          </button>
          <p className="mic-status" aria-live="polite">
            {state === 'listening' && (heard ? `„${heard}”` : 'Słucham…')}
            {state === 'idle' && !error && (attempts ? 'Spróbuj jeszcze raz' : 'Naciśnij i powiedz zdanie')}
            {state === 'result' && score >= 0.8 && 'Świetna wymowa!'}
            {state === 'result' && score < 0.8 && (attempts >= 3 ? 'Przejdźmy dalej — wrócimy do tego zdania.' : `Usłyszałem: „${heard || '…'}”. Spróbuj jeszcze raz.`)}
          </p>
          {error && <p className="error-text">{error}</p>}
          {state === 'result' && score < 0.8 && attempts < 3 && (
            <button type="button" className="btn btn-ghost" onClick={() => void start()}>
              Spróbuj ponownie
            </button>
          )}
        </div>
      )}

      {speakingEnabled && !dedicated && (
        <button type="button" className="link-btn" onClick={skip}>
          {sttOk === false ? 'Pomiń ćwiczenie' : 'Nie mogę teraz mówić'}
        </button>
      )}
    </div>
  );
}

/** Tryb bez rozpoznawania mowy: nagraj się, odsłuchaj, porównaj z wzorem i oceń sam. */
function SelfAssess({ text, onDone }: { text: string; onDone: (ok: boolean) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const toggle = async () => {
    if (rec) {
      rec.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })));
        setRec(null);
      };
      r.start();
      setRec(r);
    } catch {
      setErr('Brak dostępu do mikrofonu — możesz po prostu powiedzieć zdanie na głos.');
    }
  };

  return (
    <div className="self-assess">
      <p className="muted">
        To urządzenie nie rozpoznaje mowy {canRecord ? '— nagraj się i porównaj z wzorem' : '— powiedz zdanie na głos i porównaj z wzorem'}.
      </p>
      {canRecord && (
        <div className="self-row">
          <button type="button" className={`mic-btn small${rec ? ' is-live' : ''}`} onClick={() => void toggle()} aria-label={rec ? 'Zatrzymaj nagranie' : 'Nagraj się'}>
            <Icon name="mic" size={26} />
          </button>
          {url && <audio controls src={url} className="self-audio" />}
        </div>
      )}
      {err && <p className="error-text">{err}</p>}
      <div className="self-buttons">
        <button type="button" className="btn btn-ghost" onClick={() => onDone(false)}>
          Muszę poćwiczyć
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onDone(true)}>
          Brzmiało dobrze
        </button>
      </div>
      <span className="sr-only">{text}</span>
    </div>
  );
}

export function TheoryEx({ ex, course, finish }: ExProps<Of<'theory'>>) {
  const a = ex.article;
  const { say, ttsOk } = useSpeech();
  const onSay = ttsOk === false ? undefined : (t: string) => void say(t);
  const step = ex.step;
  const lang = course.pack.target.code;
  const examples = step ? step.examples : a.examples;
  const body = step ? step.body : a.body;
  // Gdy krok ma już własną tabelę odmiany, nie dublujemy jej tabelą z kursu.
  const tables = /^\|/m.test(body) ? ex.tables.filter((t) => !body.includes(`**${t.forms[0].split('|')[0].trim()}**`)) : ex.tables;
  const go = useCallback(() => finish({ ok: true, skipped: true }, true), [finish]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div className={`ex ex-theory${ex.tip ? ' is-tip' : ''}`}>
      <p className="ex-kicker">
        {ex.tip ? 'Zanim poznasz te słowa' : step && step.total > 1 ? `Teoria, krok ${step.index + 1} z ${step.total}` : 'Teoria'}
      </p>
      <article className="theory-card">
        {step && step.total > 1 && !ex.tip && (
          <ol className="theory-steps" aria-hidden>
            {Array.from({ length: step.total }, (_, i) => (
              <li key={i} className={i < step.index ? 'done' : i === step.index ? 'now' : ''} />
            ))}
          </ol>
        )}
        {!step && <p className="theory-kicker">{a.title}</p>}
        <h2 className="theory-title">{step ? step.title : a.title}</h2>
        {(!step || step.index === 0) && !ex.tip && <p className="theory-summary">{a.summary}</p>}
        <Markdown source={body} onSay={onSay} lang={lang} />
        {tables.map((t) => (
          <ConjTable key={t.id} table={t} persons={course.rules.persons} lang={lang} />
        ))}
        {examples.length > 0 && (
          <section className="theory-examples">
            <h3>Przykłady</h3>
            <ul className="example-list is-grid">
              {examples.map((e, i) => (
                <li key={i}>
                  <SpeakButton text={e.t} size="sm" />
                  <div>
                    <Say text={e.t} className="example-t">{e.t}</Say>
                    <p className="muted">{e.n}{e.note ? `${/[.!?…]$/.test(e.n) ? '' : '.'} ${e.note}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {step && step.total > 1 && !ex.tip && (
          <details className="theory-more">
            <summary>Cały temat: {a.title}</summary>
            <Markdown source={a.body} onSay={onSay} lang={lang} />
          </details>
        )}
      </article>
      {ex.upcoming && ex.upcoming.length > 0 && (
        <p className="upcoming">
          <span className="upcoming-label">{ex.tip ? 'Za chwilę spotkasz:' : 'Zaraz przećwiczysz:'}</span>
          {ex.upcoming.map((w) => (
            <span key={w} className="upcoming-chip" lang={lang}>{w}</span>
          ))}
        </p>
      )}
      <div className="ex-footer-inline sticky">
        <button type="button" className="btn btn-primary btn-wide" onClick={go}>
          {ex.tip ? 'Jasne, dalej' : step ? 'Przećwicz to teraz' : 'Rozumiem, przejdźmy do ćwiczeń'}
        </button>
      </div>
    </div>
  );
}

export function ConjTable({ table, persons, lang }: { table: { verb: string; n: string; tenseLabel: string; forms: string[]; irregular?: boolean; note?: string }; persons: string[]; lang: string }) {
  return (
    <figure className="conj-figure">
      <figcaption>
        <Say text={table.verb} className="conj-verb">{table.verb}</Say> — {table.n}, {table.tenseLabel}
        {table.irregular && <span className="tag">nieregularny</span>}
      </figcaption>
      <table className="conj-table">
        <tbody>
          {table.forms.map((f, i) => (
            <tr key={i}>
              <th>{persons[i]}</th>
              <td lang={lang}>
                <Say text={f.split('|')[0].trim()}>{f.replaceAll('|', '/')}</Say>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.note && <p className="muted small">{table.note}</p>}
    </figure>
  );
}

export function StoryEx({ ex, course, finish }: ExProps<Of<'story'>>) {
  const s = ex.story;
  const [shown, setShown] = useState(1);
  const [translate, setTranslate] = useState<Set<number>>(new Set());
  const { say, audioOn } = useSpeech();
  const endRef = useRef<HTMLDivElement>(null);
  const speakers = useMemo(() => [...new Set(s.lines.map((l) => l.speaker))], [s]);

  useEffect(() => {
    const line = s.lines[shown - 1];
    if (line && audioOn) void say(line.t);
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const finished = shown >= s.lines.length;
  const next = useCallback(() => {
    if (finished) finish({ ok: true, skipped: true }, true);
    else setShown((n) => n + 1);
  }, [finished, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next]);

  return (
    <div className="ex ex-story">
      <header className="story-head">
        <span className="story-emoji" aria-hidden>{s.emoji}</span>
        <div>
          <h2 className="theory-title">{s.title}</h2>
          <p className="muted">{s.intro}</p>
        </div>
      </header>
      <ol className="story-lines">
        {s.lines.slice(0, shown).map((l, i) => (
          <li key={i} className={`story-line speaker-${speakers.indexOf(l.speaker) % 4}${i === shown - 1 ? ' is-new' : ''}`}>
            <span className="story-speaker">{l.speaker}</span>
            <div className="story-bubble">
              <div className="story-text-row">
                <HintText text={l.t} course={course} />
                <SpeakButton text={l.t} size="sm" />
              </div>
              {translate.has(i) ? (
                <p className="story-translation">{l.n}</p>
              ) : (
                <button type="button" className="link-btn small" onClick={() => setTranslate((t) => new Set(t).add(i))}>
                  Pokaż tłumaczenie
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      <div className="ex-footer-inline sticky">
        <button type="button" className="btn btn-primary btn-wide" onClick={next}>
          {finished ? 'Przejdź do pytań' : 'Dalej'}
        </button>
      </div>
    </div>
  );
}

export function ReorderEx({ ex, course, locked, setCheck }: ExProps<Of<'reorder'>>) {
  const [seq, setSeq] = useState<number[]>([]);
  useEffect(() => {
    setCheck(
      seq.length < ex.lines.length
        ? null
        : () => {
            const ok = seq.every((shownIdx, pos) => ex.order[shownIdx] === pos);
            const correct = [...ex.lines.keys()].sort((a, b) => ex.order[a] - ex.order[b]).map((i) => ex.lines[i].t).join(' / ');
            return { ok, correct, given: seq.map((i) => ex.lines[i].t).join(' / ') };
          },
    );
  }, [seq, ex, setCheck]);
  return (
    <div className="ex">
      <Instruction>Ułóż dialog we właściwej kolejności</Instruction>
      <ol className="reorder-list" lang={course.pack.target.code}>
        {ex.lines.map((l, i) => {
          const pos = seq.indexOf(i);
          return (
            <li key={i}>
              <button
                type="button"
                className={`reorder-item${pos >= 0 ? ' is-picked' : ''}`}
                disabled={locked}
                onClick={() => setSeq((s) => (pos >= 0 ? s.slice(0, pos) : [...s, i]))}
              >
                <span className="reorder-badge" aria-label={pos >= 0 ? `pozycja ${pos + 1}` : 'nieułożone'}>{pos >= 0 ? pos + 1 : ''}</span>
                <span>
                  <strong>{l.speaker}:</strong> {l.t}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
