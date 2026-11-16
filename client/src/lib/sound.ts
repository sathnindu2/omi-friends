/**
 * Original sound effects, synthesised with the Web Audio API (no audio files,
 * no copyright concerns). Audio only starts after the first user tap, which
 * respects mobile autoplay rules.
 */
export type SoundName = 'shuffle' | 'deal' | 'play' | 'trick' | 'trump' | 'kapothi' | 'win' | 'turn' | 'error';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Call from a user gesture (first click/tap). */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.2, filterFreq = 2500) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

export function playSound(name: SoundName) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  switch (name) {
    case 'shuffle':
      for (let i = 0; i < 9; i++) noise(i * 0.045, 0.04, 0.12, 1800 + i * 120);
      break;
    case 'deal':
      for (let i = 0; i < 4; i++) noise(i * 0.07, 0.05, 0.12, 3000);
      break;
    case 'play':
      noise(0, 0.07, 0.25, 2200);
      tone(180, 0, 0.06, 'triangle', 0.05);
      break;
    case 'turn':
      tone(880, 0, 0.12, 'sine', 0.06);
      break;
    case 'trick':
      tone(660, 0, 0.12, 'triangle', 0.1);
      tone(880, 0.1, 0.18, 'triangle', 0.1);
      break;
    case 'trump':
      tone(523, 0, 0.15, 'triangle', 0.12);
      tone(659, 0.12, 0.15, 'triangle', 0.12);
      tone(784, 0.24, 0.3, 'triangle', 0.12);
      break;
    case 'kapothi':
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.25, 'square', 0.06));
      break;
    case 'win':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.16, 0.4, 'triangle', 0.12));
      tone(1047, 0.85, 0.9, 'sine', 0.1);
      break;
    case 'error':
      tone(200, 0, 0.15, 'sawtooth', 0.05);
      break;
  }
}
