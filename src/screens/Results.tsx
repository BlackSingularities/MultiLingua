import { useEffect } from 'react';
import type { CourseIndex } from '../engine/course.ts';
import type { SessionMode } from '../engine/types.ts';
import type { SessionResult } from '../data/progress.ts';
import type { VocabItem } from '../data/types.ts';
import { WordArt } from '../components/WordArt.tsx';
import { useApp } from '../data/store.ts';
import { sfx } from '../platform/sfx.ts';
import { Icon } from '../components/Icon.tsx';
import { Flag } from '../components/Flag.tsx';

function headline(r: SessionResult, isTest: boolean): string {
  if (isTest && !r.passed) return 'Jeszcze nie tym razem';
  if (isTest) return 'Sprawdzian zaliczony!';
  if (r.accuracy >= 0.95) return 'Bezbłędnie!';
  if (r.accuracy >= 0.8) return 'Lekcja ukończona!';
  return 'Ukończone — warto powtórzyć';
}

export function Results({
  result, mode, course, isTest, newWords, onContinue, onRetry,
}: {
  result: SessionResult;
  newWords: VocabItem[];
  mode: SessionMode;
  course: CourseIndex;
  isTest: boolean;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const sound = useApp((s) => s.settings.sound);
  const goal = useApp((s) => s.settings.dailyGoal);
  useEffect(() => {
    if (result.passed && sound) setTimeout(() => sfx.stamp(), 650);
  }, [result.passed, sound]);

  const lesson = mode.kind === 'lesson' ? course.lessons.get(mode.lessonId) : undefined;
  const unit = mode.kind === 'skip' ? course.unitById.get(mode.unitId) : lesson ? course.unitById.get(lesson.unit) : undefined;
  const pct = Math.round(result.accuracy * 100);

  return (
    <div className="results">
      <div className={`results-stamp${result.passed ? ' is-passed' : ' is-failed'}`} style={{ '--stamp': course.pack.color } as React.CSSProperties}>
        <div className="results-stamp-ring">
          <span className="results-stamp-flag"><Flag code={course.pack.target.code} size={40} /></span>
          <span className="results-stamp-text">{result.passed ? (unit ? unit.title : 'MultiLingua') : `${pct}%`}</span>
          <span className="results-stars" aria-label={`${result.stars} z 3 gwiazdek`}>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" size={22} className={i < result.stars ? 'star-on' : 'star-off'} />
            ))}
          </span>
        </div>
      </div>

      <h1 className="results-title">{headline(result, isTest)}</h1>
      {isTest && !result.passed && (
        <p className="muted center">Do zaliczenia potrzeba 80% poprawnych odpowiedzi. Masz {pct}%. Powtórz materiał i spróbuj ponownie.</p>
      )}
      {mode.kind === 'skip' && result.passed && (
        <p className="muted center">Odblokowałeś jednostkę „{unit?.title}” i wszystko przed nią.</p>
      )}

      <dl className="results-stats">
        <div>
          <dt>Punkty</dt>
          <dd className="sun">+{result.xp} XP</dd>
        </div>
        <div>
          <dt>Trafność</dt>
          <dd>{pct}%</dd>
        </div>
        <div>
          <dt>Seria dni</dt>
          <dd>
            <Icon name="flame" size={18} /> {result.streak}
          </dd>
        </div>
      </dl>
      {newWords.length > 0 && (
        <section className="results-words" aria-label="Nowe słowa">
          <h2 className="side-title">Nowe słowa w Twoim słowniku</h2>
          <ul>
            {newWords.map((v) => (
              <li key={v.id}>
                <WordArt source={v} size="sm" />
                <span lang={course.pack.target.code}>{course.withArticle(v)}</span>
                <span className="muted">{v.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.goalReached && <p className="goal-banner">Dzienny cel {goal} XP osiągnięty. Do jutra!</p>}

      <div className="results-actions">
        {isTest && !result.passed ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onContinue}>
              Wróć do ścieżki
            </button>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Spróbuj ponownie
            </button>
          </>
        ) : (
          <>
            {lesson && (
              <button type="button" className="btn btn-ghost" onClick={onRetry}>
                Powtórz
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onContinue} autoFocus>
              Dalej
            </button>
          </>
        )}
      </div>
    </div>
  );
}
