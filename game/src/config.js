// Every tuning number, colour and room layout in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const HUD_HEIGHT = 64;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const THIEF = {
  radius: 13,
  speed: 235,
  grabRadius: 30,
};

export const LIVES = 3;

/** Guard patrol: speed while walking a route, faster while chasing. */
export const GUARD = {
  radius: 14,
  patrolSpeed: 78,
  chaseSpeed: 178,
  coneRange: 215,
  coneHalfAngle: 0.52,
  catchRadius: 26,
  /** Detection fills 0..1 while the thief stands inside a cone; drains when hidden. */
  detectRate: 1.15,
  forgetRate: 0.5,
};

/** Wall-mounted cameras sweep back and forth and raise the alarm directly. */
export const CAMERA = {
  coneRange: 235,
  coneHalfAngle: 0.42,
  sweepSpeed: 0.55,
  alarmRate: 34,
};

export const ALARM = {
  max: 100,
  /** Alarm decays slowly while nobody sees the thief. */
  decay: 2.2,
  /** Drilling the vault is loud: alarm rises this fast while the drill runs. */
  drillRate: 9,
  /** Being caught adds this much alarm on top of losing a life. */
  caughtPenalty: 25,
  /** At this level the bank locks down and every guard chases. */
  lockdown: 100,
};

export const VAULT = {
  /** Seconds of channelled work to crack the vault, by gadget. */
  lockpickSeconds: 1.6,
  drillSeconds: 3.2,
  /** EMP disables every camera for this long. */
  empSeconds: 9,
};

/** The bank floor: walls are solid rectangles, desks are low cover that blocks
 *  sight (and movement) but not the thief's view of the room. All coordinates
 *  are in the 1280x720 field; the HUD occupies the top HUD_HEIGHT pixels. */
export const ROOM = {
  // Outer walls (thickness 18) leave a gap for the entrance (bottom-left)
  // and the getaway door (bottom-right).
  walls: [
    { x: 0, y: 64, w: 1280, h: 18 }, // top
    { x: 0, y: 64, w: 18, h: 638 }, // left
    { x: 1262, y: 64, w: 18, h: 638 }, // right
    { x: 0, y: 684, w: 150, h: 18 }, // bottom-left of entrance
    { x: 230, y: 684, w: 820, h: 18 }, // bottom-middle
    { x: 1130, y: 684, w: 150, h: 18 }, // bottom-right of getaway door
  ],
  // Interior pillars and teller desks: cover that blocks sight lines.
  cover: [
    { x: 300, y: 170, w: 150, h: 26 }, // teller desk row 1
    { x: 560, y: 170, w: 150, h: 26 },
    { x: 820, y: 170, w: 150, h: 26 },
    { x: 430, y: 330, w: 26, h: 130 }, // pillar
    { x: 830, y: 330, w: 26, h: 130 }, // pillar
    { x: 300, y: 520, w: 150, h: 26 }, // desk row 2
    { x: 560, y: 520, w: 150, h: 26 },
    { x: 820, y: 520, w: 150, h: 26 },
  ],
  // The vault room: a walled box at the top-right with a single door in its
  // bottom wall, so the way out runs straight down into the room.
  vault: { x: 1050, y: 82, w: 212, h: 170, doorX: 1120, doorW: 60 },
  entrance: { x: 150, y: 684, w: 80, h: 18 },
  exit: { x: 1050, y: 684, w: 80, h: 18 },
};

/** Loot spots (gold bars, cash stacks, the diamond inside the vault). */
export const LOOT_SPOTS = [
  { kind: 'gold', x: 375, y: 150, value: 5000 },
  { kind: 'gold', x: 635, y: 150, value: 5000 },
  { kind: 'cash', x: 895, y: 150, value: 2000 },
  { kind: 'cash', x: 375, y: 500, value: 2000 },
  { kind: 'cash', x: 635, y: 500, value: 2000 },
  { kind: 'gold', x: 895, y: 500, value: 5000 },
  { kind: 'diamond', x: 1156, y: 130, value: 15000, inVault: true },
];

export const ENTRY_POINTS = [
  { id: 'front', name: 'Front Door', x: 190, y: 640, blurb: 'Walk in like a customer. Closest to the tills.' },
  { id: 'roof', name: 'Roof Vent', x: 640, y: 110, blurb: 'Drop in through the skylight. Lands mid-floor.' },
  { id: 'tunnel', name: 'Service Tunnel', x: 1180, y: 640, blurb: 'Crawl up by the vault. Risky, but close to the prize.' },
];

export const GADGETS = [
  { id: 'lockpick', name: 'Lockpick Set', blurb: 'Cracks the vault fast and silent (1.6s).' },
  { id: 'drill', name: 'Thermal Drill', blurb: 'Cracks the vault in 3.2s, but loud: alarm climbs.' },
  { id: 'emp', name: 'EMP Pulse', blurb: 'Press Q: cameras blind for 9s. Vault still needs 3.2s by hand.' },
];

export const CREW = [
  { id: 'hacker', name: 'Hacker — "Patch"', blurb: 'Cameras sweep at half speed.' },
  { id: 'lookout', name: 'Lookout — "Iris"', blurb: 'Detection fills 35% slower.' },
  { id: 'muscle', name: 'Muscle — "Brick"', blurb: '+1 life and the drill runs 30% faster.' },
];

export const PALETTE = {
  backdrop: '#0d0f16',
  floor: '#1a1d29',
  floorTile: '#202435',
  wall: '#3a4157',
  wallTop: '#4a5470',
  cover: '#2c3350',
  coverTop: '#3d4568',
  vaultWall: '#4d4433',
  vaultFloor: '#241f16',
  gold: '#f2c94c',
  cash: '#7fce7a',
  diamond: '#7fe3f2',
  thief: '#b388ff',
  thiefRing: '#e6d6ff',
  guard: '#e5534b',
  guardCone: 'rgba(242, 201, 76, 0.20)',
  guardConeEdge: 'rgba(242, 201, 76, 0.55)',
  camera: '#ff5a5a',
  cameraCone: 'rgba(255, 90, 90, 0.16)',
  cameraConeEdge: 'rgba(255, 90, 90, 0.5)',
  exit: '#58d68d',
  entrance: '#58a6d6',
  panel: '#191d2b',
  panelEdge: '#2e3550',
  text: '#eef1f5',
  muted: '#9aa1b5',
  danger: '#ff6b5e',
  alarm: '#ff4d4d',
  ok: '#58d68d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'meridian-midnight.best';
