// The heist itself: one bank floor, a thief, patrolling guards with vision
// cones, sweeping cameras, loot to grab, a vault to crack and a getaway door.
// The world runs in fixed steps and never touches the DOM, so the same seed
// always plays the same way and the screenshot scenes can stage it exactly.

import {
  ALARM, CAMERA, CREW, ENTRY_POINTS, FIELD, GADGETS, GUARD, LOOT_SPOTS,
  ROOM, STEP, THIEF, VAULT,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_VAULT = 8;
export const EVENT_WIN = 16;
export const EVENT_LOSE = 32;
export const EVENT_ALARM = 64;

const TAU = Math.PI * 2;

/** Solid rectangles: outer walls, cover, and the vault's own walls. */
export function solidRects() {
  return [...ROOM.walls, ...ROOM.cover, ...vaultWallRects()];
}

/** Walls only (no low cover): cameras are mounted high and see over desks,
 *  while guards at floor level are blocked by cover. */
export function wallRects() {
  return [...ROOM.walls, ...vaultWallRects()];
}

function vaultWallRects() {
  const v = ROOM.vault;
  return [
    { x: v.x, y: v.y, w: v.w, h: 18 }, // vault top
    { x: v.x, y: v.y, w: 18, h: v.h }, // vault left
    { x: v.x + 18, y: v.y + v.h - 18, w: v.doorX - (v.x + 18), h: 18 }, // vault bottom, left of the door
    { x: v.doorX + v.doorW, y: v.y + v.h - 18, w: v.x + v.w - (v.doorX + v.doorW), h: 18 }, // vault bottom, right of the door
  ];
}

/** Does the segment from (x1,y1) to (x2,y2) cross any solid rectangle? */
export function lineBlocked(x1, y1, x2, y2, solids) {
  for (let i = 0; i < solids.length; i += 1) {
    const r = solids[i];
    if (segmentHitsRect(x1, y1, x2, y2, r)) return true;
  }
  return false;
}

function segmentHitsRect(x1, y1, x2, y2, r) {
  // Liang-Barsky clipping: the segment enters the rectangle iff the clipped
  // interval is non-empty.
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

function circleHitsRect(x, y, radius, r) {
  const cx = Math.max(r.x, Math.min(x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(y, r.y + r.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Guard patrol routes: loops around the teller desks and the vault approach. */
const GUARD_ROUTES = [
  [{ x: 260, y: 130 }, { x: 990, y: 130 }],
  [{ x: 260, y: 410 }, { x: 990, y: 410 }],
  [{ x: 250, y: 300 }, { x: 250, y: 600 }],
  [{ x: 1000, y: 300 }, { x: 1000, y: 600 }],
];

const CAMERA_SPOTS = [
  { x: 640, y: 94, baseAngle: Math.PI / 2, sweep: 0.65 }, // top wall, looks down
  { x: 30, y: 380, baseAngle: 0, sweep: 0.5 }, // left wall, looks right
  { x: 1250, y: 380, baseAngle: Math.PI, sweep: 0.5 }, // right wall, looks left
];

export function createWorld(random) {
  const solids = solidRects();
  const walls = wallRects();
  let state = null;

  function reset(plan) {
    const entry = (plan && plan.entry) || ENTRY_POINTS[0];
    const gadget = (plan && plan.gadget) || GADGETS[0];
    const crew = (plan && plan.crew) || CREW[0];
    state = {
      phase: 'play',
      plan: { entry, gadget, crew },
      thief: { x: entry.x, y: entry.y, facing: -Math.PI / 2 },
      guards: GUARD_ROUTES.map((route, i) => ({
        route,
        waypoint: i % 2,
        x: route[i % 2].x,
        y: route[i % 2].y,
        angle: i % 2 === 0 ? 0 : Math.PI,
        mode: 'patrol', // patrol | chase
        detection: 0,
        lostSight: 0,
        stepPhase: random() * TAU,
      })),
      cameras: CAMERA_SPOTS.map((spot) => ({
        ...spot,
        angle: spot.baseAngle,
        sweepSpeed: CAMERA.sweepSpeed * (crew.id === 'hacker' ? 0.5 : 1),
        time: random() * TAU,
      })),
      loot: LOOT_SPOTS.map((spot) => ({ ...spot, taken: false })),
      vault: { open: false, progress: 0, channeling: false },
      alarm: 0,
      lives: crew.id === 'muscle' ? 4 : 3,
      maxLives: crew.id === 'muscle' ? 4 : 3,
      elapsed: 0,
      lootValue: 0,
      lootCount: 0,
      detectionEvents: 0,
      spotted: false,
      empTimer: 0,
      invulnerable: 0,
      channelSeconds: gadget.id === 'lockpick' ? VAULT.lockpickSeconds
        : gadget.id === 'drill' && crew.id === 'muscle' ? VAULT.drillSeconds * 0.7
        : VAULT.drillSeconds,
      message: '',
      messageTimer: 0,
      score: 0,
    };
    return state;
  }

  function moveCircle(entity, dx, dy, radius) {
    const nx = entity.x + dx;
    let blocked = false;
    for (let i = 0; i < solids.length; i += 1) {
      if (circleHitsRect(nx, entity.y, radius, solids[i])) { blocked = true; break; }
    }
    if (!blocked) entity.x = Math.max(18 + radius, Math.min(FIELD.width - 18 - radius, nx));
    const ny = entity.y + dy;
    blocked = false;
    for (let i = 0; i < solids.length; i += 1) {
      if (circleHitsRect(entity.x, ny, radius, solids[i])) { blocked = true; break; }
    }
    if (!blocked) entity.y = Math.max(82 + radius, Math.min(FIELD.height - 18 - radius, ny));
  }

  function canSee(fromX, fromY, angle, range, halfAngle, tx, ty, blockers) {
    const dx = tx - fromX;
    const dy = ty - fromY;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > halfAngle) return false;
    return !lineBlocked(fromX, fromY, tx, ty, blockers);
  }

  function respawnThief() {
    const entry = state.plan.entry;
    state.thief.x = entry.x;
    state.thief.y = entry.y;
    state.invulnerable = 2;
    for (const guard of state.guards) {
      guard.mode = 'patrol';
      guard.detection = 0;
      guard.lostSight = 0;
    }
  }

  function step(dt, move, interactHeld, usePressed) {
    if (!state || state.phase !== 'play') return EVENT_NONE;
    let events = EVENT_NONE;
    const s = state;
    s.elapsed += dt;
    if (s.messageTimer > 0) s.messageTimer -= dt;
    if (s.invulnerable > 0) s.invulnerable -= dt;
    if (s.empTimer > 0) s.empTimer -= dt;

    // --- Thief movement -------------------------------------------------
    if (move && (move.x !== 0 || move.y !== 0)) {
      moveCircle(s.thief, move.x * THIEF.speed * dt, move.y * THIEF.speed * dt, THIEF.radius);
      s.thief.facing = Math.atan2(move.y, move.x);
    }

    // --- EMP gadget ------------------------------------------------------
    if (usePressed && s.plan.gadget.id === 'emp' && s.empTimer <= 0) {
      s.empTimer = VAULT.empSeconds;
      events |= EVENT_ALARM;
      s.message = 'EMP pulse! Cameras blind for 9 seconds.';
      s.messageTimer = 3;
    }

    // --- Vault cracking --------------------------------------------------
    const vaultDoor = { x: ROOM.vault.doorX + ROOM.vault.doorW / 2, y: ROOM.vault.y + ROOM.vault.h - 9 };
    const nearVault = Math.hypot(s.thief.x - vaultDoor.x, s.thief.y - vaultDoor.y) < 70;
    s.vault.channeling = false;
    if (!s.vault.open && nearVault && interactHeld) {
      s.vault.channeling = true;
      s.vault.progress += dt / s.channelSeconds;
      if (s.plan.gadget.id === 'drill') {
        s.alarm = Math.min(ALARM.max, s.alarm + ALARM.drillRate * dt);
      }
      if (s.vault.progress >= 1) {
        s.vault.open = true;
        s.vault.progress = 1;
        events |= EVENT_VAULT;
        s.message = 'Vault cracked! The Meridian Diamond is yours.';
        s.messageTimer = 4;
      }
    }

    // --- Loot pickup -----------------------------------------------------
    for (const item of s.loot) {
      if (item.taken) continue;
      if (item.inVault && !s.vault.open) continue;
      if (Math.hypot(s.thief.x - item.x, s.thief.y - item.y) < THIEF.grabRadius) {
        item.taken = true;
        s.lootValue += item.value;
        s.lootCount += 1;
        events |= EVENT_PICKUP;
      }
    }

    // --- Cameras ---------------------------------------------------------
    let cameraSees = false;
    for (const cam of s.cameras) {
      cam.time += dt;
      cam.angle = cam.baseAngle + Math.sin(cam.time * cam.sweepSpeed) * cam.sweep;
      if (s.empTimer > 0) continue;
      if (s.invulnerable <= 0 && canSee(cam.x, cam.y, cam.angle, CAMERA.coneRange, CAMERA.coneHalfAngle, s.thief.x, s.thief.y, walls)) {
        cameraSees = true;
      }
    }
    if (cameraSees) {
      s.alarm = Math.min(ALARM.max, s.alarm + CAMERA.alarmRate * dt);
      if (s.detectionEvents === 0 || !s.spotted) {
        // First sighting counts as a detection for the ghost bonus.
        if (!s.spotted) s.detectionEvents += 1;
      }
      s.spotted = true;
    }

    // --- Guards ----------------------------------------------------------
    let anyChase = false;
    for (const guard of s.guards) {
      const sees = s.invulnerable <= 0
        && canSee(guard.x, guard.y, guard.angle, GUARD.coneRange, GUARD.coneHalfAngle, s.thief.x, s.thief.y, solids);
      const detectRate = GUARD.detectRate * (s.plan.crew.id === 'lookout' ? 0.65 : 1);
      if (sees) {
        guard.detection = Math.min(1, guard.detection + detectRate * dt);
        guard.lostSight = 0;
        if (guard.detection >= 1 && guard.mode !== 'chase') {
          guard.mode = 'chase';
          s.detectionEvents += 1;
          events |= EVENT_SPOTTED;
          s.message = 'Spotted! A guard is chasing you!';
          s.messageTimer = 3;
        }
      } else {
        guard.detection = Math.max(0, guard.detection - GUARD.forgetRate * dt);
        if (guard.mode === 'chase') {
          guard.lostSight += dt;
          if (guard.lostSight > 3) {
            guard.mode = 'patrol';
            guard.lostSight = 0;
          }
        }
      }

      if (guard.mode === 'chase') {
        anyChase = true;
        const dx = s.thief.x - guard.x;
        const dy = s.thief.y - guard.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = GUARD.chaseSpeed;
        moveCircle(guard, (dx / dist) * speed * dt, (dy / dist) * speed * dt, GUARD.radius);
        guard.angle = Math.atan2(dy, dx);
        // Caught!
        if (dist < GUARD.catchRadius && s.invulnerable <= 0) {
          s.lives -= 1;
          s.alarm = Math.min(ALARM.max, s.alarm + ALARM.caughtPenalty);
          events |= EVENT_CAUGHT;
          if (s.lives <= 0) {
            s.phase = 'lost';
            events |= EVENT_LOSE;
          } else {
            s.message = 'Caught! You slipped away, but the alarm jumped.';
            s.messageTimer = 3;
            respawnThief();
          }
        }
      } else {
        const target = guard.route[guard.waypoint];
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          guard.waypoint = (guard.waypoint + 1) % guard.route.length;
        } else {
          moveCircle(guard, (dx / dist) * GUARD.patrolSpeed * dt, (dy / dist) * GUARD.patrolSpeed * dt, GUARD.radius);
          guard.angle = Math.atan2(dy, dx);
        }
      }
    }
    s.spotted = anyChase || cameraSees;

    // --- Alarm decay and lockdown ----------------------------------------
    if (!s.spotted && !s.vault.channeling) {
      s.alarm = Math.max(0, s.alarm - ALARM.decay * dt);
    }
    if (s.alarm >= ALARM.max) {
      for (const guard of s.guards) {
        if (guard.mode !== 'chase') {
          guard.mode = 'chase';
          guard.detection = 1;
        }
      }
      s.spotted = true;
    }

    // --- Getaway ---------------------------------------------------------
    const exit = ROOM.exit;
    const inExit = s.thief.x > exit.x - 10 && s.thief.x < exit.x + exit.w + 10
      && s.thief.y > exit.y - 30 && s.thief.y < FIELD.height;
    if (inExit && s.lootValue > 0) {
      s.phase = 'won';
      const timeBonus = Math.max(0, 5000 - Math.floor(s.elapsed) * 25);
      const ghostBonus = s.detectionEvents === 0 ? 5000 : 0;
      s.score = s.lootValue + timeBonus + ghostBonus;
      s.timeBonus = timeBonus;
      s.ghostBonus = ghostBonus;
      events |= EVENT_WIN;
    }

    return events;
  }

  return {
    get state() { return state; },
    reset,
    step,
    solids,
  };
}
