// shots.js — staged screenshot scenes: chase, marina, shootout, title.
import { Car, getPlayerCar } from './vehicles.js';

const STEP = 1 / 60;

function clampAngle(a) {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function steerDrive(world, step, target, seconds) {
  const input = world.input;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const p = world.state.player;
    const wantYaw = Math.atan2(target.x - p.x, target.z - p.z);
    const diff = clampAngle(wantYaw - p.yaw);
    input.keys.clear();
    input.keys.add('KeyW');
    if (diff > 0.05) input.keys.add('KeyA');
    else if (diff < -0.05) input.keys.add('KeyD');
    input.justPressed.clear();
    input.mouseDown = false;
    step(STEP);
  }
  input.keys.clear();
}

function stroll(world, step, seconds, keys) {
  const input = world.input;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    input.keys.clear();
    for (const k of keys || ['KeyW']) input.keys.add(k);
    input.justPressed.clear();
    input.mouseDown = false;
    step(STEP);
  }
  input.keys.clear();
}

function firefight(world, step, seconds) {
  const input = world.input;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    input.keys.clear();
    input.justPressed.clear();
    input.mouseDown = true;
    step(STEP);
    world.state.health = 100;
  }
  const before = world.state.stats.shotsFired;
  for (let i = 0; i < 40 && world.state.stats.shotsFired === before; i += 1) {
    input.mouseDown = true;
    step(STEP);
    world.state.health = 100;
  }
  input.mouseDown = false;
  input.keys.clear();
}

function parkPlayerCar(world, type, x, z, yaw, color) {
  const car = new Car(world, type, x, z, yaw, color);
  car.kind = 'player';
  world.traffic.cars.push({ car, kind: 'player' });
  world.player.enterCar(car);
  return car;
}

function findNode(world, x, z) {
  const nodes = world.city.roadGraph.nodes;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].x === x && nodes[i].z === z) return i;
  }
  return -1;
}
function findEdge(world, a, b) {
  const edges = world.city.roadGraph.edges;
  for (let i = 0; i < edges.length; i += 1) {
    if ((edges[i].a === a && edges[i].b === b) || (edges[i].a === b && edges[i].b === a)) return i;
  }
  return -1;
}

function spawnTrafficAhead(world, x, z, fromNode, toNode, speed, type, color) {
  const edge = findEdge(world, fromNode, toNode);
  if (edge < 0 || fromNode < 0 || toNode < 0) return;
  const nodes = world.city.roadGraph.nodes;
  const dest = nodes[toNode];
  const car = new Car(world, type, x, z, Math.atan2(dest.x - x, dest.z - z), color);
  world.traffic.cars.push({
    car, kind: 'traffic', edge, nodeTarget: toNode, from: fromNode,
    speed, color, _stuck: 0,
  });
}

function spawnTrafficOnRoad(world, x, z, yaw, speed, type, color) {
  const lines = [-252, -180, -108, -36, 36, 108, 180, 252];
  let line = lines[0];
  for (const l of lines) if (Math.abs(l - x) < Math.abs(line - x)) line = l;
  const north = Math.cos(yaw) < 0;
  let from = null;
  let to = null;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (z >= lines[i] && z <= lines[i + 1]) {
      from = north ? lines[i + 1] : lines[i];
      to = north ? lines[i] : lines[i + 1];
      break;
    }
  }
  if (from === null) return;
  const fromNode = findNode(world, line, from);
  const toNode = findNode(world, line, to);
  if (fromNode < 0 || toNode < 0) return;
  spawnTrafficAhead(world, x, z, fromNode, toNode, speed, type, color);
}

function stageChase(world, step) {
  const state = world.state;
  state.money = 1250;
  state.respect = 320;
  world.missions.startMission(0);
  state.wanted = 0;
  state.heat = 0;
  world.player.teleport(36, 190, Math.PI);
  parkPlayerCar(world, 'sports', 36, 190, Math.PI, 0xff5533);
  steerDrive(world, step, { x: 36, z: -252 }, 5);
  const car = getPlayerCar(world.state);
  if (car) {
    world.player.teleport(car.x, car.z, car.yaw);
    for (let i = 0; i < 30; i += 1) step(STEP);
  }
  state.wanted = 3;
  state.heat = 90;
  state.secondsSinceCrime = 0;
  for (let i = 0; i < 20; i += 1) step(STEP);
  const p = world.state.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  const rx = -fz;
  const rz = fx;
  const pcs = world.police.policeCars;
  const flank = [
    { fwd: 12, side: -3 },
    { fwd: 14, side: 3 },
  ];
  for (let i = 0; i < pcs.length; i += 1) {
    if (i < flank.length) {
      const c = pcs[i].car;
      c.x = p.x + fx * flank[i].fwd + rx * flank[i].side;
      c.z = p.z + fz * flank[i].fwd + rz * flank[i].side;
      c.yaw = p.yaw;
      c.speed = 0;
      c.sync();
    } else {
      pcs[i].car.destroy();
    }
  }
  pcs.length = Math.min(pcs.length, flank.length);
  const cops = world.police.cops;
  const copSpots = [
    { fwd: 8, side: 0 },
    { fwd: 6, side: -4 },
    { fwd: 7, side: 4 },
  ];
  for (let i = 0; i < cops.length && i < copSpots.length; i += 1) {
    const c = cops[i];
    c.x = p.x + fx * copSpots[i].fwd + rx * copSpots[i].side;
    c.z = p.z + fz * copSpots[i].fwd + rz * copSpots[i].side;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = Math.atan2(p.x - c.x, p.z - c.z);
  }
  const peds = world.traffic.peds;
  const pedSpots = [
    { fwd: 16, side: 8 },
    { fwd: 21, side: 8 },
  ];
  for (let i = 0; i < peds.length && i < pedSpots.length; i += 1) {
    const ped = peds[i];
    ped.mode = 'chat';
    ped.chatTimer = 60;
    ped.x = p.x + fx * pedSpots[i].fwd + rx * pedSpots[i].side;
    ped.z = p.z + fz * pedSpots[i].fwd + rz * pedSpots[i].side;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = Math.atan2(p.x - ped.x, p.z - ped.z);
  }
  spawnTrafficOnRoad(world, p.x + fx * 62 + fz * 3, p.z + fz * 62 - fx * 3, p.yaw, 11, 'sedan', 0x3a6fd8);
  spawnTrafficOnRoad(world, p.x + fx * 85 - fz * 3, p.z + fz * 85 + fx * 3, p.yaw, 9, 'taxi', 0xf2c200);
  spawnTrafficOnRoad(world, p.x + fx * 110 + fz * 3, p.z + fz * 110 - fx * 3, p.yaw, 8, 'van', 0x8a93a5);
  const pc = getPlayerCar(world.state);
  if (pc) {
    pc.speed = 50;
    pc.sync();
    state.player.speed = 50;
  }
  world.hud.showDialogue('Dom Ferreira', 'Nova! Back in Solmar Bay at last. Take my sedan to the Marina — easy money.', 6500);
  world.hud.update(0);
}

