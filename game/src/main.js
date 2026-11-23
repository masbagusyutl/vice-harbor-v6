// Vice Harbor — boot and the one loop: input every frame, the world in fixed 1/60 s steps,
// the renderer paints what is there, and the DOM HUD shows cash, wanted stars, the minimap,
// the objective and the race standings. Screens: title, play, paused, wasted, busted, and the
// job board. ?seed=N fixes the world. ?shot=title|chase|night|pause (with &seed=N) stages that
// scene instead of running the loop, paints it, and sets window.__shotReady for a screenshot.
import { SAVE_KEY, JOBS, RACES, GUN_SHOP, CREW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_JOB_DONE, EVENT_RACE_DONE, EVENT_WASTED, EVENT_BUSTED, EVENT_COLLECT, EVENT_FARE, EVENT_TURF } from './world.js';
import { ACTION_ENTER, ACTION_PAUSE, ACTION_CONFIRM, ACTION_CHOICE_A, ACTION_CHOICE_B, ACTION_JOB, createInput } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_WASTED, SCREEN_BUSTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

const el = (id) => document.getElementById(id);
const hud = {
  cash: el('hud-cash'), respect: el('hud-respect'), wanted: el('hud-wanted'),
  objective: el('hud-objective'), speed: el('hud-speed'), message: el('hud-message'),
  race: el('hud-race'), time: el('hud-time'), minimap: el('hud-minimap'),
  title: el('panel-title'), pause: el('panel-pause'), over: el('panel-over'),
  jobs: el('panel-jobs'), choice: el('panel-choice'), banner: el('hud-banner'),
  pauseStats: el('pause-stats'), pauseComplete: el('pause-complete'),
  overTitle: el('over-title'), overText: el('over-text'),
};

function announce(message) { status.textContent = message; }

function saveGame() {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize())); } catch { /* storage off */ }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return world.deserialize(JSON.parse(raw));
  } catch { return false; }
}

function wantedStars(n) {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += i < n ? '★' : '☆';
  return out;
}

