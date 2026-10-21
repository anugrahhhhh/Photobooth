// Suara lewat Web Audio. AudioContext dibuat lazy saat unlock() (butuh gestur pengguna).
import { KEYS, read, write } from './storage.js';

export const TICK_HZ = 880;
export const LAST_HZ = 1320;
export const BEEP_MS = 80;
const SHUTTER_MS = 120;

let audio = null;
let enabled = null; // null = belum ditentukan, dihitung saat pertama dipakai
let settingsRef = null;

export function soundEnabled({ stored, settingDefault }) {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return settingDefault === 1;
}

export function initSound(settings) {
  settingsRef = settings;
}

// Tidak disimpan di memori kecuali pengguna memilih: bawaan pengaturan server menyusul belakangan.
export function isEnabled() {
  return enabled ?? soundEnabled({ stored: read(KEYS.sound), settingDefault: settingsRef?.sound_default });
}

export function setEnabled(on, { persist = true } = {}) {
  enabled = Boolean(on);
  if (persist) write(KEYS.sound, enabled ? '1' : '0');
}

export function unlock() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
}

const ready = () => audio && audio.state !== 'closed' && isEnabled();

export function beep(last = false) {
  if (!ready()) return;
  try {
    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = last ? LAST_HZ : TICK_HZ;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + BEEP_MS / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + BEEP_MS / 1000 + 0.02);
  } catch {
    // tanpa suara
  }
}

export function shutter() {
  if (!ready()) return;
  try {
    const len = Math.round(audio.sampleRate * (SHUTTER_MS / 1000));
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    const gain = audio.createGain();
    const t0 = audio.currentTime;
    src.buffer = buf;
    gain.gain.setValueAtTime(0.6, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + SHUTTER_MS / 1000);
    src.connect(gain).connect(audio.destination);
    src.start(t0);
  } catch {
    // tanpa suara
  }
}
