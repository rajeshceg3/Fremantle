// Offline WAV previews of the exact Fremantle ambience synthesis.
import { writeFileSync, mkdirSync } from 'fs';
import * as DSP from '../src/core/soundscape-dsp.js';
const SR = 44100, SECONDS = 45, MASTER = 0.45;
function resolveOut() {
  if (process.env.AUDIO_OUT) return process.env.AUDIO_OUT;
  try { mkdirSync('/downloads/fremantle-audio', { recursive: true }); return '/downloads/fremantle-audio'; } catch { return 'verification/output/fremantle-audio'; }
}
const OUT = resolveOut();
mkdirSync(OUT, { recursive: true });
import { PLACES } from '../src/core/AudioSystem.js';
const names = ['harbour','roundhouse','markets','beach'];
const BEDS = { surf: DSP.renderSurfLoop, wind: DSP.renderWindLoop };
const VOICES = { gull: DSP.renderGull, putter: DSP.renderPutter, rickshawBell: DSP.renderRickshawBell };
const rng = DSP.makeRng(20261111);
for (const [index, place] of PLACES.entries()) {
  const name=names[index], {beds,voices,voiceGap:gap}=place;
  const left = new Float32Array(SR * SECONDS), right = new Float32Array(SR * SECONDS);
  for (const bed of beds) {
    const d = BEDS[bed.type](SR, bed.params, rng);
    for (let i = 0; i < left.length; i++) { left[i] += d.left[i % d.left.length] * bed.gain; right[i] += d.right[i % d.right.length] * bed.gain; }
  }
  const total = voices.reduce((s, v) => s + v.weight, 0);
  let t = 1 + rng() * gap[0];
  while (t < SECONDS - 4) {
    let r = rng() * total, v = voices[voices.length - 1];
    for (const cand of voices) { r -= cand.weight; if (r <= 0) { v = cand; break; } }
    const data = VOICES[v.kind](SR, rng, v.params || {});
    const g = v.gain * (0.7 + rng() * 0.6), pan = rng() * 1.4 - 0.7;
    const gl = g * Math.min(1, 1 - pan * 0.5), gr = g * Math.min(1, 1 + pan * 0.5);
    const s0 = Math.floor(t * SR);
    for (let i = 0; i < data.length && s0 + i < left.length; i++) { left[s0 + i] += data[i] * gl; right[s0 + i] += data[i] * gr; }
    t += gap[0] + rng() * (gap[1] - gap[0]);
  }
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-1, Math.min(1, left[i] * MASTER)) * 32767, 44 + i * 4);
    buf.writeInt16LE(Math.max(-1, Math.min(1, right[i] * MASTER)) * 32767, 44 + i * 4 + 2);
  }
  writeFileSync(`${OUT}/fremantle-${name}.wav`, buf);
}
console.log('PASS rendered 4 Fremantle previews to', OUT);
