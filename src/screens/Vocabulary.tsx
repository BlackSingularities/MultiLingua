import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useApp } from '../data/store.ts';
import { strength } from '../engine/srs.ts';
import { normalize, stripAccents } from '../engine/text.ts';
import type { VocabItem } from '../data/types.ts';
import { Modal, Say, SpeakButton } from '../components/ui.tsx';
import { WordArt } from '../components/WordArt.tsx';
import { Icon } from '../components/Icon.tsx';

type Filter = 'all' | 'known' | 'weak' | 'new';
type View = 'plates' | 'list';

const POS_LABEL: Record<string, string> = {
  noun: 'rzeczownik', verb: 'czasownik', adj: 'przymiotnik', adv: 'przysłówek', pron: 'zaimek', prep: 'przyimek',
  conj: 'spójnik', num: 'liczebnik', interj: 'wykrzyknik', phrase: 'zwrot', det: 'określnik',
};

const VIEW_KEY = 'multilingua:vocab-view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'plates';
  } catch {
    return 'plates';
  }
}

export function Vocabulary() {
  const course = useApp((s) => s.course)!;
  const srs = useApp((s) => s.srs);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [unit, setUnit] = useState('');
  const [view, setView] = useState<View>(readView);
  const [open, setOpen] = useState<VocabItem | null>(null);
  const q = useDeferredValue(query);
  const now = Date.now();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* tryb prywatny — trudno */
    }
  }, [view]);

  const all = useMemo(() => [...course.vocab.values()], [course]);
  const known = all.filter((v) => srs.has(v.id)).length;

  const list = useMemo(() => {
    const nq = stripAccents(normalize(q));
    return all.filter((v) => {
      if (unit && v.unit !== unit) return false;
      const s = srs.get(v.id);
      if (filter === 'known' && !s) return false;
      if (filter === 'new' && s) return false;
      if (filter === 'weak' && (!s || strength(s, now) >= 0.5)) return false;
      if (!nq) return true;
      const hay = stripAccents(normalize([v.t, v.n, ...(v.altN ?? []), ...(v.altT ?? []), v.plural ?? ''].join(' ')));
      return hay.includes(nq);
    });
    // `now` celowo poza zależnościami — wystarczy przeliczenie przy zmianie filtrów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, filter, unit, srs]);

  return (
    <div className="vocab">
      <header className="page-head">
        <h1 className="page-title">Słownik</h1>
        <p className="page-lead">
          Znasz <strong>{known}</strong> z {all.length} słów kursu. Dotknij słowa, żeby je usłyszeć i zobaczyć szczegóły.
        </p>
      </header>
      <div className="vocab-tools">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj po polsku lub w języku kursu"
            aria-label="Szukaj słowa"
          />
        </label>
        <div className="filter-row">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Jednostka">
            <option value="">Wszystkie jednostki</option>
            {course.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.index + 1}. {u.title}
              </option>
            ))}
          </select>
          <div className="seg" role="radiogroup" aria-label="Filtr">
            {(
              [
                ['all', 'Wszystkie'],
                ['known', 'Poznane'],
                ['weak', 'Do powtórki'],
                ['new', 'Nowe'],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className={`seg-btn${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg view-switch" role="radiogroup" aria-label="Widok">
            <button type="button" role="radio" aria-checked={view === 'plates'} className={`seg-btn${view === 'plates' ? ' on' : ''}`} onClick={() => setView('plates')} title="Tablice">
              <Icon name="grid" size={18} />
              <span className="sr-only">Tablice</span>
            </button>
            <button type="button" role="radio" aria-checked={view === 'list'} className={`seg-btn${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')} title="Lista">
              <Icon name="list" size={18} />
              <span className="sr-only">Lista</span>
            </button>
          </div>
        </div>
      </div>

      <p className="vocab-count muted small" aria-live="polite">
        {list.length === all.length ? `${all.length} słów` : `${list.length} z ${all.length} słów`}
      </p>

      {view === 'plates' ? (
        <ul className="plate-grid">
          {list.slice(0, 400).map((v) => (
            <PlateCard key={v.id} v={v} onOpen={() => setOpen(v)} />
          ))}
        </ul>
      ) : (
        <ul className="vocab-list">
          {list.slice(0, 400).map((v) => (
            <VocabRow key={v.id} v={v} onOpen={() => setOpen(v)} />
          ))}
        </ul>
      )}
      {list.length === 0 && <p className="muted center">Nic nie pasuje do wyszukiwania. Zmień filtr albo wpisz inne słowo.</p>}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? course.withArticle(open) : ''} className="word-sheet" hideTitle>
        {open && <WordDetail v={open} />}
      </Modal>
    </div>
  );
}

function useLevel(v: VocabItem): { level: number; known: boolean } {
  const s = useApp((st) => st.srs.get(v.id));
  return { level: s ? Math.round(strength(s, Date.now()) * 5) : 0, known: !!s };
}

function Meter({ level, known }: { level: number; known: boolean }) {
  return (
    <span className="meter" role="img" aria-label={known ? `Opanowanie ${level} na 5` : 'Jeszcze nie poznane'}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}

function PlateCard({ v, onOpen }: { v: VocabItem; onOpen: () => void }) {
  const course = useApp((s) => s.course)!;
  const { level, known } = useLevel(v);
  const full = course.withArticle(v);
  return (
    <li className={`plate-card${known ? '' : ' is-new'}`}>
      <button type="button" className="plate-card-btn" onClick={onOpen}>
        <WordArt source={v} size="md" />
        <span className="plate-card-t" lang={course.pack.target.code}>{full}</span>
        <span className="plate-card-n">{v.n}</span>
      </button>
      <span className="plate-card-foot">
        <Meter level={level} known={known} />
        <SpeakButton text={full} size="sm" />
      </span>
    </li>
  );
}

function VocabRow({ v, onOpen }: { v: VocabItem; onOpen: () => void }) {
  const course = useApp((s) => s.course)!;
  const { level, known } = useLevel(v);
  const full = course.withArticle(v);
  return (
    <li className="vocab-row">
      <WordArt source={v} size="xs" />
      <button type="button" className="vocab-text" onClick={onOpen}>
        <span className="vocab-t" lang={course.pack.target.code}>{full}</span>
        <span className="vocab-n">{v.n}</span>
      </button>
      <Meter level={level} known={known} />
      <SpeakButton text={full} size="sm" />
    </li>
  );
}

function WordDetail({ v }: { v: VocabItem }) {
  const course = useApp((s) => s.course)!;
  const s = useApp((st) => st.srs.get(v.id));
  const { level, known } = useLevel(v);
  const full = course.withArticle(v);
  const unit = course.unitById.get(v.unit);
  return (
    <div className="word-detail">
      <WordArt source={v} size="lg" />
      <div className="word-detail-head">
        <Say text={full} className="word-detail-t">{full}</Say>
        <SpeakButton text={full} autoPlay />
        <SpeakButton text={full} slow size="sm" />
      </div>
      <p className="word-detail-n">{v.n}{v.altN && <span className="muted">, także: {v.altN.join(', ')}</span>}</p>
      <p className="muted small">
        {POS_LABEL[v.pos]}
        {v.gender === 'm' && ', rodzaj męski'}
        {v.gender === 'f' && ', rodzaj żeński'}
        {v.gender === 'n' && ', rodzaj nijaki'}
        {v.plural && (
          <>
            , l. mn. <Say text={v.plural}>{v.plural}</Say>
          </>
        )}
        {unit && `, jednostka ${unit.index + 1}: ${unit.title}`}
      </p>
      {v.note && <p className="intro-note">{v.note}</p>}
      {v.ex && (
        <div className="word-detail-ex">
          <Say text={v.ex.t}>{v.ex.t}</Say>
          <p className="muted">{v.ex.n}</p>
        </div>
      )}
      <p className="word-detail-srs">
        <Meter level={level} known={known} />
        <span className="muted small">
          {s
            ? `Powtórzone ${s.reps}×. Następna powtórka ${s.due <= Date.now() ? 'teraz' : new Date(s.due).toLocaleDateString('pl-PL')}.`
            : 'Poznasz to słowo w lekcji na ścieżce.'}
        </span>
      </p>
    </div>
  );
}
