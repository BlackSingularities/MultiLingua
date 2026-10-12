import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { isLessonDone, isLessonUnlocked } from '../data/progress.ts';
import { Icon } from '../components/Icon.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { Empty, Say, SpeakButton, useSpeech } from '../components/ui.tsx';
import { splitArticle } from '../engine/theory.ts';
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

  const { say, ttsOk } = useSpeech();
  const steps = useMemo(() => (article ? splitArticle(article, (w) => course.isTarget(w)) : []), [article, course]);
  if (!article) return <Empty icon="📕" title="Nie ma takiego tematu" />;
  const unit = course.unitById.get(article.unit);
  const canPractice = lesson && isLessonUnlocked(course, progress, lesson.id);
  const lang = course.pack.target.code;
  const onSay = ttsOk === false ? undefined : (t: string) => void say(t);

  return (
    <article className="article">
      <Link to="/teoria" className="link-btn">
        <Icon name="back" size={16} /> Teoria
      </Link>
      <p className="theory-kicker">{unit?.title}</p>
      <h1 className="theory-title">{article.title}</h1>
      <p className="theory-summary">{article.summary}</p>
      {steps.length > 1 && (
        <nav className="article-toc" aria-label="Kroki tematu">
          {steps.map((st) => (
            <a key={st.index} href={`#krok-${st.index + 1}`} onClick={(e) => { e.preventDefault(); document.getElementById(`krok-${st.index + 1}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
              <span className="toc-num">{st.index + 1}</span> {st.title}
            </a>
          ))}
        </nav>
      )}
      {steps.map((st) => (
        <section key={st.index} id={`krok-${st.index + 1}`} className="article-step">
          {steps.length > 1 && <p className="step-label">Krok {st.index + 1} z {steps.length}</p>}
          {steps.length > 1 && <h2 className="step-title">{st.title}</h2>}
          <Markdown source={st.body} onSay={onSay} lang={lang} />
          {st.examples.length > 0 && (
            <ul className="example-list is-grid">
              {st.examples.map((e, i) => (
                <li key={i}>
                  <SpeakButton text={e.t} size="sm" />
                  <div>
                    <Say text={e.t} className="example-t">{e.t}</Say>
                    <p className="muted">{e.n}{e.note ? `${/[.!?…]$/.test(e.n) ? '' : '.'} ${e.note}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {st.focus.length > 0 && (
            <p className="step-focus">
              <span>Formy z tego kroku:</span>
              {st.focus.slice(0, 10).map((f) => (
                <button key={f} type="button" className="upcoming-chip" lang={lang} onClick={() => onSay?.(f)} disabled={!onSay}>{f}</button>
              ))}
            </p>
          )}
        </section>
      ))}
      {/* Tabele odmiany, których nie ma już w treści kroków. */}
      {tables
        .filter((t) => !article.body.includes(`**${t.forms[0].split('|')[0].trim()}**`))
        .map((t) => (
          <ConjTable key={t.id} table={t} persons={course.rules.persons} lang={lang} />
        ))}
      {lesson && (
        <div className="article-cta">
          {canPractice ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/lekcja/${lesson.id}?tryb=cwiczenia`)}>
                <Icon name="dumbbell" size={18} /> Przećwicz ten temat
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(`/lekcja/${lesson.id}`)}>
                Krok po kroku: teoria z ćwiczeniami
              </button>
            </>
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
