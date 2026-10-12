import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lesson, LessonKind, Unit, VocabItem } from '../data/types.ts';
import { useApp } from '../data/store.ts';
import { isLessonDone, isLessonUnlocked, nextLesson, unitProgress } from '../data/progress.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Empty, ProgressBar, SpeakButton, Spinner } from '../components/ui.tsx';
import { WordArt } from '../components/WordArt.tsx';
import { useDaily } from '../components/Shell.tsx';
import { LessonSheet } from '../components/LessonSheet.tsx';

export const KIND_ICON: Record<LessonKind, IconName> = {
  learn: 'sparkle',
  grammar: 'book',
  story: 'story',
  speak: 'mic',
  test: 'trophy',
};

export const KIND_LABEL: Record<LessonKind, string> = {
  learn: 'Słówka',
  grammar: 'Teoria',
  story: 'Historyjka',
  speak: 'Mówienie',
  test: 'Sprawdzian',
};

export function Home() {
  const course = useApp((s) => s.course);
  const progress = useApp((s) => s.progress);
  const loading = useApp((s) => s.loadingCourse);
  const error = useApp((s) => s.courseError);
  const openCourse = useApp((s) => s.openCourse);
  const active = useApp((s) => s.settings.activeCourse);

  if (!course || !progress) {
    if (loading) return <Spinner label="Pobieram kurs z serwera…" />;
    return (
      <Empty
        icon="📡"
        title="Nie udało się wczytać kursu"
        action={
          <button className="btn btn-primary" onClick={() => active && void openCourse(active).catch(() => {})}>
            Spróbuj ponownie
          </button>
        }
      >
        {error ?? 'Sprawdź połączenie z internetem. Kurs pobiera się raz, potem działa bez sieci.'}
      </Empty>
    );
  }

  const next = nextLesson(course, progress);

  return (
    <div className="home" style={{ '--course': course.pack.color } as React.CSSProperties}>
      <NextUp lesson={next} />
      <aside className="home-side" aria-label="Twój dzień">
        <DayCard />
        <WordOfDay />
      </aside>
      <div className="path">
        {course.units.map((u) => (
          <UnitBlock key={u.id} unit={u} nextId={next?.id ?? null} />
        ))}
      </div>
    </div>
  );
}

