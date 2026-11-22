// textures.js — procedural canvas textures: facades, roads, neon, and sand.
import * as THREE from 'three';

function blankCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finishTexture(c, anisotropy = 4) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function grain(ctx, w, h, count, rng, strength) {
  for (let i = 0; i < count; i += 1) {
    const pick = rng ? rng.next() : Math.random();
    const gx = Math.floor((rng ? rng.next() : Math.random()) * w);
    const gy = Math.floor((rng ? rng.next() : Math.random()) * h);
    ctx.fillStyle = pick < 0.5 ? `rgba(0,0,0,${strength})` : `rgba(255,255,255,${strength})`;
    ctx.fillRect(gx, gy, 2, 2);
  }
}

function paintWindow(ctx, x, y, w, h, glass, lit, roll) {
  ctx.fillStyle = roll < 0.16 ? lit : (roll < 0.24 ? '#161c22' : glass);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + h - 2, w, 2);
}

const FACADES = {
  stucco: { base: '#e6d3ac', trim: '#c9b088', glass: '#33414f', lit: '#ffd98a' },
  glass: { base: '#6ea8cf', trim: '#4f86ad', glass: '#d6ecff', lit: '#ffe9a8' },
  brick: { base: '#9d5a41', trim: '#7e4632', glass: '#2c3844', lit: '#ffd98a' },
  pastel: { base: null, trim: '#ffffff', glass: '#33414f', lit: '#ffd98a' },
  concrete: { base: '#9aa0a2', trim: '#7d8386', glass: '#2f3a44', lit: '#ffd98a' },
};

const PASTEL_PAINTS = ['#f0b7c2', '#a9d6c5', '#f6d47c', '#b3c6ef', '#e8c39e', '#c9e2a8'];

export function makeBuildingTexture(rng, paletteName) {
  const pal = FACADES[paletteName] || FACADES.concrete;
  const base = pal.base || rng.pick(PASTEL_PAINTS);
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 500, rng, 0.06);

  if (paletteName === 'brick') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 8; y < 256; y += 16) ctx.fillRect(0, y, 256, 2);
    for (let y = 0; y < 256; y += 16) {
      const offset = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = offset; x < 256; x += 32) ctx.fillRect(x, y, 2, 16);
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 1);
  }

  const tall = paletteName === 'glass';
  const cols = tall ? 8 : 6;
  const rows = tall ? 12 : 9;
  const padX = 12;
  const padY = 14;
  const cellW = (256 - padX * 2) / cols;
  const cellH = (256 - padY * 2 - 30) / rows;

  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = padX + col * cellW + 5;
      const y = padY + r * cellH + 4;
      paintWindow(ctx, x, y, cellW - 10, cellH - 8, pal.glass, pal.lit, rng.next());
      if (rng.next() < 0.12) {
        ctx.fillStyle = 'rgba(20,24,30,0.8)';
        ctx.fillRect(x - 2, y + cellH - 4, cellW - 6, 3);
      }
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 226, 256, 30);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(0, 222, 256, 4);
  ctx.fillStyle = '#20262e';
  ctx.fillRect(112, 226, 32, 30);
  ctx.fillStyle = 'rgba(255,217,138,0.85)';
  ctx.fillRect(116, 230, 24, 10);

  return finishTexture(c);
}

export function makeGlassTowerTexture(rng) {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#5d94bd');
  grad.addColorStop(0.5, '#8fc3e2');
  grad.addColorStop(1, '#5d94bd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 300, rng, 0.05);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(10,20,30,0.55)';
    ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + 3, 0, 2, 256);
  }
  for (let y = 0; y < 256; y += 24) {
    ctx.fillStyle = 'rgba(10,20,30,0.35)';
    ctx.fillRect(0, y, 256, 2);
    if (rng.next() < 0.3) {
      ctx.fillStyle = 'rgba(255,233,168,0.8)';
      ctx.fillRect(20 + Math.floor(rng.next() * 200), y + 4, 12, 14);
    }
  }
  return finishTexture(c);
}

export function makeBrickTexture(rng) {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9d5a41';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 700, rng, 0.08);
  ctx.fillStyle = 'rgba(60,30,20,0.5)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 256, 2);
    const offset = (y / 16) % 2 === 0 ? 0 : 18;
    for (let x = offset; x < 256; x += 36) ctx.fillRect(x, y, 2, 16);
  }
  return finishTexture(c);
}

