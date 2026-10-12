import { useDeferredValue, useMemo, useState } from 'react';
import { useApp } from '../data/store.ts';
import { strength } from '../engine/srs.ts';
import { normalize, stripAccents } from '../engine/text.ts';
import type { VocabItem } from '../data/types.ts';
import { Say, SpeakButton } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';

type Filter = 'all' | 'known' | 'weak' | 'new';

const POS_LABEL: Record<string, string> = {
  noun: 'rzeczownik', verb: 'czasownik', adj: 'przymiotnik', adv: 'przysłówek', pron: 'zaimek', prep: 'przyimek',
  conj: 'spójnik', num: 'liczebnik', interj: 'wykrzyknik', phrase: 'zwrot', det: 'określnik',
};

export function Vocabulary() {
  const course = useApp((s) => s.course)!;
  const srs = useApp((s) => s.srs);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [unit, setUnit] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useDeferredValue(query);
  const now = Date.now();

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
      <h1 className="page-title">Słownik</h1>
      <p className="page-lead">
        Znasz <strong>{known}</strong> z {all.length} słówek kursu.
      </p>
      <div className="vocab-tools">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj po polsku lub w języku kursu"
            aria-label="Szukaj słówka"
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
        </div>
      </div>

      <ul className="vocab-list">
        {list.slice(0, 400).map((v) => (
          <VocabRow key={v.id} v={v} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} />
        ))}
      </ul>
      {list.length === 0 && <p className="muted center">Nic nie pasuje do wyszukiwania.</p>}
    </div>
  );
}

function VocabRow({ v, open, onToggle }: { v: VocabItem; open: boolean; onToggle: () => void }) {
  const course = useApp((s) => s.course)!;
  const s = useApp((st) => st.srs.get(v.id));
  const level = s ? Math.round(strength(s, Date.now()) * 5) : 0;
  const full = course.withArticle(v);
  return (
    <li className={`vocab-row${open ? ' is-open' : ''}`}>
      <div className="vocab-main">
        <SpeakButton text={full} size="sm" />
        <button type="button" className="vocab-text" onClick={onToggle} aria-expanded={open}>
          <span className="vocab-t" lang={course.pack.target.code}>
            {v.emoji && <span aria-hidden>{v.emoji} </span>}
            {full}
          </span>
          <span className="vocab-n">{v.n}</span>
        </button>
        <span className="meter" aria-label={s ? `Opanowanie ${level} na 5` : 'Jeszcze nie poznane'}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i < level ? 'on' : ''} />
          ))}
        </span>
      </div>
      {open && (
        <div className="vocab-more">
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
            {' · '}jednostka {(course.unitById.get(v.unit)?.index ?? 0) + 1}
          </p>
          {v.altN && <p className="small">Także: {v.altN.join(', ')}</p>}
          {v.note && <p className="small">{v.note}</p>}
          {v.ex && (
            <p className="small">
              <Say text={v.ex.t}>{v.ex.t}</Say> — {v.ex.n}
            </p>
          )}
          {s && (
            <p className="muted small">
              Powtórzone {s.reps}× · następna powtórka {s.due <= Date.now() ? 'teraz' : new Date(s.due).toLocaleDateString('pl-PL')}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
