// Procedural soundscape DSP for the worlds fleet.
// Pure JS: every function renders Float32Array sample data with no WebAudio
// dependency, so the same code builds AudioBuffers in the browser and renders
// WAV previews + runs structural verification in Node (scripts/render-preview.mjs,
// verification/audio-structure.cjs). All sound is synthesized; no samples,
// no field recordings, no voice.

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// RBJ biquad, direct form 1. Returns a stateful sample processor.
export function biquad(type, f0, q, fs) {
  const w0 = 2 * Math.PI * f0 / fs, cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else throw new Error('unknown biquad ' + type);
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

export function normalize(a, peak = 1) {
  let m = 0;
  for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
  if (m > 0) { const g = peak / m; for (let i = 0; i < a.length; i++) a[i] *= g; }
  return a;
}

function normalizePair(l, r, peak) {
  let m = 0;
  for (let i = 0; i < l.length; i++) {
    const a = Math.abs(l[i]), b = Math.abs(r[i]);
    if (a > m) m = a; if (b > m) m = b;
  }
  if (m > 0) { const g = peak / m; for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; } }
}

// Irregular swell envelope in [0,1]: summed incommensurate sines, clipped and
// shaped so breakers arrive in groups like real surf rather than a metronome.
export function swellEnv(n, fs, period, rng, power = 1.6) {
  const a = new Float32Array(n);
  const ph1 = rng() * 6.2832, ph2 = rng() * 6.2832, ph3 = rng() * 6.2832;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let s = Math.sin(2 * Math.PI * t / period + ph1)
      + 0.55 * Math.sin(2 * Math.PI * t / (period * 2.63) + ph2)
      + 0.3 * Math.sin(2 * Math.PI * t / (period * 0.414) + ph3);
    s = Math.max(0, s / 1.85);
    a[i] = Math.pow(s, power);
  }
  return a;
}

// Fold a longer render into a seamless loop of `seconds`: the tail beyond the
// loop length is crossfaded over the head so sample N-1 runs into sample 0.
function foldLoop(long, n, x) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < x) { const w = i / x; out[i] = (1 - w) * long[n + i] + w * long[i]; }
    else out[i] = long[i];
  }
  return out;
}

// Surf loop: deep brown-noise wash plus a breaking-swash band that follows the
// swell envelope. params: {seconds, crossfade, period, lowpass, swash,
// swashFreq, power}. Stereo channels share the envelope but use independent
// noise, giving natural width without any pan trick.
export function renderSurfLoop(sampleRate, params, rng) {
  const seconds = params.seconds ?? 18, crossfade = params.crossfade ?? 1.5;
  const period = params.period ?? 9, lowpass = params.lowpass ?? 900;
  const swash = params.swash ?? 0.5, swashFreq = params.swashFreq ?? 700;
  const n = Math.round(seconds * sampleRate), x = Math.round(crossfade * sampleRate), N = n + x;
  const env = swellEnv(N, sampleRate, period, rng, params.power ?? 1.6);
  const longL = new Float32Array(N), longR = new Float32Array(N);
  for (const long of [longL, longR]) {
    const lp = biquad('lowpass', lowpass, 0.7, sampleRate);
    const bp = biquad('bandpass', swashFreq, 1.4, sampleRate);
    const tone = biquad('lowpass', params.tone ?? 2600, 0.6, sampleRate);
    let brown = 0;
    for (let i = 0; i < N; i++) {
      const w = rng() * 2 - 1;
      brown = 0.985 * brown + 0.015 * w;
      const body = lp(brown * 22);
      const hiss = bp(w) * (0.3 + 0.7 * env[i]);
      long[i] = tone(body * (0.5 + 0.5 * env[i]) + hiss * swash * Math.pow(env[i], 1.3));
    }
  }
  const left = foldLoop(longL, n, x), right = foldLoop(longR, n, x);
  // Level to a consistent loudness, then a gentle tanh limiter so swells
  // crest softly instead of clipping; keeps crest factor low and the bed
  // audible without being loud.
  let sum = 0;
  for (let i = 0; i < n; i++) sum += left[i] * left[i] + right[i] * right[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const g0 = 0.15 / rms;
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * g0 * 1.15) * 0.85;
    right[i] = Math.tanh(right[i] * g0 * 1.15) * 0.85;
  }
  return { left, right };
}

