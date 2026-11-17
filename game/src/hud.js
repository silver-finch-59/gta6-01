// Solmar Bay — the HUD: cash, clock, district, wanted stars, health, speed,
// mission objective, toasts, dialogue, crosshair, and the live minimap.
// Reads state every frame and the DOM ids from index.html; never writes game
// state. Every DOM lookup is guarded so a missing element degrades silently.
import { CONFIG, districtAt, respectTierName, phaseOfDay } from './config.js';
import { MISSION_TITLES } from './missions.js';

const FREE_ROAM_OBJECTIVE = 'Solmar Bay is yours, Nova. Free roam — taxi fares and packages still pay.';

// World bounds used for the minimap projection (matches config.js).
const MAP_MIN_X = -288;
const MAP_MAX_X = 336;
const MAP_MIN_Z = -288;
const MAP_MAX_Z = 288;
const MAP_SIZE = 220;

function $(id) {
  return document.getElementById(id);
}

function readPoint(entry) {
  if (!entry) return null;
  if (typeof entry.x === 'number' && typeof entry.z === 'number') return { x: entry.x, z: entry.z };
  if (Array.isArray(entry) && entry.length >= 2) return { x: entry[0], z: entry[1] };
  return null;
}

// Accepts a traffic/police entry in any of the shapes the other modules use:
// {x,z}, {car:{x,z}}, or a bare car record.
function entryPoint(entry) {
  if (!entry) return null;
  if (typeof entry.x === 'number') return { x: entry.x, z: entry.z };
  if (entry.car) return readPoint(entry.car);
  return null;
}

