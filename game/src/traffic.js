// Solmar Bay — ambient traffic and pedestrians. Traffic cars follow the
// city road graph and stop for red lights; pedestrians walk the sidewalks,
// chat in pairs, and sometimes jaywalk. A pedestrian hit by the player's car
// is a crime (heat, and the crowd notices).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Car, getPlayerCar } from './vehicles.js';
import { makeHumanoid } from './player.js';
import { commitCrime } from './state.js';
import { circlesOverlap } from './collide.js';

const PAINT_JOBS = [0xd8d8d8, 0x222831, 0x8b1a1a, 0x1d4e9e, 0x2e7d32, 0xb8b8b8, 0x7a4a21, 0x5b2d8e, 0xe8a33d, 0x3a8a8a, 0xc25e7a, 0x4a5a2a];
const JACKETS = [0x8b1a1a, 0x1d4e9e, 0x2e7d32, 0xd8a018, 0x5b2d8e, 0x333a45, 0x0e7a6e, 0xc25e7a, 0xdddddd, 0x2a4a2a];
const PANTS = [0x222831, 0x3a3f4a, 0x5a4632, 0x1d2f45, 0x444444, 0x6b5a8a];
const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0, 0x6e4426];
const SHIRTS = [0xffffff, 0xe8e8e8, 0x222831, 0xd84a4a, 0x4a90d8, 0x3a3a3a, 0xf2c200];

const PED_RADIUS = 0.7;
// Intersections with traffic lights (same four the city dresses with poles).
const LIGHT_SPOTS = [[-36, -36], [36, 36], [-36, 108], [108, -36]];

// Fallback graph if the city module ever ships without a road graph: nodes
// at every road-line intersection, edges between neighbours along each line.
function fallbackGraph() {
  const lines = CONFIG.ROAD_LINES;
  const nodes = [];
  const index = new Map();
  for (const x of lines) {
    for (const z of lines) {
      index.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  }
  const edges = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = 0; j < lines.length - 1; j += 1) {
      edges.push({ a: index.get(`${lines[j]},${lines[i]}`), b: index.get(`${lines[j + 1]},${lines[i]}`) });
      edges.push({ a: index.get(`${lines[i]},${lines[j]}`), b: index.get(`${lines[i]},${lines[j + 1]}`) });
    }
  }
  return { nodes, edges };
}

// Sidewalks come from the city as {x1,z1,x2,z2} segments; accept a few plain
// shapes for safety, and fake strips outside each road line if none exist.
function cleanSidewalks(city) {
  const raw = city ? city.sidewalks : null;
  const segs = [];
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (!s) continue;
      if (Array.isArray(s) && s.length >= 4) {
        segs.push({ x1: s[0], z1: s[1], x2: s[2], z2: s[3] });
      } else if (typeof s.x1 === 'number' && typeof s.x2 === 'number') {
        segs.push({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 });
      } else if (typeof s.ax === 'number' && typeof s.bx === 'number') {
        segs.push({ x1: s.ax, z1: s.az, x2: s.bx, z2: s.bz });
      } else if (s.a && s.b && typeof s.a.x === 'number') {
        segs.push({ x1: s.a.x, z1: s.a.z, x2: s.b.x, z2: s.b.z });
      }
    }
  }
  if (segs.length) return segs;
  for (const line of CONFIG.ROAD_LINES) {
    segs.push({ x1: line + 8.5, z1: -288, x2: line + 8.5, z2: 288 });
    segs.push({ x1: -288, z1: line + 8.5, x2: 288, z2: line + 8.5 });
  }
  return segs;
}

function segLength(seg) {
  return Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1) || 1;
}

