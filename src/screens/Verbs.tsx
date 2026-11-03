// Kompendium czasowników: pełna odmiana we wszystkich trybach i czasach, z tłumaczeniem
// każdej formy, przykładem i odsłuchem — plus kolokacje, idiomy i słowa pokrewne.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { loadVerbs } from '../data/api.ts';
import { unlockedUnits } from '../data/progress.ts';
import type { VerbEntry, VerbExtra, VerbForm, VerbLayout, VerbMoodLayout, VerbPack, VerbTenseLayout } from '../data/types.ts';
import { Icon } from '../components/Icon.tsx';
import { Empty, Say, SpeakButton, Spinner } from '../components/ui.tsx';

/** Paczka kompendium dla bieżącego kursu (z pamięci urządzenia albo z serwera). */
export function useVerbPack(): { pack: VerbPack | null; loading: boolean; error: string | null } {
  const course = useApp((s) => s.course);
  const [state, setState] = useState<{ pack: VerbPack | null; loading: boolean; error: string | null }>({ pack: null, loading: true, error: null });
  useEffect(() => {
    if (!course) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadVerbs(course.pack).then(
      (pack) => alive && setState({ pack, loading: false, error: null }),
      (e: Error) => alive && setState({ pack: null, loading: false, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [course]);
  return state;
}

/** Tekst do odsłuchu: pierwszy wariant rodzaju („sono andato/andata” → „sono andato”). */
export function speakable(form: string): string {
  return form.split('/')[0].trim();
}

const PERSON_SLOT: Record<string, number> = { io: 0, tu: 1, 'lui/lei': 2, noi: 3, voi: 4, loro: 5, lei: 6, presente: 7, passato: 8 };

function personSlot(label: string): number {
  const key = label.replace(/^che\s+/i, '');
  return PERSON_SLOT[key] ?? PERSON_SLOT[key.toLowerCase()] ?? 5;
}

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

// ——— lista ———

export function VerbCompendium({ pack }: { pack: VerbPack }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'irregular' | 'regular'>('all');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const shown = pack.verbs.filter((v) => {
    if (filter === 'irregular' && v.regular) return false;
    if (filter === 'regular' && !v.regular) return false;
    if (!q.trim()) return true;
    const needle = norm(q.trim());
    return norm(`${v.verb} ${v.n} ${v.category}`).includes(needle)
      || Object.values(v.forms).some((m) => Object.values(m).some((rows) => rows.some((r) => norm(r.f).includes(needle))));
  });
  return (
    <section className="verb-compendium" aria-labelledby="kompendium">
      <div className="verb-compendium-head">
        <h2 className="section-title" id="kompendium">Kompendium czasowników</h2>
        <p className="muted">
          {pack.verbs.length} {plural(pack.verbs.length, 'czasownik', 'czasowniki', 'czasowników')} odmienionych we wszystkich trybach —
          każda forma z tłumaczeniem, przykładem i nagraniem.
        </p>
      </div>
      <div className="verb-tools">
        <label className="verb-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj: andare, iść, vado…"
            aria-label="Szukaj czasownika lub formy"
          />
        </label>
        <div className="seg" role="group" aria-label="Rodzaj czasowników">
          {([['all', 'Wszystkie'], ['irregular', 'Nieregularne'], ['regular', 'Regularne']] as const).map(([id, label]) => (
            <button key={id} type="button" className={`seg-btn${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted">Nic nie pasuje do „{q}”.</p>
      ) : (
        <ul className="verb-grid">
          {shown.map((v) => (
            <li key={v.id}>
              <Link to={`/odmiana/${v.id}`} className="verb-card">
                <span className="verb-card-emoji" aria-hidden>{v.emoji}</span>
                <span className="verb-card-body">
                  <span className="verb-card-verb" lang={pack.course.split('-')[1]}>{v.verb}</span>
                  <span className="verb-card-n">{v.n}</span>
                  <span className="verb-card-tags">
                    <span className={`tag ${v.regular ? 'tag-ok' : 'tag-warn'}`}>{v.regular ? 'regularny' : 'nieregularny'}</span>
                    <span className="tag">+ {v.auxiliary}</span>
                  </span>
                </span>
                <Icon name="next" size={18} className="verb-card-go" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ——— szczegóły ———

type View = 'full' | 'compact';

export function VerbScreen() {
  const { verbId } = useParams();
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const { pack, loading, error } = useVerbPack();
  const verb = pack?.verbs.find((v) => v.id === verbId);
  const [mood, setMood] = useState<string>('');
  const [view, setView] = useState<View>('full');
  const [examples, setExamples] = useState(true);
  const [openAll, setOpenAll] = useState<{ v: boolean; n: number }>({ v: false, n: 0 });
  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pack && !mood) setMood(pack.layout.moods[0]?.id ?? '');
  }, [pack, mood]);
  useEffect(() => {
    tabRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [mood]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [verbId]);

  // Tabela z rozdziału kursu — żeby można było od razu poćwiczyć odmianę.
  const practice = useMemo(() => {
    if (!verb) return null;
    const open = unlockedUnits(course, progress);
    const table = [...course.tables.values()].find((t) => t.verb === verb.verb && open.has(t.unit));
    return table ?? null;
  }, [course, progress, verb]);

  if (loading && !pack) return <Spinner label="Wczytuję kompendium…" />;
  if (error && !pack) return <Empty icon="📡" title="Nie udało się pobrać kompendium">{error}</Empty>;
  if (!pack || !verb) {
    return (
      <Empty icon="📋" title="Nie ma takiego czasownika" action={<Link to="/odmiana" className="btn btn-primary">Wróć do listy</Link>} />
    );
  }

  const layout = pack.layout;
  const activeMood = layout.moods.find((m) => m.id === mood) ?? layout.moods[0];
  const lang = course.pack.target.code;
  const unit = verb.unit ? course.unitById.get(verb.unit) : undefined;
  const idx = pack.verbs.indexOf(verb);
  const prev = pack.verbs[idx - 1];
  const next = pack.verbs[idx + 1];

  return (
    <article className="verb-page">
      <Link to="/odmiana" className="link-btn">
        <Icon name="back" size={16} /> Odmiana
      </Link>

      <header className="verb-hero">
        <span className="verb-hero-emoji" aria-hidden>{verb.emoji}</span>
        <div className="verb-hero-main">
          <p className="theory-kicker">{verb.category}</p>
          <h1 className="verb-hero-title" lang={lang}>
            <Say text={verb.verb}>{verb.verb}</Say>
            <SpeakButton text={verb.verb} size="sm" />
          </h1>
          <p className="verb-hero-n">{verb.n}</p>
          {(verb.ipa || verb.stress) && (
            <p className="verb-hero-ipa">
              {verb.ipa && <span className="ipa">{verb.ipa}</span>}
              {verb.stress && <span className="muted"> · akcent: {verb.stress}</span>}
            </p>
          )}
        </div>
      </header>

      <dl className="verb-facts">
        <div><dt>Typ</dt><dd>{verb.regular ? 'regularny' : 'nieregularny'}</dd></div>
        <div><dt>Grupa</dt><dd>{verb.group}</dd></div>
        <div><dt>Czasownik posiłkowy</dt><dd lang={lang}>{verb.auxiliary}</dd></div>
        <div><dt>Przechodniość</dt><dd>{verb.transitive}</dd></div>
        {verb.reflexive && <div><dt>Forma zwrotna / pokrewna</dt><dd lang={lang}>{verb.reflexive}</dd></div>}
        {unit && <div><dt>W kursie</dt><dd>{unit.icon} {unit.title}</dd></div>}
      </dl>
      {verb.note && <p className="verb-note">{verb.note}</p>}

      <section className="verb-conj" aria-labelledby="odmiana-h">
        <div className="verb-conj-head">
          <h2 className="section-title" id="odmiana-h">Odmiana</h2>
          <div className="verb-conj-tools">
            <div className="seg" role="group" aria-label="Widok">
              <button type="button" className={`seg-btn${view === 'full' ? ' on' : ''}`} aria-pressed={view === 'full'} onClick={() => setView('full')}>Szczegółowo</button>
              <button type="button" className={`seg-btn${view === 'compact' ? ' on' : ''}`} aria-pressed={view === 'compact'} onClick={() => setView('compact')}>Ściąga</button>
            </div>
            {view === 'full' && (
              <>
                <label className="switch-inline">
                  <input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} />
                  <span>Przykłady</span>
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenAll((o) => ({ v: !o.v, n: o.n + 1 }))}>
                  {openAll.v ? 'Zwiń wszystkie' : 'Rozwiń wszystkie'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mood-tabs" role="tablist" aria-label="Tryby">
          {layout.moods.map((m) => (
            <button
              key={m.id}
              ref={m.id === activeMood.id ? tabRef : undefined}
              type="button"
              role="tab"
              aria-selected={m.id === activeMood.id}
              className={`mood-tab${m.id === activeMood.id ? ' on' : ''}`}
              style={{ '--mood': m.color } as React.CSSProperties}
              onClick={() => setMood(m.id)}
            >
              <span className="mood-tab-it" lang={lang}>{m.label}</span>
              <span className="mood-tab-pl">{m.pl}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" key={`${activeMood.id}-${view}`} className="mood-panel" style={{ '--mood': activeMood.color } as React.CSSProperties}>
          {view === 'full' ? (
            activeMood.tenses.map((t, i) => (
              <TenseCard
                key={`${t.id}-${openAll.n}`}
                tense={t}
                rows={verb.forms[activeMood.id][t.id]}
                layout={layout}
                lang={lang}
                examples={examples}
                initiallyOpen={openAll.n > 0 ? openAll.v : i === 0}
              />
            ))
          ) : (
            <CompactMood mood={activeMood} verb={verb} layout={layout} lang={lang} />
          )}
        </div>
      </section>

      {verb.extras.map((sec) => (
        <section key={sec.id} className="verb-extras" aria-labelledby={`ex-${sec.id}`}>
          <h2 className="section-title" id={`ex-${sec.id}`}>{sec.title}</h2>
          {sec.groups.map((g, gi) => (
            <div key={gi} className="verb-extra-group">
              {g.label && <h3 className="verb-extra-label">{g.label}</h3>}
              <ul className="verb-extra-list">
                {g.items.map((it, ii) => <ExtraCard key={ii} item={it} lang={lang} />)}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <div className="verb-foot">
        {practice && (
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/trening/odmiana/${practice.id}`)}>
            <Icon name="dumbbell" size={18} /> Ćwicz „{verb.verb}” ({practice.tenseLabel})
          </button>
        )}
        <nav className="verb-pager" aria-label="Sąsiednie czasowniki">
          {prev ? <Link to={`/odmiana/${prev.id}`} className="link-btn"><Icon name="back" size={16} /> {prev.verb}</Link> : <span />}
          {next ? <Link to={`/odmiana/${next.id}`} className="link-btn">{next.verb} <Icon name="next" size={16} /></Link> : <span />}
        </nav>
      </div>
    </article>
  );
}

function TenseCard({
  tense, rows, layout, lang, examples, initiallyOpen,
}: { tense: VerbTenseLayout; rows: VerbForm[]; layout: VerbLayout; lang: string; examples: boolean; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const half = rows.length === 6 ? 3 : Math.ceil(rows.length / 2);
  const cols = rows.length > 2 ? [rows.slice(0, half), rows.slice(half)] : [rows];
  return (
    <article className={`tense-card${open ? ' is-open' : ''}`}>
      <button type="button" className="tense-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tense-it" lang={lang}>{tense.label}</span>
        <span className="tense-pl">{tense.pl}</span>
        {!open && <span className="tense-peek" lang={lang}>{rows.slice(0, 3).map((r) => r.f).join(' · ')}…</span>}
        <Icon name="next" size={18} className="tense-chevron" />
      </button>
      {open && (
        <div className="tense-body">
          {tense.use && <p className="tense-use">{tense.use}</p>}
          <div className={`conj-cols${cols.length > 1 ? ' two' : ''}`}>
            {cols.map((col, ci) => (
              <ol key={ci} className="conj-rows">
                {col.map((r, ri) => {
                  const person = tense.persons[ci * half + ri];
                  return <FormRow key={ri} row={r} person={person} personPl={layout.personsPl[person]} lang={lang} examples={examples} />;
                })}
              </ol>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function FormRow({ row, person, personPl, lang, examples }: { row: VerbForm; person: string; personPl?: string; lang: string; examples: boolean }) {
  return (
    <li className={`form-row p${personSlot(person)}`}>
      <span className="person-badge">
        <span className="person-it" lang={lang}>{person.replace(/^che\s+/i, '')}</span>
        {personPl && <span className="person-pl">{personPl.replace(/^\(że\)\s*/, '')}</span>}
      </span>
      <div className="form-main">
        <div className="form-line">
          <Say text={speakable(row.f)} className="form-f">{row.f}</Say>
          <SpeakButton text={speakable(row.f)} size="sm" />
        </div>
        <p className="form-n">{row.n}</p>
        {examples && row.ex && (
          <div className="form-ex">
            <p className="ex-t" lang={lang}>
              <span className="ex-flag">{lang.toUpperCase()}</span>
              <Say text={row.ex.t}>{row.ex.t}</Say>
            </p>
            <p className="ex-n"><span className="ex-flag ex-flag-pl">PL</span>{row.ex.n}</p>
          </div>
        )}
      </div>
    </li>
  );
}

function CompactMood({ mood, verb, layout, lang }: { mood: VerbMoodLayout; verb: VerbEntry; layout: VerbLayout; lang: string }) {
  return (
    <div className="compact-grid">
      {mood.tenses.map((t) => (
        <figure key={t.id} className="compact-card">
          <figcaption>
            <span lang={lang}>{t.label}</span>
            <span className="muted">{t.pl}</span>
          </figcaption>
          <table className="conj-table">
            <tbody>
              {verb.forms[mood.id][t.id].map((r, i) => (
                <tr key={i}>
                  <th title={layout.personsPl[t.persons[i]]}>{t.persons[i]}</th>
                  <td lang={lang}><Say text={speakable(r.f)}>{r.f}</Say></td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      ))}
    </div>
  );
}

function ExtraCard({ item, lang }: { item: VerbExtra; lang: string }) {
  return (
    <li className="extra-card">
      <div className="form-line">
        <Say text={item.t} className="extra-t">{item.t}</Say>
        <SpeakButton text={item.t} size="sm" />
      </div>
      <p className="form-n">{item.n}</p>
      {item.note && <p className="extra-note"><Icon name="alert" size={14} /> {item.note}</p>}
      {item.ex && (
        <div className="form-ex">
          <p className="ex-t" lang={lang}>
            <span className="ex-flag">{lang.toUpperCase()}</span>
            <Say text={item.ex.t}>{item.ex.t}</Say>
          </p>
          <p className="ex-n"><span className="ex-flag ex-flag-pl">PL</span>{item.ex.n}</p>
        </div>
      )}
    </li>
  );
}
