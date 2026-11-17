// Solmar Bay — pistol combat and the Viper crew. Enemies come in three
// flavours: grunts who chase and shoot, rushers who sprint in for a melee
// swing, and shooters who hold their distance and fire in bursts. The
// player shoots with the mouse or F, on foot only; every shot is a ray from
// the camera through the screen centre, checked against enemies first and
// buildings second. Defeated enemies drop a little loot.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { commitCrime, hurtPlayer, healPlayer, addMoney } from './state.js';
import { resolveCircleColliders, clampToWorld, hasLineOfSight } from './collide.js';
import { makeHumanoid } from './player.js';

// Segment (origin + dir * t, 0 <= t <= maxT) against an axis-aligned box.
// Building colliders are 2D footprints; treat them as 24 m tall.
function rayVsBox(ox, oy, oz, dx, dy, dz, maxT, b) {
  let tMin = 0;
  let tMax = maxT;
  const mins = [b.minX, 0, b.minZ];
  const maxs = [b.maxX, 24, b.maxZ];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return -1;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return -1;
    }
  }
  return tMin;
}

const TRACER_POOL = 20;
const TRACER_LIFE = 0.14;

export function createCombat(world) {
  const { scene, camera, state, input } = world;

  const enemies = [];
  const drops = [];
  let cooldown = 0;
  let muzzleTimer = 0;

  // --- Muzzle flash: one reusable plane + one reusable point light ---
  const muzzleLight = new THREE.PointLight(0xffc861, 0, 9, 1.6);
  scene.add(muzzleLight);
  const muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  muzzleFlash.visible = false;
  scene.add(muzzleFlash);

  // --- Tracer pool: reusable THREE.Line objects, no per-shot allocation ---
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  function fireTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = TRACER_LIFE;
  }

  function gunWorldPos(out) {
    const p = state.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    out.set(p.x + fx * 0.5, 1.35, p.z + fz * 0.5);
    return out;
  }

  const _gun = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _center = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  raycaster.far = CONFIG.COMBAT.PISTOL_RANGE;

  // Loot dropped by a defeated enemy: a spinning green cross (health) or a
  // gold coin stack (cash). Walk over it to collect.
  function dropLoot(x, z) {
    const kind = world.rng && world.rng.chance(0.5) ? 'health' : 'cash';
    const g = new THREE.Group();
    const color = kind === 'health' ? 0x2ecc71 : 0xf2c200;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4 }),
    );
    gem.position.y = 1;
    g.add(gem);
    g.position.set(x, 0, z);
    scene.add(g);
    drops.push({ group: g, x, z, kind, timer: 25 });
  }

  function shoot() {
    const p = state.player;
    if (state.screen !== 'playing') return;
    if (!p.onFoot) return; // on foot only; no drive-by shooting
    if (cooldown > 0) return;
    cooldown = CONFIG.COMBAT.PISTOL_RATE_SECONDS;
    state.stats.shotsFired += 1;
    commitCrime(state, 5);
    state.events.emit('sfx', { name: 'shot' });
    // The crowd reacts to gunfire.
    if (world.traffic && typeof world.traffic.scare === 'function') {
      world.traffic.scare(p.x, p.z, 45);
    }

    // Muzzle flash at the gun: a bright plane plus a point light that
    // throws a warm blink across the street.
    gunWorldPos(_gun);
    muzzleFlash.position.copy(_gun);
    muzzleFlash.lookAt(camera.position);
    muzzleFlash.visible = true;
    muzzleFlash.scale.setScalar(1.4);
    muzzleTimer = 0.07;
    muzzleLight.position.copy(_gun);
    muzzleLight.intensity = 18;

    // Ray from the camera through the screen centre.
    raycaster.setFromCamera(_center, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;

    // Nearest living enemy hit.
    let enemyHit = null;
    let enemyT = Infinity;
    const meshes = [];
    for (let i = 0; i < enemies.length; i += 1) {
      if (!enemies[i].dead) meshes.push(enemies[i].mesh);
    }
    if (meshes.length > 0) {
      const hits = raycaster.intersectObjects(meshes, true);
      for (let i = 0; i < hits.length; i += 1) {
        let obj = hits[i].object;
        let ref = null;
        while (obj) {
          if (obj.userData && obj.userData.enemyRef) { ref = obj.userData.enemyRef; break; }
          obj = obj.parent;
        }
        if (ref && !ref.dead) { enemyHit = ref; enemyT = hits[i].distance; break; }
      }
    }

    // Nearest building hit (segment vs AABB on the city colliders).
    let buildingT = Infinity;
    const colliders = (world.city && world.city.colliders) || [];
    for (let i = 0; i < colliders.length; i += 1) {
      const t = rayVsBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
        CONFIG.COMBAT.PISTOL_RANGE, colliders[i]);
      if (t >= 0 && t < buildingT) buildingT = t;
    }

    const range = CONFIG.COMBAT.PISTOL_RANGE;
    if (enemyHit && enemyT < buildingT && enemyT <= range) {
      // Damage falls off with distance: full up close, half at max range.
      const falloff = 1 - (enemyT / range) * 0.5;
      enemyHit.health -= CONFIG.COMBAT.PISTOL_DAMAGE * falloff;
      enemyHit.flash = 0.12;
      const bodyMat = enemyHit.mesh.userData.parts.body.material;
      if (bodyMat && bodyMat.emissive) bodyMat.emissive.setHex(0xcc1111);
      _to.copy(origin).addScaledVector(dir, enemyT);
      fireTracer(_gun, _to);
      if (enemyHit.health <= 0) killEnemy(enemyHit);
    } else {
      // Miss or blocked by a building: tracer stops at the nearest surface.
      const stopT = Math.min(buildingT, range);
      _to.copy(origin).addScaledVector(dir, stopT);
      fireTracer(_gun, _to);
    }
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    enemy.state = 'dead';
    enemy.deathTimer = 3;
    enemy.mesh.rotation.x = -Math.PI / 2;
    // Keep the fallen body from blocking the raycaster as a live target.
    enemy.mesh.traverse((o) => { o.userData.enemyRef = null; });
    dropLoot(enemy.x, enemy.z);
  }

  function spawnEnemies(spots, count, kinds) {
    const list = Array.isArray(spots) ? spots : [];
    const rng = world.rng;
    const jackets = [0x8a1f1f, 0x5a1a1a, 0x2a2a33, 0x7a2020];
    const skins = [0xc98d64, 0x8a5a3b, 0xe0ac82, 0x6e4530];
    for (let i = 0; i < count; i += 1) {
      let spot = list[i % Math.max(1, list.length)];
      let x = spot ? spot.x : 0;
      let z = spot ? spot.z : 0;
      if (list.length > 0 && i >= list.length && rng) {
        x += rng.range(-8, 8);
        z += rng.range(-8, 8);
      } else if (list.length === 0 && rng) {
        x = rng.range(-100, 100);
        z = rng.range(-100, 100);
      }
      // Kind: callers can ask for a mix; otherwise rotate grunt/rusher/shooter.
      const kind = (kinds && kinds[i % kinds.length]) || ['grunt', 'rusher', 'shooter'][i % 3];
      const mesh = makeHumanoid({
        jacket: rng ? rng.pick(jackets) : jackets[i % jackets.length],
        pants: 0x1c1c22,
        skin: rng ? rng.pick(skins) : skins[i % skins.length],
        shirt: 0x111111,
      });
      // Rushers wear a bright bandana-red jacket, shooters a dark hood.
      if (kind === 'rusher') {
        mesh.userData.parts.body.material = mesh.userData.parts.body.material.clone();
        mesh.userData.parts.body.material.color.setHex(0xb03030);
      }
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      const baseHealth = kind === 'rusher' ? CONFIG.COMBAT.RUSHER_HEALTH : CONFIG.COMBAT.ENEMY_HEALTH;
      const enemy = {
        mesh,
        x,
        z,
        yaw: 0,
        kind,
        health: baseHealth,
        maxHealth: baseHealth,
        shootTimer: rng ? rng.range(0.4, 1.2) : 0.8,
        burstLeft: 0,
        state: 'chase',
        dead: false,
        deathTimer: 0,
        flash: 0,
        coverTimer: 0,
        wobblePhase: rng ? rng.range(0, Math.PI * 2) : 0,
        walkPhase: 0,
      };
      mesh.userData.enemyRef = enemy;
      mesh.traverse((o) => { o.userData.enemyRef = enemy; });
      enemies.push(enemy);
    }
    return enemies;
  }

  function enemiesAlive() {
    let n = 0;
    for (let i = 0; i < enemies.length; i += 1) if (!enemies[i].dead) n += 1;
    return n;
  }

  // A spot to hide behind: the nearest parked or traffic car, if it sits
  // between the enemy and the player.
  function findCover(e) {
    const traffic = world.traffic;
    if (!traffic || !traffic.cars) return null;
    const px = state.player.x;
    const pz = state.player.z;
    let best = null;
    let bestD = Infinity;
    for (const entry of traffic.cars) {
      const car = entry.car || entry;
      if (!car) continue;
      const dx = car.x - px;
      const dz = car.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > 25 || d < 2) continue;
      // The car must be roughly on the line between enemy and player.
      const ex = e.x - px;
      const ez = e.z - pz;
      const el = Math.hypot(ex, ez) || 1;
      const dot = ((dx / d) * (ex / el)) + ((dz / d) * (ez / el));
      if (dot < 0.85) continue;
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function update(dt) {
    const p = state.player;
    const playing = state.screen === 'playing';

    if (cooldown > 0) cooldown -= dt;

    // Muzzle flash fades in ~70 ms.
    if (muzzleTimer > 0) {
      muzzleTimer -= dt;
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - (18 / 0.07) * dt);
      muzzleFlash.scale.setScalar(Math.max(0.2, muzzleTimer / 0.07) * 1.4);
      if (muzzleTimer <= 0) {
        muzzleFlash.visible = false;
        muzzleLight.intensity = 0;
      }
    }

    // Tracer lifetimes: fade out over their short life.
    for (let i = 0; i < tracers.length; i += 1) {
      const t = tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / TRACER_LIFE) * 0.9);
        if (t.life <= 0) t.line.visible = false;
      }
    }

    // Loot drops: spin, bob, expire; collect on touch.
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const drop = drops[i];
      drop.timer -= dt;
      drop.group.rotation.y += dt * 2.5;
      drop.group.children[0].position.y = 1 + Math.sin(state.time * 3 + i) * 0.15;
      if (drop.timer <= 0) {
        scene.remove(drop.group);
        drops.splice(i, 1);
        continue;
      }
      if (playing && p.onFoot && Math.hypot(p.x - drop.x, p.z - drop.z) < 1.6) {
        if (drop.kind === 'health') {
          const healed = healPlayer(state, 30);
          if (healed > 0) state.events.emit('toast', { text: `+${Math.round(healed)} health` });
        } else {
          addMoney(state, 50);
          state.events.emit('toast', { text: '+$50 looted' });
        }
        state.events.emit('sfx', { name: 'pickup' });
        scene.remove(drop.group);
        drops.splice(i, 1);
      }
    }

    // Armed stance + firing input, on foot only.
    const wantArmed = playing && p.onFoot
      && (input.keys.has('KeyF') || input.mouseDown);
    p.armed = wantArmed;
    if (playing && p.onFoot && (input.justPressed.has('KeyF') || input.mouseDown)) {
      shoot();
    }

    if (!playing) return;

    const colliders = (world.city && world.city.colliders) || [];
    const px = p.x;
    const pz = p.z;

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (e.dead) {
        e.deathTimer -= dt;
        if (e.deathTimer < 2) e.mesh.position.y -= dt * 0.4; // sink
        if (e.deathTimer <= 0) {
          scene.remove(e.mesh);
          enemies.splice(i, 1);
        }
        continue;
      }

      // Hit flash decay.
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) {
          const bodyMat = e.mesh.userData.parts.body.material;
          if (bodyMat && bodyMat.emissive) bodyMat.emissive.setHex(0x000000);
        }
      }

      const dx = px - e.x;
      const dz = pz - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;

      // Hurt enemies duck behind the nearest car for a breather.
      if (e.health < e.maxHealth * 0.5 && e.coverTimer <= 0 && e.state !== 'cover') {
        const cover = findCover(e);
        if (cover) {
          e.state = 'cover';
          e.coverTimer = 4;
          e.coverX = cover.x;
          e.coverZ = cover.z;
        }
      }
      if (e.coverTimer > 0) e.coverTimer -= dt;
      if (e.state === 'cover' && e.coverTimer <= 0) e.state = 'chase';

      // Movement by kind.
      let speed = 4;
      let moveX = nx;
      let moveZ = nz;
      if (e.state === 'cover') {
        const cx = e.coverX - e.x;
        const cz = e.coverZ - e.z;
        const cd = Math.hypot(cx, cz) || 1;
        moveX = cx / cd;
        moveZ = cz / cd;
        speed = 5;
        if (cd < 1.5) { moveX = 0; moveZ = 0; speed = 0; }
      } else if (e.kind === 'rusher') {
        speed = CONFIG.COMBAT.RUSHER_SPEED;
      } else if (e.kind === 'shooter') {
        // Hold a ring at ~26 m: close in when too far, back off when too near.
        if (dist > 28) speed = 4.5;
        else if (dist < 20) { moveX = -nx; moveZ = -nz; speed = 3.5; }
        else { moveX = 0; moveZ = 0; speed = 0; }
      }
      // A sideways strafe wobble so they never walk in a dead-straight line.
      const wobble = Math.sin(state.time * 2 + e.wobblePhase) * 0.45;
      const mx = moveX + (-moveZ) * wobble;
      const mz = moveZ + moveX * wobble;
      const mLen = Math.hypot(mx, mz) || 1;
      const minDist = e.kind === 'rusher' ? 1.6 : 2.2;
      let ex = e.x;
      let ez = e.z;
      if (dist > minDist && speed > 0) {
        ex += (mx / mLen) * speed * dt;
        ez += (mz / mLen) * speed * dt;
      }
      const solved = resolveCircleColliders(ex, ez, 0.7, colliders);
      const clamped = clampToWorld(solved.x, solved.z, 0.7);
      e.x = clamped.x;
      e.z = clamped.z;
      e.yaw = Math.atan2(dx, dz);
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.yaw;

      // Walk animation while closing in; aim pose when in range.
      const parts = e.mesh.userData.parts;
      if (dist > minDist && speed > 0) {
        e.walkPhase += dt * speed * 1.7;
        const swing = Math.sin(e.walkPhase) * 0.55;
        parts.legL.rotation.x = swing;
        parts.legR.rotation.x = -swing;
        parts.armL.rotation.x = -swing * 0.8;
        parts.armR.rotation.x = swing * 0.8;
      } else {
        if (e.kind === 'rusher') {
          // Melee wind-up: both arms back, then a swing.
          parts.armR.rotation.x = -2.2 + Math.sin(state.time * 6 + e.wobblePhase) * 0.4;
          parts.armL.rotation.x = 0.4;
        } else {
          parts.armR.rotation.x = -Math.PI / 2 + 0.12;
          parts.armL.rotation.x = 0;
        }
        parts.legL.rotation.x = 0;
        parts.legR.rotation.x = 0;
      }

      // Attacks.
      e.shootTimer -= dt;
      if (e.kind === 'rusher') {
        if (dist < 2.4 && e.shootTimer <= 0) {
          e.shootTimer = 1.1;
          hurtPlayer(state, CONFIG.COMBAT.RUSHER_DAMAGE);
          state.events.emit('sfx', { name: 'punch' });
        }
      } else if (dist < CONFIG.COMBAT.ENEMY_RANGE && e.shootTimer <= 0 && e.state !== 'cover') {
        // Shooters fire in bursts of three; grunts fire single shots.
        if (e.kind === 'shooter' && e.burstLeft <= 0) e.burstLeft = CONFIG.COMBAT.SHOOTER_BURST;
        const burst = e.kind === 'shooter';
        e.shootTimer = burst ? 0.16 : CONFIG.COMBAT.ENEMY_RATE_SECONDS * (0.8 + (world.rng ? world.rng.next() * 0.4 : 0.2));
        if (burst) e.burstLeft -= 1;
        if (burst && e.burstLeft <= 0) e.shootTimer = CONFIG.COMBAT.ENEMY_RATE_SECONDS * 1.4;
        // Only shoot when the line of sight is clear; otherwise hold fire.
        if (hasLineOfSight(e.x, e.z, px, pz, colliders)) {
          _gun.set(e.x, 1.4, e.z);
          const hit = world.rng ? world.rng.chance(0.55) : true;
          const damage = e.kind === 'shooter' ? CONFIG.COMBAT.SHOOTER_DAMAGE : CONFIG.COMBAT.ENEMY_DAMAGE;
          if (hit) {
            _to.set(px, 1.2, pz);
            fireTracer(_gun, _to);
            hurtPlayer(state, damage);
          } else {
            _to.set(px + (world.rng ? world.rng.range(-2, 2) : 1.5), 1.2, pz + (world.rng ? world.rng.range(-2, 2) : 0));
            fireTracer(_gun, _to);
          }
          state.events.emit('sfx', { name: 'shot' });
        }
      }
    }
  }

  return { enemies, drops, update, shoot, spawnEnemies, enemiesAlive };
}
