import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCourses, type CourseList } from '../data/api.ts';
import { useApp } from '../data/store.ts';
import type { CourseSummary } from '../data/types.ts';
import { Icon } from '../components/Icon.tsx';
import { LogoMark } from '../components/Logo.tsx';
import { Flag } from '../components/Flag.tsx';
import { Empty, Spinner } from '../components/ui.tsx';
import { plural } from './Home.tsx';

const GOALS = [
  { xp: 10, label: 'Na luzie', desc: 'ok. 5 minut dziennie' },
  { xp: 20, label: 'Regularnie', desc: 'ok. 10 minut dziennie' },
  { xp: 30, label: 'Na poważnie', desc: 'ok. 15 minut dziennie' },
  { xp: 50, label: 'Intensywnie', desc: 'ok. 25 minut dziennie' },
];

export function Courses() {
  const [list, setList] = useState<CourseList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<CourseSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const openCourse = useApp((s) => s.openCourse);
  const active = useApp((s) => s.course?.id);
  const navigate = useNavigate();

  const load = () => {
    setError(null);
    fetchCourses().then(setList, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  const start = async (c: CourseSummary, goal?: number) => {
    setBusy(c.id);
    try {
      await openCourse(c.id);
      await updateSettings({ onboarded: true, ...(goal ? { dailyGoal: goal } : {}) });
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const choose = (c: CourseSummary) => {
    if (!settings.onboarded) setPending(c);
    else void start(c);
  };

  const mine = list?.courses.filter((c) => settings.myCourses.includes(c.id)) ?? [];
  const others = list?.courses.filter((c) => !settings.myCourses.includes(c.id)) ?? [];

  if (pending) {
    return (
      <div className="onboard">
        <p className="onboard-flag"><Flag code={pending.target.code} size={72} /></p>
        <h1 className="onboard-title">Ile czasu dziennie?</h1>
        <p className="muted center">Cel możesz zmienić w każdej chwili w ustawieniach.</p>
        <div className="goal-list" role="radiogroup" aria-label="Dzienny cel">
          {GOALS.map((g) => (
            <button
              key={g.xp}
              type="button"
              role="radio"
              aria-checked={false}
              className="goal-option"
              disabled={!!busy}
              onClick={() => void start(pending, g.xp)}
            >
              <span className="goal-label">{g.label}</span>
              <span className="goal-desc">{g.desc}</span>
              <span className="goal-xp">{g.xp} XP</span>
            </button>
          ))}
        </div>
        {busy && <Spinner label="Pobieram kurs…" />}
        {error && <p className="error-text center">{error}</p>}
        <button type="button" className="link-btn" onClick={() => setPending(null)}>
          Wróć do listy kursów
        </button>
      </div>
    );
  }

  return (
    <div className="courses">
      {!settings.onboarded && (
        <header className="welcome">
          <LogoMark size={64} />
          <h1 className="welcome-title">MultiLingua</h1>
          <p className="welcome-lead">
            Ucz się języków przez rozmowy, historyjki, słuchanie i mówienie. Gramatyka tłumaczona po polsku,
            powtórki dopasowane do Twojej pamięci. Bez konta — postępy zostają na tym urządzeniu.
          </p>
        </header>
      )}
      {settings.onboarded && <h1 className="page-title">Twoje kursy</h1>}

      {!list && !error && <Spinner label="Łączę się z serwerem kursów…" />}
      {error && !list && (
        <Empty icon="📡" title="Brak połączenia" action={<button className="btn btn-primary" onClick={load}>Spróbuj ponownie</button>}>
          Do pobrania kursu potrzebny jest internet. Po pobraniu działa on także offline. ({error})
        </Empty>
      )}
      {list && !list.online && (
        <p className="offline-note">
          <Icon name="alert" size={16} /> Jesteś offline — widzisz tylko kursy pobrane na to urządzenie.
        </p>
      )}

      {mine.length > 0 && (
        <section className="course-grid" aria-label="Moje kursy">
          {mine.map((c) => (
            <CourseCard key={c.id} c={c} current={c.id === active} busy={busy === c.id} onPick={() => choose(c)} />
          ))}
        </section>
      )}
      {others.length > 0 && (
        <>
          {mine.length > 0 && <h2 className="section-title">Dodaj kolejny język</h2>}
          <section className="course-grid" aria-label="Dostępne kursy">
            {others.map((c) => (
              <CourseCard key={c.id} c={c} current={false} busy={busy === c.id} onPick={() => choose(c)} />
            ))}
          </section>
        </>
      )}
      {error && list && <p className="error-text">{error}</p>}
    </div>
  );
}

function CourseCard({ c, current, busy, onPick }: { c: CourseSummary; current: boolean; busy: boolean; onPick: () => void }) {
  return (
    <article className={`course-card${current ? ' is-current' : ''}`} style={{ '--stamp': c.color } as React.CSSProperties}>
      <div className="course-card-top">
        <span className="course-flag"><Flag code={c.target.code} size={40} /></span>
        <div>
          <h3 className="course-name">{c.title}</h3>
          <p className="course-pair">
            {c.native.name} → {c.target.name} · {c.levels}
          </p>
        </div>
      </div>
      <p className="course-tagline">{c.tagline}</p>
      <p className="course-desc">{c.description}</p>
      <ul className="course-facts">
        <li><strong>{c.units}</strong> {plural(c.units, 'jednostka', 'jednostki', 'jednostek')}</li>
        <li><strong>{c.lessons}</strong> {plural(c.lessons, 'lekcja', 'lekcje', 'lekcji')}</li>
        <li><strong>{c.words}</strong> {plural(c.words, 'słówko', 'słówka', 'słówek')}</li>
        <li><strong>{c.stories}</strong> {plural(c.stories, 'historyjka', 'historyjki', 'historyjek')}</li>
      </ul>
      <button type="button" className="btn btn-primary btn-wide" onClick={onPick} disabled={busy}>
        {busy ? 'Pobieram…' : current ? 'Kontynuuj' : 'Ucz się tego języka'}
      </button>
    </article>
  );
}
