import type { Exercise } from '../engine/types.ts';
import type { ExProps } from './shared.tsx';
import { ArticleEx, ChoiceEx, IntroEx, JudgeEx, ListenEx, PictureEx, QuestionEx } from './choice.tsx';
import { ClozeEx, ConjugateEx, DictationEx, ErrorSpotEx, NumberEx, SpellEx, TilesEx, WriteEx } from './build.tsx';
import { PairsEx, ReorderEx, SpeakEx, StoryEx, TheoryEx } from './special.tsx';

export function ExerciseView(p: ExProps<Exercise>) {
  const { ex } = p;
  // Każdy typ dostaje zawężony rekord; rzutowanie jest bezpieczne dzięki unii po `type`.
  switch (ex.type) {
    case 'intro': return <IntroEx {...p} ex={ex} />;
    case 'theory': return <TheoryEx {...p} ex={ex} />;
    case 'choice': return <ChoiceEx {...p} ex={ex} />;
    case 'picture': return <PictureEx {...p} ex={ex} />;
    case 'pairs': return <PairsEx {...p} ex={ex} />;
    case 'tiles': return <TilesEx {...p} ex={ex} />;
    case 'write': return <WriteEx {...p} ex={ex} />;
    case 'cloze': return <ClozeEx {...p} ex={ex} />;
    case 'listen': return <ListenEx {...p} ex={ex} />;
    case 'dictation': return <DictationEx {...p} ex={ex} />;
    case 'speak': return <SpeakEx {...p} ex={ex} />;
    case 'conjugate': return <ConjugateEx {...p} ex={ex} />;
    case 'article': return <ArticleEx {...p} ex={ex} />;
    case 'judge': return <JudgeEx {...p} ex={ex} />;
    case 'errorspot': return <ErrorSpotEx {...p} ex={ex} />;
    case 'spell': return <SpellEx {...p} ex={ex} />;
    case 'number': return <NumberEx {...p} ex={ex} />;
    case 'question': return <QuestionEx {...p} ex={ex} />;
    case 'story': return <StoryEx {...p} ex={ex} />;
    case 'reorder': return <ReorderEx {...p} ex={ex} />;
  }
}

/** Ćwiczenia, przy których błąd może wynikać z innego, poprawnego sformułowania. */
export const ACCEPTABLE_OVERRIDE = new Set<Exercise['type']>(['write', 'tiles', 'dictation', 'cloze', 'speak']);

/** Tekst polecenia do zapisania w dzienniku błędów. */
export function promptOf(ex: Exercise): string {
  switch (ex.type) {
    case 'choice':
    case 'tiles':
    case 'write':
      return ex.prompt || ex.audio || '';
    case 'picture':
      return ex.prompt;
    case 'cloze':
      return `${ex.before}___${ex.after}`;
    case 'listen':
    case 'dictation':
      return `🔊 ${ex.audio}`;
    case 'speak':
      return `🎙 ${ex.text}`;
    case 'conjugate':
      return `${ex.table.verb}: ${ex.personLabel} …`;
    case 'article':
      return `___ ${ex.word}`;
    case 'judge':
      return ex.text;
    case 'errorspot':
      return ex.tokens.join(' ');
    case 'spell':
      return ex.prompt;
    case 'number':
      return String(ex.value);
    case 'question':
      return ex.question.q;
    default:
      return '';
  }
}
