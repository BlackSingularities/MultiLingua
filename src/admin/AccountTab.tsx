import { useState } from 'react';
import { API_BASE } from '../data/api.ts';
import { Icon } from '../components/Icon.tsx';
import { adminApi, type CourseInfo } from './api.ts';

export function AccountTab({ courses, onLogout }: { courses: CourseInfo[]; onLogout: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await adminApi.post('/password', { current, next });
      setMessage('Hasło zmienione.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const logout = async () => {
    await adminApi.post('/logout').catch(() => {});
    onLogout();
  };

  return (
    <div className="account-tab">
      <section className="admin-card">
        <h2>Kopia treści</h2>
        <p className="muted">
          Zmiany z panelu zapisują się na serwerze. Żeby trafiły do repozytorium (i do kolejnych wydań), pobierz eksport
          i rozpakuj pliki do <span className="mono">content/courses/&lt;kurs&gt;/</span>.
        </p>
        <div className="editor-actions">
          {courses.map((c) => (
            <a key={c.id} className="btn btn-ghost" href={`${API_BASE}/admin/export?course=${c.id}`} download>
              <Icon name="download" size={18} /> Eksport: {c.title}
            </a>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h2>Zmiana hasła</h2>
        <form className="stack-form" onSubmit={change}>
          <label className="field">
            <span>Obecne hasło</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>Nowe hasło (co najmniej 10 znaków)</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
          </label>
          {message && <p className="admin-ok" role="status">{message}</p>}
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary">Zmień hasło</button>
        </form>
      </section>

      <section className="admin-card">
        <h2>Sesja</h2>
        <p className="muted">Sesja wygasa po 12 godzinach. Wylogowanie działa tylko w tej przeglądarce.</p>
        <button type="button" className="btn btn-ghost" onClick={() => void logout()}>Wyloguj</button>
      </section>
    </div>
  );
}
