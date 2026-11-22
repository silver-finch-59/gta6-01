// city.js — the city: roads, buildings, beach, ocean, pier, day/night cycle.
import * as THREE from 'three';
import { CONFIG, districtAt, phaseOfDay } from './config.js';
import {
  makeBuildingTexture,
  makeRoadTexture,
  makeSidewalkTexture,
  makeSandTexture,
  makeSignTexture,
  makeCrosswalkTexture,
  makeGlassTowerTexture,
  makeGrassTexture,
  makePierWoodTexture,
  makeTurfTexture,
  makeNeonTexture,
  makeRoofTexture,
} from './textures.js';

const LINES = CONFIG.ROAD_LINES; // [-252,-180,-108,-36,36,108,180,252]
const EDGE_CLEARANCE = 4;

const SPAWN_POINTS = {
  player: { x: 36, z: 216, yaw: Math.PI },
  garage: { x: 36, z: 252 },
  hospital: { x: -36, z: 252 },
  policeStation: { x: -36, z: -36 },
  beachLot: { x: 288, z: 36 },
  harbor: { x: 180, z: -252 },
  oldTown: { x: -252, z: 180 },
  marina: { x: 180, z: 252 },
  hilltop: { x: -252, z: -252 },
  pier: { x: 296, z: 108 },
  park: { x: -36, z: -108 },
};

const PACKAGE_SPOTS = [
  { x: 44.5, z: 44.5 }, // Downtown
  { x: -44.5, z: -44.5 }, // Downtown
  { x: -243.5, z: 188.5 }, // Old Town
  { x: 116.5, z: 243.5 }, // Marina
  { x: 188.5, z: -188.5 }, // Harbor
  { x: 260.5, z: -27.5 }, // Beachfront promenade
  { x: -188.5, z: -243.5 }, // Hills
  { x: 99.5, z: -99.5 }, // Downtown
  { x: -99.5, z: 171.5 }, // Marina
  { x: -116.5, z: -116.5 }, // Hills
  { x: 171.5, z: 99.5 }, // Marina
  { x: -171.5, z: -27.5 }, // Old Town
];

const RAMP_SPOTS = [
  { x: 36, z: 0, yaw: Math.PI / 2 },
  { x: -108, z: 108, yaw: 0 },
  { x: 180, z: -36, yaw: 0 },
];

const BILLBOARDS = [
  { x: -27, z: -27, text: 'SOLMAR BAY', sub: 'WELCOME TO THE BAY', bg: '#1d2f4a' },
  { x: 45, z: 243, text: "DOM'S GARAGE", sub: 'REPAIRS • TUNING', bg: '#3a2a12' },
  { x: 189, z: -99, text: 'SUNSET GT', sub: 'FASTEST IN THE BAY', bg: '#4a1d2f' },
  { x: 117, z: 171, text: 'MARINA', sub: 'BOATS • FISH • SUN', bg: '#123a3a' },
  { x: -243, z: -27, text: 'TACO PALACE', sub: 'OPEN ALL NIGHT', bg: '#7a2e12' },
  { x: 261, z: 117, text: 'PIER 9', sub: 'ARCADE • SNACKS', bg: '#123a2a' },
];

const CONTAINER_COLORS = [0xb8442c, 0x2c6fb8, 0x3f9e4d, 0xd8a13a, 0x7a4a9e, 0x2f8f8a];
const UMBRELLA_COLORS = [0xe84a5f, 0x2c9e8f, 0xf2a541, 0x4a7fd8];
const NEON_SIGNS = [
  { text: 'NOVA', glow: '#ff4d7e' },
  { text: 'SOLMAR', glow: '#4dd8ff' },
  { text: 'CASINO', glow: '#ffd23e' },
  { text: 'HOTEL', glow: '#b46bff' },
];

function palettesFor(name) {
  switch (name) {
    case 'Downtown': return ['glass', 'concrete', 'glass'];
    case 'Old Town': return ['brick', 'stucco', 'brick'];
    case 'Marina': return ['pastel', 'glass', 'pastel'];
    case 'Harbor': return ['concrete', 'brick'];
    case 'Beachfront': return ['pastel', 'stucco'];
    case 'Hills': return ['stucco', 'concrete'];
    default: return ['stucco', 'concrete'];
  }
}

