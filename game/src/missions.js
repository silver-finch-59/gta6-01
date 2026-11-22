// missions.js — eight story missions, taxi fares, and hidden packages.
import * as THREE from 'three';
import { CONFIG, districtAt } from './config.js';
import { Car } from './vehicles.js';
import { addMoney, addRespect, commitCrime, coolWanted } from './state.js';
import { distance2D } from './collide.js';
import { saveGame } from './save.js';

export const MISSION_TITLES = [
  'Welcome Back',
  'Hot Wheels',
  'Beachfront Brawl',
  'The Pickup',
  'Harbor Heist',
  'King of Solmar',
  'Midnight Delivery',
  'The Tail',
];

const FREE_ROAM_OBJECTIVE = 'Solmar Bay is yours, Nova. Free roam — taxi fares and packages still pay.';

const FALLBACKS = {
  garage: { x: 36, z: 180 },
  marina: { x: 144, z: 252 },
  beachLot: { x: 292, z: 36 },
  oldTown: { x: -180, z: 144 },
  harbor: { x: 216, z: -180 },
  hilltop: { x: -216, z: -216 },
  pier: { x: 296, z: 108 },
  park: { x: -36, z: -108 },
};

function pointOf(value, fallback) {
  if (!value) return { x: fallback.x, z: fallback.z };
  if (typeof value.x === 'number' && typeof value.z === 'number') {
    return { x: value.x, z: value.z };
  }
  if (Array.isArray(value) && value.length >= 2) return { x: value[0], z: value[1] };
  return { x: fallback.x, z: fallback.z };
}

function loc(world, name) {
  const spots = world.city ? world.city.spawnPoints : null;
  return pointOf(spots ? spots[name] : null, FALLBACKS[name]);
}

