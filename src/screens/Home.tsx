import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lesson, LessonKind, Unit } from '../data/types.ts';
import { useApp } from '../data/store.ts';
import { isLessonDone, isLessonUnlocked, nextLesson, unitProgress } from '../data/progress.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Empty, ProgressBar, Ring, Spinner } from '../components/ui.tsx';
import { useDaily } from '../components/Shell.tsx';

const KIND_ICON: Record<LessonKind, IconName> = {
  learn: 'sparkle',
  grammar: 'book',
  story: 'story',
  speak: 'mic',
  test: 'trophy',
};

const KIND_LABEL: Record<LessonKind, string> = {
  learn: 'Słówka',
  grammar: 'Teoria',
  story: 'Historyjka',
  speak: 'Mówienie',
  test: 'Sprawdzian',
};

export function Home() {
  const course = useApp((s) => s.course);
  const progress = useApp((s) => s.progress);
  const srs = useApp((s) => s.srs);
  const goal = useApp((s) => s.settings.dailyGoal);
  const loading = useApp((s) => s.loadingCourse);
  const error = useApp((s) => s.courseError);
  const openCourse = useApp((s) => s.openCourse);
  const active = useApp((s) => s.settings.activeCourse);
  const { xp } = useDaily();
  const navigate = useNavigate();

  const due = useMemo(() => {
    const now = Date.now();
    let n = 0;
    for (const s of srs.values()) if (s.kind !== 'c' && s.due <= now) n++;
    return n;
  }, [srs]);

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
  const nextUnit = next ? course.unitById.get(next.unit) : null;

  return (
    <div className="home">
      <section className="today" aria-label="Dzisiaj">
        <Ring value={xp / goal} size={84} stroke={8}>
          <span className="today-xp">{xp}</span>
          <span className="today-goal">/ {goal} XP</span>
        </Ring>
        <div className="today-main">
          {next ? (
            <>
              <p className="today-label">
                {nextUnit?.title} · {KIND_LABEL[next.kind]}
              </p>
              <h1 className="today-title">{next.title}</h1>
              <button type="button" className="btn btn-primary btn-big" onClick={() => navigate(`/lekcja/${next.id}`)}>
                <Icon name="play" size={18} /> {Object.keys(progress.lessons).length ? 'Kontynuuj naukę' : 'Zacznij pierwszą lekcję'}
              </button>
            </>
          ) : (
            <>
              <h1 className="today-title">Cały kurs ukończony!</h1>
              <p className="muted">Utrzymuj formę dzięki powtórkom i treningom.</p>
            </>
          )}
          {due > 0 && (
            <Link to="/trening/powtorka" className="due-chip">
              <Icon name="refresh" size={16} /> {due} {plural(due, 'element czeka', 'elementy czekają', 'elementów czeka')} na powtórkę
            </Link>
          )}
        </div>
      </section>

      <div className="path">
        {course.units.map((u) => (
          <UnitBlock key={u.id} unit={u} nextId={next?.id ?? null} />
        ))}
      </div>
    </div>
  );
}

function UnitBlock({ unit, nextId }: { unit: Unit; nextId: string | null }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const unlocked = unit.lessons.some((l) => isLessonUnlocked(course, progress, l.id));
  const containsNext = unit.lessons.some((l) => l.id === nextId);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (unlocked || containsNext);
  const value = unitProgress(course, progress, unit.id);
  const done = value >= 1;

  return (
    <section className={`unit${unlocked ? '' : ' is-locked'}${done ? ' is-done' : ''}`} style={{ '--stamp': course.pack.color } as React.CSSProperties} aria-labelledby={`unit-${unit.id}`}>
      <header className="unit-head">
        <div className="unit-icon" aria-hidden>{unit.icon}</div>
        <div className="unit-text">
          <p className="unit-index">Jednostka {unit.index + 1}</p>
          <h2 id={`unit-${unit.id}`} className="unit-title">{unit.title}</h2>
          <p className="unit-sub">{unit.subtitle}</p>
        </div>
        <span className="cefr-stamp" title={`Poziom ${unit.cefr}`}>{unit.cefr}</span>
      </header>
      <ProgressBar value={value} label={`Postęp jednostki ${unit.title}`} tone="ok" />

      {expanded ? (
        <>
          <ol className="stamps">
            {unit.lessons.map((l, i) => (
              <StampNode key={l.id} lesson={l} offset={i} isNext={l.id === nextId} />
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
          </div>
        </>
      ) : (
        <div className="unit-locked">
          <ul className="unit-goals">
            {unit.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <div className="unit-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
              <Icon name="eye" size={16} /> Pokaż lekcje
            </button>
            {!unlocked && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/jednostka/${unit.id}/przeskocz`)}>
                <Icon name="skip" size={16} /> Przeskocz tutaj testem
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StampNode({ lesson, offset, isNext }: { lesson: Lesson; offset: number; isNext: boolean }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const done = isLessonDone(course, progress, lesson.id);
  const unlocked = isLessonUnlocked(course, progress, lesson.id);
  const stars = progress.lessons[lesson.id]?.stars ?? (done ? 1 : 0);
  // Zygzak ścieżki: przesunięcie po sinusoidzie, żeby stemple nie stały w kolumnie.
  const shift = Math.round(Math.sin(offset * 1.15) * 34);
  const tilt = ((offset * 37) % 11) - 5;
  const state = done ? 'done' : isNext ? 'next' : unlocked ? 'open' : 'locked';

  return (
    <li className={`stamp-item stamp-${state}`} style={{ '--shift': `${shift}%`, '--tilt': `${tilt}deg` } as React.CSSProperties}>
      <button
        type="button"
        className="stamp"
        disabled={!unlocked}
        onClick={() => navigate(`/lekcja/${lesson.id}`)}
        aria-label={`${KIND_LABEL[lesson.kind]}: ${lesson.title}${done ? `, ukończona, ${stars} z 3 gwiazdek` : unlocked ? '' : ', zablokowana'}`}
      >
        <span className="stamp-ring" aria-hidden>
          <Icon name={unlocked ? KIND_ICON[lesson.kind] : 'lock'} size={28} />
        </span>
        {done && (
          <span className="stamp-stars" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" size={12} className={i < stars ? 'star-on' : 'star-off'} />
            ))}
          </span>
        )}
      </button>
      <span className="stamp-label">
        {isNext && <span className="stamp-now">Teraz</span>}
        <span className="stamp-kind">{KIND_LABEL[lesson.kind]}</span>
        <span className="stamp-title">{lesson.title}</span>
      </span>
    </li>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