// Wind through palm fronds: band-limited hiss with slow gusts and a light
// leaf-flutter shimmer. Quieter and higher than the surf.
export function renderRustleLoop(sampleRate, params = {}, rng = makeRng(7)) {
  const seconds = params.seconds ?? 14, crossfade = params.crossfade ?? 1;
  const n = Math.round(seconds * sampleRate), x = Math.round(crossfade * sampleRate), N = n + x;
  const ph1 = rng() * 6.2832, ph2 = rng() * 6.2832;
  const longL = new Float32Array(N), longR = new Float32Array(N);
  for (const long of [longL, longR]) {
    const hp = biquad('highpass', 2000, 0.7, sampleRate);
    const lp = biquad('lowpass', 5200, 0.7, sampleRate);
    for (let i = 0; i < N; i++) {
      const t = i / sampleRate;
      let gust = Math.sin(2 * Math.PI * 0.061 * t + ph1) + 0.6 * Math.sin(2 * Math.PI * 0.113 * t + ph2);
      gust = Math.pow(Math.max(0, gust / 1.6), 2.4);
      const flutter = 0.85 + 0.15 * Math.sin(2 * Math.PI * 11 * t + ph2 * 3);
      long[i] = lp(hp(rng() * 2 - 1)) * gust * flutter;
    }
  }
  const left = foldLoop(longL, n, x), right = foldLoop(longR, n, x);
  normalizePair(left, right, 0.5);
  return { left, right };
}

// Asian koel: a rising two-note "ku-oo", repeated a few times, low-passed to
// sit far away in the mix. Mono; pan at runtime.
export function renderKoel(sampleRate, rng) {
  const calls = 2 + Math.floor(rng() * 2);
  const sr = sampleRate;
  const callLen = Math.round(1.05 * sr), gap = Math.round(0.35 * sr);
  const a = new Float32Array(calls * callLen + gap * (calls - 1) + Math.round(0.4 * sr));
  const base = 640 + rng() * 80;
  for (let c = 0; c < calls; c++) {
    const off = c * (callLen + gap);
    const notes = [
      { start: 0.0, dur: 0.28, f0: base, f1: base * 1.38 },
      { start: 0.36, dur: 0.34, f0: base * 1.16, f1: base * 1.6 },
    ];
    for (const nt of notes) {
      const s0 = off + Math.round(nt.start * sr), len = Math.round(nt.dur * sr);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, f = nt.f0 + (nt.f1 - nt.f0) * t;
        ph += 2 * Math.PI * f / sr;
        const env = Math.min(1, i / (0.03 * sr)) * Math.pow(1 - t, 1.4);
        a[s0 + i] += (Math.sin(ph) + 0.22 * Math.sin(2 * ph)) * env * 0.5;
      }
    }
  }
  const lp = biquad('lowpass', 3200, 0.7, sr);
  for (let i = 0; i < a.length; i++) a[i] = lp(a[i]);
  return normalize(a, 0.5);
}

// Brown-headed / Heuglin's type gull: descending nasal "kyow", 1-3 cries.
export function renderGull(sampleRate, rng) {
  const cries = 1 + Math.floor(rng() * 2.4);
  const sr = sampleRate;
  const cryLen = Math.round(0.4 * sr), gap = Math.round(0.28 * sr);
  const a = new Float32Array(cries * cryLen + gap * (cries - 1) + Math.round(0.2 * sr));
  for (let c = 0; c < cries; c++) {
    const off = c * (cryLen + gap), len = Math.round(0.36 * sr);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, f = 1380 - 560 * Math.pow(t, 0.8);
      ph += 2 * Math.PI * f / sr;
      const am = 0.7 + 0.3 * Math.sin(2 * Math.PI * 27 * i / sr);
      const env = Math.min(1, i / (0.02 * sr)) * Math.pow(1 - t, 1.1);
      a[off + i] += (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph)) * env * am * 0.45;
    }
  }
  const hp = biquad('highpass', 500, 0.7, sr), lp = biquad('lowpass', 3400, 0.7, sr);
  for (let i = 0; i < a.length; i++) a[i] = lp(hp(a[i]));
  return normalize(a, 0.45);
}

