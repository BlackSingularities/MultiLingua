import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../data/api.ts';
import { useApp } from '../data/store.ts';
import { Icon } from '../components/Icon.tsx';
import { Modal, Spinner } from '../components/ui.tsx';
import { adminApi, download, type CourseInfo, type ImageWord } from './api.ts';

type Filter = 'missing' | 'done' | 'all';

/** Podgląd SVG zawsze przez <img src="blob:"> — przeglądarka nie wykona w nim skryptów. */
function useBlobUrls(svgs: Record<string, string>) {
  const urls = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(svgs)) m.set(k, URL.createObjectURL(new Blob([v], { type: 'image/svg+xml' })));
    return m;
  }, [svgs]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function ImagesTab({ courses }: { courses: CourseInfo[] }) {
  const [course, setCourse] = useState(courses[0]?.id ?? '');
  const [words, setWords] = useState<ImageWord[] | null>(null);
  const [unused, setUnused] = useState<string[]>([]);
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('missing');
  const [unit, setUnit] = useState('');
  const [open, setOpen] = useState<ImageWord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useBlobUrls(svgs);
  const openCourse = useApp((s) => s.openCourse);
  const activeCourse = useApp((s) => s.settings.activeCourse);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminApi.get<{ words: ImageWord[]; unused: string[] }>(`/images?course=${course}`);
      setWords(r.words);
      setUnused(r.unused);
      const res = await fetch(`${API_BASE}/courses/${course}/images`, { cache: 'no-store' });
      setSvgs(res.ok ? ((await res.json()) as { images: Record<string, string> }).images : {});
    } catch (e) {
      setError((e as Error).message);
    }
  }, [course]);
  useEffect(() => {
    setWords(null);
    void load();
  }, [load]);

  const changed = async () => {
    await load();
    if (activeCourse === course) void openCourse(course).catch(() => {});
  };

  if (error) return <p className="error-text">{error}</p>;
  if (!words) return <Spinner label="Wczytuję słówka…" />;

  // To samo słowo (ten sam klucz) może występować kilka razy — liczymy unikalne ilustracje.
  const keys = new Map(words.map((w) => [w.key, w]));
  const done = [...keys.values()].filter((w) => w.has).length;
  const units = [...new Map(words.map((w) => [w.unit, w.unitTitle])).entries()];
  const shown = words.filter((w) => (!unit || w.unit === unit) && (filter === 'all' || (filter === 'done' ? w.has : !w.has)));

  const exportMissing = () => {
    const rows = [...keys.values()].filter((w) => !w.has);
    const md = [
      `# Brakujące ilustracje — kurs ${course}`,
      '',
      'Każdy plik: content/courses/' + course + '/images/<plik>.svg (zasady: content/IMAGES.md).',
      '',
      '| plik | słowo | znaczenie | część mowy | emoji | rozdział |',
      '|---|---|---|---|---|---|',
      ...rows.map((w) => `| ${w.key}.svg | ${w.t} | ${w.n} | ${w.pos} | ${w.emoji ?? ''} | ${w.unitTitle} |`),
    ].join('\n');
    download(`brakujace-ilustracje-${course}.md`, `${md}\n`, 'text/markdown');
  };

  return (
    <div className="images-tab">
      <div className="images-head">
        <div>
          <h2>Ilustracje słówek</h2>
          <p className="muted">
            Ilustracje ma <strong>{done}</strong> z {keys.size} słów. Bez ilustracji aplikacja pokazuje emoji ze słownika
            albo inicjał słowa na tablicy.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={exportMissing}>
          <Icon name="download" size={18} /> Lista brakujących
        </button>
      </div>
      <div className="filter-row">
        {courses.length > 1 && (
          <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Kurs">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Rozdział">
          <option value="">Wszystkie rozdziały</option>
          {units.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
        <div className="seg" role="radiogroup" aria-label="Filtr">
          {([['missing', 'Bez ilustracji'], ['done', 'Z ilustracją'], ['all', 'Wszystkie']] as [Filter, string][]).map(([f, l]) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={`seg-btn${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{l}</button>
          ))}
        </div>
      </div>
      {unused.length > 0 && <p className="admin-note">Pliki bez przypisanego słowa: {unused.map((u) => `${u}.svg`).join(', ')}</p>}

      <ul className="img-grid">
        {shown.map((w) => (
          <li key={w.id}>
            <button type="button" className="img-card" onClick={() => setOpen(w)}>
              <span className={`plate plate-md${urls.get(w.key) ? ' plate-img' : w.emoji ? ' plate-emoji-kind' : ''}`} aria-hidden>
                {urls.get(w.key) ? <img src={urls.get(w.key)} alt="" /> : w.emoji ? <span className="plate-emoji">{w.emoji}</span> : <span className="plate-letter">{w.t.charAt(0)}</span>}
              </span>
              <span className="img-t">{w.t}</span>
              <span className="img-n">{w.n}</span>
              <span className={`img-state${w.has ? ' ok' : ''}`}>{w.has ? `${w.key}.svg` : 'brak'}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted center">Nic tu nie ma — zmień filtr.</p>}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Ilustracja: ${open.t}` : ''}>
        {open && <ImageEditor course={course} word={open} current={svgs[open.key]} onChanged={() => { void changed(); setOpen(null); }} />}
      </Modal>
    </div>
  );
}

function ImageEditor({ course, word, current, onChanged }: { course: string; word: ImageWord; current?: string; onChanged: () => void }) {
  const [svg, setSvg] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useBlobUrls(useMemo((): Record<string, string> => (svg.trim().startsWith('<') ? { p: svg } : {}), [svg])).get('p');

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 64 * 1024) return setError('Plik jest większy niż 64 KiB — uprość grafikę.');
    setSvg(await f.text());
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="img-editor">
      <p className="muted">
        {word.n} · plik <span className="mono">images/{word.key}.svg</span>
      </p>
      <div className="img-editor-preview">
        <span className="plate plate-lg plate-img" aria-hidden>{preview ? <img src={preview} alt="" /> : <span className="plate-letter">?</span>}</span>
        <span className="plate plate-sm plate-img" aria-hidden>{preview ? <img src={preview} alt="" /> : null}</span>
      </div>
      <label className="btn btn-ghost btn-wide">
        <Icon name="upload" size={18} /> Wybierz plik SVG
        <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      <textarea className="code code-sm" rows={5} value={svg} onChange={(e) => setSvg(e.target.value)} placeholder='…albo wklej kod: <svg viewBox="0 0 160 160" …>' spellCheck={false} aria-label="Kod SVG" />
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="modal-actions">
        {current && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(() => adminApi.del('/image', { course, key: word.key }))}>
            Usuń ilustrację
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !svg.trim() || svg === current} onClick={() => void act(() => adminApi.put('/image', { course, key: word.key, svg }))}>
          {busy ? 'Zapisuję…' : 'Zapisz ilustrację'}
        </button>
      </div>
    </div>
  );
}
