// Głosy lektorów historyjek: administrator wybiera głosy języka (np. z tej przeglądarki),
// opisuje je jako damskie/męskie, ustala płeć postaci i — jeśli chce — przypisuje
// konkretny głos postaci w danej historyjce. Urządzenia ucznia używają tych głosów,
// które mają; resztę dobiera aplikacja według płci.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../data/store.ts';
import type { CourseVoices, VoiceGender } from '../data/types.ts';
import { assignStoryVoices, sameVoice, voiceGender, type DeviceVoice } from '../engine/voices.ts';
import { deviceVoices, speak, stopSpeaking } from '../platform/speech.ts';
import { Icon } from '../components/Icon.tsx';
import { Spinner } from '../components/ui.tsx';
import { adminApi, type CourseInfo, type Validation } from './api.ts';

interface VoicesData {
  lang: string;
  langName: string;
  config: CourseVoices;
  speakers: { name: string; count: number; guess: VoiceGender | null }[];
  stories: {
    id: string;
    title: string;
    emoji: string;
    unitTitle: string;
    speakers: { name: string; sample: string }[];
    lines: [string, string][];
  }[];
}

const G_LABEL: Record<VoiceGender, string> = { f: 'damski', m: 'męski' };
const P_LABEL: Record<VoiceGender, string> = { f: 'kobieta', m: 'mężczyzna' };

