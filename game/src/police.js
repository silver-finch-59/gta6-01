// police.js — chases, PIT maneuvers, foot cops, roadblocks, and helicopter.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Car, getPlayerCar } from './vehicles.js';
import { makeHumanoid } from './player.js';
import { hurtPlayer, clearWanted } from './state.js';
import { resolveCircleColliders, clampToWorld, circlesOverlap } from './collide.js';

const COP_SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0, 0x6e4426];
const TRACER_COUNT = 10;
const TRACER_LIFE = 0.15;

function fallbackNodes() {
  const nodes = [];
  for (const x of CONFIG.ROAD_LINES) {
    for (const z of CONFIG.ROAD_LINES) nodes.push({ x, z });
  }
  return nodes;
}

export function createPolice(world) {
  const { scene, rng, state } = world;
  const city = world.city || {};
  const nodes =
    city.roadGraph && city.roadGraph.nodes && city.roadGraph.nodes.length
      ? city.roadGraph.nodes
      : fallbackNodes();
  const colliders = city.colliders || [];

  const policeCars = []; // { car: Car, ramCooldown: number, pitCooldown?: number }
  const cops = []; // { mesh, x, z, bustTimer, shootTimer, phase }
  const roadblocks = []; // { car: Car, life: number }

  const tracers = [];
  let tracerIdx = 0;
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.6, 5),
    new THREE.MeshStandardMaterial({ color: 0x1a2a5e, roughness: 0.5, metalness: 0.4 }),
  );
  heliBody.castShadow = true;
  const heliTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x1a2a5e, roughness: 0.5, metalness: 0.4 }),
  );
  heliTail.position.set(0, 0.2, -4);
  const heliRotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }),
  );
  heliRotor.position.y = 1.1;
  const heliLight = new THREE.Mesh(
    new THREE.ConeGeometry(6, 45, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  );
  heliLight.position.y = -22;
  heliLight.rotation.x = Math.PI;
  heli.add(heliBody, heliTail, heliRotor, heliLight);
  heli.visible = false;
  scene.add(heli);
  let heliAngle = 0;

  let sirenOn = false;

  function fireTracer(x1, z1, x2, z2) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, 1.4, z1);
    pos.setXYZ(1, x2, 1.2, z2);
    pos.needsUpdate = true;
    t.life = TRACER_LIFE;
    t.line.visible = true;
    t.line.material.opacity = 1;
  }

  function spawnPoliceCar() {
    const px = state.player.x;
    const pz = state.player.z;
    const cands = [];
    let best = null;
    let bestScore = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d > CONFIG.POLICE.SPAWN_DISTANCE * 0.65 && d < CONFIG.POLICE.SPAWN_DISTANCE * 1.5) {
        cands.push(n);
      }
      const score = Math.abs(d - CONFIG.POLICE.SPAWN_DISTANCE);
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    const node = cands.length ? rng.pick(cands) : best;
    if (!node) return;
    const yaw = Math.atan2(px - node.x, pz - node.z);
    const car = new Car(world, 'police', node.x, node.z, yaw, 0x14161a);
    policeCars.push({ car, ramCooldown: 0, pitCooldown: 0 });
  }

  function removePoliceCarAt(i) {
    policeCars[i].car.destroy();
    policeCars.splice(i, 1);
  }

  function placeRoadblock() {
    const p = state.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const cx = p.x + fx * 48;
    const cz = p.z + fz * 48;
    const rx = -fz;
    const rz = fx;
    for (const side of [-1, 1]) {
      const x = cx + rx * 3.2 * side;
      const z = cz + rz * 3.2 * side;
      const car = new Car(world, 'police', x, z, p.yaw + Math.PI / 2, 0x14161a);
      car.speed = 0;
      roadblocks.push({ car, life: 25 });
    }
    state.events.emit('toast', { text: 'Roadblock ahead!' });
  }

  function clearRoadblocks() {
    for (const rb of roadblocks) rb.car.destroy();
    roadblocks.length = 0;
  }

  function spawnCop() {
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(25, 35);
    let x = state.player.x + Math.cos(ang) * dist;
    let z = state.player.z + Math.sin(ang) * dist;
    const cl = clampToWorld(x, z, 1);
    x = cl.x;
    z = cl.z;
    if (colliders.length) {
      const r = resolveCircleColliders(x, z, 0.7, colliders);
      x = r.x;
      z = r.z;
    }
    const mesh = makeHumanoid({
      jacket: 0x1a2a5e,
      pants: 0x1a2a5e,
      skin: rng.pick(COP_SKINS),
      shirt: 0xdfe6ff,
    });
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    cops.push({
      mesh,
      x,
      z,
      bustTimer: 0,
      shootTimer: rng.range(0.4, 1.2),
      phase: rng.range(0, Math.PI * 2),
    });
  }

  let roadblockTimer = 0;

  function update(dt) {
    const playing = state.screen === 'playing';
    const wanted = state.wanted;
    const px = state.player.x;
    const pz = state.player.z;
    const playerCar = getPlayerCar(state);

    const wantSiren = wanted > 0;
    if (wantSiren !== sirenOn) {
      sirenOn = wantSiren;
      state.events.emit('sfx', { name: 'siren', on: sirenOn });
    }

    const desired = wanted === 0 ? 0 : Math.min(wanted + 1, CONFIG.POLICE.MAX_CARS);
    while (policeCars.length < desired) {
      const before = policeCars.length;
      spawnPoliceCar();
      if (policeCars.length === before) break; // no spawn point available
    }
    while (policeCars.length > desired) removePoliceCarAt(policeCars.length - 1);

    for (let i = policeCars.length - 1; i >= 0; i -= 1) {
      const entry = policeCars[i];
      const car = entry.car;
      const dist = Math.hypot(px - car.x, pz - car.z);
      if (dist > CONFIG.POLICE.DESPAWN_DISTANCE || wanted === 0) {
        removePoliceCarAt(i);
        continue;
      }
      let targetSpeed = CONFIG.POLICE.CHASE_SPEED;
      if (state.player.onFoot && dist < 25) targetSpeed = CONFIG.POLICE.CHASE_SPEED * 0.6;
      car.updateAuto(dt, targetSpeed, Math.atan2(px - car.x, pz - car.z));
      entry.ramCooldown = Math.max(0, (entry.ramCooldown || 0) - dt);
      entry.pitCooldown = Math.max(0, (entry.pitCooldown || 0) - dt);

      if (playerCar && !state.player.onFoot && entry.ramCooldown <= 0) {
        if (circlesOverlap(car.x, car.z, car.radius, playerCar.x, playerCar.z, playerCar.radius)) {
          entry.ramCooldown = 1;
          hurtPlayer(state, CONFIG.POLICE.RAM_DAMAGE);
          playerCar.pushFrom(car.x, car.z, car.radius);
          state.events.emit('sfx', { name: 'crash' });
          if (rng.chance(0.35)) state.events.emit('toast', { text: 'Police rammed you!' });
        }
      }

      if (playerCar && !state.player.onFoot && entry.pitCooldown <= 0
        && Math.abs(playerCar.speed) > 15 && dist < 5.5 && dist > 2.5) {
        const sideX = playerCar.x - car.x;
        const sideZ = playerCar.z - car.z;
        const sd = Math.hypot(sideX, sideZ) || 1;
        const fx = Math.sin(playerCar.yaw);
        const fz = Math.cos(playerCar.yaw);
        const alongside = Math.abs(((sideX / sd) * fx) + ((sideZ / sd) * fz)) < 0.6;
        if (alongside) {
          entry.pitCooldown = 4;
          playerCar.yaw += ((sideX / sd) * -fz + (sideZ / sd) * fx) > 0 ? 0.45 : -0.45;
          playerCar.speed *= 0.8;
          playerCar.pushFrom(car.x, car.z, car.radius + 0.6);
          hurtPlayer(state, 4);
          state.events.emit('sfx', { name: 'crash' });
          state.events.emit('toast', { text: 'PIT maneuver!' });
        }
      }
    }

    const trafficCars = world.traffic && world.traffic.cars ? world.traffic.cars : [];
    for (let i = 0; i < policeCars.length; i += 1) {
      const a = policeCars[i].car;
      for (let j = i + 1; j < policeCars.length; j += 1) {
        const b = policeCars[j].car;
        if (circlesOverlap(a.x, a.z, a.radius, b.x, b.z, b.radius)) {
          a.pushFrom(b.x, b.z, b.radius);
          b.pushFrom(a.x, a.z, a.radius);
        }
      }
      for (const t of trafficCars) {
        const tc = t.car;
        if (!tc || tc === playerCar) continue;
        if (circlesOverlap(a.x, a.z, a.radius, tc.x, tc.z, tc.radius)) {
          a.pushFrom(tc.x, tc.z, tc.radius);
          tc.pushFrom(a.x, a.z, a.radius);
        }
      }
      a.sync();
    }

    roadblockTimer -= dt;
    if (wanted >= CONFIG.POLICE.ROADBLOCK_STARS && playing && !state.player.onFoot
      && roadblocks.length === 0 && roadblockTimer <= 0) {
      placeRoadblock();
      roadblockTimer = 20;
    }
    if (wanted < CONFIG.POLICE.ROADBLOCK_STARS && roadblocks.length) clearRoadblocks();
    for (let i = roadblocks.length - 1; i >= 0; i -= 1) {
      const rb = roadblocks[i];
      rb.life -= dt;
      const d = Math.hypot(px - rb.car.x, pz - rb.car.z);
      if (rb.life <= 0 || d > 90) {
        rb.car.destroy();
        roadblocks.splice(i, 1);
        continue;
      }
      if (playerCar && circlesOverlap(rb.car.x, rb.car.z, rb.car.radius, playerCar.x, playerCar.z, playerCar.radius)) {
        playerCar.pushFrom(rb.car.x, rb.car.z, rb.car.radius);
        if (Math.abs(playerCar.speed) > 10) {
          playerCar.speed *= 0.6;
          hurtPlayer(state, 6);
          state.events.emit('sfx', { name: 'crash' });
        }
      }
      rb.car.sync();
    }

    const wantHeli = wanted >= CONFIG.POLICE.HELICOPTER_STARS && playing;
    heli.visible = wantHeli;
    if (wantHeli) {
      heliAngle += dt * 0.35;
      const hx = px + Math.cos(heliAngle) * 42;
      const hz = pz + Math.sin(heliAngle) * 42;
      heli.position.set(hx, 46 + Math.sin(state.time * 0.8) * 1.5, hz);
      heli.rotation.y = -heliAngle;
      heliRotor.rotation.y += dt * 22;
      heliLight.material.opacity = 0.10 + Math.sin(state.time * 2.2) * 0.04;
    }

    const wantCops = wanted >= 2 ? Math.min(wanted, 5) : 0;
    while (cops.length < wantCops) spawnCop();
    while (cops.length > wantCops) {
      const c = cops.pop();
      scene.remove(c.mesh);
    }

    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const dist = Math.hypot(px - cop.x, pz - cop.z);
      if (dist > 160) {
        scene.remove(cop.mesh);
        cops.splice(i, 1);
        continue;
      }
      const tx = px - cop.x;
      const tz = pz - cop.z;
      const d = Math.hypot(tx, tz) || 1;
      const step = CONFIG.POLICE.COP_FOOT_SPEED * dt;
      cop.x += (tx / d) * step;
      cop.z += (tz / d) * step;
      if (colliders.length) {
        const r = resolveCircleColliders(cop.x, cop.z, 0.7, colliders);
        cop.x = r.x;
        cop.z = r.z;
      }
      const cl = clampToWorld(cop.x, cop.z, 0.7);
      cop.x = cl.x;
      cop.z = cl.z;
      if (playerCar && !state.player.onFoot) {
        const dc = Math.hypot(cop.x - playerCar.x, cop.z - playerCar.z);
        const minD = playerCar.radius + 0.7;
        if (dc < minD && dc > 0.001) {
          cop.x = playerCar.x + ((cop.x - playerCar.x) / dc) * minD;
          cop.z = playerCar.z + ((cop.z - playerCar.z) / dc) * minD;
        }
      }
      cop.phase += dt * 9;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(tx, tz);
      const parts = cop.mesh.userData.parts;
      if (parts) {
        const s = Math.sin(cop.phase);
        parts.legL.rotation.x = s * 0.7;
        parts.legR.rotation.x = -s * 0.7;
        parts.armL.rotation.x = -s * 0.55;
        parts.armR.rotation.x = s * 0.55;
      }

      if (playing && state.player.onFoot && dist < 1.3) {
        cop.bustTimer += dt;
        if (cop.bustTimer >= 1.5) {
          clearWanted(state);
          state.screen = 'busted';
          state.events.emit('busted', {});
          cop.bustTimer = 0;
        }
      } else {
        cop.bustTimer = 0;
      }

      cop.shootTimer -= dt;
      if (playing && wanted >= 3 && dist < 30 && cop.shootTimer <= 0) {
        cop.shootTimer = 1.2;
        hurtPlayer(state, 6);
        fireTracer(cop.x, cop.z, px, pz);
        state.events.emit('sfx', { name: 'shot' });
      }
    }

    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        t.line.material.opacity = 0;
      } else {
        t.line.material.opacity = t.life / TRACER_LIFE;
      }
    }
  }

  return { policeCars, cops, roadblocks, heli, update };
}
