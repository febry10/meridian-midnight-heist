// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// plan, play, paused and game over.
//
// ?seed=N fixes the patrol and loot pattern. ?shot=cover|play|alarm|escape
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, CREW, ENTRY_POINTS, GADGETS, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_LOSE, EVENT_PICKUP, EVENT_SPOTTED, EVENT_VAULT, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_POINTER, ACTION_USE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAN, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { setAlarmSiren, sfx, unlockAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const plan = {
    entry: ENTRY_POINTS[0],
    gadget: GADGETS[0],
    crew: CREW[0],
  };
  const scene = stageShot(name, world, plan);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, {
      entryIdx: 0, gadgetIdx: 0, crewIdx: 0,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stepSoundTimer = 0;
  let clickCheckTimer = 0;
  let lastClickPos = null;
  let planRects = null;
  const plan = { entryIdx: 0, gadgetIdx: 0, crewIdx: 0 };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each pickup.
  function announce(message) {
    status.textContent = message;
  }

  function planChoice() {
    return {
      entry: ENTRY_POINTS[plan.entryIdx],
      gadget: GADGETS[plan.gadgetIdx],
      crew: CREW[plan.crewIdx],
    };
  }

  function startGame() {
    world.reset(planChoice());
    accumulator = 0;
    screen = SCREEN_PLAY;
    setAlarmSiren(false);
    announce('Heist started. Grab the loot, crack the vault, reach the getaway van.');
  }

  function endGame(won) {
    screen = SCREEN_OVER;
    setAlarmSiren(false);
    if (won) {
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      sfx.win();
      announce(`Clean getaway! Score ${world.state.score}. Best ${best}.`);
    } else {
      sfx.lose();
      announce(`Busted. Loot grabbed $${world.state.lootValue}. Best ${best}.`);
    }
  }

  function handlePlanKeys(event) {
    if (event.code === 'ArrowLeft') plan.entryIdx = (plan.entryIdx + ENTRY_POINTS.length - 1) % ENTRY_POINTS.length;
    else if (event.code === 'ArrowRight') plan.entryIdx = (plan.entryIdx + 1) % ENTRY_POINTS.length;
    else if (event.code === 'ArrowUp') plan.gadgetIdx = (plan.gadgetIdx + GADGETS.length - 1) % GADGETS.length;
    else if (event.code === 'ArrowDown') plan.gadgetIdx = (plan.gadgetIdx + 1) % GADGETS.length;
    else if (event.code === 'KeyC') plan.crewIdx = (plan.crewIdx + 1) % CREW.length;
    else return false;
    sfx.click();
    return true;
  }

  function handlePlanClick(point) {
    if (!planRects) return false;
    const groups = [
      { rects: planRects.entryRects, key: 'entryIdx' },
      { rects: planRects.gadgetRects, key: 'gadgetIdx' },
      { rects: planRects.crewRects, key: 'crewIdx' },
    ];
    for (const group of groups) {
      for (const r of group.rects) {
        if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
          plan[group.key] = r.index;
          sfx.click();
          return true;
        }
      }
    }
    return false;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_POINTER)) {
        unlockAudio();
        screen = SCREEN_PLAN;
        announce('Plan the heist: pick an entry, a gadget and a crew member.');
      }
      return actions;
    }
    if (screen === SCREEN_PLAN) {
      const target = input.clickTarget();
      if (target) {
        handlePlanClick(target);
        input.clearClickTarget();
      }
      // A pointer click only picks an option here; the keyboard starts the job.
      if (actions & ACTION_CONFIRM) {
        unlockAudio();
        startGame();
      }
      return actions;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_POINTER)) {
        screen = SCREEN_PLAN;
        announce('Plan the next heist.');
      }
      return actions;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      setAlarmSiren(false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function moveVector() {
    const keys = input.keysVector();
    if (keys) {
      input.clearClickTarget();
      clickCheckTimer = 0;
      lastClickPos = null;
      return keys;
    }
    const target = input.clickTarget();
    if (!target) return null;
    const t = world.state.thief;
    const dx = target.x - t.x;
    const dy = target.y - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      input.clearClickTarget();
      clickCheckTimer = 0;
      lastClickPos = null;
      return null;
    }
    // Stuck detection: if the thief has barely moved at all over the last
    // second and a half (pressed into a corner the straight line cannot get
    // around), give up on this target. Slow sliding along a wall still
    // counts as moving, so a doorway squeeze is not mistaken for stuck.
    clickCheckTimer += STEP;
    if (clickCheckTimer >= 1.5) {
      if (lastClickPos && Math.hypot(t.x - lastClickPos.x, t.y - lastClickPos.y) < 5) {
        input.clearClickTarget();
        clickCheckTimer = 0;
        lastClickPos = null;
        return null;
      }
      lastClickPos = { x: t.x, y: t.y };
      clickCheckTimer = 0;
    }
    return { x: dx / dist, y: dy / dist };
  }

  function step(actions) {
    const move = moveVector();
    const use = Boolean(actions & ACTION_USE);
    const events = world.step(STEP, move, input.interactHeld(), use);
    if (events & EVENT_PICKUP) {
      sfx.pickup();
      announce(`Loot $${world.state.lootValue}.`);
    }
    if (events & EVENT_SPOTTED) sfx.spotted();
    if (events & EVENT_CAUGHT) sfx.caught();
    if (events & EVENT_VAULT) sfx.vaultOpen();
    if (world.state.vault.channeling && world.state.plan.gadget.id === 'drill') {
      stepSoundTimer -= STEP;
      if (stepSoundTimer <= 0) {
        sfx.drillTick();
        stepSoundTimer = 0.14;
      }
    } else if (move) {
      stepSoundTimer -= STEP;
      if (stepSoundTimer <= 0) {
        sfx.step();
        stepSoundTimer = 0.38;
      }
    }
    setAlarmSiren(world.state.alarm >= 85 && screen === SCREEN_PLAY);
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_LOSE) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const drawn = renderer.draw(world.state, screen, best, plan);
    if (screen === SCREEN_PLAN) planRects = drawn;
  }

  // Plan-screen keys are handled here so the plan selection works even
  // though the world only steps while playing.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_PLAN) handlePlanKeys(event);
  });

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      setAlarmSiren(false);
      announce('Paused.');
    }
  });

  // Test and automation hook: the live game state, screen and plan.
  window.__game = {
    get state() { return world.state; },
    get screen() { return screen; },
    get best() { return best; },
    interactHeld: () => input.interactHeld(),
    plan,
    start: startGame,
  };

  announce('Meridian Midnight. Press Space or click to plan the heist.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