export function VoicesTab({ courses }: { courses: CourseInfo[] }) {
  const [course, setCourse] = useState(courses[0]?.id ?? '');
  const [data, setData] = useState<VoicesData | null>(null);
  const [config, setConfig] = useState<CourseVoices>({ voices: [], speakers: {}, stories: {} });
  const [device, setDevice] = useState<DeviceVoice[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState({ name: '', gender: 'f' as VoiceGender });
  const [playing, setPlaying] = useState<string | null>(null);
  const stopRef = useRef(false);
  const openCourse = useApp((s) => s.openCourse);
  const activeCourse = useApp((s) => s.settings.activeCourse);

  const load = useCallback(async () => {
    setData(null);
    setMsg(null);
    try {
      const r = await adminApi.get<VoicesData>(`/voices?course=${course}`);
      setData(r);
      setConfig(r.config);
      setDirty(false);
      setDevice(await deviceVoices(r.lang));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [course]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => () => stopSpeaking(), []);

  const edit = (fn: (c: CourseVoices) => CourseVoices) => {
    setConfig((c) => fn(c));
    setDirty(true);
    setMsg(null);
  };

  const inPool = (name: string) => config.voices.some((v) => sameVoice(v.name, name));
  const onDevice = (name: string) => device.find((d) => sameVoice(d.name, name));
  const others = device.filter((d) => !inPool(d.name));

  const play = async (key: string, text: string, voiceId?: string, pitch?: number) => {
    if (!data) return;
    stopRef.current = false;
    setPlaying(key);
    await speak(text, data.lang, { voiceURI: voiceId, pitch, rate: 0.95 }).catch(() => {});
    setPlaying((p) => (p === key ? null : p));
  };

  const playStory = async (storyId: string) => {
    if (!data) return;
    const story = data.stories.find((s) => s.id === storyId)!;
    const assigned = assignStoryVoices(story.speakers.map((s) => s.name), device, config, storyId);
    stopRef.current = false;
    setPlaying(`story-${storyId}`);
    for (const [speaker, text] of story.lines) {
      if (stopRef.current) break;
      const v = assigned.get(speaker);
      await speak(text, data.lang, { voiceURI: v?.voice?.id, pitch: v?.pitch, rate: 0.95 }).catch(() => {});
    }
    setPlaying(null);
  };

  const stop = () => {
    stopRef.current = true;
    stopSpeaking();
    setPlaying(null);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminApi.put<Validation & { saved: boolean }>('/voices', { course, config });
      if (!r.saved) {
        setMsg({ ok: false, text: r.errors.join('\n') || 'Nie udało się zapisać.' });
        return;
      }
      setDirty(false);
      setMsg({ ok: true, text: 'Zapisano. Aplikacje pobiorą nowe ustawienia głosów przy następnym otwarciu kursu.' });
      if (activeCourse === course) void openCourse(course).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => {
    if (!data) return new Map<string, ReturnType<typeof assignStoryVoices>>();
    return new Map(data.stories.map((s) => [s.id, assignStoryVoices(s.speakers.map((x) => x.name), device, config, s.id)]));
  }, [data, device, config]);

  if (!data) return msg ? <p className="error-text">{msg.text}</p> : <Spinner label="Wczytuję głosy…" />;

  const fCount = config.voices.filter((v) => v.gender === 'f').length;
  const mCount = config.voices.filter((v) => v.gender === 'm').length;

  return (
    <div className="voices-tab">
      <div className="images-head">
        <div>
          <h2>Głosy lektorów historyjek</h2>
          <p className="muted">
            Wybierz kilka głosów języka „{data.langName}” ({data.lang}) — damskich i męskich. Postacie w historyjkach
            dostaną różne głosy według płci. Urządzenie ucznia użyje tych głosów z listy, które ma; jeśli nie ma żadnego,
            postaci rozróżni wysokość głosu.
          </p>
        </div>
        {courses.length > 1 && (
          <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Kurs">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      <section className="admin-card">
        <h3>Wybrane głosy <span className="muted">— {fCount} {G_LABEL.f}ch, {mCount} {G_LABEL.m}ch</span></h3>
        {config.voices.length === 0 ? (
          <p className="muted">Nie wybrano jeszcze głosów — aplikacja dobiera je sama po nazwach. Dodaj głosy poniżej.</p>
        ) : (
          <ol className="voice-list">
            {config.voices.map((v, i) => {
              const dev = onDevice(v.name);
              return (
                <li key={v.name} className="voice-row">
                  <span className={`voice-g g-${v.gender}`} aria-hidden>{v.gender === 'f' ? '♀' : '♂'}</span>
                  <span className="voice-name">
                    <strong>{v.name}</strong>
                    <span className={dev ? 'ok-text' : 'muted'}>{dev ? 'dostępny w tej przeglądarce' : 'brak w tej przeglądarce — użyją go urządzenia, które go mają'}</span>
                  </span>
                  <div className="seg" role="radiogroup" aria-label={`Płeć głosu ${v.name}`}>
                    {(['f', 'm'] as VoiceGender[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={v.gender === g}
                        className={`seg-btn${v.gender === g ? ' on' : ''}`}
                        onClick={() => edit((c) => ({ ...c, voices: c.voices.map((x, j) => (j === i ? { ...x, gender: g } : x)) }))}
                      >
                        {G_LABEL[g]}
                      </button>
                    ))}
                  </div>
                  <span className="voice-actions">
                    {dev && (
                      <button type="button" className="icon-btn" aria-label={`Posłuchaj: ${v.name}`} onClick={() => void play(`pool-${v.name}`, data.stories[0]?.lines[0]?.[1] ?? 'Ciao!', dev.id)}>
                        <Icon name={playing === `pool-${v.name}` ? 'speaker' : 'play'} size={18} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" aria-label="Wyżej" disabled={i === 0} onClick={() => edit((c) => { const a = [...c.voices]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...c, voices: a }; })}>
                      <Icon name="back" size={16} className="rot-up" />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Usuń z listy" onClick={() => edit((c) => ({ ...c, voices: c.voices.filter((_, j) => j !== i) }))}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="muted small">Kolejność ma znaczenie: pierwsza postać danej płci dostaje pierwszy głos z listy, kolejna — następny.</p>
      </section>

      <section className="admin-card">
        <h3>Głosy w tej przeglądarce ({others.length})</h3>
        {device.length === 0 ? (
          <p className="muted">
            Ta przeglądarka nie ma głosów dla języka {data.lang}. Spróbuj w Edge (głosy „Online (Natural)”) lub Chrome,
            albo dopisz nazwę głosu ręcznie.
          </p>
        ) : others.length === 0 ? (
          <p className="muted">Wszystkie głosy tej przeglądarki są już na liście.</p>
        ) : (
          <ul className="voice-list">
            {others.map((d) => {
              const guess = voiceGender(d);
              return (
                <li key={d.id} className="voice-row">
                  <span className={`voice-g g-${guess ?? 'x'}`} aria-hidden>{guess === 'f' ? '♀' : guess === 'm' ? '♂' : '?'}</span>
                  <span className="voice-name">
                    <strong>{d.name}</strong>
                    <span className="muted">{d.lang}{guess ? ` · prawdopodobnie ${G_LABEL[guess]}` : ''}</span>
                  </span>
                  <span className="voice-actions">
                    <button type="button" className="icon-btn" aria-label={`Posłuchaj: ${d.name}`} onClick={() => void play(`dev-${d.id}`, data.stories[0]?.lines[0]?.[1] ?? 'Ciao!', d.id)}>
                      <Icon name={playing === `dev-${d.id}` ? 'speaker' : 'play'} size={18} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit((c) => ({ ...c, voices: [...c.voices, { name: d.name, gender: 'f' }] }))}>+ damski</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit((c) => ({ ...c, voices: [...c.voices, { name: d.name, gender: 'm' }] }))}>+ męski</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const name = manual.name.trim();
            if (!name || inPool(name)) return;
            edit((c) => ({ ...c, voices: [...c.voices, { name, gender: manual.gender }] }));
            setManual({ name: '', gender: manual.gender });
          }}
        >
          <input
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
            placeholder="Nazwa głosu z innego urządzenia, np. it-it-x-itd-local"
            aria-label="Nazwa głosu"
            maxLength={200}
          />
          <select value={manual.gender} onChange={(e) => setManual({ ...manual, gender: e.target.value as VoiceGender })} aria-label="Płeć głosu">
            <option value="f">damski</option>
            <option value="m">męski</option>
          </select>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={!manual.name.trim()}>Dodaj ręcznie</button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Postacie</h3>
        <p className="muted small">Płeć zgadujemy po imieniu i tytule (Signora → kobieta). Popraw, jeśli trzeba.</p>
        <ul className="speaker-grid">
          {data.speakers.map((sp) => {
            const set = config.speakers[sp.name];
            return (
              <li key={sp.name} className="speaker-item">
                <span className="voice-name">
                  <strong>{sp.name}</strong>
                  <span className="muted">{sp.count} kwestii</span>
                </span>
                <select
                  value={set ?? ''}
                  onChange={(e) => edit((c) => {
                    const speakers = { ...c.speakers };
                    if (e.target.value) speakers[sp.name] = e.target.value as VoiceGender;
                    else delete speakers[sp.name];
                    return { ...c, speakers };
                  })}
                  aria-label={`Płeć postaci ${sp.name}`}
                >
                  <option value="">automatycznie{sp.guess ? ` (${P_LABEL[sp.guess]})` : ' (nie wiadomo)'}</option>
                  <option value="f">kobieta</option>
                  <option value="m">mężczyzna</option>
                </select>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="admin-card">
        <h3>Historyjki</h3>
        <p className="muted small">
          Możesz przypisać postaci konkretny głos w danej historyjce. „Automatycznie” = według płci i kolejności z listy.
          Podgląd pokazuje, jak zabrzmi to w tej przeglądarce.
        </p>
        <div className="story-voice-grid">
          {data.stories.map((s) => {
            const assigned = preview.get(s.id);
            const fixed = config.stories[s.id] ?? {};
            return (
              <article key={s.id} className="story-voice-card">
                <header>
                  <span aria-hidden>{s.emoji}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <span className="muted small">{s.unitTitle}</span>
                  </div>
                  {playing === `story-${s.id}` ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Zatrzymaj</button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void playStory(s.id)} disabled={!!playing}>
                      <Icon name="play" size={16} /> Cały dialog
                    </button>
                  )}
                </header>
                <ul>
                  {s.speakers.map((sp) => {
                    const a = assigned?.get(sp.name);
                    return (
                      <li key={sp.name} className="story-voice-row">
                        <span className="voice-name">
                          <strong>{sp.name}</strong>
                          <span className="muted small">
                            {a?.voice ? a.voice.name : 'domyślny głos'}
                            {a && a.pitch !== 1 ? ` · wysokość ${a.pitch.toFixed(2)}` : ''}
                          </span>
                        </span>
                        <select
                          value={fixed[sp.name] ?? ''}
                          onChange={(e) => edit((c) => {
                            const m = { ...(c.stories[s.id] ?? {}) };
                            if (e.target.value) m[sp.name] = e.target.value;
                            else delete m[sp.name];
                            return { ...c, stories: { ...c.stories, [s.id]: m } };
                          })}
                          aria-label={`Głos postaci ${sp.name} w historyjce ${s.title}`}
                        >
                          <option value="">automatycznie</option>
                          {config.voices.map((v) => <option key={v.name} value={v.name}>{v.gender === 'f' ? '♀' : '♂'} {v.name}</option>)}
                        </select>
                        <button type="button" className="icon-btn" aria-label={`Posłuchaj: ${sp.name}`} onClick={() => void play(`sp-${s.id}-${sp.name}`, sp.sample, a?.voice?.id, a?.pitch)}>
                          <Icon name="play" size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <div className="voices-save">
        {msg && <p className={msg.ok ? 'admin-ok' : 'admin-errors'} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Zapisuję…' : dirty ? 'Zapisz ustawienia głosów' : 'Zapisane'}
        </button>
      </div>
    </div>
  );
}
