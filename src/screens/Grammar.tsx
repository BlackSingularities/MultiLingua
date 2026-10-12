import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { isLessonDone, isLessonUnlocked } from '../data/progress.ts';
import { Icon } from '../components/Icon.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { Empty, Say, SpeakButton } from '../components/ui.tsx';
import { ConjTable } from '../exercises/special.tsx';

export function GrammarList() {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const [params] = useSearchParams();
  const focus = params.get('jednostka');
  const units = focus ? course.units.filter((u) => u.id === focus) : course.units;

  return (
    <div className="grammar">
      <h1 className="page-title">Teoria</h1>
      <p className="page-lead">
        Wszystkie zasady kursu w jednym miejscu — wyjaśnione po polsku, z przykładami do odsłuchania.
      </p>
      {focus && (
        <Link to="/teoria" className="link-btn">
          <Icon name="back" size={16} /> Pokaż wszystkie jednostki
        </Link>
      )}
      {units.map((u) => (
        <section key={u.id} className="grammar-unit">
          <h2 className="section-title">
            <span aria-hidden>{u.icon}</span> {u.title}
          </h2>
          <ul className="grammar-list">
            {u.grammar.map((g) => {
              const lesson = u.lessons.find((l) => l.grammar === g.id);
              const done = lesson && isLessonDone(course, progress, lesson.id);
              return (
                <li key={g.id}>
                  <Link to={`/teoria/${g.id}`} className="grammar-card">
                    <span className="grammar-title">{g.title}</span>
                    <span className="grammar-summary">{g.summary}</span>
                    {done && <span className="tag tag-ok">przerobione</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function GrammarArticleScreen() {
  const { id } = useParams();
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const article = id ? course.grammar.get(id) : undefined;
  const lesson = useMemo(() => course.path.find((l) => l.grammar === id), [course, id]);
  const tables = useMemo(() => {
    if (!lesson) return [];
    return lesson.conjugations.map((c) => course.tables.get(c)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [course, lesson]);

  if (!article) return <Empty icon="📕" title="Nie ma takiego tematu" />;
  const unit = course.unitById.get(article.unit);
  const canPractice = lesson && isLessonUnlocked(course, progress, lesson.id);

  return (
    <article className="article">
      <Link to="/teoria" className="link-btn">
        <Icon name="back" size={16} /> Teoria
      </Link>
      <p className="theory-kicker">{unit?.title}</p>
      <h1 className="theory-title">{article.title}</h1>
      <p className="theory-summary">{article.summary}</p>
      <Markdown source={article.body} />
      {tables.map((t) => (
        <ConjTable key={t.id} table={t} persons={course.rules.persons} lang={course.pack.target.code} />
      ))}
      {article.examples.length > 0 && (
        <section className="theory-examples">
          <h2>Przykłady</h2>
          <ul className="example-list">
            {article.examples.map((e, i) => (
              <li key={i}>
                <SpeakButton text={e.t} size="sm" />
                <div>
                  <Say text={e.t} className="example-t">{e.t}</Say>
                  <p className="muted">{e.n}{e.note ? ` — ${e.note}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {lesson && (
        <div className="article-cta">
          {canPractice ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/lekcja/${lesson.id}`)}>
              Przećwicz ten temat
            </button>
          ) : (
            <p className="muted">
              <Icon name="lock" size={16} /> Ćwiczenia do tego tematu odblokujesz na ścieżce nauki.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
