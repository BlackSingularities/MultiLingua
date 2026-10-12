import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildSession } from '../engine/generator.ts';
import type { AnswerOutcome, Exercise, SessionMode } from '../engine/types.ts';
import { db } from '../data/db.ts';
import {
  finishSession, loadSkillWeights, recordAnswer, unlockedUnits, type SessionResult, PASS_THRESHOLD,
} from '../data/progress.ts';
import { useApp } from '../data/store.ts';
import { sfx, vibrate } from '../platform/sfx.ts';
import { stopSpeaking } from '../platform/speech.ts';
import { Icon } from '../components/Icon.tsx';
import { Empty, ProgressBar, Spinner, useSpeech } from '../components/ui.tsx';
import { ACCEPTABLE_OVERRIDE, ExerciseView, promptOf } from '../exercises/index.tsx';
import { Results } from './Results.tsx';

const PRAISE = ['Świetnie!', 'Doskonale!', 'Brawo!', 'Tak jest!', 'Idealnie!', 'Super!', 'Pięknie!'];
const SPEED_SECONDS = 90;

export function modeFromParams(p: Record<string, string | undefined>): SessionMode | null {
  if (p.lessonId) return { kind: 'lesson', lessonId: p.lessonId };
  if (p.unitId && p.action === 'cwicz') return { kind: 'unit', unitId: p.unitId };
  if (p.unitId && p.action === 'przeskocz') return { kind: 'skip', unitId: p.unitId };
  switch (p.kind) {
    case 'powtorka': return { kind: 'review' };
    case 'bledy': return { kind: 'mistakes' };
    case 'mowienie': return { kind: 'speaking' };
    case 'sluchanie': return { kind: 'listening' };
    case 'liczby': return { kind: 'numbers' };
    case 'szybka': return { kind: 'speed' };
    case 'odmiana': return { kind: 'conjugation', tableId: p.tableId };
  }
  return null;
}

