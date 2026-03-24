const horizon = document.getElementById('horizon');
const experience = document.getElementById('experience');
const microcopy = document.getElementById('microcopy');
const finalLine = document.getElementById('finalLine');
const shimmer = document.getElementById('waterShimmer');
const whisperTriggers = Array.from(document.querySelectorAll('.whisper-trigger'));
const spaceCards = Array.from(document.querySelectorAll('.space[data-space]'));
const hudStatus = document.getElementById('hudStatus');
const hudDetail = document.getElementById('hudDetail');
const contrastToggle = document.getElementById('contrastToggle');
const narrativeAnnouncer = document.getElementById('narrativeAnnouncer');
const qaMode = new URLSearchParams(window.location.search).get('qa') === '1';

let lastInteraction = Date.now();
let reflectionTimer;
let audioCtx;
let audioStarted = false;
let audioLayers;
let resistingScroll = false;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmallViewport = window.matchMedia('(max-width: 760px)').matches;
let touchDragX = null;
let qaPanel;
let qaLines;
let lastAnnouncedZone = '';
let currentZone = 'Arrival';
let lastMicrocopyZone = '';
let microcopyIndex = 0;
let shimmerPulseTimer;
let ambientMomentTimer;
let lastScrollY = window.scrollY;
let lastScrollTs = performance.now();
let scrollVelocity = 0;
const visitedZones = new Set();

const zoneWhispers = {
  Arrival: ['Salt before streets.', 'Light arrives first.'],
  'Harbor Edge': ['Rigging taps the wind.', 'Steel lines meet tide.'],
  'Historic Core': ['Stone keeps the day cool.', 'History breathes in shade.'],
  'Market Pulse': ['Warm voices drift together.', 'Color hums through lanes.'],
  'Bathers Beach': ['Amber slips into indigo.', 'Foam gathers dusk light.'],
  'Western Horizon': ['Hold still at the edge.', 'Evening settles in water.']
};

const ambientMomentsByZone = {
  Arrival: ['A gull traces the same arc twice.', 'Light softens as cloud-thin shade passes.'],
  'Harbor Edge': ['A ferry bell folds into the wind.', 'Mast lines answer each other in metal clicks.'],
  'Historic Core': ['Cool stone keeps yesterday in the air.', 'Footsteps return as a distant echo.'],
  'Market Pulse': ['Warm voices overlap, then drift apart.', 'Citrus and bread rise through the lane.'],
  'Bathers Beach': ['Foam collapses in amber light.', 'The horizon lowers into indigo.'],
  'Western Horizon': ['The harbor grows quieter than your breath.', 'The last light lingers, then releases.']
};

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
  const horizonStart = isSmallViewport ? 0.86 : 0.84;
  const horizonEase = 1 - smoothstep(horizonStart, 1, progress) * (isSmallViewport ? 0.3 : 0.35);
  const visualProgress = clamp(progress * horizonEase, 0, 1);
  const driftDistance = isSmallViewport ? -40 : -56;

  document.documentElement.style.setProperty('--depth', visualProgress.toFixed(3));
  document.documentElement.style.setProperty('--drift-x', `${visualProgress * driftDistance}px`);
  shimmer.style.opacity = (0.24 + smoothstep(0.22, 0.66, visualProgress) * 0.13).toFixed(3);
  experience.style.background = gradientFor(visualProgress);
  updateAudioByProgress(visualProgress);

  const reflectionThreshold = isSmallViewport ? 0.94 : 0.92;
  const reflectionStillness = isSmallViewport ? 12000 : 10000;
  const nearReflection = progress > reflectionThreshold;
  const zone = zoneLabel(progress);
  currentZone = zone;

  if (hudStatus) {
    hudStatus.textContent = `${zone} • ${(progress * 100).toFixed(0)}% explored`;
  }
  if (hudDetail) {
    hudDetail.textContent = detailByZone(zone);
  }
  if (narrativeAnnouncer && zone !== lastAnnouncedZone) {
    narrativeAnnouncer.textContent = `Now entering ${zone}.`;
    pulseShimmer();
    updateCurrentSpace(zone);
    visitedZones.add(zone);
    lastAnnouncedZone = zone;
  }

  if (nearReflection) {
    document.documentElement.style.setProperty('--luma', '0.97');
    clearTimeout(reflectionTimer);
    reflectionTimer = setTimeout(() => {
      if (Date.now() - lastInteraction > reflectionStillness) {
        finalLine.classList.add('visible');
        document.documentElement.style.setProperty('--luma', '0.18');
      }
    }, reflectionStillness + 20);
  } else {
    finalLine.classList.remove('visible');
    document.documentElement.style.setProperty('--luma', '1');
  }

  if (qaMode) {
    updateQaPanel({
      progress,
      visualProgress,
      nearReflection,
      reflectionThreshold,
      reflectionStillness
    });
  }
}