export function buildCity(scene, rng) {
  const colliders = [];
  const clouds = [];
  const boats = [];
  const flags = [];
  const neonMats = [];
  let ocean = null;
  let sun = null;
  let hemi = null;
  let lampGlowMat = null;

  scene.background = new THREE.Color(0xf2a35e);
  scene.fog = new THREE.Fog(0xeeb27a, 320, 950);

  sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-220, 180, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -360;
  sun.shadow.camera.right = 360;
  sun.shadow.camera.top = 360;
  sun.shadow.camera.bottom = -360;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0005;
  sun.target.position.set(20, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  hemi = new THREE.HemisphereLight(0xffe0b3, 0x8a7a5a, 0.85);
  scene.add(hemi);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const mats = {
    roof: new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 1 }),
    roofBox: new THREE.MeshStandardMaterial({ color: 0x6a6e73, roughness: 0.95 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 }),
    frond: new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.9 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.7, metalness: 0.4 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x8f8f84, roughness: 1 }),
    plaza: new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 }),
    parking: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 1 }),
    line: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.9 }),
    dock: new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 }),
    hull: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0x2c6fb8, roughness: 0.6 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    ramp: new THREE.MeshStandardMaterial({ color: 0xe8862e, roughness: 0.8 }),
    rampBase: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
    cloud: new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.88, roughness: 1,
    }),
    ocean: new THREE.MeshStandardMaterial({
      color: 0x1e6f9e, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1,
    }),
    basin: new THREE.MeshStandardMaterial({
      color: 0x2a7fa8, transparent: true, opacity: 0.9, roughness: 0.3,
    }),
    grass: new THREE.MeshStandardMaterial({ map: makeGrassTexture(rng), roughness: 1 }),
    turf: new THREE.MeshStandardMaterial({ map: makeTurfTexture(), roughness: 1 }),
    pierWood: new THREE.MeshStandardMaterial({ map: makePierWoodTexture(rng), roughness: 1 }),
    roofTop: new THREE.MeshStandardMaterial({ map: makeRoofTexture(rng), roughness: 1 }),
  };
  lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 0.15, roughness: 0.4,
  });

  const facadeCache = new Map();
  function facadeMaterial(palette, w, h) {
    if (!facadeCache.has(palette)) {
      const tex = palette === 'glass' && rng.chance(0.5)
        ? makeGlassTowerTexture(rng)
        : makeBuildingTexture(rng, palette);
      facadeCache.set(palette, tex);
    }
    const map = facadeCache.get(palette).clone();
    map.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 14)));
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map, roughness: 0.85, metalness: palette === 'glass' ? 0.25 : 0.05,
    });
  }

  function place(geo, mat, x, y, z, castShadow = true, receiveShadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    scene.add(m);
    return m;
  }

  const groundGeo = new THREE.PlaneGeometry(624, 576);
  groundGeo.rotateX(-Math.PI / 2);
  place(groundGeo, mats.ground, 24, 0, 0, false, true);

  const roadTex = makeRoadTexture();
  const roadNSGeo = new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, 576);
  roadNSGeo.rotateX(-Math.PI / 2);
  const roadEWGeo = new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, 558);
  roadEWGeo.rotateX(-Math.PI / 2);
  roadEWGeo.rotateY(Math.PI / 2);
  for (const L of LINES) {
    const texNS = roadTex.clone();
    texNS.repeat.set(1, 24);
    texNS.needsUpdate = true;
    place(roadNSGeo, new THREE.MeshStandardMaterial({ map: texNS, roughness: 0.95 }), L, 0.01, 0, false, true);
    const texEW = roadTex.clone();
    texEW.repeat.set(1, 23.25);
    texEW.needsUpdate = true;
    place(roadEWGeo, new THREE.MeshStandardMaterial({ map: texEW, roughness: 0.95 }), -9, 0.01, L, false, true);
  }

  const sidewalkTex = makeSidewalkTexture();
  const walkNSGeo = new THREE.PlaneGeometry(4, 576);
  walkNSGeo.rotateX(-Math.PI / 2);
  const walkEWGeo = new THREE.PlaneGeometry(4, 558);
  walkEWGeo.rotateX(-Math.PI / 2);
  walkEWGeo.rotateY(Math.PI / 2);
  const sidewalks = [];
  for (const L of LINES) {
    for (const off of [-8, 8]) {
      const texNS = sidewalkTex.clone();
      texNS.repeat.set(1, 144);
      texNS.needsUpdate = true;
      place(walkNSGeo, new THREE.MeshStandardMaterial({ map: texNS, roughness: 1 }), L + off, 0.015, 0, false, true);
      sidewalks.push({ x1: L + off, z1: -288, x2: L + off, z2: 288 });
      const texEW = sidewalkTex.clone();
      texEW.repeat.set(1, 139.5);
      texEW.needsUpdate = true;
      place(walkEWGeo, new THREE.MeshStandardMaterial({ map: texEW, roughness: 1 }), -9, 0.015, L + off, false, true);
      sidewalks.push({ x1: -288, z1: L + off, x2: 270, z2: L + off });
    }
  }

  const crossTex = makeCrosswalkTexture();
  const crossGeo = new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, CONFIG.ROAD_WIDTH);
  crossGeo.rotateX(-Math.PI / 2);
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.95 });
  for (const zx of LINES) {
    for (const zz of LINES) {
      place(crossGeo, crossMat, zx, 0.03, zz, false, true);
    }
  }

  const sandTex = makeSandTexture();
  sandTex.repeat.set(2, 22);
  const sandGeo = new THREE.PlaneGeometry(52, 576);
  sandGeo.rotateX(-Math.PI / 2);
  place(sandGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }), 296, 0.02, 0, false, true);

  const oceanGeo = new THREE.PlaneGeometry(160, 800);
  oceanGeo.rotateX(-Math.PI / 2);
  ocean = place(oceanGeo, mats.ocean, 402, 0.12, 0, false, false);

  const basinGeo = new THREE.PlaneGeometry(72, 60);
  basinGeo.rotateX(-Math.PI / 2);
  place(basinGeo, mats.basin, 222, 0.1, 258, false, false);
  const dockGeo = new THREE.BoxGeometry(66, 0.3, 4);
  place(dockGeo, mats.dock, 222, 0.25, 226, false, true);
  const boatSpots = [
    { x: 200, z: 240, yaw: 0.2 }, { x: 220, z: 250, yaw: -0.15 },
    { x: 240, z: 242, yaw: 0.35 }, { x: 205, z: 272, yaw: -0.3 },
    { x: 235, z: 272, yaw: 0.1 },
  ];
  for (const b of boatSpots) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 3), mats.hull);
    hull.position.y = 0.7;
    hull.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.4), mats.cabin);
    cabin.position.set(-0.5, 1.9, 0);
    cabin.castShadow = true;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), mats.mast);
    mast.position.set(1.5, 3.5, 0);
    g.add(hull, cabin, mast);
    g.position.set(b.x, 0.15, b.z);
    g.rotation.y = b.yaw;
    scene.add(g);
    boats.push(g);
  }

  const pierDeckGeo = new THREE.BoxGeometry(52, 0.4, 8);
  place(pierDeckGeo, mats.pierWood, 296, 0.5, 120, false, true);
  colliders.push({ minX: 270, maxX: 322, minZ: 115, maxZ: 125 });
  const pierRailMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(52, 0.9, 0.25), pierRailMat);
    rail.position.set(296, 1.1, 120 + side * 3.9);
    scene.add(rail);
  }
  for (let i = 0; i < 3; i += 1) {
    const stall = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({
      color: [0xe84a5f, 0x2c9e8f, 0xf2a541][i], roughness: 0.8,
    }));
    stall.scale.set(3, 2.4, 3);
    stall.position.set(282 + i * 12, 1.7, 120);
    stall.castShadow = true;
    scene.add(stall);
  }
  const wheel = new THREE.Group();
  const wheelRim = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.35, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.5, metalness: 0.3 }),
  );
  wheel.add(wheelRim);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const cabin = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({
      color: [0xe84a5f, 0x2c9e8f, 0xf2a541, 0x4a7fd8][i % 4], roughness: 0.7,
    }));
    cabin.scale.set(1.4, 1.4, 1.4);
    cabin.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0);
    wheel.add(cabin);
  }
  const legGeo = new THREE.CylinderGeometry(0.3, 0.4, 12, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mats.pole);
    leg.position.set(318, 6, 120 + side * 2);
    leg.rotation.x = side * 0.35;
    scene.add(leg);
  }
  wheel.position.set(318, 12, 120);
  scene.add(wheel);

  const blockXs = [-273, -216, -144, -72, 0, 72, 144, 216];
  const blockZs = [-273, -216, -144, -72, 0, 72, 144, 216, 273];
  const palmSpots = [];

  function raiseBuilding(cx, cz, w, d, h, palette) {
    const mat = facadeMaterial(palette, w, h);
    const m = new THREE.Mesh(unitBox, [mat, mat, mats.roofTop, mats.roofTop, mat, mat]);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    const kind = rng.next();
    if (h > 24 || kind < 0.55) {
      const rw = rng.range(3, Math.min(8, w * 0.3));
      const rd = rng.range(3, Math.min(8, d * 0.3));
      if (kind < 0.25) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 10),
          new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 }));
        tank.position.set(cx + rng.range(-w / 4, w / 4), h + 1.5, cz + rng.range(-d / 4, d / 4));
        tank.castShadow = true;
        scene.add(tank);
      } else if (kind < 0.4) {
        const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 7, 6), mats.pole);
        mastMesh.position.set(cx + rng.range(-w / 4, w / 4), h + 3.5, cz + rng.range(-d / 4, d / 4));
        scene.add(mastMesh);
      } else {
        const rh = rng.range(1.2, 2.6);
        const roof = new THREE.Mesh(unitBox, mats.roofBox);
        roof.scale.set(rw, rh, rd);
        roof.position.set(cx + rng.range(-w / 4, w / 4), h + rh / 2, cz + rng.range(-d / 4, d / 4));
        roof.castShadow = true;
        scene.add(roof);
      }
    }
    if (h >= 55 && rng.chance(0.45)) {
      const sign = NEON_SIGNS[Math.floor(rng.next() * NEON_SIGNS.length)];
      const tex = makeNeonTexture(sign.text, { glow: sign.glow });
      const neonMat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25,
        roughness: 0.6, transparent: true,
      });
      neonMats.push(neonMat);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), neonMat);
      board.position.set(cx, h - 4, cz + d / 2 + 0.15);
      scene.add(board);
    }
  }

  function towerHeight(cx, cz, district) {
    if (district === 'Downtown') {
      const d = Math.hypot(cx, cz) / 160;
      const h = 34 + rng.range(0, 56) * (1 - Math.min(1, d * 0.7));
      return Math.max(30, Math.min(90, h));
    }
    if (district === 'Hills') return rng.range(6, 14);
    if (district === 'Beachfront') return rng.range(8, 18);
    if (district === 'Harbor') return rng.range(8, 16);
    return rng.range(8, 25);
  }

  function fillBlock(cx, cz) {
    const district = districtAt(cx, cz);
    const palettes = palettesFor(district);
    const roll = rng.next();
    const count = roll < 0.35 ? 1 : roll < 0.7 ? 2 : 4;
    const baseH = towerHeight(cx, cz, district);
    if (count === 1) {
      const w = rng.range(34, 50);
      const d = rng.range(34, 50);
      raiseBuilding(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, d,
        baseH, rng.pick(palettes));
    } else if (count === 2) {
      const alongX = rng.chance(0.5);
      for (const s of [-1, 1]) {
        const w = alongX ? rng.range(20, 23) : rng.range(34, 48);
        const d = alongX ? rng.range(34, 48) : rng.range(20, 23);
        const bx = alongX ? cx + s * 14 : cx + rng.range(-2, 2);
        const bz = alongX ? cz + rng.range(-2, 2) : cz + s * 14;
        raiseBuilding(bx, bz, w, d, baseH * rng.range(0.85, 1.15), rng.pick(palettes));
      }
    } else {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const w = rng.range(20, 24);
          const d = rng.range(20, 24);
          raiseBuilding(cx + sx * 14, cz + sz * 14, w, d,
            baseH * rng.range(0.8, 1.2), rng.pick(palettes));
        }
      }
    }
  }

  function layPlaza(cx, cz) {
    const slabGeo = new THREE.PlaneGeometry(56, 56);
    slabGeo.rotateX(-Math.PI / 2);
    place(slabGeo, mats.plaza, cx, 0.02, cz, false, true);
    palmSpots.push({ x: cx - 18, z: cz - 18 }, { x: cx + 18, z: cz + 18 });
    const benchGeo = new THREE.BoxGeometry(3, 0.5, 1);
    place(benchGeo, mats.dock, cx - 8, 0.35, cz + 10);
    place(benchGeo, mats.dock, cx + 8, 0.35, cz - 10);
  }

  function layParking(cx, cz) {
    const slabGeo = new THREE.PlaneGeometry(56, 56);
    slabGeo.rotateX(-Math.PI / 2);
    place(slabGeo, mats.parking, cx, 0.02, cz, false, true);
    const lineGeo = new THREE.BoxGeometry(0.3, 0.06, 10);
    for (let i = -2; i <= 2; i += 1) {
      place(lineGeo, mats.line, cx + i * 10, 0.06, cz, false, true);
    }
  }

  function layPark(cx, cz) {
    const grassGeo = new THREE.PlaneGeometry(56, 56);
    grassGeo.rotateX(-Math.PI / 2);
    place(grassGeo, mats.grass, cx, 0.02, cz, false, true);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 20), mats.basin);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(cx + 8, 0.06, cz - 6);
    scene.add(pond);
    const pathGeo = new THREE.PlaneGeometry(56, 4);
    pathGeo.rotateX(-Math.PI / 2);
    place(pathGeo, mats.plaza, cx, 0.03, cz + 12, false, true);
    palmSpots.push({ x: cx - 20, z: cz + 18 }, { x: cx + 20, z: cz - 18 }, { x: cx - 8, z: cz - 20 });
    const benchGeo = new THREE.BoxGeometry(3, 0.5, 1);
    place(benchGeo, mats.dock, cx - 12, 0.35, cz + 8);
    place(benchGeo, mats.dock, cx + 14, 0.35, cz - 14);
  }

  function laySportsField(cx, cz) {
    const turfGeo = new THREE.PlaneGeometry(52, 36);
    turfGeo.rotateX(-Math.PI / 2);
    place(turfGeo, mats.turf, cx, 0.02, cz, false, true);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3, 6);
      for (const off of [-3, 3]) {
        place(postGeo, goalMat, cx + side * 24, 1.5, cz + off);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), goalMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(cx + side * 24, 3, cz);
      scene.add(bar);
    }
  }

  function layContainerYard(cx, cz) {
    for (let gx = -2; gx <= 2; gx += 1) {
      for (let gz = -1; gz <= 1; gz += 1) {
        if (rng.chance(0.25)) continue;
        const alongX = rng.chance(0.6);
        const w = alongX ? 10 : 2.6;
        const d = alongX ? 2.6 : 10;
        const x = cx + gx * 12;
        const z = cz + gz * 16;
        const col = new THREE.MeshStandardMaterial({
          color: rng.pick(CONTAINER_COLORS), roughness: 0.7, metalness: 0.3,
        });
        const box = new THREE.Mesh(unitBox, col);
        box.scale.set(w, 2.6, d);
        box.position.set(x, 1.3, z);
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        if (rng.chance(0.4)) {
          const top = new THREE.Mesh(unitBox, col);
          top.scale.set(w, 2.6, d);
          top.position.set(x, 3.9, z);
          top.castShadow = true;
          scene.add(top);
        }
      }
    }
  }

  for (const cx of blockXs) {
    for (const cz of blockZs) {
      if ((cx === 216 && cz === 216) || (cx === 216 && cz === 273)) continue;
      if (cx === 216 && cz === -216) { layContainerYard(cx, cz); continue; }
      if (cx === 0 && cz === 0) { layPlaza(cx, cz); continue; }
      if (cx === -216 && cz === -144) { layPark(cx, cz); continue; }
      if (cx === -216 && cz === 144) { laySportsField(cx, cz); continue; }
      const r = rng.next();
      if (r < 0.10) { layPlaza(cx, cz); continue; }
      if (r < 0.20) { layParking(cx, cz); continue; }
      fillBlock(cx, cz);
    }
  }

  for (let z = -240; z <= 240; z += 48) palmSpots.push({ x: 276, z });
  palmSpots.push({ x: 192, z: 222 }, { x: 216, z: 222 }, { x: 240, z: 222 });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 5, 7);
  const crownGeo = new THREE.ConeGeometry(2.1, 2.2, 8);
  const crownTopGeo = new THREE.ConeGeometry(1.3, 1.6, 8);
  for (const p of palmSpots) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, mats.trunk);
    trunk.position.y = 2.5;
    trunk.rotation.z = rng.range(-0.06, 0.06);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(crownGeo, mats.frond);
    crown.position.y = 5.6;
    crown.castShadow = true;
    const crownTop = new THREE.Mesh(crownTopGeo, mats.frond);
    crownTop.position.y = 6.6;
    crownTop.castShadow = true;
    g.add(trunk, crown, crownTop);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = rng.range(0, Math.PI * 2);
    scene.add(g);
  }

  const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6);
  const umbrellaGeo = new THREE.ConeGeometry(2.2, 1.1, 8);
  for (let i = 0; i < 8; i += 1) {
    const z = -225 + i * 60 + rng.range(-6, 6);
    const x = 300 + rng.range(-4, 6);
    place(poleGeo, mats.pole, x, 1.3, z);
    const umMat = new THREE.MeshStandardMaterial({
      color: UMBRELLA_COLORS[i % UMBRELLA_COLORS.length], roughness: 0.8,
    });
    place(umbrellaGeo, umMat, x, 2.9, z);
  }

  const noLampNear = [...PACKAGE_SPOTS, ...Object.values(SPAWN_POINTS),
    ...BILLBOARDS.map((b) => ({ x: b.x, z: b.z }))];
  const lampPoleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6, 6);
  const lampHeadGeo = new THREE.BoxGeometry(0.7, 0.25, 0.3);
  LINES.forEach((lx, xi) => {
    LINES.forEach((lz, zi) => {
      if ((xi + zi) % 2 !== 0) return;
      const x = lx + 7.5;
      const z = lz - 7.5;
      if (noLampNear.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) return;
      place(lampPoleGeo, mats.pole, x, 3, z);
      place(lampHeadGeo, lampGlowMat, x, 6.1, z, false, false);
    });
  });

  const lightPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lightBoxGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const lightLensMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0x33ff66, emissiveIntensity: 0.9, roughness: 0.4,
  });
  for (const [lx, lz] of [[-36, -36], [36, 36], [-36, 108], [108, -36]]) {
    place(lightPoleGeo, mats.pole, lx - 7.5, 3.5, lz + 7.5);
    place(lightBoxGeo, mats.pole, lx - 7.5, 7.2, lz + 7.5, false, false);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), lightLensMat);
    lens.position.set(lx - 7.5, 7.5, lz + 7.2);
    scene.add(lens);
  }

  const billPoleGeo = new THREE.CylinderGeometry(0.25, 0.3, 8, 8);
  const billGeo = new THREE.PlaneGeometry(11, 5);
  for (const b of BILLBOARDS) {
    place(billPoleGeo, mats.pole, b.x, 4, b.z);
    const signTex = makeSignTexture(b.text, { bg: b.bg, sub: b.sub });
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex, roughness: 0.7, side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(billGeo, signMat);
    sign.position.set(b.x, 10, b.z);
    sign.rotation.y = Math.PI / 4;
    sign.castShadow = true;
    scene.add(sign);
    colliders.push({ minX: b.x - 1, maxX: b.x + 1, minZ: b.z - 1, maxZ: b.z + 1 });
  }

  const rampBaseGeo = new THREE.BoxGeometry(8, 0.5, 4.5);
  const rampSlopeGeo = new THREE.BoxGeometry(7, 0.35, 4.2);
  for (const r of RAMP_SPOTS) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(rampBaseGeo, mats.rampBase);
    base.position.y = 0.25;
    base.receiveShadow = true;
    const slope = new THREE.Mesh(rampSlopeGeo, mats.ramp);
    slope.rotation.z = -0.38;
    slope.position.set(0.1, 1.35, 0);
    slope.castShadow = true;
    g.add(base, slope);
    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.yaw;
    scene.add(g);
  }

  const cloudSphereGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 8; i += 1) {
    const g = new THREE.Group();
    const n = 3;
    for (let j = 0; j < n; j += 1) {
      const s = new THREE.Mesh(cloudSphereGeo, mats.cloud);
      const sc = rng.range(7, 13);
      s.scale.set(sc, sc * 0.42, sc * 0.7);
      s.position.set(j * rng.range(6, 10) - 9, rng.range(-1, 1), rng.range(-3, 3));
      g.add(s);
    }
    g.position.set(rng.range(-280, 320), rng.range(95, 130), rng.range(-280, 280));
    scene.add(g);
    clouds.push({ group: g, speed: rng.range(1.5, 3.5) });
  }

  const flagPoleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7, 6);
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.4);
  const flagColors = [0xe84a5f, 0xffd23e, 0x2c9e8f];
  [192, 216, 240].forEach((x, i) => {
    place(flagPoleGeo, mats.pole, x, 3.5, 224);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      color: flagColors[i], side: THREE.DoubleSide, roughness: 0.9,
    }));
    flag.position.set(x + 1.15, 6.2, 224);
    flag.castShadow = true;
    scene.add(flag);
    flags.push(flag);
  });

  const nodes = [];
  for (const z of LINES) {
    for (const x of LINES) nodes.push({ x, z });
  }
  const edges = [];
  for (let zi = 0; zi < LINES.length; zi += 1) {
    for (let xi = 0; xi < LINES.length; xi += 1) {
      if (xi < LINES.length - 1) edges.push({ a: zi * 8 + xi, b: zi * 8 + xi + 1 });
      if (zi < LINES.length - 1) edges.push({ a: zi * 8 + xi, b: (zi + 1) * 8 + xi });
    }
  }

  let lastPhase = null;
  function applyPhase(phase) {
    const dn = CONFIG.DAY_NIGHT;
    if (phase === 'night') {
      sun.color.setHex(dn.SUN_NIGHT);
      sun.intensity = 0.7;
      hemi.intensity = 0.35;
      scene.background.setHex(dn.SKY_NIGHT);
      scene.fog.color.setHex(dn.SKY_NIGHT);
      lampGlowMat.emissiveIntensity = 2.2;
    } else if (phase === 'dusk') {
      sun.color.setHex(dn.SUN_DUSK);
      sun.intensity = 1.6;
      hemi.intensity = 0.6;
      scene.background.setHex(dn.SKY_DUSK);
      scene.fog.color.setHex(dn.SKY_DUSK);
      lampGlowMat.emissiveIntensity = 1.8;
    } else if (phase === 'dawn') {
      sun.color.setHex(0xffc98a);
      sun.intensity = 1.4;
      hemi.intensity = 0.6;
      scene.background.setHex(0xf2b58a);
      scene.fog.color.setHex(0xf2b58a);
      lampGlowMat.emissiveIntensity = 1.2;
    } else {
      sun.color.setHex(dn.SUN_DAY);
      sun.intensity = 2.6;
      hemi.intensity = 0.85;
      scene.background.setHex(dn.SKY_DAY);
      scene.fog.color.setHex(dn.SKY_DAY);
      lampGlowMat.emissiveIntensity = 0.15;
    }
    for (const m of neonMats) m.emissiveIntensity = phase === 'night' ? 1.6 : (phase === 'dusk' ? 0.9 : 0.25);
    lastPhase = phase;
  }

  function update(dt, time, state) {
    const t = time || 0;
    if (ocean) ocean.position.y = 0.12 + Math.sin(t * 0.7) * 0.06;
    wheel.rotation.z += dt * 0.25;
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 360) c.group.position.x = -320;
    }
    boats.forEach((b, i) => {
      b.position.y = 0.15 + Math.sin(t * 0.9 + i * 1.3) * 0.08;
      b.rotation.z = Math.sin(t * 0.6 + i) * 0.02;
    });
    flags.forEach((f, i) => {
      f.rotation.y = Math.sin(t * 2 + i * 1.7) * 0.45;
    });
    if (state && typeof state.clockMinutes === 'number') {
      const phase = phaseOfDay(state.clockMinutes);
      if (phase !== lastPhase) applyPhase(phase);
    }
  }

  return {
    colliders,
    roadGraph: { nodes, edges },
    sidewalks,
    spawnPoints: SPAWN_POINTS,
    packages: PACKAGE_SPOTS.map((p) => ({ x: p.x, z: p.z })),
    ramps: RAMP_SPOTS.map((r) => ({ x: r.x, z: r.z, yaw: r.yaw })),
    update,
  };
}
