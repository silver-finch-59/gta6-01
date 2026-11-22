// audio.js — WebAudio synth: engine, sirens, gunshots, and three radio stations.
import { CONFIG } from './config.js';

const STATIONS = [
  {
    name: 'BAY FM 88.4',
    chords: [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 164.81, 196.0], [196.0, 246.94, 293.66]],
    bass: [55.0, 43.65, 32.7, 49.0],
    beatSeconds: 0.42,
    wave: 'sawtooth',
    padGain: 0.045,
    bassGain: 0.09,
  },
  {
    name: 'PALM 102.1',
    chords: [[261.63, 329.63, 392.0], [220.0, 277.18, 329.63], [196.0, 246.94, 293.66], [246.94, 293.66, 369.99]],
    bass: [65.41, 55.0, 49.0, 61.74],
    beatSeconds: 0.62,
    wave: 'triangle',
    padGain: 0.05,
    bassGain: 0.06,
  },
  {
    name: 'VIPER 96.7',
    chords: [[110.0, 130.81, 164.81], [98.0, 116.54, 146.83], [87.31, 103.83, 130.81], [116.54, 138.59, 174.61]],
    bass: [55.0, 49.0, 43.65, 58.27],
    beatSeconds: 0.3,
    wave: 'square',
    padGain: 0.03,
    bassGain: 0.11,
  },
];

