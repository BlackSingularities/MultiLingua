// Ćwiczenia wyboru: tłumaczenie, obrazek, słuchanie, rodzajnik, ocena tłumaczenia, pytania.
import { useCallback, useEffect, useState } from 'react';
import type { Exercise } from '../engine/types.ts';
import { SpeakButton, Say } from '../components/ui.tsx';
import { HintText, Instruction, useNumberKeys, type ExProps } from './shared.tsx';

type Of<T extends Exercise['type']> = Extract<Exercise, { type: T }>;

function OptionList({
  options, answer, selected, onSelect, locked, lang, layout = 'list',
}: {
  options: React.ReactNode[];
  answer: number;
  selected: number | null;
  onSelect: (i: number) => void;
  locked: boolean;
  lang?: string;
  layout?: 'list' | 'grid';
}) {
  useNumberKeys(options.length, onSelect, !locked);
  return (
    <div className={`options options-${layout}`} role="radiogroup">
      {options.map((o, i) => {
        const state = locked ? (i === answer ? 'right' : i === selected ? 'wrong' : 'idle') : i === selected ? 'selected' : 'idle';
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected === i}
            className={`option option-${state}`}
            onClick={() => !locked && onSelect(i)}
            disabled={locked && state === 'idle'}
            lang={lang}
          >
            <span className="option-key" aria-hidden>{i + 1}</span>
            <span className="option-label">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Wspólny szkielet: wybór → rejestracja sprawdzenia. */
function useChoice(answer: number, correctText: string, setCheck: ExProps<unknown>['setCheck'], explain?: string) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setCheck(selected === null ? null : () => ({ ok: selected === answer, correct: correctText, given: String(selected), explain }));
  }, [selected, answer, correctText, setCheck, explain]);
  const select = useCallback((i: number) => setSelected(i), []);
  return { selected, select };
}

export function IntroEx({ ex, course, finish }: ExProps<Of<'intro'>>) {
  const v = ex.vocab;
  const full = course.withArticle(v);
  return (
    <div className="ex ex-intro">
      <Instruction>Nowe słowo</Instruction>
      <div className="intro-card">
        {v.emoji && <div className="intro-emoji" aria-hidden>{v.emoji}</div>}
        <div className="intro-word-row">
          <Say text={full} className="intro-word">{full}</Say>
          <SpeakButton text={full} autoPlay />
          <SpeakButton text={full} slow size="sm" />
        </div>
        <p className="intro-meaning">{v.n}</p>
        {(v.gender || v.plural) && (
          <p className="intro-grammar">
            {v.gender === 'm' && 'rodzaj męski'}
            {v.gender === 'f' && 'rodzaj żeński'}
            {v.gender === 'n' && 'rodzaj nijaki'}
            {v.plural && <> · liczba mnoga: <Say text={v.plural}>{v.plural}</Say></>}
          </p>
        )}
        {v.note && <p className="intro-note">{v.note}</p>}
        {v.ex && (
          <div className="intro-example">
            <HintText text={v.ex.t} course={course} />
            <p className="muted">{v.ex.n}</p>
          </div>
        )}
      </div>
      <IntroContinue onGo={() => finish({ ok: true, skipped: true }, true)} />
    </div>
  );
}

function IntroContinue({ onGo }: { onGo: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      onGo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGo]);
  return (
    <div className="ex-footer-inline">
      <button type="button" className="btn btn-primary btn-wide" onClick={onGo} autoFocus>
        Zapamiętane, dalej
      </button>
    </div>
  );
}

export function ChoiceEx({ ex, course, locked, setCheck }: ExProps<Of<'choice'>>) {
  const { selected, select } = useChoice(ex.answer, ex.options[ex.answer], setCheck);
  const optLang = ex.promptSide === 't' ? 'pl' : course.pack.target.code;
  return (
    <div className="ex">
      <Instruction>{ex.title}</Instruction>
      <div className="prompt-row">
        {ex.audio && <SpeakButton text={ex.audio} autoPlay />}
        {ex.promptSide === 't' ? <HintText text={ex.prompt} course={course} big /> : <p className="prompt big">{ex.prompt}</p>}
      </div>
      <OptionList options={ex.options} answer={ex.answer} selected={selected} onSelect={select} locked={locked} lang={optLang} />
    </div>
  );
}

