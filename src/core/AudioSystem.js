// Fremantle working-water ambience, synthesized in the browser: harbour lap,
// gulls, a fishing-boat putter, rigging clinks, market-hall air, and open
// surf at Bathers Beach. No samples, no voice, no song, no melody - nothing
// is tied to words. Sound is opt-in through the Sound button; the same
// button suspends the context. The mix follows the place being viewed.
import * as DSP from "./soundscape-dsp.js";

export const PLACES = [
  { // Fishing Boat Harbour: working water, boats, rigging.
    beds: [
      { type: "surf", params: { period: 5, lowpass: 850, swash: 0.5, swashFreq: 750 }, gain: 0.45 },
      { type: "wind", params: { baseCutoff: 520 }, gain: 0.15 },
    ],
    voices: [
      { kind: "gull", weight: 0.5, gain: 0.12 },
      { kind: "putter", weight: 0.8, gain: 0.14 },
      { kind: "rickshawBell", weight: 0.35, gain: 0.07, params: { base: 2600 } },
    ],
    voiceGap: [10, 26],
  },
  { // The Round House: limestone above the sea; wind and far water.
    beds: [
      { type: "wind", params: { baseCutoff: 700, gustDepth: 0.9 }, gain: 0.45 },
      { type: "surf", params: { period: 9, lowpass: 420, swash: 0.3 }, gain: 0.2 },
    ],
    voices: [{ kind: "gull", weight: 0.6, gain: 0.1 }],
    voiceGap: [14, 34],
  },
  { // Fremantle Markets: brick hall air, light clinks, a gull from outside.
    beds: [{ type: "wind", params: { baseCutoff: 240, gustDepth: 0.3, gustRate: 0.05 }, gain: 0.55 }],
    voices: [
      { kind: "rickshawBell", weight: 0.5, gain: 0.06, params: { base: 2100 } },
      { kind: "gull", weight: 0.2, gain: 0.05 },
    ],
    voiceGap: [12, 30],
  },
  { // Bathers Beach: open evening surf.
    beds: [
      { type: "surf", params: { period: 8, lowpass: 1100, swash: 0.6, swashFreq: 900 }, gain: 0.55 },
      { type: "wind", params: { baseCutoff: 620 }, gain: 0.2 },
    ],
    voices: [{ kind: "gull", weight: 0.7, gain: 0.11 }],
    voiceGap: [12, 30],
  },
];

const BEDS = { surf: DSP.renderSurfLoop, wind: DSP.renderWindLoop };
const VOICES = {
  gull: DSP.renderGull,
  putter: DSP.renderPutter,
  rickshawBell: DSP.renderRickshawBell,
};

export class AudioSystem {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.realm = 0;
    this.paused = false;
    this.rng = DSP.makeRng(20261111);
    this.buffers = {};
    this.liveBeds = [];
    this.voiceTimer = 0;
  }
  async toggle() {
    if (!this.context) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) throw Error("Audio is not supported in this browser.");
      this.context = new C();
      this.master = this.context.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.context.destination);
    }
    this.enabled = !this.enabled;
    if (this.enabled) this.startPlace(this.realm);
    else this.stopVoices();
    await this.sync();
    return this.enabled;
  }
  bedBuffer(placeIdx, bedIdx, bed) {
    const key = placeIdx + ":" + bedIdx;
    if (this.buffers[key]) return this.buffers[key];
    const sr = this.context.sampleRate;
    const d = BEDS[bed.type](sr, bed.params, this.rng);
    const b = this.context.createBuffer(2, d.left.length, sr);
    b.getChannelData(0).set(d.left);
    b.getChannelData(1).set(d.right);
    this.buffers[key] = b;
    return b;
  }
  startPlace(i) {
    const c = this.context, t = c.currentTime;
    for (const old of this.liveBeds) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 2);
      setTimeout(() => { try { old.src.stop(); } catch {} }, 2600);
    }
    this.liveBeds = PLACES[i].beds.map((bed, bi) => {
      const src = c.createBufferSource();
      src.buffer = this.bedBuffer(i, bi, bed);
      src.loop = true;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(bed.gain, t + 2);
      src.connect(g);
      g.connect(this.master);
      src.start();
      return { src, gain: g };
    });
    this.scheduleVoice(i);
  }
  pickVoice(i) {
    const vs = PLACES[i].voices;
    let total = 0;
    for (const v of vs) total += v.weight;
    let r = this.rng() * total;
    for (const v of vs) { r -= v.weight; if (r <= 0) return v; }
    return vs[vs.length - 1];
  }
  playVoice(i) {
    const v = this.pickVoice(i);
    const data = VOICES[v.kind](this.context.sampleRate, this.rng, v.params || {});
    const b = this.context.createBuffer(1, data.length, this.context.sampleRate);
    b.getChannelData(0).set(data);
    const src = this.context.createBufferSource();
    src.buffer = b;
    const g = this.context.createGain();
    g.gain.value = v.gain * (0.7 + this.rng() * 0.6);
    if (this.context.createStereoPanner) {
      const pan = this.context.createStereoPanner();
      pan.pan.value = this.rng() * 1.4 - 0.7;
      src.connect(g); g.connect(pan); pan.connect(this.master);
    } else { src.connect(g); g.connect(this.master); }
    src.start();
  }
  scheduleVoice(i) {
    this.stopVoices();
    if (!this.enabled) return;
    const [lo, hi] = PLACES[i].voiceGap || [20, 45];
    this.voiceTimer = setTimeout(() => {
      if (this.enabled && this.context && this.context.state === "running") this.playVoice(this.realm);
      this.scheduleVoice(this.realm);
    }, (lo + this.rng() * (hi - lo)) * 1000);
  }
  stopVoices() { clearTimeout(this.voiceTimer); }
  async sync() {
    if (!this.context) return;
    if (this.enabled && !this.paused && !document.hidden)
      await this.context.resume();
    else await this.context.suspend();
  }
  updateVolumes(i) {
    if (this.realm === i && this.enabled && this.liveBeds.length) return;
    this.realm = i;
    if (!this.context || !this.enabled) return;
    this.startPlace(i);
  }
}