// Distant houseboat diesel: a soft chug at ~6 Hz over a 55 Hz hum, very low in
// the mix. Used only for backwater scenes, fading in and out like a passing boat.
export function renderPutter(sampleRate, rng) {
  const sr = sampleRate, seconds = 7, n = seconds * sr;
  const a = new Float32Array(n);
  const chugRate = 5.5 + rng() * 1.5;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += 2 * Math.PI * 55 / sr;
    const chug = Math.pow(Math.max(0, Math.sin(2 * Math.PI * chugRate * t)), 3);
    const fade = Math.min(1, t / 2.5) * Math.min(1, (seconds - t) / 2.5);
    a[i] = (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph)) * (0.25 + 0.75 * chug) * fade;
  }
  const lp = biquad('lowpass', 240, 0.8, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.4);
}

// --- Extended voices: wind beds, bells, desert and city birds ---

// Open wind bed: brown noise through a slowly wandering lowpass with gusts,
// plus optional gust-correlated sand hiss for desert scenes.
// params: {seconds, crossfade, baseCutoff, wander, gustRate, gustDepth, sand}
export function renderWindLoop(sampleRate, params = {}, rng = makeRng(11)) {
  const seconds = params.seconds ?? 20, crossfade = params.crossfade ?? 1.5;
  const base = params.baseCutoff ?? 500, wander = params.wander ?? 300;
  const gustRate = params.gustRate ?? 0.07, gustDepth = params.gustDepth ?? 0.8;
  const sand = params.sand ?? 0;
  const n = Math.round(seconds * sampleRate), x = Math.round(crossfade * sampleRate), N = n + x;
  const ph1 = rng() * 6.2832, ph2 = rng() * 6.2832, ph3 = rng() * 6.2832;
  const longL = new Float32Array(N), longR = new Float32Array(N);
  for (const long of [longL, longR]) {
    const lp = biquad('lowpass', base, 0.7, sampleRate);
    const hp = biquad('highpass', 4000, 0.7, sampleRate);
    const sandLp = biquad('lowpass', 8000, 0.7, sampleRate);
    let brown = 0;
    for (let i = 0; i < N; i++) {
      const t = i / sampleRate;
      let gust = Math.sin(2 * Math.PI * gustRate * t + ph1) + 0.6 * Math.sin(2 * Math.PI * gustRate * 1.73 * t + ph2) + 0.35 * Math.sin(2 * Math.PI * gustRate * 3.1 * t + ph3);
      gust = Math.pow(Math.max(0, gust / 1.95), 1.8);
      const w = rng() * 2 - 1;
      brown = 0.992 * brown + 0.008 * w;
      const body = lp(brown * 30);
      long[i] = body * (1 - gustDepth + gustDepth * gust) + sandLp(hp(w)) * sand * gust;
    }
  }
  const left = foldLoop(longL, n, x), right = foldLoop(longR, n, x);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += left[i] * left[i] + right[i] * right[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1, g0 = 0.13 / rms;
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * g0 * 1.15) * 0.85;
    right[i] = Math.tanh(right[i] * g0 * 1.15) * 0.85;
  }
  return { left, right };
}

