import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, type Theme } from '../data/store.ts';
import { db, USER_TABLES } from '../data/db.ts';
import { isNative } from '../platform/native.ts';
import { speak, voicesFor } from '../platform/speech.ts';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/ui.tsx';

const GOALS = [10, 20, 30, 50];

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const course = useApp((s) => s.course);
  const notify = useApp((s) => s.notify);
  const ttsOk = useApp((s) => s.ttsOk);
  const sttOk = useApp((s) => s.sttOk);
  const reloadProgress = useApp((s) => s.reloadProgress);
  const navigate = useNavigate();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lang = course?.speechTarget;

  useEffect(() => {
    if (!lang || isNative) return;
    void voicesFor(lang).then(setVoices);
  }, [lang]);

  const toggle = (k: 'sound' | 'listening' | 'speaking' | 'autoplay' | 'hard') => void update({ [k]: !settings[k] });

  const exportData = async () => {
    const dump: Record<string, unknown[]> = {};
    for (const t of USER_TABLES) dump[t] = await db.table(t).toArray();
    const json = JSON.stringify({ app: 'multilingua', version: 1, exportedAt: new Date().toISOString(), data: dump });
    const name = `multilingua-postepy-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (isNative && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Kopia postępów MultiLingua' }).catch(() => {});
      return;
    }
    if (isNative) {
      await navigator.clipboard.writeText(json);
      notify('Skopiowano kopię postępów do schowka.');
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text()) as { app?: string; data?: Record<string, unknown[]> };
      if (parsed.app !== 'multilingua' || !parsed.data) throw new Error('To nie jest plik kopii MultiLingua.');
      await db.transaction('rw', USER_TABLES.map((t) => db.table(t)), async () => {
        for (const t of USER_TABLES) {
          await db.table(t).clear();
          if (Array.isArray(parsed.data![t])) await db.table(t).bulkAdd(parsed.data![t]);
        }
      });
      notify('Przywrócono postępy z kopii.');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Nie udało się wczytać pliku.');
    }
  };

  const reset = async () => {
    await db.transaction('rw', USER_TABLES.map((t) => db.table(t)), async () => {
      for (const t of USER_TABLES) if (t !== 'settings') await db.table(t).clear();
    });
    await reloadProgress();
    setConfirmReset(false);
    notify('Postępy zostały wyzerowane.');
    navigate('/');
  };

  return (
    <div className="settings">
      <h1 className="page-title">Ustawienia</h1>

      <section className="panel">
        <h2 className="section-title">Nauka</h2>
        <div className="setting">
          <div>
            <p className="setting-name">Dzienny cel</p>
            <p className="setting-desc">Ile punktów XP chcesz zdobywać każdego dnia.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Dzienny cel">
            {GOALS.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={settings.dailyGoal === g} className={`seg-btn${settings.dailyGoal === g ? ' on' : ''}`} onClick={() => void update({ dailyGoal: g })}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <Switch name="Tryb wymagający" desc="Mniej wybierania z listy, więcej samodzielnego pisania." on={settings.hard} onToggle={() => toggle('hard')} />
      </section>

      <section className="panel">
        <h2 className="section-title">Dźwięk i mowa</h2>
        <Switch name="Efekty dźwiękowe" desc="Krótki sygnał po dobrej i złej odpowiedzi." on={settings.sound} onToggle={() => toggle('sound')} />
        <Switch
          name="Ćwiczenia ze słuchu"
          desc={ttsOk === false ? 'To urządzenie nie ma głosu dla tego języka — zainstaluj go w ustawieniach systemu (synteza mowy).' : 'Dyktanda i pytania „co słyszysz?”.'}
          on={settings.listening}
          onToggle={() => toggle('listening')}
        />
        <Switch name="Automatyczne odtwarzanie" desc="Czytaj na głos nowe słowa i zdania." on={settings.autoplay} onToggle={() => toggle('autoplay')} />
        <Switch
          name="Ćwiczenia z mówienia"
          desc={sttOk === false ? 'Brak rozpoznawania mowy — mówienie działa w trybie nagraj i porównaj.' : 'Rozpoznawanie mowy ocenia Twoją wymowę.'}
          on={settings.speaking}
          onToggle={() => toggle('speaking')}
        />
        <div className="setting">
          <div>
            <p className="setting-name">Tempo mowy</p>
            <p className="setting-desc">{Math.round(settings.rate * 100)}% normalnej prędkości</p>
          </div>
          <div className="rate-row">
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.05}
              value={settings.rate}
              onChange={(e) => void update({ rate: Number(e.target.value) })}
              aria-label="Tempo mowy"
            />
            {lang && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Posłuchaj próbki"
                onClick={() => void speak(course!.units[0]?.sentences[0]?.t ?? 'Ciao', lang, { rate: settings.rate, voiceURI: settings.voices[lang] })}
              >
                <Icon name="speaker" />
              </button>
            )}
          </div>
        </div>
        {voices.length > 1 && lang && (
          <div className="setting">
            <div>
              <p className="setting-name">Głos lektora</p>
              <p className="setting-desc">Głosy dostępne w tej przeglądarce.</p>
            </div>
            <select value={settings.voices[lang] ?? voices[0].voiceURI} onChange={(e) => void update({ voices: { ...settings.voices, [lang]: e.target.value } })}>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Wygląd</h2>
        <div className="setting">
          <p className="setting-name">Motyw</p>
          <div className="seg" role="radiogroup" aria-label="Motyw">
            {(
              [
                ['system', 'Systemowy'],
                ['light', 'Jasny'],
                ['dark', 'Ciemny'],
              ] as [Theme, string][]
            ).map(([t, label]) => (
              <button key={t} type="button" role="radio" aria-checked={settings.theme === t} className={`seg-btn${settings.theme === t ? ' on' : ''}`} onClick={() => void update({ theme: t })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Twoje dane</h2>
        <p className="muted small">
          Postępy są zapisane tylko na tym urządzeniu. Zrób kopię, żeby przenieść je na inne urządzenie albo zabezpieczyć przed wyczyszczeniem przeglądarki.
        </p>
        <div className="data-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void exportData()}>
            <Icon name="download" size={18} /> Zapisz kopię postępów
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Wczytaj kopię
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            <Icon name="trash" size={18} /> Wyzeruj postępy
          </button>
        </div>
      </section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Wyzerować postępy?">
        <p>Usuniesz ukończone lekcje, powtórki, statystyki i serię dni we wszystkich kursach. Ustawienia zostaną. Tej operacji nie da się cofnąć.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)} autoFocus>
            Anuluj
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void reset()}>
            Wyzeruj
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Switch({ name, desc, on, onToggle }: { name: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="setting">
      <div>
        <p className="setting-name">{name}</p>
        <p className="setting-desc">{desc}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={name} className={`switch${on ? ' on' : ''}`} onClick={onToggle}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}
