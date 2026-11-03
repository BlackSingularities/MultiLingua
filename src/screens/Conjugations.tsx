import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { unlockedUnits } from '../data/progress.ts';
import { ConjTable } from '../exercises/special.tsx';
import { Icon } from '../components/Icon.tsx';
import { Empty, Spinner } from '../components/ui.tsx';
import { VerbCompendium, useVerbPack } from './Verbs.tsx';

export function Conjugations() {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const { pack, loading, error } = useVerbPack();
  const open = unlockedUnits(course, progress);
  const units = course.units.filter((u) => u.conjugations.length > 0);
  const inCompendium = new Map((course.pack.verbIndex ?? []).map((v) => [v.verb, v.id]));

  if (!units.length && !course.pack.verbIndex?.length) return <Empty icon="📋" title="Ten kurs nie ma jeszcze tabel odmiany" />;

  return (
    <div className="conjugations">
      <h1 className="page-title">Odmiana czasowników</h1>
      <p className="page-lead">
        Pełne odmiany we wszystkich trybach i czasach oraz tabele z rozdziałów kursu. Dotknij formy, żeby ją usłyszeć.
      </p>

      {course.pack.verbIndex?.length ? (
        pack ? <VerbCompendium pack={pack} /> : loading ? <Spinner label="Wczytuję kompendium…" /> : error && <p className="error-text">{error}</p>
      ) : null}

      {units.length > 0 && (
        <>
          <div className="conj-units-head">
            <h2 className="section-title">Tabele z rozdziałów</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/trening/odmiana')}>
              <Icon name="dumbbell" size={18} /> Trenuj wszystkie odblokowane
            </button>
          </div>
          {units.map((u) => {
            const unlocked = open.has(u.id);
            return (
              <section key={u.id} className={`conj-unit${unlocked ? '' : ' is-locked'}`}>
                <h3 className="conj-unit-title">
                  <span aria-hidden>{u.icon}</span> {u.title}
                  {!unlocked && <Icon name="lock" size={16} />}
                </h3>
                <div className="conj-grid">
                  {u.conjugations.map((t) => {
                    const full = inCompendium.get(t.verb);
                    return (
                      <div key={t.id} className="conj-card">
                        <ConjTable table={t} persons={course.rules.persons} lang={course.pack.target.code} />
                        <div className="conj-card-actions">
                          {unlocked && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/trening/odmiana/${t.id}`)}>
                              Ćwicz „{t.verb}”
                            </button>
                          )}
                          {full && (
                            <Link to={`/odmiana/${full}`} className="btn btn-ghost btn-sm">
                              Pełna odmiana <Icon name="next" size={16} />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
