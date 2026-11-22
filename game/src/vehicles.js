// vehicles.js — car models and arcade driving physics.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { resolveCircleColliders, clampToWorld } from './collide.js';
import { phaseOfDay as dayPhase } from './config.js';

export function wrapAngle(a) {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function getPlayerCar(state) {
  if (!state || !state.player) return null;
  const c = state.player.car;
  if (!c) return null;
  if (typeof c.x === 'number' && typeof c.z === 'number') return c;
  if (c.car && typeof c.car.x === 'number') return c.car;
  return null;
}

function paint(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.45,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.45,
    emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
  });
}

function slab(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function kindSpec(type) {
  const table = CONFIG.CAR_KINDS || {};
  return table[type] || { topSpeed: CONFIG.CAR.MAX_SPEED, accel: CONFIG.CAR.ACCEL, steer: CONFIG.CAR.STEER_MAX, length: 4.4, width: 1.9 };
}

export function makeCarModel(type, colorHex) {
  const group = new THREE.Group();
  const t = type || 'sedan';
  const spec = kindSpec(t);
  const isPolice = t === 'police';
  const isTruck = t === 'truck';
  const isVan = t === 'van';
  const isBus = t === 'bus';
  const isBike = t === 'motorbike';
  const isSports = t === 'sports';

  const bodyColor = isPolice
    ? 0x14161a
    : colorHex !== undefined ? colorHex : (t === 'taxi' ? 0xf2c200 : 0xd8d8d8);
  const body = paint(bodyColor, { roughness: 0.35, metalness: 0.6 });
  const glass = paint(0x1a2733, { roughness: 0.12, metalness: 0.85 });
  const dark = paint(0x151515, { roughness: 0.9, metalness: 0.1 });
  const headMat = paint(0xfff2b0, { emissive: 0xffe89a, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.1 });
  const tailMat = paint(0x881111, { emissive: 0xdd2222, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.1 });

  const len = spec.length;
  const wid = spec.width;
  const halfLen = len / 2;
  const halfWid = wid / 2;
  const wheelR = isTruck || isBus ? 0.46 : isBike ? 0.34 : 0.36;
  const axle = isTruck ? 2.1 : isBus ? 3.1 : halfLen - 0.75;
  const wheelX = halfWid - 0.08;

  if (isBike) {
    group.add(slab(0.5, 0.5, 1.9, body, 0, 0.62, 0));
    group.add(slab(0.44, 0.35, 0.7, glass, 0, 0.95, 0.35));
    group.add(slab(0.4, 0.18, 0.9, dark, 0, 0.82, -0.45));
    const skin = paint(0xc98d64, { roughness: 0.8, metalness: 0 });
    const jacket = paint(0x2e5fa3, { roughness: 0.85, metalness: 0 });
    group.add(slab(0.42, 0.55, 0.4, jacket, 0, 1.25, -0.15));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
    head.position.set(0, 1.7, -0.15);
    head.castShadow = true;
    group.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), dark);
    helmet.position.set(0, 1.74, -0.15);
    helmet.castShadow = true;
    group.add(helmet);
  } else {
    const bodyH = isSports ? 0.5 : isTruck ? 0.7 : isBus ? 0.9 : 0.62;
    const bodyY = isSports ? 0.5 : isBus ? 0.72 : 0.58;
    group.add(slab(wid, bodyH, len, body, 0, bodyY, isTruck ? -0.5 : 0));
    if (isTruck) {
      group.add(slab(wid - 0.1, 0.85, 1.5, body, 0, 1.0, 1.9));
      group.add(slab(wid - 0.3, 0.7, 1.2, glass, 0, 1.05, 2.35));
      group.add(slab(wid - 0.2, 0.28, 3.6, dark, 0, 0.95, -1.2));
    } else if (isVan || isBus) {
      const cabLen = isBus ? len - 1.2 : len - 0.9;
      group.add(slab(wid - 0.12, isBus ? 1.1 : 0.95, cabLen, glass, 0, 1.25, -0.2));
      if (isBus) {
        group.add(slab(1.6, 0.22, 0.6, paint(0xf2c200, { roughness: 0.5, metalness: 0.2 }), 0, 1.95, 0.4));
        group.add(slab(0.05, 0.3, len - 1.4, paint(0xf2c200, { roughness: 0.5, metalness: 0.2 }), -halfWid - 0.01, 0.95, 0));
        group.add(slab(0.05, 0.3, len - 1.4, paint(0xf2c200, { roughness: 0.5, metalness: 0.2 }), halfWid + 0.01, 0.95, 0));
      }
    } else {
      const cabinLen = isSports ? 2.0 : 2.2;
      const cabinY = isSports ? 0.98 : 1.08;
      const cabinMat = isPolice ? paint(0xf2f2f2, { roughness: 0.4, metalness: 0.5 }) : glass;
      group.add(slab(wid - 0.24, 0.55, cabinLen, cabinMat, 0, cabinY, isSports ? -0.15 : -0.25));
    }
    if (isSports) {
      group.add(slab(1.9, 0.06, 0.3, dark, 0, 1.0, -2.2));
      group.add(slab(0.08, 0.22, 0.08, dark, -0.8, 0.88, -2.2));
      group.add(slab(0.08, 0.22, 0.08, dark, 0.8, 0.88, -2.2));
    }
  }

  if (isPolice) {
    group.add(slab(1.1, 0.09, 0.34, dark, 0, 1.42, -0.25));
    group.add(slab(0.48, 0.14, 0.3, paint(0x881111, { emissive: 0xff2222, emissiveIntensity: 2.2 }), -0.27, 1.5, -0.25));
    group.add(slab(0.48, 0.14, 0.3, paint(0x111188, { emissive: 0x2244ff, emissiveIntensity: 2.2 }), 0.27, 1.5, -0.25));
    group.add(slab(0.04, 0.34, 1.5, paint(0xf2f2f2, { roughness: 0.4, metalness: 0.5 }), -halfWid - 0.01, 0.62, 0.1));
    group.add(slab(0.04, 0.34, 1.5, paint(0xf2f2f2, { roughness: 0.4, metalness: 0.5 }), halfWid + 0.01, 0.62, 0.1));
  }

  const frontZ = (isTruck ? -0.5 : 0) + halfLen + 0.01;
  const rearZ = (isTruck ? -0.5 : 0) - halfLen - 0.01;
  const lightX = isBike ? 0.18 : 0.65;
  if (isBike) {
    group.add(slab(0.3, 0.14, 0.06, headMat, 0, 0.7, frontZ));
    group.add(slab(0.3, 0.14, 0.06, tailMat, 0, 0.7, rearZ));
  } else {
    group.add(slab(0.36, 0.14, 0.06, headMat, -lightX, 0.62, frontZ));
    group.add(slab(0.36, 0.14, 0.06, headMat, lightX, 0.62, frontZ));
    group.add(slab(0.36, 0.14, 0.06, tailMat, -lightX, 0.62, rearZ));
    group.add(slab(0.36, 0.14, 0.06, tailMat, lightX, 0.62, rearZ));
  }

  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steerPivots = [];
  const wheelZs = isBike ? [0.75, -0.75] : [axle, -axle];
  const wheelXs = isBike ? [0] : [-wheelX, wheelX];
  for (const wz of wheelZs) {
    for (const wx of wheelXs) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, wheelR, (isTruck ? -0.5 : 0) + wz);
      const w = new THREE.Mesh(wheelGeo, dark);
      w.castShadow = true;
      pivot.add(w);
      group.add(pivot);
      wheels.push(w);
      if (wz > 0) steerPivots.push(pivot);
    }
  }

  group.userData.wheels = wheels;
  group.userData.steerPivots = steerPivots;
  group.userData.wheelRadius = wheelR;
  group.userData.headMat = headMat;
  group.userData.tailMat = tailMat;
  group.userData.type = t;
  return group;
}

