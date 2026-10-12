import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { currentStreak, todayXp } from '../data/progress.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Logo } from './Logo.tsx';
import { Flag } from './Flag.tsx';
import { Ring } from './ui.tsx';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Nauka', icon: 'path', end: true },
  { to: '/cwiczenia', label: 'Ćwiczenia', icon: 'dumbbell' },
  { to: '/teoria', label: 'Teoria', icon: 'book' },
  { to: '/slownik', label: 'Słownik', icon: 'cards' },
  { to: '/profil', label: 'Profil', icon: 'user' },
];

export function useDaily() {
  const revision = useApp((s) => s.revision);
  const [state, setState] = useState({ xp: 0, streak: 0 });
  useEffect(() => {
    let alive = true;
    void Promise.all([todayXp(), currentStreak()]).then(([xp, streak]) => alive && setState({ xp, streak }));
    return () => {
      alive = false;
    };
  }, [revision]);
  return state;
}

export function Shell() {
  const course = useApp((s) => s.course);
  const goal = useApp((s) => s.settings.dailyGoal);
  const onboarded = useApp((s) => s.settings.onboarded);
  const { xp, streak } = useDaily();
  const location = useLocation();

  useEffect(() => {
    document.querySelector('.shell-main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const showNav = onboarded && !!course;

  return (
    <div className={`shell${showNav ? '' : ' shell-bare'}`}>
      {showNav && (
        <aside className="rail" aria-label="Nawigacja główna">
          <Link to="/" className="rail-logo" aria-label="MultiLingua — strona główna">
            <Logo />
          </Link>
          <nav className="rail-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="rail-link">
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <Link to="/ustawienia" className="rail-link rail-settings">
            <Icon name="settings" />
            <span>Ustawienia</span>
          </Link>
        </aside>
      )}

      <div className="shell-column">
        {showNav && (
          <header className="topbar">
            <Link to="/kursy" className="course-chip" aria-label={`Kurs: ${course!.pack.title}. Zmień kurs`}>
              <Flag code={course!.pack.target.code} size={26} />
              <span className="course-chip-name">{course!.pack.title}</span>
            </Link>
            <div className="topbar-stats">
              <span className={`streak${xp > 0 ? ' is-lit' : ''}`} title="Seria dni nauki">
                <Icon name="flame" size={20} />
                <span>{streak}</span>
              </span>
              <Link to="/profil" className="topbar-ring" title={`Dzisiaj ${xp} z ${goal} XP`} aria-label={`Cel dzienny: ${xp} z ${goal} XP`}>
                <Ring value={xp / goal} size={38} stroke={4}>
                  <span className="ring-xp">{Math.min(xp, 999)}</span>
                </Ring>
              </Link>
            </div>
          </header>
        )}
        <main className="shell-main">
          <Outlet />
        </main>
        {showNav && (
          <nav className="tabbar" aria-label="Nawigacja">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="tab">
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
