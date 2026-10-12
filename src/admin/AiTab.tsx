import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../components/ui.tsx';
import { adminApi, type AiSettings, type ModelInfo } from './api.ts';

/** Dostawcy, których modele dobrze radzą sobie z długim, ustrukturyzowanym tekstem po polsku. */
const SUGGESTED = ['anthropic/', 'openai/', 'google/', 'mistralai/', 'deepseek/', 'x-ai/', 'qwen/'];

export function AiTab() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [key, setKey] = useState('');
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => void adminApi.get<AiSettings>('/settings').then(setSettings);
  useEffect(() => {
    load();
    adminApi.get<{ models: ModelInfo[] }>('/models').then((r) => setModels(r.models), (e: Error) => setModelsError(e.message));
  }, []);

  const save = async (patch: { model?: string; openrouterKey?: string }, done: string) => {
    setError(null);
    setMessage(null);
    try {
      await adminApi.put('/settings', patch);
      setMessage(done);
      setKey('');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const list = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    // Warianty „:batch” działają tylko w trybie wsadowym — w panelu nieprzydatne.
    const filtered = models.filter((m) => !m.id.includes(':batch') && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)));
    const rank = (m: ModelInfo) => (SUGGESTED.findIndex((p) => m.id.startsWith(p)) + 1 || 99);
    // W obrębie dostawcy nowsze wersje (wyższe numery) na górze.
    return filtered.sort((a, b) => rank(a) - rank(b) || b.id.localeCompare(a.id, 'en', { numeric: true })).slice(0, 80);
  }, [models, query]);

  if (!settings) return <Spinner label="Wczytuję ustawienia…" />;

  return (
    <div className="ai-tab">
      <section className="admin-card">
        <h2>Klucz OpenRouter</h2>
        {settings.keyFromEnv ? (
          <p className="muted">Klucz pochodzi ze zmiennej środowiskowej <code>OPENROUTER_API_KEY</code> ({settings.keyHint}).</p>
        ) : (
          <>
            <p className="muted">
              {settings.hasKey ? `Zapisany klucz kończy się na ${settings.keyHint}.` : 'Brak klucza — generowanie jest wyłączone.'}{' '}
              Klucz utworzysz na openrouter.ai w ustawieniach konta (Keys). Jest przechowywany tylko na serwerze.
            </p>
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void save({ openrouterKey: key }, 'Zapisano klucz.'); }}>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-v1-…" autoComplete="off" aria-label="Klucz OpenRouter" />
              <button type="submit" className="btn btn-primary" disabled={!key.trim()}>Zapisz klucz</button>
              {settings.hasKey && (
                <button type="button" className="btn btn-ghost" onClick={() => void save({ openrouterKey: '' }, 'Usunięto klucz.')}>Usuń</button>
              )}
            </form>
          </>
        )}
      </section>

      <section className="admin-card">
        <h2>Model do generowania treści</h2>
        <p>Teraz: <strong className="mono">{settings.model}</strong></p>
        {message && <p className="admin-ok" role="status">{message}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void save({ model: manual.trim() }, `Wybrano ${manual.trim()}.`); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Wpisz identyfikator, np. anthropic/claude-sonnet-5.5" aria-label="Identyfikator modelu" />
          <button type="submit" className="btn btn-ghost" disabled={!manual.trim()}>Ustaw</button>
        </form>
        {modelsError && <p className="error-text">{modelsError}</p>}
        {!models && !modelsError && <Spinner label="Pobieram listę modeli z OpenRouter…" />}
        {models && (
          <>
            <label className="search">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Szukaj wśród ${models.length} modeli`} aria-label="Szukaj modelu" />
            </label>
            <ul className="model-list">
              {list.map((m) => (
                <li key={m.id}>
                  <button type="button" className={`model${m.id === settings.model ? ' on' : ''}`} onClick={() => void save({ model: m.id }, `Wybrano ${m.name}.`)}>
                    <span className="model-name">{m.name}</span>
                    <span className="model-id mono">{m.id}</span>
                    <span className="model-meta">
                      {m.context ? `${Math.round(m.context / 1000)}k kontekstu` : ''}
                      {m.promptPrice || m.completionPrice
                        ? ` · $${m.promptPrice.toFixed(2)} / $${m.completionPrice.toFixed(2)} za 1 mln tokenów (wejście / wyjście)`
                        : ' · bezpłatny'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Rozdział to zwykle ok. 15–25 tys. tokenów wejścia i 6–12 tys. wyjścia. Najlepsze wyniki dają duże modele
              ogólne; małe często łamią format YAML.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
