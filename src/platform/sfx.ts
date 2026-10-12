// Krótkie efekty dźwiękowe syntezowane w locie (bez plików audio).
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.14) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  correct() {
    tone(659.25, 0, 0.16, 'triangle');
    tone(987.77, 0.08, 0.24, 'triangle');
  },
  wrong() {
    tone(196, 0, 0.22, 'square', 0.06);
    tone(164.81, 0.1, 0.28, 'square', 0.05);
  },
  tap() {
    tone(880, 0, 0.05, 'sine', 0.05);
  },
  complete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.12));
  },
  stamp() {
    tone(120, 0, 0.12, 'sine', 0.25);
    tone(90, 0.02, 0.2, 'triangle', 0.12);
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* brak wsparcia */
  }
}
