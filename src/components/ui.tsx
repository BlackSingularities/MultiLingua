import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../data/store.ts';
import { speak, stopSpeaking } from '../platform/speech.ts';
import { Icon } from './Icon.tsx';

/** Dźwięk i mikrofon: czy wolno ich teraz użyć i funkcja „przeczytaj na głos”. */
export function useSpeech() {
  const settings = useApp((s) => s.settings);
  const course = useApp((s) => s.course);
  const ttsOk = useApp((s) => s.ttsOk);
  const sttOk = useApp((s) => s.sttOk);
  const muteAudioUntil = useApp((s) => s.muteAudioUntil);
  const muteMicUntil = useApp((s) => s.muteMicUntil);
  const lang = course?.speechTarget ?? 'en-US';
  const now = Date.now();
  const audioOn = settings.listening && ttsOk !== false && now > muteAudioUntil;
  const micOn = settings.speaking && sttOk === true && now > muteMicUntil;
  const say = useCallback(
    (text: string, slow = false) =>
      speak(text, lang, { rate: settings.rate * (slow ? 0.6 : 1), voiceURI: settings.voices[lang] }).catch(() => {}),
    [lang, settings.rate, settings.voices],
  );
  return { audioOn, micOn, ttsOk, sttOk, say, lang };
}

export function SpeakButton({
  text, slow, size = 'md', autoPlay, label,
}: { text: string; slow?: boolean; size?: 'sm' | 'md' | 'lg'; autoPlay?: boolean; label?: string }) {
  const { say, ttsOk } = useSpeech();
  const autoplaySetting = useApp((s) => s.settings.autoplay);
  const [playing, setPlaying] = useState(false);
  const play = useCallback(async () => {
    setPlaying(true);
    await say(text, slow);
    setPlaying(false);
  }, [say, text, slow]);

  useEffect(() => {
    if (autoPlay && autoplaySetting && ttsOk !== false) void play();
    return () => stopSpeaking();
    // Odtwarzamy tylko przy pojawieniu się nowego tekstu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoPlay]);

  if (ttsOk === false) return null;
  return (
    <button
      type="button"
      className={`speak-btn speak-${size}${slow ? ' speak-slow' : ''}${playing ? ' is-playing' : ''}`}
      onClick={play}
      aria-label={label ?? (slow ? 'Odtwórz wolniej' : 'Odtwórz')}
      title={label ?? (slow ? 'Wolniej' : 'Odtwórz')}
    >
      <Icon name={slow ? 'turtle' : 'speaker'} size={size === 'lg' ? 34 : size === 'sm' ? 18 : 24} />
    </button>
  );
}

/** Tekst w języku docelowym z możliwością odsłuchania po kliknięciu. */
export function Say({ text, children, className }: { text: string; children?: ReactNode; className?: string }) {
  const { say, ttsOk } = useSpeech();
  if (ttsOk === false) return <span className={className}>{children ?? text}</span>;
  return (
    <button type="button" className={`say ${className ?? ''}`} onClick={() => void say(text)}>
      {children ?? text}
    </button>
  );
}

export function ProgressBar({ value, label, tone }: { value: number; label?: string; tone?: 'ok' | 'sun' | 'accent' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`bar bar-${tone ?? 'accent'}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

export function Toasts() {
  const toast = useApp((s) => s.toast);
  const [visible, setVisible] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const t = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!visible) return null;
  return (
    <div className="toast" role="status" key={visible.id}>
      {visible.text}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zamknij">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
