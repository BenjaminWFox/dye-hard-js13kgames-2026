// Director's Cut: pipes, plaza portal, and the opening cutscene live in
// src/directors-cut/. Production portals are the 500px ROYGBIV ring.
import { resetCombat } from './combat';
import { enemies, enemyHitbox, resetEnemies, spawnPortalElite, unlockNextTier } from './enemies';
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
import { playPowerup } from './music';
import { RAINBOW_COLORS, unlockedColors } from './palette';
import { consumeLevelUp, pickups, resetPickups, scrap, spendScrap, updatePickups } from './pickups';
import { player, resetPlayer, tryRevive } from './player';
import { allPortalsGone, resetPortals, takeSlainPortal } from './portals';
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
  SHOP_ROWS,
  STAT_CON,
  shopLine,
  shopPrice,
  shopRanks,
} from './stats';
import {
  closeUi,
  drawUi,
  hideMenuButtons,
  isUiOpen,
  openCards,
  openMenu,
  rebakeRainbowTitle,
  setTitleStory,
  updateUi,
} from './ui';

export const SCENE_TITLE = 0;
export const SCENE_RUN = 1;

export let scene = SCENE_TITLE;

/** Elapsed run time (ms). Pauses with overlays. */
export let runTime = 0;

const TITLE_LETTERS = 7;
const TITLE_DRAIN_MS = 750;
const TITLE_STORY =
  'CORPORATIONS IS STEALING COLORS OF THE CRYSTAL DIMENSION!\n~\nFIND THEIR PORTALS AND DESTROY THEM!';

let pauseOpen = false;
let hand: DraftCard[] = [];
let titleDraining = false;
let titleGrey = 0;
let titleDrainT = 0;

/** Director's Cut cutscene still reads these. Unused this pass. */
export const WAVE_SPEED = 0.38;
export const colorWave = { active: false, x: 0, y: 0, r: 0 };

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

export function enqueueOverlay(open: () => void): void {
  overlayQueue.push(open);
}

function isReveal(): boolean {
  return revealColor >= 0;
}

export function isWorldFrozen(): boolean {
  return scene !== SCENE_RUN || isUiOpen() || titleDraining || isReveal() || massacring;
}

function openTitle(): void {
  pauseOpen = false;
  titleDraining = false;
  scene = SCENE_TITLE;
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = true;
  }
  bakeTiles();
  rebakeAllSprites();
  openMenu(
    'DYE HARD',
    ['START', 'UPGRADES'],
    (index) => {
      if (index === 0) {
        startTitleDrain();
      } else {
        openShop(true);
      }
    },
    3,
    true
  );
}

function startTitleDrain(): void {
  hideMenuButtons();
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

function openEnd(title: string): void {
  saveGame();
  openMenu(title, ['CONTINUE'], () => openShop(false));
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
    'SCRAP ' + formatScrap(scrap),
    startSelected
  );
}

function openPause(): void {
  pauseOpen = true;
  openMenu('PAUSED', ['RESUME', 'QUIT TO MENU'], (index) => {
    closeUi();
    pauseOpen = false;
    if (index === 1) {
      quitToTitle();
    }
  });
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
    if (card.id === STAT_CON) {
      player.maxHp += CON_HP_PER_RANK;
      player.hp += CON_HP_PER_RANK;
    }
    closeUi();
  });
}

function openUnlock(color: number): void {
  unlockedColors[color] = true;
  rebakeAllSprites();
  bakeTiles();
  const hex = '#' + RAINBOW_COLORS[color].toString(16).padStart(6, '0');
  openCards(
    COLOR_NAMES[color],
    [{ title: POWER_TITLE[color], body: POWER_UNLOCK_BODY[color] }],
    () => {
      closeUi();
    },
    hex
  );
}

function beginReveal(color: number, viewWidth: number, viewHeight: number): void {
  revealColor = color;
  revealT = 0;
  revealW = viewWidth;
  revealH = viewHeight;
  nextBurst = 0;
  const sq = colorSquareCenter(color, viewWidth);
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
  if (allPortalsGone()) {
    enqueueOverlay(startMassacre);
  }
}

function startMassacre(): void {
  massacring = true;
  massacreT = 0;
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
  resetRunStats();
  resetPlayer();
  resetEnemies();
  resetPickups();
  resetExplosions();
  resetCombat();
  resetPortals();
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = false;
  }
  rebakeAllSprites();
  bakeTiles();
}

export function updateOverlays(viewWidth: number, viewHeight: number, dt: number): void {
  updateHudShower(dt);
  if (scene === SCENE_RUN) {
    resolveSlainPortals(viewWidth, viewHeight);
    tickReveal(dt);
    tickMassacre(dt);
  }
  if (titleDraining) {
    if (mouse.clicked || wasPressed('Enter') || wasPressed('NumpadEnter')) {
      titleDraining = false;
      mouse.clicked = false;
      beginRun();
    } else {
      titleDrainT += dt;
      while (titleDrainT >= TITLE_DRAIN_MS && titleGrey < TITLE_LETTERS) {
        titleDrainT -= TITLE_DRAIN_MS;
        lockNextTitleColor();
      }
      if (titleGrey >= TITLE_LETTERS && titleDrainT >= TITLE_DRAIN_MS) {
        titleDraining = false;
        beginRun();
      }
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
    if (!tryRevive()) {
      openEnd('YOU DIED');
    }
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
