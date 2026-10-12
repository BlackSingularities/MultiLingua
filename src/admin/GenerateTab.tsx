import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { adminApi, type AiSettings, type CourseInfo, type Generated } from './api.ts';
import type { Draft } from './ContentTab.tsx';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function GenerateTab({ courses, onDraft, goToAi }: { courses: CourseInfo[]; onDraft: (d: Draft) => void; goToAi: () => void }) {
  const [course, setCourse] = useState(courses[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [cefr, setCefr] = useState(() => courses[0]?.units.at(-1)?.cefr ?? 'A1');
  const [grammar, setGrammar] = useState('');
  const [words, setWords] = useState(30);
  const [sentences, setSentences] = useState(22);
  const [stories, setStories] = useState(1);
  const [notes, setNotes] = useState('');
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminApi.get<AiSettings>('/settings').then(setSettings);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const current = courses.find((c) => c.id === course);
  const lastUnits = current?.units.slice(-3) ?? [];

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      const r = await adminApi.post<Generated>('/generate/unit', {
        course,
        brief: { title, topic, cefr, grammar, words, sentences, stories, notes },
      });
      onDraft({
        course,
        file: r.file,
        text: r.text,
        validation: r,
        isNew: true,
        note: r.ok
          ? `Szkic od modelu ${r.model} jest gotowy i poprawny. Przejrzyj go i zapisz.`
          : `Szkic od modelu ${r.model} ma błędy walidacji — popraw je ręcznie albo przyciskiem „Napraw błędy walidacji z AI”.`,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gen">
      <div className="gen-intro">
        <h2>Nowy rozdział z pomocą AI</h2>
        <p className="muted">
          Opisz temat, a model napisze cały rozdział: słówka dopasowane do tego, co uczeń już zna, zdania tylko z
          poznanych słów, teorię podzieloną na kroki (po każdym kroku są ćwiczenia z tego kroku), tabele odmian i
          historyjkę. Szkic trafia do edytora — zapisujesz go dopiero po przejrzeniu.
        </p>
        {settings && (
          <p className="gen-model">
            Model: <strong>{settings.model}</strong>{' '}
            {!settings.hasKey && <span className="error-text">— brak klucza OpenRouter.</span>}{' '}
            <button type="button" className="link-btn small" onClick={goToAi}>Zmień</button>
          </p>
        )}
      </div>

      <form className="gen-form" onSubmit={generate}>
        <label className="field">
          <span>Kurs</span>
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
          </select>
        </label>
        {lastUnits.length > 0 && (
          <p className="gen-after muted small">
            Nowy rozdział będzie po: {lastUnits.map((u) => `${u.title} (${u.cefr})`).join(', ')}.
          </p>
        )}
        <div className="field-row">
          <label className="field">
            <span>Tytuł w języku kursu</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Al mercato" required />
          </label>
          <label className="field field-sm">
            <span>Poziom</span>
            <select value={cefr} onChange={(e) => setCefr(e.target.value)}>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Temat i sytuacje</span>
          <textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="np. zakupy na targu: owoce i warzywa, ilości, ceny, pytanie o cenę i targowanie się" required />
        </label>
        <label className="field">
          <span>Gramatyka (opcjonalnie)</span>
          <textarea rows={2} value={grammar} onChange={(e) => setGrammar(e.target.value)} placeholder="np. liczebniki 20–100 i partitivo (del, della, dei); puste = model zaproponuje kolejny krok" />
        </label>
        <div className="field-row">
          <label className="field field-sm">
            <span>Słówek</span>
            <input type="number" min={8} max={60} value={words} onChange={(e) => setWords(Number(e.target.value))} />
          </label>
          <label className="field field-sm">
            <span>Zdań</span>
            <input type="number" min={6} max={50} value={sentences} onChange={(e) => setSentences(Number(e.target.value))} />
          </label>
          <label className="field field-sm">
            <span>Historyjek</span>
            <input type="number" min={0} max={3} value={stories} onChange={(e) => setStories(Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Dodatkowe wskazówki (opcjonalnie)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="np. bohaterowie historyjki: Marco i Giulia z wcześniejszych rozdziałów" />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-big" disabled={busy || !settings?.hasKey}>
          <Icon name="sparkle" size={18} /> {busy ? `Model pisze rozdział… ${elapsed} s` : 'Wygeneruj szkic rozdziału'}
        </button>
        {busy && <p className="muted small">Duże modele potrzebują zwykle 1–3 minut. Nie zamykaj tej karty.</p>}
      </form>
    </div>
  );
}
