// Director's Cut: pipes, plaza portal, and the opening cutscene live in
// src/directors-cut/. Production portals are the 500px ROYGBIV ring.
import { resetCombat } from './combat';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from './constants';
import { enemies, enemyHitbox, resetEnemies, spawnPortalElite, takeSlainFinal, unlockNextTier } from './enemies';
import {
  resetExplosions,
  spawnExplosion,
  spawnHudShower,
  spawnScreenBurst,
  updateExplosions,
  updateHudShower,
} from './fx';
import { colorSquareCenter, formatScrap, pauseIconContains } from './hud';
import { mouse, wasPressed } from './input';
import { bakeTiles } from './map';
import { playPowerup, soundLabel, toggleSound } from './music';
import { hex, RAINBOW_COLORS, unlockedColors } from './palette';
import { consumeLevelUp, pickups, resetPickups, scrap, spendScrap, updatePickups } from './pickups';
import { player, resetPlayer, tryRevive } from './player';
import { resetPortals, takeSlainPortal } from './portals';
import { loadSave, saveGame } from './save';
import { rebakeAllSprites } from './sprites';
import {
  applyPick,
  COLOR_NAMES,
  CON_HP_PER_RANK,
  type DraftCard,
  dealLevelUpCards,
  POWER_TITLE,
  POWER_UNLOCK_BODY,
  resetRunStats,
  SHOP_LVL_HP,
  SHOP_RANK_CAP,
  SHOP_REVIVE,
  SHOP_ROWS,
  shopLine,
  shopPrice,
  shopRanks,
} from './stats';
import {
  closeUi,
  drawUi,
  isUiOpen,
  openCards,
  openMenu,
  rebakeRainbowTitle,
  setTitleStory,
  updateUi,
} from './ui';

export const SCENE_RUN = 1;

export let scene = 0;

/** Elapsed run time (ms). Pauses with overlays. */
export let runTime = 0;

const TITLE_LETTERS = 7;
const TITLE_DRAIN_MS = 500;
const TITLE_STORY =
  'CORPORATIONS ARE STEALING COLORS OF THE CRYSTAL DIMENSION!\n~\nFIND THEIR PORTALS AND DESTROY THEM!\n~\nWATCH OUT FOR THEIR ARMY OF OFFICE SUPPLIES!';

let pauseOpen = false;
let hand: DraftCard[] = [];
let titleDraining = false;
let titleGrey = 0;
let titleDrainT = 0;

const overlayQueue: (() => void)[] = [];
/** Color waiting on the post-kill shade + shower beat; -1 = none. */
let revealColor = -1;
let revealT = 0;
let revealW = 0;
let revealH = 0;
let nextBurst = 0;
const REVEAL_MS = 1000;
const MASSACRE_MS = 5;
const MASSACRE_END_MS = 400;

let massacreT = 0;
let massacring = false;
/** Finale elite is running to the viewport corner. */
let intro = false;

function isReveal(): boolean {
  return revealColor >= 0;
}

export function isWorldFrozen(): boolean {
  return scene !== SCENE_RUN || isUiOpen() || titleDraining || isReveal() || massacring || intro;
}

function openTitle(): void {
  pauseOpen = false;
  titleDraining = false;
  scene = 0;
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = true;
  }
  bakeTiles();
  rebakeAllSprites();
  showTitleMenu();
}

function showTitleMenu(startSelected = 0): void {
  openMenu(
    'DYE HARD',
    ['START', 'UPGRADES', 'DIFFICULTY: ' + (player.h ? 'INTENSE' : 'CASUAL'), soundLabel()],
    (index) => {
      if (!index) {
        startTitleDrain();
      } else if (index === 1) {
        openShop(true);
      } else {
        index === 2 ? (player.h ^= 1) : toggleSound();
        showTitleMenu(index);
      }
    },
    3,
    true,
    startSelected
  );
}

function startTitleDrain(): void {
  openMenu('DYE HARD', ['CONTINUE'], beginRun, 3, true);
  setTitleStory(TITLE_STORY);
  titleDraining = true;
  titleGrey = 0;
  titleDrainT = 0;
}

function lockNextTitleColor(): void {
  unlockedColors[titleGrey] = false;
  titleGrey++;
  bakeTiles();
  rebakeAllSprites();
  rebakeRainbowTitle();
}

function beginRun(): void {
  titleDraining = false;
  closeUi();
  overlayQueue.length = 0;
  resetRun();
  scene = SCENE_RUN;
}

