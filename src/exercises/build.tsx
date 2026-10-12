// Ćwiczenia produkcji: kafelki, pisanie, luki, dyktando, literowanie, liczby, odmiana, szukanie błędu.
import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../engine/types.ts';
import { checkAnswer, normalize } from '../engine/text.ts';
import { inLanguage } from '../engine/generator.ts';
import { SpeakButton } from '../components/ui.tsx';
import { AnswerInput, HintText, Instruction, type ExProps } from './shared.tsx';

type Of<T extends Exercise['type']> = Extract<Exercise, { type: T }>;

export function TilesEx({ ex, course, locked, setCheck }: ExProps<Of<'tiles'>>) {
  const [picked, setPicked] = useState<number[]>([]);
  const toTarget = ex.promptSide === 'n' || ex.prompt === '';
  const audioOnly = ex.prompt === '';

  useEffect(() => {
    setCheck(
      picked.length === 0
        ? null
        : () => {
            const given = picked.map((i) => ex.tiles[i]).join(' ');
            const r = checkAnswer(given, ex.answers, { exact: true, dropPronouns: toTarget ? course.rules.dropPronouns : [] });
            return { ok: r.ok, correct: r.ok ? r.best : ex.answers[0], given };
          },
    );
  }, [picked, ex, setCheck, toTarget, course]);

  // Klawiatura: Backspace cofa ostatni kafelek.
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') setPicked((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

  const tileLang = toTarget ? course.pack.target.code : 'pl';
  return (
    <div className="ex">
      <Instruction>{ex.title}</Instruction>
      <div className="prompt-row">
        {ex.audio && <SpeakButton text={ex.audio} autoPlay size={audioOnly ? 'lg' : 'md'} />}
        {audioOnly && ex.audio && <SpeakButton text={ex.audio} slow />}
        {!audioOnly &&
          (ex.promptSide === 't' ? <HintText text={ex.prompt} course={course} big /> : <p className="prompt big">{ex.prompt}</p>)}
      </div>
      <div className={`tile-answer${locked ? ' is-locked' : ''}`} aria-label="Twoja odpowiedź" lang={tileLang}>
        {picked.length === 0 && <span className="tile-placeholder">Dotknij słów poniżej</span>}
        {picked.map((ti, pos) => (
          <button key={`${ti}-${pos}`} type="button" className="tile" disabled={locked} onClick={() => setPicked((p) => p.filter((_, j) => j !== pos))}>
            {ex.tiles[ti]}
          </button>
        ))}
      </div>
      <div className="tile-bank" lang={tileLang}>
        {ex.tiles.map((t, i) => {
          const used = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`tile${used ? ' tile-ghost' : ''}`}
              disabled={locked || used}
              onClick={() => setPicked((p) => [...p, i])}
              aria-hidden={used}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WriteEx({ ex, course, locked, setCheck }: ExProps<Of<'write'>>) {
  const [value, setValue] = useState('');
  const toTarget = ex.promptSide === 'n';
  useEffect(() => {
    setCheck(
      value.trim() === ''
        ? null
        : () => {
            const r = checkAnswer(value, ex.answers, { dropPronouns: toTarget ? course.rules.dropPronouns : [] });
            return {
              ok: r.ok,
              partial: r.grade === 'accent' || r.grade === 'typo' ? r.grade : undefined,
              correct: r.best,
              given: value,
            };
          },
    );
  }, [value, ex, setCheck, toTarget, course]);

  const long = ex.prompt.split(' ').length > 3;
  return (
    <div className="ex">
      <Instruction>{ex.title}</Instruction>
      <div className="prompt-row">
        {ex.audio && <SpeakButton text={ex.audio} autoPlay />}
        {ex.promptSide === 't' ? <HintText text={ex.prompt} course={course} big /> : <p className="prompt big">{ex.prompt}</p>}
      </div>
      <AnswerInput
        value={value}
        onChange={setValue}
        course={course}
        multiline={long}
        locked={locked}
        lang={toTarget ? 't' : 'n'}
        placeholder={toTarget ? `Napisz ${inLanguage(course.pack.target.code, course.pack.target.name)}…` : 'Napisz po polsku…'}
      />
    </div>
  );
}

export function ClozeEx({ ex, course, locked, outcome, setCheck }: ExProps<Of<'cloze'>>) {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const typed = !ex.options;
  useEffect(() => {
    const given = typed ? value : picked !== null ? ex.options![picked] : '';
    setCheck(
      given.trim() === ''
        ? null
        : () => {
            const r = checkAnswer(given, ex.answers, { exact: !typed });
            return {
              ok: r.ok,
              partial: r.grade === 'accent' || r.grade === 'typo' ? r.grade : undefined,
              correct: ex.full,
              given,
            };
          },
    );
  }, [value, picked, ex, typed, setCheck]);

  const fill = typed ? value : picked !== null ? ex.options![picked] : '';
  return (
    <div className="ex">
      <Instruction>{typed ? 'Uzupełnij lukę' : 'Wybierz brakujące słowo'}</Instruction>
      <div className="cloze-sentence" lang={course.pack.target.code}>
        <span>{ex.before}</span>
        {typed ? (
          <input
            className={`cloze-input${outcome ? (outcome.ok ? ' ok' : ' bad') : ''}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={locked}
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            size={Math.max(4, ex.answers[0].length + 1)}
            aria-label="Brakujące słowo"
          />
        ) : (
          <span className={`cloze-slot${fill ? ' filled' : ''}${outcome ? (outcome.ok ? ' ok' : ' bad') : ''}`}>{fill || ' '}</span>
        )}
        <span>{ex.after}</span>
      </div>
      <p className="muted cloze-translation">{ex.translation}</p>
      {typed ? (
        !locked && course.rules.specialChars.length > 0 && (
          <div className="char-row">
            {course.rules.specialChars.map((c) => (
              <button key={c} type="button" className="char-key" onClick={() => setValue((v) => v + c)}>
                {c}
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="chip-row">
          {ex.options!.map((o, i) => (
            <button
              key={i}
              type="button"
              className={`chip${picked === i ? ' chip-on' : ''}`}
              onClick={() => setPicked(i)}
              disabled={locked}
              lang={course.pack.target.code}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DictationEx({ ex, course, locked, setCheck }: ExProps<Of<'dictation'>>) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setCheck(
      value.trim() === ''
        ? null
        : () => {
            const r = checkAnswer(value, ex.answers, { dropPronouns: [] });
            return {
              ok: r.ok,
              partial: r.grade === 'accent' || r.grade === 'typo' ? r.grade : undefined,
              correct: r.best,
              given: value,
              explain: `Znaczenie: ${ex.translation}`,
            };
          },
    );
  }, [value, ex, setCheck]);
  return (
    <div className="ex">
      <Instruction>Zapisz, co słyszysz</Instruction>
      <div className="listen-buttons">
        <SpeakButton text={ex.audio} size="lg" autoPlay />
        <SpeakButton text={ex.audio} slow />
      </div>
      <AnswerInput value={value} onChange={setValue} course={course} locked={locked} lang="t" multiline={ex.audio.split(' ').length > 3} placeholder="Zapisz usłyszany tekst…" />
    </div>
  );
}

export function SpellEx({ ex, course, locked, setCheck }: ExProps<Of<'spell'>>) {
  const [picked, setPicked] = useState<number[]>([]);
  const word = picked.map((i) => ex.letters[i]).join('');
  useEffect(() => {
    setCheck(
      picked.length < ex.letters.length
        ? null
        : () => ({ ok: normalize(word) === normalize(ex.answer), correct: ex.answer, given: word }),
    );
  }, [picked, word, ex, setCheck]);
  return (
    <div className="ex">
      <Instruction>Ułóż słowo z liter</Instruction>
      <div className="prompt-row">
        <p className="prompt big">{ex.prompt}</p>
        <SpeakButton text={ex.audio} />
      </div>
      <div className="spell-answer" lang={course.pack.target.code}>
        {ex.letters.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`spell-slot${picked[i] !== undefined ? ' filled' : ''}`}
            disabled={locked || picked[i] === undefined}
            onClick={() => setPicked((p) => p.slice(0, i))}
            aria-label={picked[i] !== undefined ? `Usuń od litery ${ex.letters[picked[i]]}` : 'Puste pole'}
          >
            {picked[i] !== undefined ? ex.letters[picked[i]] : ''}
          </button>
        ))}
      </div>
      <div className="spell-bank">
        {ex.letters.map((l, i) => (
          <button key={i} type="button" className="letter" disabled={locked || picked.includes(i)} onClick={() => setPicked((p) => [...p, i])}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NumberEx({ ex, course, locked, setCheck }: ExProps<Of<'number'>>) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setCheck(
      value.trim() === ''
        ? null
        : () => {
            const r = checkAnswer(value, ex.answers);
            return {
              ok: r.ok,
              partial: r.grade === 'accent' || r.grade === 'typo' ? r.grade : undefined,
              correct: ex.mode === 'listen' ? `${ex.value} (${ex.words})` : ex.words,
              given: value,
            };
          },
    );
  }, [value, ex, setCheck]);
  return (
    <div className="ex">
      <Instruction>{ex.mode === 'listen' ? 'Jaką liczbę słyszysz?' : 'Zapisz liczbę słownie'}</Instruction>
      {ex.mode === 'listen' ? (
        <div className="listen-buttons">
          <SpeakButton text={String(ex.value)} size="lg" autoPlay />
          <SpeakButton text={String(ex.value)} slow />
        </div>
      ) : (
        <p className="number-big" aria-label={`Liczba ${ex.value}`}>{ex.value}</p>
      )}
      <AnswerInput
        value={value}
        onChange={setValue}
        course={course}
        locked={locked}
        lang="t"
        placeholder={ex.mode === 'listen' ? 'Cyframi albo słownie…' : 'Słownie…'}
      />
    </div>
  );
}

export function ConjugateEx({ ex, course, locked, outcome, setCheck }: ExProps<Of<'conjugate'>>) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setCheck(
      value.trim() === ''
        ? null
        : () => {
            const r = checkAnswer(value, ex.answers);
            return {
              ok: r.ok,
              partial: r.grade === 'accent' || r.grade === 'typo' ? r.grade : undefined,
              correct: `${ex.personLabel} ${ex.answers[0]}`,
              given: value,
            };
          },
    );
  }, [value, ex, setCheck]);
  return (
    <div className="ex">
      <Instruction>Odmień czasownik</Instruction>
      <div className="conj-head">
        <p className="prompt big target">{ex.table.verb}</p>
        <p className="muted">
          {ex.table.n} · {ex.table.tenseLabel}
        </p>
      </div>
      <div className="conj-row">
        <span className="conj-person">{ex.personLabel}</span>
        <AnswerInput value={value} onChange={setValue} course={course} locked={locked} lang="t" placeholder="forma…" />
      </div>
      {outcome && (
        <table className="conj-table compact">
          <tbody>
            {ex.table.forms.map((f, i) => (
              <tr key={i} className={i === ex.person ? 'is-current' : ''}>
                <th>{course.rules.persons[i]}</th>
                <td lang={course.pack.target.code}>{f}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ErrorSpotEx({ ex, course, locked, setCheck }: ExProps<Of<'errorspot'>>) {
  const [picked, setPicked] = useState<number | null>(null);
  const explain = useMemo(() => `„${ex.tokens[ex.wrong]}” → „${ex.fix}”. ${ex.translation}`, [ex]);
  useEffect(() => {
    setCheck(picked === null ? null : () => ({ ok: picked === ex.wrong, correct: ex.full, given: ex.tokens[picked], explain }));
  }, [picked, ex, setCheck, explain]);
  return (
    <div className="ex">
      <Instruction>Znajdź błędne słowo</Instruction>
      <p className="muted">Jedno słowo w zdaniu jest źle odmienione albo ma zły rodzajnik.</p>
      <div className="err-sentence" lang={course.pack.target.code}>
        {ex.tokens.map((t, i) => {
          const state = locked ? (i === ex.wrong ? 'right' : i === picked ? 'wrong' : '') : i === picked ? 'selected' : '';
          return (
            <button key={i} type="button" className={`err-word ${state}`} disabled={locked} onClick={() => setPicked(i)}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