function stageMarina(world, step) {
  const state = world.state;
  state.money = 640;
  state.respect = 120;
  world.missions.startMission(0);
  world.player.teleport(250, 124, 1.66);
  step(STEP);
  const peds = world.traffic.peds;
  const pedSpots = [
    { x: 270, z: 124 },
    { x: 277, z: 129 },
    { x: 272, z: 135 },
  ];
  const p = world.state.player;
  for (let i = 0; i < peds.length && i < pedSpots.length; i += 1) {
    const ped = peds[i];
    ped.mode = 'chat';
    ped.chatTimer = 60;
    ped.x = pedSpots[i].x;
    ped.z = pedSpots[i].z;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = Math.atan2(p.x - ped.x, p.z - ped.z);
  }
  const sedan = new Car(world, 'sedan', 282, 108, Math.PI / 2, 0x3a6fd8);
  sedan.sync();
  world.traffic.cars.push({ car: sedan, kind: 'parked', edge: -1, nodeTarget: null, speed: 0, color: 0x3a6fd8, _stuck: 0 });
  world.hud.showDialogue('Dom Ferreira', 'Nova! Back in Solmar Bay at last. Take my sedan to the Marina — easy money.', 6500);
  world.hud.update(0);
}

function stageShootout(world, step) {
  const state = world.state;
  state.money = 980;
  state.wanted = 0;
  state.heat = 0;
  state.clockMinutes = 18 * 60 + 15;
  world.missions.startMission(2);
  world.player.teleport(284, 36, Math.PI / 2);
  step(STEP);
  step(STEP);
  firefight(world, step, 2.5);
  const p = world.state.player;
  const alive = world.combat.enemies.filter((e) => !e.dead);
  let bestYaw = p.yaw;
  let bestCount = -1;
  for (let a = 0; a < 24; a += 1) {
    const yaw = (a / 24) * Math.PI * 2;
    let count = 0;
    for (const e of alive) {
      const ang = Math.atan2(e.x - p.x, e.z - p.z);
      let diff = ang - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= Math.PI / 4) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      bestYaw = yaw;
    }
  }
  world.player.teleport(p.x, p.z, bestYaw);
  step(STEP);
  step(STEP);
  const before = world.state.stats.shotsFired;
  const input = world.input;
  for (let i = 0; i < 40 && world.state.stats.shotsFired === before; i += 1) {
    input.keys.clear();
    input.justPressed.clear();
    input.mouseDown = true;
    step(STEP);
    world.state.health = 100;
  }
  input.mouseDown = false;
  input.keys.clear();
  world.hud.showDialogue('Dom Ferreira', 'The Vipers want their car back. Teach them a lesson at the Beachfront lot, then meet me at the Marina.', 6500);
  world.hud.update(0);
}

function stageTitle(world, step) {
  world.player.teleport(-36, 0, Math.PI);
  parkPlayerCar(world, 'sports', -30, 12, Math.PI * 0.9, 0xff5533);
  world.player.exitCar();
  world.player.teleport(-36, 0, Math.PI);
  const input = world.input;
  const steps = Math.round(6 / STEP);
  for (let i = 0; i < steps; i += 1) {
    input.keys.clear();
    input.justPressed.clear();
    input.mouseDown = false;
    input.lookDX += 0.5;
    step(STEP);
  }
  input.lookDX = 0;
}

export function stageShot(world, name, step) {
  if (name === 'chase') stageChase(world, step);
  else if (name === 'marina') stageMarina(world, step);
  else if (name === 'shootout') stageShootout(world, step);
  else if (name === 'title') stageTitle(world, step);
  else stageChase(world, step);
  world.input.keys.clear();
  world.input.justPressed.clear();
  world.input.mouseDown = false;
  world.input.lookDX = 0;
  world.input.lookDY = 0;
}