// Temple bell: inharmonic partials with staggered decays. One strike.
export function renderBell(sampleRate, rng, opts = {}) {
  const base = opts.base ?? 320;
  const sr = sampleRate, dur = 4.5, n = Math.round(dur * sr);
  const a = new Float32Array(n);
  const partials = [[1, 1], [2.01, 0.55], [2.74, 0.35], [3.76, 0.28], [5.4, 0.16]];
  const lpCut = opts.lowpass ?? 2600;
  const f0 = base * (0.97 + rng() * 0.06);
  for (const [ratio, amp] of partials) {
    let ph = rng() * 6.2832;
    const f = f0 * ratio, decay = 0.9 + ratio * 0.5;
    for (let i = 0; i < n; i++) {
      ph += 2 * Math.PI * f / sr;
      const t = i / sr;
      a[i] += Math.sin(ph) * amp * Math.exp(-decay * t);
    }
  }
  const lp = biquad('lowpass', lpCut, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.42);
}

// Camel bells: a slow irregular walk of small metallic clanks.
export function renderCamelBells(sampleRate, rng) {
  const sr = sampleRate, dur = 6, n = Math.round(dur * sr);
  const a = new Float32Array(n);
  const strikes = 3 + Math.floor(rng() * 3);
  let t = 0.4 + rng() * 0.6;
  for (let s = 0; s < strikes; s++) {
    const f0 = 2300 * (0.9 + rng() * 0.25), start = Math.round(t * sr), len = Math.round(0.5 * sr);
    let ph = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      ph += 2 * Math.PI * f0 / sr;
      const tt = i / sr;
      a[start + i] += (Math.sin(ph) + 0.5 * Math.sin(ph * 2.76) + 0.25 * Math.sin(ph * 5.1)) * Math.exp(-9 * tt) * 0.4;
    }
    t += 0.7 + rng() * 1.3;
  }
  const lp = biquad('lowpass', 6000, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.35);
}

// Rickshaw bell: two quick bright dings.
export function renderRickshawBell(sampleRate, rng, opts = {}) {
  const baseF = opts.base ?? 1750;
  const sr = sampleRate, n = Math.round(1.2 * sr);
  const a = new Float32Array(n);
  for (const off of [0, Math.round(0.22 * sr)]) {
    const f0 = baseF * (0.96 + rng() * 0.08);
    let ph = 0;
    const len = Math.round(0.35 * sr);
    for (let i = 0; i < len && off + i < n; i++) {
      ph += 2 * Math.PI * f0 / sr;
      const t = i / sr;
      a[off + i] += (Math.sin(ph) + 0.6 * Math.sin(ph * 3.1) + 0.3 * Math.sin(ph * 5.4)) * Math.exp(-14 * t) * 0.5;
    }
  }
  return normalize(a, 0.3);
}

// Dove/pigeon coo: soft low two-three note phrase.
export function renderDove(sampleRate, rng) {
  const sr = sampleRate, n = Math.round(1.6 * sr);
  const a = new Float32Array(n);
  const base = 340 + rng() * 60;
  const notes = [[0.0, 0.22, base, base * 1.12], [0.28, 0.3, base * 1.1, base * 0.94], [0.66, 0.24, base, base * 1.06]];
  for (const [st, dur, f0, f1] of notes) {
    const off = Math.round(st * sr), len = Math.round(dur * sr);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, f = f0 + (f1 - f0) * t;
      ph += 2 * Math.PI * f / sr;
      const vib = 1 + 0.012 * Math.sin(2 * Math.PI * 9 * i / sr);
      const env = Math.min(1, i / (0.03 * sr)) * Math.pow(1 - t, 1.5);
      a[off + i] += Math.sin(ph * vib) * env * 0.5;
    }
  }
  const lp = biquad('lowpass', 1500, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.4);
}

