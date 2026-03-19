const horizon = document.getElementById('horizon');
const experience = document.getElementById('experience');
const microcopy = document.getElementById('microcopy');
const finalLine = document.getElementById('finalLine');
const shimmer = document.getElementById('waterShimmer');
const whisperTriggers = Array.from(document.querySelectorAll('.whisper-trigger'));

let lastInteraction = Date.now();
let reflectionTimer;
let audioCtx;
let audioStarted = false;
let audioLayers;

const colorKeyframes = [
  {
    at: 0,
    colors: ['#d7c7af', '#8ea0a6', '#5f7d8a', '#2e3a4f']
  },
  {
    at: 0.42,
    colors: ['#c9b79c', '#5f7d8a', '#60584f', '#2e3a4f']
  },
  {
    at: 0.62,
    colors: ['#c2ad90', '#85745f', '#73523a', '#2e3a4f']
  },
  {
    at: 0.78,
    colors: ['#b79f82', '#845f44', '#4b3f3f', '#253346']
  },
  {
    at: 1,
    colors: ['#ac9477', '#6d4f40', '#32323d', '#1f2735']
  }
];

setTimeout(() => horizon.classList.add('revealed'), 6800);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const safeHex = hex.replace('#', '');
  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16)
  };
}

function mixColor(from, to, amount) {
  const left = hexToRgb(from);
  const right = hexToRgb(to);
  return `rgb(${Math.round(left.r + (right.r - left.r) * amount)}, ${Math.round(left.g + (right.g - left.g) * amount)}, ${Math.round(left.b + (right.b - left.b) * amount)})`;
}

function gradientFor(progress) {
  let current = colorKeyframes[0];
  let next = colorKeyframes[colorKeyframes.length - 1];

  for (let i = 0; i < colorKeyframes.length - 1; i += 1) {
    const frame = colorKeyframes[i];
    const frameNext = colorKeyframes[i + 1];
    if (progress >= frame.at && progress <= frameNext.at) {
      current = frame;
      next = frameNext;
      break;
    }
  }

  const amount = smoothstep(current.at, next.at, progress);
  const mixed = current.colors.map((color, index) => mixColor(color, next.colors[index], amount));
  return `linear-gradient(180deg, ${mixed[0]} 0%, ${mixed[1]} 42%, ${mixed[2]} 68%, ${mixed[3]} 100%)`;
}

function createNoiseSource(context, seconds = 2, intensity = 0.5) {
  const source = context.createBufferSource();
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * intensity;
  }
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function setGain(gainNode, value, ramp = 1.8) {
  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.linearRampToValueAtTime(value, now + ramp);
}

function updateAudioByProgress(progress) {
  if (!audioLayers) {
    return;
  }

  const harbor = 1 - smoothstep(0.3, 0.52, progress);
  const historic = smoothstep(0.25, 0.44, progress) * (1 - smoothstep(0.58, 0.72, progress));
  const market = smoothstep(0.5, 0.66, progress) * (1 - smoothstep(0.78, 0.9, progress));
  const beach = smoothstep(0.7, 0.86, progress);

  setGain(audioLayers.windGain, 0.2 + beach * 0.05, 2.2);
  setGain(audioLayers.waveGain, 0.018 + beach * 0.042, 2.4);
  setGain(audioLayers.riggingGain, harbor * 0.1, 1.6);
  setGain(audioLayers.echoGain, historic * 0.06, 1.7);
  setGain(audioLayers.marketGain, market * 0.075, 1.6);
}