/** Karta „następny przystanek”: co dalej i jakie słowa w niej czekają. */
function NextUp({ lesson }: { lesson: Lesson | null }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();

  if (!lesson) {
    return (
      <section className="next next-done" aria-label="Następna lekcja">
        <h1 className="next-title">Cały kurs za Tobą</h1>
        <p className="muted">Utrzymuj formę dzięki powtórkom — słowa wracają wtedy, gdy zaczynasz je zapominać.</p>
        <Link to="/trening/powtorka" className="btn btn-primary">
          <Icon name="refresh" size={18} /> Powtórka
        </Link>
      </section>
    );
  }

  const unit = course.unitById.get(lesson.unit);
  const words = lesson.vocab.map((id) => course.vocab.get(id)).filter((v): v is VocabItem => !!v);
  const started = Object.keys(progress.lessons).length > 0;
  const position = (unit?.lessons.findIndex((l) => l.id === lesson.id) ?? 0) + 1;

  return (
    <section className="next" aria-labelledby="next-title">
      <div className="next-text">
        <p className="next-where">
          <Icon name={KIND_ICON[lesson.kind]} size={16} />
          {unit ? `${unit.title}, przystanek ${position} z ${unit.lessons.length}` : KIND_LABEL[lesson.kind]}
        </p>
        <h1 id="next-title" className="next-title">{lesson.title}</h1>
        <p className="next-kind">{KIND_LABEL[lesson.kind]}{words.length > 0 && `, ${words.length} nowych słów`}</p>
        <div className="next-actions">
          <button type="button" className="btn btn-primary btn-big" onClick={() => navigate(`/lekcja/${lesson.id}`)}>
            <Icon name="play" size={18} /> {started ? 'Kontynuuj naukę' : 'Zacznij pierwszą lekcję'}
          </button>
          {lesson.kind === 'grammar' && (
            <>
              <Link className="link-btn" to={`/lekcja/${lesson.id}?tryb=cwiczenia`}>Tylko ćwiczenia</Link>
              {lesson.grammar && <Link className="link-btn" to={`/teoria/${lesson.grammar}`}>Tylko teoria</Link>}
            </>
          )}
        </div>
      </div>
      {words.length > 0 && (
        <ul className="next-words" aria-label="Słowa w tej lekcji">
          {words.slice(0, 6).map((v) => (
            <li key={v.id}>
              <WordArt source={v} size="sm" />
              <span lang={course.pack.target.code}>{course.withArticle(v)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DayCard() {
  const goal = useApp((s) => s.settings.dailyGoal);
  const srs = useApp((s) => s.srs);
  const { xp, streak } = useDaily();
  const due = useMemo(() => {
    const now = Date.now();
    let n = 0;
    for (const s of srs.values()) if (s.kind !== 'c' && s.due <= now) n++;
    return n;
  }, [srs]);
  const reached = xp >= goal;

  return (
    <section className="day">
      <h2 className="side-title">Dzisiaj</h2>
      <p className="day-xp">
        <strong>{xp}</strong> z {goal} XP {reached && <span className="tag tag-ok">cel osiągnięty</span>}
      </p>
      <ProgressBar value={xp / goal} label={`Cel dzienny: ${xp} z ${goal} XP`} tone="sun" />
      <p className="day-streak">
        <Icon name="flame" size={18} className={xp > 0 ? 'is-lit' : undefined} />
        {streak > 0 ? `${streak} ${plural(streak, 'dzień', 'dni', 'dni')} z rzędu` : 'Zacznij serię dni nauki'}
      </p>
      {due > 0 && (
        <Link to="/trening/powtorka" className="day-due">
          <Icon name="refresh" size={16} />
          <span>
            {due} {plural(due, 'element czeka', 'elementy czekają', 'elementów czeka')} na powtórkę
          </span>
        </Link>
      )}
    </section>
  );
}

/** Słowo dnia: stałe w ciągu doby, wybierane spośród już poznanych (albo pierwszych w kursie). */
function WordOfDay() {
  const course = useApp((s) => s.course)!;
  const srs = useApp((s) => s.srs);
  const word = useMemo(() => {
    const all = [...course.vocab.values()];
    const known = all.filter((v) => srs.has(v.id));
    const pool = known.length >= 5 ? known : all.slice(0, 12);
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);
    return pool[day % pool.length];
  }, [course, srs]);
  if (!word) return null;
  const full = course.withArticle(word);
  return (
    <section className="wod">
      <h2 className="side-title">Słowo dnia</h2>
      <WordArt source={word} size="md" />
      <div className="wod-text">
        <p className="wod-word" lang={course.pack.target.code}>{full}</p>
        <p className="wod-meaning">{word.n}</p>
      </div>
      <SpeakButton text={full} size="sm" />
    </section>
  );
}

function UnitBlock({ unit, nextId }: { unit: Unit; nextId: string | null }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const unlocked = unit.lessons.some((l) => isLessonUnlocked(course, progress, l.id));
  const containsNext = unit.lessons.some((l) => l.id === nextId);
  const [open, setOpen] = useState<boolean | null>(null);
  const done = unitProgress(course, progress, unit.id) >= 1;
  // Ukończone jednostki zwijamy, żeby bieżąca była od razu pod ręką.
  const expanded = open ?? (containsNext || (unlocked && !done));
  const doneCount = unit.lessons.filter((l) => isLessonDone(course, progress, l.id)).length;

  return (
    <section className={`unit${unlocked ? '' : ' is-locked'}${done ? ' is-done' : ''}${containsNext ? ' is-current' : ''}`} aria-labelledby={`unit-${unit.id}`}>
      <header className="unit-head">
        <span className="unit-num" aria-hidden>{unit.index + 1}</span>
        <div className="unit-text">
          <h2 id={`unit-${unit.id}`} className="unit-title">
            <span className="sr-only">Jednostka {unit.index + 1}: </span>
            {unit.title}
          </h2>
          <p className="unit-sub">{unit.subtitle}</p>
          <p className="unit-meta">
            <span className="cefr" title={`Poziom ${unit.cefr}`}>{unit.cefr}</span>
            <span>{doneCount} z {unit.lessons.length} lekcji</span>
            {done && <span className="tag tag-ok"><Icon name="check" size={12} /> ukończona</span>}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn unit-toggle"
          onClick={() => setOpen(!expanded)}
          aria-expanded={expanded}
          aria-controls={`route-${unit.id}`}
          aria-label={expanded ? 'Zwiń lekcje' : 'Pokaż lekcje'}
        >
          <Icon name="next" size={20} />
        </button>
      </header>

      {expanded ? (
        <>
          <ol className="route" id={`route-${unit.id}`}>
            {unit.lessons.map((l) => (
              <Stop key={l.id} lesson={l} isNext={l.id === nextId} />
            ))}
          </ol>
          <div className="unit-actions">
            {unit.grammar.length > 0 && (
              <Link className="btn btn-ghost btn-sm" to={`/teoria?jednostka=${unit.id}`}>
                <Icon name="book" size={16} /> Teoria
              </Link>
            )}
            {unlocked && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/jednostka/${unit.id}/cwicz`)}>
                <Icon name="dumbbell" size={16} /> Poćwicz jednostkę
              </button>
            )}
            {!unlocked && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/jednostka/${unit.id}/przeskocz`)}>
                <Icon name="skip" size={16} /> Przeskocz tutaj testem
              </button>
            )}
          </div>
        </>
      ) : (
        !done && (
          <div className="unit-preview">
            <ul className="unit-goals">
              {unit.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            {!unlocked && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/jednostka/${unit.id}/przeskocz`)}>
                <Icon name="skip" size={16} /> Przeskocz tutaj testem
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}

/** Przystanek na trasie jednostki. */
function Stop({ lesson, isNext }: { lesson: Lesson; isNext: boolean }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const [sheet, setSheet] = useState(false);
  const done = isLessonDone(course, progress, lesson.id);
  const unlocked = isLessonUnlocked(course, progress, lesson.id);
  const stars = progress.lessons[lesson.id]?.stars ?? (done ? 1 : 0);
  const state = done ? 'done' : isNext ? 'next' : unlocked ? 'open' : 'locked';

  return (
    <li className={`stop stop-${state} stop-${lesson.kind}`}>
      <button
        type="button"
        className="stop-btn"
        disabled={!unlocked}
        onClick={() => setSheet(true)}
        aria-haspopup="dialog"
        aria-current={isNext ? 'step' : undefined}
        aria-label={`${KIND_LABEL[lesson.kind]}: ${lesson.title}${done ? `, ukończona, ${stars} z 3 gwiazdek` : unlocked ? '' : ', zablokowana'}`}
      >
        <span className="stop-dot" aria-hidden>
          <Icon name={done ? 'check' : unlocked ? KIND_ICON[lesson.kind] : 'lock'} size={done ? 16 : 18} />
        </span>
        <span className="stop-text">
          <span className="stop-kind">{KIND_LABEL[lesson.kind]}</span>
          <span className="stop-title">{lesson.title}</span>
        </span>
        {done && (
          <span className="stop-stars" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" size={14} className={i < stars ? 'star-on' : 'star-off'} />
            ))}
          </span>
        )}
        {isNext && <span className="stop-now">Start</span>}
      </button>
      <LessonSheet lesson={sheet ? lesson : null} onClose={() => setSheet(false)} />
    </li>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