function updateCurrentSpace(zone) {
  const zoneMap = {
    Arrival: 'arrival',
    'Harbor Edge': 'harbor',
    'Historic Core': 'historic',
    'Market Pulse': 'market',
    'Bathers Beach': 'beach',
    'Western Horizon': 'reflection'
  };

  const activeSpace = zoneMap[zone];
  spaceCards.forEach((card) => {
    card.classList.toggle('is-current', card.dataset.space === activeSpace);
  });
}

function pulseShimmer() {
  shimmer.classList.remove('pulse');
  if (shimmerPulseTimer) {
    clearTimeout(shimmerPulseTimer);
  }
  requestAnimationFrame(() => shimmer.classList.add('pulse'));
  shimmerPulseTimer = setTimeout(() => shimmer.classList.remove('pulse'), 2000);
}

function revealZoneMicrocopy(force = false) {
  if (prefersReducedMotion) {
    return;
  }

  const lines = zoneWhispers[currentZone] || zoneWhispers.Arrival;
  if (force || lastMicrocopyZone !== currentZone) {
    microcopyIndex = 0;
  } else {
    microcopyIndex = (microcopyIndex + 1) % lines.length;
  }
  microcopy.textContent = lines[microcopyIndex];
  lastMicrocopyZone = currentZone;
  microcopy.classList.add('visible');
}

function detailByZone(zone) {
  const paceHint = scrollVelocity > 1.2 ? ' Slow your pace to feel the transitions.' : '';
  switch (zone) {
    case 'Harbor Edge':
      return `You are at the working shoreline: listen for rigging taps and ferry movement.${paceHint}`;
    case 'Historic Core':
      return `Stone and shade soften sound here; movement feels slower and denser.${paceHint}`;
    case 'Market Pulse':
      return `Color and voices rise together, blending produce stalls with maker workshops.${paceHint}`;
    case 'Bathers Beach':
      return `Evening tones shift from amber into indigo as the waterline darkens.${paceHint}`;
    case 'Western Horizon':
      return `Hold still to let the final reflection sequence reveal itself.${paceHint}`;
    default:
      return `Move slowly: each stop reveals where you are, what surrounds you, and how the harbor shifts.${paceHint}`;
  }
}

function runAmbientMoment() {
  if (document.hidden || prefersReducedMotion) {
    return;
  }
  const lines = ambientMomentsByZone[currentZone] || ambientMomentsByZone.Arrival;
  const line = lines[Math.floor(Math.random() * lines.length)];
  microcopy.textContent = line;
  microcopy.classList.add('visible');
  shimmer.classList.add('pulse');
  if (narrativeAnnouncer) {
    narrativeAnnouncer.textContent = line;
  }
  if (shimmerPulseTimer) {
    clearTimeout(shimmerPulseTimer);
  }
  shimmerPulseTimer = setTimeout(() => shimmer.classList.remove('pulse'), 2000);
  const glow = document.querySelector('.sky-glow');
  glow?.classList.add('swell');
  setTimeout(() => glow?.classList.remove('swell'), 2200);
}

function scheduleAmbientMoment() {
  if (ambientMomentTimer) {
    clearTimeout(ambientMomentTimer);
  }
  const delay = 16000 + Math.random() * 9000;
  ambientMomentTimer = setTimeout(() => {
    if (visitedZones.size >= 2 && Date.now() - lastInteraction > 1800) {
      runAmbientMoment();
    }
    scheduleAmbientMoment();
  }, delay);
}

function applyHorizonResistance(deltaY) {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) {
    return false;
  }

  const progress = window.scrollY / maxScroll;
  const headingTowardHorizon = deltaY > 0;
  if (!headingTowardHorizon || progress < 0.82 || progress >= 0.995 || resistingScroll) {
    return false;
  }

  const resistance = 1 - smoothstep(0.82, 0.99, progress) * 0.72;
  const dampedDelta = deltaY * resistance;
  resistingScroll = true;
  window.scrollTo({
    top: clamp(window.scrollY + dampedDelta, 0, maxScroll),
    behavior: 'auto'
  });
  requestAnimationFrame(() => {
    resistingScroll = false;
  });
  return true;
}

function noteActivity() {
  lastInteraction = Date.now();
  microcopy.classList.remove('visible');
  finalLine.classList.remove('visible');
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume();
  }
}

function zoneLabel(progress) {
  if (progress < 0.3) return 'Arrival';
  if (progress < 0.52) return 'Harbor Edge';
  if (progress < 0.68) return 'Historic Core';
  if (progress < 0.84) return 'Market Pulse';
  if (progress < 0.95) return 'Bathers Beach';
  return 'Western Horizon';
}

