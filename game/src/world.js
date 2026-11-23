// Vice Harbor — the game's rules and state, with no drawing and no browser in it.
// The city, traffic, pedestrians, police, jobs, races, economy, turf, crew and stats all live
// here, driven by a seeded random so the same seed always plays the same. step() advances one
// fixed step and returns what happened as bit flags.
import { CITY, DISTRICTS, JOBS, RACES, TURF_ZONES, CREW, GUN_SHOP, RESPRAY, COLLECTIBLE_COUNT, WANTED_MAX, RANKS } from './config.js';
import { range } from './random.js';

export const EVENT_JOB_DONE = 1;
export const EVENT_RACE_DONE = 2;
export const EVENT_WASTED = 4;
export const EVENT_BUSTED = 8;
export const EVENT_COLLECT = 16;
export const EVENT_FARE = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_TURF = 128;
export const EVENT_CHOICE = 256;

const PITCH = CITY.block + CITY.road; // 58
const ROAD_HALF = CITY.road / 2;
const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#16a085', '#e67e22', '#8e44ad', '#2c3e50'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

function roadCenters(count, start) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(start + i * PITCH);
  return out;
}

function clampToCity(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function createWorld(random) {
  const roadX = roadCenters(CITY.blocksX, -203);
  const roadZ = roadCenters(CITY.blocksZ, -174);

  // ---- static city -------------------------------------------------------
  const buildings = [];
  const palms = [];
  const streetlights = [];
  const neonSigns = [];
  for (let ix = 0; ix < CITY.blocksX - 1; ix += 1) {
    for (let iz = 0; iz < CITY.blocksZ - 1; iz += 1) {
      const x0 = roadX[ix] + ROAD_HALF + 3;
      const x1 = roadX[ix + 1] - ROAD_HALF - 3;
      const z0 = roadZ[iz] + ROAD_HALF + 3;
      const z1 = roadZ[iz + 1] - ROAD_HALF - 3;
      const district = DISTRICTS[(ix * 3 + iz * 2) % DISTRICTS.length];
      const count = 2 + Math.floor(random() * 2);
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 12, Math.max(13, (x1 - x0) / count - 4));
        const d = range(random, 12, Math.max(13, (z1 - z0) / 2 - 4));
        const bx = x0 + (b % 2) * ((x1 - x0) / 2) + (x1 - x0) / 4 - w / 2 + range(random, -2, 2);
        const bz = z0 + Math.floor(b / 2) * ((z1 - z0) / 2) + (z1 - z0) / 4 - d / 2 + range(random, -2, 2);
        const h = range(random, 10, district.name === 'Neon Row' || district.name === 'Coral Heights' ? 42 : 26);
        buildings.push({
          x: bx, z: bz, w, d, h,
          district: district.name,
          color: district.palette[Math.floor(random() * district.palette.length)],
          windows: Math.floor(h / 4),
        });
        if (district.name === 'Neon Row' && random() < 0.6) {
          neonSigns.push({ x: bx, z: bz - d / 2 - 0.4, w: Math.min(10, w * 0.7), color: ['#ff2d95', '#00e5ff', '#ffe600'][Math.floor(random() * 3)] });
        }
      }
      if (random() < 0.5) palms.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    }
  }
  for (const rx of roadX) for (let z = -190; z <= 190; z += 38) streetlights.push({ x: rx + ROAD_HALF - 1, z });
  for (const rz of roadZ) for (let x = -220; x <= 220; x += 38) streetlights.push({ x, z: rz + ROAD_HALF - 1 });

  const collectibles = [];
  for (let i = 0; i < COLLECTIBLE_COUNT; i += 1) {
    const onWater = i >= 20;
    collectibles.push({
      x: onWater ? range(random, -180, 180) : roadX[Math.floor(random() * roadX.length)] + range(random, -5, 5),
      z: onWater ? range(random, 215, 280) : roadZ[Math.floor(random() * roadZ.length)] + range(random, -5, 5),
      taken: false, bob: random() * Math.PI * 2,
    });
  }

  // ---- dynamic state -----------------------------------------------------
  const state = {
    time: 17.2, // golden hour by default
    elapsed: 0,
    player: { x: -170, z: 170, heading: Math.PI / 2, speed: 0, onFoot: true, inBoat: false, car: null, health: 100 },
    cars: [], peds: [], police: [], heli: null,
    wanted: 0, wantedTimer: 0, bustedTimer: 0,
    cash: 150, respect: 0,
    jobs: JOBS.map((j) => ({ id: j.id, status: 'locked' })),
    activeJob: null, jobProgress: null,
    race: null,
    stats: { jobsDone: 0, fares: 0, carsStolen: 0, collectibles: 0, distance: 0, racesWon: 0, turfOwned: 0, crew: 0 },
    crew: [], inventory: [], turf: TURF_ZONES.map((t) => ({ id: t.id, owned: false, timer: 0 })),
    turfIncomeTimer: 0,
    taxi: null,
    message: '', messageTimer: 0,
    camera: null, // {pos:{x,y,z}, target:{x,y,z}} override for staged shots
    objective: 'Explore Vice Harbor — find Mara Voss in Neon Row to start work.',
  };
  state.jobs[0].status = 'available';

  function spawnCar(kind, x, z, heading) {
    const car = {
      kind, x, z, heading, speed: 0,
      color: kind === 'police' ? '#1a1a2e' : CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      maxSpeed: kind === 'police' ? 34 : range(random, 12, 18),
      axis: random() < 0.5 ? 'x' : 'z', dir: random() < 0.5 ? 1 : -1,
      lane: random() < 0.5 ? -3.5 : 3.5, health: 100, stolen: false,
    };
    state.cars.push(car);
    return car;
  }

  function spawnPed() {
    return {
      x: roadX[Math.floor(random() * roadX.length)] + range(random, -6, 6),
      z: roadZ[Math.floor(random() * roadZ.length)] + range(random, -6, 6),
      tx: 0, tz: 0, speed: range(random, 1.2, 2.2),
      color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      down: 0,
    };
  }

  function reset() {
    state.time = 17.2;
    state.elapsed = 0;
    state.player.x = -170; state.player.z = 170; state.player.heading = Math.PI / 2;
    state.player.speed = 0; state.player.onFoot = true; state.player.inBoat = false; state.player.car = null;
    state.player.health = 100;
    state.cars.length = 0;
    state.peds.length = 0;
    state.police.length = 0;
    state.heli = null;
    state.wanted = 0; state.wantedTimer = 0; state.bustedTimer = 0;
    state.cash = 150; state.respect = 0;
    state.jobs = JOBS.map((j) => ({ id: j.id, status: 'locked' }));
    state.jobs[0].status = 'available';
    state.activeJob = null; state.jobProgress = null; state.race = null;
    state.stats = { jobsDone: 0, fares: 0, carsStolen: 0, collectibles: 0, distance: 0, racesWon: 0, turfOwned: 0, crew: 0 };
    state.crew = []; state.inventory = [];
    state.turf = TURF_ZONES.map((t) => ({ id: t.id, owned: false, timer: 0 }));
    state.turfIncomeTimer = 0; state.taxi = null;
    state.message = ''; state.messageTimer = 0; state.camera = null;
    state.objective = 'Explore Vice Harbor — find Mara Voss in Neon Row to start work.';
    for (const c of collectibles) c.taken = false;
    // A few parked cars near the spawn, plus one boat at the marina.
    spawnCar('traffic', -160, 174, 0);
    spawnCar('traffic', -145, -174, Math.PI);
    spawnCar('traffic', 29, 58, Math.PI / 2);
    const boat = spawnCar('boat', -40, 235, 0);
    boat.color = '#e8e8e8';
    for (let i = 0; i < 10; i += 1) {
      const c = spawnCar('traffic', roadX[Math.floor(random() * roadX.length)], roadZ[Math.floor(random() * roadZ.length)], 0);
      c.speed = c.maxSpeed * 0.7;
    }
    for (let i = 0; i < 18; i += 1) state.peds.push(spawnPed());
  }

  function nearestRoad(x) {
    let best = roadX[0], bd = Infinity;
    for (const r of roadX) { const d = Math.abs(r - x); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  function nearestRoadZ(z) {
    let best = roadZ[0], bd = Infinity;
    for (const r of roadZ) { const d = Math.abs(r - z); if (d < bd) { bd = d; best = r; } }
    return best;
  }

  function collideBuildings(x, z, radius) {
    let nx = x, nz = z;
    for (const b of buildings) {
      const cx = clampToCity(x, b.x - b.w / 2 - radius, b.x + b.w / 2 + radius);
      const cz = clampToCity(z, b.z - b.d / 2 - radius, b.z + b.d / 2 + radius);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (Math.abs(dx) > Math.abs(dz)) nx = cx + (dx >= 0 ? radius : -radius);
        else nz = cz + (dz >= 0 ? radius : -radius);
      }
    }
    return { x: nx, z: nz };
  }

  function raiseWanted(n) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED_MAX, state.wanted + n);
    state.wantedTimer = 0;
    return state.wanted > before ? EVENT_WANTED_UP : 0;
  }

  function rankName() {
    const i = Math.min(RANKS.length - 1, Math.floor(state.respect / 20));
    return RANKS[i];
  }

  function completePercent() {
    const p = state.stats;
    return Math.min(100, Math.round((p.jobsDone / 7) * 60 + (p.racesWon / 3) * 15 + (p.collectibles / COLLECTIBLE_COUNT) * 15 + (p.turfOwned / 5) * 10));
  }

  // ---- jobs ---------------------------------------------------------------
  function startJob(jobId) {
    const def = JOBS.find((j) => j.id === jobId);
    const slot = state.jobs.find((j) => j.id === jobId);
    if (!def || !slot || slot.status !== 'available') return false;
    slot.status = 'active';
    state.activeJob = jobId;
    if (def.objective === 'collect') {
      state.jobProgress = { parcels: [
        { x: 160, z: 170, got: false }, { x: 190, z: 120, got: false }, { x: 150, z: 190, got: false },
      ], target: { x: 150, z: 150 } };
      state.objective = 'Collect 3 parcels at the docks, then deliver to Eddie’s warehouse.';
    } else if (def.objective === 'deliver') {
      state.jobProgress = { target: def.target };
      state.objective = 'Deliver the crate to Neon Row. Avoid the police.';
    } else if (def.objective === 'race') {
      startRace(def.race);
      state.objective = 'Win the Neon Loop against Vex Marlowe.';
      return true;
    } else if (def.objective === 'taxi') {
      state.jobProgress = { faresLeft: def.fares, phase: 'pickup', marker: { x: -60, z: 58 } };
      state.taxi = { fare: 0 };
      state.objective = 'Pick up the fare in Palm Court.';
    } else if (def.objective === 'boat') {
      state.jobProgress = { target: def.target };
      state.objective = 'Take a boat from Marina Bay to Lighthouse Point.';
    } else if (def.objective === 'choice') {
      state.jobProgress = { choice: null };
      state.objective = 'Choose how to run this job — talk to Priya / Big Lou (press 1 or 2).';
    }
    return true;
  }

  function finishJob(bonusCash) {
    const def = JOBS.find((j) => j.id === state.activeJob);
    const slot = state.jobs.find((j) => j.id === state.activeJob);
    if (!def || !slot) return 0;
    slot.status = 'done';
    const pay = def.payout + (bonusCash || 0);
    state.cash += pay;
    state.respect += def.respect;
    state.stats.jobsDone += 1;
    state.message = `JOB COMPLETE — ${def.title}: +$${pay}`;
    state.messageTimer = 5;
    const next = state.jobs[state.jobs.indexOf(slot) + 1];
    if (next && next.status === 'locked') next.status = 'available';
    state.activeJob = null;
    state.jobProgress = null;
    state.objective = next ? `Next job available: ${JOBS.find((j) => j.id === next.id).title}.` : 'All jobs done — you run Vice Harbor now.';
    return EVENT_JOB_DONE;
  }

  function resolveChoice(which) {
    const def = JOBS.find((j) => j.id === state.activeJob);
    if (!def || !def.choice || !state.jobProgress) return 0;
    const pick = which === 'b' ? def.choice.b : def.choice.a;
    state.message = pick.text;
    state.messageTimer = 6;
    let events = EVENT_CHOICE;
    if (def.id === 'smoke-and-mirrors' && which === 'b') {
      events |= raiseWanted(2);
      events |= finishJob(300);
    } else if (def.id === 'meridian-job' && which === 'b') {
      state.respect += 10;
      events |= finishJob(-500);
    } else {
      events |= finishJob(0);
    }
    return events;
  }

  // ---- races ---------------------------------------------------------------
  function startRace(raceId) {
    const def = RACES.find((r) => r.id === raceId);
    if (!def) return false;
    const start = def.checkpoints[0];
    state.race = {
      id: def.id, name: def.name, prize: def.prize,
      checkpoints: def.checkpoints, index: 0, finished: false, position: 1,
      rivals: def.rivals.map((name, i) => ({
        name, progress: -0.02 * (i + 1), speed: range(random, 0.055, 0.075), color: CAR_COLORS[i + 1],
        x: start.x + 6 + i * 5, z: start.z + 8 + i * 4, heading: 0,
      })),
      time: 0,
    };
    // Stage the player car at the start line.
    const p = state.player;
    p.x = start.x; p.z = start.z + 14; p.heading = 0; p.speed = 0;
    if (!p.car) {
      const car = spawnCar('player', p.x, p.z, 0);
      car.color = '#00b4d8';
      p.car = car; p.onFoot = false;
    } else {
      p.car.x = p.x; p.car.z = p.z; p.car.heading = 0; p.car.speed = 0;
    }
    return true;
  }

  function raceProgress() {
    if (!state.race) return 0;
    const r = state.race;
    const cp = r.checkpoints[Math.min(r.index, r.checkpoints.length - 1)];
    const p = state.player;
    const d = Math.sqrt(dist2(p.x, p.z, cp.x, cp.z));
    return r.index + Math.max(0, 1 - d / 220);
  }

  function updateRace(dt) {
    const r = state.race;
    if (!r || r.finished) return 0;
    r.time += dt;
    const cp = r.checkpoints[r.index];
    const p = state.player;
    if (dist2(p.x, p.z, cp.x, cp.z) < 100) {
      r.index += 1;
      if (r.index >= r.checkpoints.length) {
        r.finished = true;
        const prog = raceProgress();
        const standings = [...r.rivals.map((v) => ({ name: v.name, progress: v.progress })), { name: 'YOU', progress: prog }]
          .sort((a, b) => b.progress - a.progress);
        r.position = standings.findIndex((s) => s.name === 'YOU') + 1;
        const mult = r.position === 1 ? 1 : r.position === 2 ? 0.5 : r.position === 3 ? 0.25 : 0;
        let prize = Math.round(r.prize * mult);
        if (state.crew.some((c) => c.id === 'dash')) prize = Math.round(prize * 1.15);
        state.cash += prize;
        if (r.position === 1) state.stats.racesWon += 1;
        state.message = `RACE OVER — ${r.name}: ${r.position === 1 ? '1st' : r.position === 2 ? '2nd' : r.position === 3 ? '3rd' : '4th'} place, +$${prize}`;
        state.messageTimer = 6;
        if (state.activeJob) {
          const def = JOBS.find((j) => j.id === state.activeJob);
          if (def && def.objective === 'race') return finishJob(0) | EVENT_RACE_DONE;
        }
        return EVENT_RACE_DONE;
      }
      state.objective = `Race: checkpoint ${r.index + 1} of ${r.checkpoints.length} — ${r.name}.`;
    }
    // Rivals run the checkpoint path.
    for (const v of r.rivals) {
      const target = r.checkpoints[Math.max(0, Math.min(Math.floor(v.progress), r.checkpoints.length - 1))];
      const dx = target.x - v.x, dz = target.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 12) { v.progress += 1; continue; }
      const stepLen = v.speed * 60 * dt * 6;
      v.x += (dx / d) * stepLen;
      v.z += (dz / d) * stepLen;
      v.heading = Math.atan2(dx, dz);
      v.progress += (stepLen / 220) * 0.2;
    }
    return 0;
  }

  function standings() {
    if (!state.race) return [];
    const prog = raceProgress();
    const list = [...state.race.rivals.map((v) => ({ name: v.name, progress: v.progress })), { name: 'YOU', progress: prog }];
    return list.sort((a, b) => b.progress - a.progress);
  }

  // ---- economy / turf / crew ----------------------------------------------
  function buyItem(itemId) {
    const item = GUN_SHOP.items.find((i) => i.id === itemId);
    if (!item || state.cash < item.price || state.inventory.includes(itemId)) return false;
    state.cash -= item.price;
    state.inventory.push(itemId);
    state.message = `Bought ${item.name} at Iron & Oak.`;
    state.messageTimer = 4;
    return true;
  }

  function respray() {
    if (state.cash < RESPRAY.price || !state.player.car) return false;
    state.cash -= RESPRAY.price;
    state.player.car.color = CAR_COLORS[Math.floor(random() * CAR_COLORS.length)];
    state.message = 'Resprayed at Chrome Works.';
    state.messageTimer = 4;
    return true;
  }

  function recruitCrew(memberId) {
    const member = CREW.find((c) => c.id === memberId);
    if (!member || state.crew.some((c) => c.id === memberId) || state.cash < 200) return false;
    state.cash -= 200;
    state.crew.push(member);
    state.stats.crew = state.crew.length;
    state.message = `${member.name} joined your crew — ${member.role}.`;
    state.messageTimer = 4;
    return true;
  }

  function enterExitCar() {
    const p = state.player;
    if (p.car) {
      p.x = p.car.x + 4; p.z = p.car.z + 3; p.onFoot = true; p.inBoat = false; p.car = null;
      return true;
    }
    let best = null, bd = 25;
    for (const car of state.cars) {
      if (car.kind === 'police') continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    if (!best) return false;
    p.car = best; p.onFoot = false; p.inBoat = best.kind === 'boat';
    p.x = best.x; p.z = best.z; p.heading = best.heading;
    if (!best.stolen && (best.kind === 'traffic' || best.kind === 'taxi')) {
      best.stolen = true;
      best.kind = 'player';
      state.stats.carsStolen += 1;
      raiseWanted(1);
      state.message = 'Car stolen — the cops noticed.';
      state.messageTimer = 4;
    }
    return true;
  }

  // ---- main step ------------------------------------------------------------
  function step(dt, input) {
    let events = 0;
    state.elapsed += dt;
    state.time = (state.time + dt * 0.02) % 24;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    const p = state.player;

    // Player movement.
    if (p.onFoot) {
      const speed = input.sprint ? 10 : 6;
      let mx = 0, mz = 0;
      if (input.forward) mz -= 1;
      if (input.back) mz += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx || mz) {
        const len = Math.hypot(mx, mz);
        // Camera-relative: forward is -z on screen when heading is 0.
        const sin = Math.sin(p.heading), cos = Math.cos(p.heading);
        const wx = (mx * cos - mz * sin) / len;
        const wz = (mx * sin + mz * cos) / len;
        p.x += wx * speed * dt;
        p.z += wz * speed * dt;
        p.heading = Math.atan2(wx, wz);
        state.stats.distance += speed * dt;
      }
      if (p.z > CITY.waterZ + 4 && p.z < 300) { p.z = Math.min(p.z, CITY.waterZ + 30); }
      p.x = clampToCity(p.x, -230, 230);
      p.z = clampToCity(p.z, -200, 300);
      const fixed = collideBuildings(p.x, p.z, 1.2);
      p.x = fixed.x; p.z = fixed.z;
    } else if (p.car) {
      const car = p.car;
      const topSpeed = car.kind === 'boat' ? 30 : 38 * (state.crew.some((c) => c.id === 'wrench') ? 1.1 : 1);
      if (input.forward) car.speed = Math.min(topSpeed, car.speed + 20 * dt);
      else if (input.back) car.speed = Math.max(car.kind === 'boat' ? -8 : -10, car.speed - 26 * dt);
      else car.speed *= Math.max(0, 1 - 0.8 * dt);
      if (input.left) car.heading -= 1.9 * dt * Math.min(1, Math.abs(car.speed) / 8 + 0.3) * Math.sign(car.speed || 1);
      if (input.right) car.heading += 1.9 * dt * Math.min(1, Math.abs(car.speed) / 8 + 0.3) * Math.sign(car.speed || 1);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = car.speed;
      state.stats.distance += Math.abs(car.speed) * dt;
      if (car.kind !== 'boat') {
        car.x = clampToCity(car.x, -230, 230);
        car.z = clampToCity(car.z, -200, CITY.waterZ - 2);
        const fixed = collideBuildings(car.x, car.z, 2.4);
        if (fixed.x !== car.x || fixed.z !== car.z) { car.speed *= 0.4; car.x = fixed.x; car.z = fixed.z; }
      } else {
        car.x = clampToCity(car.x, -230, 230);
        car.z = clampToCity(car.z, CITY.waterZ - 2, 300);
      }
      // Running over pedestrians.
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 9 && Math.abs(car.speed) > 5) {
          ped.down = 8;
          events |= raiseWanted(1);
          state.message = 'You hit a pedestrian — wanted level up.';
          state.messageTimer = 4;
        }
      }
    }

    // Traffic: follow the road grid, turn at intersections.
    for (const car of state.cars) {
      if (car === p.car || car.kind === 'police' || car.kind === 'boat') continue;
      const stepLen = car.speed * dt;
      if (car.axis === 'x') {
        car.x += car.dir * stepLen;
        car.z = nearestRoadZ(car.z) + car.lane;
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (Math.abs(car.x) > 228) car.dir *= -1;
        if (Math.abs(car.x - nearestRoad(car.x)) < 2 && random() < 0.02) {
          car.axis = 'z'; car.dir = random() < 0.5 ? 1 : -1;
          car.x = nearestRoad(car.x); car.z = nearestRoadZ(car.z);
        }
      } else {
        car.z += car.dir * stepLen;
        car.x = nearestRoad(car.x) + car.lane;
        car.heading = car.dir > 0 ? 0 : Math.PI;
        if (Math.abs(car.z) > 198) car.dir *= -1;
        if (Math.abs(car.z - nearestRoadZ(car.z)) < 2 && random() < 0.02) {
          car.axis = 'x'; car.dir = random() < 0.5 ? 1 : -1;
          car.x = nearestRoad(car.x); car.z = nearestRoadZ(car.z);
        }
      }
    }

    // Pedestrians wander the sidewalks.
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      if (Math.abs(ped.x - ped.tx) < 1 && Math.abs(ped.z - ped.tz) < 1) {
        ped.tx = roadX[Math.floor(random() * roadX.length)] + range(random, -6, 6);
        ped.tz = roadZ[Math.floor(random() * roadZ.length)] + range(random, -6, 6);
      }
      const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.x += (dx / d) * ped.speed * dt;
      ped.z += (dz / d) * ped.speed * dt;
    }

    // Police: spawn to match the wanted level, chase the player.
    const wantPolice = state.wanted > 0 ? Math.min(state.wanted + 1, 5) : 0;
    while (state.police.length < wantPolice) {
      const pc = spawnCar('police', p.x + range(random, -60, 60), p.z + range(random, -60, 60), 0);
      pc.maxSpeed = 34;
      state.police.push(pc);
    }
    while (state.police.length > wantPolice) {
      const pc = state.police.pop();
      const i = state.cars.indexOf(pc);
      if (i >= 0) state.cars.splice(i, 1);
    }
    for (const pc of state.police) {
      const dx = p.x - pc.x, dz = p.z - pc.z;
      const d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - pc.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      pc.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh));
      pc.speed = Math.min(34, pc.speed + 14 * dt);
      pc.x += Math.sin(pc.heading) * pc.speed * dt;
      pc.z += Math.cos(pc.heading) * pc.speed * dt;
      const fixed = collideBuildings(pc.x, pc.z, 2.4);
      pc.x = fixed.x; pc.z = fixed.z;
      if (d < 4) {
        if (p.onFoot) {
          state.bustedTimer += dt;
          if (state.bustedTimer > 2) {
            state.message = 'BUSTED — the harbor police took you in.';
            state.messageTimer = 5;
            return EVENT_BUSTED;
          }
        } else if (p.car) {
          p.car.health -= 12 * dt;
          p.health -= 4 * dt;
          if (p.health <= 0) {
            state.message = 'WASTED — Rook is down.';
            state.messageTimer = 5;
            return EVENT_WASTED;
          }
        }
      }
    }
    if (state.wanted > 0 && state.police.length === 0) state.bustedTimer = 0;

    // Helicopter at 4+ stars, with a searchlight on the player.
    if (state.wanted >= 4) {
      if (!state.heli) state.heli = { x: p.x, z: p.z - 20, y: 55, angle: 0 };
      state.heli.x += (p.x - state.heli.x) * 0.5 * dt;
      state.heli.z += (p.z - state.heli.z) * 0.5 * dt;
      state.heli.angle += dt * 3;
    } else state.heli = null;

    // Wanted level decays when the player lies low.
    if (state.wanted > 0) {
      state.wantedTimer += dt * (state.crew.some((c) => c.id === 'ghost') ? 2 : 1);
      if (state.wantedTimer > 25) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    }

    // Collectibles.
    for (const c of collectibles) {
      if (!c.taken && dist2(p.x, p.z, c.x, c.z) < 9) {
        c.taken = true;
        state.stats.collectibles += 1;
        state.cash += 50;
        events |= EVENT_COLLECT;
        state.message = `Harbor token ${state.stats.collectibles}/${COLLECTIBLE_COUNT} — +$50.`;
        state.messageTimer = 3;
      }
    }

    // Turf: stand in a zone to claim it; owned zones pay out.
    for (const zone of state.turf) {
      const def = TURF_ZONES.find((t) => t.id === zone.id);
      if (!zone.owned && dist2(p.x, p.z, def.x, def.z) < 900) {
        zone.timer += dt;
        if (zone.timer > 5) {
          zone.owned = true;
          state.stats.turfOwned += 1;
          events |= EVENT_TURF;
          state.message = `Turf claimed: ${def.name} — it pays $${def.income} every 30 seconds.`;
          state.messageTimer = 4;
        }
      } else if (zone.owned) zone.timer = 0;
    }
    state.turfIncomeTimer += dt;
    if (state.turfIncomeTimer > 30) {
      state.turfIncomeTimer = 0;
      let income = 0;
      for (const zone of state.turf) if (zone.owned) income += TURF_ZONES.find((t) => t.id === zone.id).income;
      if (income > 0) { state.cash += income; state.message = `Turf income: +$${income}.`; state.messageTimer = 3; }
    }

    // Job objectives.
    if (state.activeJob && state.jobProgress) {
      const def = JOBS.find((j) => j.id === state.activeJob);
      const jp = state.jobProgress;
      if (def.objective === 'deliver' && dist2(p.x, p.z, jp.target.x, jp.target.z) < 100) {
        events |= finishJob(0);
      } else if (def.objective === 'collect') {
        for (const parcel of jp.parcels) {
          if (!parcel.got && dist2(p.x, p.z, parcel.x, parcel.z) < 64) {
            parcel.got = true;
            state.message = `Parcel ${jp.parcels.filter((q) => q.got).length}/3 collected.`;
            state.messageTimer = 3;
          }
        }
        if (jp.parcels.every((q) => q.got) && dist2(p.x, p.z, jp.target.x, jp.target.z) < 100) events |= finishJob(0);
      } else if (def.objective === 'taxi') {
        if (jp.phase === 'pickup' && dist2(p.x, p.z, jp.marker.x, jp.marker.z) < 100) {
          jp.phase = 'dropoff';
          jp.marker = { x: range(random, -180, 180), z: range(random, -160, 160) };
          state.objective = 'Drive the fare to the drop-off marker.';
        } else if (jp.phase === 'dropoff' && dist2(p.x, p.z, jp.marker.x, jp.marker.z) < 100) {
          jp.faresLeft -= 1;
          state.stats.fares += 1;
          const tip = 40 + Math.floor(random() * 40);
          state.cash += tip;
          events |= EVENT_FARE;
          if (jp.faresLeft <= 0) events |= finishJob(0);
          else {
            jp.phase = 'pickup';
            jp.marker = { x: range(random, -180, 180), z: range(random, -160, 160) };
            state.objective = `Pick up the next fare (${jp.faresLeft} left).`;
          }
        }
      } else if (def.objective === 'boat' && p.inBoat && dist2(p.x, p.z, jp.target.x, jp.target.z) < 144) {
        events |= finishJob(0);
      }
    }

    events |= updateRace(dt);
    return events;
  }

  function serialize() {
    return JSON.parse(JSON.stringify({
      cash: state.cash, respect: state.respect, wanted: state.wanted,
      jobs: state.jobs, stats: state.stats, crew: state.crew.map((c) => c.id),
      inventory: state.inventory, turf: state.turf, time: state.time,
      player: { x: state.player.x, z: state.player.z },
    }));
  }

  function deserialize(data) {
    if (!data) return false;
    state.cash = data.cash ?? 150;
    state.respect = data.respect ?? 0;
    state.wanted = data.wanted ?? 0;
    state.jobs = data.jobs ?? state.jobs;
    state.stats = { ...state.stats, ...(data.stats ?? {}) };
    state.crew = (data.crew ?? []).map((id) => CREW.find((c) => c.id === id)).filter(Boolean);
    state.inventory = data.inventory ?? [];
    state.turf = data.turf ?? state.turf;
    state.time = data.time ?? 17.2;
    if (data.player) { state.player.x = data.player.x; state.player.z = data.player.z; }
    return true;
  }

  reset();
  return {
    state, buildings, palms, streetlights, neonSigns, collectibles, roadX, roadZ,
    reset, step, startJob, resolveChoice, startRace, standings, raceProgress,
    buyItem, respray, recruitCrew, enterExitCar, rankName, completePercent,
    serialize, deserialize,
  };
}
