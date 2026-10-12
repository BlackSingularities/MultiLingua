import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../data/store.ts';
import { overview, type Overview } from '../data/progress.ts';
import { supportsNumbers } from '../engine/numbers.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { useSpeech } from '../components/ui.tsx';

interface Card {
  to: string;
  icon: IconName;
  title: string;
  desc: string;
  badge?: string;
  off?: string;
}

export function Practice() {
  const course = useApp((s) => s.course)!;
  const revision = useApp((s) => s.revision);
  const { audioOn, micOn, sttOk } = useSpeech();
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => {
    void overview(course.id).then(setOv);
  }, [course.id, revision]);

  const cards: Card[] = [
    {
      to: '/trening/powtorka',
      icon: 'refresh',
      title: 'Powtórka',
      desc: 'Słówka i zdania, które właśnie zaczynasz zapominać.',
      badge: ov?.due ? String(ov.due) : undefined,
    },
    {
      to: '/trening/bledy',
      icon: 'target',
      title: 'Popraw błędy',
      desc: 'Wracamy do tego, co ostatnio sprawiło trudność.',
      badge: ov?.mistakes ? String(ov.mistakes) : undefined,
    },
    {
      to: '/trening/mowienie',
      icon: 'mic',
      title: 'Mówienie',
      desc: micOn ? 'Powiedz zdania na głos — aplikacja sprawdzi wymowę.' : sttOk === false ? 'Czytanie na głos z nagraniem i samooceną.' : 'Czytanie na głos z oceną wymowy.',
    },
    {
      to: '/trening/sluchanie',
      icon: 'headphones',
      title: 'Słuchanie',
      desc: 'Dyktanda i rozumienie ze słuchu.',
      off: audioOn ? undefined : 'Wymaga syntezy mowy',
    },
    {
      to: '/odmiana',
      icon: 'table',
      title: 'Odmiana czasowników',
      desc: 'Tabele odmian i trening form.',
    },
    {
      to: '/trening/liczby',
      icon: 'hash',
      title: 'Liczby',
      desc: 'Liczebniki 0–100 ze słuchu i na piśmie.',
      off: supportsNumbers(course.pack.target.code) ? undefined : 'Niedostępne w tym kursie',
    },
    {
      to: '/trening/szybka',
      icon: 'bolt',
      title: 'Szybka runda',
      desc: '90 sekund, ile zdążysz. Dobre na rozgrzewkę.',
    },
    {
      to: '/historie',
      icon: 'story',
      title: 'Historyjki',
      desc: 'Krótkie dialogi z życia z pytaniami.',
    },
  ];

  return (
    <div className="practice">
      <h1 className="page-title">Ćwiczenia</h1>
      <p className="page-lead">Trening dobiera się do tego, co już znasz i co słabiej Ci idzie.</p>
      <div className="practice-grid">
        {cards.map((c) =>
          c.off ? (
            <div key={c.to} className="practice-card is-off" aria-disabled="true">
              <span className="practice-icon"><Icon name={c.icon} size={26} /></span>
              <h2>{c.title}</h2>
              <p>{c.off}</p>
            </div>
          ) : (
            <Link key={c.to} to={c.to} className="practice-card">
              <span className="practice-icon"><Icon name={c.icon} size={26} /></span>
              {c.badge && <span className="badge" aria-label={`${c.badge} do zrobienia`}>{c.badge}</span>}
              <h2>{c.title}</h2>
              <p>{c.desc}</p>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
