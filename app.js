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

setTimeout(() => horizon.classList.add('revealed'), 6800);

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

  const windNoise = audioCtx.createBufferSource();
  const windBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = windBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.45;
  }
  windNoise.buffer = windBuffer;
  windNoise.loop = true;

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
}

function updateDepth() {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const progress = Math.min(window.scrollY / Math.max(maxScroll, 1), 1);

  document.documentElement.style.setProperty('--depth', progress.toFixed(3));
  document.documentElement.style.setProperty('--drift-x', `${progress * -56}px`);

  if (progress > 0.22) {
    shimmer.style.opacity = '0.36';
  }
  if (progress > 0.42) {
    experience.style.background =
      'linear-gradient(180deg, #c9b79c 0%, #5f7d8a 42%, #60584f 68%, #2e3a4f 100%)';
  }
  if (progress > 0.62) {
    experience.style.background =
      'linear-gradient(180deg, #c2ad90 0%, #85745f 45%, #73523a 66%, #2e3a4f 100%)';
  }
  if (progress > 0.78) {
    experience.style.background =
      'linear-gradient(180deg, #b79f82 0%, #845f44 42%, #4b3f3f 67%, #253346 100%)';
  }

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
