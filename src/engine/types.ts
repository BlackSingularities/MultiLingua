import type { ChoiceQuestion, Conjugation, GrammarArticle, Story, StoryLine, VocabItem } from '../data/types.ts';
import type { ItemKind } from './srs.ts';
import type { TheoryStep } from './theory.ts';

export type Skill = 'vocab' | 'reading' | 'writing' | 'listening' | 'speaking' | 'grammar';

export const SKILL_LABELS: Record<Skill, string> = {
  vocab: 'Słownictwo',
  reading: 'Czytanie',
  writing: 'Pisanie',
  listening: 'Słuchanie',
  speaking: 'Mówienie',
  grammar: 'Gramatyka',
};

/** 't' — język docelowy, 'n' — ojczysty. */
export type Side = 't' | 'n';

interface Base {
  /** Unikalny w sesji. */
  key: string;
  skill: Skill;
  /** Element SRS, którego dotyczy ćwiczenie. */
  item?: { id: string; kind: ItemKind };
  /** Czy ćwiczenie wymaga dźwięku / mikrofonu (pomijane, gdy wyłączone). */
  needs?: 'audio' | 'mic';
  /** Ćwiczenie powtórzone po błędzie. */
  retry?: boolean;
}

export type Exercise = Base & (
  | { type: 'intro'; vocab: VocabItem }
  | {
      type: 'theory';
      article: GrammarArticle;
      tables: Conjugation[];
      /** Jeden krok artykułu (teoria przeplatana z ćwiczeniami); brak = cały artykuł. */
      step?: TheoryStep;
      /** Co zaraz będzie ćwiczone — słowa i formy z tego kroku. */
      upcoming?: string[];
      /** Krótka wskazówka w lekcji słówek (zamiast pełnego kroku). */
      tip?: boolean;
    }
  | { type: 'choice'; prompt: string; promptSide: Side; audio?: string; options: string[]; answer: number; title: string }
  | { type: 'picture'; prompt: string; audio?: string; options: { t: string; emoji?: string; img?: string; label: string }[]; answer: number }
  | { type: 'pairs'; pairs: { id: string; t: string; n: string }[] }
  | { type: 'tiles'; prompt: string; promptSide: Side; audio?: string; tiles: string[]; answers: string[]; title: string }
  | { type: 'write'; prompt: string; promptSide: Side; audio?: string; answers: string[]; title: string; words?: VocabItem[] }
  | { type: 'cloze'; before: string; after: string; translation: string; options?: string[]; answers: string[]; full: string }
  | { type: 'listen'; audio: string; options: string[]; answer: number }
  | { type: 'dictation'; audio: string; answers: string[]; translation: string }
  | { type: 'speak'; text: string; translation: string }
  | { type: 'conjugate'; table: Conjugation; person: number; personLabel: string; answers: string[] }
  | { type: 'article'; word: string; meaning: string; emoji?: string; img?: string; options: string[]; answer: number; explain: string }
  | { type: 'judge'; text: string; shown: string; correct: string; isRight: boolean }
  | { type: 'errorspot'; tokens: string[]; wrong: number; fix: string; full: string; translation: string }
  | { type: 'spell'; prompt: string; letters: string[]; answer: string; audio: string }
  | { type: 'number'; mode: 'listen' | 'write'; value: number; words: string; answers: string[] }
  | { type: 'question'; question: ChoiceQuestion; context?: string }
  | { type: 'story'; story: Story }
  | { type: 'reorder'; lines: StoryLine[]; order: number[] }
);

export type ExerciseType = Exercise['type'];

export interface AnswerOutcome {
  ok: boolean;
  /** Zaliczone, ale z drobnym błędem (akcent, literówka). */
  partial?: 'accent' | 'typo';
  /** Odpowiedź wzorcowa do pokazania. */
  correct?: string;
  /** Odpowiedź użytkownika (do zapisania w błędach). */
  given?: string;
  /** Dodatkowe wyjaśnienie (np. z pytania). */
  explain?: string;
  /** Ćwiczenie pominięte (np. „nie mogę teraz mówić”) — nie liczy się do wyniku. */
  skipped?: boolean;
}

/** Teoria przeplatana z ćwiczeniami (domyślnie) albo same ćwiczenia. */
export type LessonVariant = 'mixed' | 'practice';

export type SessionMode =
  | { kind: 'lesson'; lessonId: string; variant?: LessonVariant }
  | { kind: 'review' }
  | { kind: 'mistakes' }
  | { kind: 'speaking' }
  | { kind: 'listening' }
  | { kind: 'conjugation'; tableId?: string }
  | { kind: 'numbers' }
  | { kind: 'speed' }
  | { kind: 'unit'; unitId: string }
  | { kind: 'skip'; unitId: string };