function startAudio() {
  if (audioStarted) {
    return;
  }

  audioStarted = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = 0.035;
  master.connect(audioCtx.destination);

  const windNoise = createNoiseSource(audioCtx, 3, 0.38);

  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 720;

  const windGain = audioCtx.createGain();
  windGain.gain.value = 0.3;

  windNoise.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  windNoise.start(now);

  const waves = audioCtx.createOscillator();
  waves.type = 'sine';
  waves.frequency.value = 73;
  const waveGain = audioCtx.createGain();
  waveGain.gain.value = 0.03;
  waves.connect(waveGain);
  waveGain.connect(master);
  waves.start(now);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'triangle';
  pulse.frequency.value = 0.07;
  const pulseGain = audioCtx.createGain();
  pulseGain.gain.value = 0.016;
  pulse.connect(pulseGain);
  pulseGain.connect(waveGain.gain);
  pulse.start(now);

  const riggingNoise = createNoiseSource(audioCtx, 1, 0.32);
  const riggingFilter = audioCtx.createBiquadFilter();
  riggingFilter.type = 'bandpass';
  riggingFilter.frequency.value = 2200;
  riggingFilter.Q.value = 1.8;
  const riggingGain = audioCtx.createGain();
  riggingGain.gain.value = 0;
  riggingNoise.connect(riggingFilter);
  riggingFilter.connect(riggingGain);
  riggingGain.connect(master);
  riggingNoise.start(now);

  const echoTone = audioCtx.createOscillator();
  echoTone.type = 'triangle';
  echoTone.frequency.value = 118;
  const echoFilter = audioCtx.createBiquadFilter();
  echoFilter.type = 'bandpass';
  echoFilter.frequency.value = 540;
  const echoGain = audioCtx.createGain();
  echoGain.gain.value = 0;
  echoTone.connect(echoFilter);
  echoFilter.connect(echoGain);
  echoGain.connect(master);
  echoTone.start(now);

  const marketNoise = createNoiseSource(audioCtx, 2, 0.28);
  const marketFilter = audioCtx.createBiquadFilter();
  marketFilter.type = 'bandpass';
  marketFilter.frequency.value = 460;
  marketFilter.Q.value = 0.8;
  const marketLfo = audioCtx.createOscillator();
  marketLfo.type = 'sine';
  marketLfo.frequency.value = 0.32;
  const marketLfoGain = audioCtx.createGain();
  marketLfoGain.gain.value = 170;
  marketLfo.connect(marketLfoGain);
  marketLfoGain.connect(marketFilter.frequency);
  const marketGain = audioCtx.createGain();
  marketGain.gain.value = 0;
  marketNoise.connect(marketFilter);
  marketFilter.connect(marketGain);
  marketGain.connect(master);
  marketNoise.start(now);
  marketLfo.start(now);

  audioLayers = {
    windGain,
    waveGain,
    riggingGain,
    echoGain,
    marketGain
  };

  updateAudioByProgress(Math.min(window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1), 1));
}

function updateDepth() {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const progress = Math.min(window.scrollY / Math.max(maxScroll, 1), 1);

  document.documentElement.style.setProperty('--depth', progress.toFixed(3));
  document.documentElement.style.setProperty('--drift-x', `${progress * -56}px`);
  shimmer.style.opacity = (0.24 + smoothstep(0.22, 0.66, progress) * 0.13).toFixed(3);
  experience.style.background = gradientFor(progress);
  updateAudioByProgress(progress);

  if (progress > 0.92) {
    document.documentElement.style.setProperty('--luma', '0.97');
    clearTimeout(reflectionTimer);
    reflectionTimer = setTimeout(() => {
      if (Date.now() - lastInteraction > 10000) {
        finalLine.classList.add('visible');
        document.documentElement.style.setProperty('--luma', '0.9');
      }
    }, 10020);
  } else {
    finalLine.classList.remove('visible');
    document.documentElement.style.setProperty('--luma', '1');
  }
}

function noteActivity() {
  lastInteraction = Date.now();
  microcopy.classList.remove('visible');
  finalLine.classList.remove('visible');
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume();
  }
}

function pauseWatcher() {
  if (Date.now() - lastInteraction > 2000) {
    microcopy.classList.add('visible');
  }
  requestAnimationFrame(pauseWatcher);
}

window.addEventListener('scroll', () => {
  startAudio();
  noteActivity();
  updateDepth();
});

window.addEventListener('pointermove', (event) => {
  startAudio();
  noteActivity();
  const offset = (event.clientX / window.innerWidth - 0.5) * 18;
  document.documentElement.style.setProperty('--wind-x', `${offset}px`);
});

window.addEventListener('touchstart', () => {
  startAudio();
  noteActivity();
});

whisperTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => {
    trigger.classList.toggle('open');
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      trigger.classList.toggle('open');
    }
  });
});

updateDepth();
pauseWatcher();
