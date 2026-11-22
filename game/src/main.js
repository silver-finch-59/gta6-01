// main.js — boot, main loop, and the top-1000 import order (config first).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createGameState, coolWanted, clearWanted } from './state.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createTraffic } from './traffic.js';
import { createPlayer } from './player.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';
import { makeRng } from './rng.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 7) || 7;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
const scene = new THREE.Scene();

const rng = makeRng(seed);
const state = createGameState(seed);

const input = {
  keys: new Set(),
  justPressed: new Set(),
  lookDX: 0,
  lookDY: 0,
  mouseDown: false,
};

const world = {
  scene,
  camera,
  renderer,
  rng,
  state,
  input,
  city: null,
  traffic: null,
  police: null,
  player: null,
  combat: null,
  missions: null,
  hud: null,
  audio: null,
};

world.city = buildCity(scene, rng);
world.traffic = createTraffic(world);
world.police = createPolice(world);
world.player = createPlayer(world);
world.combat = createCombat(world);
world.missions = createMissions(world);
world.hud = createHud(world);
world.audio = createAudio(world);

window.__world = world;
const saved = !shotName ? loadSave() : null;
if (saved) {
  state.money = saved.money;
  state.mission.index = saved.missionIndex;
  if (typeof saved.respect === 'number') state.respect = saved.respect;
  if (typeof saved.radioStation === 'number') state.radioStation = saved.radioStation;
  if (saved.stats) state.stats = { ...state.stats, ...saved.stats };
  if (saved.player) {
    state.player.x = saved.player.x;
    state.player.z = saved.player.z;
    state.player.yaw = saved.player.yaw;
  }
  if (typeof saved.clockMinutes === 'number') state.clockMinutes = saved.clockMinutes;
  world.player.teleport(state.player.x, state.player.z, state.player.yaw);
  const note = document.getElementById('continue-note');
  if (note) note.style.display = '';
}

const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  dead: document.getElementById('screen-dead'),
  busted: document.getElementById('screen-busted'),
  loading: document.getElementById('loading'),
  hud: document.getElementById('hud'),
};

function showOnly(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (!el || key === 'loading' || key === 'hud') continue;
    el.classList.toggle('hidden', key !== name);
  }
  if (screens.hud) screens.hud.classList.toggle('hidden', name !== 'playing');
}

function beginStory() {
  state.screen = 'playing';
  showOnly('playing');
  world.audio.unlock();
  world.missions.startMission(Math.min(state.mission.index, 7));
  if (state.mission.index >= 8) world.missions.startMission(8);
}

function respawnAt(spotName, penalty) {
  const spot = world.city.spawnPoints[spotName] || { x: 36, z: 216 };
  if (world.player && world.player.exitCar) world.player.exitCar();
  state.money = Math.max(0, state.money - penalty);
  state.health = CONFIG.PLAYER.MAX_HEALTH;
  clearWanted(state);
  world.player.teleport(spot.x, spot.z, Math.PI);
  state.screen = 'playing';
  showOnly('playing');
}

document.getElementById('btn-start').addEventListener('click', () => {
  world.audio.play('click');
  beginStory();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  state.screen = 'playing';
  showOnly('playing');
  world.audio.play('click');
});
document.getElementById('btn-quit-title').addEventListener('click', () => {
  saveGame(state);
  state.screen = 'title';
  showOnly('title');
});
document.getElementById('btn-respawn').addEventListener('click', () => {
  world.audio.play('click');
  respawnAt('hospital', 200);
});
document.getElementById('btn-release').addEventListener('click', () => {
  world.audio.play('busted');
  respawnAt('policeStation', 200);
});

state.events.on('dead', () => {
  showOnly('dead');
});
state.events.on('busted', () => {
  world.audio.play('busted');
  showOnly('busted');
});

let muted = false;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragMoved = false;

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }
  input.keys.add(event.code);
  input.justPressed.add(event.code);
  if (event.code === 'Escape' && !shotName) {
    if (state.screen === 'playing') {
      state.screen = 'paused';
      showOnly('pause');
    } else if (state.screen === 'paused') {
      state.screen = 'playing';
      showOnly('playing');
    }
  }
  if (event.code === 'KeyM') {
    muted = !muted;
    world.audio.setMuted(muted);
  }
});
window.addEventListener('keyup', (event) => {
  input.keys.delete(event.code);
});
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragMoved = false;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  input.mouseDown = true;
  world.audio.unlock();
});
window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const dx = event.movementX || 0;
  const dy = event.movementY || 0;
  if (Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY) > 6) {
    dragMoved = true;
    input.mouseDown = false;
  }
  input.lookDX += dx;
  input.lookDY += dy;
});
window.addEventListener('pointerup', () => {
  dragging = false;
  input.mouseDown = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing' && !shotName) {
    state.screen = 'paused';
    showOnly('pause');
    saveGame(state);
  }
});

let last = performance.now();
let autosaveAt = 0;

function stepWorld(dt) {
  state.time += dt;
  state.clockMinutes = (state.clockMinutes + dt * CONFIG.CLOCK_MINUTES_PER_SECOND) % 1440;
  coolWanted(state, dt);
  world.player.update(dt);
  world.traffic.update(dt);
  world.police.update(dt);
  world.combat.update(dt);
  world.missions.update(dt);
  world.city.update(dt, state.time, state);
  world.audio.update(dt);
  world.hud.update(dt);
  if (state.time > autosaveAt) {
    autosaveAt = state.time + 30;
    saveGame(state);
  }
}

let shotStaged = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  if (state.screen === 'playing' && !shotStaged) {
    stepWorld(dt);
  }
  renderer.render(scene, camera);
  input.justPressed.clear();
}

if (screens.loading) screens.loading.classList.add('hidden');
if (shotName) {
  state.screen = 'playing';
  state.shotMode = shotName;
  showOnly('playing');
  stageShot(world, shotName, stepWorld);
  if (shotName === 'title') {
    showOnly('title');
    if (screens.hud) screens.hud.classList.add('hidden');
  }
  renderer.render(scene, camera);
  shotStaged = true;
  document.title = 'SHOT_READY';
  window.__shotReady = true;
} else {
  showOnly('title');
}
requestAnimationFrame(frame);
