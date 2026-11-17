// Screenshot scenes for Solmar Bay. Each scene plays the real game forward
// from a fresh world for a fixed number of 1/60 s steps, steered by a small
// autopilot through the same input the player uses, so every frame is what a
// short stretch of real play looks like — and the same seed always gives the
// same frame. main.js calls stageShot(world, name, step) in ?shot= mode,
// renders once, and flags window.__shotReady.
import { Car, getPlayerCar } from './vehicles.js';

const STEP = 1 / 60;

function clampAngle(a) {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Drive toward a waypoint for `seconds`, steering with A/D through the real
// player input. The car follows the road the waypoint sits on.
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

// Walk forward for `seconds` (W relative to the camera, which teleport aimed).
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

// Stand and shoot at whatever the camera faces for `seconds`, healing the
// player after every step so the staged scene never ends on the WASTED
// screen, then keep stepping until one more shot actually fires so the
// final frame catches the muzzle flash and a tracer in the air.
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

// Put the player in a fresh car of `type` at (x, z, yaw) and register it as
// the player's car so traffic and the police treat it as the player's.
function parkPlayerCar(world, type, x, z, yaw, color) {
  const car = new Car(world, type, x, z, yaw, color);
  car.kind = 'player';
  world.traffic.cars.push({ car, kind: 'player' });
  world.player.enterCar(car);
  return car;
}

// Road-graph lookups, so staged traffic uses real edges and nodes.
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

// A real traffic car on the road ahead of the player, driving the same way.
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

// A traffic car placed on the same road line as (x, z), heading along `yaw`.
// The road segment is found from the config road lines, so the entry is valid.
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
  // Downtown, heading north up the x=36 road in a Sunset GT. The drive
  // runs clean (no wanted level yet) so no cruiser can ram or PIT the car
  // mid-run and spin it around; the 3-star chase is staged at the end,
  // once the car is at speed and pointed up the road.
  state.wanted = 0;
  state.heat = 0;
  world.player.teleport(36, 190, Math.PI);
  parkPlayerCar(world, 'sports', 36, 190, Math.PI, 0xff5533);
  // 5 seconds of flat-out driving, ending mid-block (not at an intersection).
  steerDrive(world, step, { x: 36, z: -252 }, 5);
  // Re-aim the chase camera at the car's real heading: the camera yaw does
  // not follow the car, so any nudge during the run would leave it looking
  // at the car from the side. teleport() resets the camera 7 m behind the
  // car on its heading; a short coast lets it settle at the driving
  // distance while the car holds its speed.
  const car = getPlayerCar(world.state);
  if (car) {
    world.player.teleport(car.x, car.z, car.yaw);
    for (let i = 0; i < 30; i += 1) step(STEP);
  }
  // Now the chase: 3 stars, full heat, fresh crime, so the heat bar stays
  // lit for the frame.
  state.wanted = 3;
  state.heat = 90;
  state.secondsSinceCrime = 0;
  // Final frame: a roadblock ahead and traffic sharing the road, so the
  // chase is visible, not just on the minimap. The cruisers sit just ahead
  // of the player (28 m and 48 m) with traffic beyond them, and the HUD is
  // refreshed once so the stars and heat bar show the final wanted level
  // (the HUD only updates inside stepWorld, which has already run).
  const p = world.state.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  const cop1 = new Car(world, 'police', p.x + fx * 28, p.z + fz * 28, p.yaw + Math.PI, 0x14161a);
  const cop2 = new Car(world, 'police', p.x + fx * 48 - fz * 5, p.z + fz * 48 + fx * 5, p.yaw + Math.PI, 0x14161a);
  world.police.policeCars.push({ car: cop1, ramCooldown: 0 });
  world.police.policeCars.push({ car: cop2, ramCooldown: 0 });
  cop1.sync();
  cop2.sync();
  // Traffic sharing the road beyond the roadblock: a sedan, a taxi and a
  // van in the next lanes, so the final frame has something to weave through.
  spawnTrafficOnRoad(world, p.x + fx * 62 + fz * 3, p.z + fz * 62 - fx * 3, p.yaw, 11, 'sedan', 0x3a6fd8);
  spawnTrafficOnRoad(world, p.x + fx * 85 - fz * 3, p.z + fz * 85 + fx * 3, p.yaw, 9, 'taxi', 0xf2c200);
  spawnTrafficOnRoad(world, p.x + fx * 110 + fz * 3, p.z + fz * 110 - fx * 3, p.yaw, 8, 'van', 0x8a93a5);
  world.hud.update(0);
}

function stageMarina(world, step) {
  const state = world.state;
  state.money = 640;
  state.respect = 120;
  world.missions.startMission(0);
  // On foot on the Marina promenade, facing south-east toward the marina
  // basin and the boats. A short walk stops well before the water's edge,
  // with the pier and its stalls in view.
  world.player.teleport(170, 210, 0.6);
  stroll(world, step, 2.2, ['KeyW']);
}

function stageShootout(world, step) {
  const state = world.state;
  state.money = 980;
  // No wanted level: the staged fight is Nova vs the Vipers, and police
  // cars would only beach themselves on the sand and steal the frame.
  state.wanted = 0;
  state.heat = 0;
  world.missions.startMission(2);
  // Beachfront lot: start ON the marker so the goto step completes at once
  // and the kill step spawns the Vipers around the lot.
  world.player.teleport(284, 36, Math.PI / 2);
  step(STEP);
  step(STEP);
  firefight(world, step, 7);
}

function stageTitle(world, step) {
  // The title screen over the live city: Nova on the x=-36 road in
  // Downtown (no stunt ramp there), camera slowly panning up the road
  // canyon between the towers. main.js shows the title overlay and hides
  // the HUD after this returns.
  world.player.teleport(-36, 0, Math.PI);
  // A parked Sunset GT on the roadside gives the title frame a hero car.
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