export function createAudio(world) {
  const state = world.state;
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  let musicGain = null;
  let bassGain = null;
  let padOscs = [];
  let bassOsc = null;
  let chordIndex = 0;
  let beatIndex = 0;
  let nextBeatAt = 0;

  let engineGain = null;
  let engineSaw = null;
  let engineSub = null;

  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenFlipAt = 0;

  let ambienceGain = null;
  let ambienceSrc = null;

  function makeNoiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function tone({ freq, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.2, delay = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseHit({ dur = 0.2, gain = 0.25, filterFreq = 1200, filterEnd = null, type = 'lowpass', delay = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  function station() {
    return STATIONS[(state.radioStation || 0) % STATIONS.length];
  }

  function retunePad() {
    if (!ctx || padOscs.length === 0) return;
    const chord = station().chords[chordIndex % station().chords.length];
    const t = ctx.currentTime;
    for (let i = 0; i < padOscs.length; i += 1) {
      padOscs[i].frequency.setTargetAtTime(chord[i], t, 0.4);
    }
    if (bassOsc) {
      bassOsc.frequency.setTargetAtTime(station().bass[chordIndex % station().bass.length], t, 0.2);
    }
  }

  function startMusic() {
    if (!ctx || !master || musicGain) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.05;
    filter.connect(musicGain);
    musicGain.connect(master);
    padOscs = station().chords[0].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 4;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    bassGain = ctx.createGain();
    bassGain.gain.value = 0.08;
    bassGain.connect(master);
    bassOsc = ctx.createOscillator();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = station().bass[0];
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 300;
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassOsc.start();
    chordIndex = 0;
    beatIndex = 0;
    nextBeatAt = state.time;
  }

  function startEngine() {
    if (!ctx || !master || engineGain) return;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(master);
    engineSaw = ctx.createOscillator();
    engineSaw.type = 'sawtooth';
    engineSaw.frequency.value = 55;
    const sawFilter = ctx.createBiquadFilter();
    sawFilter.type = 'lowpass';
    sawFilter.frequency.value = 420;
    engineSaw.connect(sawFilter);
    sawFilter.connect(engineGain);
    engineSaw.start();
    engineSub = ctx.createOscillator();
    engineSub.type = 'sine';
    engineSub.frequency.value = 28;
    engineSub.connect(engineGain);
    engineSub.start();
  }

  function startSiren() {
    if (!ctx || !master || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenHigh = false;
    sirenFlipAt = 0;
  }

  function startAmbience() {
    if (!ctx || !master || ambienceGain) return;
    ambienceSrc = ctx.createBufferSource();
    ambienceSrc.buffer = makeNoiseBuffer();
    ambienceSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0;
    ambienceSrc.connect(filter);
    filter.connect(ambienceGain);
    ambienceGain.connect(master);
    ambienceSrc.start();
  }

  function nearestCopDistance() {
    try {
      const cars = world.police ? world.police.policeCars || world.police.cars : null;
      if (!Array.isArray(cars) || cars.length === 0) return Infinity;
      const px = state.player.x;
      const pz = state.player.z;
      let best = Infinity;
      for (const entry of cars) {
        const c = entry && entry.car ? entry.car : entry;
        if (!c || typeof c.x !== 'number') continue;
        const d = Math.hypot(c.x - px, c.z - pz);
        if (d < best) best = d;
      }
      return best;
    } catch (_err) {
      return Infinity;
    }
  }

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      startMusic();
      startEngine();
      startSiren();
      startAmbience();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (_err) {
      ctx = null;
      master = null;
    }
  }

  function play(name) {
    if (!ctx || !master || ctx.state !== 'running') return;
    try {
      switch (name) {
        case 'shot':
          noiseHit({ dur: 0.12, gain: 0.3, filterFreq: 2600, filterEnd: 500 });
          tone({ freq: 190, freqEnd: 55, type: 'square', dur: 0.09, gain: 0.16 });
          break;
        case 'crash':
          tone({ freq: 110, freqEnd: 38, type: 'sine', dur: 0.35, gain: 0.4 });
          noiseHit({ dur: 0.25, gain: 0.3, filterFreq: 700, filterEnd: 120 });
          break;
        case 'punch':
          noiseHit({ dur: 0.08, gain: 0.28, filterFreq: 500, filterEnd: 150 });
          tone({ freq: 140, freqEnd: 70, type: 'sine', dur: 0.08, gain: 0.25 });
          break;
        case 'pickup':
          tone({ freq: 660, dur: 0.08, gain: 0.2 });
          tone({ freq: 880, dur: 0.12, gain: 0.2, delay: 0.08 });
          break;
        case 'mission': {
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, i) => {
            tone({ freq, type: 'triangle', dur: 0.18, gain: 0.22, delay: i * 0.12 });
          });
          break;
        }
        case 'click':
          tone({ freq: 1200, dur: 0.045, gain: 0.15 });
          break;
        case 'busted':
          tone({ freq: 392, dur: 0.2, type: 'triangle', gain: 0.22 });
          tone({ freq: 311, dur: 0.2, type: 'triangle', gain: 0.22, delay: 0.2 });
          tone({ freq: 233, dur: 0.4, type: 'triangle', gain: 0.22, delay: 0.4 });
          break;
        case 'heal':
          tone({ freq: 523.25, dur: 0.12, type: 'sine', gain: 0.18 });
          tone({ freq: 783.99, dur: 0.16, type: 'sine', gain: 0.18, delay: 0.1 });
          break;
        case 'siren':
          break;
        default:
          break;
      }
    } catch (_err) {
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  }

  function update(_dt) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = state.time;
      const playing = state.screen === 'playing';

      if (playing && world.input && world.input.justPressed
        && world.input.justPressed.has('KeyR')) {
        state.radioStation = ((state.radioStation || 0) + 1) % STATIONS.length;
        chordIndex = 0;
        retunePad();
        state.events.emit('toast', { text: `♪ ${station().name}` });
      }

      if (playing && musicGain && now >= nextBeatAt) {
        const st = station();
        beatIndex += 1;
        if (beatIndex % 4 === 0) {
          chordIndex = (chordIndex + 1) % st.chords.length;
          retunePad();
        }
        if (bassGain) {
          bassGain.gain.setTargetAtTime(st.bassGain, ctx.currentTime, 0.01);
          bassGain.gain.setTargetAtTime(st.bassGain * 0.4, ctx.currentTime + st.beatSeconds * 0.7, 0.05);
        }
        nextBeatAt = now + st.beatSeconds;
      }
      if (musicGain) {
        musicGain.gain.setTargetAtTime(playing ? station().padGain : 0.02, ctx.currentTime, 0.5);
      }

      const speed = Math.abs(state.player.speed || 0);
      const driving = playing && !!state.player.car && !state.player.onFoot;
      if (engineGain && engineSaw && engineSub) {
        const freq = 50 + Math.min(speed, 55) * 1.3; // ~50–120 Hz
        engineSaw.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
        engineSub.frequency.setTargetAtTime(freq * 0.5, ctx.currentTime, 0.08);
        const targetGain = driving ? Math.min(0.12, 0.025 + speed * 0.002) : 0;
        engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1);
      }

      if (sirenOsc && sirenGain) {
        const dist = nearestCopDistance();
        const wantSiren = playing && state.wanted > 0 && dist < 120;
        if (wantSiren) {
          if (now >= sirenFlipAt) {
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.03);
            sirenFlipAt = now + 0.45;
          }
          const loud = Math.max(0, 1 - dist / 120);
          sirenGain.gain.setTargetAtTime(0.015 + loud * 0.05, ctx.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
      }

      if (ambienceGain) {
        const east = state.player.x;
        const near = Math.max(0, 1 - Math.max(0, CONFIG.EAST_BEACH - east) / 90);
        const target = playing ? near * 0.05 * (0.7 + Math.sin(now * 0.5) * 0.3) : 0;
        ambienceGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      }
    } catch (_err) {
    }
  }

  if (state && state.events) {
    state.events.on('sfx', (data) => {
      if (data && data.name) play(data.name);
    });
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerdown', unlock, { once: false });
  }

  return { update, play, setMuted, unlock };
}
