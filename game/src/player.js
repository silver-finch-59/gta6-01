// player.js — on-foot movement, sprint stamina, punching, and camera.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { commitCrime, healPlayer } from './state.js';
import { resolveCircleColliders, clampToWorld, circlesOverlap } from './collide.js';

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function cloth(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
}

export function makeHumanoid({ jacket = 0x2e5fa3, pants = 0x23283a, skin = 0xc98d64, shirt = 0xe8e8e8 } = {}) {
  const group = new THREE.Group();

  const jacketMat = cloth(jacket);
  const pantsMat = cloth(pants);
  const skinMat = cloth(skin);
  const shirtMat = cloth(shirt);
  const darkMat = cloth(0x1a1a1a);

  const bodyGeo = new THREE.CapsuleGeometry(0.32, 0.5, 4, 10);
  const body = new THREE.Mesh(bodyGeo, jacketMat);
  body.position.y = 1.22;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.06), shirtMat);
  chest.position.set(0, 1.26, 0.29);
  group.add(chest);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.05), shirtMat);
  stripe.position.set(0, 1.38, -0.3);
  group.add(stripe);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), skinMat);
  head.position.y = 1.82;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  hair.position.y = 1.86;
  group.add(hair);

  const legGeo = new THREE.BoxGeometry(0.22, 0.82, 0.24);
  legGeo.translate(0, -0.41, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.85, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.16, 0.85, 0);
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.17, 0.68, 0.19);
  armGeo.translate(0, -0.34, 0);
  const armL = new THREE.Mesh(armGeo, jacketMat);
  armL.position.set(-0.43, 1.52, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, jacketMat);
  armR.position.set(0.43, 1.52, 0);
  group.add(armR);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.34), darkMat);
  gun.position.set(0.43, 0.86, 0.22);
  gun.visible = false;
  group.add(gun);

  const shoeGeo = new THREE.BoxGeometry(0.22, 0.1, 0.34);
  shoeGeo.translate(0, -0.78, 0.04);
  const shoeL = new THREE.Mesh(shoeGeo, darkMat);
  shoeL.position.set(-0.16, 0.85, 0);
  group.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, darkMat);
  shoeR.position.set(0.16, 0.85, 0);
  group.add(shoeR);

  group.userData.parts = { body, head, legL, legR, armL, armR, gun, shoeL, shoeR };
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

const MEDIC_SPOTS = [
  { x: -36, z: 244 }, // outside the hospital
  { x: 36, z: 244 }, // outside the garage
  { x: 288, z: 28 }, // beach lot
  { x: -244, z: 172 }, // old town
  { x: 172, z: 244 }, // marina
];

