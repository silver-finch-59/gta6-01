// config.js — one tuning table for the game: roads, clock, police, combat.
export const CONFIG = {
  ROAD_LINES: [-252, -180, -108, -36, 36, 108, 180, 252],
  ROAD_WIDTH: 12,
  BLOCK_SIZE: 60,
  WORLD_MIN_X: -288,
  WORLD_MAX_X: 336,
  WORLD_MIN_Z: -288,
  WORLD_MAX_Z: 288,
  EAST_BEACH: 270,
  OCEAN_EDGE: 322,
  START_CLOCK_MINUTES: 16 * 60 + 24,
  CLOCK_MINUTES_PER_SECOND: 0.35,
  DAY_NIGHT: {
    DAWN_START: 5 * 60 + 30,
    DAY_START: 7 * 60,
    DUSK_START: 18 * 60,
    NIGHT_START: 19 * 60 + 30,
    LAMP_ON: 18 * 60 + 30,
    LAMP_OFF: 6 * 60,
    SUN_DAY: 0xffe3b3,
    SUN_DUSK: 0xff9a52,
    SUN_NIGHT: 0x5a6ea8,
    SKY_DAY: 0x87b5e0,
    SKY_DUSK: 0xe08a5a,
    SKY_NIGHT: 0x0e1a33,
  },

  PLAYER: {
    WALK_SPEED: 6,
    RUN_SPEED: 10.5,
    RADIUS: 0.7,
    MAX_HEALTH: 100,
    HEALTH_REGEN_PER_SECOND: 1.5,
    REGEN_DELAY_SECONDS: 8,
    STAMINA_MAX: 100,
    STAMINA_DRAIN_PER_SECOND: 22,
    STAMINA_REFILL_PER_SECOND: 16,
    PUNCH_DAMAGE: 12,
    PUNCH_RANGE: 2.2,
    PUNCH_COOLDOWN_SECONDS: 0.45,
  },
  CAR: {
    MAX_SPEED: 42,
    SPORTS_MAX_SPEED: 56,
    ACCEL: 16,
    BRAKE: 34,
    REVERSE_MAX_SPEED: 12,
    STEER_MAX: 0.55,
    STEER_SPEED: 2.2,
    RADIUS: 1.6,
  },
  CAR_KINDS: {
    sedan: { topSpeed: 40, accel: 15, steer: 0.55, length: 4.4, width: 1.9 },
    sports: { topSpeed: 56, accel: 20, steer: 0.62, length: 4.2, width: 1.9 },
    taxi: { topSpeed: 42, accel: 15, steer: 0.55, length: 4.4, width: 1.9 },
    police: { topSpeed: 50, accel: 19, steer: 0.6, length: 4.5, width: 1.95 },
    motorbike: { topSpeed: 52, accel: 24, steer: 0.85, length: 2.3, width: 0.8 },
    van: { topSpeed: 34, accel: 11, steer: 0.45, length: 5.2, width: 2.1 },
    bus: { topSpeed: 28, accel: 8, steer: 0.35, length: 9.0, width: 2.5 },
    pickup: { topSpeed: 44, accel: 16, steer: 0.52, length: 4.8, width: 2.0 },
  },
  TRAFFIC: {
    COUNT: 26,
    SPEED_MIN: 8,
    SPEED_MAX: 14,
    FOLLOW_DISTANCE: 9,
    LIGHT_CYCLE_SECONDS: 9,
  },
  PEDESTRIANS: {
    COUNT: 34,
    SPEED_MIN: 1.1,
    SPEED_MAX: 2.2,
    FLEE_SPEED: 4.5,
  },
  POLICE: {
    MAX_CARS: 6,
    CHASE_SPEED: 38,
    RAM_DAMAGE: 8,
    SPAWN_DISTANCE: 90,
    DESPAWN_DISTANCE: 220,
    COP_FOOT_SPEED: 5.2,
    COOL_DOWN_SECONDS: 14,
    HEAT_PER_STAR: 100,
    ROADBLOCK_STARS: 3,
    HELICOPTER_STARS: 4,
  },
  COMBAT: {
    PISTOL_DAMAGE: 34,
    PISTOL_RANGE: 60,
    PISTOL_RATE_SECONDS: 0.28,
    ENEMY_HEALTH: 100,
    ENEMY_DAMAGE: 9,
    ENEMY_RANGE: 38,
    ENEMY_RATE_SECONDS: 0.9,
    RUSHER_HEALTH: 70,
    RUSHER_DAMAGE: 14,
    RUSHER_SPEED: 7.5,
    SHOOTER_DAMAGE: 7,
    SHOOTER_BURST: 3,
  },
  MISSIONS: {
    REWARD: [400, 900, 1200, 1500, 2500, 5000, 1800, 3200],
    RESPECT_REWARD: [60, 90, 120, 150, 200, 300, 160, 240],
    TAXI_FARE: 120,
    TAXI_PER_METRE: 0.35,
    PACKAGE_VALUE: 150,
    PACKAGE_COUNT: 12,
  },
  RESPECT_TIERS: [
    { at: 0, name: 'Nobody' },
    { at: 100, name: 'Wheelman' },
    { at: 250, name: 'Hustler' },
    { at: 450, name: 'Runner' },
    { at: 700, name: 'Fixer Friend' },
    { at: 1000, name: 'Street Boss' },
    { at: 1400, name: 'Bay Legend' },
    { at: 2000, name: 'King of Solmar' },
  ],
  RADIO_STATIONS: [
    { name: 'BAY FM 88.4', tagline: 'Sunset synthwave' },
    { name: 'PALM 102.1', tagline: 'Mellow harbour chords' },
    { name: 'VIPER 96.7', tagline: 'Tense night pulse' },
  ],
  SAVE_KEY: 'solmar-bay-save-v2',
};

export const DISTRICTS = [
  { name: 'Downtown', minX: -108, maxX: 108, minZ: -108, maxZ: 108 },
  { name: 'Old Town', minX: -288, maxX: -108, minZ: -108, maxZ: 288 },
  { name: 'Marina', minX: -108, maxX: 252, minZ: 108, maxZ: 288 },
  { name: 'Harbor', minX: 108, maxX: 288, minZ: -288, maxZ: -108 },
  { name: 'Beachfront', minX: 252, maxX: 336, minZ: -288, maxZ: 288 },
  { name: 'Hills', minX: -288, maxX: -108, minZ: -288, maxZ: -108 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d.name;
  }
  return 'Solmar Bay';
}

export function respectTierName(respect) {
  let name = CONFIG.RESPECT_TIERS[0].name;
  for (const tier of CONFIG.RESPECT_TIERS) {
    if (respect >= tier.at) name = tier.name;
  }
  return name;
}

export function phaseOfDay(clockMinutes) {
  const dn = CONFIG.DAY_NIGHT;
  const m = ((clockMinutes % 1440) + 1440) % 1440;
  if (m >= dn.NIGHT_START || m < dn.DAWN_START) return 'night';
  if (m < dn.DAY_START) return 'dawn';
  if (m < dn.DUSK_START) return 'day';
  return 'dusk';
}
