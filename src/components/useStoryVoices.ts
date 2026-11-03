import { useEffect, useState } from 'react';
import { useApp } from '../data/store.ts';
import type { CourseVoices } from '../data/types.ts';
import { assignStoryVoices } from '../engine/voices.ts';
import { deviceVoices } from '../platform/speech.ts';
import type { VoicePick } from './ui.tsx';

export type SpeakerPick = VoicePick & { name?: string };

/**
 * Głos każdej postaci historyjki: według ustawień administratora i tego, jakie głosy
 * ma urządzenie. Gdy użytkownik wyłączył „różne głosy”, wszyscy mówią głosem z ustawień.
 */
export function useStoryVoices(speakers: string[], storyId: string, lang: string, config: CourseVoices | undefined): Map<string, SpeakerPick> {
  const enabled = useApp((s) => s.settings.storyVoices);
  const [map, setMap] = useState<Map<string, SpeakerPick>>(new Map());
  const key = speakers.join('|');
  useEffect(() => {
    if (!enabled) {
      setMap(new Map());
      return;
    }
    let alive = true;
    void deviceVoices(lang).then((device) => {
      if (!alive) return;
      const assigned = assignStoryVoices(speakers, device, config, storyId);
      setMap(new Map([...assigned].map(([sp, v]) => [sp, { voiceURI: v.voice?.id, pitch: v.pitch, name: v.voice?.name }])));
    });
    return () => {
      alive = false;
    };
    // speakers porównujemy przez klucz — tablica jest tworzona na nowo przy renderze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storyId, lang, config, enabled]);
  return map;
}
