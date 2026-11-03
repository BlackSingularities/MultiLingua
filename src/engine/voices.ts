// Głosy lektorów w historyjkach: kto mówi jakim głosem. Czysta logika — używa jej
// aplikacja (przy odtwarzaniu), panel administratora (podgląd) i testy.
import type { CourseVoices, VoiceGender } from '../data/types.ts';

/** Głos dostępny na urządzeniu (Web Speech API albo natywny TTS). */
export interface DeviceVoice {
  /** Identyfikator do odtwarzania (voiceURI w przeglądarce, indeks w aplikacji). */
  id: string;
  name: string;
  lang: string;
}

export interface SpeakerVoice {
  /** Głos z urządzenia; brak = domyślny głos języka. */
  voice?: DeviceVoice;
  gender?: VoiceGender;
  /** Wysokość głosu — różnicuje postaci, gdy głosów jest mniej niż mówiących. */
  pitch: number;
}

const FEMALE_TITLES = /^(signora|signorina|sig\.ra|nonna|mamma|zia|dottoressa|professoressa|maestra|señora|señorita|abuela|mamá|tía|madame|mademoiselle|frau|mrs\.?|ms\.?|miss|pani|babcia|mama|ciocia)\b/i;
const MALE_TITLES = /^(signor|signore|sig\.|nonno|papà|papa|zio|dottor|dottore|professor|professore|maestro|señor|abuelo|tío|monsieur|herr|mr\.?|pan|dziadek|tata|wujek)\b/i;

// Imiona, przy których końcówka myli: męskie na -a i żeńskie na -e/-i/spółgłoskę.
const MALE_IN_A = new Set(['luca', 'andrea', 'nicola', 'mattia', 'elia', 'enea', 'battista', 'gianluca', 'jakub', 'kuba', 'barnaba', 'joshua', 'sasha']);
const NEUTRAL_ROLES = new Set([
  'insegnante', 'turista', 'cliente', 'collega', 'giornalista', 'barista', 'tassista', 'autista', 'guida',
  'farmacista', 'artista', 'dentista', 'receptionist', 'passante', 'tutti', 'coro', 'voce', 'narratore',
  'docente', 'utente', 'paziente', 'agente', 'cantante', 'ospite', 'vigile', 'nipote',
]);
const FEMALE_OTHER = new Set([
  'alice', 'beatrice', 'irene', 'adele', 'agnese', 'rachele', 'matilde', 'carmen', 'ines', 'noemi', 'miriam',
  'ester', 'beatriz', 'isabel', 'raquel', 'mercedes', 'pilar', 'rocío', 'nicole', 'chloé', 'chloe', 'rose',
  'claire', 'sophie', 'marie', 'anne', 'catherine', 'ingrid', 'karin', 'kate', 'ruth', 'sarah', 'emily',
  'elizabeth', 'margaret', 'grace', 'mary', 'beatrycze', 'ewelina', 'agnieszka',
]);

/**
 * Płeć mówiącego po imieniu lub tytule (Signora Bianchi → f, Marco → m).
 * Zwraca undefined, gdy nie da się tego rozsądnie zgadnąć (np. „Kelner”, „Tutti”).
 */
export function guessGender(speaker: string): VoiceGender | undefined {
  const name = speaker.trim();
  if (FEMALE_TITLES.test(name)) return 'f';
  if (MALE_TITLES.test(name)) return 'm';
  const first = name.split(/\s+/)[0].toLowerCase().replace(/[^\p{L}]/gu, '');
  if (!first || first.length < 2) return undefined;
  // Role bez imienia: „Turista” czy „Insegnante” to może być każdy — administrator zdecyduje.
  if (NEUTRAL_ROLES.has(first)) return undefined;
  if (MALE_IN_A.has(first)) return 'm';
  if (FEMALE_OTHER.has(first)) return 'f';
  // Rzeczowniki-role (kelner, barista…) zostawiamy bez płci — tylko imiona pisane wielką literą.
  if (!/^\p{Lu}/u.test(name)) return undefined;
  if (/a$/.test(first)) return 'f';
  if (/[oiu]$/.test(first) || /[bcdfgklmnprstvz]$/.test(first) || /e$/.test(first)) return 'm';
  return undefined;
}

