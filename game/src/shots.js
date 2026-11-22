// The screenshot scenes behind ?shot=cover|play|alarm|escape. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (head for the next loot, crack the vault when
// close, run for the getaway door), so the frame is what a short game really
// looks like and the same seed always gives the same frame.

import { CAMERA, GUARD, ROOM, STEP } from './config.js';
import { EVENT_LOSE, EVENT_WIN, lineBlocked } from './world.js';
import { SCREEN_OVER, SCREEN_PLAN, SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;
const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Would the thief be seen standing at (x, y) right now? */
function dangerAt(state, x, y, solids) {
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    if (Math.hypot(dx, dy) > GUARD.coneRange) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), guard.angle)) > GUARD.coneHalfAngle) continue;
    if (!lineBlocked(guard.x, guard.y, x, y, solids)) return true;
  }
  for (const cam of state.cameras) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    if (Math.hypot(dx, dy) > CAMERA.coneRange) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), cam.angle)) > CAMERA.coneHalfAngle) continue;
    if (!lineBlocked(cam.x, cam.y, x, y, solids)) return true;
  }
  return false;
}

/** Where the autopilot wants to go next: loot, then the vault, then the van. */
function nextTarget(state) {
  if (!state.vault.open && state.lootCount >= 2) {
    return { x: ROOM.vault.doorX + ROOM.vault.doorW / 2, y: ROOM.vault.y + ROOM.vault.h + 12, vault: true };
  }
  if (state.vault.open) {
    const diamond = state.loot.find((item) => item.kind === 'diamond' && !item.taken);
    if (diamond) return { x: diamond.x, y: diamond.y, vault: false };
    // Diamond taken: the job is done. A greedy pilot cannot reason its way
    // out of the vault to chase more loot, so head straight for the van.
    return { x: ROOM.exit.x + 40, y: ROOM.exit.y - 10, vault: false };
  }
  let best = null;
  let bestDist = Infinity;
  for (const item of state.loot) {
    if (item.taken) continue;
    if (item.inVault && !state.vault.open) continue;
    const d = Math.hypot(item.x - state.thief.x, item.y - state.thief.y);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  if (best) return { x: best.x, y: best.y, vault: false };
  return { x: ROOM.exit.x + 40, y: ROOM.exit.y - 10, vault: false };
}

/** Would a circle of the thief's radius at (x, y) overlap any solid? */
function pointBlocked(x, y, solids) {
  for (let i = 0; i < solids.length; i += 1) {
    const r = solids[i];
    const cx = Math.max(r.x, Math.min(x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(y, r.y + r.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < 13 * 13) return true;
  }
  return false;
}

/** A sidestep heading held for a short while: without it the autopilot
 *  flip-flops between two headings at an obstacle's corner and never moves. */
let slideHold = null;

/**
 * Pick a heading: the wanted one when the step ahead is free (and, when
 * avoiding, not in a cone); else a sidestep around the obstacle. Probing
 * the step ahead keeps the thief from shoving straight into a desk forever.
 */
function pickHeading(state, base, solids, avoid) {
  if (slideHold && slideHold.steps > 0) {
    slideHold.steps -= 1;
    return slideHold.heading;
  }
  slideHold = null;
  const offsets = [0, Math.PI / 2, -Math.PI / 2, 1.0, -1.0, 2.0, -2.0, Math.PI];
  for (const offset of offsets) {
    const heading = base + offset;
    // Probe just past the thief's own radius: a longer probe jumps clean
    // over an 18 px wall and reports the far side as free.
    const nx = state.thief.x + Math.cos(heading) * 16;
    const ny = state.thief.y + Math.sin(heading) * 16;
    if (pointBlocked(nx, ny, solids)) continue;
    if (avoid && dangerAt(state, nx, ny, solids)) continue;
    if (offset !== 0) slideHold = { heading, steps: 30 };
    return heading;
  }
  return base;
}

/**
 * One autopilot step: head for the next goal; when a guard is chasing, run
 * away from it (or straight to the van when loaded and close); when a guard
 * is already suspicious, sidestep out of its cone instead of walking through
 * it. Brief exposure is fine — detection only fills while the thief is seen,
 * so keeping moving matters more than never being seen.
 */
function autopilot(world, solids) {
  const state = world.state;
  const exit = { x: ROOM.exit.x + 40, y: ROOM.exit.y - 10 };

  // Flee a chasing guard: away from it, biased toward the van once loaded.
  const chaser = state.guards.find((g) => g.mode === 'chase');
  if (chaser) {
    const distExit = Math.hypot(exit.x - state.thief.x, exit.y - state.thief.y);
    if (state.lootValue > 0 && distExit < 280) {
      return moveToward(state, exit.x, exit.y, solids, false);
    }
    let ax = state.thief.x - chaser.x;
    let ay = state.thief.y - chaser.y;
    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    if (state.lootValue > 0) {
      const ex = exit.x - state.thief.x;
      const ey = exit.y - state.thief.y;
      const elen = Math.hypot(ex, ey) || 1;
      ax = (ax + (ex / elen)) / 2;
      ay = (ay + (ey / elen)) / 2;
      const blen = Math.hypot(ax, ay) || 1;
      ax /= blen;
      ay /= blen;
    }
    const heading = pickHeading(state, Math.atan2(ay, ax), solids, false);
    return { move: { x: Math.cos(heading), y: Math.sin(heading) }, interact: false, use: false };
  }

  const target = nextTarget(state);
  const dx = target.x - state.thief.x;
  const dy = target.y - state.thief.y;
  const dist = Math.hypot(dx, dy);
  // Stand close to the door before channelling: the world only cracks the
  // vault within 70 px of the door's centre, so stop well inside that.
  if (target.vault && dist < 25) return { move: null, interact: true, use: false };
  if (dist < 8) return { move: null, interact: false, use: false };
  const suspicious = state.guards.some((g) => g.detection > 0.3);
  return moveToward(state, target.x, target.y, solids, suspicious);
}

/** Steer toward (tx, ty); sidestep only when a suspicious guard would see the next step. */
function moveToward(state, tx, ty, solids, avoid) {
  const dx = tx - state.thief.x;
  const dy = ty - state.thief.y;
  const heading = pickHeading(state, Math.atan2(dy, dx), solids, avoid);
  return { move: { x: Math.cos(heading), y: Math.sin(heading) }, interact: false, use: false };
}

/** Test hook: one autopilot step for a world. */
export const autopilotStep = autopilot;

function runFor(world, seconds, solids) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (!state || state.phase !== 'play') break;
    const pilot = autopilot(world, solids);
    world.step(STEP, pilot.move, pilot.interact, pilot.use);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. `plan` is the staged plan (entry/gadget/crew).
 */
export function stageShot(name, world, plan) {
  const solids = world.solids;
  slideHold = null;
  if (name === 'cover') {
    world.reset(plan);
    return { screen: SCREEN_PLAN, best: 0 };
  }
  if (name === 'alarm') {
    world.reset(plan);
    const state = world.state;
    state.alarm = 96;
    // Step into the first guard's patrol lane so the chase starts for real.
    state.thief.x = 500;
    state.thief.y = 130;
    runFor(world, 4, solids);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'escape') {
    world.reset(plan);
    const limit = Math.round(150 / STEP);
    for (let i = 0; i < limit; i += 1) {
      const state = world.state;
      if (!state || state.phase !== 'play') break;
      const pilot = autopilot(world, solids);
      const events = world.step(STEP, pilot.move, pilot.interact, pilot.use);
      if (events & (EVENT_WIN | EVENT_LOSE)) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  // play: sixteen seconds of real play, then a short pause inside a camera
  // cone so the alarm meter reads visibly high in the frame.
  world.reset(plan);
  runFor(world, 16, solids);
  const state = world.state;
  if (state.phase === 'play' && state.alarm < 18) {
    state.thief.x = 640;
    state.thief.y = 230;
    for (let i = 0; i < Math.round(2.5 / STEP); i += 1) {
      if (world.state.phase !== 'play') break;
      world.step(STEP, null, false, false);
    }
  }
  return { screen: SCREEN_PLAY, best: 0 };
}