export function createHud(world) {
  const state = world.state;

  const el = {
    hud: $('hud'),
    cash: $('cash'),
    clock: $('clock'),
    district: $('district'),
    stars: $('stars'),
    heatBar: $('heat-bar'),
    respectBar: $('respect-bar'),
    respectTier: $('respect-tier'),
    radio: $('radio'),
    missionDist: $('mission-dist'),
    vignette: $('vignette'),
    healthBar: $('health-bar'),
    staminaBar: $('stamina-bar'),
    speedo: $('speedo'),
    missionTitle: $('mission-title'),
    objective: $('objective'),
    objectiveBox: $('objective-box'),
    message: $('message'),
    dialogue: $('dialogue'),
    crosshair: $('crosshair'),
    minimap: $('minimap'),
  };

  // Build the five wanted stars once; update() only toggles their classes.
  const starSpans = [];
  if (el.stars) {
    el.stars.textContent = '';
    for (let i = 0; i < 5; i += 1) {
      const span = document.createElement('span');
      span.textContent = '★';
      span.className = 'dim';
      el.stars.appendChild(span);
      starSpans.push(span);
    }
  }

  const speakerEl = el.dialogue ? el.dialogue.querySelector('.speaker') : null;
  const lineEl = el.dialogue ? el.dialogue.querySelector('.line') : null;

  let messageTimer = null;
  let dialogueTimer = null;
  let frame = 0;
  let lastHealth = state.health;
  let vignetteTimer = 0;
  let mapCtx = null;
  if (el.minimap) mapCtx = el.minimap.getContext('2d');

  function showMessage(text, ms = 2600) {
    if (!el.message) return;
    el.message.textContent = text;
    el.message.classList.add('show');
    if (messageTimer !== null) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      el.message.classList.remove('show');
      messageTimer = null;
    }, ms);
  }

  function showDialogue(speaker, line, ms = 5000) {
    if (!el.dialogue) return;
    if (speakerEl) speakerEl.textContent = `${speaker}:`;
    if (lineEl) lineEl.textContent = line;
    el.dialogue.classList.remove('hidden');
    if (dialogueTimer !== null) clearTimeout(dialogueTimer);
    dialogueTimer = setTimeout(() => {
      el.dialogue.classList.add('hidden');
      dialogueTimer = null;
    }, ms);
  }

  if (state && state.events) {
    state.events.on('toast', (data) => {
      if (data && data.text) showMessage(data.text);
    });
    state.events.on('hurt', () => { vignetteTimer = 0.7; });
    state.events.on('wanted', (data) => {
      if (data && data.wanted > 0) showMessage(`Wanted level ${data.wanted} — the cops are coming!`);
      else if (data) showMessage('You lost the cops. Stay clean.');
    });
  }

  function toMapX(x) {
    return ((x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X)) * MAP_SIZE;
  }
  function toMapY(z) {
    // North is -z, so -z goes up: small z maps to the top of the canvas.
    return ((z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z)) * MAP_SIZE;
  }

  function drawRoads(ctx) {
    ctx.strokeStyle = 'rgba(205,210,225,0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    let drew = false;
    const graph = world.city ? world.city.roadGraph : null;
    if (graph && Array.isArray(graph.edges) && graph.edges.length > 0) {
      const nodes = graph.nodes;
      for (const edge of graph.edges) {
        let a = null;
        let b = null;
        if (Array.isArray(edge) && edge.length >= 2) {
          a = readPoint(edge[0]);
          b = readPoint(edge[1]);
        } else if (edge && typeof edge === 'object') {
          a = readPoint(edge.a || edge.from || edge[0]);
          b = readPoint(edge.b || edge.to || edge[1]);
          if (!a && nodes && typeof edge.a === 'number') a = readPoint(nodes[edge.a]);
          if (!b && nodes && typeof edge.b === 'number') b = readPoint(nodes[edge.b]);
        }
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(toMapX(a.x), toMapY(a.z));
          ctx.lineTo(toMapX(b.x), toMapY(b.z));
          ctx.stroke();
          drew = true;
        }
      }
    }
    if (!drew) {
      // Fallback: the road grid from config.js (roads run along ROAD_LINES).
      ctx.beginPath();
      for (const line of CONFIG.ROAD_LINES) {
        ctx.moveTo(toMapX(line), toMapY(MAP_MIN_Z));
        ctx.lineTo(toMapX(line), toMapY(MAP_MAX_Z));
        ctx.moveTo(toMapX(MAP_MIN_X), toMapY(line));
        ctx.lineTo(toMapX(MAP_MAX_X), toMapY(line));
      }
      ctx.stroke();
    }
  }

  function drawMinimap() {
    if (!mapCtx || !el.minimap) return;
    const ctx = mapCtx;
    const t = state.time;

    // Dark background.
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Ocean strip on the east edge.
    ctx.fillStyle = 'rgba(28,90,160,0.9)';
    ctx.fillRect(toMapX(270), 0, MAP_SIZE - toMapX(270), MAP_SIZE);

    // Building blocks (darker rects) from the city colliders.
    const colliders = world.city ? world.city.colliders : null;
    if (Array.isArray(colliders)) {
      ctx.fillStyle = 'rgba(52,62,92,0.9)';
      for (const b of colliders) {
        if (!b || typeof b.minX !== 'number') continue;
        ctx.fillRect(
          toMapX(b.minX),
          toMapY(b.minZ),
          Math.max(1, toMapX(b.maxX) - toMapX(b.minX)),
          Math.max(1, toMapY(b.maxZ) - toMapY(b.minZ)),
        );
      }
    }

    drawRoads(ctx);

    // North tick at the top edge.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', MAP_SIZE / 2, 12);

    // Packages: pink dots.
    const packages = world.city ? world.city.packages : null;
    if (Array.isArray(packages)) {
      ctx.fillStyle = '#ff7ad9';
      for (const pkg of packages) {
        if (pkg && pkg.collected) continue;
        const at = readPoint(pkg);
        if (!at) continue;
        ctx.beginPath();
        ctx.arc(toMapX(at.x), toMapY(at.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Taxi customer: green dot.
    if (world.missions && typeof world.missions.getTaxiBlip === 'function') {
      const blip = world.missions.getTaxiBlip();
      if (blip) {
        ctx.fillStyle = '#37d67a';
        ctx.beginPath();
        ctx.arc(toMapX(blip.x), toMapY(blip.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Traffic: small white dots.
    const trafficCars = world.traffic ? world.traffic.cars : null;
    if (Array.isArray(trafficCars)) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const entry of trafficCars) {
        const at = entryPoint(entry);
        if (!at) continue;
        ctx.fillRect(toMapX(at.x) - 1, toMapY(at.z) - 1, 2, 2);
      }
    }

    // Police: red dots. police.js returns { policeCars: [{car, …}] }.
    const policeCars = world.police
      ? world.police.policeCars || world.police.cars
      : null;
    if (Array.isArray(policeCars)) {
      ctx.fillStyle = '#ff4444';
      for (const entry of policeCars) {
        const at = entryPoint(entry);
        if (!at) continue;
        ctx.beginPath();
        ctx.arc(toMapX(at.x), toMapY(at.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Enemies: orange dots, so a fight reads on the map before it is seen.
    if (world.combat && Array.isArray(world.combat.enemies)) {
      ctx.fillStyle = '#ff8c2e';
      for (const e of world.combat.enemies) {
        if (e.dead) continue;
        ctx.beginPath();
        ctx.arc(toMapX(e.x), toMapY(e.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mission marker: pulsing yellow diamond with a faint ring.
    const marker = state.mission.marker;
    if (marker) {
      const pulse = 5 + Math.sin(t * 4) * 2;
      const mx = toMapX(marker.x);
      const my = toMapY(marker.z);
      ctx.strokeStyle = 'rgba(255,210,62,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, pulse + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }

    // Player: white triangle rotated by yaw.
    const px = toMapX(state.player.x);
    const py = toMapY(state.player.z);
    const yaw = state.player.yaw || 0;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const angle = Math.atan2(fx, -fz);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function update(dt) {
    const playing = state.screen === 'playing';
    if (el.hud) el.hud.classList.toggle('hidden', !playing);
    if (!playing) return;
    if (dt > 0 && vignetteTimer > 0) vignetteTimer -= dt;

    if (el.cash) el.cash.textContent = `$${state.money}`;
    if (el.clock) {
      const mins = Math.floor(state.clockMinutes) % 1440;
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      const phase = phaseOfDay(state.clockMinutes);
      const icon = phase === 'night' ? '☾' : phase === 'dusk' ? '◐' : phase === 'dawn' ? '◑' : '☀';
      el.clock.textContent = `${icon} ${hh}:${mm}`;
    }
    if (el.district) el.district.textContent = districtAt(state.player.x, state.player.z);

    for (let i = 0; i < starSpans.length; i += 1) {
      starSpans[i].className = i < state.wanted ? 'lit' : 'dim';
    }
    // Heat bar: fills toward the next star.
    if (el.heatBar) {
      const pct = state.wanted >= 5 ? 100 : Math.round((state.heat / CONFIG.POLICE.HEAT_PER_STAR) * 100);
      el.heatBar.style.width = `${pct}%`;
      el.heatBar.style.display = state.wanted > 0 || state.heat > 0 ? '' : 'none';
    }
    // Respect meter: progress to the next tier.
    if (el.respectBar || el.respectTier) {
      const respect = state.respect || 0;
      const tiers = CONFIG.RESPECT_TIERS;
      let current = tiers[0];
      let next = null;
      for (let i = 0; i < tiers.length; i += 1) {
        if (respect >= tiers[i].at) current = tiers[i];
        else if (!next) next = tiers[i];
      }
      if (el.respectTier) el.respectTier.textContent = respectTierName(respect);
      if (el.respectBar) {
        const span = next ? next.at - current.at : 100;
        const done = next ? respect - current.at : span;
        el.respectBar.style.width = `${Math.min(100, Math.round((done / span) * 100))}%`;
      }
    }
    // Radio station label.
    if (el.radio) {
      const stations = CONFIG.RADIO_STATIONS || [];
      const station = stations[state.radioStation || 0] || stations[0];
      el.radio.textContent = station ? `♪ ${station.name}` : '';
    }
    // Distance to the mission marker.
    if (el.missionDist) {
      const marker = state.mission.marker;
      if (marker && !state.mission.done) {
        const d = Math.round(Math.hypot(state.player.x - marker.x, state.player.z - marker.z));
        el.missionDist.textContent = `${d}m`;
        el.missionDist.style.display = '';
      } else {
        el.missionDist.style.display = 'none';
      }
    }

    if (el.healthBar) {
      const hp = Math.max(0, Math.min(100, state.health));
      el.healthBar.style.width = `${hp}%`;
      el.healthBar.style.background =
        hp > 50 ? 'linear-gradient(90deg, #37d67a, #7dff9a)'
        : hp > 25 ? 'linear-gradient(90deg, #e8963c, #ffc95e)'
        : 'linear-gradient(90deg, #d63c37, #ff7a6e)';
    }
    if (el.staminaBar) {
      const stamina = state.player.stamina !== undefined ? state.player.stamina : 100;
      el.staminaBar.style.width = `${Math.max(0, Math.min(100, stamina))}%`;
      el.staminaBar.style.display = state.player.onFoot ? '' : 'none';
    }

    const driving = !!state.player.car && !state.player.onFoot;
    if (el.speedo) {
      el.speedo.style.display = driving ? '' : 'none';
      if (driving) {
        const mph = Math.round(Math.abs(state.player.speed || 0) * 2.237);
        el.speedo.innerHTML = `${mph} <small>mph</small>`;
      }
    }

    if (el.missionTitle) {
      el.missionTitle.textContent = state.mission.done
        ? 'FREE ROAM'
        : (MISSION_TITLES[state.mission.index] || 'FREE ROAM').toUpperCase();
    }
    if (el.objective) {
      el.objective.textContent = state.mission.done
        ? FREE_ROAM_OBJECTIVE
        : state.mission.objective || '';
    }

    if (el.crosshair) {
      el.crosshair.style.display = state.player.onFoot && state.player.armed ? 'block' : 'none';
    }

    // Damage vignette: a red flash that fades after a hit.
    if (el.vignette) {
      const hurtNow = state.health < lastHealth;
      if (hurtNow) vignetteTimer = Math.max(vignetteTimer, 0.6);
      lastHealth = state.health;
      el.vignette.style.opacity = vignetteTimer > 0 ? String(Math.min(0.85, vignetteTimer)) : '0';
    }

    frame += 1;
    if (frame % 2 === 0) drawMinimap();
  }

  return { update, showMessage, showDialogue };
}
