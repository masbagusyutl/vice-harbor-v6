// Vice Harbor — configuration: districts, characters, jobs, races, economy.
// Every name, place and line of dialogue here is original, written for this game.
export const CITY = {
  block: 44, road: 14, blocksX: 8, blocksZ: 7,
  // City spans x in [-232, 232], z in [-203, 203]; water (the harbor) lies south of z = 203.
  waterZ: 205,
};

export const DISTRICTS = [
  { name: 'Harborfront', palette: ['#7a5a3a', '#8a6a4a', '#5d4630'], sign: 'HARBORFRONT' },
  { name: 'Neon Row', palette: ['#3a2a5a', '#4a2a6a', '#2a1a4a'], sign: 'NEON ROW' },
  { name: 'Old Town', palette: ['#6a4a3a', '#7a5a42', '#54402e'], sign: 'OLD TOWN' },
  { name: 'Marina Bay', palette: ['#2a4a5a', '#3a5a6a', '#1e3a4a'], sign: 'MARINA BAY' },
  { name: 'Coral Heights', palette: ['#5a3a4a', '#6a4256', '#452a38'], sign: 'CORAL HEIGHTS' },
  { name: 'Dockside', palette: ['#4a3a2a', '#5a4832', '#3a2e22'], sign: 'DOCKSIDE' },
  { name: 'Palm Court', palette: ['#8a6a3a', '#9a7a42', '#6a5228'], sign: 'PALM COURT' },
  { name: 'Ironworks', palette: ['#3a3a3a', '#4a4a48', '#2c2c2c'], sign: 'IRONWORKS' },
  { name: 'Sunset Strip', palette: ['#6a3a2a', '#7a4a34', '#4e2c20'], sign: 'SUNSET STRIP' },
  { name: 'Lighthouse Point', palette: ['#2a3a4a', '#36485a', '#202e3c'], sign: 'LIGHTHOUSE PT' },
];

export const CHARACTERS = {
  player: { name: 'Rook Calloway', role: 'wheelman fresh off the ferry' },
  mara: { name: 'Mara Voss', role: 'fixer who runs Neon Row' },
  eddie: { name: 'Eddie Kwan', role: 'dock boss of Dockside' },
  ana: { name: 'Sister Ana', role: 'street-race queen of Sunset Strip' },
  lou: { name: 'Big Lou', role: 'turf king of Old Town' },
  priya: { name: 'Priya Nair', role: 'hacker in Coral Heights' },
  tomas: { name: 'Tomás Reyes', role: 'taxi king of Palm Court' },
  ivy: { name: 'Ivy Chen', role: 'boat runner of Marina Bay' },
};

export const RANKS = ['Nobody', 'Street Rat', 'Hustler', 'Wheelman', 'Made', 'Kingpin of the Harbor'];

export const CREW = [
  { id: 'dash', name: 'Dash', role: 'Driver', bonus: '+15% race prize money' },
  { id: 'wrench', name: 'Wrench', role: 'Mechanic', bonus: 'Cars repair free, +10% top speed' },
  { id: 'ghost', name: 'Ghost', role: 'Hacker', bonus: 'Wanted level drops twice as fast' },
];