function missionDefs(world) {
  const garage = loc(world, 'garage');
  const marina = loc(world, 'marina');
  const beachLot = loc(world, 'beachLot');
  const oldTown = loc(world, 'oldTown');
  const harbor = loc(world, 'harbor');
  const hilltop = loc(world, 'hilltop');
  const pier = loc(world, 'pier');
  const park = loc(world, 'park');
  return [
    {
      title: MISSION_TITLES[0],
      intro: { speaker: 'Dom Ferreira', line: 'Nova! Back in Solmar Bay at last. Take my sedan to the Marina — easy money.' },
      outro: 'Clean run. The city remembers a good driver, Nova.',
      steps: [{ type: 'goto', at: garage, radius: 8, text: "Drive to Dom's garage" }],
    },
    {
      title: MISSION_TITLES[1],
      intro: { speaker: 'Dom Ferreira', line: 'The Vipers parked a Sunset GT down at the Beachfront lot. Steal it and bring it back to my garage — no scratches, Nova.' },
      outro: 'The Sunset GT is mine now. The Vipers will be furious — good.',
      steps: [
        { type: 'steal', at: beachLot, carType: 'sports', text: 'Steal the Sunset GT sports car parked at the Beachfront lot' },
        { type: 'deliver', at: garage, radius: 8, text: "Deliver the Sunset GT to Dom's garage" },
      ],
    },
    {
      title: MISSION_TITLES[2],
      intro: { speaker: 'Dom Ferreira', line: 'The Vipers want their car back. Teach them a lesson at the Beachfront lot, then meet me at the Marina.' },
      outro: 'Four Vipers down and you did not even sweat. The Bay is watching.',
      steps: [
        { type: 'goto', at: beachLot, radius: 10, text: 'Head to the Beachfront lot' },
        { type: 'kill', at: beachLot, count: 4, text: 'Take out 4 Viper crew at the Beachfront' },
        { type: 'goto', at: marina, radius: 8, text: 'Meet Dom at the Marina' },
      ],
    },
    {
      title: MISSION_TITLES[3],
      intro: { speaker: 'Dom Ferreira', line: 'A package is waiting in Old Town. Grab it — and if the cops show, lose them. Quiet streets only.' },
      outro: 'Package delivered, heat gone. You move like a ghost, Nova.',
      steps: [
        { type: 'goto', at: oldTown, radius: 8, text: 'Head to Old Town' },
        { type: 'pickup', at: oldTown, radius: 4, text: 'Pick up the package in Old Town' },
        { type: 'escape', text: 'Lose the heat — stay out of trouble until your wanted level clears' },
      ],
    },
    {
      title: MISSION_TITLES[4],
      intro: { speaker: 'Dom Ferreira', line: "A truck full of cargo is sitting at the Harbor. Get it to my garage in 150 seconds — the buyer won't wait." },
      outro: 'Right on the clock. The buyer is already asking for you by name.',
      steps: [
        { type: 'goto', at: harbor, radius: 10, text: 'Get to the Harbor' },
        { type: 'timed', at: harbor, dest: garage, seconds: 150, carType: 'truck', text: "Drive the truck to Dom's garage — fast!" },
      ],
    },
    {
      title: MISSION_TITLES[5],
      intro: { speaker: 'Dom Ferreira', line: 'This is it, Nova. The Vipers are massing on the hilltop. Finish them, then meet me at the Marina and take your crown.' },
      outro: 'The hilltop is ours. Solmar Bay has a new name on every street corner: yours.',
      steps: [
        { type: 'goto', at: hilltop, radius: 10, text: 'Head to the hilltop' },
        { type: 'kill', at: hilltop, count: 6, text: 'Take out 6 Viper crew on the hilltop' },
        { type: 'goto', at: marina, radius: 8, text: 'Meet Dom at the Marina — the city is yours' },
      ],
    },
    {
      title: MISSION_TITLES[6],
      intro: { speaker: 'Dom Ferreira', line: 'A midnight delivery, Nova — fragile cargo, tight clock. Pier to the park in 120 seconds, and do not scratch the paint.' },
      outro: 'Delivered with time to spare. You drive like the night itself owes you.',
      steps: [
        { type: 'goto', at: pier, radius: 8, text: 'Pick up the cargo at the pier' },
        { type: 'timed', at: pier, dest: park, seconds: 120, carType: 'van', text: 'Deliver the cargo to the park — 120 seconds!' },
      ],
    },
    {
      title: MISSION_TITLES[7],
      intro: { speaker: 'Dom Ferreira', line: 'A Viper courier is running the city tonight. Tail his sedan — close enough to see, far enough that he never looks twice. Forty-five seconds.' },
      outro: 'He led us straight to their stash house. Beautiful tail work, Nova.',
      steps: [
        { type: 'tail', route: [marina, harbor, oldTown, garage], seconds: 45, text: 'Tail the Viper courier — stay hidden' },
      ],
    },
  ];
}

function makeBeacon(colorHex) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 20, 1, true), beamMat);
  beam.position.y = 20;
  group.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  group.add(ring);
  group.visible = false;
  return { group, ring };
}

function readPoint(entry) {
  if (!entry) return null;
  if (typeof entry.x === 'number' && typeof entry.z === 'number') return { x: entry.x, z: entry.z };
  if (Array.isArray(entry) && entry.length >= 2) return { x: entry[0], z: entry[1] };
  return null;
}