export function SessionScreen() {
  const params = useParams();
  const mode = useMemo(() => modeFromParams(params), [params]);
  const navigate = useNavigate();
  const course = useApp((s) => s.course);
  const settings = useApp((s) => s.settings);
  const applySrs = useApp((s) => s.applySrs);
  const reloadProgress = useApp((s) => s.reloadProgress);
  const { audioOn, micOn, ttsOk } = useSpeech();
  const muteFor = useApp((s) => s.muteFor);

  const [queue, setQueue] = useState<Exercise[] | null>(null);
  const [pos, setPos] = useState(0);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [canCheck, setCanCheck] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_SECONDS);
  const checkFn = useRef<(() => AnswerOutcome) | null>(null);
  const stats = useRef({ total: 0, correct: 0, maxCombo: 0, newWords: 0, started: Date.now() });
  const finishing = useRef(false);
  const praise = useRef(PRAISE[0]);

  const isTest = mode?.kind === 'skip' || (mode?.kind === 'lesson' && course?.lessons.get(mode.lessonId)?.kind === 'test');

  // Budowa sesji — raz, po wczytaniu kursu i ustaleniu, czy mamy dźwięk.
  useEffect(() => {
    if (!course || !mode || queue || ttsOk === null) return;
    let alive = true;
    (async () => {
      const st = useApp.getState();
      const [skillWeights, mistakes] = await Promise.all([
        loadSkillWeights(course.id),
        mode.kind === 'mistakes'
          ? db.mistakes.where('course').equals(course.id).reverse().sortBy('at')
          : Promise.resolve([]),
      ]);
      const q = buildSession(mode, {
        index: course,
        srs: st.srs,
        now: Date.now(),
        audio: audioOn,
        mic: micOn,
        hard: settings.hard,
        skillWeights,
        unlockedUnits: unlockedUnits(course, st.progress ?? { id: course.id, started: 0, lessons: {}, skipped: [], xp: 0, lastActive: 0 }),
        mistakes: mistakes.map((m) => ({ item: m.item, kind: m.kind })),
      });
      if (alive) {
        stats.current = { total: 0, correct: 0, maxCombo: 0, newWords: q.filter((e) => e.type === 'intro').length, started: Date.now() };
        setQueue(q);
      }
    })();
    return () => {
      alive = false;
    };
  }, [course, mode, queue, ttsOk, audioOn, micOn, settings.hard]);

  useEffect(() => () => stopSpeaking(), []);

  const current = queue?.[pos] ?? null;

  const setCheck = useCallback((fn: (() => AnswerOutcome) | null) => {
    checkFn.current = fn;
    setCanCheck(!!fn);
  }, []);

  const end = useCallback(async () => {
    if (!course || !mode || finishing.current) return;
    finishing.current = true;
    stopSpeaking();
    const s = stats.current;
    const res = await finishSession(
      course,
      mode,
      { total: s.total, correct: s.correct, seconds: (Date.now() - s.started) / 1000, maxCombo: s.maxCombo, newWords: s.newWords },
      settings.dailyGoal,
    );
    await reloadProgress();
    if (settings.sound) res.passed ? sfx.complete() : sfx.wrong();
    setResult(res);
  }, [course, mode, settings.dailyGoal, settings.sound, reloadProgress]);

  const record = useCallback(
    async (ex: Exercise, o: AnswerOutcome) => {
      if (!course || o.skipped) return;
      const s = stats.current;
      s.total++;
      if (o.ok) {
        s.correct++;
        setCombo((c) => {
          const n = c + 1;
          s.maxCombo = Math.max(s.maxCombo, n);
          return n;
        });
      } else setCombo(0);
      const updated = await recordAnswer(course.id, ex, o, promptOf(ex));
      applySrs(updated);
    },
    [course, applySrs],
  );

  const advance = useCallback(() => {
    if (!queue) return;
    setOutcome(null);
    checkFn.current = null;
    setCanCheck(false);
    if (pos + 1 >= queue.length) void end();
    else setPos(pos + 1);
  }, [queue, pos, end]);

  const check = useCallback(() => {
    if (!current || outcome || !checkFn.current) return;
    const o = checkFn.current();
    setOutcome(o);
    praise.current = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    if (settings.sound) (o.ok ? sfx.correct : sfx.wrong)();
    if (!o.ok) vibrate(80);
    void record(current, o);
    // Błąd wraca na koniec sesji (raz) — poza sprawdzianami.
    if (!o.ok && !current.retry && !isTest && current.type !== 'question') {
      setQueue((q) => (q ? [...q, { ...current, key: `${current.key}-r`, retry: true }] : q));
    }
  }, [current, outcome, settings.sound, record, isTest]);

  const finishSelf = useCallback(
    (o: AnswerOutcome, silent?: boolean) => {
      if (!current) return;
      if (silent) {
        void record(current, o);
        advance();
      } else {
        setOutcome(o);
        if (settings.sound) (o.ok ? sfx.correct : sfx.wrong)();
        void record(current, o);
      }
    },
    [current, record, advance, settings.sound],
  );

  const override = useCallback(() => {
    if (!current || !outcome || outcome.ok) return;
    // Użytkownik uznaje swoją odpowiedź za poprawną: poprawiamy statystyki i zabieramy powtórkę.
    const s = stats.current;
    s.correct++;
    setOutcome({ ...outcome, ok: true, partial: 'typo' });
    setQueue((q) => (q ? q.filter((e) => e.key !== `${current.key}-r`) : q));
    void recordAnswer(course!.id, { ...current, retry: true }, { ok: true, partial: 'typo' }, promptOf(current)).then(applySrs);
  }, [current, outcome, course, applySrs]);

  const cantListen = useCallback(() => {
    muteFor('audio', 15);
    setQueue((q) => (q ? [...q.slice(0, pos + 1), ...q.slice(pos + 1).filter((e) => e.needs !== 'audio')] : q));
    advance();
  }, [muteFor, pos, advance]);

  // Enter: sprawdź / dalej.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || confirmQuit || result) return;
      if (outcome) {
        e.preventDefault();
        advance();
      } else if (checkFn.current) {
        e.preventDefault();
        check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [outcome, advance, check, confirmQuit, result]);

  // Szybka runda: odliczanie.
  useEffect(() => {
    if (mode?.kind !== 'speed' || !queue || result) return;
    const t = setInterval(() => {
      const left = SPEED_SECONDS - Math.floor((Date.now() - stats.current.started) / 1000);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(t);
        void end();
      }
    }, 250);
    return () => clearInterval(t);
  }, [mode, queue, result, end]);

  if (!mode) return <Empty icon="🧭" title="Nie ma takiego ćwiczenia" action={<button className="btn btn-primary" onClick={() => navigate('/')}>Wróć do nauki</button>} />;
  if (!course) return <Spinner label="Wczytuję kurs…" />;
  if (result) {
    return (
      <Results
        result={result}
        mode={mode}
        course={course}
        isTest={!!isTest}
        onContinue={() => navigate('/', { replace: true })}
        onRetry={() => navigate(0)}
      />
    );
  }
  if (!queue) return <Spinner label="Układam ćwiczenia…" />;
  if (queue.length === 0) {
    const msg =
      mode.kind === 'mistakes' ? 'Nie masz żadnych błędów do poprawienia. Tak trzymaj!'
        : mode.kind === 'listening' && !audioOn ? 'Ćwiczenia ze słuchu wymagają syntezy mowy — włącz dźwięk w ustawieniach albo zainstaluj głos dla tego języka.'
          : mode.kind === 'review' ? 'Najpierw ukończ kilka lekcji — wtedy pojawią się powtórki.'
            : 'Na razie nie ma tu nic do ćwiczenia. Ukończ kilka lekcji i wróć.';
    return (
      <div className="session-empty">
        <Empty icon="🌿" title="Pusto" action={<button className="btn btn-primary" onClick={() => navigate(-1)}>Wróć</button>}>
          {msg}
        </Empty>
      </div>
    );
  }

  const progressValue = mode.kind === 'speed' ? 1 - timeLeft / SPEED_SECONDS : pos / queue.length;
  const showFooter = current && !['intro', 'theory', 'story', 'pairs'].includes(current.type) && !(current.type === 'speak' && !outcome);

  return (
    <div className={`session${outcome ? (outcome.ok ? ' has-ok' : ' has-bad') : ''}`}>
      <header className="session-top">
        <button type="button" className="icon-btn" onClick={() => setConfirmQuit(true)} aria-label="Zakończ sesję">
          <Icon name="close" />
        </button>
        <ProgressBar value={progressValue} label="Postęp sesji" tone={mode.kind === 'speed' ? 'sun' : 'ok'} />
        {mode.kind === 'speed' ? (
          <span className="timer" aria-live="off">{timeLeft}s</span>
        ) : (
          <span className={`combo${combo >= 3 ? ' is-on' : ''}`} aria-label={`Seria poprawnych: ${combo}`}>
            <Icon name="flame" size={18} /> {combo}
          </span>
        )}
      </header>

      <main className="session-body" key={current?.key}>
        {current?.retry && <p className="retry-note">Powtórka po błędzie</p>}
        {current && (
          <ExerciseView ex={current} course={course} locked={!!outcome} outcome={outcome} setCheck={setCheck} finish={finishSelf} />
        )}
        {current?.needs === 'audio' && !outcome && (
          <button type="button" className="link-btn" onClick={cantListen}>
            Nie mogę teraz słuchać
          </button>
        )}
      </main>

      {showFooter && (
        <footer className={`feedback${outcome ? (outcome.ok ? ' feedback-ok' : ' feedback-bad') : ''}`}>
          <div className="feedback-inner">
            {outcome ? (
              <div className="feedback-text" role="status" aria-live="assertive">
                <p className="feedback-title">
                  <Icon name={outcome.ok ? 'check' : 'close'} size={22} />
                  {outcome.ok
                    ? outcome.partial === 'accent' ? 'Dobrze — uważaj na akcenty' : outcome.partial === 'typo' ? 'Dobrze, z drobną literówką' : praise.current
                    : 'Niestety nie'}
                </p>
                {(!outcome.ok || outcome.partial) && outcome.correct && (
                  <p className="feedback-answer">
                    <span className="muted">{outcome.ok ? 'Poprawnie:' : 'Poprawna odpowiedź:'}</span> <strong>{outcome.correct}</strong>
                  </p>
                )}
                {outcome.explain && <p className="feedback-explain">{outcome.explain}</p>}
                {!outcome.ok && current && ACCEPTABLE_OVERRIDE.has(current.type) && outcome.given && (
                  <button type="button" className="link-btn small" onClick={override}>
                    Moja odpowiedź też była poprawna
                  </button>
                )}
              </div>
            ) : (
              <div className="feedback-text" />
            )}
            <button
              type="button"
              className={`btn btn-wide ${outcome ? (outcome.ok ? 'btn-ok' : 'btn-bad') : 'btn-primary'}`}
              disabled={!outcome && !canCheck}
              onClick={outcome ? advance : check}
            >
              {outcome ? 'Dalej' : 'Sprawdź'}
            </button>
          </div>
        </footer>
      )}

      {confirmQuit && (
        <div className="modal-backdrop" onClick={() => setConfirmQuit(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Zakończyć sesję?" onClick={(e) => e.stopPropagation()}>
            <h2>Zakończyć teraz?</h2>
            <p className="muted">
              Odpowiedzi, których już udzieliłeś, zostały zapisane w powtórkach. {mode.kind === 'lesson' && 'Lekcja nie zostanie zaliczona.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                Zakończ
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setConfirmQuit(false)} autoFocus>
                Ucz się dalej
              </button>
            </div>
          </div>
        </div>
      )}
      <span className="sr-only">Próg zaliczenia sprawdzianu: {Math.round(PASS_THRESHOLD * 100)}%</span>
    </div>
  );
}