// The seven story jobs. Each has a giver, a short brief, an objective type and a payout.
export const JOBS = [
  {
    id: 'harbor-lights', title: 'Harbor Lights', giver: 'mara',
    brief: 'Mara Voss: "Rook. A crate of mine is sitting on Pier 9. Bring it to Neon Row before the tide turns. No cops, no questions."',
    objective: 'deliver', target: { x: -170, z: -120 }, payout: 250, respect: 12,
    choice: null,
  },
  {
    id: 'dockside-debt', title: 'Dockside Debt', giver: 'eddie',
    brief: 'Eddie Kwan: "Three crews owe me. Pick up the parcels at the docks, all three, and bring them to my warehouse. They will not argue twice."',
    objective: 'collect', parcels: 3, payout: 400, respect: 15,
    choice: null,
  },
  {
    id: 'neon-run', title: 'Neon Run', giver: 'ana',
    brief: 'Sister Ana: "You talk fast, Rook. Prove it. Beat Vex Marlowe around the Neon Loop and the Strip is yours to race."',
    objective: 'race', race: 'neon-loop', payout: 500, respect: 20,
    choice: null,
  },
  {
    id: 'long-way-home', title: 'The Long Way Home', giver: 'tomas',
    brief: 'Tomás Reyes: "My best driver quit at dawn. Take the cab, run three fares, and do not scratch the paint. Tips are yours."',
    objective: 'taxi', fares: 3, payout: 350, respect: 14,
    choice: null,
  },
  {
    id: 'tide-runner', title: 'Tide Runner', giver: 'ivy',
    brief: 'Ivy Chen: "The harbor patrol changed its route. Run my boat from Marina Bay to Lighthouse Point, fast and quiet. The water is the only road they do not own."',
    objective: 'boat', target: { x: 190, z: 260 }, payout: 450, respect: 16,
    choice: null,
  },
  {
    id: 'smoke-and-mirrors', title: 'Smoke and Mirrors', giver: 'priya',
    brief: 'Priya Nair: "Big Lou’s men are watching my safehouse. I need you to choose: run the decoy through Old Town, or go loud and draw them off yourself."',
    objective: 'choice', payout: 600, respect: 22,
    choice: {
      a: { label: 'Run the decoy', text: 'You ghost through Old Town in a borrowed sedan. Priya slips away clean. +$600, no heat.' },
      b: { label: 'Go loud', text: 'You draw every patrol in Old Town onto yourself. Priya escapes — but you earn 2 wanted stars. +$900.' },
    },
  },
  {
    id: 'meridian-job', title: 'The Meridian Job', giver: 'lou',
    brief: 'Big Lou: "The Meridian vault moves its gold tonight, one truck, one bridge, one chance. Bring me that truck — or bring me the man who stops you. Your call, Rook."',
    objective: 'choice', payout: 1200, respect: 30,
    choice: {
      a: { label: 'Take the truck', text: 'You lift the gold truck on the Meridian Bridge and vanish into the docks. +$1,200. The harbor is yours.' },
      b: { label: 'Spare the driver', text: 'You let the driver walk and take only half the gold. Lou respects it — barely. +$700, +respect.' },
    },
  },
];

export const RACES = [
  {
    id: 'sunset-sprint', name: 'Sunset Sprint', route: 'Sunset Strip to Harborfront',
    prize: 300, checkpoints: [
      { x: -180, z: 120 }, { x: -60, z: 120 }, { x: 60, z: 120 }, { x: 180, z: 60 }, { x: 180, z: -60 },
    ],
    rivals: ['Vex Marlowe', 'Sable Ortiz', 'Kid Comet'],
  },
  {
    id: 'neon-loop', name: 'Neon Loop', route: 'Around Neon Row',
    prize: 500, checkpoints: [
      { x: -120, z: -60 }, { x: 0, z: -60 }, { x: 120, z: -60 }, { x: 120, z: 60 }, { x: 0, z: 60 }, { x: -120, z: 60 },
    ],
    rivals: ['Vex Marlowe', 'Sable Ortiz', 'Kid Comet'],
  },
  {
    id: 'midnight-harbor', name: 'Midnight Harbor GP', route: 'Harborfront night circuit',
    prize: 800, checkpoints: [
      { x: -180, z: 180 }, { x: 0, z: 180 }, { x: 180, z: 180 }, { x: 180, z: 0 }, { x: 0, z: -120 }, { x: -180, z: 0 },
    ],
    rivals: ['Vex Marlowe', 'Sable Ortiz', 'Kid Comet'],
  },
];

export const TURF_ZONES = [
  { id: 'neon-row', name: 'Neon Row', x: -90, z: -90, income: 40 },
  { id: 'old-town', name: 'Old Town', x: -150, z: 30, income: 35 },
  { id: 'dockside', name: 'Dockside', x: 150, z: 150, income: 45 },
  { id: 'palm-court', name: 'Palm Court', x: 90, z: -150, income: 30 },
  { id: 'marina-bay', name: 'Marina Bay', x: 30, z: 150, income: 50 },
];

export const GUN_SHOP = { name: 'Iron & Oak', items: [
  { id: 'pistol', name: 'Harbor Pistol', price: 150 },
  { id: 'smg', name: 'Dockside SMG', price: 450 },
  { id: 'shotgun', name: 'Ironworks Shotgun', price: 700 },
] };
export const RESPRAY = { name: 'Chrome Works', price: 120 };

export const COLLECTIBLE_COUNT = 24;
export const WANTED_MAX = 5;
export const SAVE_KEY = 'vice-harbor-v6-save';
