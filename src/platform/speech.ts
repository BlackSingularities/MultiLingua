// Synteza i rozpoznawanie mowy. W przeglądarce: Web Speech API,
// w aplikacji Android/iOS: natywne wtyczki Capacitora (WebView ich nie ma).
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition as NativeRecognition } from '@capacitor-community/speech-recognition';

const native = Capacitor.isNativePlatform();

// ——— synteza ———

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function webVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const now = speechSynthesis.getVoices();
      if (now.length) return resolve(now);
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }
  return voicesReady;
}

export async function voicesFor(lang: string): Promise<SpeechSynthesisVoice[]> {
  const all = await webVoices();
  const base = lang.split('-')[0].toLowerCase();
  const matching = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
  // Najpierw dokładny region, potem głosy „naturalne”/sieciowe, które brzmią lepiej.
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase() ? 0 : 10) +
    (/natural|neural|premium|enhanced|google/i.test(v.name) ? 0 : 5) +
    (v.localService ? 1 : 0);
  return matching.sort((a, b) => score(a) - score(b));
}

const supportCache = new Map<string, boolean>();

export async function canSpeak(lang: string): Promise<boolean> {
  if (supportCache.has(lang)) return supportCache.get(lang)!;
  let ok = false;
  try {
    if (native) {
      ok = (await TextToSpeech.isLanguageSupported({ lang })).supported;
    } else {
      ok = (await voicesFor(lang)).length > 0;
    }
  } catch {
    ok = false;
  }
  supportCache.set(lang, ok);
  return ok;
}

export interface SpeakOptions {
  rate?: number;
  voiceURI?: string;
}

let current: SpeechSynthesisUtterance | null = null;

export async function speak(text: string, lang: string, opts: SpeakOptions = {}): Promise<void> {
  const rate = opts.rate ?? 1;
  if (native) {
    await TextToSpeech.stop().catch(() => {});
    await TextToSpeech.speak({ text, lang, rate, pitch: 1, volume: 1, category: 'playback' });
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const voices = await voicesFor(lang);
  const voice = voices.find((v) => v.voiceURI === opts.voiceURI) ?? voices[0];
  speechSynthesis.cancel();
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? lang;
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    current = u; // referencja chroni przed zbieraniem śmieci w Chrome (brak onend)
    speechSynthesis.speak(u);
    // Bezpiecznik: niektóre przeglądarki nie wysyłają onend.
    setTimeout(resolve, 2500 + text.length * 120);
  });
  current = null;
}

export function stopSpeaking() {
  if (native) TextToSpeech.stop().catch(() => {});
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
  void current;
}

// ——— rozpoznawanie ———

type WebRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function webRecognition(): WebRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: WebRecognitionCtor; webkitSpeechRecognition?: WebRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Którym mechanizmem rozpoznajemy mowę: natywna wtyczka (Android), Web Speech API, albo żadnym. */
let sttBackend: 'native' | 'web' | null | undefined;

export async function canListen(): Promise<boolean> {
  if (sttBackend !== undefined) return sttBackend !== null;
  if (native) {
    try {
      if ((await NativeRecognition.available()).available) {
        sttBackend = 'native';
        return true;
      }
    } catch {
      /* wtyczka niedostępna na tej platformie (np. iOS) — próbujemy WebView */
    }
  }
  sttBackend = webRecognition() ? 'web' : null;
  return sttBackend !== null;
}

export class MicError extends Error {
  readonly code: 'denied' | 'no-speech' | 'unavailable' | 'other';
  constructor(code: MicError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export interface Listening {
  result: Promise<string[]>;
  stop(): void;
}

/** Nasłuchuje jednej wypowiedzi. `onPartial` dostaje tekst na bieżąco (web). */
export function listen(lang: string, onPartial?: (text: string) => void): Listening {
  if (sttBackend === 'native') {
    let stopped = false;
    const result = (async () => {
      const perm = await NativeRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await NativeRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') throw new MicError('denied', 'Brak zgody na użycie mikrofonu.');
      }
      try {
        const res = await NativeRecognition.start({ language: lang, maxResults: 5, partialResults: false, popup: false });
        return res.matches ?? [];
      } catch (e) {
        if (stopped) return [];
        throw new MicError('no-speech', e instanceof Error ? e.message : 'Nie usłyszałem wypowiedzi.');
      }
    })();
    return {
      result,
      stop: () => {
        stopped = true;
        NativeRecognition.stop().catch(() => {});
      },
    };
  }

  const Ctor = webRecognition();
  if (!Ctor) {
    return { result: Promise.reject(new MicError('unavailable', 'Ta przeglądarka nie rozpoznaje mowy.')), stop: () => {} };
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  let finals: string[] = [];
  let lastPartial = '';
  const result = new Promise<string[]>((resolve, reject) => {
    rec.onresult = (e) => {
      const results = Array.from(e.results);
      const last = results[results.length - 1];
      lastPartial = results.map((r) => r[0].transcript).join(' ');
      onPartial?.(lastPartial);
      if (last.isFinal) finals = Array.from(last as ArrayLike<{ transcript: string }>).map((a) => a.transcript);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reject(new MicError('denied', 'Brak zgody na użycie mikrofonu.'));
      else if (e.error === 'no-speech') reject(new MicError('no-speech', 'Nic nie usłyszałem. Spróbuj jeszcze raz.'));
      else if (e.error !== 'aborted') reject(new MicError('other', `Błąd rozpoznawania mowy: ${e.error}`));
    };
    rec.onend = () => resolve(finals.length ? finals : lastPartial ? [lastPartial] : []);
  });
  try {
    rec.start();
  } catch {
    /* start po start — ignorujemy */
  }
  return { result, stop: () => rec.stop() };
}