// Black kite: a shrill descending whinny, common over north-Indian forts.
export function renderKite(sampleRate, rng) {
  const sr = sampleRate, n = Math.round(1.4 * sr);
  const a = new Float32Array(n);
  const len = Math.round(1.1 * sr);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const f = 2150 - 750 * Math.pow(t, 0.7);
    ph += 2 * Math.PI * f / sr;
    const trill = 0.65 + 0.35 * Math.sin(2 * Math.PI * (18 + 22 * t) * i / sr);
    const env = Math.min(1, i / (0.04 * sr)) * Math.pow(1 - t, 1.2);
    a[i] = (Math.sin(ph) + 0.2 * Math.sin(2 * ph)) * env * trill * 0.5;
  }
  const hp = biquad('highpass', 900, 0.7, sr), lp = biquad('lowpass', 4200, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(hp(a[i]));
  return normalize(a, 0.4);
}

// Savannah nightjar: a sustained soft churr, several seconds, low and far.
export function renderNightjar(sampleRate, rng) {
  const sr = sampleRate, dur = 3.5 + rng() * 2.5, n = Math.round(dur * sr);
  const a = new Float32Array(n);
  const f0 = 560 + rng() * 60, trillRate = 38 + rng() * 8;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.01 * Math.sin(2 * Math.PI * 0.3 * t));
    ph += 2 * Math.PI * f / sr;
    const trill = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * trillRate * t), 1.5);
    const env = Math.min(1, t / 0.6) * Math.min(1, (dur - t) / 0.8);
    a[i] = (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * (0.25 + 0.75 * trill) * env;
  }
  const lp = biquad('lowpass', 1800, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.38);
}

// Common cuckoo: hollow two-note "cu-coo", a falling minor third, iconic in
// Galician pine and eucalyptus woods. One phrase, 2-4 pairs.
export function renderCuckoo(sampleRate, rng) {
  const sr = sampleRate;
  const pairs = 2 + Math.floor(rng() * 2.5);
  const pairLen = Math.round(0.62 * sr), gap = Math.round(0.5 * sr);
  const a = new Float32Array(pairs * pairLen + gap * (pairs - 1) + Math.round(0.3 * sr));
  const base = 700 + rng() * 60;
  for (let c = 0; c < pairs; c++) {
    const off = c * (pairLen + gap);
    const notes = [[0.0, 0.24, base], [0.3, 0.28, base * 0.794]]; // down a minor third
    for (const [st, dur, f] of notes) {
      const s0 = off + Math.round(st * sr), len = Math.round(dur * sr);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ph += 2 * Math.PI * f * (1 - 0.02 * t) / sr;
        const env = Math.min(1, i / (0.025 * sr)) * Math.pow(1 - t, 1.3);
        a[s0 + i] += (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * env * 0.5;
      }
    }
  }
  const lp = biquad('lowpass', 2200, 0.7, sr);
  for (let i = 0; i < a.length; i++) a[i] = lp(a[i]);
  return normalize(a, 0.42);
}

// Coppersmiths of Seffarine: a short work rhythm of small metallic taps on
// brass, in uneven groups, never a tune.
export function renderCoppersmith(sampleRate, rng) {
  const sr = sampleRate, dur = 5, n = Math.round(dur * sr);
  const a = new Float32Array(n);
  let t = 0.3 + rng() * 0.5;
  while (t < dur - 0.5) {
    const group = 2 + Math.floor(rng() * 3);
    for (let s = 0; s < group; s++) {
      const f0 = 2900 * (0.92 + rng() * 0.2), start = Math.round(t * sr), len = Math.round(0.22 * sr);
      let ph = 0;
      for (let i = 0; i < len && start + i < n; i++) {
        ph += 2 * Math.PI * f0 / sr;
        const tt = i / sr;
        a[start + i] += (Math.sin(ph) + 0.45 * Math.sin(ph * 2.4) + 0.2 * Math.sin(ph * 4.3)) * Math.exp(-22 * tt) * 0.35;
      }
      t += 0.24 + rng() * 0.12;
    }
    t += 0.6 + rng() * 1.4;
  }
  const lp = biquad('lowpass', 7000, 0.7, sr);
  for (let i = 0; i < n; i++) a[i] = lp(a[i]);
  return normalize(a, 0.3);
}
