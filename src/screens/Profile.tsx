import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { achievements, overview, type Overview } from '../data/progress.ts';
import { dayKey } from '../data/db.ts';
import { fetchMeta } from '../data/api.ts';
import type { AppMeta } from '../data/types.ts';
import { SKILL_LABELS, type Skill } from '../engine/types.ts';
import { appVersion, isNative, platform } from '../platform/native.ts';
import { Icon } from '../components/Icon.tsx';
import { ProgressBar, Spinner } from '../components/ui.tsx';

export function Profile() {
  const course = useApp((s) => s.course);
  const revision = useApp((s) => s.revision);
  const [ov, setOv] = useState<Overview | null>(null);
  const [scope, setScope] = useState<'course' | 'all'>('course');
  useEffect(() => {
    void overview(scope === 'course' ? course?.id : undefined).then(setOv);
  }, [course?.id, revision, scope]);

  if (!ov) return <Spinner label="Liczę statystyki…" />;
  const badges = achievements(ov);
  const earned = badges.filter((b) => b.progress >= b.goal).length;

  return (
    <div className="profile">
      <div className="profile-head">
        <h1 className="page-title">Profil</h1>
        <Link to="/ustawienia" className="btn btn-ghost btn-sm">
          <Icon name="settings" size={16} /> Ustawienia
        </Link>
      </div>

      <dl className="stat-grid">
        <Stat icon="🔥" value={ov.streak} label={ov.streak === 1 ? 'dzień serii' : 'dni serii'} />
        <Stat icon="🏅" value={ov.longestStreak} label="najdłuższa seria" />
        <Stat icon="⭐" value={ov.totalXp} label="XP łącznie" />
        <Stat icon="📗" value={ov.wordsLearned} label="poznanych słówek" />
        <Stat icon="💪" value={ov.wordsStrong} label="dobrze utrwalonych" />
        <Stat icon="⏱️" value={ov.minutes} label="minut nauki" />
      </dl>

      <section className="panel">
        <h2 className="section-title">Ostatnie tygodnie</h2>
        <Heatmap days={ov.days} />
      </section>

      {course && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">Umiejętności</h2>
            <div className="seg" role="radiogroup" aria-label="Zakres">
              <button type="button" role="radio" aria-checked={scope === 'course'} className={`seg-btn${scope === 'course' ? ' on' : ''}`} onClick={() => setScope('course')}>
                {course.pack.title}
              </button>
              <button type="button" role="radio" aria-checked={scope === 'all'} className={`seg-btn${scope === 'all' ? ' on' : ''}`} onClick={() => setScope('all')}>
                Wszystkie kursy
              </button>
            </div>
          </div>
          <SkillBars skills={ov.skills} />
          <p className="muted small">
            Trafność łącznie: {Math.round(ov.accuracy * 100)}% z {ov.answers} odpowiedzi. Słabsze umiejętności dostają więcej ćwiczeń.
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">
          Odznaki <span className="muted">{earned}/{badges.length}</span>
        </h2>
        <ul className="badges">
          {badges.map((b) => {
            const got = b.progress >= b.goal;
            return (
              <li key={b.id} className={`badge-card${got ? ' is-earned' : ''}`}>
                <span className="badge-icon" aria-hidden>{b.icon}</span>
                <span className="badge-title">{b.title}</span>
                <span className="badge-desc">{b.desc}</span>
                {!got && <ProgressBar value={b.progress / b.goal} label={`${b.title}: ${b.progress} z ${b.goal}`} tone="sun" />}
              </li>
            );
          })}
        </ul>
      </section>

      <AboutApp />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <span aria-hidden>{icon}</span> {value.toLocaleString('pl-PL')}
      </dd>
    </div>
  );
}

function SkillBars({ skills }: { skills: Overview['skills'] }) {
  const merged = useMemo(() => {
    const m = new Map<Skill, { acc: number; n: number }>();
    for (const s of skills) {
      const cur = m.get(s.skill) ?? { acc: 0, n: 0 };
      m.set(s.skill, { acc: (cur.acc * cur.n + s.acc * s.n) / Math.max(1, cur.n + s.n), n: cur.n + s.n });
    }
    return m;
  }, [skills]);
  return (
    <ul className="skills">
      {(Object.keys(SKILL_LABELS) as Skill[]).map((k) => {
        const s = merged.get(k);
        return (
          <li key={k} className="skill-row">
            <span className="skill-name">{SKILL_LABELS[k]}</span>
            <ProgressBar value={s ? s.acc : 0} label={SKILL_LABELS[k]} tone={s && s.acc < 0.7 ? 'sun' : 'ok'} />
            <span className="skill-val">{s && s.n >= 3 ? `${Math.round(s.acc * 100)}%` : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Heatmap({ days }: { days: Overview['days'] }) {
  const weeks = 17;
  const map = new Map(days.map((d) => [d.day, d.xp]));
  const today = new Date();
  // Kolumny = tygodnie (poniedziałek u góry), ostatnia kolumna kończy się dzisiaj.
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  const cells: { key: string; xp: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d.getTime());
    cells.push({ key, xp: map.get(key) ?? 0, future: d > today });
  }
  const level = (xp: number) => (xp === 0 ? 0 : xp < 15 ? 1 : xp < 30 ? 2 : xp < 60 ? 3 : 4);
  return (
    <div className="heatmap" role="img" aria-label="Aktywność w ostatnich tygodniach">
      {cells.map((c) => (
        <span key={c.key} className={`hm hm-${c.future ? 'x' : level(c.xp)}`} title={c.future ? '' : `${c.key}: ${c.xp} XP`} />
      ))}
    </div>
  );
}

function AboutApp() {
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [version, setVersion] = useState(__APP_VERSION__);
  useEffect(() => {
    void appVersion().then(setVersion);
    fetchMeta().then(setMeta, () => {});
  }, []);
  const newer = meta && isNewer(meta.app.version, version);
  return (
    <section className="panel about">
      <h2 className="section-title">O aplikacji</h2>
      <p>
        MultiLingua {version}
        {meta && <span className="muted"> · treść kursów {meta.content.version}</span>}
      </p>
      {newer && (
        <p className="update-note">
          Dostępna jest nowa wersja {meta.app.version}.{' '}
          {isNative && platform === 'android' ? (
            <a href={meta.app.apkUrl} target="_blank" rel="noreferrer">Pobierz aktualizację</a>
          ) : !isNative ? (
            <button type="button" className="link-btn" onClick={() => location.reload()}>Odśwież stronę</button>
          ) : (
            <a href={meta.app.releasesUrl} target="_blank" rel="noreferrer">Zobacz wydania</a>
          )}
        </p>
      )}
      {!isNative && meta && (
        <p>
          <a className="btn btn-ghost btn-sm" href={meta.app.apkUrl}>
            <Icon name="phone" size={16} /> Pobierz aplikację na Androida
          </a>
        </p>
      )}
      <p className="muted small">
        Wersja 1.0 działa bez konta: postępy, powtórki i statystyki zapisują się tylko na tym urządzeniu. Treść kursów
        pobierana jest z serwera i przechowywana lokalnie, więc nauka działa także offline.{' '}
        {meta && (
          <a href={meta.app.repoUrl} target="_blank" rel="noreferrer">
            Kod źródłowy
          </a>
        )}
      </p>
    </section>
  );
}

export function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}