export function createTraffic(world) {
  const { scene, rng, state } = world;
  const city = world.city || {};
  const graph =
    city.roadGraph && city.roadGraph.nodes && city.roadGraph.nodes.length
      ? city.roadGraph
      : fallbackGraph();
  const nodes = graph.nodes;
  const edges = graph.edges;

  // Adjacency list for route picking.
  const adj = nodes.map(() => []);
  for (const e of edges) {
    if (e.a == null || e.b == null || !nodes[e.a] || !nodes[e.b]) continue;
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const isJunction = (i) => (adj[i] || []).length >= 3;

  function nodeAt(x, z) {
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].x === x && nodes[i].z === z) return i;
    }
    return -1;
  }

  // Traffic lights: one per dressed intersection, cycling green -> amber ->
  // red with a per-light offset so the city never flips all at once.
  const lights = LIGHT_SPOTS.map(([x, z], i) => ({
    node: nodeAt(x, z),
    offset: i * 2.3,
  }));
  function lightState(light, now) {
    const cycle = CONFIG.TRAFFIC.LIGHT_CYCLE_SECONDS;
    const t = ((now + light.offset) % (cycle * 2)) ;
    if (t < cycle * 0.62) return 'green';
    if (t < cycle * 0.72) return 'amber';
    return 'red';
  }
  function lightForNode(nodeIndex) {
    for (const l of lights) if (l.node === nodeIndex) return l;
    return null;
  }

  function randomEdgePoint() {
    const ei = rng.int(0, edges.length - 1);
    const e = edges[ei];
    const a = nodes[e.a];
    const b = nodes[e.b];
    const t = rng.range(0.15, 0.85);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      edgeIndex: ei,
      a: e.a,
      b: e.b,
    };
  }

  function pickCarType() {
    const r = rng.next();
    if (r < 0.12) return 'taxi';
    if (r < 0.22) return 'sports';
    if (r < 0.30) return 'van';
    if (r < 0.35) return 'truck';
    if (r < 0.39) return 'pickup';
    return 'sedan';
  }

  function spawnTrafficCar() {
    const p = randomEdgePoint();
    const forward = rng.chance(0.5);
    const from = forward ? p.a : p.b;
    const to = forward ? p.b : p.a;
    const dest = nodes[to];
    const type = pickCarType();
    const color = type === 'taxi' ? 0xf2c200 : rng.pick(PAINT_JOBS);
    const yaw = Math.atan2(dest.x - p.x, dest.z - p.z);
    const car = new Car(world, type, p.x, p.z, yaw, color);
    return {
      car,
      kind: 'traffic',
      edge: p.edgeIndex,
      nodeTarget: to,
      from,
      speed: rng.range(CONFIG.TRAFFIC.SPEED_MIN, CONFIG.TRAFFIC.SPEED_MAX),
      color,
      _stuck: 0,
    };
  }

  function respawnTraffic(entry) {
    entry.car.destroy();
    const fresh = spawnTrafficCar();
    entry.car = fresh.car;
    entry.edge = fresh.edge;
    entry.nodeTarget = fresh.nodeTarget;
    entry.from = fresh.from;
    entry.speed = fresh.speed;
    entry.color = fresh.color;
    entry._stuck = 0;
  }

  function spawnParkedCar() {
    const p = randomEdgePoint();
    const a = nodes[p.a];
    const b = nodes[p.b];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    // Park just off the road edge, facing along the road.
    const side = rng.chance(0.5) ? 1 : -1;
    const x = p.x + (-ez / len) * 3.4 * side;
    const z = p.z + (ex / len) * 3.4 * side;
    const yaw = Math.atan2(ex, ez) + (rng.chance(0.5) ? 0 : Math.PI);
    const type = rng.chance(0.7) ? 'sedan' : rng.pick(['van', 'sports', 'taxi', 'pickup']);
    const color = type === 'taxi' ? 0xf2c200 : rng.pick(PAINT_JOBS);
    const car = new Car(world, type, x, z, yaw, color);
    return { car, kind: 'parked', edge: p.edgeIndex, nodeTarget: null, speed: 0, color, _stuck: 0 };
  }

  // A slow city bus looping the downtown rectangle, node by node.
  function spawnBus() {
    const loop = [[-36, -36], [108, -36], [108, 108], [-36, 108]]
      .map(([x, z]) => nodeAt(x, z))
      .filter((n) => n >= 0);
    if (loop.length < 4) return null;
    const start = nodes[loop[0]];
    const car = new Car(world, 'bus', start.x, start.z, 0, 0x2c6fb8);
    return {
      car, kind: 'bus', edge: -1, nodeTarget: loop[1], from: loop[0],
      speed: 7, color: 0x2c6fb8, _stuck: 0, loop, loopAt: 1,
    };
  }

  const cars = [];
  for (let i = 0; i < CONFIG.TRAFFIC.COUNT; i += 1) cars.push(spawnTrafficCar());
  for (let i = 0; i < 8; i += 1) cars.push(spawnParkedCar());
  const busEntry = spawnBus();
  if (busEntry) cars.push(busEntry);

  // ---- Pedestrians -------------------------------------------------------
  const sidewalkSegs = cleanSidewalks(city);

  function giveSegment(ped) {
    ped.sidewalk = rng.pick(sidewalkSegs);
    ped.t = rng.next();
    ped.dir = rng.chance(0.5) ? 1 : -1;
    ped.speed = rng.range(CONFIG.PEDESTRIANS.SPEED_MIN, CONFIG.PEDESTRIANS.SPEED_MAX);
  }

  function setPedFade(ped, opacity) {
    ped.mesh.traverse((o) => {
      if (o.material) {
        o.material.transparent = true;
        o.material.opacity = opacity;
      }
    });
  }

  function restorePed(ped) {
    ped.mesh.traverse((o) => {
      if (o.material) {
        o.material.opacity = 1;
        o.material.transparent = false;
      }
    });
  }

  function respawnPed(ped) {
    giveSegment(ped);
    ped.fallen = false;
    ped.fallTimer = 0;
    ped.fleeing = false;
    ped.mesh.rotation.set(0, 0, 0);
    ped.mesh.visible = true;
    restorePed(ped);
    dropPed(ped);
  }

  function dropPed(ped) {
    const seg = ped.sidewalk;
    ped.x = seg.x1 + (seg.x2 - seg.x1) * ped.t;
    ped.z = seg.z1 + (seg.z2 - seg.z1) * ped.t;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = Math.atan2((seg.x2 - seg.x1) * ped.dir, (seg.z2 - seg.z1) * ped.dir);
  }

  function makePed(mode) {
    const mesh = makeHumanoid({
      jacket: rng.pick(JACKETS),
      pants: rng.pick(PANTS),
      skin: rng.pick(SKINS),
      shirt: rng.pick(SHIRTS),
    });
    scene.add(mesh);
    const ped = {
      mesh,
      x: 0,
      z: 0,
      dir: 1,
      speed: 1.5,
      sidewalk: null,
      t: 0,
      fallen: false,
      fallTimer: 0,
      fleeing: false,
      fleeX: 0,
      fleeZ: 0,
      mode: mode || 'stroll',
      chatTimer: 0,
      cross: 0,
      phase: rng.range(0, Math.PI * 2),
    };
    giveSegment(ped);
    dropPed(ped);
    return ped;
  }

  const peds = [];
  for (let i = 0; i < CONFIG.PEDESTRIANS.COUNT; i += 1) {
    // A few stand and chat, a couple jaywalk across roads, the rest stroll.
    const roll = rng.next();
    const mode = roll < 0.14 ? 'chat' : roll < 0.22 ? 'jaywalk' : 'stroll';
    const ped = makePed(mode);
    if (mode === 'chat') ped.chatTimer = rng.range(4, 12);
    peds.push(ped);
  }

  // Pick the next node when a traffic car reaches its target: prefer the
  // straightest continuation, sometimes take a random turn, never U-turn
  // unless the road is a dead end.
  function chooseNextNode(entry) {
    const n = entry.nodeTarget;
    const neighbors = adj[n] || [];
    if (!neighbors.length) return;
    const prev = entry.from;
    let cands = neighbors.filter((m) => m !== prev);
    if (!cands.length) cands = neighbors.slice();
    let next;
    if (rng.chance(0.7)) {
      const fx = Math.sin(entry.car.yaw);
      const fz = Math.cos(entry.car.yaw);
      let best = -2;
      for (const m of cands) {
        const dx = nodes[m].x - nodes[n].x;
        const dz = nodes[m].z - nodes[n].z;
        const d = Math.hypot(dx, dz) || 1;
        const dot = (dx / d) * fx + (dz / d) * fz;
        if (dot > best) {
          best = dot;
          next = m;
        }
      }
    } else {
      next = rng.pick(cands);
    }
    entry.from = n;
    entry.nodeTarget = next;
  }

  function allMovingCars(playerCar, policeCars) {
    const list = [];
    for (const e of cars) list.push(e.car);
    if (playerCar) list.push(playerCar);
    for (const p of policeCars) list.push(p.car);
    return list;
  }

  // Scare every pedestrian near (x, z): combat calls this when a shot goes
  // off, so the crowd reacts to gunfire instead of strolling through it.
  function scare(x, z, radius) {
    for (const ped of peds) {
      if (ped.fallen) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      ped.fleeing = true;
      ped.fleeX = d > 0.01 ? dx / d : 1;
      ped.fleeZ = d > 0.01 ? dz / d : 0;
      ped.fleeTimer = 2.5;
    }
  }

  let crashSfxAt = -99;

  function update(dt) {
    const playerCar = getPlayerCar(state);
    const policeCars = world.police ? world.police.policeCars || [] : [];
    const moving = allMovingCars(playerCar, policeCars);

    // --- Traffic cars -----------------------------------------------------
    for (const entry of cars) {
      const car = entry.car;
      if (entry.kind === 'parked') {
        car.sync();
        continue;
      }
      if (playerCar && car === playerCar) continue; // player is driving it
      const target = nodes[entry.nodeTarget];
      if (!target) continue;
      const dxT = target.x - car.x;
      const dzT = target.z - car.z;
      const distT = Math.hypot(dxT, dzT);

      let targetSpeed = entry.speed;
      // Slow down near intersections.
      if (isJunction(entry.nodeTarget) && distT < 10) {
        targetSpeed = Math.min(targetSpeed, 6);
      }
      // Obey the traffic light at a lit intersection.
      const light = lightForNode(entry.nodeTarget);
      if (light && distT < 14) {
        const colour = lightState(light, state.time);
        if (colour === 'red') targetSpeed = 0;
        else if (colour === 'amber') targetSpeed = Math.min(targetSpeed, 4);
      }
      // Brake when another car is ahead within follow distance.
      if (targetSpeed > 3) {
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        const fd2 = CONFIG.TRAFFIC.FOLLOW_DISTANCE * CONFIG.TRAFFIC.FOLLOW_DISTANCE;
        for (let i = 0; i < moving.length; i += 1) {
          const other = moving[i];
          if (other === car) continue;
          const ox = other.x - car.x;
          const oz = other.z - car.z;
          const d2 = ox * ox + oz * oz;
          if (d2 >= fd2 || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          if ((ox / d) * fx + (oz / d) * fz > 0.55) {
            targetSpeed = 3;
            break;
          }
        }
      }

      car.updateAuto(dt, targetSpeed, Math.atan2(dxT, dzT));
      if (distT < 3.5) {
        if (entry.kind === 'bus' && entry.loop) {
          entry.loopAt = (entry.loopAt + 1) % entry.loop.length;
          entry.from = entry.nodeTarget;
          entry.nodeTarget = entry.loop[entry.loopAt];
        } else {
          chooseNextNode(entry);
        }
      }

      // Anti-stuck: a car wedged behind a building respawns on a road.
      if (Math.abs(car.speed) < 0.5 && targetSpeed > 3) {
        entry._stuck += dt;
        if (entry._stuck > 5) respawnTraffic(entry);
      } else {
        entry._stuck = 0;
      }
    }

    // --- Car vs car separation (traffic + parked vs each other + player) ---
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i].car;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j].car;
        if (circlesOverlap(a.x, a.z, a.radius, b.x, b.z, b.radius)) {
          a.pushFrom(b.x, b.z, b.radius);
          b.pushFrom(a.x, a.z, a.radius);
        }
      }
      if (playerCar && playerCar !== a) {
        if (circlesOverlap(a.x, a.z, a.radius, playerCar.x, playerCar.z, playerCar.radius)) {
          a.pushFrom(playerCar.x, playerCar.z, playerCar.radius);
          playerCar.pushFrom(a.x, a.z, a.radius);
          if (
            Math.abs(playerCar.speed) > 8 &&
            state.time - crashSfxAt > 0.6 &&
            state.screen === 'playing'
          ) {
            crashSfxAt = state.time;
            state.events.emit('sfx', { name: 'crash' });
          }
        }
      }
      cars[i].car.sync();
    }

    // --- Pedestrians ------------------------------------------------------
    for (const ped of peds) {
      if (ped.fallen) {
        ped.fallTimer -= dt;
        if (ped.fallTimer < 0.8) setPedFade(ped, Math.max(0, ped.fallTimer / 0.8));
        if (ped.fallTimer <= 0) respawnPed(ped);
        continue;
      }
      // Fleeing: run away from the scare point, then go back to strolling.
      if (ped.fleeing) {
        ped.fleeTimer -= dt;
        ped.x += ped.fleeX * CONFIG.PEDESTRIANS.FLEE_SPEED * dt;
        ped.z += ped.fleeZ * CONFIG.PEDESTRIANS.FLEE_SPEED * dt;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = Math.atan2(ped.fleeX, ped.fleeZ);
        ped.phase += dt * 12;
        const parts = ped.mesh.userData.parts;
        if (parts) {
          const s = Math.sin(ped.phase);
          parts.legL.rotation.x = s * 0.8;
          parts.legR.rotation.x = -s * 0.8;
          parts.armL.rotation.x = -s * 0.6;
          parts.armR.rotation.x = s * 0.6;
        }
        if (ped.fleeTimer <= 0) {
          ped.fleeing = false;
          giveSegment(ped);
          dropPed(ped);
        }
        continue;
      }
      // A speeding car nearby also sends pedestrians running.
      if (playerCar && Math.abs(playerCar.speed) > 12) {
        const dx = ped.x - playerCar.x;
        const dz = ped.z - playerCar.z;
        if (dx * dx + dz * dz < 100) {
          const d = Math.hypot(dx, dz) || 1;
          ped.fleeing = true;
          ped.fleeX = dx / d;
          ped.fleeZ = dz / d;
          ped.fleeTimer = 2;
          continue;
        }
      }
      if (ped.mode === 'chat') {
        // Stand and chat: sway gently, wander off after a while.
        ped.chatTimer -= dt;
        ped.phase += dt * 1.5;
        ped.mesh.rotation.y = Math.sin(ped.phase * 0.5) * 0.6;
        const parts = ped.mesh.userData.parts;
        if (parts) {
          parts.armR.rotation.x = Math.sin(ped.phase) * 0.3 - 0.4;
        }
        if (ped.chatTimer <= 0) {
          ped.mode = 'stroll';
          giveSegment(ped);
          dropPed(ped);
        }
        continue;
      }
      if (ped.mode === 'jaywalk') {
        // Cross the road on foot, walking perpendicular to the sidewalk
        // segment from one side to the other, then stroll on.
        ped.cross += (ped.speed * dt) / 16;
        const seg = ped.sidewalk;
        const bx = seg.x1 + (seg.x2 - seg.x1) * ped.t;
        const bz = seg.z1 + (seg.z2 - seg.z1) * ped.t;
        const sl = segLength(seg);
        const px = -(seg.z2 - seg.z1) / sl;
        const pz = (seg.x2 - seg.x1) / sl;
        const off = (ped.cross - 0.5) * 16;
        ped.x = bx + px * off;
        ped.z = bz + pz * off;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = Math.atan2(px * ped.dir, pz * ped.dir);
        ped.phase += dt * ped.speed * 3.2;
        const parts = ped.mesh.userData.parts;
        if (parts) {
          const s = Math.sin(ped.phase);
          parts.legL.rotation.x = s * 0.55;
          parts.legR.rotation.x = -s * 0.55;
        }
        if (ped.cross >= 1) {
          ped.mode = 'stroll';
          giveSegment(ped);
          dropPed(ped);
        }
        continue;
      }
      const seg = ped.sidewalk;
      ped.t += (ped.dir * ped.speed * dt) / segLength(seg);
      if (ped.t >= 1) {
        ped.t = 1;
        if (rng.chance(0.3)) giveSegment(ped);
        else ped.dir = -1;
      } else if (ped.t <= 0) {
        ped.t = 0;
        if (rng.chance(0.3)) giveSegment(ped);
        else ped.dir = 1;
      }
      ped.x = seg.x1 + (seg.x2 - seg.x1) * ped.t;
      ped.z = seg.z1 + (seg.z2 - seg.z1) * ped.t;
      ped.phase += dt * ped.speed * 3.2;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = Math.atan2((seg.x2 - seg.x1) * ped.dir, (seg.z2 - seg.z1) * ped.dir);
      const parts = ped.mesh.userData.parts;
      if (parts) {
        const s = Math.sin(ped.phase);
        parts.legL.rotation.x = s * 0.55;
        parts.legR.rotation.x = -s * 0.55;
        parts.armL.rotation.x = -s * 0.4;
        parts.armR.rotation.x = s * 0.4;
      }
    }

    // --- Pedestrian collisions -------------------------------------------
    for (const ped of peds) {
      if (ped.fallen) continue;
      let hit = false;
      let hitByPlayer = false;
      for (let i = 0; i < moving.length; i += 1) {
        const c = moving[i];
        if (Math.abs(c.speed) <= 3) continue;
        if (!circlesOverlap(ped.x, ped.z, PED_RADIUS, c.x, c.z, c.radius)) continue;
        hit = true;
        if (playerCar && c === playerCar) hitByPlayer = true;
      }
      if (hit) {
        // Fall over.
        ped.fallen = true;
        ped.fallTimer = 4;
        ped.mesh.rotation.x = -Math.PI / 2;
        const parts = ped.mesh.userData.parts;
        if (parts) {
          parts.legL.rotation.x = 0;
          parts.legR.rotation.x = 0;
          parts.armL.rotation.x = 0;
          parts.armR.rotation.x = 0;
        }
        if (hitByPlayer && state.screen === 'playing') {
          commitCrime(state, 30);
          state.stats.pedestriansHit += 1;
          state.events.emit('toast', { text: 'Pedestrian down! +heat' });
        }
      }
    }
  }

  return { cars, peds, update, scare, lights };
}
