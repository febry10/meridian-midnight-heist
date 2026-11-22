// All sound is synthesized with WebAudio: no audio files, no network.
// The context is created lazily on the first user gesture; screenshot runs
// never touch it, so staging a shot stays silent and error-free.

let context = null;
let master = null;
let alarmNodes = null;

function ensureContext() {
  if (context) return context;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.35;
    master.connect(context.destination);
  } catch {
    context = null;
  }
  return context;
}

/** Call from a user gesture so the browser lets audio start. */
export function unlockAudio() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function tone(freq, dur, type, volume, slideTo) {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {
    // Audio is decoration; a failure must never break the game.
  }
}

function noiseBurst(dur, volume, filterFreq) {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  } catch {
    // Audio is decoration; a failure must never break the game.
  }
}

export const sfx = {
  step() { tone(140, 0.05, 'triangle', 0.08, 90); },
  pickup() { tone(880, 0.09, 'sine', 0.22, 1320); },
  drillTick() { noiseBurst(0.12, 0.16, 900); },
  vaultOpen() { tone(220, 0.4, 'sawtooth', 0.14, 440); tone(660, 0.5, 'sine', 0.18, 990); },
  emp() { tone(1200, 0.5, 'sawtooth', 0.16, 80); },
  spotted() { tone(520, 0.18, 'square', 0.2, 780); },
  caught() { tone(330, 0.5, 'sawtooth', 0.24, 110); },
  click() { tone(600, 0.05, 'sine', 0.14); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sine', 0.2), i * 130)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.18), i * 160)); },
};

/** A two-tone siren while the alarm is high; started and stopped by the game. */
export function setAlarmSiren(on) {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    if (on && !alarmNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 700;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      alarmNodes = { osc, lfo, gain };
    } else if (!on && alarmNodes) {
      alarmNodes.osc.stop();
      alarmNodes.lfo.stop();
      alarmNodes.gain.disconnect();
      alarmNodes = null;
    }
  } catch {
    alarmNodes = null;
  }
}
