// Headless play-test + screenshot maker for Meridian Midnight.
// Serves game/ on a local port, opens every ?shot= scene at 1280x720,
// collects console errors / page errors / failed or external requests
// (all must be zero), drives a real keyboard play-through (move, loot,
// vault crack, escape, caught, alarm) and writes the 4 screenshots as JPEG.
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/tmp/heist-tools/package.json');
const { chromium } = require('playwright-core');
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8123;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
const failures = [];
const notes = [];

function check(cond, label) {
  notes.push(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures.push(label);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(100);
  }
  check(false, label);
  return false;
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve) => {
  server.stdout.on('data', () => resolve());
  setTimeout(resolve, 3000);
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function newTrackedPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith('data:')) {
      errors.push(`external request: ${url}`);
    }
  });
  return { page, errors };
}

// ---- 1. Screenshot scenes -------------------------------------------------
for (const shot of shots) {
  const { page, errors } = await newTrackedPage();
  await page.goto(`http://127.0.0.1:${PORT}/?seed=1${shot.query.replace('?shot=', '&shot=')}`, { waitUntil: 'load' });
  await waitFor(async () => page.evaluate(() => window.__shotReady === true), 15000, `shot ${shot.name} ready`);
  const state = await page.evaluate(() => {
    const g = window.__game;
    return g ? null : 'no __game in shot mode (expected)';
  });
  await page.screenshot({
    path: `${ROOT}screenshots/${shot.name}`,
    type: 'jpeg',
    quality: 82,
  });
  const size = statSync(`${ROOT}screenshots/${shot.name}`).size;
  check(errors.length === 0, `shot ${shot.name}: zero console/page/network errors (${errors.join(' | ') || 'clean'})`);
  check(size <= 262144, `shot ${shot.name}: ${size} bytes <= 256 KiB`);
  notes.push(`  ${shot.name}: ${size} bytes`);
  await page.close();
}

// ---- 2. Interactive play-through ------------------------------------------
{
  const { page, errors } = await newTrackedPage();
  await page.goto(`http://127.0.0.1:${PORT}/?seed=1`, { waitUntil: 'load' });
  await sleep(500);
  const screen = () => page.evaluate(() => window.__game.screen);
  const st = () => page.evaluate(() => {
    const s = window.__game.state;
    return s ? { phase: s.phase, x: Math.round(s.thief.x), y: Math.round(s.thief.y), loot: s.lootValue, alarm: Math.round(s.alarm), lives: s.lives, vault: s.vault.open, score: s.score } : null;
  });

  check((await screen()) === 'title', 'title screen on load');
  await page.keyboard.press('Space');
  await sleep(300);
  check((await screen()) === 'plan', 'Space -> plan screen');
  // Pick tunnel entry (right twice), drill gadget (down once), muscle crew (C twice).
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC');
  await sleep(200);
  const plan = await page.evaluate(() => ({ ...window.__game.plan }));
  check(plan.entryIdx === 2 && plan.gadgetIdx === 1 && plan.crewIdx === 2, `plan selection keys work (entry ${plan.entryIdx}, gadget ${plan.gadgetIdx}, crew ${plan.crewIdx})`);
  await page.keyboard.press('Enter');
  await sleep(300);
  check((await screen()) === 'play', 'Enter -> play screen');
  const before = await st();
  check(before.lives === 4, 'muscle crew grants 4 lives');
  check(before.x === 1180 && before.y === 640, 'tunnel entry spawn (1180,640)');

  // Move left with a real key hold.
  await page.keyboard.down('KeyA');
  await sleep(700);
  await page.keyboard.up('KeyA');
  const moved = await st();
  check(moved.x < before.x - 50, `WASD movement works (x ${before.x} -> ${moved.x})`);

  // Walk into a cash stash: teleport-free, steer via click-to-move.
  await page.mouse.click(375, 500);
  await waitFor(async () => (await st()).loot >= 2000, 8000, 'click-to-move collects cash stash ($2000)');
  // Wait until the thief actually arrives at the clicked spot before the
  // next step teleports it: a live click target would walk it straight back.
  await waitFor(async () => {
    const s = await st();
    return Math.hypot(s.x - 375, s.y - 500) < 12;
  }, 5000, 'thief arrives at the clicked cash stash');
  const looted = await st();
  check(looted.loot >= 2000, `loot collected: $${looted.loot}`);

  // Crack the vault with the drill: stand at the door, hold E. (Test setup:
  // park the guards on the far side so the drill timing itself is measured,
  // not a patrol catch; the caught-path is tested separately below.)
  await page.evaluate(() => {
    const s = window.__game.state;
    s.thief.x = 1150;
    s.thief.y = 262;
    for (const g of s.guards) { g.x = 250; g.y = 600; g.mode = 'patrol'; g.detection = 0; }
  });
  await page.keyboard.down('KeyE');
  await waitFor(async () => (await st()).vault === true, 8000, 'drill cracks the vault (3.2s * 0.7 muscle)');
  await page.keyboard.up('KeyE');
  const vaulted = await st();
  check(vaulted.vault === true, 'vault open after drilling');
  check(vaulted.alarm > 0, `drilling raised the alarm (${vaulted.alarm}%)`);

  // Grab the diamond, then escape through the getaway door. The vault door
  // is in the vault's bottom wall, so the way out runs straight down.
  await page.mouse.click(1156, 130);
  await waitFor(async () => (await st()).loot >= 17000, 10000, 'diamond collected ($15000)');
  await page.mouse.click(1090, 690);
  await waitFor(async () => (await st()).phase === 'won', 12000, 'reaching the getaway door wins');
  const won = await st();
  check(won.phase === 'won', `win state reached, score $${won.score}`);
  check(won.score >= 17000, `score includes loot + bonuses ($${won.score})`);
  await sleep(400);
  check(errors.length === 0, `play-through: zero console/page/network errors (${errors.join(' | ') || 'clean'})`);
  await page.close();
}