export class Car {
  constructor(world, type, x, z, yaw, colorHex) {
    this.world = world;
    this.type = type || 'sedan';
    this.spec = kindSpec(this.type);
    this.x = x;
    this.z = z;
    this.yaw = yaw || 0;
    this.speed = 0;
    this.steer = 0;
    this.radius = this.type === 'truck' ? 2.0 : this.type === 'bus' ? 2.2 : this.type === 'motorbike' ? 0.9 : CONFIG.CAR.RADIUS;
    this.isPolice = this.type === 'police';
    this.group = makeCarModel(this.type, colorHex);
    this._wheelAngle = 0;
    this._lx = x;
    this._lz = z;
    this._braking = false;
    if (world && world.scene) world.scene.add(this.group);
    this.sync();
  }

  destroy() {
    if (this.group.parent) this.group.parent.remove(this.group);
  }

  sync() {
    const dx = this.x - this._lx;
    const dz = this.z - this._lz;
    if (dx !== 0 || dz !== 0) {
      const along = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      const wr = this.group.userData.wheelRadius || 0.36;
      this._wheelAngle += along / wr;
      this._lx = this.x;
      this._lz = this.z;
    }
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.yaw;
    const wheels = this.group.userData.wheels;
    for (let i = 0; i < wheels.length; i += 1) wheels[i].rotation.x = this._wheelAngle;
    const pivots = this.group.userData.steerPivots || [];
    for (const p of pivots) p.rotation.y = -this.steer * 0.9;
    const clock = this.world && this.world.state ? this.world.state.clockMinutes : 1000;
    const dark = dayPhase(clock) === 'night' || dayPhase(clock) === 'dusk';
    const head = this.group.userData.headMat;
    const tail = this.group.userData.tailMat;
    if (head) head.emissiveIntensity = dark ? 1.6 : 0.35;
    if (tail) tail.emissiveIntensity = this._braking ? 2.4 : (dark ? 1.2 : 0.4);
  }