export function PictureEx({ ex, locked, setCheck }: ExProps<Of<'picture'>>) {
  const { selected, select } = useChoice(ex.answer, ex.options[ex.answer].label, setCheck);
  return (
    <div className="ex">
      <Instruction>Wybierz właściwy obrazek</Instruction>
      <div className="prompt-row">
        {ex.audio && <SpeakButton text={ex.audio} autoPlay />}
        <p className="prompt big target">{ex.prompt}</p>
      </div>
      <OptionList
        layout="grid"
        options={ex.options.map((o) => (
          <span className="pic-option">
            <span className="pic-emoji" aria-hidden>{o.emoji}</span>
            <span className="pic-label">{locked ? o.label : ''}</span>
          </span>
        ))}
        answer={ex.answer}
        selected={selected}
        onSelect={select}
        locked={locked}
      />
    </div>
  );
}

export function ListenEx({ ex, course, locked, setCheck }: ExProps<Of<'listen'>>) {
  const { selected, select } = useChoice(ex.answer, ex.options[ex.answer], setCheck);
  return (
    <div className="ex">
      <Instruction>Co słyszysz?</Instruction>
      <div className="listen-buttons">
        <SpeakButton text={ex.audio} size="lg" autoPlay />
        <SpeakButton text={ex.audio} slow />
      </div>
      <OptionList options={ex.options} answer={ex.answer} selected={selected} onSelect={select} locked={locked} lang={course.pack.target.code} />
    </div>
  );
}

export function ArticleEx({ ex, locked, setCheck }: ExProps<Of<'article'>>) {
  const { selected, select } = useChoice(ex.answer, `${ex.options[ex.answer]} ${ex.word}`, setCheck, ex.explain);
  return (
    <div className="ex">
      <Instruction>Wybierz właściwy rodzajnik</Instruction>
      <div className="article-card">
        {ex.emoji && <span className="article-emoji" aria-hidden>{ex.emoji}</span>}
        <p className="prompt big target">
          <span className={`article-slot${selected !== null ? ' filled' : ''}`}>{selected !== null ? ex.options[selected] : '___'}</span>{' '}
          {ex.word}
        </p>
        <p className="muted">{ex.meaning}</p>
      </div>
      <OptionList layout="grid" options={ex.options} answer={ex.answer} selected={selected} onSelect={select} locked={locked} />
    </div>
  );
}

export function JudgeEx({ ex, course, locked, setCheck }: ExProps<Of<'judge'>>) {
  const answer = ex.isRight ? 0 : 1;
  const { selected, select } = useChoice(answer, ex.isRight ? 'Tak, tłumaczenie jest poprawne.' : `Nie. Poprawnie: ${ex.correct}`, setCheck);
  return (
    <div className="ex">
      <Instruction>Czy to dobre tłumaczenie?</Instruction>
      <div className="judge-card">
        <div className="prompt-row">
          <SpeakButton text={ex.text} autoPlay />
          <HintText text={ex.text} course={course} big />
        </div>
        <p className="judge-shown">„{ex.shown}”</p>
      </div>
      <OptionList layout="grid" options={['Tak', 'Nie']} answer={answer} selected={selected} onSelect={select} locked={locked} />
    </div>
  );
}

export function QuestionEx({ ex, locked, setCheck }: ExProps<Of<'question'>>) {
  const q = ex.question;
  const { selected, select } = useChoice(q.answer, q.options[q.answer], setCheck, q.explain);
  return (
    <div className="ex">
      <Instruction>{ex.context ? `Pytanie do historyjki „${ex.context}”` : 'Sprawdź się'}</Instruction>
      <p className="prompt">{q.q}</p>
      <OptionList options={q.options} answer={q.answer} selected={selected} onSelect={select} locked={locked} />
    </div>
  );
}