// Znane głosy syntezy (Windows, macOS/iOS, Android, Chrome) — gdy administrator
// nie opisał głosu, zgadujemy płeć po nazwie.
const FEMALE_VOICE = /\b(female|woman|kobieta|elsa|isabella|alice|federica|paola|bianca|carla|giorgia|lucia|elena|laura|helena|sabina|monica|paulina|mónica|marisol|esperanza|dalia|elvira|ximena|amelie|denise|julie|hortense|vivienne|eloise|katja|hedda|petra|anna|marlene|vicki|zira|aria|jenny|michelle|samantha|karen|moira|tessa|fiona|victoria|serena|kate|susan|libby|sonia|maisie|zosia|agnieszka|ewa|paulina|maja|natasza|yelda|sara|irina|milena|ioana|amalia|emma|ava|allison|nicky)\b/i;
const MALE_VOICE = /\b(male|man|mężczyzna|diego|cosimo|giuseppe|benigno|calogero|gianni|luca|rinaldo|alvaro|álvaro|jorge|pablo|raul|raúl|jorge|henri|remy|rémy|paul|claude|thomas|conrad|killian|stefan|guy|david|mark|ryan|eric|christopher|davis|tony|alex|daniel|fred|oliver|thomas|arthur|marek|jacek|krzysztof|adam|tomasz|pavel|ruslan|dmitry|andrei|rocko|reed|eddy|grandpa)\b/i;
// Android: it-it-x-itb-local, it-it-x-itd-network… — litery po „x-” nie mówią o płci.

export function voiceGender(voice: { name: string }, config?: CourseVoices): VoiceGender | undefined {
  const listed = config?.voices.find((v) => sameVoice(v.name, voice.name));
  if (listed) return listed.gender;
  if (FEMALE_VOICE.test(voice.name)) return 'f';
  if (MALE_VOICE.test(voice.name)) return 'm';
  return undefined;
}

/** Nazwy głosów różnią się między przeglądarkami drobiazgami (wielkość liter, spacje). */
export function sameVoice(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

export function speakerGender(speaker: string, config?: CourseVoices): VoiceGender | undefined {
  return config?.speakers[speaker] ?? guessGender(speaker);
}

/**
 * Przydziela głosy mówiącym w historyjce. Kolejność:
 * 1) głos przypisany przez administratora tej postaci w tej historyjce (jeśli urządzenie go ma),
 * 2) głosy z listy administratora o pasującej płci — po kolei, każdej postaci inny,
 * 3) pozostałe głosy urządzenia o pasującej płci,
 * 4) dowolny głos języka; postaci różnicuje wtedy wysokość (kobiety wyżej, mężczyźni niżej).
 */
export function assignStoryVoices(
  speakers: string[],
  device: DeviceVoice[],
  config: CourseVoices | undefined,
  storyId?: string,
): Map<string, SpeakerVoice> {
  const result = new Map<string, SpeakerVoice>();
  const listedOrder = (v: DeviceVoice) => {
    const i = config?.voices.findIndex((c) => sameVoice(c.name, v.name)) ?? -1;
    return i < 0 ? 1000 : i;
  };
  // Najpierw głosy wybrane przez administratora, w jego kolejności; potem reszta urządzenia.
  const pool = [...device].sort((a, b) => listedOrder(a) - listedOrder(b));
  const hasConfig = !!config && config.voices.some((c) => device.some((d) => sameVoice(d.name, c.name)));
  const usable = hasConfig ? pool.filter((v) => listedOrder(v) < 1000) : pool;
  const byGender = (g: VoiceGender) => usable.filter((v) => voiceGender(v, config) === g);
  const used = new Map<string, number>();
  const perStory = (storyId && config?.stories[storyId]) || {};

  const take = (list: DeviceVoice[]): DeviceVoice | undefined => {
    if (!list.length) return undefined;
    // Najmniej dotąd używany głos — przy dwóch kobietach i dwóch głosach żeńskich każda ma swój.
    return [...list].sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0))[0];
  };

  const unique = [...new Set(speakers)];
  for (const speaker of unique) {
    const gender = speakerGender(speaker, config);
    const fixedName = perStory[speaker];
    let voice = fixedName ? usable.find((v) => sameVoice(v.name, fixedName)) ?? pool.find((v) => sameVoice(v.name, fixedName)) : undefined;
    let matched = !!voice;
    if (!voice && gender) {
      voice = take(byGender(gender));
      matched = !!voice;
    }
    if (!voice) voice = take(gender ? usable.filter((v) => voiceGender(v, config) === undefined) : usable) ?? take(usable);
    const n = voice ? (used.get(voice.id) ?? 0) : [...result.values()].filter((r) => !r.voice).length;
    if (voice) used.set(voice.id, n + 1);
    // Ten sam głos u kolejnej postaci — lekko inna wysokość, żeby dało się je odróżnić.
    const shift = [0, 0.12, -0.1, 0.22, -0.18][n % 5];
    const base = matched || !gender ? 1 : gender === 'f' ? 1.18 : 0.82;
    result.set(speaker, { voice, gender, pitch: Math.round((base + shift) * 100) / 100 });
  }
  return result;
}
