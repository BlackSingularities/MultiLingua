import { useApp } from '../data/store.ts';

/** Minimum, którego potrzebuje tablica: słowo, opcjonalnie emoji i klucz ilustracji. */
export interface ArtSource {
  t: string;
  emoji?: string;
  img?: string;
}

export type ArtSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * „Tablica” słowa — ilustracja SVG w ramce jak w leksykonie.
 * Kolejność: plik SVG z kursu → emoji ze słownika → inicjał słowa.
 * Ramka ma stały, jasny „papier” także w trybie ciemnym, żeby ilustracje
 * wyglądały wszędzie tak samo.
 */
export function WordArt({
  source, size = 'md', className, noLetter,
}: {
  source: ArtSource;
  size?: ArtSize;
  className?: string;
  /** Bez inicjału (np. w ćwiczeniu z obrazkami, gdzie litera zdradzałaby odpowiedź). */
  noLetter?: boolean;
}) {
  const url = useApp((s) => (source.img ? s.images.get(source.img) : undefined));
  const kind = url ? 'img' : source.emoji ? 'emoji' : 'letter';
  return (
    <span className={`plate plate-${size} plate-${kind}${className ? ` ${className}` : ''}`} aria-hidden>
      {url ? (
        <img src={url} alt="" draggable={false} decoding="async" />
      ) : source.emoji ? (
        <span className="plate-emoji">{source.emoji}</span>
      ) : noLetter ? (
        <span className="plate-letter">?</span>
      ) : (
        <span className="plate-letter">{initial(source.t)}</span>
      )}
    </span>
  );
}

function initial(word: string): string {
  // „l'amico” → „a”, „per favore” → „p”.
  const clean = word.replace(/^[\p{L}]+'/u, '');
  return (clean.match(/\p{L}/u)?.[0] ?? '·').toLocaleLowerCase();
}