export function createMissions(world) {
  const state = world.state;
  const rng = world.rng;
  let defs = null;
  let beacon = null;
  let taxiBeacon = null;
  let beaconsReady = false;

  let active = false; // a story mission is currently running
  let targetCar = null; // steal/deliver target car record
  let targetTruck = null; // timed-job truck record
  let keepTruck = false; // retrying a timed job while the player sits in the truck
  let killSpawned = false;
  let killCount = 0;
  let timedStep = null; // active timed step, if any
  let timedLeft = 0; // seconds left when the last timed step finished
  let tailCar = null; // the car being tailed
  let tailRoute = null;
  let tailAt = 0;
  let tailTimer = 0;
  let tailSeen = 0; // spotted meter 0..1
  let tailLost = 0; // lost meter 0..1

  const collectedPackages = new Set();
  let packageMeshes = null;

  const taxi = { mode: 'idle', spot: null, dest: null, cooldown: 6 };

  function ensureBeacons() {
    if (beaconsReady) return;
    if (!world.scene) return;
    beacon = makeBeacon(0xffd23e);
    world.scene.add(beacon.group);
    taxiBeacon = makeBeacon(0x37d67a);
    world.scene.add(taxiBeacon.group);
    beaconsReady = true;
    buildPackageMeshes();
  }

  function buildPackageMeshes() {
    const spots = world.city ? world.city.packages : null;
    if (!Array.isArray(spots)) return;
    packageMeshes = spots.map((spot) => {
      const at = readPoint(spot);
      if (!at) return null;
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xf2c200, emissive: 0xd8a018, emissiveIntensity: 0.7, roughness: 0.6 }),
      );
      box.position.y = 0.8;
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.12, 0.95),
        new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 0.8 }),
      );
      lid.position.y = 1.28;
      g.add(box, lid);
      g.position.set(at.x, 0, at.z);
      world.scene.add(g);
      return g;
    });
  }

  function toast(text) {
    state.events.emit('toast', { text });
  }

  function sfx(name) {
    state.events.emit('sfx', { name });
  }

  function showIntro(mission) {
    if (world.hud && typeof world.hud.showDialogue === 'function') {
      world.hud.showDialogue(mission.intro.speaker, mission.intro.line, 6500);
    }
  }

  function setObjective(text) {
    state.mission.objective = text;
  }

  function setMarker(point) {
    state.mission.marker = point ? { x: point.x, z: point.z } : null;
  }

  function spawnTargetCar(kind, x, z) {
    const color = kind === 'sports' ? 0xff5533 : kind === 'truck' ? 0x3f6fb5 : kind === 'van' ? 0x8a93a5 : 0x8a93a5;
    const car = new Car(world, kind, x, z, 0, color);
    car.target = true;
    if (world.traffic && Array.isArray(world.traffic.cars)) {
      world.traffic.cars.push({ car, kind: 'parked' });
    }
    return car;
  }

  function syncTargetMesh(car) {
    if (!car) return;
    if (state.player.car === car) return;
    if (typeof car.sync === 'function') car.sync();
  }

  function spotsAround(x, z, count) {
    const spots = [];
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + (rng ? rng.next() * 0.6 : 0);
      const r = 8 + (rng ? rng.next() * 10 : 5);
      spots.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
    }
    return spots;
  }

  function setupStep() {
    const mission = defs[state.mission.index];
    const step = mission.steps[state.mission.phase];
    if (!step) return;
    killSpawned = false;
    killCount = 0;
    timedStep = null;
    state.mission.timer = 0;

    switch (step.type) {
      case 'goto':
      case 'pickup':
        setMarker(step.at);
        setObjective(step.text);
        break;
      case 'steal': {
        if (!targetCar) targetCar = spawnTargetCar(step.carType || 'sports', step.at.x, step.at.z);
        if (targetCar) {
          targetCar.x = step.at.x;
          targetCar.z = step.at.z;
          syncTargetMesh(targetCar);
        }
        setMarker(step.at);
        setObjective(step.text);
        break;
      }
      case 'deliver': {
        if (!targetCar) {
          targetCar = spawnTargetCar('sports', state.player.x + 6, state.player.z);
        }
        setMarker(step.at);
        setObjective(step.text);
        break;
      }
      case 'kill': {
        killCount = step.count;
        setMarker(step.at);
        setObjective(step.text);
        try {
          if (world.combat && typeof world.combat.spawnEnemies === 'function') {
            world.combat.spawnEnemies(spotsAround(step.at.x, step.at.z, step.count), step.count);
            killSpawned = true;
          }
        } catch (_err) {
          killSpawned = false;
        }
        break;
      }
      case 'escape':
        setMarker(null);
        setObjective(step.text);
        commitCrime(state, 200); // 2 stars of heat (100 per star).
        toast('The cops are onto you — lose them!');
        break;
      case 'timed': {
        timedStep = step;
        if (targetTruck) {
          targetTruck.x = step.at.x;
          targetTruck.z = step.at.z;
          syncTargetMesh(targetTruck);
        } else {
          targetTruck = spawnTargetCar(step.carType || 'truck', step.at.x, step.at.z);
        }
        targetCar = targetTruck;
        state.mission.timer = step.seconds;
        setMarker(step.dest);
        setObjective(`${step.text} — ${step.seconds}s left!`);
        break;
      }
      case 'tail': {
        if (tailCar) removeTargetVehicle(tailCar);
        tailRoute = step.route.slice();
        tailAt = 0;
        tailTimer = step.seconds;
        tailSeen = 0;
        tailLost = 0;
        const start = tailRoute[0];
        tailCar = spawnTargetCar('sedan', start.x, start.z);
        tailCar.target = true;
        if (world.traffic && Array.isArray(world.traffic.cars)) {
          const entry = world.traffic.cars.find((e) => e.car === tailCar);
          if (entry) entry.kind = 'tail';
        }
        setMarker({ x: tailCar.x, z: tailCar.z });
        setObjective(`${step.text} — ${step.seconds}s`);
        break;
      }
      default:
        setMarker(step.at || null);
        setObjective(step.text || '');
        break;
    }
  }

  function startMission(index) {
    defs = missionDefs(world);
    if (index >= defs.length) {
      active = false;
      state.mission.index = defs.length;
      state.mission.phase = 0;
      state.mission.done = true;
      state.mission.timer = 0;
      setMarker(null);
      setObjective(FREE_ROAM_OBJECTIVE);
      return;
    }
    active = true;
    state.mission.index = index;
    state.mission.phase = 0;
    state.mission.done = false;
    if (targetCar && !(keepTruck && targetCar === targetTruck)) targetCar.target = false;
    if (targetTruck && !keepTruck) targetTruck.target = false;
    targetCar = null;
    if (!keepTruck) targetTruck = null;
    keepTruck = false;
    if (tailCar) { removeTargetVehicle(tailCar); tailCar = null; }
    tailRoute = null;
    taxi.mode = 'idle';
    taxi.spot = null;
    taxi.dest = null;
    taxi.cooldown = 8;
    setupStep();
    showIntro(defs[index]);
  }

  function completeMission() {
    const mission = defs[state.mission.index];
    const reward = CONFIG.MISSIONS.REWARD[state.mission.index] || 0;
    const respect = (CONFIG.MISSIONS.RESPECT_REWARD && CONFIG.MISSIONS.RESPECT_REWARD[state.mission.index]) || 0;
    addMoney(state, reward);
    if (respect > 0) addRespect(state, respect);
    state.stats.missionsDone += 1;
    if (timedLeft > 30) state.stats.missionsOnTime += 1;
    timedLeft = 0;
    sfx('mission');
    toast(`Mission complete! +$${reward}${respect > 0 ? `, +${respect} respect` : ''}`);
    if (mission.outro && world.hud && typeof world.hud.showDialogue === 'function') {
      world.hud.showDialogue('Dom Ferreira', mission.outro, 6000);
    }
    saveGame(state);
    const next = state.mission.index + 1;
    if (next >= defs.length) {
      active = false;
      state.mission.index = defs.length;
      state.mission.phase = 0;
      state.mission.done = true;
      state.mission.timer = 0;
      setMarker(null);
      setObjective(FREE_ROAM_OBJECTIVE);
      if (world.hud && typeof world.hud.showDialogue === 'function') {
        world.hud.showDialogue(
          'Dom Ferreira',
          'That is how you take a city, Nova. Solmar Bay is yours — the streets, the fares, all of it.',
          7000,
        );
      }
    } else {
      startMission(next);
    }
  }

  function removeTargetVehicle(car) {
    if (!car) return;
    try {
      if (typeof car.destroy === 'function') car.destroy();
      const cars = world.traffic ? world.traffic.cars : null;
      if (Array.isArray(cars)) {
        const i = cars.findIndex((e) => e && (e.car === car || e === car));
        if (i >= 0) cars.splice(i, 1);
      }
    } catch (_err) {
    }
  }

  function failMission(reason) {
    toast(`Mission failed — ${reason}`);
    if (world.hud && typeof world.hud.showDialogue === 'function') {
      world.hud.showDialogue(
        'Dom Ferreira',
        'Too slow, Nova! The buyer walked. We run it again — go!',
        5000,
      );
    }
    const index = state.mission.index;
    keepTruck = state.player.car === targetTruck;
    if (!keepTruck) removeTargetVehicle(targetTruck);
    if (targetCar && targetCar !== targetTruck && state.player.car !== targetCar) {
      removeTargetVehicle(targetCar);
    }
    targetCar = null;
    if (!keepTruck) targetTruck = null;
    startMission(index);
  }

  function advanceStep() {
    state.mission.phase += 1;
    const mission = defs[state.mission.index];
    if (state.mission.phase >= mission.steps.length) {
      completeMission();
    } else {
      setupStep();
    }
  }

  function enemiesAlive() {
    try {
      if (world.combat && typeof world.combat.enemiesAlive === 'function') {
        return world.combat.enemiesAlive();
      }
    } catch (_err) {
      return 0;
    }
    return 0;
  }

  function updateMissionStep(dt) {
    if (!defs) defs = missionDefs(world);
    const mission = defs[state.mission.index];
    if (!mission) return;
    const step = mission.steps[state.mission.phase];
    if (!step) return;
    const px = state.player.x;
    const pz = state.player.z;

    switch (step.type) {
      case 'goto':
      case 'pickup': {
        if (distance2D(px, pz, step.at.x, step.at.z) <= (step.radius || 6)) {
          if (step.type === 'pickup') {
            sfx('pickup');
            toast('Package secured.');
          }
          advanceStep();
        }
        break;
      }
      case 'steal': {
        if (targetCar && state.player.car === targetCar) {
          toast('Got the car — now deliver it!');
          advanceStep();
        }
        break;
      }
      case 'deliver': {
        if (
          targetCar &&
          state.player.car === targetCar &&
          distance2D(px, pz, step.at.x, step.at.z) <= (step.radius || 8)
        ) {
          advanceStep();
        }
        break;
      }
      case 'kill': {
        if (!world.combat || typeof world.combat.spawnEnemies !== 'function') {
          if (distance2D(px, pz, step.at.x, step.at.z) <= 10) advanceStep();
          break;
        }
        if (killSpawned) {
          const alive = enemiesAlive();
          setObjective(`${step.text} — ${alive} left`);
          if (alive <= 0) advanceStep();
        }
        break;
      }
      case 'escape': {
        coolWanted(state, dt);
        if (state.wanted <= 0) {
          toast('Clean. The heat is off.');
          advanceStep();
        }
        break;
      }
      case 'timed': {
        state.mission.timer -= dt;
        const left = Math.max(0, Math.ceil(state.mission.timer));
        setObjective(`${step.text} — ${left}s left!`);
        if (
          targetCar &&
          state.player.car === targetCar &&
          distance2D(px, pz, step.dest.x, step.dest.z) <= 8
        ) {
          timedLeft = Math.max(0, state.mission.timer);
          advanceStep();
          break;
        }
        if (state.mission.timer <= 0) {
          failMission('the truck job timed out');
        }
        break;
      }
      case 'tail': {
        if (tailCar && tailRoute) {
          const dest = tailRoute[tailAt];
          const d = distance2D(tailCar.x, tailCar.z, dest.x, dest.z);
          if (d < 10) tailAt = (tailAt + 1) % tailRoute.length;
          const next = tailRoute[tailAt];
          tailCar.updateAuto(dt, 11, Math.atan2(next.x - tailCar.x, next.z - tailCar.z));
          setMarker({ x: tailCar.x, z: tailCar.z });
        }
        const dist = tailCar ? distance2D(px, pz, tailCar.x, tailCar.z) : 999;
        tailTimer -= dt;
        if (dist < 12) tailSeen += dt * 0.5;
        else tailSeen = Math.max(0, tailSeen - dt * 0.3);
        if (dist > 70) tailLost += dt * 0.4;
        else tailLost = Math.max(0, tailLost - dt * 0.3);
        const left = Math.max(0, Math.ceil(tailTimer));
        setObjective(`${step.text} — ${left}s (spotted ${Math.round(tailSeen * 100)}%)`);
        if (tailSeen >= 1) {
          toast('Spotted! The courier made you — fall back and try again.');
          setupStep();
          break;
        }
        if (tailLost >= 1) {
          toast('You lost the courier — get back on his tail!');
          setupStep();
          break;
        }
        if (tailTimer <= 0) advanceStep();
        break;
      }
      default:
        break;
    }
  }

  function updatePackages(dt) {
    const packages = world.city ? world.city.packages : null;
    if (!Array.isArray(packages)) return;
    const px = state.player.x;
    const pz = state.player.z;
    for (let i = 0; i < packages.length; i += 1) {
      if (collectedPackages.has(i)) continue;
      const pkg = packages[i];
      if (pkg && pkg.collected) {
        collectedPackages.add(i);
        continue;
      }
      const at = readPoint(pkg);
      if (!at) continue;
      if (packageMeshes && packageMeshes[i]) {
        packageMeshes[i].rotation.y += dt * 1.2;
        packageMeshes[i].children[0].position.y = 0.8 + Math.sin(state.time * 2 + i) * 0.12;
      }
      if (distance2D(px, pz, at.x, at.z) <= 2.5) {
        collectedPackages.add(i);
        if (pkg) pkg.collected = true;
        if (packageMeshes && packageMeshes[i]) packageMeshes[i].visible = false;
        addMoney(state, CONFIG.MISSIONS.PACKAGE_VALUE);
        state.stats.packagesFound += 1;
        sfx('pickup');
        toast(`Package found! +$${CONFIG.MISSIONS.PACKAGE_VALUE}`);
      }
    }
  }

  function randomSidewalkPoint(minDistFromPlayer = 0) {
    const sidewalks = world.city ? world.city.sidewalks : null;
    const px = state.player.x;
    const pz = state.player.z;
    for (let tries = 0; tries < 12; tries += 1) {
      let at = null;
      if (Array.isArray(sidewalks) && sidewalks.length > 0 && rng) {
        const entry = rng.pick(sidewalks);
        if (entry && typeof entry.x1 === 'number') {
          const t = rng.next();
          at = { x: entry.x1 + (entry.x2 - entry.x1) * t, z: entry.z1 + (entry.z2 - entry.z1) * t };
        } else {
          at = readPoint(entry);
        }
      }
      if (!at && rng) {
        const lines = CONFIG.ROAD_LINES;
        at = {
          x: lines[Math.floor(rng.next() * lines.length)] + (rng.next() * 8 - 4),
          z: -252 + rng.next() * 504,
        };
      }
      if (!at) return null;
      if (minDistFromPlayer > 0 && distance2D(px, pz, at.x, at.z) < minDistFromPlayer) continue;
      return at;
    }
    return null;
  }

  function updateTaxi(dt) {
    if (!beaconsReady) return;
    if (active) {
      if (taxi.mode !== 'idle') {
        taxi.mode = 'idle';
        taxi.spot = null;
        taxi.dest = null;
      }
      taxiBeacon.group.visible = false;
      return;
    }
    if (taxi.cooldown > 0) taxi.cooldown -= dt;

    if (taxi.mode === 'idle') {
      taxiBeacon.group.visible = false;
      if (taxi.cooldown <= 0) {
        const spot = randomSidewalkPoint(40);
        if (spot) {
          taxi.spot = spot;
          taxi.dest = null;
          taxi.mode = 'waiting';
          taxiBeacon.group.position.set(spot.x, 0, spot.z);
          taxiBeacon.group.visible = true;
          toast(`Taxi customer waiting in ${districtName(spot)} — drive over in a car.`);
        } else {
          taxi.cooldown = 5;
        }
      }
      return;
    }

    if (taxi.mode === 'waiting') {
      taxiBeacon.group.position.set(taxi.spot.x, 0, taxi.spot.z);
      taxiBeacon.group.visible = true;
      if (
        state.player.car &&
        distance2D(state.player.x, state.player.z, taxi.spot.x, taxi.spot.z) <= 6
      ) {
        const dest = randomSidewalkPoint(0);
        let d = dest;
        for (let tries = 0; d && tries < 8 && distance2D(taxi.spot.x, taxi.spot.z, d.x, d.z) < 80; tries += 1) {
          d = randomSidewalkPoint(0);
        }
        taxi.dest = d || { x: -taxi.spot.x, z: -taxi.spot.z };
        taxi.mode = 'fare';
        taxiBeacon.group.position.set(taxi.dest.x, 0, taxi.dest.z);
        toast(`Fare started — take your passenger to ${districtName(taxi.dest)}.`);
      }
      return;
    }

    taxiBeacon.group.position.set(taxi.dest.x, 0, taxi.dest.z);
    taxiBeacon.group.visible = true;
    if (!state.player.car) {
      taxi.mode = 'idle';
      taxi.spot = null;
      taxi.dest = null;
      taxi.cooldown = 5;
      taxiBeacon.group.visible = false;
      toast('Fare cancelled — your passenger walked off.');
      return;
    }
    if (distance2D(state.player.x, state.player.z, taxi.dest.x, taxi.dest.z) <= 8) {
      const trip = distance2D(taxi.spot.x, taxi.spot.z, taxi.dest.x, taxi.dest.z);
      const fare = Math.round(CONFIG.MISSIONS.TAXI_FARE + trip * (CONFIG.MISSIONS.TAXI_PER_METRE || 0));
      addMoney(state, fare);
      addRespect(state, 10);
      state.stats.faresDone += 1;
      sfx('pickup');
      toast(`Fare complete! +$${fare}, +10 respect`);
      taxi.mode = 'idle';
      taxi.spot = null;
      taxi.dest = null;
      taxi.cooldown = 8;
      taxiBeacon.group.visible = false;
    }
  }

  function districtName(at) {
    try {
      return districtAt(at.x, at.z);
    } catch (_err) {
      return 'Solmar Bay';
    }
  }

  function update(dt) {
    ensureBeacons();
    if (state.screen !== 'playing') {
      if (beaconsReady) {
        beacon.group.visible = false;
        taxiBeacon.group.visible = false;
      }
      return;
    }
    if (beaconsReady) {
      const marker = state.mission.marker;
      if (marker) {
        beacon.group.position.set(marker.x, 0, marker.z);
        beacon.group.visible = true;
        const pulse = 1 + Math.sin(state.time * 3) * 0.25;
        beacon.ring.scale.set(pulse, pulse, 1);
      } else {
        beacon.group.visible = false;
      }
      if (taxiBeacon.group.visible) {
        const pulse = 1 + Math.sin(state.time * 3) * 0.25;
        taxiBeacon.ring.scale.set(pulse, pulse, 1);
      }
    }

    syncTargetMesh(targetCar);
    if (targetTruck && targetTruck !== targetCar) syncTargetMesh(targetTruck);

    updatePackages(dt);
    updateTaxi(dt);
    if (active) updateMissionStep(dt);
  }

  function activeMission() {
    if (!active) return null;
    if (!defs) defs = missionDefs(world);
    return defs[state.mission.index] || null;
  }

  function getTaxiBlip() {
    if (taxi.mode === 'waiting') return taxi.spot;
    if (taxi.mode === 'fare') return taxi.dest;
    return null;
  }

  return { update, startMission, activeMission, getTaxiBlip };
}
