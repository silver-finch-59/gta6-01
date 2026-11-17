// The one shared game state every module reads and writes. Modules never
// keep their own copy of money, health, wanted level or mission progress:
// they read and mutate this object, and announce changes through the tiny
// event bus so the HUD, the audio and the save system can react without
// being coupled to them.
import { CONFIG } from './config.js';

export function createEventBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      const list = handlers.get(event) || [];
      list.push(fn);
      handlers.set(event, list);
    },
    off(event, fn) {
      const list = handlers.get(event);
      if (!list) return;
      const at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
    emit(event, data) {
      const list = handlers.get(event);
      if (!list) return;
      for (const fn of list.slice()) fn(data);
    },
  };
}

export function createGameState(seed) {
  return {
    seed,
    // Seconds since the session started (game time, not wall clock).
    time: 0,
    clockMinutes: CONFIG.START_CLOCK_MINUTES,
    money: 250,
    health: CONFIG.PLAYER.MAX_HEALTH,
    // Street respect: missions, fares and clean getaways raise it.
    respect: 0,
    // Radio station 0, 1 or 2; the audio module cycles it on the R key.
    radioStation: 0,
    wanted: 0,
    // 0..100 heat inside the current wanted level; crimes add heat, quiet
    // cools it.
    heat: 0,
    secondsSinceCrime: 99,
    // Where the player is and what they are doing.
    player: {
      x: 36,
      z: 216,
      yaw: Math.PI,
      onFoot: true,
      car: null,
      speed: 0,
      armed: false,
      lastDamageAt: -99,
      stamina: CONFIG.PLAYER.STAMINA_MAX,
      lastPunchAt: -99,
    },
    // Mission progress: index into the mission list, phase inside the
    // mission, and the live objective the HUD shows. marker is the world
    // position of the beacon.
    mission: {
      index: 0,
      phase: 0,
      objective: '',
      marker: null,
      timer: 0,
      done: false,
    },
    stats: {
      carsStolen: 0,
      pedestriansHit: 0,
      shotsFired: 0,
      missionsDone: 0,
      missionsOnTime: 0,
      faresDone: 0,
      packagesFound: 0,
      totalEarned: 0,
      respectEarned: 0,
      punchesThrown: 0,
      getaways: 0,
    },
    // Screen state: 'title' | 'playing' | 'paused' | 'dead' | 'busted'.
    screen: 'title',
    paused: false,
    // Set by shots.js when a screenshot scene is staged; the HUD hides the
    // title screen and the game never waits for a key press.
    shotMode: null,
    events: createEventBus(),
  };
}

// Add money and record it in the stats; the HUD listens for 'money'.
export function addMoney(state, amount) {
  state.money += amount;
  if (amount > 0) state.stats.totalEarned += amount;
  state.events.emit('money', { amount, total: state.money });
}

// Add respect and record it; the HUD listens for 'respect'.
export function addRespect(state, amount) {
  state.respect = Math.max(0, state.respect + amount);
  if (amount > 0) state.stats.respectEarned += amount;
  state.events.emit('respect', { amount, total: state.respect });
}

// A crime adds heat and may raise the wanted level. Returns the new level.
export function commitCrime(state, heat) {
  state.heat += heat;
  state.secondsSinceCrime = 0;
  let raised = false;
  while (state.heat >= CONFIG.POLICE.HEAT_PER_STAR && state.wanted < 5) {
    state.heat -= CONFIG.POLICE.HEAT_PER_STAR;
    state.wanted += 1;
    raised = true;
  }
  if (state.wanted >= 5) {
    state.heat = Math.min(state.heat, CONFIG.POLICE.HEAT_PER_STAR - 1);
  }
  state.events.emit('crime', { heat, wanted: state.wanted, raised });
  if (raised) state.events.emit('wanted', { wanted: state.wanted });
  return state.wanted;
}

// Quiet time cools the wanted level down, one star at a time. A fully clean
// getaway (from two stars or more down to zero) counts as a getaway.
export function coolWanted(state, dt) {
  if (state.wanted === 0) return;
  const startedAt = state.wanted;
  state.secondsSinceCrime += dt;
  if (state.secondsSinceCrime < CONFIG.POLICE.COOL_DOWN_SECONDS) return;
  state.heat -= dt * 6;
  if (state.heat <= 0) {
    state.wanted -= 1;
    state.heat = state.wanted > 0 ? CONFIG.POLICE.HEAT_PER_STAR - 1 : 0;
    state.events.emit('wanted', { wanted: state.wanted });
    if (state.wanted === 0 && startedAt >= 2) {
      state.stats.getaways += 1;
      addRespect(state, 15);
    }
  }
}

export function hurtPlayer(state, damage) {
  if (state.screen !== 'playing' || state.health <= 0) return;
  state.health = Math.max(0, state.health - damage);
  state.player.lastDamageAt = state.time;
  state.events.emit('hurt', { health: state.health });
  if (state.health <= 0) {
    state.screen = 'dead';
    state.events.emit('dead', {});
  }
}

// Heal the player, capped at full health; returns how much was restored.
export function healPlayer(state, amount) {
  if (state.health <= 0) return 0;
  const before = state.health;
  state.health = Math.min(CONFIG.PLAYER.MAX_HEALTH, state.health + amount);
  const healed = state.health - before;
  if (healed > 0) state.events.emit('healed', { health: state.health });
  return healed;
}

// Clear the whole wanted level at once (respawn, busted, mission script).
export function clearWanted(state) {
  state.wanted = 0;
  state.heat = 0;
  state.secondsSinceCrime = 99;
  state.events.emit('wanted', { wanted: 0 });
}