function quitToTitle(): void {
  closeUi();
  overlayQueue.length = 0;
  saveGame();
  resetRun();
  openTitle();
}

function endRunToShop(): void {
  overlayQueue.length = 0;
  saveGame();
  resetRun();
  openTitle();
  openShop(true);
}

function openEnd(title: string): void {
  saveGame();
  openMenu(title, ['END RUN'], endRunToShop);
}

function openDeath(): void {
  playPowerup();
  if (player.lives > 0) {
    openMenu(
      'YOU DIED',
      ['REVIVE ' + player.lives + '/' + shopRanks[SHOP_REVIVE], 'END RUN'],
      (index) => {
        if (index === 0) {
          tryRevive();
          closeUi();
          return;
        }
        endRunToShop();
      }
    );
    return;
  }
  openEnd('YOU DIED');
}

function openShop(fromTitle: boolean, startSelected = 0): void {
  const items: string[] = [];
  for (let i = 0; i < SHOP_ROWS; i++) {
    items.push(shopLine(i));
  }
  items.push('DONE');
  openMenu(
    'SHOP',
    items,
    (index) => {
      if (index >= SHOP_ROWS) {
        closeUi();
        saveGame();
        if (fromTitle) {
          openTitle();
        } else {
          beginRun();
        }
        return;
      }
      if (shopRanks[index] < SHOP_RANK_CAP && spendScrap(shopPrice(index))) {
        shopRanks[index]++;
        saveGame();
        openShop(fromTitle, index);
      }
    },
    1,
    false,
    startSelected,
    'SCRAP ' + formatScrap(scrap)
  );
}

function openPause(startSelected = 0): void {
  pauseOpen = true;
  openMenu(
    'PAUSED',
    ['RESUME', 'QUIT TO MENU', soundLabel()],
    (index) => {
      if (index === 2) {
        toggleSound();
        openPause(index);
        return;
      }
      closeUi();
      pauseOpen = false;
      if (index === 1) {
        quitToTitle();
      }
    },
    1,
    false,
    startSelected
  );
}

function closePause(): void {
  closeUi();
  pauseOpen = false;
}

function openLevelUp(): void {
  player.hp = Math.min(
    player.maxHp,
    player.hp + CON_HP_PER_RANK * shopRanks[SHOP_LVL_HP]
  );
  hand = dealLevelUpCards();
  if (hand.length === 0) {
    return;
  }
  playPowerup();
  openCards('LEVEL UP', hand, (index) => {
    const card = hand[index];
    applyPick(card);
    closeUi();
  });
}

function openUnlock(color: number): void {
  unlockedColors[color] = true;
  rebakeAllSprites();
  bakeTiles();
  openCards(
    COLOR_NAMES[color],
    [{ title: POWER_TITLE[color], body: POWER_UNLOCK_BODY[color] }],
    closeUi,
    hex(RAINBOW_COLORS[color])
  );
}

function beginReveal(color: number, viewWidth: number, viewHeight: number): void {
  revealColor = color;
  revealT = 0;
  revealW = viewWidth;
  revealH = viewHeight;
  nextBurst = 0;
  const sq = colorSquareCenter(color);
  spawnHudShower(sq.x, sq.y, RAINBOW_COLORS[color]);
  playPowerup();
}

function tickReveal(dt: number): void {
  if (!isReveal()) {
    return;
  }
  revealT += dt;
  const tint = RAINBOW_COLORS[revealColor];
  while (nextBurst <= revealT && nextBurst < REVEAL_MS) {
    spawnScreenBurst(revealW, revealH, tint);
    nextBurst += 50 + Math.random() * 80;
  }
  if (revealT < REVEAL_MS) {
    return;
  }
  const color = revealColor;
  revealColor = -1;
  openUnlock(color);
}

function resolveSlainPortals(viewWidth: number, viewHeight: number): void {
  const slain = takeSlainPortal();
  if (!slain) {
    return;
  }
  unlockNextTier();
  spawnPortalElite(slain.x, slain.y);
  beginReveal(slain.color, viewWidth, viewHeight);
  if (enemies[enemies.length - 1].type > 7) {
    intro = true;
  }
}

