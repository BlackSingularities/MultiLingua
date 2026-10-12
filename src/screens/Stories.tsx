import { useNavigate } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { isLessonDone, isLessonUnlocked } from '../data/progress.ts';
import { Icon } from '../components/Icon.tsx';

export function Stories() {
  const course = useApp((s) => s.course)!;
  const progress = useApp((s) => s.progress)!;
  const navigate = useNavigate();
  const items = course.path.filter((l) => l.kind === 'story');

  return (
    <div className="stories">
      <h1 className="page-title">Historyjki</h1>
      <p className="page-lead">Dialogi z codziennego życia. Dotknij słowa, żeby zobaczyć tłumaczenie.</p>
      <ul className="story-grid">
        {items.map((l) => {
          const story = l.story ? course.stories.get(l.story) : undefined;
          if (!story) return null;
          const unlocked = isLessonUnlocked(course, progress, l.id);
          const done = isLessonDone(course, progress, l.id);
          const unit = course.unitById.get(l.unit);
          return (
            <li key={l.id}>
              <button type="button" className={`story-card${unlocked ? '' : ' is-locked'}`} disabled={!unlocked} onClick={() => navigate(`/lekcja/${l.id}`)}>
                <span className="story-card-emoji" aria-hidden>{story.emoji}</span>
                <span className="story-card-title" lang={course.pack.target.code}>{story.title}</span>
                <span className="story-card-intro">{story.intro}</span>
                <span className="story-card-meta">
                  {unit?.title}
                  {done && <span className="tag tag-ok">przeczytane</span>}
                  {!unlocked && (
                    <span className="tag">
                      <Icon name="lock" size={12} /> zablokowane
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
