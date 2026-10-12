import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isNative } from '../platform/native.ts';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Logo.tsx';
import { Spinner } from '../components/ui.tsx';
import { adminApi, AdminError, type CourseInfo, type Status } from './api.ts';
import { ContentTab, type Draft } from './ContentTab.tsx';
import { GenerateTab } from './GenerateTab.tsx';
import { ImagesTab } from './ImagesTab.tsx';
import { AiTab } from './AiTab.tsx';
import { AccountTab } from './AccountTab.tsx';
import './admin.css';

type Tab = 'content' | 'generate' | 'images' | 'ai' | 'account';

const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'content', label: 'Rozdziały', icon: 'book' },
  { id: 'generate', label: 'Nowy rozdział', icon: 'sparkle' },
  { id: 'images', label: 'Ilustracje', icon: 'grid' },
  { id: 'ai', label: 'Model AI', icon: 'bolt' },
  { id: 'account', label: 'Konto', icon: 'user' },
];

export default function AdminScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    adminApi.get<Status>('/status').then(setStatus, (e: AdminError) => setError(e.status === 404 ? 'Ten serwer nie ma włączonego panelu administratora.' : e.message));
  }, []);
  useEffect(refresh, [refresh]);

  if (isNative) {
    return (
      <div className="admin-gate">
        <h1>Panel administratora</h1>
        <p className="muted">Panel działa tylko w przeglądarce, na stronie MultiLingua.</p>
        <Link to="/" className="btn btn-primary">Wróć do nauki</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="admin-gate">
        <h1>Panel administratora</h1>
        <p className="error-text">{error}</p>
        <button type="button" className="btn btn-ghost" onClick={() => { setError(null); refresh(); }}>Spróbuj ponownie</button>
      </div>
    );
  }
  if (!status) return <Spinner label="Łączę się z panelem…" />;
  if (!status.loggedIn) return <Gate configured={status.configured} onDone={refresh} />;
  return <Panel status={status} onLogout={refresh} />;
}

function Gate({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!configured && password !== repeat) return setError('Hasła się różnią.');
    setBusy(true);
    try {
      if (configured) await adminApi.post('/login', { password });
      else await adminApi.post('/setup', { code, password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-gate" onSubmit={submit}>
      <Logo />
      <h1>{configured ? 'Zaloguj się do panelu' : 'Załóż konto administratora'}</h1>
      {!configured && (
        <p className="muted">
          To pierwsze uruchomienie panelu. Kod startowy znajdziesz w logu serwera (wiersz „Kod startowy: …”)
          albo w zmiennej <code>ADMIN_SETUP_CODE</code>.
        </p>
      )}
      {!configured && (
        <label className="field">
          <span>Kod startowy</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus required />
        </label>
      )}
      <label className="field">
        <span>{configured ? 'Hasło' : 'Nowe hasło (co najmniej 10 znaków)'}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={configured ? 'current-password' : 'new-password'}
          minLength={configured ? undefined : 10}
          autoFocus={configured}
          required
        />
      </label>
      {!configured && (
        <label className="field">
          <span>Powtórz hasło</span>
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
        </label>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
        {busy ? 'Chwileczkę…' : configured ? 'Zaloguj' : 'Załóż konto i zaloguj'}
      </button>
      <Link to="/" className="link-btn">Wróć do nauki</Link>
    </form>
  );
}

function Panel({ status, onLogout }: { status: Status; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('content');
  const [courses, setCourses] = useState<CourseInfo[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadCourses = useCallback(() => {
    void adminApi.get<{ courses: CourseInfo[] }>('/courses').then((r) => setCourses(r.courses));
  }, []);
  useEffect(loadCourses, [loadCourses]);

  const openDraft = (d: Draft) => {
    setDraft(d);
    setTab('content');
  };

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <p className="admin-kicker">MultiLingua</p>
          <h1 className="admin-title">Panel treści</h1>
        </div>
        <nav className="admin-tabs" aria-label="Sekcje panelu">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`admin-tab${tab === t.id ? ' on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      {status.seed?.pending && (
        <p className="admin-note">
          <Icon name="alert" size={16} /> W repozytorium jest nowsza treść kursów, ale nie została wgrana, bo w panelu są lokalne zmiany.
          Pobierz eksport w zakładce „Konto” i dołącz zmiany do repozytorium.
        </p>
      )}
      {!courses ? (
        <Spinner label="Wczytuję kursy…" />
      ) : (
        <>
          {tab === 'content' && <ContentTab courses={courses} reload={loadCourses} draft={draft} clearDraft={() => setDraft(null)} />}
          {tab === 'generate' && <GenerateTab courses={courses} onDraft={openDraft} goToAi={() => setTab('ai')} />}
          {tab === 'images' && <ImagesTab courses={courses} />}
          {tab === 'ai' && <AiTab />}
          {tab === 'account' && <AccountTab courses={courses} onLogout={onLogout} />}
        </>
      )}
    </div>
  );
}
