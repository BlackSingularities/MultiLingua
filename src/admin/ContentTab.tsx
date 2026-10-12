import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../data/store.ts';
import { Icon } from '../components/Icon.tsx';
import { Modal, Spinner } from '../components/ui.tsx';
import { adminApi, download, type CourseInfo, type Generated, type Validation } from './api.ts';

export interface Draft {
  course: string;
  file: string;
  text: string;
  validation?: Validation;
  /** Plik jeszcze nie istnieje na serwerze. */
  isNew: boolean;
  note?: string;
}

interface Selected {
  course: string;
  file: string;
}

export function ContentTab({
  courses, reload, draft, clearDraft,
}: { courses: CourseInfo[]; reload: () => void; draft: Draft | null; clearDraft: () => void }) {
  const [sel, setSel] = useState<Selected | null>(draft ? { course: draft.course, file: draft.file } : null);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<Draft | null>(null);

  useEffect(() => {
    if (draft) setSel({ course: draft.course, file: draft.file });
  }, [draft]);

  // Na wąskim ekranie edytor jest pod listą plików — przewijamy do niego po wyborze.
  const pane = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sel && window.matchMedia('(max-width: 979px)').matches) pane.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sel]);

  const pick = (s: Selected) => {
    if (dirty && !confirm('Masz niezapisane zmiany. Porzucić je?')) return;
    clearDraft();
    setDirty(false);
    setSel(s);
  };

  const newUnit = (c: CourseInfo) => {
    if (dirty && !confirm('Masz niezapisane zmiany. Porzucić je?')) return;
    const next = c.units.reduce((m, u) => Math.max(m, Number(u.id?.slice(1)) || 0), 0) + 1;
    const nn = String(next).padStart(2, '0');
    setDirty(false);
    const d: Draft = { course: c.id, file: `units/${nn}-nowy-rozdzial.yaml`, text: unitTemplate(nn), isNew: true, note: 'Szablon nowego rozdziału — uzupełnij i zapisz. Nazwę pliku możesz zmienić poniżej.' };
    setSel({ course: d.course, file: d.file });
    setTemplate(d);
  };
  const active = draft ?? template;
  const activeDraft = active && sel && active.course === sel.course && active.file === sel.file ? active : null;

  return (
    <div className="content-tab">
      <aside className="file-list" aria-label="Pliki kursów">
        {courses.map((c) => (
          <section key={c.id}>
            <h2 className="file-course">{c.title} <span className="muted">{c.id}</span></h2>
            <ul>
              <li>
                <button type="button" className={`file-item${sel?.course === c.id && sel.file === 'course.yaml' ? ' on' : ''}`} onClick={() => pick({ course: c.id, file: 'course.yaml' })}>
                  <span className="file-icon" aria-hidden>⚙️</span>
                  <span className="file-text"><strong>Ustawienia kursu</strong><span>course.yaml</span></span>
                </button>
              </li>
              {c.units.map((u) => (
                <li key={u.file}>
                  <button type="button" className={`file-item${sel?.course === c.id && sel.file === u.file ? ' on' : ''}`} onClick={() => pick({ course: c.id, file: u.file })}>
                    <span className="file-icon" aria-hidden>{u.icon ?? '📄'}</span>
                    <span className="file-text">
                      <strong>{u.id ? `${Number(u.id.slice(1))}. ` : ''}{u.title ?? u.file}</strong>
                      <span>
                        {u.error
                          ? 'błąd w pliku'
                          : `${u.cefr ?? ''} · ${u.counts?.vocab ?? 0} słów · ${u.counts?.sentences ?? 0} zdań · ${u.counts?.grammar ?? 0} teorii`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {active?.isNew && active.course === c.id && !c.units.some((u) => u.file === active.file) && (
                <li>
                  <button type="button" className={`file-item is-draft${sel?.file === active.file ? ' on' : ''}`} onClick={() => setSel({ course: active.course, file: active.file })}>
                    <span className="file-icon" aria-hidden>✳️</span>
                    <span className="file-text"><strong>Szkic: {active.file.replace('units/', '')}</strong><span>niezapisany</span></span>
                  </button>
                </li>
              )}
            </ul>
            <button type="button" className="btn btn-ghost btn-sm btn-wide" onClick={() => newUnit(c)}>
              <Icon name="plus" size={16} /> Pusty rozdział
            </button>
          </section>
        ))}
      </aside>

      <section className="editor-pane" ref={pane}>
        {sel ? (
          <Editor
            key={`${sel.course}/${sel.file}/${activeDraft ? 'draft' : 'file'}`}
            course={sel.course}
            file={sel.file}
            draft={activeDraft}
            onDirty={setDirty}
            onSaved={(file) => {
              clearDraft();
              setTemplate(null);
              setDirty(false);
              setSel({ course: sel.course, file });
              reload();
            }}
            onDeleted={() => {
              setDirty(false);
              setSel(null);
              reload();
            }}
          />
        ) : (
          <div className="editor-empty">
            <h2>Wybierz plik do edycji</h2>
            <p className="muted">
              Każdy rozdział to jeden plik YAML: słówka, zdania, teoria w krokach, tabele odmian i historyjki.
              Po zapisie serwer sprawdza plik, przebudowuje kurs i aplikacje pobierają nową treść.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Editor({
  course, file: initialFile, draft, onDirty, onSaved, onDeleted,
}: {
  course: string;
  file: string;
  draft: Draft | null;
  onDirty: (d: boolean) => void;
  onSaved: (file: string) => void;
  onDeleted: () => void;
}) {
  const [text, setText] = useState<string | null>(draft?.text ?? null);
  const [saved, setSaved] = useState<string>(draft?.isNew ? '' : draft?.text ?? '');
  const [file, setFile] = useState(initialFile);
  const [validation, setValidation] = useState<Validation | null>(draft?.validation ?? null);
  const [busy, setBusy] = useState<null | 'check' | 'save' | 'ai' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(draft?.note ?? null);
  const [instruction, setInstruction] = useState('');
  const [undo, setUndo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const isNew = !!draft?.isNew;
  const isUnit = initialFile.startsWith('units/');
  const openCourse = useApp((s) => s.openCourse);
  const activeCourse = useApp((s) => s.settings.activeCourse);

  useEffect(() => {
    if (draft) return;
    adminApi.get<{ text: string }>(`/file?course=${course}&file=${encodeURIComponent(initialFile)}`).then(
      (r) => {
        setText(r.text);
        setSaved(r.text);
      },
      (e: Error) => setError(e.message),
    );
  }, [course, initialFile, draft]);

  const dirty = text !== null && (text !== saved || file !== initialFile);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const outline = useMemo(() => (text ? buildOutline(text) : []), [text]);

  const run = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      return await fn();
    } catch (e) {
      const err = e as Error & { errors?: string[] };
      setError(err.message);
      if (err.errors?.length) setValidation({ ok: false, errors: err.errors, warnings: [], stats: null });
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const check = () => run('check', async () => {
    const v = await adminApi.post<Validation>('/validate', { course, file, text });
    setValidation(v);
    if (v.ok) setMessage('Plik jest poprawny.');
  });

  const save = () => run('save', async () => {
    if (!/^(course\.yaml|units\/\d{2}-[a-z0-9-]+\.yaml)$/.test(file)) throw new Error('Nazwa pliku: units/NN-nazwa.yaml (małe litery, cyfry, myślniki).');
    const r = await adminApi.put<Validation & { saved: boolean; lines?: string[] }>('/file', {
      course, file, text, previous: !isNew && file !== initialFile ? initialFile : undefined,
    });
    setValidation(r);
    if (!r.saved) {
      setError('Nie zapisano — popraw błędy poniżej.');
      return;
    }
    setSaved(text ?? '');
    setMessage(`Zapisano i przebudowano kurs. ${r.lines?.join(' ') ?? ''}`);
    // Ta przeglądarka od razu pobierze nową wersję kursu.
    if (activeCourse === course) void openCourse(course).catch(() => {});
    onSaved(file);
  });

  const revise = (withErrors: boolean) => run('ai', async () => {
    const r = await adminApi.post<Generated>('/generate/revise', {
      course, file, text, instruction, errors: withErrors ? validation?.errors ?? [] : [],
    });
    setUndo(text);
    setText(r.text);
    setValidation(r);
    setMessage(`Propozycja modelu ${r.model} jest w edytorze${r.usage?.cost ? ` (koszt ok. $${r.usage.cost.toFixed(3)})` : ''}. Sprawdź ją i zapisz albo cofnij.`);
  });

  const remove = () => run('delete', async () => {
    const r = await adminApi.del<Validation & { deleted: boolean }>('/file', { course, file: initialFile });
    if (!r.deleted) {
      setValidation(r);
      setError('Nie można usunąć — kurs bez tego pliku byłby niepoprawny.');
      return;
    }
    onDeleted();
  });

  const jump = (line: number) => {
    const el = area.current;
    if (!el || text === null) return;
    const pos = text.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
    el.focus();
    el.setSelectionRange(pos, pos);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, line * lh - el.clientHeight / 3);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty && !busy) void save();
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en, value } = el;
    const next = `${value.slice(0, s)}  ${value.slice(en)}`;
    setText(next);
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
  };

  if (text === null) return error ? <p className="error-text">{error}</p> : <Spinner label="Wczytuję plik…" />;

  return (
    <div className="editor">
      <div className="editor-top">
        {isNew || isUnit ? (
          <label className="editor-file">
            <span className="sr-only">Nazwa pliku</span>
            <span className="muted">{course}/</span>
            <input value={file} onChange={(e) => setFile(e.target.value.trim())} spellCheck={false} disabled={!isUnit} />
          </label>
        ) : (
          <p className="editor-file"><span className="muted">{course}/</span>{file}</p>
        )}
        <span className={`editor-state${dirty ? ' is-dirty' : ''}`}>{isNew ? 'nowy plik' : dirty ? 'niezapisane zmiany' : 'zapisane'}</span>
      </div>

      {outline.length > 0 && (
        <nav className="outline" aria-label="Spis treści pliku">
          {outline.map((o) => (
            <button key={`${o.line}-${o.label}`} type="button" className={`outline-item lvl-${o.level}`} onClick={() => jump(o.line)}>
              {o.label}
              {o.count !== undefined && <span className="muted"> {o.count}</span>}
            </button>
          ))}
        </nav>
      )}

      <textarea
        ref={area}
        className="code"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={`Treść pliku ${file}`}
      />

      {message && <p className="admin-ok" role="status">{message}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {validation && !validation.ok && validation.errors.length > 0 && (
        <div className="admin-errors" role="alert">
          <strong>Błędy walidacji</strong>
          <pre>{validation.errors.join('\n\n')}</pre>
        </div>
      )}
      {validation?.ok && validation.stats && (
        <p className="admin-stats">
          Kurs po zmianie: {validation.stats.units} rozdz., {validation.stats.lessons} lekcji, {validation.stats.words} słów,{' '}
          {validation.stats.sentences} zdań, {validation.stats.grammar} tematów teorii, {validation.stats.stories} historyjek.
          {validation.warnings.length > 0 && <span className="muted"> Uwagi: {validation.warnings.join('; ')}</span>}
        </p>
      )}

      <div className="editor-actions">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!!busy || (!dirty && !isNew)}>
          <Icon name="check" size={18} /> {busy === 'save' ? 'Zapisuję i przebudowuję…' : 'Zapisz'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void check()} disabled={!!busy}>
          {busy === 'check' ? 'Sprawdzam…' : 'Sprawdź'}
        </button>
        {undo !== null && (
          <button type="button" className="btn btn-ghost" onClick={() => { setText(undo); setUndo(null); setValidation(null); }}>
            Cofnij propozycję AI
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => download(file.split('/').pop() ?? 'plik.yaml', text, 'text/yaml')}>
          <Icon name="download" size={18} /> Pobierz
        </button>
        {isUnit && !isNew && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
            <Icon name="trash" size={18} /> Usuń rozdział
          </button>
        )}
      </div>

      <section className="ai-box">
        <h3>Popraw z pomocą AI</h3>
        <p className="muted small">
          Model dostaje ten plik, wcześniejsze rozdziały i zasady kursu. Wynik trafia do edytora — nic nie zapisuje się samo.
        </p>
        <textarea
          className="ai-instruction"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Np. dodaj 5 zdań z czasownikiem avere, podziel teorię o rodzajnikach na krótsze kroki, uprość historyjkę"
        />
        <div className="editor-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void revise(false)} disabled={!!busy || !instruction.trim()}>
            <Icon name="sparkle" size={18} /> {busy === 'ai' ? 'Model pracuje… (do kilku minut)' : 'Wykonaj polecenie'}
          </button>
          {validation && !validation.ok && (
            <button type="button" className="btn btn-ghost" onClick={() => void revise(true)} disabled={!!busy}>
              Napraw błędy walidacji z AI
            </button>
          )}
        </div>
      </section>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Usunąć rozdział?">
        <p>
          Plik <strong>{initialFile}</strong> trafi do kosza na serwerze, a kurs zostanie przebudowany. Postępy uczniów w tym
          rozdziale przestaną być widoczne.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Zostaw</button>
          <button type="button" className="btn btn-bad" onClick={() => { setConfirmDelete(false); void remove(); }}>Usuń rozdział</button>
        </div>
      </Modal>
    </div>
  );
}

interface OutlineItem {
  line: number;
  label: string;
  level: 0 | 1;
  count?: number;
}

const SECTION_LABEL: Record<string, string> = {
  vocab: 'Słówka',
  sentences: 'Zdania',
  grammar: 'Teoria',
  conjugations: 'Odmiany',
  stories: 'Historyjki',
  goals: 'Cele',
  rules: 'Reguły',
  target: 'Język kursu',
  native: 'Język ucznia',
};

/** Spis treści pliku YAML: sekcje najwyższego poziomu i tematy teorii/historyjek. */
function buildOutline(text: string): OutlineItem[] {
  const lines = text.split('\n');
  const out: OutlineItem[] = [];
  let current: OutlineItem | null = null;
  let section = '';
  lines.forEach((l, i) => {
    const top = /^([a-z_]+):/.exec(l);
    if (top) {
      section = top[1];
      current = SECTION_LABEL[section] ? { line: i, label: SECTION_LABEL[section], level: 0, count: 0 } : null;
      if (current) out.push(current);
      return;
    }
    if (current && /^ {2}- /.test(l)) current.count = (current.count ?? 0) + 1;
    if ((section === 'grammar' || section === 'stories') && /^ {2}- id:/.test(l)) {
      const title = lines.slice(i, i + 3).map((x) => /^\s+title:\s*"?(.+?)"?\s*$/.exec(x)?.[1]).find(Boolean);
      out.push({ line: i, label: title ?? l.split(':')[1].trim(), level: 1 });
    }
    if (section === 'grammar' && /^\s+### /.test(l)) out.push({ line: i, label: `krok: ${l.trim().slice(4)}`, level: 1 });
  });
  for (const o of out) if (o.count === 0) delete o.count;
  return out;
}

function unitTemplate(nn: string): string {
  return `id: u${nn}
title: Tytuł w języku kursu
subtitle: O czym jest ten rozdział
cefr: A1
icon: "📘"
goals:
  - Co uczeń będzie umiał po tym rozdziale
  - Drugi cel

# Słówka: t = w języku kursu, n = po polsku. Rzeczowniki: g (m/f), art (rodzajnik), pl (liczba mnoga).
vocab:
  - {t: parola, n: słowo, pos: noun, g: f, art: la, pl: parole, emoji: "💬"}
  - {t: esempio, n: przykład, pos: noun, g: m, art: "l'", pl: esempi}
  - {t: nuovo, n: nowy, pos: adj, forms: [nuova, nuovi, nuove]}
  - {t: imparare, n: uczyć się, pos: verb, forms: [imparo, impari, impara]}

# Zdania tylko ze słów tego i wcześniejszych rozdziałów. gap = słowo do wycięcia w ćwiczeniu z luką.
sentences:
  - {t: "Imparo una parola nuova.", n: "Uczę się nowego słowa.", gap: Imparo}
  - {t: "La parola è nuova.", n: "Słowo jest nowe.", gap: nuova}
  - {t: "Impari un esempio?", n: "Uczysz się przykładu?", gap: Impari}
  - {t: "L'esempio è nuovo.", n: "Przykład jest nowy.", gap: nuovo}

# Teoria w krokach: każdy nagłówek ### to krok, po którym uczeń od razu ćwiczy wyróżnione *formy*.
grammar:
  - id: nowy-temat-${nn}
    title: Tytuł tematu
    summary: Jedno zdanie, o czym jest temat.
    body: |
      ### Pierwszy krok
      Krótkie wyjaśnienie po polsku. Formy do ćwiczenia pisz *kursywą*: *imparo*, *impari*.

      ### Drugi krok
      Kolejna rzecz, np. *nuovo* i *nuova*.
    examples:
      - {t: "Imparo una parola nuova.", n: "Uczę się nowego słowa."}
    check:
      - {q: "Jak powiesz „uczę się”?", options: [imparo, impari, impara], answer: 0}

conjugations: []
stories: []
`;
}
