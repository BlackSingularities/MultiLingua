import { useNavigate } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { unlockedUnits } from '../data/progress.ts';
import { ConjTable } from '../exercises/special.tsx';
import { Icon } from '../components/Icon.tsx';
import { Empty } from '../components/ui.tsx';

export function Conjugations() {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const open = unlockedUnits(course, progress);
  const units = course.units.filter((u) => u.conjugations.length > 0);

  if (!units.length) return <Empty icon="📋" title="Ten kurs nie ma jeszcze tabel odmiany" />;

  return (
    <div className="conjugations">
      <h1 className="page-title">Odmiana czasowników</h1>
      <p className="page-lead">Tabele z odblokowanych jednostek. Dotknij formy, żeby ją usłyszeć.</p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/trening/odmiana')}>
        <Icon name="dumbbell" size={18} /> Trenuj wszystkie odblokowane
      </button>
      {units.map((u) => {
        const unlocked = open.has(u.id);
        return (
          <section key={u.id} className={`conj-unit${unlocked ? '' : ' is-locked'}`}>
            <h2 className="section-title">
              <span aria-hidden>{u.icon}</span> {u.title}
              {!unlocked && <Icon name="lock" size={16} />}
            </h2>
            <div className="conj-grid">
              {u.conjugations.map((t) => (
                <div key={t.id} className="conj-card">
                  <ConjTable table={t} persons={course.rules.persons} lang={course.pack.target.code} />
                  {unlocked && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/trening/odmiana/${t.id}`)}>
                      Ćwicz „{t.verb}”
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