function tickIntro(dt: number, viewWidth: number, viewHeight: number): void {
  if (!intro || isUiOpen()) {
    return;
  }
  for (const enemy of enemies) {
    if (enemy.type < 8) {
      continue;
    }
    const tx = player.x + PLAYER_WIDTH / 2 - viewWidth / 2 + 40;
    const ty = player.y + PLAYER_HEIGHT / 2 - viewHeight / 2 + 60;
    const dx = tx - enemy.x;
    const dy = ty - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      if (!isReveal()) {
        intro = false;
        setTitleStory('MY PROFITABLE COLORS!\nI WILL DESTROY YOU!');
        openMenu(null, ['CONTINUE'], closeUi, 1, true);
      }
      return;
    }
    enemy.x += (dx / dist) * 0.1 * dt;
    enemy.y += (dy / dist) * 0.1 * dt;
    enemy.bobTime += dt;
    return;
  }
  intro = false;
}

function startMassacre(): void {
  massacring = true;
  massacreT = 0;
  resetCombat();
}

function tickMassacre(dt: number): void {
  if (!massacring) {
    return;
  }
  updateExplosions(dt);
  updatePickups(dt, true);
  massacreT += dt;
  while (enemies.length && massacreT >= MASSACRE_MS) {
    massacreT -= MASSACRE_MS;
    const i = (Math.random() * enemies.length) | 0;
    const box = enemyHitbox(enemies[i]);
    spawnExplosion(
      box.x + box.w / 2,
      box.y + box.h / 2,
      RAINBOW_COLORS[(Math.random() * 7) | 0]
    );
    enemies.splice(i, 1);
    if (!enemies.length) {
      massacreT = 0;
    }
  }
  if (!enemies.length && !pickups.length && massacreT >= MASSACRE_END_MS) {
    massacring = false;
    openEnd('YOU WIN');
  }
}

function pumpOverlays(): void {
  if (isUiOpen() || isReveal() || massacring || scene !== SCENE_RUN) {
    return;
  }
  const next = overlayQueue.shift();
  if (next) {
    next();
    return;
  }
  if (consumeLevelUp()) {
    openLevelUp();
  }
}

function wantsPause(viewHeight: number): boolean {
  return (
    wasPressed('Escape') ||
    wasPressed('KeyP') ||
    (mouse.clicked && pauseIconContains(mouse.x, mouse.y, viewHeight))
  );
}

export function initOverlays(): void {
  loadSave();
  openTitle();
}

export function resetRun(): void {
  runTime = 0;
  revealColor = -1;
  massacring = false;
  intro = false;
  resetRunStats();
  resetPlayer();
  resetEnemies();
  // DEBUGSTUB: six portals already down. Delete this loop.
  // for (let i = 0; i < 6; i++) {
  //   unlockNextTier();
  // }
  resetPickups();
  resetExplosions();
  resetCombat();
  resetPortals();
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = false;
  }
  // DEBUGSTUB: unlock the six missing colors. Delete this loop.
  // for (let i = 1; i < 7; i++) {
  //   unlockedColors[i] = true;
  // }
  rebakeAllSprites();
  bakeTiles();
}

export function updateOverlays(viewWidth: number, viewHeight: number, dt: number): void {
  updateHudShower(dt);
  if (scene === SCENE_RUN) {
    resolveSlainPortals(viewWidth, viewHeight);
    tickReveal(dt);
    tickIntro(dt, viewWidth, viewHeight);
    tickMassacre(dt);
    if (takeSlainFinal()) {
      overlayQueue.push(startMassacre);
    }
  }
  if (titleDraining) {
    titleDrainT += dt;
    while (titleDrainT >= TITLE_DRAIN_MS && titleGrey < TITLE_LETTERS) {
      titleDrainT -= TITLE_DRAIN_MS;
      lockNextTitleColor();
    }
  }

  if (scene === SCENE_RUN && !isWorldFrozen()) {
    runTime += dt;
  }

  if (scene === SCENE_RUN && wantsPause(viewHeight)) {
    if (pauseOpen) {
      closePause();
      mouse.clicked = false;
    } else if (!isUiOpen() && !isReveal()) {
      openPause();
      mouse.clicked = false;
    }
  }
  if (isUiOpen()) {
    updateUi(viewWidth, viewHeight);
  }
  if (
    scene === SCENE_RUN &&
    !isUiOpen() &&
    !isReveal() &&
    player.hp <= 0 &&
    overlayQueue.length === 0
  ) {
    openDeath();
  }
  pumpOverlays();
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  drawUi(ctx, viewWidth, viewHeight);
}
