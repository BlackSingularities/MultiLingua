import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lesson, VocabItem } from '../data/types.ts';
import { useApp } from '../data/store.ts';
import { isLessonDone } from '../data/progress.ts';
import { splitArticle } from '../engine/theory.ts';
import { unitSteps } from '../engine/generator.ts';
import { Icon } from './Icon.tsx';
import { Modal } from './ui.tsx';
import { WordArt } from './WordArt.tsx';

const KIND_TITLE: Record<Lesson['kind'], string> = {
  learn: 'Lekcja słówek',
  grammar: 'Teoria z ćwiczeniami',
  story: 'Historyjka',
  speak: 'Mówienie i wymowa',
  test: 'Sprawdzian jednostki',
};

/** Plan lekcji przed startem: co w niej jest i w jakim trybie ją zrobić. */
export function LessonSheet({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
  return (
    <Modal open={!!lesson} onClose={onClose} title={lesson ? lesson.title : ''} className="lesson-sheet" hideTitle>
      {lesson && <LessonPlan lesson={lesson} />}
    </Modal>
  );
}

function LessonPlan({ lesson }: { lesson: Lesson }) {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const unit = course.unitById.get(lesson.unit);
  const done = isLessonDone(course, progress, lesson.id);
  const stars = progress.lessons[lesson.id]?.stars ?? 0;
  const words = lesson.vocab.map((id) => course.vocab.get(id)).filter((v): v is VocabItem => !!v);

  const article = lesson.grammar ? course.grammar.get(lesson.grammar) : undefined;
  const steps = useMemo(() => (article ? splitArticle(article, (w) => course.isTarget(w)) : []), [article, course]);
  // W lekcjach słówek: które fragmenty teorii pojawią się jako wskazówki.
  const tips = useMemo(() => {
    if (lesson.kind !== 'learn') return [];
    const forms = new Set(words.flatMap((v) => [v.t, ...(v.forms ?? []), v.plural ?? ''].map((x) => x.toLowerCase())));
    return unitSteps(course, lesson.unit).filter(({ step }) => step.focus.some((f) => forms.has(f))).slice(0, 2);
  }, [course, lesson, words]);

  const start = (practice?: boolean) => navigate(`/lekcja/${lesson.id}${practice ? '?tryb=cwiczenia' : ''}`);
  const isLearn = lesson.kind === 'learn';

  return (
    <div className="plan">
      <p className="plan-kind">{KIND_TITLE[lesson.kind]}{unit && `, ${unit.title}`}</p>
      <h2 className="plan-title">{lesson.title}</h2>
      {done && (
        <p className="plan-done">
          <span className="stop-stars" aria-label={`${stars} z 3 gwiazdek`}>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" size={16} className={i < stars ? 'star-on' : 'star-off'} />
            ))}
          </span>
          Ukończona. Możesz ją powtórzyć, żeby poprawić wynik.
        </p>
      )}

      {steps.length > 0 && (
        <section>
          <h3 className="plan-sub">Po każdym kroku od razu ćwiczysz to, o czym czytasz</h3>
          <ol className="plan-steps">
            {steps.map((s) => (
              <li key={s.index}>
                <span className="plan-step-title">{s.title}</span>
                {s.focus.length > 0 && <span className="plan-step-focus" lang={course.pack.target.code}>{s.focus.slice(0, 5).join(', ')}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {words.length > 0 && (
        <section>
          <h3 className="plan-sub">{isLearn ? `Nowe słowa (${words.length})` : 'Słowa'}</h3>
          <ul className="plan-words">
            {words.map((v) => (
              <li key={v.id}>
                <WordArt source={v} size="sm" />
                <span lang={course.pack.target.code}>{course.withArticle(v)}</span>
                <span className="muted">{v.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tips.length > 0 && (
        <p className="plan-tips">
          <Icon name="book" size={16} /> Po drodze krótko z teorii: {tips.map((t) => t.step.title).join(', ')}.
        </p>
      )}

      <div className="plan-actions">
        <button type="button" className="btn btn-primary btn-big" onClick={() => start()} autoFocus>
          <Icon name="play" size={18} />
          {lesson.kind === 'grammar' ? 'Teoria i ćwiczenia' : done ? 'Powtórz lekcję' : 'Zacznij'}
        </button>
        {(lesson.kind === 'grammar' || tips.length > 0) && (
          <button type="button" className="btn btn-ghost" onClick={() => start(true)}>
            <Icon name="dumbbell" size={18} /> Tylko ćwiczenia
          </button>
        )}
        {article && (
          <Link className="btn btn-ghost" to={`/teoria/${article.id}`}>
            <Icon name="book" size={18} /> Tylko teoria
          </Link>
        )}
      </div>
    </div>
  );
}
