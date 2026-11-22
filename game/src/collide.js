// collide.js — circle/box collision, sight lines, swept movement.
import { CONFIG } from './config.js';

function nearestOnBox(b, x, z) {
  return {
    x: b.minX > x ? b.minX : (b.maxX < x ? b.maxX : x),
    z: b.minZ > z ? b.minZ : (b.maxZ < z ? b.maxZ : z),
  };
}

function pushOutFromInside(b, x, z, r) {
  const toLeft = x - b.minX + r;
  const toRight = b.maxX - x + r;
  const toBack = z - b.minZ + r;
  const toFront = b.maxZ - z + r;
  const smallest = Math.min(toLeft, toRight, toBack, toFront);
  if (smallest === toLeft) return { x: b.minX - r, z };
  if (smallest === toRight) return { x: b.maxX + r, z };
  if (smallest === toBack) return { x, z: b.minZ - r };
  return { x, z: b.maxZ + r };
}

export function resolveCircleColliders(x, z, r, colliders) {
  let hit = false;
  let firstBox = null;
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    const near = nearestOnBox(b, x, z);
    const dx = x - near.x;
    const dz = z - near.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (!firstBox) firstBox = b;
    if (d2 > 0.000001) {
      const d = Math.sqrt(d2);
      x = near.x + (dx / d) * r;
      z = near.z + (dz / d) * r;
    } else {
      const out = pushOutFromInside(b, x, z, r);
      x = out.x;
      z = out.z;
    }
  }
  return { x, z, hit, box: firstBox };
}

export function resolveCircleBox(x, z, r, b) {
  const near = nearestOnBox(b, x, z);
  const dx = x - near.x;
  const dz = z - near.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { x, z, hit: false };
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    return { x: near.x + (dx / d) * r, z: near.z + (dz / d) * r, hit: true };
  }
  const out = pushOutFromInside(b, x, z, r);
  return { x: out.x, z: out.z, hit: true };
}

export function sweptCircle(x, z, r, vx, vz, dt, colliders) {
  const speed = Math.hypot(vx, vz);
  const steps = Math.max(1, Math.ceil((speed * dt) / (r * 0.5)));
  let cx = x;
  let cz = z;
  let hit = false;
  for (let s = 0; s < steps; s += 1) {
    const solved = resolveCircleColliders(cx + (vx * dt) / steps, cz + (vz * dt) / steps, r, colliders);
    cx = solved.x;
    cz = solved.z;
    if (solved.hit) hit = true;
  }
  return { x: cx, z: cz, hit };
}

export function hasLineOfSight(ax, az, bx, bz, blockers) {
  for (const b of blockers) {
    if (segmentHitsBox(ax, az, bx, bz, b)) return false;
  }
  return true;
}

function segmentHitsBox(ax, az, bx, bz, b) {
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  const slabs = [
    [ax, dx, b.minX, b.maxX],
    [az, dz, b.minZ, b.maxZ],
  ];
  for (const [origin, dir, lo, hi] of slabs) {
    if (Math.abs(dir) < 0.000001) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t0 = (lo - origin) / dir;
      let t1 = (hi - origin) / dir;
      if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
      if (tMin > tMax) return false;
    }
  }
  return true;
}

export function clampToWorld(x, z, r) {
  return {
    x: Math.max(CONFIG.WORLD_MIN_X + r, Math.min(CONFIG.WORLD_MAX_X - r, x)),
    z: Math.max(CONFIG.WORLD_MIN_Z + r, Math.min(CONFIG.WORLD_MAX_Z - r, z)),
  };
}

export function circlesOverlap(ax, az, ar, bx, bz, br) {
  const dx = ax - bx;
  const dz = az - bz;
  const reach = ar + br;
  return dx * dx + dz * dz < reach * reach;
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export function distance2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
