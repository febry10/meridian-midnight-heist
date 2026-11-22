// Every pixel of the heist: the bank floor, vision cones, guards, cameras,
// loot, HUD (alarm meter, loot, lives, timer, objective) and minimap, plus
// the title, plan, pause and end screens. Pure drawing: it reads state and
// paints it, and never changes the game.

import {
  ALARM, CAMERA, CREW, ENTRY_POINTS, FIELD, GADGETS, GUARD, HUD_HEIGHT,
  LOOT_SPOTS, PALETTE, ROOM, THIEF, VAULT,
} from './config.js';
import { FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAN = 'plan';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const ox = (canvas.width - FIELD.width * scale) / 2;
    const oy = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }

  function rect(r, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  function cone(x, y, angle, range, halfAngle, fill, edge) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawFloor(state) {
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, HUD_HEIGHT, FIELD.width, FIELD.height - HUD_HEIGHT);
    // Checker tiles for a marble-bank feel.
    ctx.fillStyle = PALETTE.floorTile;
    for (let ty = HUD_HEIGHT; ty < FIELD.height; ty += 64) {
      for (let tx = 0; tx < FIELD.width; tx += 64) {
        if (((tx / 64) + (ty / 64)) % 2 === 0) ctx.fillRect(tx, ty, 64, 64);
      }
    }
    // Vault floor.
    const v = ROOM.vault;
    ctx.fillStyle = PALETTE.vaultFloor;
    ctx.fillRect(v.x + 18, v.y + 18, v.w - 18, v.h - 36);
    // Entrance and getaway door mats.
    ctx.fillStyle = PALETTE.entrance;
    ctx.fillRect(ROOM.entrance.x, ROOM.entrance.y - 6, ROOM.entrance.w, 24);
    ctx.fillStyle = PALETTE.exit;
    ctx.fillRect(ROOM.exit.x, ROOM.exit.y - 6, ROOM.exit.w, 24);
  }

  function drawSolids() {
    for (const w of ROOM.walls) {
      rect(w, PALETTE.wall);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(w.x, w.y, w.w, 4);
    }
    for (const c of ROOM.cover) {
      rect(c, PALETTE.cover);
      ctx.fillStyle = PALETTE.coverTop;
      ctx.fillRect(c.x, c.y, c.w, 5);
    }
    // Vault walls, gold-trimmed.
    const v = ROOM.vault;
    ctx.fillStyle = PALETTE.vaultWall;
    ctx.fillRect(v.x, v.y, v.w, 18);
    ctx.fillRect(v.x, v.y, 18, v.h);
    ctx.fillRect(v.x + 18, v.y + v.h - 18, v.doorX - (v.x + 18), 18);
    ctx.fillRect(v.doorX + v.doorW, v.y + v.h - 18, v.x + v.w - (v.doorX + v.doorW), 18);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(v.x, v.y, v.w, 3);
    // Vault door: a heavy slab with a dial, set into the bottom wall.
    const doorX = v.doorX;
    const doorY = v.y + v.h - 18;
    ctx.fillStyle = '#6b5a2e';
    ctx.fillRect(doorX, doorY, v.doorW, 18);
    ctx.fillStyle = '#2c2413';
    ctx.beginPath();
    ctx.arc(doorX + v.doorW / 2, doorY + 9, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('VAULT', v.x + v.w / 2, v.y + 34);
  }

  function drawLoot(state) {
    for (const item of state.loot) {
      if (item.taken) continue;
      if (item.inVault && !state.vault.open) continue;
      if (item.kind === 'gold') {
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.moveTo(item.x - 11, item.y + 7);
        ctx.lineTo(item.x - 7, item.y - 7);
        ctx.lineTo(item.x + 7, item.y - 7);
        ctx.lineTo(item.x + 11, item.y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#8a6d1f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (item.kind === 'cash') {
        ctx.fillStyle = PALETTE.cash;
        ctx.fillRect(item.x - 11, item.y - 7, 22, 14);
        ctx.fillStyle = '#2f6b2c';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 4, 0, TAU);
        ctx.fill();
      } else {
        // The Meridian Diamond: a pulsing gem.
        const pulse = 1 + 0.18 * Math.sin(state.elapsed * 4);
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = PALETTE.diamond;
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(11, 0);
        ctx.lineTo(0, 13);
        ctx.lineTo(-11, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e8fbff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = PALETTE.text;
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('$' + item.value.toLocaleString('en-US'), item.x, item.y - 14);
    }
  }

  function drawCones(state) {
    for (const cam of state.cameras) {
      const disabled = state.empTimer > 0;
      cone(cam.x, cam.y, cam.angle, CAMERA.coneRange, CAMERA.coneHalfAngle,
        disabled ? 'rgba(120,120,120,0.08)' : PALETTE.cameraCone,
        disabled ? 'rgba(120,120,120,0.3)' : PALETTE.cameraConeEdge);
    }
    for (const guard of state.guards) {
      cone(guard.x, guard.y, guard.angle, GUARD.coneRange, GUARD.coneHalfAngle,
        guard.mode === 'chase' ? 'rgba(255, 80, 60, 0.28)' : PALETTE.guardCone,
        guard.mode === 'chase' ? 'rgba(255, 80, 60, 0.7)' : PALETTE.guardConeEdge);
    }
  }

  function drawCameras(state) {
    for (const cam of state.cameras) {
      const disabled = state.empTimer > 0;
      ctx.fillStyle = disabled ? '#666' : PALETTE.camera;
      ctx.beginPath();
      ctx.arc(cam.x, cam.y, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cam.x, cam.y);
      ctx.lineTo(cam.x + Math.cos(cam.angle) * 14, cam.y + Math.sin(cam.angle) * 14);
      ctx.stroke();
      if (disabled) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('OFF', cam.x, cam.y - 14);
      }
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      // Body.
      ctx.fillStyle = guard.mode === 'chase' ? '#ff2e1f' : PALETTE.guard;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7a1f18';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Facing tick.
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(guard.x + Math.cos(guard.angle) * 18, guard.y + Math.sin(guard.angle) * 18);
      ctx.stroke();
      // Detection ring fills as the guard grows sure of you.
      if (guard.detection > 0.02 && guard.mode !== 'chase') {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, GUARD.radius + 6, -Math.PI / 2, -Math.PI / 2 + guard.detection * TAU);
        ctx.stroke();
      }
      if (guard.mode === 'chase') {
        ctx.fillStyle = '#ff2e1f';
        ctx.font = 'bold 15px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('!', guard.x, guard.y - GUARD.radius - 8);
      }
    }
  }

  function drawThief(state) {
    const t = state.thief;
    const blink = state.invulnerable > 0 && Math.floor(state.elapsed * 10) % 2 === 0;
    if (blink) return;
    // Soft shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(t.x + 3, t.y + 5, THIEF.radius, THIEF.radius * 0.6, 0, 0, TAU);
    ctx.fill();
    // Hooded thief in violet.
    ctx.fillStyle = PALETTE.thief;
    ctx.beginPath();
    ctx.arc(t.x, t.y, THIEF.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = PALETTE.thiefRing;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Mask stripe and facing tick.
    ctx.fillStyle = '#2a1745';
    ctx.fillRect(t.x - 8, t.y - 3, 16, 6);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + Math.cos(t.facing) * 16, t.y + Math.sin(t.facing) * 16);
    ctx.stroke();
    // Vault-cracking progress ring.
    if (state.vault.channeling) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, THIEF.radius + 8, -Math.PI / 2, -Math.PI / 2 + state.vault.progress * TAU);
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(state.plan.gadget.id === 'drill' ? 'DRILLING…' : 'PICKING…', t.x, t.y - THIEF.radius - 12);
    }
  }

  function drawLabels() {
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('ENTRANCE', ROOM.entrance.x + 40, ROOM.entrance.y + 34);
    ctx.fillStyle = PALETTE.exit;
    ctx.fillText('GETAWAY VAN', ROOM.exit.x + 40, ROOM.exit.y + 34);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('TELLER DESKS — cover blocks sight', 640, 305);
  }

  function drawMinimap(state) {
    const mw = 150;
    const mh = 84;
    const mx = FIELD.width - mw - 14;
    const my = HUD_HEIGHT + 10;
    const sx = mw / FIELD.width;
    const sy = mh / FIELD.height;
    ctx.fillStyle = 'rgba(10,12,20,0.85)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * sx, my + y * sy, r, 0, TAU);
      ctx.fill();
    };
    for (const item of state.loot) {
      if (!item.taken) dot(item.x, item.y, 2.5, PALETTE.gold);
    }
    for (const guard of state.guards) dot(guard.x, guard.y, 3, PALETTE.guard);
    dot(state.thief.x, state.thief.y, 3.5, PALETTE.thief);
    dot(ROOM.exit.x + 40, ROOM.exit.y, 3, PALETTE.exit);
  }

  function drawHud(state) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, HUD_HEIGHT - 2, FIELD.width, 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('MERIDIAN MIDNIGHT', 16, 28);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('The Grand Vault Heist', 16, 48);

    // Loot.
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('$' + state.lootValue.toLocaleString('en-US'), 300, 30);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('LOOT  •  ' + state.lootCount + '/' + LOOT_SPOTS.length + ' stashes', 300, 50);

    // Alarm meter.
    const ax = 520;
    const aw = 300;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText('ALARM', ax, 20);
    ctx.fillStyle = '#10131d';
    ctx.fillRect(ax, 26, aw, 18);
    const frac = state.alarm / ALARM.max;
    ctx.fillStyle = frac < 0.5 ? PALETTE.ok : frac < 0.85 ? PALETTE.gold : PALETTE.alarm;
    ctx.fillRect(ax, 26, aw * frac, 18);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(ax, 26, aw, 18);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(Math.round(state.alarm) + '%', ax + aw + 10, 41);
    if (state.alarm >= ALARM.max) {
      ctx.fillStyle = PALETTE.alarm;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('LOCKDOWN!', ax, 58);
    } else if (state.spotted) {
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('SPOTTED — break line of sight!', ax, 58);
    }

    // Timer and lives.
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0'), 1000, 30);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('TIME', 1000, 50);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('♥'.repeat(Math.max(0, state.lives)), 1030, 30);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('LIVES', 1030, 50);

    // Objective line.
    let objective = 'Grab the loot, crack the vault, reach the getaway van.';
    if (state.vault.open) objective = 'Vault open! Grab the diamond, then reach the getaway van.';
    else if (state.lootValue > 0) objective = 'Loot secured. Crack the vault — or slip out the getaway door.';
    if (state.alarm >= ALARM.max) objective = 'LOCKDOWN! Run for the getaway van NOW!';
    ctx.fillStyle = state.alarm >= ALARM.max ? PALETTE.alarm : PALETTE.muted;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(objective, FIELD.width / 2, FIELD.height - 12);

    if (state.messageTimer > 0 && state.message) {
      ctx.fillStyle = 'rgba(10,12,20,0.85)';
      const w = ctx.measureText(state.message).width + 28;
      ctx.fillRect((FIELD.width - w) / 2, HUD_HEIGHT + 14, w, 30);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillText(state.message, FIELD.width / 2, HUD_HEIGHT + 35);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(13,15,22,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTitle(best) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // A faint bank silhouette behind the title.
    ctx.fillStyle = '#141828';
    ctx.fillRect(140, 300, 1000, 260);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(640, 170);
    ctx.lineTo(820, 300);
    ctx.lineTo(460, 300);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#141828';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(200 + i * 180, 340, 60, 180);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 64px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('MERIDIAN MIDNIGHT', 640, 130);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '28px ' + FONT;
    ctx.fillText('The Grand Vault Heist', 640, 175);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '16px ' + FONT;
    ctx.fillText('One thief. Four guards. Three cameras. One vault full of gold.', 640, 590);
    ctx.fillText('WASD / arrows to move  •  click to walk  •  E to crack the vault  •  Q for EMP  •  P to pause', 640, 618);
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText('Best score: ' + best.toLocaleString('en-US'), 640, 652);
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('Press SPACE or click to plan the heist', 640, 560);
  }

  function optionRow(y, label, options, selected) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(label, 90, y + 22);
    const bw = 300;
    const bh = 64;
    const gap = 16;
    const total = options.length * bw + (options.length - 1) * gap;
    let x = (FIELD.width - total) / 2;
    const rects = [];
    options.forEach((opt, i) => {
      const isSel = i === selected;
      ctx.fillStyle = isSel ? '#3a2f5e' : PALETTE.panel;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = isSel ? PALETTE.thief : PALETTE.panelEdge;
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 16px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(opt.name, x + bw / 2, y + 24);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '12px ' + FONT;
      // Wrap the blurb onto two lines.
      const words = opt.blurb.split(' ');
      let line = '';
      let ly = y + 44;
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 34) {
          ctx.fillText(line.trim(), x + bw / 2, ly);
          line = word;
          ly += 14;
        } else {
          line += ' ' + word;
        }
      }
      ctx.fillText(line.trim(), x + bw / 2, ly);
      rects.push({ x, y, w: bw, h: bh, index: i });
      x += bw + gap;
    });
    return rects;
  }

  function drawPlan(plan) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 44px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('PLAN THE HEIST', 640, 90);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '16px ' + FONT;
    ctx.fillText('Pick your way in, your gadget and your crew — then hit the vault.', 640, 122);
    const entryRects = optionRow(160, '1 · ENTRY', ENTRY_POINTS, plan.entryIdx);
    const gadgetRects = optionRow(280, '2 · GADGET', GADGETS, plan.gadgetIdx);
    const crewRects = optionRow(400, '3 · CREW', CREW, plan.crewIdx);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillText('← → entry   •   ↑ ↓ gadget   •   C crew   •   ENTER to start', 640, 540);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '14px ' + FONT;
    ctx.fillText('or click an option, then press ENTER', 640, 568);
    return { entryRects, gadgetRects, crewRects };
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 48px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', 640, 340);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '18px ' + FONT;
    ctx.fillText('Press P or SPACE to keep stealing', 640, 384);
  }

  function drawOver(state, best) {
    const won = state.phase === 'won';
    ctx.fillStyle = won ? 'rgba(10,26,16,0.82)' : 'rgba(26,10,10,0.82)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = won ? PALETTE.ok : PALETTE.danger;
    ctx.font = 'bold 56px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(won ? 'CLEAN GETAWAY!' : 'BUSTED!', 640, 220);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px ' + FONT;
    ctx.fillText(won
      ? 'The van screeches away into the night. The Meridian job is done.'
      : 'The Meridian job ends in handcuffs. Plan better, move quieter.', 640, 268);
    const ghost = state.detectionEvents === 0;
    const lines = won ? [
      ['Loot', '$' + state.lootValue.toLocaleString('en-US')],
      ['Time bonus', '$' + (state.timeBonus || 0).toLocaleString('en-US')],
      ['Ghost bonus' + (ghost ? ' (never spotted!)' : ' (spotted)'), '$' + (state.ghostBonus || 0).toLocaleString('en-US')],
      ['SCORE', '$' + state.score.toLocaleString('en-US')],
    ] : [
      ['Loot grabbed', '$' + state.lootValue.toLocaleString('en-US')],
      ['Best score', '$' + best.toLocaleString('en-US')],
    ];
    let y = 330;
    for (const [label, value] of lines) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '18px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(label, 600, y);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 18px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(value, 680, y);
      y += 34;
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('Press SPACE to run it back', 640, y + 30);
  }

  function draw(state, screen, best, plan) {
    fit();
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(best);
      return null;
    }
    if (screen === SCREEN_PLAN) {
      return drawPlan(plan);
    }
    drawFloor(state);
    drawCones(state);
    drawSolids();
    drawLoot(state);
    drawCameras(state);
    drawGuards(state);
    drawThief(state);
    drawLabels();
    drawMinimap(state);
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(state, best);
    return null;
  }

  return { draw };
}
