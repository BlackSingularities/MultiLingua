import { create } from 'zustand';
import { CourseIndex } from '../engine/course.ts';
import type { SrsState } from '../engine/srs.ts';
import { downloadPack, loadImages, loadPack, refreshPack } from './api.ts';
import type { CoursePack } from './types.ts';
import { db, type CourseProgress } from './db.ts';
import { getProgress, loadSrs } from './progress.ts';
import { canListen, canSpeak } from '../platform/speech.ts';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  onboarded: boolean;
  activeCourse: string | null;
  /** Kursy, które użytkownik dodał do swojej listy. */
  myCourses: string[];
  dailyGoal: number;
  sound: boolean;
  listening: boolean;
  speaking: boolean;
  autoplay: boolean;
  hard: boolean;
  /** Ćwiczenia z wyborem sprawdzają się od razu po dotknięciu odpowiedzi. */
  instant: boolean;
  rate: number;
  /** Wybrany głos syntezy dla danego tagu językowego. */
  voices: Record<string, string>;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  activeCourse: null,
  myCourses: [],
  dailyGoal: 20,
  sound: true,
  listening: true,
  speaking: true,
  autoplay: true,
  hard: false,
  instant: true,
  rate: 0.95,
  voices: {},
  theme: 'system',
};

interface AppState {
  ready: boolean;
  settings: Settings;
  course: CourseIndex | null;
  progress: CourseProgress | null;
  srs: Map<string, SrsState>;
  loadingCourse: boolean;
  courseError: string | null;
  /** Komunikat do pokazania w tostach. */
  toast: { id: number; text: string } | null;
  /** Rośnie po każdej zmianie postępów — ekrany przeliczają statystyki. */
  revision: number;
  /** Do „nie mogę teraz słuchać/mówić”: znacznik czasu, do kiedy wyłączone. */
  muteAudioUntil: number;
  muteMicUntil: number;
  /** Czy urządzenie umie czytać na głos język kursu / rozpoznawać mowę (null = sprawdzam). */
  ttsOk: boolean | null;
  sttOk: boolean | null;
  /** Ilustracje słówek: klucz obrazka → adres blob: z kodem SVG. */
  images: Map<string, string>;

  init(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  openCourse(id: string, opts?: { forceDownload?: boolean }): Promise<void>;
  reloadProgress(): Promise<void>;
  applySrs(states: SrsState[]): void;
  notify(text: string): void;
  muteFor(kind: 'audio' | 'mic', minutes: number): void;
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  course: null,
  progress: null,
  srs: new Map(),
  loadingCourse: false,
  courseError: null,
  toast: null,
  revision: 0,
  muteAudioUntil: 0,
  muteMicUntil: 0,
  ttsOk: null,
  sttOk: null,
  images: new Map(),

  async init() {
    const row = await db.settings.get('app');
    const settings = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
    set({ settings });
    if (settings.activeCourse) {
      try {
        await get().openCourse(settings.activeCourse);
      } catch {
        /* błąd pokazujemy na ekranie kursu */
      }
    }
    set({ ready: true });
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await db.settings.put({ key: 'app', value: settings });
  },

  async openCourse(id, opts) {
    set({ loadingCourse: true, courseError: null });
    try {
      const pack = opts?.forceDownload ? await downloadPack(id) : await loadPack(id);
      const course = new CourseIndex(pack);
      const [progress, srs] = await Promise.all([getProgress(id), loadSrs(id)]);
      const s = get().settings;
      const myCourses = s.myCourses.includes(id) ? s.myCourses : [...s.myCourses, id];
      set({ course, progress, srs, loadingCourse: false, revision: get().revision + 1 });
      void attachImages(pack);
      void Promise.all([canSpeak(pack.target.speech), canListen()]).then(([ttsOk, sttOk]) => set({ ttsOk, sttOk }));
      if (s.activeCourse !== id || myCourses !== s.myCourses) await get().updateSettings({ activeCourse: id, myCourses });

      // W tle: czy na serwerze jest nowsza treść kursu?
      if (!opts?.forceDownload) {
        refreshPack(id)
          .then((fresh) => {
            if (fresh && get().course?.id === id) {
              set({ course: new CourseIndex(fresh), revision: get().revision + 1 });
              void attachImages(fresh);
              get().notify('Kurs zaktualizowany do najnowszej wersji.');
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      set({ loadingCourse: false, courseError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  async reloadProgress() {
    const c = get().course;
    if (!c) return;
    const [progress, srs] = await Promise.all([getProgress(c.id), loadSrs(c.id)]);
    set({ progress, srs, revision: get().revision + 1 });
  },

  applySrs(states) {
    if (!states.length) return;
    const srs = new Map(get().srs);
    for (const s of states) srs.set(s.item, s);
    set({ srs });
  },

  notify(text) {
    set({ toast: { id: ++toastSeq, text } });
  },

  muteFor(kind, minutes) {
    const until = Date.now() + minutes * 60_000;
    set(kind === 'audio' ? { muteAudioUntil: until } : { muteMicUntil: until });
  },
}));

/** Zamienia kod SVG na adresy blob: (obrazki przez <img> nie wykonają żadnego skryptu). */
async function attachImages(pack: CoursePack) {
  const svgs = await loadImages(pack).catch(() => ({}) as Record<string, string>);
  if (useApp.getState().course?.id !== pack.id) return;
  const old = useApp.getState().images;
  const images = new Map<string, string>();
  for (const [key, svg] of Object.entries(svgs)) {
    images.set(key, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
  }
  useApp.setState({ images });
  for (const url of old.values()) URL.revokeObjectURL(url);
}