function timeLabel(t) {
  const h = Math.floor(t), m = Math.floor((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function refreshHud() {
  const s = world.state;
  hud.cash.textContent = `$${s.cash.toLocaleString('en-US')}`;
  hud.respect.textContent = `${world.rankName()} · ${s.respect} respect`;
  hud.wanted.textContent = wantedStars(s.wanted);
  hud.wanted.style.color = s.wanted >= 4 ? '#ff4757' : s.wanted > 0 ? '#ffa502' : '#dfe4ea';
  hud.objective.textContent = s.objective;
  hud.time.textContent = timeLabel(s.time);
  const speed = s.player.car ? Math.abs(s.player.car.speed) * 3.2 : 0;
  hud.speed.textContent = s.player.onFoot ? (s.player.inBoat ? 'ON FOOT · SWIMMING' : 'ON FOOT') : `${Math.round(speed)} km/h`;
  hud.message.textContent = s.messageTimer > 0 ? s.message : '';
  if (s.race) {
    const rows = world.standings().map((r, i) => `${i + 1}. ${r.name}`).join('\n');
    hud.race.textContent = `${s.race.name}\nCheckpoint ${Math.min(s.race.index + 1, s.race.checkpoints.length)} / ${s.race.checkpoints.length}\n${rows}`;
    hud.race.style.display = 'block';
  } else hud.race.style.display = 'none';
  renderer.drawMinimap(hud.minimap, world, s);
}

function refreshPausePanel() {
  const s = world.state;
  const p = s.stats;
  hud.pauseStats.innerHTML =
    `<div><b>${world.completePercent()}%</b><span>COMPLETE</span></div>` +
    `<div><b>${p.jobsDone} / 7</b><span>Jobs done</span></div>` +
    `<div><b>${p.fares}</b><span>Taxi fares</span></div>` +
    `<div><b>${p.carsStolen}</b><span>Cars stolen</span></div>` +
    `<div><b>${p.collectibles} / 24</b><span>Harbor tokens</span></div>` +
    `<div><b>${p.racesWon}</b><span>Races won</span></div>` +
    `<div><b>${p.turfOwned} / 5</b><span>Turf held</span></div>` +
    `<div><b>${p.crew} / 3</b><span>Crew</span></div>` +
    `<div><b>$${s.cash.toLocaleString('en-US')}</b><span>Cash</span></div>`;
  hud.pauseComplete.textContent = `${world.rankName()} — ${s.respect} respect · ${Math.round(p.distance / 1000)} km driven`;
}

function showOnly(panel) {
  for (const p of [hud.title, hud.pause, hud.over, hud.jobs, hud.choice]) p.classList.add('hidden');
  if (panel) panel.classList.remove('hidden');
}

function buildJobPanel() {
  const s = world.state;
  let html = '<h2>VICE HARBOR — WORK</h2><p class="dim">Pick a job or a race. Jobs unlock in order.</p><h3>Story jobs</h3>';
  for (const job of JOBS) {
    const slot = s.jobs.find((j) => j.id === job.id);
    const done = slot.status === 'done';
    const active = s.activeJob === job.id;
    html += `<button class="job-btn" data-job="${job.id}" ${slot.status === 'locked' || done || active ? 'disabled' : ''}>` +
      `<b>${job.title}</b> — ${job.brief.split(':')[0]} · $${job.payout} · ${done ? 'DONE ✓' : active ? 'ACTIVE' : slot.status.toUpperCase()}</button>`;
  }
  html += '<h3>Street races</h3>';
  for (const race of RACES) {
    html += `<button class="job-btn" data-race="${race.id}"><b>${race.name}</b> — ${race.route} · 1st prize $${race.prize} · rivals: ${race.rivals.join(', ')}</button>`;
  }
  html += '<h3>Crew — $200 each</h3>';
  for (const member of CREW) {
    const hired = s.crew.some((c) => c.id === member.id);
    html += `<button class="job-btn" data-crew="${member.id}" ${hired || s.cash < 200 ? 'disabled' : ''}><b>${member.name}</b> — ${member.role} · ${member.bonus}${hired ? ' · HIRED ✓' : ''}</button>`;
  }
  html += '<h3>Iron &amp; Oak — gun shop</h3>';
  for (const item of GUN_SHOP.items) {
    const owned = s.inventory.includes(item.id);
    html += `<button class="job-btn" data-gun="${item.id}" ${owned || s.cash < item.price ? 'disabled' : ''}><b>${item.name}</b> — $${item.price}${owned ? ' · OWNED ✓' : ''}</button>`;
  }
  html += '<p class="dim">Close with J or Esc. Drive with W A S D, enter/exit a car with E, sprint with Shift.</p>';
  hud.jobs.innerHTML = html + '<button class="job-btn close" id="jobs-close">Close</button>';
  hud.jobs.querySelector('#jobs-close').addEventListener('click', () => showOnly(null));
  for (const b of hud.jobs.querySelectorAll('[data-job]')) b.addEventListener('click', () => {
    if (world.startJob(b.dataset.job)) { audio.click(); showOnly(null); announce(`Job started: ${b.dataset.job}`); }
  });
  for (const b of hud.jobs.querySelectorAll('[data-race]')) b.addEventListener('click', () => {
    if (world.startRace(b.dataset.race)) { audio.click(); showOnly(null); announce(`Race started: ${b.dataset.race}`); }
  });
  for (const b of hud.jobs.querySelectorAll('[data-crew]')) b.addEventListener('click', () => {
    if (world.recruitCrew(b.dataset.crew)) { audio.click(); buildJobPanel(); }
  });
  for (const b of hud.jobs.querySelectorAll('[data-gun]')) b.addEventListener('click', () => {
    if (world.buyItem(b.dataset.gun)) { audio.click(); buildJobPanel(); }
  });
}

function showChoicePanel() {
  const def = JOBS.find((j) => j.id === world.state.activeJob);
  if (!def || !def.choice) return;
  hud.choice.innerHTML = `<h2>${def.title}</h2><p>${def.brief}</p>` +
    `<button class="job-btn" id="choice-a"><b>1 — ${def.choice.a.label}</b><br>${def.choice.a.text}</button>` +
    `<button class="job-btn" id="choice-b"><b>2 — ${def.choice.b.label}</b><br>${def.choice.b.text}</button>`;
  hud.choice.querySelector('#choice-a').addEventListener('click', () => { world.resolveChoice('a'); showOnly(null); });
  hud.choice.querySelector('#choice-b').addEventListener('click', () => { world.resolveChoice('b'); showOnly(null); });
  showOnly(hud.choice);
}

function runShot(name) {
  const scene = stageShot(name, world);
  refreshHud();
  if (scene.screen === SCREEN_PAUSED) refreshPausePanel();
  if (scene.screen === SCREEN_TITLE) {
    showOnly(hud.title);
    el('btn-resume').style.display = 'none';
  } else if (scene.screen === SCREEN_PAUSED) showOnly(hud.pause);
  else showOnly(null); // play shots: no menu panel over the action
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world, scene.screen);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let bannerTimer = 0;

  function startGame(fresh) {
    audio.unlock();
    if (fresh) world.reset();
    screen = SCREEN_PLAY;
    showOnly(null);
    announce('Playing Vice Harbor.');
  }

  function endGame(kind) {
    audio.busted();
    screen = kind === 'wasted' ? SCREEN_WASTED : SCREEN_BUSTED;
    hud.overTitle.textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
    hud.overText.textContent = kind === 'wasted'
      ? 'Rook is down. The harbor keeps moving without you.'
      : 'The harbor police took you in. Mara Voss posts your bail — for a price.';
    world.state.cash = Math.max(0, world.state.cash - 100);
    world.state.wanted = 0;
    world.state.player.health = 100;
    showOnly(hud.over);
    announce(hud.overTitle.textContent);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) startGame(true);
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; refreshPausePanel(); showOnly(hud.pause); saveGame(); announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; showOnly(null); announce('Playing.'); }
    }
    if (actions & ACTION_ENTER && screen === SCREEN_PLAY) {
      world.enterExitCar();
      audio.click();
    }
    if (actions & ACTION_JOB && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; }
      buildJobPanel();
      showOnly(hud.jobs);
    }
    const activeDef = world.state.activeJob ? JOBS.find((j) => j.id === world.state.activeJob) : null;
    if (activeDef && activeDef.choice && screen === SCREEN_PLAY) {
      if (actions & ACTION_CHOICE_A) { world.resolveChoice('a'); audio.jobDone(); }
      else if (actions & ACTION_CHOICE_B) { world.resolveChoice('b'); audio.jobDone(); }
    }
  }

  function step() {
    const keys = input.state();
    const events = world.step(STEP, keys);
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_JOB_DONE) { audio.jobDone(); bannerTimer = 4; hud.banner.textContent = world.state.message; hud.banner.classList.remove('hidden'); }
    else if (events & EVENT_RACE_DONE) { audio.jobDone(); bannerTimer = 4; hud.banner.textContent = world.state.message; hud.banner.classList.remove('hidden'); }
    else if (events & EVENT_COLLECT) audio.pickup();
    else if (events & EVENT_FARE) audio.pickup();
    else if (events & EVENT_TURF) audio.pickup();
    const activeDef = world.state.activeJob ? JOBS.find((j) => j.id === world.state.activeJob) : null;
    if (activeDef && activeDef.choice && screen === SCREEN_PLAY && !showChoicePanel.shown) {
      showChoicePanel.shown = true;
      showChoicePanel();
    }
    if (!activeDef) showChoicePanel.shown = false;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) { step(); accumulator -= STEP; }
      saveTimer += 1 / 60;
      if (saveTimer > 10) { saveTimer = 0; saveGame(); }
      if (bannerTimer > 0) { bannerTimer -= 1 / 60; if (bannerTimer <= 0) hud.banner.classList.add('hidden'); }
      const s = world.state;
      audio.engine(s.player.car ? s.player.car.speed : 0, 38);
      audio.siren(s.wanted > 0);
    } else {
      accumulator = 0;
      audio.engine(0, 38);
      audio.siren(false);
    }
    renderer.draw(world.state, world, screen);
    refreshHud();
  }

  // Title screen buttons.
  el('btn-start').addEventListener('click', () => startGame(false));
  el('btn-new').addEventListener('click', () => startGame(true));
  el('btn-resume').addEventListener('click', () => startGame(false));
  el('btn-over').addEventListener('click', () => startGame(true));
  if (!loadGame()) el('btn-resume').style.display = 'none';
  else el('btn-resume').textContent = 'Continue — load saved game';

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      refreshPausePanel();
      showOnly(hud.pause);
      saveGame();
      announce('Paused.');
    }
  });

  showOnly(hud.title);
  announce('Vice Harbor. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