function setupQaPanel() {
  qaPanel = document.createElement('aside');
  qaPanel.className = 'qa-panel';
  qaPanel.setAttribute('aria-live', 'polite');
  qaPanel.innerHTML = `
    <h3>QA Mode</h3>
    <p>Use real devices for atmosphere checks.</p>
    <ul class="qa-lines">
      <li data-qa="zone"></li>
      <li data-qa="progress"></li>
      <li data-qa="visual"></li>
      <li data-qa="stillness"></li>
      <li data-qa="reflection"></li>
      <li data-qa="viewport"></li>
      <li data-qa="motion"></li>
    </ul>
  `;
  document.body.appendChild(qaPanel);
  qaLines = {
    zone: qaPanel.querySelector('[data-qa="zone"]'),
    progress: qaPanel.querySelector('[data-qa="progress"]'),
    visual: qaPanel.querySelector('[data-qa="visual"]'),
    stillness: qaPanel.querySelector('[data-qa="stillness"]'),
    reflection: qaPanel.querySelector('[data-qa="reflection"]'),
    viewport: qaPanel.querySelector('[data-qa="viewport"]'),
    motion: qaPanel.querySelector('[data-qa="motion"]')
  };
}

function updateQaPanel({ progress, visualProgress, nearReflection, reflectionThreshold, reflectionStillness }) {
  if (!qaLines) {
    return;
  }

  const stillForMs = Date.now() - lastInteraction;
  qaLines.zone.textContent = `Zone: ${zoneLabel(progress)}`;
  qaLines.progress.textContent = `Scroll progress: ${(progress * 100).toFixed(1)}%`;
  qaLines.visual.textContent = `Visual depth: ${(visualProgress * 100).toFixed(1)}%`;
  qaLines.stillness.textContent = `Stillness: ${(stillForMs / 1000).toFixed(1)}s`;
  qaLines.reflection.textContent = `Reflection gate: ${nearReflection ? 'armed' : 'idle'} @ ${(reflectionThreshold * 100).toFixed(0)}% / ${(reflectionStillness / 1000).toFixed(0)}s`;
  qaLines.viewport.textContent = `Viewport: ${isSmallViewport ? 'mobile' : 'desktop'}`;
  qaLines.motion.textContent = `Reduced motion: ${prefersReducedMotion ? 'on' : 'off'}`;
}

function pauseWatcher() {
  if (prefersReducedMotion) {
    return;
  }

  if (Date.now() - lastInteraction > 2000) {
    revealZoneMicrocopy();
  }
  requestAnimationFrame(pauseWatcher);
}

window.addEventListener('scroll', () => {
  startAudio();
  noteActivity();
  const now = performance.now();
  const deltaY = Math.abs(window.scrollY - lastScrollY);
  const deltaT = Math.max(now - lastScrollTs, 1);
  scrollVelocity = deltaY / deltaT;
  lastScrollY = window.scrollY;
  lastScrollTs = now;
  updateDepth();
});

window.addEventListener(
  'wheel',
  (event) => {
    if (applyHorizonResistance(event.deltaY)) {
      event.preventDefault();
      noteActivity();
      updateDepth();
    }
  },
  { passive: false }
);

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

window.addEventListener(
  'touchmove',
  (event) => {
    if (!event.touches.length) {
      return;
    }

    const point = event.touches[0];
    if (touchDragX === null) {
      touchDragX = point.clientX;
    }

    const delta = clamp(point.clientX - touchDragX, -42, 42);
    document.documentElement.style.setProperty('--wind-x', `${(delta / 42) * 14}px`);
    noteActivity();
  },
  { passive: true }
);

window.addEventListener('touchend', () => {
  touchDragX = null;
});

whisperTriggers.forEach((trigger) => {
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    const shouldOpen = !trigger.classList.contains('open');
    whisperTriggers.forEach((item) => {
      item.classList.remove('open');
      item.setAttribute('aria-expanded', 'false');
    });
    if (shouldOpen) {
      trigger.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const shouldOpen = !trigger.classList.contains('open');
      whisperTriggers.forEach((item) => {
        item.classList.remove('open');
        item.setAttribute('aria-expanded', 'false');
      });
      if (shouldOpen) {
        trigger.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    }
  });
});

if (contrastToggle) {
  contrastToggle.addEventListener('click', () => {
    const isActive = document.body.classList.toggle('high-contrast');
    contrastToggle.setAttribute('aria-pressed', String(isActive));
  });
}

updateDepth();
if (qaMode) {
  setupQaPanel();
  updateDepth();
}
pauseWatcher();
scheduleAmbientMoment();