// ---- 3. Caught + alarm paths ----------------------------------------------
{
  const { page, errors } = await newTrackedPage();
  await page.goto(`http://127.0.0.1:${PORT}/?seed=1`, { waitUntil: 'load' });
  await sleep(400);
  await page.keyboard.press('Space');
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(300);
  const st = () => page.evaluate(() => {
    const s = window.__game.state;
    return { phase: s.phase, alarm: Math.round(s.alarm), lives: s.lives, spotted: s.spotted };
  });
  // Stand in a camera cone: alarm must climb.
  await page.evaluate(() => {
    const s = window.__game.state;
    s.thief.x = 640;
    s.thief.y = 250;
  });
  await waitFor(async () => (await st()).alarm > 10, 8000, 'camera cone raises the alarm');
  const alarmed = await st();
  check(alarmed.alarm > 10, `alarm climbed in camera cone (${alarmed.alarm}%)`);
  // Stand in front of a patrolling guard until caught.
  await page.evaluate(() => {
    const s = window.__game.state;
    s.thief.x = 500;
    s.thief.y = 130;
    s.alarm = 0;
  });
  await waitFor(async () => (await st()).lives < 3, 15000, 'guard catches the thief (life lost)');
  const caught = await st();
  check(caught.lives === 2, `caught: lives 3 -> ${caught.lives}, alarm ${caught.alarm}%`);
  // Pause works.
  await page.keyboard.press('KeyP');
  await sleep(200);
  check((await page.evaluate(() => window.__game.screen)) === 'paused', 'P pauses the game');
  await page.keyboard.press('KeyP');
  await sleep(200);
  check((await page.evaluate(() => window.__game.screen)) === 'play', 'P resumes the game');
  check(errors.length === 0, `caught/alarm run: zero console/page/network errors (${errors.join(' | ') || 'clean'})`);
  await page.close();
}

await browser.close();
server.kill();
await sleep(500);

console.log(notes.join('\n'));
console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} FAILURES:\n- ${failures.join('\n- ')}`);
process.exit(failures.length === 0 ? 0 : 1);