  pushFrom(x, z, r) {
    let dx = this.x - x;
    let dz = this.z - z;
    const minD = r + this.radius;
    let d = Math.hypot(dx, dz);
    if (d >= minD) return false;
    if (d < 0.001) {
      dx = 1;
      dz = 0;
      d = 1;
    }
    const push = minD - d;
    this.x += (dx / d) * push;
    this.z += (dz / d) * push;
    this.speed *= 0.85;
    return true;
  }

  _integrate(dt) {
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    const colliders = this.world.city ? this.world.city.colliders : null;
    if (colliders && colliders.length) {
      const r = resolveCircleColliders(this.x, this.z, this.radius, colliders);
      if (r.hit) {
        this.x = r.x;
        this.z = r.z;
        this.speed *= 0.55;
      }
    }
    const c = clampToWorld(this.x, this.z, this.radius);
    this.x = c.x;
    this.z = c.z;
  }

  updatePlayer(dt, input) {
    const state = this.world.state;
    const keys = input.keys;
    const maxSpeed = this.spec.topSpeed;
    const handbrake = keys.has('Space');
    this._braking = keys.has('KeyS') || keys.has('ArrowDown') || handbrake;

    let targetSteer = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) targetSteer += this.spec.steer;
    if (keys.has('KeyD') || keys.has('ArrowRight')) targetSteer -= this.spec.steer;
    if (handbrake) targetSteer *= 1.5;
    const steerRate = CONFIG.CAR.STEER_SPEED * (handbrake ? 1.7 : 1);
    const ds = targetSteer - this.steer;
    const maxDs = steerRate * dt;
    this.steer += Math.max(-maxDs, Math.min(maxDs, ds));

    const fwd = keys.has('KeyW') || keys.has('ArrowUp');
    const back = keys.has('KeyS') || keys.has('ArrowDown');
    if (fwd) this.speed += this.spec.accel * dt;
    if (back) {
      if (this.speed > 0.5) this.speed -= CONFIG.CAR.BRAKE * dt;
      else this.speed -= this.spec.accel * 0.7 * dt;
    }
    if (!fwd && !back) {
      const drag = 7 * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }
    if (handbrake) {
      const hb = 30 * dt;
      if (Math.abs(this.speed) <= hb) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * hb;
    }
    if (this.speed > maxSpeed) this.speed = maxSpeed;
    if (this.speed < -CONFIG.CAR.REVERSE_MAX_SPEED) this.speed = -CONFIG.CAR.REVERSE_MAX_SPEED;

    const spdF = Math.max(-1, Math.min(1, this.speed / 9));
    this.yaw += this.steer * 1.9 * spdF * dt;

    this._integrate(dt);
    if (state) {
      state.player.speed = Math.abs(this.speed);
      state.player.x = this.x;
      state.player.z = this.z;
      state.player.yaw = this.yaw;
    }
    this.sync();
  }

  updateAuto(dt, targetSpeed, targetYaw) {
    const diff = wrapAngle(targetYaw - this.yaw);
    this.steer = Math.max(
      -this.spec.steer,
      Math.min(this.spec.steer, diff * 1.4),
    );
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + this.spec.accel * 0.85 * dt);
    } else if (this.speed > targetSpeed) {
      this.speed = Math.max(targetSpeed, this.speed - CONFIG.CAR.BRAKE * dt);
    }
    const maxTurn = 2.4 * Math.min(1, Math.abs(this.speed) / 7 + 0.25);
    const turn = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diff));
    this.yaw += turn * (this.speed < -0.1 ? -1 : 1);
    this._integrate(dt);
    this.sync();
  }
}
