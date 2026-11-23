// The four staged screenshots behind ?shot=title|chase|night|pause (with &seed=N).
// Each one plays the real rules forward from a fresh world, then stages the frame: the camera,
// the time of day, the traffic and the player's progress are set so the shot reads at thumbnail
// size. The same seed always gives the same frame.
import { SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const STEP = 1 / 60;

function addCar(world, kind, x, z, heading, color, speed) {
  const car = {
    kind, x, z, heading, speed: speed || 0,
    color: color || '#c0392b', maxSpeed: 16,
    axis: 'x', dir: 1, lane: 3.5, health: 100, stolen: false,
  };
  world.state.cars.push(car);
  return car;
}

function driveFor(world, seconds, input) {
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, input || { forward: false, back: false, left: false, right: false, sprint: false });
}

/**
 * Stage the named scene and return the screen to draw over it.
 * title: golden-hour harbour view — water and boats in the foreground, skyline behind.
 * chase: sunset chase — the player driving with a police car in frame, camera clear of the palms.
 * night: the midnight race — lifted out of black, wet neon reflections, a restrained searchlight,
 *   rivals close and large, player first, 4 wanted stars.
 * pause: the pause screen over a busy street, at a real progression point (no zero counters).
 */
export function stageShot(name, world) {
  const s = world.state;
  world.reset();
  if (name === 'chase') {
    s.time = 18.6; // low sun, long shadows, warm streets
    const car = addCar(world, 'player', 60, 120, Math.PI / 2, '#00b4d8', 22);
    s.player.car = car; s.player.onFoot = false; s.player.x = 60; s.player.z = 120; s.player.heading = Math.PI / 2;
    const police = addCar(world, 'police', 44, 126, Math.PI / 2, '#1a1a2e', 24);
    s.police.push(police);
    s.wanted = 2;
    addCar(world, 'traffic', 84, 117, Math.PI / 2, '#f1c40f', 14);
    addCar(world, 'traffic', 100, 123, Math.PI / 2, '#e67e22', 12);
    addCar(world, 'traffic', 36, 114, -Math.PI / 2, '#8e44ad', 10);
    driveFor(world, 1.2, { forward: true, back: false, left: false, right: false, sprint: false });
    s.objective = 'Escape the harbor police — lose the 2-star wanted level.';
    // Camera straight behind the player on the same road, so no building ever blocks it.
    s.camera = { pos: { x: s.player.x - 12, y: 5.5, z: s.player.z + 3 }, target: { x: s.player.x + 18, y: 1.5, z: s.player.z + 1 } };
    return { screen: SCREEN_PLAY };
  }
  if (name === 'night') {
    s.time = 22.5; // night, but the lighting is lifted: street pools, lit windows, neon
    world.startRace('midnight-harbor');
    const race = s.race;
    race.index = 2;
    // Player mid-circuit, heading east along the harbor road, rivals right behind.
    const car = s.player.car;
    car.x = 0; car.z = 180; car.heading = Math.PI / 2; car.speed = 26;
    s.player.x = 0; s.player.z = 180; s.player.heading = Math.PI / 2;
    const spots = [
      { x: -12, z: 176, color: '#e74c3c' },
      { x: -18, z: 185, color: '#3498db' },
      { x: -8, z: 187, color: '#f1c40f' },
    ];
    race.rivals.forEach((v, i) => {
      v.x = spots[i].x; v.z = spots[i].z; v.heading = Math.PI / 2;
      v.progress = 1.85 - i * 0.12;
      v.color = spots[i].color;
    });
    s.wanted = 4;
    s.heli = { x: 55, z: 128, y: 55, angle: 0.6 };
    const police = addCar(world, 'police', -30, 183, Math.PI / 2, '#1a1a2e', 26);
    s.police.push(police);
    addCar(world, 'traffic', 40, 177, Math.PI / 2, '#16a085', 12);
    addCar(world, 'traffic', 62, 184, Math.PI / 2, '#ecf0f1', 10);
    driveFor(world, 0.8, { forward: true, back: false, left: false, right: false, sprint: false });
    // Keep the staged order after the short drive: player still first.
    race.rivals.forEach((v, i) => { v.progress = 1.85 - i * 0.12; });
    s.objective = 'Midnight Harbor GP — checkpoint 3 of 6. Hold 1st place.';
    s.camera = { pos: { x: s.player.x - 18, y: 8, z: s.player.z - 14 }, target: { x: s.player.x + 26, y: 2, z: s.player.z + 4 } };
    return { screen: SCREEN_PLAY };
  }
  if (name === 'pause') {
    s.time = 17.4;
    // A real progression point: three jobs done, fares run, cars stolen, crew hired, turf held.
    s.jobs[0].status = 'done'; s.jobs[1].status = 'done'; s.jobs[2].status = 'done'; s.jobs[3].status = 'available';
    s.stats.jobsDone = 3; s.stats.fares = 5; s.stats.carsStolen = 4; s.stats.collectibles = 8;
    s.stats.racesWon = 1; s.stats.turfOwned = 2; s.stats.crew = 2; s.stats.distance = 18400;
    s.cash = 2450; s.respect = 45;
    s.crew = [
      { id: 'dash', name: 'Dash', role: 'Driver', bonus: '+15% race prize money' },
      { id: 'wrench', name: 'Wrench', role: 'Mechanic', bonus: 'Cars repair free, +10% top speed' },
    ];
    s.turf[0].owned = true; s.turf[2].owned = true;
    const car = addCar(world, 'player', 0, 58, 0, '#00b4d8', 0);
    s.player.car = car; s.player.onFoot = false; s.player.x = 0; s.player.z = 58; s.player.heading = 0;
    // A busy intersection: traffic on every approach, pedestrians on the sidewalks.
    addCar(world, 'traffic', -14, 55, Math.PI / 2, '#c0392b', 8);
    addCar(world, 'traffic', 16, 61, -Math.PI / 2, '#f1c40f', 9);
    addCar(world, 'traffic', -6, 40, 0, '#2980b9', 7);
    addCar(world, 'traffic', 8, 78, Math.PI, '#16a085', 8);
    addCar(world, 'traffic', 24, 55, Math.PI / 2, '#e67e22', 6);
    const police = addCar(world, 'police', -26, 64, Math.PI / 2, '#1a1a2e', 10);
    s.police.push(police);
    s.wanted = 1;
    for (let i = 0; i < s.peds.length; i += 1) { const ped = s.peds[i]; ped.x = -12 + (i % 6) * 4; ped.z = 48 + Math.floor(i / 6) * 6; }
    driveFor(world, 0.6, { forward: false, back: false, left: false, right: false, sprint: false });
    s.objective = 'Job 4: The Long Way Home — run 3 taxi fares for Tomás Reyes.';
    s.camera = { pos: { x: s.player.x - 4, y: 11, z: s.player.z - 22 }, target: { x: s.player.x + 2, y: 2, z: s.player.z + 18 } };
    return { screen: SCREEN_PAUSED };
  }
  // title (default): golden hour over the harbor.
  s.time = 17.2;
  const car = addCar(world, 'player', -6, 192, Math.PI, '#00b4d8', 0);
  s.player.car = car; s.player.onFoot = false; s.player.x = -6; s.player.z = 192; s.player.heading = Math.PI;
  addCar(world, 'boat', -60, 240, 0.3, '#e8e8e8', 0);
  addCar(world, 'boat', 50, 252, -0.2, '#f1c40f', 0);
  addCar(world, 'boat', 110, 232, 0.5, '#e74c3c', 0);
  addCar(world, 'traffic', 30, 188, Math.PI / 2, '#f1c40f', 6);
  addCar(world, 'traffic', -40, 186, -Math.PI / 2, '#2980b9', 6);
  driveFor(world, 0.5, { forward: false, back: false, left: false, right: false, sprint: false });
  // High camera over the water: harbour and boats in the foreground, skyline behind, sky on top.
  s.camera = { pos: { x: -10, y: 54, z: 306 }, target: { x: 0, y: 8, z: 40 } };
  return { screen: SCREEN_TITLE };
}
