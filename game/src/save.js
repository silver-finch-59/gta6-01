// save.js — localStorage save and load, v2 format, migrates v1.
import { CONFIG } from './config.js';

const SAVE_VERSION = 2;

function storageOk() {
  return typeof localStorage !== 'undefined';
}

function migrateV1(old) {
  return {
    version: SAVE_VERSION,
    money: old.money,
    missionIndex: old.missionIndex,
    respect: 0,
    radioStation: 0,
    clockMinutes: CONFIG.START_CLOCK_MINUTES,
    stats: old.stats || {},
    player: old.player || { x: 36, z: 216, yaw: Math.PI },
    savedAt: Date.now(),
  };
}

function normalise(data) {
  if (!data || typeof data.money !== 'number' || typeof data.missionIndex !== 'number') {
    return null;
  }
  if (data.version === 1) return migrateV1(data);
  if (data.version !== SAVE_VERSION) return null;
  return {
    version: SAVE_VERSION,
    money: data.money,
    missionIndex: data.missionIndex,
    respect: typeof data.respect === 'number' ? data.respect : 0,
    radioStation: typeof data.radioStation === 'number' ? data.radioStation : 0,
    clockMinutes: typeof data.clockMinutes === 'number' ? data.clockMinutes : CONFIG.START_CLOCK_MINUTES,
    stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
    player: data.player || { x: 36, z: 216, yaw: Math.PI },
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
  };
}

export function loadSave() {
  try {
    if (!storageOk()) return null;
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return null;
    return normalise(JSON.parse(raw));
  } catch (_err) {
    return null;
  }
}

export function saveGame(state) {
  try {
    if (!storageOk()) return false;
    const snapshot = {
      version: SAVE_VERSION,
      money: state.money,
      missionIndex: state.mission ? state.mission.index : 0,
      respect: typeof state.respect === 'number' ? state.respect : 0,
      radioStation: typeof state.radioStation === 'number' ? state.radioStation : 0,
      stats: state.stats || {},
      player: state.player
        ? { x: state.player.x, z: state.player.z, yaw: state.player.yaw }
        : { x: 36, z: 216, yaw: Math.PI },
      clockMinutes: state.clockMinutes,
      savedAt: Date.now(),
    };
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (_err) {
    return false;
  }
}

export function clearSave() {
  try {
    if (!storageOk()) return false;
    localStorage.removeItem(CONFIG.SAVE_KEY);
    return true;
  } catch (_err) {
    return false;
  }
}

export function saveExists() {
  try {
    if (!storageOk()) return false;
    return localStorage.getItem(CONFIG.SAVE_KEY) !== null;
  } catch (_err) {
    return false;
  }
}