export function createPlayer(world) {
  const { scene, camera, state, input } = world;
  const p = state.player;

  const mesh = makeHumanoid({
    jacket: 0x2e6f8e, // Nova Reyes: teal jacket
    pants: 0x23283a,
    skin: 0xc98d64,
    shirt: 0xf2e8d5,
  });
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 0.9 }),
  );
  pack.position.set(0, 1.3, -0.36);
  pack.castShadow = true;
  mesh.add(pack);
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.yaw;
  scene.add(mesh);

  const medics = MEDIC_SPOTS.map((spot) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x1e9e4a, emissiveIntensity: 0.9 }),
    );
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.5, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x1e9e4a, emissiveIntensity: 0.9 }),
    );
    post.position.y = 1.0;
    bar.position.y = 1.0;
    g.add(post, bar);
    g.position.set(spot.x, 0, spot.z);
    scene.add(g);
    return { group: g, x: spot.x, z: spot.z, timer: 0, active: true };
  });

  let camYaw = p.yaw;
  let camPitch = 0.32;
  let camNear = false; // C toggles near / far
  let velX = 0;
  let velZ = 0;
  let walkPhase = 0;
  let facingYaw = p.yaw;
  let stumbleTimer = 0;
  let punchTimer = 0;
  const camPos = new THREE.Vector3(p.x, 4, p.z + 7);
  const camTarget = new THREE.Vector3(p.x, 1.6, p.z);
  const desiredPos = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();

  function syncMesh() {
    mesh.position.set(p.x, mesh.position.y, p.z);
    mesh.rotation.y = facingYaw;
  }

  function nearestCar(maxDist) {
    const traffic = world.traffic;
    if (!traffic || !traffic.cars) return null;
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (let i = 0; i < traffic.cars.length; i += 1) {
      const entry = traffic.cars[i];
      const car = entry.car || entry;
      if (!car) continue;
      const dx = car.x - p.x;
      const dz = car.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = entry; }
    }
    return best;
  }

  function tryEnterCar() {
    const entry = nearestCar(3.5);
    if (!entry) return;
    const car = entry.car || entry;
    const kind = entry.kind || car.kind || 'traffic';
    p.onFoot = false;
    p.car = car;
    car.kind = 'player';
    if (entry.car) entry.kind = 'player';
    mesh.visible = false;
    p.speed = car.speed || 0;
    if (kind === 'traffic' || kind === 'parked') {
      commitCrime(state, 40);
      state.stats.carsStolen += 1;
      state.events.emit('toast', { text: 'Car stolen! The cops noticed.' });
    }
  }

  function tryExitCar() {
    const car = p.car;
    if (!car) { p.onFoot = true; return; }
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const rx = -fz;
    const rz = fx;
    const colliders = (world.city && world.city.colliders) || [];
    let placed = null;
    for (let side = 1; side >= -1; side -= 2) {
      let x = car.x + rx * 2.2 * side;
      let z = car.z + rz * 2.2 * side;
      const solved = resolveCircleColliders(x, z, CONFIG.PLAYER.RADIUS, colliders);
      x = solved.x; z = solved.z;
      const clamped = clampToWorld(x, z, CONFIG.PLAYER.RADIUS);
      x = clamped.x; z = clamped.z;
      let blocked = false;
      const traffic = world.traffic;
      if (traffic && traffic.cars) {
        for (let i = 0; i < traffic.cars.length; i += 1) {
          const other = traffic.cars[i].car || traffic.cars[i];
          if (other === car) continue;
          if (circlesOverlap(x, z, CONFIG.PLAYER.RADIUS, other.x, other.z, other.radius || CONFIG.CAR.RADIUS)) { blocked = true; break; }
        }
      }
      if (!blocked) { placed = { x, z }; break; }
    }
    if (!placed) placed = { x: car.x + rx * 2.2, z: car.z + rz * 2.2 };
    p.x = placed.x;
    p.z = placed.z;
    p.yaw = car.yaw;
    facingYaw = car.yaw;
    car.kind = 'parked';
    if (world.traffic && world.traffic.cars) {
      for (let i = 0; i < world.traffic.cars.length; i += 1) {
        const e = world.traffic.cars[i];
        if ((e.car || e) === car) e.kind = 'parked';
      }
    }
    if (typeof car.speed === 'number') car.speed = 0;
    p.car = null;
    p.onFoot = true;
    p.speed = 0;
    mesh.visible = true;
    syncMesh();
  }

  function tryPunch() {
    if (!p.onFoot || punchTimer > 0) return;
    if (state.time - p.lastPunchAt < CONFIG.PLAYER.PUNCH_COOLDOWN_SECONDS) return;
    p.lastPunchAt = state.time;
    punchTimer = 0.3;
    state.stats.punchesThrown += 1;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const range = CONFIG.PLAYER.PUNCH_RANGE;
    const combat = world.combat;
    if (combat && combat.enemies) {
      for (const e of combat.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > range || d < 0.001) continue;
        if ((dx / d) * fx + (dz / d) * fz < 0.3) continue;
        e.health -= CONFIG.PLAYER.PUNCH_DAMAGE;
        e.flash = 0.15;
        e.x += (dx / d) * 1.5;
        e.z += (dz / d) * 1.5;
        state.events.emit('sfx', { name: 'punch' });
        return;
      }
    }
    const traffic = world.traffic;
    if (traffic && traffic.peds) {
      for (const ped of traffic.peds) {
        if (ped.fallen) continue;
        const dx = ped.x - p.x;
        const dz = ped.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > range || d < 0.001) continue;
        if ((dx / d) * fx + (dz / d) * fz < 0.3) continue;
        ped.fleeing = true;
        ped.fleeX = dx / d;
        ped.fleeZ = dz / d;
        ped.fleeTimer = 2;
        state.events.emit('sfx', { name: 'punch' });
        return;
      }
    }
  }

  function update(dt) {
    const playing = state.screen === 'playing';
    const keys = input.keys;
    const just = input.justPressed;

    if (playing && just.has('KeyC')) camNear = !camNear;

    const dx = input.lookDX || 0;
    const dy = input.lookDY || 0;
    input.lookDX = 0;
    input.lookDY = 0;
    if (playing && (dx !== 0 || dy !== 0)) {
      camYaw -= dx * 0.005;
      camPitch += dy * 0.004;
      if (camPitch < 0.05) camPitch = 0.05;
      if (camPitch > 1.05) camPitch = 1.05;
    }

    if (playing && just.has('KeyE')) {
      if (p.onFoot) tryEnterCar();
      else tryExitCar();
    }
    if (playing && just.has('KeyQ')) tryPunch();
    if (punchTimer > 0) punchTimer -= dt;

    const sinceHurt = state.time - p.lastDamageAt;
    stumbleTimer = sinceHurt < 0.45 ? 0.45 - sinceHurt : 0;

    const colliders = (world.city && world.city.colliders) || [];

    if (p.onFoot) {
      if (playing) {
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const rx = -fz;
        const rz = fx;
        let mx = 0;
        let mz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += fx; mz += fz; }
        if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= fx; mz -= fz; }
        if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += rx; mz += rz; }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= rx; mz -= rz; }
        const len = Math.hypot(mx, mz);
        if (len > 0.001) { mx /= len; mz /= len; }
        const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const canSprint = wantSprint && p.stamina > 1;
        if (canSprint && len > 0.001) {
          p.stamina = Math.max(0, p.stamina - CONFIG.PLAYER.STAMINA_DRAIN_PER_SECOND * dt);
        } else {
          p.stamina = Math.min(CONFIG.PLAYER.STAMINA_MAX,
            p.stamina + CONFIG.PLAYER.STAMINA_REFILL_PER_SECOND * dt);
        }
        const targetSpeed = canSprint ? CONFIG.PLAYER.RUN_SPEED : CONFIG.PLAYER.WALK_SPEED;
        const accel = 1 - Math.exp(-10 * dt);
        velX += (mx * targetSpeed - velX) * accel;
        velZ += (mz * targetSpeed - velZ) * accel;

        let nx = p.x + velX * dt;
        let nz = p.z + velZ * dt;
        const solved = resolveCircleColliders(nx, nz, CONFIG.PLAYER.RADIUS, colliders);
        nx = solved.x; nz = solved.z;
        const clamped = clampToWorld(nx, nz, CONFIG.PLAYER.RADIUS);
        p.x = clamped.x;
        p.z = clamped.z;

        const traffic = world.traffic;
        if (traffic && traffic.cars) {
          for (let i = 0; i < traffic.cars.length; i += 1) {
            const entry = traffic.cars[i];
            const car = entry.car || entry;
            if (!car) continue;
            const cr = car.radius || CONFIG.CAR.RADIUS;
            const ddx = p.x - car.x;
            const ddz = p.z - car.z;
            const rr = CONFIG.PLAYER.RADIUS + cr;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < rr * rr && d2 > 0.000001) {
              const d = Math.sqrt(d2);
              p.x = car.x + (ddx / d) * rr;
              p.z = car.z + (ddz / d) * rr;
            }
          }
        }

        const speed = Math.hypot(velX, velZ);
        p.speed = speed;

        if (p.armed) {
          facingYaw = angleLerp(facingYaw, camYaw, 1 - Math.exp(-14 * dt));
        } else if (speed > 0.5) {
          const moveYaw = Math.atan2(velX, velZ);
          facingYaw = angleLerp(facingYaw, moveYaw, 1 - Math.exp(-12 * dt));
        }
        p.yaw = facingYaw;

        const speedFactor = Math.min(1, speed / CONFIG.PLAYER.WALK_SPEED);
        walkPhase += dt * speed * 1.7;
        const swing = Math.sin(walkPhase) * 0.62 * speedFactor;
        const parts = mesh.userData.parts;
        parts.legL.rotation.x = swing;
        parts.legR.rotation.x = -swing;
        if (punchTimer > 0) {
          parts.armR.rotation.x = -Math.PI / 2 + 0.4 - punchTimer * 2;
          parts.armL.rotation.x = -swing * 0.8;
        } else if (p.armed) {
          parts.armR.rotation.x = -Math.PI / 2 + 0.12;
          parts.armL.rotation.x = -Math.PI / 2 + 0.35;
        } else {
          parts.armL.rotation.x = -swing * 0.8;
          parts.armR.rotation.x = swing * 0.8;
        }
        mesh.position.y = Math.abs(Math.sin(walkPhase)) * 0.05 * speedFactor;
        mesh.rotation.z = stumbleTimer > 0 ? Math.sin(stumbleTimer * 20) * 0.08 : 0;
        if (parts.gun) parts.gun.visible = !!p.armed;
      } else {
        velX = 0;
        velZ = 0;
        p.speed = 0;
      }
      syncMesh();
    } else {
      const car = p.car;
      if (car && typeof car.updatePlayer === 'function') {
        if (playing) car.updatePlayer(dt, input);
        if (typeof car.sync === 'function') car.sync();
        p.x = car.x;
        p.z = car.z;
        p.yaw = car.yaw;
        facingYaw = car.yaw;
        p.speed = car.speed || 0;
        mesh.position.set(car.x, 0, car.z);
        mesh.rotation.y = car.yaw;
        mesh.rotation.z = 0; // no stumble lean while seated
      }
      const parts = mesh.userData.parts;
      if (parts && parts.gun) parts.gun.visible = false;
    }

    for (const med of medics) {
      if (!med.active) {
        med.timer -= dt;
        if (med.timer <= 0) {
          med.active = true;
          med.group.visible = true;
        }
        continue;
      }
      med.group.rotation.y += dt * 1.5;
      if (playing && p.onFoot && circlesOverlap(p.x, p.z, CONFIG.PLAYER.RADIUS, med.x, med.z, 1.2)) {
        const healed = healPlayer(state, 40);
        if (healed > 0) {
          med.active = false;
          med.group.visible = false;
          med.timer = 60;
          state.events.emit('sfx', { name: 'pickup' });
          state.events.emit('toast', { text: `+${Math.round(healed)} health` });
        }
      }
    }

    if (playing && state.health > 0 && state.health < CONFIG.PLAYER.MAX_HEALTH
      && state.time - p.lastDamageAt > CONFIG.PLAYER.REGEN_DELAY_SECONDS) {
      state.health = Math.min(CONFIG.PLAYER.MAX_HEALTH,
        state.health + CONFIG.PLAYER.HEALTH_REGEN_PER_SECOND * dt);
    }

    const baseDist = p.onFoot ? 7 : 10;
    const dist = camNear ? baseDist * 0.6 : baseDist;
    const targetX = p.x;
    const targetZ = p.z;
    const targetY = p.onFoot ? 1.6 : 1.4;
    const horiz = dist * Math.cos(camPitch);
    const camDirX = Math.sin(camYaw);
    const camDirZ = Math.cos(camYaw);
    const shoulder = p.armed && p.onFoot ? 0.9 : 0;
    const sideX = -camDirZ;
    const sideZ = camDirX;
    desiredPos.set(
      targetX - camDirX * horiz + sideX * shoulder,
      targetY + dist * Math.sin(camPitch) + 0.4,
      targetZ - camDirZ * horiz + sideZ * shoulder,
    );
    if (desiredPos.y < 0.6) desiredPos.y = 0.6;
    const clampedCam = clampToWorld(desiredPos.x, desiredPos.z, 1);
    desiredPos.x = clampedCam.x;
    desiredPos.z = clampedCam.z;
    desiredTarget.set(targetX + sideX * shoulder * 0.5, targetY, targetZ + sideZ * shoulder * 0.5);

    const k = 1 - Math.exp(-10 * dt);
    camPos.lerp(desiredPos, k);
    camTarget.lerp(desiredTarget, 1 - Math.exp(-14 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  function teleport(x, z, yaw) {
    p.x = x;
    p.z = z;
    if (typeof yaw === 'number') {
      p.yaw = yaw;
      facingYaw = yaw;
      camYaw = yaw;
    }
    if (p.car) {
      p.car.x = x;
      p.car.z = z;
      if (typeof yaw === 'number') p.car.yaw = yaw;
      if (typeof p.car.sync === 'function') p.car.sync();
    }
    velX = 0;
    velZ = 0;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = facingYaw;
    camPos.set(x - Math.sin(camYaw) * 7, 4, z - Math.cos(camYaw) * 7);
    camTarget.set(x, 1.6, z);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  function enterCar(car) {
    if (!car) return;
    p.onFoot = false;
    p.car = car;
    car.kind = 'player';
    mesh.visible = false;
  }

  function exitCar() {
    if (p.onFoot) return;
    tryExitCar();
  }

  return {
    mesh,
    medics,
    get x() { return p.x; },
    get z() { return p.z; },
    get yaw() { return p.yaw; },
    update,
    enterCar,
    exitCar,
    teleport,
  };
}