export function makeRoadTexture() {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#33363b';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 900, null, 0.08);

  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(58, 0, 34, 256);
  ctx.fillRect(164, 0, 34, 256);

  ctx.fillStyle = 'rgba(216,216,216,0.55)';
  ctx.fillRect(7, 0, 3, 256);
  ctx.fillRect(246, 0, 3, 256);

  ctx.fillStyle = '#e8c33c';
  ctx.fillRect(124, 12, 8, 64);
  ctx.fillRect(124, 140, 8, 64);

  return finishTexture(c);
}

export function makeSidewalkTexture() {
  const c = blankCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b5b1a4';
  ctx.fillRect(0, 0, 128, 128);
  grain(ctx, 128, 128, 260, null, 0.07);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  return finishTexture(c);
}

export function makeSandTexture() {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9d6a4';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i += 1) {
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? 'rgba(203,178,127,0.5)' : 'rgba(255,244,214,0.5)';
    ctx.fillRect(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), 2, 2);
  }
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTexture(c);
}

export function makeGrassTexture(rng) {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5d9e4a';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 1200, rng, 0.1);
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = 'rgba(140,200,100,0.5)';
    const gx = Math.floor(rng.next() * 256);
    const gy = Math.floor(rng.next() * 256);
    ctx.fillRect(gx, gy, 3, 6);
  }
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(rng.next() * 256, rng.next() * 256, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTexture(c);
}

export function makePierWoodTexture(rng) {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 500, rng, 0.09);
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(40,25,10,0.6)';
    ctx.fillRect(0, y, 256, 3);
    ctx.fillStyle = 'rgba(255,220,170,0.12)';
    ctx.fillRect(0, y + 3, 256, 2);
    ctx.fillStyle = '#2c2016';
    ctx.fillRect(8, y + 12, 4, 4);
    ctx.fillRect(244, y + 12, 4, 4);
  }
  return finishTexture(c);
}

export function makeTurfTexture() {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#4f9e3e' : '#5cb34a';
    ctx.fillRect(0, i * 32, 256, 32);
  }
  grain(ctx, 256, 256, 600, null, 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 124, 256, 4);
  ctx.beginPath();
  ctx.arc(128, 126, 26, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  return finishTexture(c);
}

export function makeCrosswalkTexture() {
  const c = blankCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#33363b';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 200, null, 0.06);
  ctx.fillStyle = 'rgba(240,240,235,0.92)';
  for (let i = 0; i < 6; i += 1) {
    ctx.fillRect(10 + i * 42, 14, 26, 228);
  }
  return finishTexture(c);
}

export function makeSignTexture(text, opts) {
  const o = opts || {};
  const c = blankCanvas(512, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = o.bg || '#1d2f4a';
  ctx.fillRect(0, 0, 512, 256);
  grain(ctx, 512, 256, 240, null, 0.05);
  ctx.strokeStyle = o.border || '#ffd23e';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = o.fg || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 74;
  ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text).width > 452 && size > 24) {
    size -= 4;
    ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  }
  const y = o.sub ? 100 : 128;
  ctx.fillText(text, 256, y);
  if (o.sub) {
    ctx.font = '700 34px Arial, Helvetica, sans-serif';
    ctx.fillStyle = o.border || '#ffd23e';
    ctx.fillText(o.sub, 256, 178);
  }
  return finishTexture(c);
}

export function makeNeonTexture(text, opts) {
  const o = opts || {};
  const glow = o.glow || '#ff4d7e';
  const c = blankCanvas(512, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = o.bg || '#0d0d18';
  ctx.fillRect(0, 0, 512, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 88;
  ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text).width > 460 && size > 28) {
    size -= 4;
    ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.shadowColor = glow;
  ctx.shadowBlur = 34;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 7;
  ctx.strokeText(text, 256, 128);
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 128);
  return finishTexture(c);
}

export function makeRoofTexture(rng) {
  const c = blankCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4640';
  ctx.fillRect(0, 0, 128, 128);
  grain(ctx, 128, 128, 900, rng, 0.16);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 62, 128, 4);
  ctx.fillRect(62, 0, 4, 128);
  return finishTexture(c);
}
